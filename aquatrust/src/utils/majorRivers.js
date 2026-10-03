/**
 * Extract named England watercourses for sparse circle markers.
 * Positions come from real OS Open Rivers geometry only.
 */

const MAIN_RIVER_ALLOWLIST = new Set(
  [
    'River Thames',
    'Thames',
    'River Severn',
    'Severn',
    'Afon Hafren',
    'River Trent',
    'River Mersey',
    'River Tyne',
    'River South Tyne',
    'River North Tyne',
    'River Tees',
    'River Wear',
    'River Eden',
    'River Ribble',
    'River Lune',
    'River Dee',
    'River Wye',
    'Afon Gwy',
    'River Avon',
    'River Great Ouse',
    'Great Ouse',
    'Little Ouse River',
    'River Ouse',
    'River Nene',
    'River Welland',
    'River Witham',
    'River Medway',
    'River Stour',
    'Great Stour',
    'River Lea',
    'River Lee',
    'River Cam',
    'River Cherwell',
    'River Kennet',
    'River Loddon',
    'River Wey',
    'River Mole',
    'River Darent',
    'River Roding',
    'River Brent',
    'River Wandle',
    'River Tame',
    'River Soar',
    'River Derwent',
    'River Dove',
    'River Aire',
    'River Calder',
    'River Don',
    'River Wharfe',
    'River Swale',
    'River Ure',
    'River Nidd',
    'River Irwell',
    'River Exe',
    'River Tamar',
    'River Taw',
    'River Torridge',
    'River Frome',
    'River Test',
    'River Itchen',
    'River Arun',
    'River Adur',
    'River Rother',
    'River Colne',
    'River Esk',
    'River Weaver',
    'River Yeo',
    'River Bure',
    'River Waveney',
    'River Arrow',
    'River Coquet',
    'River Blackwater',
    'Blackwater River',
    'River Axe',
    'River Wensum',
    'River Yare',
    'River Windrush',
    'River Thame',
    'River Bourne',
    'River Ivel',
    'River Blyth',
    'River Dane',
    'River Parrett',
    'River Lugg',
    'Afon Tefeidiad',
    'River Lark',
    'River Evenlode',
    'River Chelmer',
    'River Dart',
    'River Rye',
    'River Brue',
    'River Tone',
    'River Tern',
    'River Irthing',
    'River Wylye',
    'River Wissey',
    'River Cole',
    'River Sence',
    'River Wyre',
    'River Kent',
    'River Deben',
    'River Culm',
    'River Camel',
    'River Wansbeck',
    'River Teign',
    'River Douglas',
    'River Rea',
    'River Leam',
    'River Coln',
    'River Stort',
    'River Leven',
    'River Caldew',
    'River Churnet',
    'River Idle',
    'River Bollin',
    'River Bain',
    'River Leadon',
    'River Otter',
    'River Fowey',
    'River Meon',
    'River Greta',
    'River Skerne',
    'River Ise',
    'River Till',
    'River Allen',
    'New River',
    'Grand Union Canal',
    'Oxford Canal',
    "Regent's Canal",
    'Bridgewater Canal',
    'Leeds and Liverpool Canal',
    'Kennet and Avon Canal',
    'Trent and Mersey Canal',
    'Coventry Canal',
    'Lee Navigation',
    'Shropshire Union Canal',
    'Lancaster Canal',
    'Staffordshire and Worcestershire Canal',
    'Llangollen Canal',
    'Chesterfield Canal',
    'Manchester Ship Canal',
    'Rochdale Canal',
    'Grantham Canal',
  ].map((n) => n.toLowerCase())
)

/** Keep markers on England / nearshore — drop continental drift. */
const ENGLAND_BOUNDS = {
  minLat: 49.85,
  maxLat: 55.9,
  minLng: -6.4,
  maxLng: 2.0,
}

function lineMidpoint(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return null

  let best = coordinates
  if (Array.isArray(coordinates[0]?.[0])) {
    best = coordinates.reduce((a, b) =>
      (a?.length || 0) >= (b?.length || 0) ? a : b
    )
  }

  if (!Array.isArray(best) || best.length === 0) return null
  const mid = best[Math.floor(best.length / 2)]
  if (!Array.isArray(mid) || mid.length < 2) return null
  const [lng, lat] = mid
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

function normalizeName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
}

