/**
 * Multi-metric citizen verification — rule-based, auditable for judges / AI review.
 * Does not invent values; only compares submitted checks to the original reading.
 */

const THRESHOLDS = {
  ph: 0.3,
  turbidityAbs: 5,
  turbidityRel: 0.25,
  temperature: 1.5,
}

function finiteOrNull(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function turbidityAgrees(original, submitted) {
  const absDiff = Math.abs(original - submitted)
  const rel = absDiff / Math.max(Math.abs(original), 1)
  return absDiff <= THRESHOLDS.turbidityAbs || rel <= THRESHOLDS.turbidityRel
}

/**
 * Evaluate an independent verification against an original citizen reading.
 * @param {object} original - { ph, turbidity?, temperature? }
 * @param {object} submitted - { ph, turbidity?, temperature? }
 */
export function evaluateVerification(original, submitted) {
  const originalPh = finiteOrNull(original?.ph)
  const submittedPh = finiteOrNull(submitted?.ph)

  const checks = []
  const agreed = []
  const conflicts = []

  if (!Number.isFinite(originalPh) || !Number.isFinite(submittedPh)) {
    return {
      status: 'conflict',
      submittedPh,
      submittedTurbidity: finiteOrNull(submitted?.turbidity),
      submittedTemperature: finiteOrNull(submitted?.temperature),
      agreedMetrics: [],
      conflictMetrics: ['ph'],
      checks: [
        {
          metric: 'ph',
          status: 'invalid',
          reason: 'pH must be a finite number for both original and verification.',
        },
      ],
      confidence: 0,
      summary: 'Verification rejected: invalid pH values.',
    }
  }

  const phDiff = Math.abs(originalPh - submittedPh)
  const phOk = phDiff <= THRESHOLDS.ph
  checks.push({
    metric: 'ph',
    status: phOk ? 'agree' : 'conflict',
    original: originalPh,
    submitted: submittedPh,
    diff: phDiff,
    threshold: THRESHOLDS.ph,
    reason: phOk
      ? `pH within ±${THRESHOLDS.ph} of original`
      : `pH differs by ${phDiff.toFixed(2)} (threshold ±${THRESHOLDS.ph})`,
  })
  if (phOk) agreed.push('ph')
  else conflicts.push('ph')

  const originalTurb = finiteOrNull(original?.turbidity)
  const submittedTurb = finiteOrNull(submitted?.turbidity)
  if (submittedTurb != null && originalTurb != null) {
    const turbOk = turbidityAgrees(originalTurb, submittedTurb)
    const absDiff = Math.abs(originalTurb - submittedTurb)
    checks.push({
      metric: 'turbidity',
      status: turbOk ? 'agree' : 'conflict',
      original: originalTurb,
      submitted: submittedTurb,
      diff: absDiff,
      threshold: `±${THRESHOLDS.turbidityAbs} NTU or ${(THRESHOLDS.turbidityRel * 100).toFixed(0)}%`,
      reason: turbOk
        ? 'Turbidity agrees with original within tolerance'
        : `Turbidity differs by ${absDiff.toFixed(1)} NTU`,
    })
    if (turbOk) agreed.push('turbidity')
    else conflicts.push('turbidity')
  } else if (submittedTurb != null) {
    checks.push({
      metric: 'turbidity',
      status: 'recorded',
      submitted: submittedTurb,
      reason: 'Turbidity recorded (no original value to compare).',
    })
  }

  const originalTemp = finiteOrNull(original?.temperature)
  const submittedTemp = finiteOrNull(submitted?.temperature)
  if (submittedTemp != null && originalTemp != null) {
    const tempDiff = Math.abs(originalTemp - submittedTemp)
    const tempOk = tempDiff <= THRESHOLDS.temperature
    checks.push({
      metric: 'temperature',
      status: tempOk ? 'agree' : 'conflict',
      original: originalTemp,
      submitted: submittedTemp,
      diff: tempDiff,
      threshold: THRESHOLDS.temperature,
      reason: tempOk
        ? `Temperature within ±${THRESHOLDS.temperature}°C`
        : `Temperature differs by ${tempDiff.toFixed(1)}°C`,
    })
    if (tempOk) agreed.push('temperature')
    else conflicts.push('temperature')
  } else if (submittedTemp != null) {
    checks.push({
      metric: 'temperature',
      status: 'recorded',
      submitted: submittedTemp,
      reason: 'Temperature recorded (no original value to compare).',
    })
  }

  // Primary rule: pH must agree. Optional metrics can veto if they conflict.
  let status
  let confidence
  let summary

  if (!phOk) {
    status = 'conflict'
    confidence = 15
    summary = 'Conflicting pH — more independent checks needed.'
  } else if (conflicts.includes('turbidity') || conflicts.includes('temperature')) {
    status = 'conflict'
    confidence = 40
    summary =
      'pH matched, but another metric conflicted — treat as unresolved.'
  } else {
    status = 'confirmed'
    const bonus = agreed.length > 1 ? 10 : 0
    confidence = Math.min(98, 75 + agreed.length * 8 + bonus)
    summary =
      agreed.length > 1
        ? `Confirmed across ${agreed.length} metrics (${agreed.join(', ')}).`
        : 'Confirmed: independent pH check agrees with original.'
  }

  return {
    status,
    submittedPh,
    submittedTurbidity: submittedTurb,
    submittedTemperature: submittedTemp,
    agreedMetrics: agreed,
    conflictMetrics: conflicts,
    checks,
    confidence,
    summary,
    thresholds: { ...THRESHOLDS },
  }
}

export const VERIFICATION_THRESHOLDS = THRESHOLDS
