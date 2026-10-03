/**
 * OS Open Rivers helpers — form labels and direct-vs-nearest station matching.
 * Geometry itself is loaded from preprocessed public/rivers assets.
 */

export const WATERCOURSE_FORMS = {
  inlandRiver: {
    id: 'inlandRiver',
    label: 'River / stream',
    color: '#1d6b8a',
  },
  tidalRiver: {
    id: 'tidalRiver',
    label: 'Tidal river / stream',
    color: '#0f4c6e',
  },
  canal: {
    id: 'canal',
    label: 'Canal',
    color: '#2f6f5e',
  },
  lake: {
    id: 'lake',
    label: 'Lake',
    color: '#3a7ca5',
  },
}

export function formLabel(form) {
  return WATERCOURSE_FORMS[form]?.label || form || 'Unknown'
}

export function formColor(form) {
  return WATERCOURSE_FORMS[form]?.color || '#1d6b8a'
}

/**
 * Heuristic: does an EA sampling point look like it belongs on this watercourse?
 * Never claims certainty — used only to label DIRECT vs NEAREST.
 */
export function scoreStationRelation(station, watercourse) {
  if (!station || !watercourse) return { score: 0, reasons: [] }

  const reasons = []
  let score = 0
  const stationName = String(station.name || '').toLowerCase()
  const courseName = String(watercourse.name || '').toLowerCase()
  const courseAlt = String(watercourse.nameAlt || watercourse.name_alt || '').toLowerCase()

  if (courseName && stationName.includes(courseName)) {
    score += 50
    reasons.push('Station name includes watercourse name')
  } else if (courseAlt && stationName.includes(courseAlt)) {
    score += 40
    reasons.push('Station name includes alternative watercourse name')
  } else if (courseName) {
    // Token overlap (e.g. "Thames" in both)
    const tokens = courseName
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4 && !['river', 'stream', 'brook', 'canal'].includes(t))
    const hits = tokens.filter((t) => stationName.includes(t))
    if (hits.length > 0) {
      score += 30
      reasons.push(`Shared name token: ${hits[0]}`)
    }
  }

  const dist = Number(station.distanceKm)
  if (Number.isFinite(dist)) {
    if (dist <= 0.15) {
      score += 35
      reasons.push('Within 150 m of selected point')
    } else if (dist <= 0.4) {
      score += 20
      reasons.push('Within 400 m of selected point')
    } else if (dist <= 1) {
      score += 8
      reasons.push('Within 1 km of selected point')
    }
  }

  // Soft type hints
  const type = String(station.type || '').toUpperCase()
  if (watercourse.form === 'canal' && type.includes('CANAL')) {
    score += 10
    reasons.push('Station type mentions canal')
  }
  if (
    (watercourse.form === 'inlandRiver' || watercourse.form === 'tidalRiver') &&
    type.includes('FRESHWATER')
  ) {
    score += 5
  }

  return { score, reasons }
}

/** Strong enough to label as direct monitoring (still not proof of mid-channel sample). */
export function isDirectMonitoring(relationScore) {
  return relationScore >= 55
}

export function formatLengthM(metres) {
  if (!Number.isFinite(metres)) return null
  if (metres >= 1000) return `${(metres / 1000).toFixed(2)} km`
  return `${Math.round(metres)} m`
}
