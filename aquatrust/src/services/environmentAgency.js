import { haversineKm } from '../utils/trustEngine.js'

/**
 * Environment Agency Water Quality API helpers.
 * Current Water Quality Explorer endpoints under environment.data.gov.uk.
 *
 * Dev: Vite proxy `/api/ea` → `https://environment.data.gov.uk/water-quality`
 * Never invent measurement values — only parse what the API returns.
 */

const EA_BASE = import.meta.env?.DEV
  ? '/api/ea'
  : 'https://environment.data.gov.uk/water-quality'

const GEO_HEADERS = {
  Accept: 'application/geo+json',
  'API-Version': '1',
}

const CSV_HEADERS = {
  Accept: 'text/csv',
  'CSV-Header': 'present',
  'API-Version': '1',
}

/** Preferred determinands for AquaTrust charts (matched by API prefLabel). */
export const PRIORITY_DETERMINANDS = [
  {
    key: 'ph',
    label: 'pH',
    match: (name) => /^ph$/i.test(String(name).trim()),
  },
  {
    key: 'temperature',
    label: 'Water temperature',
    match: (name) => /temperature of water/i.test(String(name)),
  },
  {
    key: 'dissolved_oxygen',
    label: 'Dissolved oxygen',
    match: (name) => /oxygen,\s*dissolved as o2/i.test(String(name)),
  },
  {
    key: 'turbidity',
    label: 'Turbidity',
    match: (name) => /^turbidity$/i.test(String(name).trim()),
  },
  {
    key: 'conductivity',
    label: 'Conductivity',
    match: (name) => /conductivity at 25/i.test(String(name)),
  },
  {
    key: 'nitrate',
    label: 'Nitrate',
    match: (name) => /^nitrate as n$/i.test(String(name).trim()),
  },
  {
    key: 'ammoniacal_nitrogen',
    label: 'Ammoniacal nitrogen',
    match: (name) => /ammoniacal nitrogen as n/i.test(String(name)),
  },
]

const PAGE_LIMIT = 250
const MAX_OBSERVATION_PAGES = 12 // ≤ 3000 rows per station
const MAX_CHART_POINTS = 180

const samplingPointCache = new Map()
const observationCache = new Map()

function roundCoord(value, digits = 3) {
  return Number(Number(value).toFixed(digits))
}

function samplingCacheKey(lat, lng, radiusKm) {
  return `${roundCoord(lat)}:${roundCoord(lng)}:${radiusKm}`
}

/**
 * Minimal CSV line parser (handles quoted commas).
 */
export function parseCsvLine(line) {
  const out = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      quoted = !quoted
      continue
    }
    if (ch === ',' && !quoted) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}

function parseCsv(text) {
  if (!text || !String(text).trim()) return []
  const lines = String(text)
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
  if (lines.length <= 1) return []

  const header = parseCsvLine(lines[0]).map((h) => h.trim())
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line)
    const row = {}
    header.forEach((key, index) => {
      row[key] = cols[index] ?? ''
    })
    return row
  })
}

/**
 * Parse EA result strings. Values like "<0.1" are treated as the numeric
 * threshold so charts remain usable — still an API-provided figure, not invented.
 * Non-numeric / coded results return null and are dropped.
 */
