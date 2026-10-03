/**
 * AquaTrust Local Issues engine
 * -----------------------------
 * Rule-based, evidence-first detection of possible environmental issues.
 * Does NOT claim causes. Does NOT use an LLM.
 *
 * Prefer site baseline + nearby trusted observations over universal thresholds.
 */

import { haversineKm } from './trustEngine.js'

const NEARBY_RADIUS_KM = 2

/** Minimum |z| vs site baseline to treat a metric as unusual */
const UNUSUAL_Z = 2.5

/** Soft freshwater DO reference (mg/L) — only used when no site baseline exists */
const DO_STRESS_REFERENCE = 5.0

/** Repeated litter reports threshold (demo narrative counts) */
const LITTER_REPEAT_THRESHOLD = 5

function safeZ(value, mean, std) {
  if (!Number.isFinite(value) || !Number.isFinite(mean)) return null
  if (Number.isFinite(std) && std > 0) return (value - mean) / std
  const scale = Math.max(Math.abs(mean) * 0.1, 0.2)
  return (value - mean) / scale
}

function isUsableCitizen(obs) {
  if (!obs) return false
  if (obs.trustLevel === 'low') return false
  if (!Number.isFinite(obs.ph) || obs.ph < 0 || obs.ph > 14) return false
  return true
}

function isTrustedEnough(obs, verificationResults = {}) {
  if (!isUsableCitizen(obs)) return false
  if (verificationResults[obs.id]?.status === 'confirmed') return true
  if (obs.trustLevel === 'high') return true
  // Medium with nearby corroboration still counts as supporting evidence
  if (obs.trustLevel === 'medium' && obs.nearbyNeighbourCount >= 1) return true
  return obs.trustLevel === 'medium'
}

