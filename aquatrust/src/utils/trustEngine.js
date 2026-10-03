/**
 * AquaTrust validation engine
 * -----------------------------
 * Transparent, rule-based scoring for citizen water observations.
 * No ML — every score maps to explainable evidence checks that judges can audit.
 *
 * Weighted overall score:
 *   Nearby agreement          35%
 *   Measurement plausibility  30%
 *   Historical consistency    20%
 *   Photo quality             15%
 *
 * Unusual ≠ wrong. Historically anomalous readings can still score well
 * when nearby observations strongly agree (possible real environmental event).
 */

export const TRUST_WEIGHTS = {
  nearbyAgreement: 0.35,
  measurementPlausibility: 0.3,
  historicalConsistency: 0.2,
  photoQuality: 0.15,
}

export const TRUST_THRESHOLDS = {
  high: 80,
  medium: 55,
}

/** Nearby search radius in kilometres */
const NEARBY_RADIUS_KM = 2

/** Earth radius for Haversine (km) */
const EARTH_RADIUS_KM = 6371

function clamp(value, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function roundScore(value) {
  return Math.round(clamp(value))
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180
}

/**
 * Great-circle distance between two lat/lng points (km).
 * No external geo library required.
 */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

/**
 * Convert |z-score| into a 0–100 consistency score.
 * |z| ≤ 1 → high consistency; |z| ≥ 4 → near-zero consistency.
 */
function zScoreToConsistency(z) {
  const absZ = Math.abs(z)
  if (!Number.isFinite(absZ)) return 50
  if (absZ <= 1) return 100 - absZ * 8
  if (absZ <= 2) return 92 - (absZ - 1) * 22
  if (absZ <= 3) return 70 - (absZ - 2) * 30
  if (absZ <= 4) return 40 - (absZ - 3) * 25
  return Math.max(0, 15 - (absZ - 4) * 5)
}

/**
 * Safe z-score against a historical baseline.
 * If std is missing/zero, fall back to a relative-difference heuristic.
 */
function safeZScore(value, mean, std) {
  if (!Number.isFinite(value) || !Number.isFinite(mean)) {
    return { z: 0, usable: false }
  }

  if (Number.isFinite(std) && std > 0) {
    return { z: (value - mean) / std, usable: true }
  }

  // Fallback when std is 0 or missing: treat ~10% of |mean| (min 0.2) as soft scale
  const scale = Math.max(Math.abs(mean) * 0.1, 0.2)
  return { z: (value - mean) / scale, usable: true }
}

/**
 * Historical consistency: compare pH / turbidity / temperature to site baseline.
 * Lower scores mean the reading is unusual versus recent history — not necessarily wrong.
 */
export function scoreHistoricalConsistency(observation) {
  const baseline = observation.historicalBaseline || {}
  const metrics = [
    {
      label: 'pH',
      value: observation.ph,
      mean: baseline.phMean,
      std: baseline.phStd,
    },
    {
      label: 'turbidity',
      value: observation.turbidity,
      mean: baseline.turbidityMean,
      std: baseline.turbidityStd,
    },
    {
      label: 'temperature',
      value: observation.temperature,
      mean: baseline.temperatureMean,
      std: baseline.temperatureStd,
    },
  ]

  const scores = []
  const unusualMetrics = []

  metrics.forEach((metric) => {
    const { z, usable } = safeZScore(metric.value, metric.mean, metric.std)
    if (!usable) {
      scores.push(50)
      return
    }

    const score = zScoreToConsistency(z)
    scores.push(score)

    if (Math.abs(z) >= 2.5) {
      unusualMetrics.push({
        label: metric.label,
        z,
        direction: z < 0 ? 'below' : 'above',
      })
    }
  })

  if (scores.length === 0) {
    return { score: 50, unusualMetrics }
  }

  const average = scores.reduce((sum, item) => sum + item, 0) / scores.length
  const worst = Math.min(...scores)

  // Blend average with the worst metric so one extreme outlier
  // (e.g. acidification event) still shows as historically unusual.
  const blended = average * 0.55 + worst * 0.45

  return {
    score: roundScore(blended),
    unusualMetrics,
  }
}

/**
 * Measurement plausibility: physical / domain rules for freshwater citizen readings.
 * Extreme-but-possible values are flagged, not auto-rejected.
 */
export function scoreMeasurementPlausibility(observation) {
  let score = 100
  const flags = []
  let impossible = false

  const { ph, turbidity, temperature } = observation

  // --- pH ---
  if (!Number.isFinite(ph) || ph < 0 || ph > 14) {
    impossible = true
    score = 0
    flags.push('pH is physically impossible (outside 0–14)')
  } else if (ph < 3.5 || ph > 11) {
    score -= 55
    flags.push('pH is extremely far outside typical freshwater values')
  } else if (ph < 5 || ph > 9.5) {
    score -= 20
    flags.push('pH is outside the usual freshwater comfort band')
  }

  // --- Temperature (°C), surface freshwater ---
  if (!Number.isFinite(temperature)) {
    impossible = true
    score = Math.min(score, 0)
    flags.push('Temperature value is missing or invalid')
  } else if (temperature < -2 || temperature > 45) {
    impossible = true
    score = Math.min(score, 5)
    flags.push('Temperature is physically unrealistic for surface freshwater')
  } else if (temperature < 1 || temperature > 32) {
    score -= 25
    flags.push('Temperature is extreme for local surface freshwater')
  }

  // --- Turbidity (NTU) ---
  if (!Number.isFinite(turbidity) || turbidity < 0) {
    impossible = true
    score = Math.min(score, 0)
    flags.push('Turbidity cannot be negative')
  } else if (turbidity > 500) {
    // Extremely high turbidity is allowed but flagged — could be a real event
    score -= 15
    flags.push('Turbidity is extremely high and should be reviewed carefully')
  } else if (turbidity > 150) {
    score -= 8
    flags.push('Turbidity is elevated')
  }

  return {
    score: roundScore(score),
    flags,
    impossible,
  }
}

/**
 * Parameter agreement between two observations (0–100).
 * Tolerances are deliberately generous so real pollution clusters still agree.
 */
function parameterAgreement(a, b) {
  const phDiff = Math.abs(a.ph - b.ph)
  const turbDiff = Math.abs(a.turbidity - b.turbidity)
  const tempDiff = Math.abs(a.temperature - b.temperature)

  // pH: within 0.3 ≈ perfect; 1.5+ ≈ disagreement
  const phScore = clamp(100 - (phDiff / 1.5) * 100)
  // Turbidity: within 5 NTU ≈ perfect; 40+ ≈ disagreement
  const turbScore = clamp(100 - (turbDiff / 40) * 100)
  // Temperature: within 1 °C ≈ perfect; 5+ ≈ disagreement
  const tempScore = clamp(100 - (tempDiff / 5) * 100)

  return (phScore * 0.45 + turbScore * 0.3 + tempScore * 0.25)
}

/**
 * Nearby agreement via Haversine neighbours within ~2 km.
 * No neighbours → neutral 50 (not zero — absence of evidence ≠ disagreement).
 */
export function scoreNearbyAgreement(observation, allObservations) {
  const others = (allObservations || []).filter(
    (item) => item.id !== observation.id
  )

  const nearby = others
    .map((item) => ({
      item,
      distanceKm: haversineKm(
        observation.lat,
        observation.lng,
        item.lat,
        item.lng
      ),
    }))
    .filter(({ distanceKm }) => distanceKm <= NEARBY_RADIUS_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm)

  if (nearby.length === 0) {
    return {
      score: 50,
      neighbourCount: 0,
      averageAgreement: null,
      note: 'Not enough nearby evidence',
    }
  }

  const agreements = nearby.map(({ item }) =>
    parameterAgreement(observation, item)
  )
  const averageAgreement =
    agreements.reduce((sum, value) => sum + value, 0) / agreements.length

  // Slight boost when multiple neighbours agree (crowdsourced corroboration)
  const corroborationBoost = Math.min(nearby.length - 1, 3) * 3
  const score = roundScore(averageAgreement + corroborationBoost)

  return {
    score,
    neighbourCount: nearby.length,
    averageAgreement: roundScore(averageAgreement),
    note: null,
  }
}

/**
 * Photo quality is a demo placeholder (0–100 field on the observation).
 * TODO: replace with real image analysis / OpenCV / model later.
 * Do NOT invent computer-vision scores here.
 */
export function scorePhotoQuality(observation) {
  const raw = observation.photoQuality
  if (!Number.isFinite(raw)) {
    return { score: 50, missing: true }
  }
  return { score: roundScore(raw), missing: false }
}

function buildExplanations({
  historical,
  nearby,
  plausibility,
  photo,
  unusualEventBoost,
}) {
  const reasons = []
  const warnings = []

  // Nearby
  if (nearby.neighbourCount === 0) {
    warnings.push('No nearby observations are available for comparison')
  } else if (nearby.score >= 80) {
    reasons.push(
      `Matches ${nearby.neighbourCount} nearby recent observation${
        nearby.neighbourCount === 1 ? '' : 's'
      }`
    )
  } else if (nearby.score < 45) {
    warnings.push('Reading differs strongly from nearby observations')
  } else {
    warnings.push('Nearby observations only partially agree with this reading')
  }

  // Plausibility
  if (plausibility.impossible) {
    warnings.push(...plausibility.flags)
  } else if (plausibility.score >= 85) {
    reasons.push('Measurement is within physically plausible range')
  } else {
    warnings.push(...plausibility.flags)
  }

  // Historical — unusual is a warning, not an automatic reject
  if (historical.unusualMetrics.length > 0) {
    historical.unusualMetrics.forEach((metric) => {
      warnings.push(
        `${metric.label === 'pH' ? 'pH' : metric.label.charAt(0).toUpperCase() + metric.label.slice(1)} is substantially ${metric.direction} the historical range`
      )
    })
  } else if (historical.score >= 75) {
    reasons.push('Values are consistent with the recent site baseline')
  }

  if (unusualEventBoost) {
    reasons.push(
      'Historically unusual values are strongly supported by nearby reports — possible real environmental event'
    )
  }

  // Photo (placeholder field)
  if (photo.missing) {
    warnings.push('Photo quality score is missing')
  } else if (photo.score >= 70) {
    reasons.push('Photo quality is sufficient for review')
  } else if (photo.score < 45) {
    warnings.push('Photo quality is low')
  } else {
    warnings.push('Photo quality is only moderate')
  }

  return { reasons, warnings }
}

/**
 * Main entry: calculateTrustScore(observation, allObservations)
 */
export function calculateTrustScore(observation, allObservations = []) {
  const historical = scoreHistoricalConsistency(observation)
  const nearby = scoreNearbyAgreement(observation, allObservations)
  const plausibility = scoreMeasurementPlausibility(observation)
  const photo = scorePhotoQuality(observation)

  // Weighted blend (transparent weights — see TRUST_WEIGHTS)
  let overallScore =
    nearby.score * TRUST_WEIGHTS.nearbyAgreement +
    plausibility.score * TRUST_WEIGHTS.measurementPlausibility +
    historical.score * TRUST_WEIGHTS.historicalConsistency +
    photo.score * TRUST_WEIGHTS.photoQuality

  /**
   * Intelligent override: historically unusual BUT strong nearby agreement
   * → treat as possible real event, not bad data.
   * Soften the historical penalty by boosting overall score toward nearby evidence.
   */
  const historicallyUnusual =
    historical.score < 50 || historical.unusualMetrics.length > 0
  const strongNearbySupport = nearby.neighbourCount >= 2 && nearby.score >= 80
  const unusualEventBoost =
    historicallyUnusual && strongNearbySupport && !plausibility.impossible

  if (unusualEventBoost) {
    // Soften historical penalty so unusual-but-supported events are not discarded.
    overallScore = Math.max(
      overallScore,
      nearby.score * 0.55 +
        plausibility.score * 0.3 +
        photo.score * 0.15
    )
    // Keep in the verification band — citizens should confirm before High Trust.
    overallScore = Math.min(
      Math.max(overallScore, TRUST_THRESHOLDS.medium + 5),
      TRUST_THRESHOLDS.high - 1
    )
  }

  // Hard rule: physically impossible → Low Trust regardless of weighted score
  if (plausibility.impossible) {
    overallScore = Math.min(overallScore, 35)
  }

  overallScore = roundScore(overallScore)

  let trustLevel
  let trustLabel
  let includedInTrend

  if (plausibility.impossible || overallScore < TRUST_THRESHOLDS.medium) {
    trustLevel = 'low'
    trustLabel = 'Low Trust'
    includedInTrend = false
  } else if (overallScore >= TRUST_THRESHOLDS.high) {
    trustLevel = 'high'
    trustLabel = 'High Trust'
    includedInTrend = true
  } else {
    trustLevel = 'medium'
    trustLabel = unusualEventBoost
      ? 'Needs Verification — possible event'
      : 'Needs Verification'
    includedInTrend = false
  }

  const { reasons, warnings } = buildExplanations({
    historical,
    nearby,
    plausibility,
    photo,
    unusualEventBoost,
  })

  return {
    overallScore,
    trustLevel,
    trustLabel,
    historicalConsistency: historical.score,
    nearbyAgreement: nearby.score,
    measurementPlausibility: plausibility.score,
    photoQuality: photo.score,
    reasons,
    warnings,
    includedInTrend,
    unusualEventBoost,
    nearbyNeighbourCount: nearby.neighbourCount,
  }
}

/**
 * Enrich a list of raw observations with calculated trust results.
 */
export function enrichObservations(observations) {
  return observations.map((observation) => {
    const trust = calculateTrustScore(observation, observations)
    return {
      ...observation,
      ...trust,
    }
  })
}