export function parseResultValue(raw) {
  if (raw == null) return null
  const text = String(raw).trim()
  if (!text) return null
  if (/^[<>]/.test(text)) {
    const n = Number(text.replace(/^[<>]\s*/, ''))
    return Number.isFinite(n) ? n : null
  }
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

function normalizeObservation(row, samplingPointId) {
  const value = parseResultValue(row.result ?? row.Result)
  if (value == null) return null

  const dateRaw = row.phenomenonTime || row.sampleDateTime || ''
  const date = dateRaw ? new Date(dateRaw) : null
  if (!date || Number.isNaN(date.getTime())) return null

  const determinandName = String(
    row['determinand.prefLabel'] || row.determinandName || ''
  ).trim()
  if (!determinandName) return null

  return {
    date: date.toISOString(),
    dateMs: date.getTime(),
    determinandName,
    determinandCode: String(row['determinand.notation'] || '').trim() || null,
    value,
    unit: String(row.unit || '').trim() || null,
    samplingPointId:
      String(
        row['samplingPoint.notation'] || samplingPointId || ''
      ).trim() || null,
    samplingPointName: String(
      row['samplingPoint.prefLabel'] || ''
    ).trim() || null,
  }
}

/**
 * Find Environment Agency sampling points near a lat/lng.
 * Alias: getNearbySamplingPoints
 */
export async function findNearbySamplingPoints(lat, lng, radiusKm = 10) {
  const key = samplingCacheKey(lat, lng, radiusKm)
  if (samplingPointCache.has(key)) {
    return samplingPointCache.get(key)
  }

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    radius: String(radiusKm),
    limit: '100',
  })

  const response = await fetch(
    `${EA_BASE}/data/sampling-point?${params.toString()}`,
    {
      method: 'POST',
      headers: GEO_HEADERS,
    }
  )

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(
      `Environment Agency sampling-point request failed (${response.status})${
        detail ? `: ${detail}` : ''
      }`
    )
  }

  const data = await response.json()
  const members = Array.isArray(data?.member) ? data.member : []

  const points = members
    .map((feature) => {
      const coords = feature?.geometry?.coordinates
      const props = feature?.properties || {}
      if (!Array.isArray(coords) || coords.length < 2) return null

      const pointLng = Number(coords[0])
      const pointLat = Number(coords[1])
      if (!Number.isFinite(pointLat) || !Number.isFinite(pointLng)) return null

      const id =
        props.notation ||
        props.isDistributionOf?.split('/')?.pop() ||
        feature.id ||
        null
      if (!id) return null

      return {
        id: String(id),
        name: props.name || String(id),
        lat: pointLat,
        lng: pointLng,
        type: props.type || null,
        status: props.status || null,
        region: props.region || null,
        area: props.area || null,
        distanceKm: haversineKm(lat, lng, pointLat, pointLng),
        source: 'Environment Agency',
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceKm - b.distanceKm)

  samplingPointCache.set(key, points)
  return points
}

export const getNearbySamplingPoints = findNearbySamplingPoints

/** Common EA determinand notation codes used for area searches. */
export const DETERMINAND_CODES = {
  ph: '0061',
  temperature: '0076',
  dissolved_oxygen: '9924',
  turbidity: '0135',
  conductivity: '0077',
  nitrate: '0117',
  ammoniacal_nitrogen: '0111',
}

/**
 * Fetch real observations near a lat/lng (radius search).
 * Uses the EA /data/observation endpoint — more reliable for graphs than
 * guessing a single sampling-point that may have zero recent samples.
 */
/**
 * Build calendar-year windows (EA area search allows at most one year,
 * and rejects some rolling 365-day spans — calendar years are reliable).
 */
function yearWindows(dateFrom, dateTo, maxWindows = 5) {
  const endYear = Number(String(dateTo).slice(0, 4)) || new Date().getFullYear()
  const startYear =
    Number(String(dateFrom).slice(0, 4)) || endYear - (maxWindows - 1)
  const windows = []
  for (let year = endYear; year >= startYear && windows.length < maxWindows; year -= 1) {
    windows.push({
      dateFrom: `${year}-01-01`,
      dateTo: `${year}-12-31`,
    })
  }
  return windows.length
    ? windows
    : [{ dateFrom: `${endYear}-01-01`, dateTo: `${endYear}-12-31` }]
}

export async function fetchAreaObservations(
  lat,
  lng,
  {
    radiusKm = 15,
    dateFrom = '2019-01-01',
    dateTo = new Date().toISOString().slice(0, 10),
    determinandCodes = [
      DETERMINAND_CODES.ph,
      DETERMINAND_CODES.temperature,
      DETERMINAND_CODES.dissolved_oxygen,
      DETERMINAND_CODES.turbidity,
      DETERMINAND_CODES.conductivity,
    ],
    maxPagesPerCode = 1,
    maxYearWindows = 4,
  } = {}
) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return []

  const cacheKey = `area|${roundCoord(lat)}|${roundCoord(lng)}|${radiusKm}|${dateFrom}|${dateTo}|${determinandCodes.join(',')}|${maxPagesPerCode}|${maxYearWindows}`
  if (observationCache.has(cacheKey)) {
    return observationCache.get(cacheKey)
  }

  const pages = Math.max(1, Math.min(maxPagesPerCode, 3))
  const windows = yearWindows(dateFrom, dateTo, maxYearWindows)
  const all = []

  // Parallelise determinand × year-window fetches (each window ≤ 1 year).
  await Promise.all(
    determinandCodes.flatMap((code) =>
      windows.map(async (window) => {
        for (let page = 0; page < pages; page += 1) {
          const params = new URLSearchParams({
            latitude: String(lat),
            longitude: String(lng),
            radius: String(radiusKm),
            dateFrom: window.dateFrom,
            dateTo: window.dateTo,
            determinand: String(code),
            limit: String(PAGE_LIMIT),
            skip: String(page * PAGE_LIMIT),
          })

          const response = await fetch(
            `${EA_BASE}/data/observation?${params.toString()}`,
            {
              method: 'POST',
              headers: {
                ...CSV_HEADERS,
                'Content-Type': 'application/json',
              },
            }
          )

          if (!response.ok) break
          const text = await response.text()
          if (!text.trim()) break

          const rows = parseCsv(text)
          if (rows.length === 0) break

          rows.forEach((row) => {
            const normalized = normalizeObservation(
              row,
              row['samplingPoint.notation'] || null
            )
            if (normalized) all.push(normalized)
          })

          if (rows.length < PAGE_LIMIT) break
        }
      })
    )
  )

  const seen = new Set()
  const unique = []
  all.forEach((obs) => {
    const key = `${obs.samplingPointId}|${obs.determinandName}|${obs.dateMs}|${obs.value}`
    if (seen.has(key)) return
    seen.add(key)
    unique.push(obs)
  })
  unique.sort((a, b) => a.dateMs - b.dateMs)
  observationCache.set(cacheKey, unique)
  return unique
}

