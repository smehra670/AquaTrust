/**
 * Environment Agency Catchment Data Explorer (official waterbody status / RNAG).
 * Uses documented CSV endpoints only — never invents pressures or classifications.
 */

const CDE_BASE = import.meta.env?.DEV
  ? '/api/cde'
  : 'https://environment.data.gov.uk/catchment-planning'

const searchCache = new Map()
const statusCache = new Map()

function parseCsv(text) {
  if (!text || !String(text).trim()) return []
  // Strip UTF-8 BOM
  const clean = String(text).replace(/^\uFEFF/, '').replace(/^\?/, '')
  const lines = clean.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []

  const header = parseCsvLine(lines[0]).map((h) => h.replace(/^"|"$/g, '').trim())
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line)
    const row = {}
    header.forEach((key, i) => {
      row[key] = (cols[i] ?? '').replace(/^"|"$/g, '').trim()
    })
    return row
  })
}

function parseCsvLine(line) {
  const out = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      q = !q
      continue
    }
    if (ch === ',' && !q) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}

function pointInEnvelope(lat, lng, envelope) {
  if (!Array.isArray(envelope) || envelope.length < 2) return false
  const [[lat1, lng1], [lat2, lng2]] = envelope
  const minLat = Math.min(lat1, lat2)
  const maxLat = Math.max(lat1, lat2)
  const minLng = Math.min(lng1, lng2)
  const maxLng = Math.max(lng1, lng2)
  return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng
}

/**
 * Search Catchment Data Explorer by watercourse / waterbody name.
 * Returns candidate water bodies (never fabricates IDs).
 */
export async function searchWaterBodiesByName(name) {
  const query = String(name || '').trim()
  if (!query || query.length < 3) return []

  const key = query.toLowerCase()
  if (searchCache.has(key)) return searchCache.get(key)

  const url = `${CDE_BASE}/search?q=${encodeURIComponent(query)}`
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`Catchment Data Explorer search failed (${response.status})`)
  }

  const text = (await response.text()).replace(/^\uFEFF/, '')
  const data = JSON.parse(text)
  const bodies = []

  for (const block of data || []) {
    for (const item of block.results || []) {
      const typeLabel = item?.type?.string || item?.type || ''
      if (typeLabel !== 'Water Body') continue
      if (!item.id) continue
      bodies.push({
        id: String(item.id),
        name: item.name || String(item.id),
        region: item.region?.string || item.region || null,
        uri: item.uri || `/catchment-planning/WaterBody/${item.id}`,
        envelope: item.envelope || null,
      })
    }
  }

  searchCache.set(key, bodies)
  return bodies
}

/**
 * Pick the best waterbody for a named watercourse + click point.
 */
export async function findWaterBodyForSelection({ name, lat, lng }) {
  if (!name) {
    return {
      waterBody: null,
      note: 'No watercourse name is available to match against Catchment Data Explorer.',
    }
  }

  const candidates = await searchWaterBodiesByName(name)
  if (candidates.length === 0) {
    // Try stripping common prefixes
    const stripped = name.replace(/^(River|The)\s+/i, '').trim()
    const retry =
      stripped && stripped !== name ? await searchWaterBodiesByName(stripped) : []
    if (retry.length === 0) {
      return {
        waterBody: null,
        note: `No Catchment Data Explorer water body matched “${name}”.`,
      }
    }
    return pickBest(retry, lat, lng, name)
  }
  return pickBest(candidates, lat, lng, name)
}

function pickBest(candidates, lat, lng, name) {
  const withPoint = candidates.filter((c) =>
    Number.isFinite(lat) && Number.isFinite(lng)
      ? pointInEnvelope(lat, lng, c.envelope)
      : true
  )
  const pool = withPoint.length > 0 ? withPoint : candidates

  // Prefer exact / starts-with name match
  const lower = name.toLowerCase()
  pool.sort((a, b) => {
    const aExact = a.name.toLowerCase() === lower ? 0 : 1
    const bExact = b.name.toLowerCase() === lower ? 0 : 1
    if (aExact !== bExact) return aExact - bExact
    const aStarts = a.name.toLowerCase().startsWith(lower) ? 0 : 1
    const bStarts = b.name.toLowerCase().startsWith(lower) ? 0 : 1
    return aStarts - bStarts
  })

  const waterBody = pool[0]
  return {
    waterBody,
    note:
      withPoint.length > 0
        ? 'Matched using watercourse name and selected coordinates inside the water-body envelope.'
        : 'Matched by watercourse name only — selected point was outside candidate envelopes.',
    candidates: pool.slice(0, 5),
  }
}

async function fetchCsv(path) {
  const response = await fetch(`${CDE_BASE}${path}`)
  if (!response.ok) {
    throw new Error(`CDE request failed (${response.status}) for ${path}`)
  }
  return parseCsv(await response.text())
}

/**
 * Load official classifications + RNAG pressures for a water body ID.
 */
export async function getWaterBodyStatus(waterBodyId) {
  if (!waterBodyId) return null
  if (statusCache.has(waterBodyId)) return statusCache.get(waterBodyId)

  const [classRows, rnagRows] = await Promise.all([
    fetchCsv(`/WaterBody/${encodeURIComponent(waterBodyId)}/classifications.csv`),
    fetchCsv(`/WaterBody/${encodeURIComponent(waterBodyId)}/rnags.csv`),
  ])

  // Prefer latest overall ecological / chemical style rows when present
  const latestByItem = new Map()
  classRows.forEach((row) => {
    const item = row['Classification Item'] || row['Classification Element'] || ''
    const year = Number(row.Year) || 0
    const prev = latestByItem.get(item)
    if (!prev || year >= prev.year) {
      latestByItem.set(item, {
        year,
        item,
        status: row.Status || row['Classification Status'] || null,
        level: row['Classification Level'] || null,
        certainty: row.Certainty || row.Confidence || null,
        cycle: row.Cycle || null,
      })
    }
  })

  const classifications = [...latestByItem.values()].filter((c) => c.item && c.status)

  const pressures = rnagRows
    .map((row) => ({
      element: row['Classification Element'] || null,
      category: row.Category || row.Swmi || null,
      activity: row.Activity || null,
      sector: row['Business Sector'] || null,
      certainty:
        row['Activity Certainty'] ||
        row['Swmi Certainty'] ||
        row['Category Certainty'] ||
        null,
      status: row['Classification Status'] || null,
      pressureTier: [row['Pressure Tier 1'], row['Pressure Tier 2'], row['Pressure Tier 3']]
        .filter(Boolean)
        .join(' · '),
    }))
    .filter((p) => p.category || p.activity || p.element)

  // Deduplicate similar pressure rows
  const seen = new Set()
  const uniquePressures = []
  pressures.forEach((p) => {
    const key = `${p.category}|${p.activity}|${p.sector}|${p.element}`
    if (seen.has(key)) return
    seen.add(key)
    uniquePressures.push(p)
  })

  const result = {
    waterBodyId,
    classifications,
    pressures: uniquePressures.slice(0, 12),
    source: 'Catchment Data Explorer',
    classificationCount: classRows.length,
    rnagCount: rnagRows.length,
  }
  statusCache.set(waterBodyId, result)
  return result
}
