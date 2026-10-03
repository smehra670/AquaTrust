/**
 * Place photos for AquaTrust — Wikipedia + Wikimedia Commons.
 * Strict filters reject documents/scans/maps; prefer real landscape photos.
 * No API keys / no new packages.
 */

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php'
const WIKI_API = 'https://en.wikipedia.org/w/api.php'
const USER_AGENT =
  'AquaTrustHackathon/0.1 (educational; local demo; contact via hackathon team)'

const imageCache = new Map()

/** Titles / filenames that are almost never useful river photos */
const REJECT_TITLE =
  /\b(djvu|pdf|gazette|newspaper|manuscript|document|scan|scanned|ocr|transcript|coat of arms|heraldic|flag of|logo|svg|diagram|schematic|chart|graph|map of|street map|ordnance survey|os map|cadastral|stamp|postcard back|signature|autograph|portrait of|family tree|census|ballot|legislation|act of parliament|hansard)\b/i

const REJECT_EXT = /\.(djvu|pdf|svg|tif|tiff)$/i

const WATER_HINT =
  /\b(river|stream|brook|beck|canal|lock|weir|water|lake|reservoir|towpath|riverside|waterside|bridge|aqueduct|confluence|estuary|harbour|harbor|quay|wharf|marina|wetland|marsh)\b/i

const UK_HINT =
  /\b(england|britain|uk|united kingdom|geograph|thames|severn|trent|mersey|tyne|avon|ouse|medway|cambridgeshire|yorkshire|london|birmingham|manchester|bristol|oxford|cambridge|norfolk|suffolk|essex|kent|sussex|hampshire|devon|cornwall|cumbria|lancashire|cheshire|nottingham|leicester|warwick|worcester|gloucester|shropshire|stafford)\b/i

function cacheKey(placeName, lat, lng) {
  const name = (placeName || '').trim().toLowerCase()
  const latKey = Number.isFinite(lat) ? lat.toFixed(4) : 'x'
  const lngKey = Number.isFinite(lng) ? lng.toFixed(4) : 'x'
  return `${name}|${latKey}|${lngKey}`
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function mediawikiJson(apiBase, params, attempt = 0) {
  const url = new URL(apiBase)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  })
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'Api-User-Agent': USER_AGENT,
    },
  })

  if (response.status === 429 && attempt < 3) {
    await sleep(900 * (attempt + 1))
    return mediawikiJson(apiBase, params, attempt + 1)
  }

  if (!response.ok) {
    const error = new Error(`MediaWiki request failed (${response.status})`)
    error.status = response.status
    throw error
  }

  return response.json()
}

