/**
 * Transparent "AI auditor" for newly submitted citizen readings.
 * Uses river-specific local baselines from AquaTrust's own data when available.
 */

import { haversineKm } from './trustEngine'

function finite(n) {
  const v = Number(n)
  return Number.isFinite(v) ? v : null
}

function zScore(value, mean, std) {
  if (!Number.isFinite(value) || !Number.isFinite(mean)) return null
  const scale =
    Number.isFinite(std) && std > 0 ? std : Math.max(Math.abs(mean) * 0.1, 0.2)
  return (value - mean) / scale
}

/**
 * @param {object} reading
 * @param {array} peers
 * @param {object|null} imageAssessment
 * @param {object|null} riverContext from buildRiverAuditContext
 */
export function assessCitizenReading(
  reading,
  peers = [],
  imageAssessment = null,
  riverContext = null
) {
  const checks = []
  let score = 50
  const ph = finite(reading.ph)
  const turbidity = finite(reading.turbidity)
  const temperature = finite(reading.temperature)

  // Prefer river-local baseline from system data, else reading baseline
  const baseline =
    riverContext?.localBaseline || reading.historicalBaseline || {}

  if (riverContext?.riverName) {
    const km =
      riverContext.riverDistanceKm != null
        ? ` · ${riverContext.riverDistanceKm.toFixed(1)} km from marker`
        : ''
    checks.push({
      id: 'river-match',
      status: riverContext.riverDistanceKm != null && riverContext.riverDistanceKm > 20
        ? 'warn'
        : 'pass',
      title: 'River match',
      detail: `Linked to ${riverContext.riverName}${km} using AquaTrust river + citizen records.`,
    })
    if (riverContext.riverDistanceKm != null && riverContext.riverDistanceKm <= 12) {
      score += 8
    } else if (riverContext.riverDistanceKm != null && riverContext.riverDistanceKm > 20) {
      score -= 6
    } else {
      score += 4
    }
  } else {
    checks.push({
      id: 'river-match',
      status: 'info',
      title: 'River match',
      detail:
        'No named major river matched nearby — using regional freshwater defaults.',
    })
  }

  // Hard physics
  if (ph == null || ph < 0 || ph > 14) {
    checks.push({
      id: 'ph-range',
      status: 'fail',
      title: 'pH range',
      detail: 'pH must be between 0 and 14.',
    })
    score -= 40
  } else if (ph < 2 || ph > 12) {
    checks.push({
      id: 'ph-extreme',
      status: 'fail',
      title: 'pH extreme',
      detail: `pH ${ph.toFixed(1)} is physically extreme for open freshwater.`,
    })
    score -= 35
  } else if (ph < 4 || ph > 10) {
    checks.push({
      id: 'ph-unusual',
      status: 'warn',
      title: 'pH unusual',
      detail: `pH ${ph.toFixed(1)} is unusual — needs independent verification.`,
    })
    score -= 12
  } else {
    checks.push({
      id: 'ph-range',
      status: 'pass',
      title: 'pH range',
      detail: `pH ${ph.toFixed(1)} is within a realistic freshwater band.`,
    })
    score += 12
  }

  if (temperature != null) {
    if (temperature < -2 || temperature > 40) {
      checks.push({
        id: 'temp-range',
        status: 'fail',
        title: 'Temperature',
        detail: `${temperature.toFixed(1)}°C is outside expected river conditions.`,
      })
      score -= 25
    } else {
      checks.push({
        id: 'temp-range',
        status: 'pass',
        title: 'Temperature',
        detail: `${temperature.toFixed(1)}°C looks physically plausible.`,
      })
      score += 8
    }
  }

  if (turbidity != null) {
    if (turbidity < 0 || turbidity > 4000) {
      checks.push({
        id: 'turb-range',
        status: 'fail',
        title: 'Turbidity',
        detail: 'Turbidity is outside a realistic reporting range.',
      })
      score -= 20
    } else {
      checks.push({
        id: 'turb-range',
        status: 'pass',
        title: 'Turbidity',
        detail: `${turbidity} NTU is within a reportable range.`,
      })
      score += 6
    }
  }

  // River-specific historical / local fit
  const phZ = zScore(ph, baseline.phMean, baseline.phStd)
  if (phZ != null) {
    const abs = Math.abs(phZ)
    const sourceLabel = riverContext?.localBaseline
      ? `local ${riverContext.riverName || 'river'} citizen average`
      : 'historical baseline'
    if (abs <= 1.2) {
      checks.push({
        id: 'ph-baseline',
        status: 'pass',
        title: 'River-specific fit',
        detail: `Close to ${sourceLabel} pH ${Number(baseline.phMean).toFixed(1)} (n=${baseline.peerCount || riverContext?.peerCount || '—'}).`,
      })
      score += 16
    } else if (abs <= 2.5) {
      checks.push({
        id: 'ph-baseline',
        status: 'warn',
        title: 'River-specific fit',
        detail: `Differs from ${sourceLabel} pH ${Number(baseline.phMean).toFixed(1)} — unusual for this watercourse.`,
      })
      score -= 6
    } else {
      checks.push({
        id: 'ph-baseline',
        status: 'fail',
        title: 'River-specific fit',
        detail: `Strongly conflicts with ${sourceLabel} pH ${Number(baseline.phMean).toFixed(1)}. Likely inaccurate for this river.`,
      })
      score -= 14
    }
  }

  const tempZ = zScore(
    temperature,
    baseline.temperatureMean,
    baseline.temperatureStd
  )
  if (tempZ != null) {
    const abs = Math.abs(tempZ)
    if (abs <= 1.5) {
      checks.push({
        id: 'temp-baseline',
        status: 'pass',
        title: 'Local temperature fit',
        detail: `Temperature aligns with local river readings (~${Number(baseline.temperatureMean).toFixed(1)}°C).`,
      })
      score += 8
    } else if (abs <= 3) {
      checks.push({
        id: 'temp-baseline',
        status: 'warn',
        title: 'Local temperature fit',
        detail: `Temperature differs from local river average (~${Number(baseline.temperatureMean).toFixed(1)}°C).`,
      })
      score -= 3
    } else {
      checks.push({
        id: 'temp-baseline',
        status: 'warn',
        title: 'Local temperature fit',
        detail: `Temperature strongly differs from local river average (~${Number(baseline.temperatureMean).toFixed(1)}°C).`,
      })
      score -= 8
    }
  }

  // Nearby peer agreement (same river cluster)
  const nearby =
    riverContext?.peers?.length
      ? riverContext.peers.filter((item) => item.id !== reading.id)
      : (peers || []).filter((item) => {
          if (item.id === reading.id) return false
          if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return false
          return haversineKm(reading.lat, reading.lng, item.lat, item.lng) <= 3
        })

  if (nearby.length >= 2 && ph != null) {
    const peerPh = nearby.map((p) => finite(p.ph)).filter((v) => v != null)
    const meanPh = peerPh.reduce((a, b) => a + b, 0) / peerPh.length
    const diff = Math.abs(ph - meanPh)
    if (diff <= 0.35) {
      checks.push({
        id: 'peer-agree',
        status: 'pass',
        title: 'Same-river agreement',
        detail: `Agrees with ${nearby.length} readings on this watercourse (avg pH ${meanPh.toFixed(1)}).`,
      })
      score += 16
    } else if (diff <= 0.9) {
      checks.push({
        id: 'peer-agree',
        status: 'warn',
        title: 'Same-river agreement',
        detail: `Somewhat different from same-river citizen pH (~${meanPh.toFixed(1)}).`,
      })
      score += 2
    } else {
      checks.push({
        id: 'peer-agree',
        status: 'warn',
        title: 'Same-river agreement',
        detail: `Conflicts with same-river citizen pH (~${meanPh.toFixed(1)}).`,
      })
      score -= 10
    }
  } else {
    checks.push({
      id: 'peer-agree',
      status: 'info',
      title: 'Same-river agreement',
      detail: 'Not enough same-river citizen readings yet for peer comparison.',
    })
  }

  // Evidence photo + river scene
  if (imageAssessment) {
    const imgScore = finite(imageAssessment.score) ?? 50
    ;(imageAssessment.checks || []).forEach((check) => {
      checks.push({
        ...check,
        id: `img-${check.id}`,
        title: `Photo · ${check.title}`,
      })
    })
    const riverOk = imageAssessment.riverDetection?.looksLikeRiver
    if (imageAssessment.ok === false || !riverOk) {
      score -= 28
    } else if (imgScore < 70) {
      score -= 6
    } else {
      score += 14
    }
  } else {
    checks.push({
      id: 'photo-missing',
      status: 'fail',
      title: 'Evidence photo',
      detail: 'A verified river photo is required for official filing.',
    })
    score -= 20
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  const failed = checks.some((c) => c.status === 'fail')
  const warned = checks.some((c) => c.status === 'warn')

  let verdict = 'right'
  let label = 'Looks right'
  let summary =
    'AquaTrust AI auditor: values and river photo are consistent with this watercourse’s existing AquaTrust data.'

  if (failed || score < 35) {
    verdict = 'wrong'
    label = 'Likely inaccurate'
    summary =
      'AquaTrust AI auditor: this filing fails river-specific checks (values and/or river photo). Do not treat as trusted until corrected.'
  } else if (warned || score < 60) {
    verdict = 'review'
    label = 'Needs review'
    summary =
      'AquaTrust AI auditor: possible for this river, but unusual or photo-weak. VerifyMe confirmation is recommended.'
  }

  return {
    verdict,
    label,
    confidence: score,
    summary,
    checks,
    imageAssessment: imageAssessment || null,
    riverContext: riverContext
      ? {
          riverName: riverContext.riverName,
          riverDistanceKm: riverContext.riverDistanceKm,
          peerCount: riverContext.peerCount,
        }
      : null,
    assessedAt: new Date().toISOString(),
  }
}