/**
 * Fetch real historical observations for one sampling point (paginated CSV).
 * Results are cached in memory by sampling point id + date window.
 */
export async function getObservationsForSamplingPoint(
  samplingPointId,
  {
    dateFrom = '2000-01-01',
    dateTo = new Date().toISOString().slice(0, 10),
    maxPages = MAX_OBSERVATION_PAGES,
  } = {}
) {
  if (!samplingPointId) return []

  const pages = Math.max(1, Math.min(Number(maxPages) || MAX_OBSERVATION_PAGES, MAX_OBSERVATION_PAGES))
  const cacheKey = `${samplingPointId}|${dateFrom}|${dateTo}|${pages}`
  if (observationCache.has(cacheKey)) {
    return observationCache.get(cacheKey)
  }

  const all = []
  for (let page = 0; page < pages; page += 1) {
    const skip = page * PAGE_LIMIT
    const params = new URLSearchParams({
      dateFrom,
      dateTo,
      limit: String(PAGE_LIMIT),
      skip: String(skip),
    })

    const url = `${EA_BASE}/sampling-point/${encodeURIComponent(
      samplingPointId
    )}/observation?${params.toString()}`

    const response = await fetch(url, {
      method: 'GET',
      headers: CSV_HEADERS,
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(
        `Environment Agency observation request failed (${response.status})${
          detail ? `: ${detail}` : ''
        }`
      )
    }

    const text = await response.text()
    if (!text.trim()) break

    const rows = parseCsv(text)
    if (rows.length === 0) break

    rows.forEach((row) => {
      const normalized = normalizeObservation(row, samplingPointId)
      if (normalized) all.push(normalized)
    })

    if (rows.length < PAGE_LIMIT) break
  }

  all.sort((a, b) => a.dateMs - b.dateMs)
  observationCache.set(cacheKey, all)
  return all
}

/**
 * Group normalized observations by determinand name.
 */
export function groupObservationsByDeterminand(observations = []) {
  const groups = new Map()
  observations.forEach((obs) => {
    if (!obs?.determinandName) return
    if (!groups.has(obs.determinandName)) {
      groups.set(obs.determinandName, [])
    }
    groups.get(obs.determinandName).push(obs)
  })
  return groups
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function mean(values) {
  const nums = values.filter(Number.isFinite)
  if (nums.length === 0) return null
  return nums.reduce((sum, v) => sum + v, 0) / nums.length
}

/**
 * Build a time series for one determinand, optionally filtered by range.
 * Downsamples by taking evenly spaced real points when too dense — never invents values.
 */
export function getTimeSeries(observations, determinandName, rangeKey = 'all') {
  const now = Date.now()
  const rangeMs = {
    '1m': 30 * 24 * 60 * 60 * 1000,
    '6m': 183 * 24 * 60 * 60 * 1000,
    '1y': 365 * 24 * 60 * 60 * 1000,
    '5y': 5 * 365 * 24 * 60 * 60 * 1000,
    all: null,
  }[rangeKey]

  let series = (observations || [])
    .filter((obs) => obs.determinandName === determinandName)
    .filter((obs) => (rangeMs == null ? true : now - obs.dateMs <= rangeMs))
    .sort((a, b) => a.dateMs - b.dateMs)

  if (series.length > MAX_CHART_POINTS) {
    const step = Math.ceil(series.length / MAX_CHART_POINTS)
    const sampled = []
    for (let i = 0; i < series.length; i += step) {
      sampled.push(series[i])
    }
    // Always keep the latest real sample
    const last = series[series.length - 1]
    if (sampled[sampled.length - 1] !== last) sampled.push(last)
    series = sampled
  }

  return series.map((obs) => ({
    date: obs.date,
    dateLabel: new Date(obs.dateMs).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    value: obs.value,
    unit: obs.unit,
  }))
}

/**
 * Describe how old the latest sample is, for transparency.
 */
export function describeSampleAge(isoDate) {
  if (!isoDate) return null
  const then = new Date(isoDate).getTime()
  if (Number.isNaN(then)) return null
  const days = Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000))
  if (days < 0) return 'Latest official sample date is in the future (check source).'
  if (days === 0) return 'Latest official sample was taken today.'
  if (days === 1) return 'Latest official sample is 1 day old.'
  if (days < 45) return `Latest official sample is ${days} days old.`
  const months = Math.floor(days / 30.44)
  if (months < 24) {
    return `Latest official sample is ${months} month${months === 1 ? '' : 's'} old.`
  }
  const years = Math.floor(days / 365.25)
  return `Latest official sample is ${years} year${years === 1 ? '' : 's'} old.`
}

