/**
 * Load real EA series for named rivers. Never invents measurement values.
 * Prefers area observation search (reliable), with per-station fallback.
 */

import {
  DETERMINAND_CODES,
  fetchAreaObservations,
  findNearbySamplingPoints,
  getObservationsForSamplingPoint,
  PRIORITY_DETERMINANDS,
} from '../services/environmentAgency'
import { mapPool } from './riverDataCoverage'
import { isDirectMonitoring, scoreStationRelation } from './watercourses'

export const GRAPH_FACTORS = PRIORITY_DETERMINANDS.map((item) => ({
  key: item.key,
  label: item.label,
  match: item.match,
}))

function isFreshwaterishStation(station) {
  const type = String(station?.type || '').toUpperCase()
  if (!type) return true
  if (
    type.includes('TRADE') ||
    type.includes('SEWAGE') ||
    type.includes('COOLING') ||
    type.includes('EFFLUENT')
  ) {
    return false
  }
  return (
    type.includes('FRESHWATER') ||
    type.includes('RIVER') ||
    type.includes('CANAL') ||
    type.includes('SURFACE') ||
    type.includes('UNCLASSIFIED') ||
    type.includes('POND') ||
    type.includes('LAKE')
  )
}

function stationTypeBonus(station) {
  const type = String(station?.type || '').toUpperCase()
  if (type.includes('RIVER') || type.includes('CANAL')) return 25
  if (type.includes('FRESHWATER')) return 10
  return 0
}

function matchFactor(observations, factor) {
  const rows = (observations || []).filter((obs) =>
    factor.match(String(obs.determinandName || ''))
  )
  return rows.sort((a, b) => a.dateMs - b.dateMs)
}

function latestOf(rows) {
  if (!rows.length) return null
  const last = rows[rows.length - 1]
  return {
    value: last.value,
    date: last.date,
    unit: last.unit || '',
    sampleCount: rows.length,
  }
}

function buildLatest(observations) {
  const latest = {}
  GRAPH_FACTORS.forEach((factor) => {
    latest[factor.key] = latestOf(matchFactor(observations, factor))
  })
  return latest
}

function hitCount(latest) {
  return GRAPH_FACTORS.filter((f) => latest[f.key]).length
}

export function monthlySeries(observations, factor, rangeKey = 'all') {
  const rows = matchFactor(observations, factor)
  const now = Date.now()
  const rangeMs =
    rangeKey === '1y'
      ? 365 * 24 * 60 * 60 * 1000
      : rangeKey === '5y'
        ? 5 * 365 * 24 * 60 * 60 * 1000
        : null
  const filtered = rows.filter((obs) =>
    rangeMs == null ? true : now - obs.dateMs <= rangeMs
  )
  const buckets = new Map()
  filtered.forEach((obs) => {
    const d = new Date(obs.dateMs)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(obs.value)
  })
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, values]) => {
      const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      const median =
        sorted.length === 0
          ? null
          : sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid]
      if (median == null) return null
      const d = new Date(`${month}-01T12:00:00`)
      const label = Number.isNaN(d.getTime())
        ? month
        : d.toLocaleDateString('en-GB', {
            month: 'short',
            year: '2-digit',
          })
      return {
        month,
        label,
        value: Number(median.toFixed(3)),
        samples: sorted.length,
      }
    })
    .filter(Boolean)
}

async function loadViaAreaSearch(river) {
  const observations = await fetchAreaObservations(river.lat, river.lng, {
    radiusKm: 20,
    dateFrom: '2022-01-01',
    maxPagesPerCode: 1,
    maxYearWindows: 4,
    determinandCodes: [
      DETERMINAND_CODES.ph,
      DETERMINAND_CODES.temperature,
      DETERMINAND_CODES.dissolved_oxygen,
      DETERMINAND_CODES.turbidity,
    ],
  })
  if (!observations.length) return null

  const latest = buildLatest(observations)
  if (hitCount(latest) === 0) return null

  // Pick a representative station label from the densest sampling point
  const byPoint = new Map()
  observations.forEach((obs) => {
    const id = obs.samplingPointId || 'area'
    if (!byPoint.has(id)) {
      byPoint.set(id, {
        id,
        name: obs.samplingPointName || id,
        count: 0,
      })
    }
    byPoint.get(id).count += 1
  })
  const top = [...byPoint.values()].sort((a, b) => b.count - a.count)[0]

  return {
    id: river.id,
    name: river.name,
    station: top
      ? {
          id: top.id,
          name: top.name,
          type: 'AREA SEARCH',
          distanceKm: null,
        }
      : null,
    observations,
    latest,
    source: 'area',
  }
}