function cleanPlaceName(placeName) {
  return String(placeName || '')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "River Lea - Hackney Wick" → "River Lea" */
export function primaryWaterbodyName(placeName) {
  const cleaned = cleanPlaceName(placeName)
  if (!cleaned) return ''
  return cleaned.split(/\s+-\s+/)[0].trim()
}

function nameTokens(placeName) {
  return cleanPlaceName(placeName)
    .toLowerCase()
    .split(/[\s\-–,/:]+/)
    .filter(
      (token) =>
        token.length > 2 &&
        !['the', 'and', 'for', 'near', 'at'].includes(token)
    )
}

function scoreAgainstPlace(title, placeName) {
  const tokens = nameTokens(placeName)
  if (!tokens.length) return 0
  const hay = String(title || '').toLowerCase()
  return tokens.reduce(
    (score, token) => score + (hay.includes(token) ? 1 : 0),
    0
  )
}

function fileTitleToPageUrl(title) {
  const bare = String(title || '').replace(/^File:/i, '')
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(
    bare.replace(/ /g, '_')
  )}`
}

function parseArtist(extmetadata) {
  const raw = extmetadata?.Artist?.value
  if (!raw) return null
  return (
    String(raw)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || null
  )
}

function parseLicense(extmetadata) {
  return (
    extmetadata?.LicenseShortName?.value ||
    extmetadata?.License?.value ||
    null
  )
}

function mapImageInfoPage(page, matchType) {
  const info = page?.imageinfo?.[0]
  if (!info?.thumburl && !info?.url) return null

  const title = page.title || info.descriptionurl || 'Wikimedia image'
  const ext = info.extmetadata || {}
  const width = Number(info.width) || Number(info.thumbwidth) || 0
  const height = Number(info.height) || Number(info.thumbheight) || 0

  return {
    url: info.url || info.thumburl,
    thumbnailUrl: info.thumburl || info.url,
    title: String(title).replace(/^File:/i, ''),
    author: parseArtist(ext),
    license: parseLicense(ext),
    sourceUrl: info.descriptionurl || fileTitleToPageUrl(page.title),
    matchType,
    width,
    height,
  }
}

/**
 * Hard reject non-photographic / irrelevant Commons files.
 */
export function isRejectedImage(image) {
  if (!image) return true
  const title = String(image.title || '')
  const blob = `${title} ${image.author || ''} ${image.sourceUrl || ''}`

  if (REJECT_TITLE.test(blob) || REJECT_EXT.test(title)) return true

  // Extremely tall/narrow pages often scans of documents
  if (image.width > 0 && image.height > 0) {
    const ratio = image.height / image.width
    if (ratio > 2.4 && image.width < 900) return true
  }

  return false
}

function looksLikeWaterPhoto(image, placeName) {
  if (isRejectedImage(image)) return false

  const title = String(image.title || '')
  const place = cleanPlaceName(placeName)

  // Geograph UK photos near water are usually trustworthy landscape shots
  if (/\bgeograph\b/i.test(title) || /\bgeograph\b/i.test(image.author || '')) {
    return true
  }

  if (WATER_HINT.test(title)) return true
  if (image.matchType === 'wikipedia') return true

  if (image.matchType === 'nearby') {
    // Nearby only if it still looks vaguely photographic / UK
    return UK_HINT.test(title) || WATER_HINT.test(title) || scoreAgainstPlace(title, place) >= 1
  }

  // Named search must overlap the place and preferably water/UK context
  const overlap = scoreAgainstPlace(title, place)
  if (overlap >= 2 && (WATER_HINT.test(title) || UK_HINT.test(title))) return true
  if (overlap >= 1 && WATER_HINT.test(title) && UK_HINT.test(title)) return true

  return false
}

async function fetchImageDetails(titles, matchType) {
  if (!titles.length) return []

  const data = await mediawikiJson(COMMONS_API, {
    action: 'query',
    prop: 'imageinfo',
    titles: titles.join('|'),
    iiprop: 'url|extmetadata|size',
    iiurlwidth: 640,
  })

  return Object.values(data?.query?.pages || {})
    .filter((page) => page && page.pageid && !page.missing)
    .map((page) => mapImageInfoPage(page, matchType))
    .filter(Boolean)
}

/**
 * Wikipedia lead image — usually a real photo of the waterbody for major rivers.
 */
async function searchWikipediaPageImage(placeName) {
  const waterbody = primaryWaterbodyName(placeName)
  if (!waterbody) return []

  const candidates = []
  // Prefer "River X" form when not already present
  if (/^river\s+/i.test(waterbody) || /^canal\s+/i.test(waterbody)) {
    candidates.push(waterbody)
  } else {
    candidates.push(`River ${waterbody}`, waterbody)
  }

  for (const title of candidates) {
    try {
      const data = await mediawikiJson(WIKI_API, {
        action: 'query',
        titles: title,
        prop: 'pageimages|info',
        piprop: 'thumbnail|name|original',
        pithumbsize: 640,
        inprop: 'url',
        redirects: 1,
      })

      const page = Object.values(data?.query?.pages || {})[0]
      if (!page || page.missing || page.invalid) continue
      if (!page.thumbnail?.source && !page.original?.source) continue

      const fileName = page.pageimage || ''
      // Reject if Wikipedia thumb is clearly a non-photo (rare but possible)
      if (fileName && (REJECT_TITLE.test(fileName) || REJECT_EXT.test(fileName))) {
        continue
      }

      return [
        {
          url: page.original?.source || page.thumbnail.source,
          thumbnailUrl: page.thumbnail?.source || page.original?.source,
          title: fileName || `${page.title} (Wikipedia)`,
          author: null,
          license: 'See Wikipedia / Commons file page',
          sourceUrl:
            page.fullurl ||
            `https://en.wikipedia.org/wiki/${encodeURIComponent(
              page.title.replace(/ /g, '_')
            )}`,
          matchType: 'wikipedia',
          width: page.thumbnail?.width || 0,
          height: page.thumbnail?.height || 0,
        },
      ]
    } catch (error) {
      console.warn('[placeImages] Wikipedia lookup failed', error.message)
    }
  }

  return []
}

async function searchCommonsByName(placeName) {
  const waterbody = primaryWaterbodyName(placeName)
  const queryBase = waterbody || cleanPlaceName(placeName)
  if (!queryBase) return []

  // Bias toward real UK landscape photos; exclude common junk via search terms
  const query = `"${queryBase}" (England OR Geograph) (river OR canal OR water OR stream) -djvu -pdf -map -diagram -"coat of arms" -gazette`

  const data = await mediawikiJson(COMMONS_API, {
    action: 'query',
    list: 'search',
    srsearch: query,
    srnamespace: 6,
    srlimit: 8,
  })

  const titles = (data?.query?.search || [])
    .map((item) => item.title)
    .filter(Boolean)
    .slice(0, 6)

  return fetchImageDetails(titles, 'name')
}

async function searchCommonsByGeo(lat, lng, radiusMetres = 2500) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return []

  const data = await mediawikiJson(COMMONS_API, {
    action: 'query',
    generator: 'geosearch',
    ggscoord: `${lat}|${lng}`,
    ggsradius: Math.min(Math.max(radiusMetres, 10), 10000),
    ggslimit: 10,
    ggsnamespace: 6,
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|size',
    iiurlwidth: 640,
  })

  return Object.values(data?.query?.pages || {})
    .map((page) => mapImageInfoPage(page, 'nearby'))
    .filter(Boolean)
}

function dedupeImages(images) {
  const seen = new Set()
  const result = []
  for (const image of images) {
    const key = image.sourceUrl || image.thumbnailUrl || image.title
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(image)
  }
  return result
}

function rankImages(images, placeName) {
  const order = { wikipedia: 0, name: 1, nearby: 2 }
  return images
    .filter((image) => looksLikeWaterPhoto(image, placeName))
    .map((image) => ({
      ...image,
      _score:
        scoreAgainstPlace(image.title, placeName) +
        (WATER_HINT.test(image.title) ? 2 : 0) +
        (/\bgeograph\b/i.test(image.title) ? 2 : 0) +
        (image.matchType === 'wikipedia' ? 5 : 0),
    }))
    .sort((a, b) => {
      const ao = order[a.matchType] ?? 9
      const bo = order[b.matchType] ?? 9
      if (ao !== bo) return ao - bo
      return b._score - a._score
    })
    .map(({ _score, ...image }) => image)
}

/**
 * getPlaceImages(placeName, lat, lng)
 */
export async function getPlaceImages(placeName, lat, lng) {
  const key = cacheKey(placeName, lat, lng)
  if (imageCache.has(key)) {
    return imageCache.get(key)
  }

  let images = []
  let ok = false
  const named = cleanPlaceName(placeName)

  try {
    // 1) Wikipedia lead image for named waterbodies (most accurate for major rivers)
    if (named) {
      try {
        const wiki = await searchWikipediaPageImage(named)
        images = images.concat(wiki)
        ok = true
      } catch (error) {
        console.warn('[placeImages] wikipedia failed', error.message)
      }
    }

    // 2) Targeted Commons name search
    if (named && images.length < 2) {
      try {
        const commons = await searchCommonsByName(named)
        images = images.concat(commons)
        ok = true
      } catch (error) {
        console.warn('[placeImages] name search failed', error.message)
      }
    }

    // 3) Nearby geotagged photos (labelled "Nearby" in UI)
    if (images.length < 2) {
      try {
        const geo = await searchCommonsByGeo(lat, lng, named ? 2000 : 3000)
        images = images.concat(geo)
        ok = true
      } catch (error) {
        console.warn('[placeImages] geo search failed', error.message)
      }
    }

    images = rankImages(dedupeImages(images), placeName).slice(0, 3)
  } catch (error) {
    console.warn('[placeImages] fetch failed', error)
    ok = false
    images = []
  }

  if (ok) {
    imageCache.set(key, images)
  }

  return images
}

export function warmPlaceImageCache(places) {
  if (!Array.isArray(places) || typeof window === 'undefined') return

  places.forEach((place, index) => {
    window.setTimeout(() => {
      getPlaceImages(place.placeName, place.lat, place.lng).catch(() => {})
    }, 500 + index * 1200)
  })
}
