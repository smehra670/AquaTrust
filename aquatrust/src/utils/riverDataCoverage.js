/**
 * Score watercourse official-data coverage from real EA sampling points only.
 * Never invents measurements — levels reflect station presence / proximity / name match.
 */

import {
  isDirectMonitoring,
  scoreStationRelation,
} from './watercourses'

export const DATA_LEVELS = {
  high: {
    id: 'high',
    label: 'Strong official data',
    short: 'Green',
    color: '#2f8f5b',
    description:
      'Nearby Environment Agency monitoring with a strong link to this watercourse.',
  },
  medium: {
    id: 'medium',
    label: 'Limited official data',
    short: 'Yellow',
    color: '#d4a017',
    description:
      'Some EA monitoring nearby, but coverage is thin or only loosely linked.',
  },
  low: {
    id: 'low',
    label: 'Little / no official data',
    short: 'Red',
    color: '#c24b3d',
    description:
      'No Environment Agency sampling points found near this watercourse.',
  },
  pending: {
    id: 'pending',
    label: 'Checking official data…',
    short: '…',
    color: '#7a8b92',
    description: 'Looking up nearby EA monitoring sites.',
  },
}

/**
 * @param {object} watercourse
 * @param {Array} stations - from findNearbySamplingPoints (with distanceKm)
 */
export function scoreRiverDataCoverage(watercourse, stations = []) {
  const ranked = (stations || [])
    .map((station) => {
      const relation = scoreStationRelation(station, watercourse)
      return {
        ...station,
        relationScore: relation.score,
        relationReasons: relation.reasons,
        isDirect: isDirectMonitoring(relation.score),
      }
    })
    .sort((a, b) => {
      if (b.relationScore !== a.relationScore) {
        return b.relationScore - a.relationScore
      }
      return (a.distanceKm ?? 99) - (b.distanceKm ?? 99)
    })

  const within8 = ranked.filter(
    (s) => Number.isFinite(s.distanceKm) && s.distanceKm <= 8
  )
  const within5 = within8.filter((s) => s.distanceKm <= 5)
  const within2 = within8.filter((s) => s.distanceKm <= 2)
  const direct = within8.filter((s) => s.isDirect)
  const nearest = within8[0] || null

  const reasons = []
  let level = 'low'
  let score = 10

  if (within8.length === 0) {
    level = 'low'
    score = 12
    reasons.push('No EA sampling points within 8 km of this river point')
  } else {
    reasons.push(
      `${within8.length} EA sampling point${within8.length === 1 ? '' : 's'} within 8 km`
    )
    if (nearest) {
      reasons.push(
        `Nearest site ${nearest.distanceKm < 1 ? `${Math.round(nearest.distanceKm * 1000)} m` : `${nearest.distanceKm.toFixed(1)} km`} away`
      )
    }
    if (direct.length > 0) {
      reasons.push(
        `${direct.length} site${direct.length === 1 ? '' : 's'} name-matched to this watercourse`
      )
    }

    const strongDirect =
      direct.length >= 1 && nearest && nearest.distanceKm <= 5
    const denseNear =
      within2.length >= 2 || within5.length >= 3 || direct.length >= 2

    if (strongDirect || denseNear) {
      level = 'high'
      score = Math.min(
        98,
        70 + direct.length * 8 + within5.length * 4 + within2.length * 5
      )
    } else {
      level = 'medium'
      score = Math.min(
        68,
        40 + within8.length * 6 + (direct.length ? 10 : 0) + (within2.length ? 8 : 0)
      )
      if (!direct.length) {
        reasons.push('Nearby sites are not clearly named for this watercourse')
      }
    }
  }

  const meta = DATA_LEVELS[level]

  return {
    level,
    label: meta.label,
    color: meta.color,
    score: Math.round(score),
    stationCount: within8.length,
    directCount: direct.length,
    nearestKm: nearest?.distanceKm ?? null,
    nearestName: nearest?.name || null,
    reasons,
    stations: within8.slice(0, 5),
  }
}

/**
 * Run async work over items with a fixed concurrency limit.
 */
export async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length)
  let next = 0

  async function run() {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await worker(items[index], index)
    }
  }

  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => run()
  )
  await Promise.all(runners)
  return results
}