async function loadViaStations(river) {
  const stations = await findNearbySamplingPoints(river.lat, river.lng, 18)
  const ranked = [...(stations || [])]
    .map((station) => {
      const relation = scoreStationRelation(station, river)
      const fresh = isFreshwaterishStation(station)
      const open = String(station.status || '').toUpperCase() === 'OPEN'
      return {
        ...station,
        relationScore:
          relation.score +
          (fresh ? 15 : -40) +
          stationTypeBonus(station) +
          (open ? 8 : -5),
        fresh,
        isDirect: isDirectMonitoring(relation.score),
      }
    })
    .sort((a, b) => {
      if (a.fresh !== b.fresh) return a.fresh ? -1 : 1
      if (b.relationScore !== a.relationScore) {
        return b.relationScore - a.relationScore
      }
      return (a.distanceKm ?? 99) - (b.distanceKm ?? 99)
    })

  const candidates = [
    ...ranked.filter((s) => s.fresh),
    ...ranked.filter((s) => !s.fresh),
  ].slice(0, 10)

  let best = null
  for (const station of candidates) {
    const observations = await getObservationsForSamplingPoint(station.id, {
      dateFrom: '2015-01-01',
      dateTo: new Date().toISOString().slice(0, 10),
      maxPages: 2,
    })
    if (!observations.length) continue
    const latest = buildLatest(observations)
    const hits = hitCount(latest)
    const row = {
      id: river.id,
      name: river.name,
      station,
      observations,
      latest,
      source: 'station',
      hitCount: hits,
    }
    if (!best || hits > best.hitCount) best = row
    if (hits > 0) break
  }
  return best
}

export async function loadRiverOfficialSeries(rivers = []) {
  return mapPool(rivers, 3, async (river) => {
    if (!Number.isFinite(river.lat) || !Number.isFinite(river.lng)) {
      return {
        id: river.id,
        name: river.name,
        station: null,
        observations: [],
        latest: {},
      }
    }

    try {
      // Area search first — finds real samples near the river quickly
      const area = await loadViaAreaSearch(river)
      if (area && hitCount(area.latest) > 0) return area

      const stationRow = await loadViaStations(river)
      if (stationRow) {
        return {
          id: stationRow.id,
          name: stationRow.name,
          station: stationRow.station,
          observations: stationRow.observations,
          latest: stationRow.latest,
        }
      }

      return {
        id: river.id,
        name: river.name,
        station: null,
        observations: [],
        latest: {},
      }
    } catch (error) {
      console.error('[EA] river graph load failed', river.name, error)
      return {
        id: river.id,
        name: river.name,
        station: null,
        observations: [],
        latest: {},
        error: true,
      }
    }
  })
}

export async function loadSingleRiverOfficialSeries(river) {
  const [row] = await loadRiverOfficialSeries([river])
  return row
}

/** Prefer well-known rivers first so graphs show data quickly. */
export const PRIORITY_GRAPH_RIVERS = [
  'River Thames',
  'River Trent',
  'River Severn',
  'Afon Hafren',
  'River Great Ouse',
  'River Mersey',
  'River Medway',
  'River Lea',
  'River Lee',
  'River Avon',
  'River Nene',
  'River Eden',
  'River Tees',
  'River Wear',
  'River Tyne',
  'River Exe',
  'River Test',
  'River Itchen',
  'River Wye',
  'Afon Gwy',
  'River Derwent',
  'River Aire',
  'River Calder',
  'River Don',
  'River Wharfe',
  'River Ribble',
  'River Cam',
  'River Cherwell',
  'River Kennet',
  'River Wey',
]