/**
 * Summary stats + simple recent-vs-baseline wording from real observations only.
 */
export function summarizeDeterminand(observations = []) {
  if (!observations.length) return null

  const sorted = [...observations].sort((a, b) => a.dateMs - b.dateMs)
  const values = sorted.map((o) => o.value)
  const latest = sorted[sorted.length - 1]
  const recentMedian = median(values)
  const average = mean(values)

  let changeNote = null
  if (sorted.length >= 6) {
    const split = Math.max(2, Math.floor(sorted.length * 0.3))
    const recentVals = sorted.slice(-split).map((o) => o.value)
    const baselineVals = sorted.slice(0, -split).map((o) => o.value)
    const recent = median(recentVals)
    const baseline = median(baselineVals)
    if (recent != null && baseline != null && baseline !== 0) {
      const rel = (recent - baseline) / Math.abs(baseline)
      const absDiff = Math.abs(recent - baseline)
      const name = latest.determinandName
      const isPh = name === 'pH'
      if (isPh && absDiff >= 0.3) {
        changeNote =
          recent < baseline
            ? 'pH is currently lower relative to this site’s longer-term observations.'
            : 'pH is currently higher relative to this site’s longer-term observations.'
      } else if (!isPh && Math.abs(rel) >= 0.25) {
        changeNote =
          recent > baseline
            ? `${name} is currently elevated relative to this site’s historical observations.`
            : `${name} is currently lower relative to this site’s historical observations.`
      } else {
        changeNote =
          'Recent values are broadly similar to this site’s longer-term observations.'
      }

      return {
        determinandName: latest.determinandName,
        unit: latest.unit,
        latestValue: latest.value,
        latestDate: latest.date,
        sampleCount: sorted.length,
        recentMedian,
        average,
        baselineMedian: baseline,
        recentWindowMedian: recent,
        changeNote,
        ageNote: describeSampleAge(latest.date),
      }
    }
  }

  return {
    determinandName: latest.determinandName,
    unit: latest.unit,
    latestValue: latest.value,
    latestDate: latest.date,
    sampleCount: sorted.length,
    recentMedian,
    average,
    baselineMedian: null,
    recentWindowMedian: null,
    changeNote:
      sorted.length < 6
        ? 'Not enough historical samples at this site for a baseline comparison.'
        : null,
    ageNote: describeSampleAge(latest.date),
  }
}

/**
 * Pick the most useful available parameters that actually have data.
 */
export function selectChartSeries(observations = [], maxSeries = 5) {
  const groups = groupObservationsByDeterminand(observations)
  const selected = []

  PRIORITY_DETERMINANDS.forEach((def) => {
    if (selected.length >= maxSeries) return
    for (const [name, rows] of groups.entries()) {
      if (!def.match(name)) continue
      if (rows.length < 1) continue
      selected.push({
        key: def.key,
        label: def.label,
        determinandName: name,
        unit: rows[0].unit,
        observations: rows,
        summary: summarizeDeterminand(rows),
      })
      return
    }
  })

  return selected
}

export function formatOfficialDate(isoDate) {
  if (!isoDate) return '—'
  const d = new Date(isoDate)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatOfficialValue(value, unit) {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  const digits = abs >= 100 ? 1 : abs >= 10 ? 2 : 3
  const text = Number(value.toFixed(digits))
  return unit ? `${text} ${unit}` : String(text)
}
