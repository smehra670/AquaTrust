import { getWaterbodyProfile } from '../data/waterbodyProfiles.js'

function confidenceTone(trustLevel) {
  if (trustLevel === 'high') return { short: 'HIGH', emoji: '🟢' }
  if (trustLevel === 'medium') return { short: 'NEEDS CHECK', emoji: '🟠' }
  return { short: 'LOW', emoji: '🔴' }
}

function metricDelta(value, mean, unitLabel) {
  if (!Number.isFinite(value) || !Number.isFinite(mean)) {
    return { arrow: '→', note: 'Stable' }
  }
  const diff = value - mean
  const abs = Math.abs(diff)
  if (abs < 0.15) return { arrow: '→', note: 'Stable' }
  if (diff > 0) {
    return {
      arrow: '↑',
      note: unitLabel === '°C' ? `${abs.toFixed(1)}${unitLabel}` : abs < 1 ? 'Slight' : abs.toFixed(1),
    }
  }
  return {
    arrow: '↓',
    note: unitLabel === '°C' ? `${abs.toFixed(1)}${unitLabel}` : abs < 1 ? 'Slight' : abs.toFixed(1),
  }
}

/**
 * Build the waterbody story panel model from an enriched observation
 * plus demo contextual profile.
 */
export function buildWaterbodyStory(observation, allObservations = []) {
  const profile = getWaterbodyProfile(observation.id)
  const tone = confidenceTone(observation.trustLevel)
  const baseline = observation.historicalBaseline || {}

  const nearbyPeers = allObservations.filter((item) => {
    if (item.id === observation.id) return false
    const dLat = item.lat - observation.lat
    const dLng = item.lng - observation.lng
    // rough ~2km neighbourhood in London degrees
    return dLat * dLat + dLng * dLng < 0.0004
  })

  const agreeing = nearbyPeers.filter(
    (item) =>
      Math.abs(item.ph - observation.ph) < 0.4 &&
      Math.abs(item.temperature - observation.temperature) < 1.5
  ).length

  const excluded = allObservations.filter(
    (item) => item.trustLevel === 'low'
  ).length

  const phDelta = metricDelta(observation.ph, baseline.phMean, '')
  const tempDelta = metricDelta(
    observation.temperature,
    baseline.temperatureMean,
    '°C'
  )
  const turbDelta = metricDelta(
    observation.turbidity,
    baseline.turbidityMean,
    'NTU'
  )

  const trustReasons = []
  if (agreeing > 0) {
    trustReasons.push({
      ok: true,
      text: `${agreeing} nearby observation${agreeing === 1 ? '' : 's'} agree`,
    })
  } else if (observation.nearbyAgreement >= 70) {
    trustReasons.push({
      ok: true,
      text: 'Nearby observations support this reading',
    })
  }

  if (observation.measurementPlausibility >= 80) {
    trustReasons.push({
      ok: true,
      text: 'Measurements physically plausible',
    })
  }

  if (observation.historicalConsistency >= 70) {
    trustReasons.push({
      ok: true,
      text: 'Official / historical baseline supports the trend',
    })
  } else if (observation.unusualEventBoost) {
    trustReasons.push({
      ok: true,
      text: 'Unusual values are corroborated as a possible real event',
    })
  }

  const trustWarnings = []
  if (excluded > 0) {
    trustWarnings.push({
      ok: false,
      text: `${excluded} citizen reading${excluded === 1 ? '' : 's'} excluded`,
    })
  }
  ;(observation.warnings || []).slice(0, 2).forEach((warning) => {
    trustWarnings.push({ ok: false, text: warning })
  })

  if (observation.nearbyNeighbourCount === 0) {
    trustWarnings.push({
      ok: false,
      text: 'Limited nearby observations for this section',
    })
  }

  return {
    title: observation.siteName,
    subtitle: `${profile.areaLabel} · ${profile.waterbodyType}`,
    confidence: {
      score: observation.overallScore,
      label: tone.short,
      emoji: tone.emoji,
      trustLevel: observation.trustLevel,
      trustLabel: observation.trustLabel,
    },
    counts: {
      official: profile.officialCount,
      citizen: profile.citizenCount,
      lastOfficial: profile.lastOfficialSample,
      lastCitizen: profile.lastCitizenReport,
    },
    waterQuality: [
      {
        label: 'pH',
        value: observation.ph.toFixed(1),
        arrow: phDelta.arrow,
        note: phDelta.note,
      },
      {
        label: 'Temperature',
        value: `${observation.temperature.toFixed(1)}°C`,
        arrow: tempDelta.arrow,
        note: tempDelta.note,
      },
      {
        label: 'Turbidity',
        value: `${observation.turbidity} NTU`,
        arrow: turbDelta.arrow,
        note: turbDelta.note,
      },
      {
        label: 'Dissolved oxygen',
        value:
          profile.dissolvedOxygen == null
            ? 'Not available'
            : String(profile.dissolvedOxygen),
        arrow: profile.dissolvedOxygen == null ? '' : '→',
        note: profile.dissolvedOxygen == null ? '' : 'Stable',
        demo: true,
      },
    ],
    change30d: profile.change30d,
    trustReasons,
    trustWarnings,
    surroundings: profile.surroundings,
    actions: profile.actions,
    observation,
  }
}