function nearbyCitizens(focus, all, radiusKm = NEARBY_RADIUS_KM) {
  return (all || []).filter((item) => {
    if (!item || item.id === focus.id) return false
    return (
      haversineKm(focus.lat, focus.lng, item.lat, item.lng) <= radiusKm
    )
  })
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function confidenceFromSupport({
  trustedCount,
  agreeingCount,
  officialSupports,
  singleOnly,
}) {
  if (singleOnly || trustedCount <= 1) return 'LOW'
  if (agreeingCount >= 2 && officialSupports) return 'HIGH'
  if (agreeingCount >= 2 || (trustedCount >= 2 && officialSupports)) {
    return agreeingCount >= 3 ? 'HIGH' : 'MEDIUM'
  }
  if (trustedCount >= 2) return 'MEDIUM'
  return 'LOW'
}

function severityFromZ(absZ) {
  if (absZ >= 4) return 'high'
  if (absZ >= 2.5) return 'moderate'
  return 'low'
}

function citizenSource(obs) {
  return {
    type: 'CITIZEN',
    label: `AquaTrust confidence ${obs.overallScore}%`,
    detail: obs.siteName,
    date: obs.timestamp || 'Recent',
  }
}

function baselineSource(label, valueText) {
  return {
    type: 'BASELINE',
    label,
    detail: valueText,
    date: null,
  }
}

function officialSource(profile) {
  if (!profile) return null
  return {
    type: 'OFFICIAL',
    label: 'Environment Agency (demo narrative)',
    detail: 'Site monitoring context',
    date: profile.lastOfficialSample || null,
  }
}

function detectUnusualPh(focus, peers, profile, verificationResults) {
  const baseline = focus.historicalBaseline || {}
  const z = safeZ(focus.ph, baseline.phMean, baseline.phStd)
  if (z == null) return null

  const absZ = Math.abs(z)
  const delta = Math.abs(focus.ph - baseline.phMean)
  const unusual = absZ >= UNUSUAL_Z || delta >= 0.8
  if (!unusual) return null

  // Physically impossible readings are data quality, not environmental issues
  if (focus.ph < 0 || focus.ph > 14) return null
  if (focus.trustLevel === 'low' && !focus.unusualEventBoost) return null

  const direction = z < 0 ? 'low' : 'high'
  const trustedPeers = peers.filter((p) => isTrustedEnough(p, verificationResults))
  const agreeing = trustedPeers.filter(
    (p) => Math.abs(p.ph - focus.ph) <= 0.4
  )

  // Need defensible evidence: unusual baseline + (nearby agree OR strong event flag)
  if (agreeing.length === 0 && !focus.unusualEventBoost && trustedPeers.length === 0) {
    return null
  }

  const officialSupports =
    Boolean(profile?.change30d?.phNote?.includes('unusual')) ||
    Boolean(focus.unusualEventBoost)

  const confidence = confidenceFromSupport({
    trustedCount: 1 + trustedPeers.length,
    agreeingCount: agreeing.length,
    officialSupports,
    singleOnly: agreeing.length === 0 && !focus.unusualEventBoost,
  })

  const evidence = [
    {
      source: 'CITIZEN',
      text: `Latest reading: pH ${focus.ph.toFixed(1)} (${focus.timestamp})`,
    },
    {
      source: 'BASELINE',
      text: `Recent site baseline ≈ pH ${Number(baseline.phMean).toFixed(1)}`,
    },
  ]

  if (agreeing.length > 0) {
    evidence.push({
      source: 'CITIZEN',
      text: `${agreeing.length} nearby trusted observation${
        agreeing.length === 1 ? '' : 's'
      } also around pH ${median(agreeing.map((p) => p.ph))?.toFixed(1)}`,
    })
  }

  if (officialSupports && profile) {
    evidence.push({
      source: 'OFFICIAL',
      text: `Official/demo context notes unusual pH direction (last sample ${profile.lastOfficialSample})`,
    })
  }

  const title =
    direction === 'low' ? 'Unusual low pH' : 'Unusual high pH'

  const dataGaps = []
  if (agreeing.length < 2) {
    dataGaps.push('Limited nearby trusted pH readings that agree with this value.')
  }
  dataGaps.push('No trusted upstream/downstream pH pair in the last 7 days.')

  return {
    id: `unusual-ph-${focus.id}`,
    issueType: 'unusual_ph',
    title,
    severity: severityFromZ(absZ),
    confidence,
    evidence,
    explanation:
      agreeing.length > 0
        ? `pH is substantially ${direction === 'low' ? 'below' : 'above'} the recent site baseline and is supported by nearby observations.`
        : `pH is substantially ${direction === 'low' ? 'below' : 'above'} the recent site baseline. Further citizen verification is needed.`,
    possibleContributors:
      direction === 'low'
        ? [
            'Could be associated with acidic runoff or industrial discharge',
            'Possible contributing factors include organic decomposition after rainfall',
            'Instrumentation error remains possible until independently verified',
          ]
        : [
            'Could be associated with algal activity or alkaline runoff',
            'Possible contributing factors include construction wash water',
            'Instrumentation error remains possible until independently verified',
          ],
    recommendedChecks: [
      'Repeat the pH measurement near this location',
      'Collect upstream and downstream pH readings',
      'Take a clear water photo at the sample point',
    ],
    suggestedActions: {
      citizens: [
        'Repeat the pH measurement safely from the bank',
        'Take a clear water photo',
        'Record any visible litter, discoloration, or odour from a safe distance',
        'Report obvious pollution through the appropriate authority (e.g. Environment Agency incident line)',
      ],
      authorities: [
        'Compare upstream and downstream readings',
        'Inspect nearby outfalls or runoff points',
        'Increase monitoring frequency while the anomaly persists',
        'Review recent rainfall and flow events',
      ],
    },
    dataGaps,
    verificationMission: {
      metric: 'pH',
      originalValue: focus.ph,
      instruction: 'Take another pH measurement near this location (and ideally upstream/downstream).',
    },
    sources: [
      citizenSource(focus),
      ...agreeing.slice(0, 3).map(citizenSource),
      baselineSource(
        'Site historical baseline',
        `≈ pH ${Number(baseline.phMean).toFixed(1)}`
      ),
      ...(officialSupports ? [officialSource(profile)].filter(Boolean) : []),
    ],
  }
}

function detectElevatedTurbidity(focus, peers, profile, verificationResults) {
  const baseline = focus.historicalBaseline || {}
  const z = safeZ(focus.turbidity, baseline.turbidityMean, baseline.turbidityStd)
  if (z == null || z < 2.0) return null
  if (!isUsableCitizen(focus)) return null

  const trustedPeers = peers.filter((p) => isTrustedEnough(p, verificationResults))
  const elevatedPeers = trustedPeers.filter((p) => {
    const pz = safeZ(
      p.turbidity,
      p.historicalBaseline?.turbidityMean,
      p.historicalBaseline?.turbidityStd
    )
    return (
      (pz != null && pz >= 1.5) ||
      (Math.abs(p.turbidity - focus.turbidity) <= 15 &&
        p.turbidity > (p.historicalBaseline?.turbidityMean || 0) * 1.4)
    )
  })

  const siteMedian = baseline.turbidityMean
  const officialSupports =
    Number(profile?.change30d?.turbidityPct) >= 15 ||
    (profile?.surroundings?.rainfallTrend === '↑' && z >= 2.5)

  // Require clear elevation vs baseline; nearby agreement strengthens confidence
  const confidence = confidenceFromSupport({
    trustedCount: 1 + trustedPeers.length,
    agreeingCount: elevatedPeers.length,
    officialSupports,
    singleOnly: elevatedPeers.length === 0,
  })

  // Single medium/low-quality reading alone → still allow if z is strong, but LOW confidence
  if (z < 2.5 && elevatedPeers.length === 0) return null

  const evidence = [
    {
      source: 'CITIZEN',
      text: `Latest trusted reading: ${focus.turbidity} NTU (${focus.timestamp})`,
    },
    {
      source: 'BASELINE',
      text: `Recent site median ≈ ${Number(siteMedian).toFixed(0)} NTU`,
    },
  ]

  if (elevatedPeers.length > 0) {
    evidence.push({
      source: 'CITIZEN',
      text: `${elevatedPeers.length} nearby observation${
        elevatedPeers.length === 1 ? '' : 's'
      } also elevated`,
    })
  }

  if (officialSupports && profile) {
    evidence.push({
      source: 'OFFICIAL',
      text: `Demo official context shows similar direction (turbidity change ${profile.change30d.turbidityPct}% / rainfall ${profile.surroundings.rainfall7d})`,
    })
  }

  const weatherHint =
    profile?.surroundings?.rainfallTrend === '↑'
      ? 'recent heavy rainfall/runoff'
      : 'recent runoff'

  return {
    id: `elevated-turbidity-${focus.id}`,
    issueType: 'elevated_turbidity',
    title: 'Elevated turbidity',
    severity: severityFromZ(Math.abs(z)),
    confidence,
    evidence,
    explanation:
      elevatedPeers.length > 0
        ? 'Turbidity is substantially above the recent baseline and is supported by nearby observations.'
        : 'Turbidity is substantially above the recent site baseline. Additional readings would strengthen this assessment.',
    possibleContributors: [
      `Could be associated with ${weatherHint}`,
      'Possible contributing factors include disturbed sediment',
      'Possible contributing factors include bank erosion',
      'Construction activity nearby could also contribute',
    ],
    recommendedChecks: [
      'Take another turbidity measurement downstream',
      'Repeat the reading after waiting for surface disturbance to settle',
      'Take a clear water photo',
    ],
    suggestedActions: {
      citizens: [
        'Repeat the turbidity measurement from a safe location',
        'Take a clear water photo',
        'Collect a downstream reading if safely accessible from public paths',
        'Report obvious pollution through the appropriate authority',
      ],
      authorities: [
        'Inspect nearby runoff pathways and outfalls',
        'Compare upstream and downstream turbidity',
        'Investigate erosion or sediment disturbance',
        'Review recent rainfall and flow events',
      ],
    },
    dataGaps: [
      'No trusted downstream turbidity reading in the last 7 days.',
      elevatedPeers.length === 0
        ? 'Limited nearby citizen corroboration for this turbidity spike.'
        : null,
    ].filter(Boolean),
    verificationMission: {
      metric: 'turbidity',
      originalValue: focus.turbidity,
      instruction:
        'Take a turbidity reading + photo at a nearby downstream location.',
    },
    sources: [
      citizenSource(focus),
      ...elevatedPeers.slice(0, 2).map(citizenSource),
      baselineSource(
        'Site historical baseline',
        `≈ ${Number(siteMedian).toFixed(0)} NTU`
      ),
      ...(officialSupports ? [officialSource(profile)].filter(Boolean) : []),
    ],
  }
}

function detectLowDissolvedOxygen(focus, profile) {
  const doValue = profile?.dissolvedOxygen
  if (!Number.isFinite(doValue)) return null
  // Without a site-specific DO baseline, only flag clear stress-level values
  // and keep confidence LOW — never claim pollution.
  if (doValue >= DO_STRESS_REFERENCE) return null

  return {
    id: `low-do-${focus.id}`,
    issueType: 'low_dissolved_oxygen',
    title: 'Low dissolved oxygen',
    severity: doValue < 3 ? 'high' : 'moderate',
    confidence: 'LOW',
    evidence: [
      {
        source: 'OFFICIAL',
        text: `Latest available DO context: ${doValue} mg/L (demo profile)`,
      },
      {
        source: 'REFERENCE',
        text: `Below common freshwater stress reference (${DO_STRESS_REFERENCE} mg/L) — not a site-specific baseline`,
      },
    ],
    explanation:
      'Dissolved oxygen appears below a common freshwater stress reference. There is no site-specific DO baseline in this demo, so confidence stays low.',
    possibleContributors: [
      'Could be associated with warm water reducing oxygen solubility',
      'Possible contributing factors include organic loading',
      'Stagnant flow conditions may also contribute',
    ],
    recommendedChecks: [
      'Seek an official or lab DO measurement if available',
      'Record water temperature at the same time',
      'Note visible algae or organic debris from a safe distance',
    ],
    suggestedActions: {
      citizens: [
        'Record temperature and visible conditions from a safe location',
        'Do not enter the water to investigate',
        'Report fish distress or obvious pollution to the appropriate authority',
      ],
      authorities: [
        'Obtain a calibrated dissolved oxygen measurement',
        'Compare upstream and downstream DO',
        'Review recent organic loading or stagnant reaches',
      ],
    },
    dataGaps: [
      'No site-specific historical DO baseline is available in this prototype.',
      'No recent citizen DO measurement (citizens typically lack DO probes).',
    ],
    verificationMission: {
      metric: 'temperature',
      originalValue: focus.temperature,
      instruction:
        'Record temperature and a clear photo; note any visible algae or debris from a safe distance.',
    },
    sources: [
      {
        type: 'OFFICIAL',
        label: 'Demo waterbody DO context',
        detail: `${doValue} mg/L`,
        date: profile.lastOfficialSample || null,
      },
      {
        type: 'REFERENCE',
        label: 'Common freshwater stress reference',
        detail: `< ${DO_STRESS_REFERENCE} mg/L`,
        date: null,
      },
    ],
  }
}

function detectHighTemperature(focus, peers, profile, verificationResults) {
  const baseline = focus.historicalBaseline || {}
  const z = safeZ(
    focus.temperature,
    baseline.temperatureMean,
    baseline.temperatureStd
  )
  if (z == null || z < UNUSUAL_Z) return null
  if (!isUsableCitizen(focus)) return null

  const trustedPeers = peers.filter((p) => isTrustedEnough(p, verificationResults))
  const agreeing = trustedPeers.filter(
    (p) => Math.abs(p.temperature - focus.temperature) <= 1.2
  )

  const confidence = confidenceFromSupport({
    trustedCount: 1 + trustedPeers.length,
    agreeingCount: agreeing.length,
    officialSupports: Number(profile?.change30d?.temperaturePct) >= 10,
    singleOnly: agreeing.length === 0,
  })

  return {
    id: `high-temp-${focus.id}`,
    issueType: 'high_temperature',
    title: 'Unusually high water temperature',
    severity: severityFromZ(z),
    confidence,
    evidence: [
      {
        source: 'CITIZEN',
        text: `Latest reading: ${focus.temperature.toFixed(1)}°C (${focus.timestamp})`,
      },
      {
        source: 'BASELINE',
        text: `Recent site baseline ≈ ${Number(baseline.temperatureMean).toFixed(1)}°C`,
      },
      ...(agreeing.length
        ? [
            {
              source: 'CITIZEN',
              text: `${agreeing.length} nearby observation${
                agreeing.length === 1 ? '' : 's'
              } similarly warm`,
            },
          ]
        : []),
    ],
    explanation:
      'Water temperature is substantially above the recent site baseline. This may be associated with weather or local heating — further checks are recommended.',
    possibleContributors: [
      'Could be associated with recent warm weather',
      'Possible contributing factors include shallow/slow-moving water',
      'Local thermal inputs cannot be confirmed from this evidence alone',
    ],
    recommendedChecks: [
      'Repeat the temperature reading at the same time of day',
      'Compare with a nearby upstream reading',
    ],
    suggestedActions: {
      citizens: [
        'Repeat the temperature measurement from a safe location',
        'Take a clear photo of conditions',
        'Note time of day and weather',
      ],
      authorities: [
        'Compare upstream and downstream temperatures',
        'Review recent air temperature and flow conditions',
        'Investigate potential thermal inputs if the anomaly persists',
      ],
    },
    dataGaps: [
      agreeing.length === 0
        ? 'No nearby trusted temperature corroboration yet.'
        : null,
    ].filter(Boolean),
    verificationMission: {
      metric: 'temperature',
      originalValue: focus.temperature,
      instruction: 'Take another temperature reading near this location.',
    },
    sources: [
      citizenSource(focus),
      baselineSource(
        'Site historical baseline',
        `≈ ${Number(baseline.temperatureMean).toFixed(1)}°C`
      ),
    ],
  }
}

function detectRepeatedLitter(focus, profile) {
  const count = Number(profile?.surroundings?.litterReports)
  if (!Number.isFinite(count) || count < LITTER_REPEAT_THRESHOLD) return null

  return {
    id: `litter-${focus.id}`,
    issueType: 'repeated_litter',
    title: 'Repeated litter / pollution reports',
    severity: count >= 7 ? 'moderate' : 'low',
    confidence: 'LOW',
    evidence: [
      {
        source: 'CITIZEN',
        text: `${count} recent citizen litter / visible pollution reports in the demo surroundings context`,
      },
      {
        source: 'CITIZEN',
        text: `Last citizen report context: ${profile.lastCitizenReport}`,
      },
    ],
    explanation:
      'Multiple citizen reports mention litter or visible pollution near this waterbody. This is a pattern signal, not proof of a specific pollution source.',
    possibleContributors: [
      'Could be associated with footpath / towpath littering',
      'Possible contributing factors include storm overflow debris after rainfall',
      'Fly-tipping nearby cannot be confirmed from counts alone',
    ],
    recommendedChecks: [
      'Take a clear photo of visible litter from a safe public path',
      'Record approximate extent without entering the water',
    ],
    suggestedActions: {
      citizens: [
        'Photograph visible litter from a safe distance',
        'Do not handle unknown waste or enter the water',
        'Report large dumps or hazardous waste through the appropriate authority',
      ],
      authorities: [
        'Inspect the reach for accumulations after rainfall',
        'Review nearby public access points',
        'Increase visual monitoring frequency if reports continue',
      ],
    },
    dataGaps: [
      'Litter counts are demo narrative totals, not a verified incident database.',
      'No structured photo evidence pack linked to each report in this prototype.',
    ],
    verificationMission: {
      metric: 'photo',
      originalValue: null,
      instruction:
        'Take a clear photo of visible litter/algae from a safe public path and note conditions.',
    },
    sources: [
      {
        type: 'CITIZEN',
        label: 'AquaTrust surroundings context (demo)',
        detail: `${count} litter reports`,
        date: profile.lastCitizenReport || null,
      },
    ],
  }
}

/**
 * Detect evidence-backed local issues for a location.
 *
 * @param {object} params
 * @param {object[]} [params.officialMeasurements] reserved for future EA samples
 * @param {object[]} params.citizenObservations enriched observations (include focus)
 * @param {object} [params.historicalData] optional override; else uses focus.historicalBaseline
 * @param {object} [params.weatherContext] rainfall / surroundings context
 * @param {object} [params.focusObservation] selected observation
 * @param {object} [params.profile] waterbody demo profile
 * @param {object} [params.verificationResults] VerifyMe results by id
 * @returns {object[]}
 */
export function detectIssues({
  officialMeasurements = [],
  citizenObservations = [],
  historicalData = null,
  weatherContext = null,
  focusObservation = null,
  profile = null,
  verificationResults = {},
} = {}) {
  const focus =
    focusObservation ||
    citizenObservations.find((o) => o) ||
    null

  if (!focus) return []

  // Allow callers to inject historical / weather without mutating the obs
  const focusWithContext = {
    ...focus,
    historicalBaseline: historicalData || focus.historicalBaseline,
  }

  const peers = nearbyCitizens(focusWithContext, citizenObservations)
  const ctxProfile = profile
    ? {
        ...profile,
        surroundings: {
          ...(profile.surroundings || {}),
          ...(weatherContext || {}),
        },
      }
    : weatherContext
      ? { surroundings: weatherContext }
      : null

  // officialMeasurements reserved — presence can boost confidence later
  void officialMeasurements

  const issues = [
    detectUnusualPh(focusWithContext, peers, ctxProfile, verificationResults),
    detectElevatedTurbidity(
      focusWithContext,
      peers,
      ctxProfile,
      verificationResults
    ),
    detectLowDissolvedOxygen(focusWithContext, ctxProfile),
    detectHighTemperature(
      focusWithContext,
      peers,
      ctxProfile,
      verificationResults
    ),
    detectRepeatedLitter(focusWithContext, ctxProfile),
  ].filter(Boolean)

  // Prefer stronger evidence first
  const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 }
  return issues.sort(
    (a, b) => (rank[a.confidence] ?? 9) - (rank[b.confidence] ?? 9)
  )
}

/**
 * Convenience wrapper used by the side panel.
 */
export function detectIssuesForObservation(
  observation,
  allObservations,
  profile,
  verificationResults = {}
) {
  if (!observation) return []
  return detectIssues({
    citizenObservations: allObservations,
    focusObservation: observation,
    historicalData: observation.historicalBaseline,
    weatherContext: profile?.surroundings || null,
    profile,
    verificationResults,
  })
}