function isJunkGenericName(name) {
  return /^(the |black |mill |main |new |bow )?(beck|brook|burn|drain|cut|stream|dyke)$/i.test(
    String(name || '').trim()
  )
}

function isMainRiverName(name) {
  const cleaned = normalizeName(name)
  if (!cleaned || isJunkGenericName(cleaned)) return false
  const lower = cleaned.toLowerCase()
  const base = lower.split('(')[0].trim()
  if (MAIN_RIVER_ALLOWLIST.has(lower) || MAIN_RIVER_ALLOWLIST.has(base)) {
    return true
  }
  const withoutRiver = lower.replace(/^river\s+/, '')
  if (MAIN_RIVER_ALLOWLIST.has(withoutRiver)) return true
  if (MAIN_RIVER_ALLOWLIST.has(`river ${withoutRiver}`)) return true
  if (/^(river|afon)\s+[a-z]/.test(lower)) return true
  if (/\b(canal|navigation)\b/.test(lower)) return true
  if (/^[a-z].+\s(brook|beck|stream)$/i.test(cleaned) && cleaned.length >= 8) {
    return true
  }
  return false
}

function inEngland(lat, lng) {
  return (
    lat >= ENGLAND_BOUNDS.minLat &&
    lat <= ENGLAND_BOUNDS.maxLat &&
    lng >= ENGLAND_BOUNDS.minLng &&
    lng <= ENGLAND_BOUNDS.maxLng
  )
}

/**
 * Sparse main-river markers.
 * Each marker sits on the longest OS Open Rivers segment for that name
 * (real geometry midpoint) — never an invented offshore average.
 */
export function extractMajorRiverMarkers(geojson, options = {}) {
  const maxMarkers = options.maxMarkers ?? 240
  const minLengthM = options.minLengthM ?? 250
  const features = geojson?.features || []

  const byName = new Map()

  for (const feature of features) {
    const props = feature?.properties || {}
    const name = normalizeName(props.name)
    if (!isMainRiverName(name)) continue

    const lengthM = Number(props.length_m) || 0
    if (lengthM < minLengthM) continue

    const mid = lineMidpoint(feature.geometry?.coordinates)
    if (!mid) continue

    const key = name.toLowerCase()
    let entry = byName.get(key)
    if (!entry) {
      entry = {
        name,
        form: props.form || 'inlandRiver',
        formLabel: props.form_label || 'River / stream',
        totalLength: 0,
        bestSample: null,
      }
      byName.set(key, entry)
    }

    entry.totalLength += lengthM
    const sample = {
      lat: mid.lat,
      lng: mid.lng,
      lengthM,
      featureId: String(props.id || ''),
      flow: props.flow || '',
      nameAlt: props.name_alt || '',
      form: props.form || entry.form,
      formLabel: props.form_label || entry.formLabel,
      inEngland: inEngland(mid.lat, mid.lng),
    }

    const better =
      !entry.bestSample ||
      (sample.inEngland && !entry.bestSample.inEngland) ||
      (sample.inEngland === entry.bestSample.inEngland &&
        sample.lengthM > entry.bestSample.lengthM)
    if (better) {
      entry.bestSample = sample
      entry.form = sample.form
      entry.formLabel = sample.formLabel
    }
  }

  const markers = []

  for (const entry of byName.values()) {
    const best = entry.bestSample
    if (!best || !inEngland(best.lat, best.lng)) continue

    markers.push({
      id: `major-${best.featureId || entry.name}`,
      featureId: best.featureId,
      name: entry.name,
      form: entry.form,
      formLabel: entry.formLabel,
      lengthM: Math.round(entry.totalLength),
      lat: best.lat,
      lng: best.lng,
      flow: best.flow || '',
      nameAlt: best.nameAlt || '',
      source: 'OS Open Rivers',
    })
  }

  return markers
    .sort((a, b) => b.lengthM - a.lengthM)
    .slice(0, maxMarkers)
}
