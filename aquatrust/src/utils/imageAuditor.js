/**
 * Strict client-side river photo auditor.
 * Only accepts images that look like open water / riverbank scenes.
 * Cars, indoors, selfies, and other non-water subjects are rejected.
 */

function statusFromScore(score) {
  if (score >= 70) return 'pass'
  if (score >= 45) return 'warn'
  return 'fail'
}

function rgbToHsv(r, g, b) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : d / max
  return { h, s, v: max }
}

/** Natural water: muted blue/teal/olive — not bright car paint. */
function isNaturalWater(h, s, v) {
  // Reject neon / metallic paint-like blues (high sat + high value)
  if (s > 0.72 && v > 0.55) return false
  // Classic river / lake blues & teals
  if (h >= 170 && h <= 225 && s >= 0.1 && s <= 0.65 && v >= 0.12 && v <= 0.78) {
    return true
  }
  // Murky / greenish freshwater
  if (h >= 145 && h <= 175 && s >= 0.1 && s <= 0.55 && v >= 0.12 && v <= 0.65) {
    return true
  }
  // Dark reflective water (low value, some blue-green chroma)
  if (h >= 160 && h <= 230 && s >= 0.08 && s <= 0.45 && v >= 0.08 && v <= 0.35) {
    return true
  }
  return false
}

function isVegetation(h, s, v) {
  return h >= 75 && h <= 160 && s >= 0.15 && s <= 0.85 && v >= 0.12 && v <= 0.85
}

function isSky(h, s, v) {
  return h >= 185 && h <= 235 && s >= 0.04 && s <= 0.5 && v >= 0.55
}

function isSkin(h, s, v) {
  return (
    ((h >= 0 && h <= 45) || h >= 340) &&
    s >= 0.15 &&
    s <= 0.6 &&
    v >= 0.3 &&
    v <= 0.95
  )
}

/** Bright red / orange / yellow / magenta — common on cars, rare on rivers. */
function isArtificialPaint(h, s, v) {
  if (s < 0.45 || v < 0.25) return false
  if (h <= 55 || h >= 330) return true // red–orange–yellow
  if (h >= 270 && h <= 330 && s > 0.4) return true // magenta/purple paint
  // Electric blue paint (too vivid for natural water)
  if (h >= 200 && h <= 250 && s > 0.7 && v > 0.45) return true
  return false
}

function isAsphaltMetal(h, s, v) {
  return s < 0.12 && v >= 0.18 && v <= 0.72
}

function analyseRiverScene(data, width, height) {
  const n = width * height
  let water = 0
  let vegetation = 0
  let sky = 0
  let skin = 0
  let asphalt = 0
  let paint = 0
  let waterLower = 0
  let lowerCount = 0
  let waterUpper = 0
  let upperCount = 0
  let edgeCount = 0
  let edgeChecks = 0

  // Row-wise water density for horizontal band continuity
  const rowWater = new Array(height).fill(0)

  for (let y = 0; y < height; y += 1) {
    const lower = y >= height * 0.38
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const { h, s, v } = rgbToHsv(r, g, b)

      if (isAsphaltMetal(h, s, v)) asphalt += 1
      if (isArtificialPaint(h, s, v)) paint += 1
      if (isNaturalWater(h, s, v)) {
        water += 1
        rowWater[y] += 1
        if (lower) waterLower += 1
        else waterUpper += 1
      }
      if (isVegetation(h, s, v)) vegetation += 1
      if (isSky(h, s, v)) sky += 1
      if (isSkin(h, s, v)) skin += 1
      if (lower) lowerCount += 1
      else upperCount += 1

      // Edge energy — cars/objects are sharp; calm water is smoother
      if (x + 1 < width && y + 1 < height) {
        const iR = i + 4
        const iD = i + width * 4
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        const lumR =
          0.2126 * data[iR] + 0.7152 * data[iR + 1] + 0.0722 * data[iR + 2]
        const lumD =
          0.2126 * data[iD] + 0.7152 * data[iD + 1] + 0.0722 * data[iD + 2]
        const grad = Math.abs(lum - lumR) + Math.abs(lum - lumD)
        edgeChecks += 1
        if (grad > 48) edgeCount += 1
      }
    }
  }

  const waterFrac = water / n
  const vegFrac = vegetation / n
  const skyFrac = sky / n
  const skinFrac = skin / n
  const asphaltFrac = asphalt / n
  const paintFrac = paint / n
  const edgeFrac = edgeChecks ? edgeCount / edgeChecks : 0
  const lowerWaterFrac = lowerCount ? waterLower / lowerCount : 0
  const upperWaterFrac = upperCount ? waterUpper / upperCount : 0
  const outdoorFrac = vegFrac + skyFrac

  // Longest run of rows with meaningful water (horizontal water body)
  let bestRun = 0
  let run = 0
  for (let y = 0; y < height; y += 1) {
    if (rowWater[y] / width >= 0.12) {
      run += 1
      bestRun = Math.max(bestRun, run)
    } else {
      run = 0
    }
  }
  const waterBandFrac = bestRun / height

  // --- Scoring: start low; must earn acceptance ---
  let riverScore = 5
  riverScore += Math.min(38, waterFrac * 160)
  riverScore += Math.min(18, lowerWaterFrac * 70)
  riverScore += Math.min(14, waterBandFrac * 55)
  if (lowerWaterFrac > upperWaterFrac + 0.05) riverScore += 8
  riverScore += Math.min(14, outdoorFrac * 45)

  // Hard penalties for non-river subjects (cars, people, urban)
  riverScore -= Math.min(40, paintFrac * 160)
  riverScore -= Math.min(28, Math.max(0, asphaltFrac - 0.22) * 70)
  riverScore -= Math.min(30, skinFrac * 110)
  riverScore -= Math.min(26, Math.max(0, edgeFrac - 0.18) * 90)

  if (waterFrac < 0.12) riverScore -= 35
  if (waterFrac < 0.18) riverScore -= 12
  if (outdoorFrac < 0.06) riverScore -= 18
  if (paintFrac > 0.06) riverScore -= 20
  if (asphaltFrac > 0.4 && waterFrac < 0.2) riverScore -= 22
  if (edgeFrac > 0.28 && waterFrac < 0.25) riverScore -= 16
  if (waterBandFrac < 0.12) riverScore -= 14

  riverScore = Math.max(0, Math.min(100, Math.round(riverScore)))

  // Strict acceptance — no "maybe" pass-through for filing
  const looksLikeRiver =
    riverScore >= 62 &&
    waterFrac >= 0.14 &&
    waterBandFrac >= 0.14 &&
    paintFrac < 0.08 &&
    skinFrac < 0.14 &&
    outdoorFrac >= 0.05 &&
    !(asphaltFrac > 0.38 && waterFrac < 0.22) &&
    !(edgeFrac > 0.32 && waterFrac < 0.22)

  return {
    riverScore,
    waterFrac,
    vegFrac,
    skyFrac,
    skinFrac,
    asphaltFrac,
    paintFrac,
    edgeFrac,
    lowerWaterFrac,
    waterBandFrac,
    outdoorFrac,
    looksLikeRiver,
    // Kept for messaging only — never treated as accepted
    maybeRiver: !looksLikeRiver && riverScore >= 45 && waterFrac >= 0.1,
  }
}

/**
 * Analyse an evidence photo. Only clear river / watercourse scenes pass.
 */
export async function assessEvidenceImage(file) {
  const checks = []
  let score = 35

  if (!file) {
    return {
      ok: false,
      score: 10,
      label: 'River photo required',
      summary:
        'AquaTrust AI image check: upload a clear photo of the river or watercourse.',
      checks: [
        {
          id: 'photo-missing',
          status: 'fail',
          title: 'Evidence photo',
          detail: 'A river photo is required — other subjects are not accepted.',
        },
      ],
      photoQuality: 10,
      riverDetection: { looksLikeRiver: false, riverScore: 0 },
      status: 'fail',
    }
  }

  const type = String(file.type || '')
  const size = Number(file.size) || 0
  const baseName = String(file.name || 'upload').replace(/\.\w+$/, '')

  if (!type.startsWith('image/')) {
    checks.push({
      id: 'file-type',
      status: 'fail',
      title: 'File type',
      detail: 'Evidence must be an image (JPEG, PNG, or WebP).',
    })
    return {
      ok: false,
      score: 8,
      label: 'Invalid evidence file',
      summary: 'The uploaded file is not a recognised image format.',
      checks,
      photoQuality: 8,
      riverDetection: { looksLikeRiver: false, riverScore: 0 },
      status: 'fail',
    }
  }
  checks.push({
    id: 'file-type',
    status: 'pass',
    title: 'File type',
    detail: `${type} accepted.`,
  })
  score += 4

  if (size < 8_000) {
    checks.push({
      id: 'file-size',
      status: 'fail',
      title: 'File size',
      detail: 'Image is too small to verify as a river scene.',
    })
    score -= 25
  } else {
    checks.push({
      id: 'file-size',
      status: 'pass',
      title: 'File size',
      detail: `${Math.round(size / 1024)} KB OK.`,
    })
    score += 3
  }

  if (
    /car|truck|vehicle|bmw|audi|ford|tesla|motorbike|bike|selfie|portrait|indoor|room|desk|food|dog|cat|meme|screenshot/i.test(
      baseName
    )
  ) {
    checks.push({
      id: 'filename',
      status: 'fail',
      title: 'Filename',
      detail: `Filename “${file.name}” suggests a non-river subject.`,
    })
    score -= 30
  } else if (/river|water|stream|canal|brook|lake|weir|bank/i.test(baseName)) {
    checks.push({
      id: 'filename',
      status: 'pass',
      title: 'Filename',
      detail: `Filename “${file.name}” is consistent with a watercourse.`,
    })
    score += 3
  }

  let riverDetection = {
    looksLikeRiver: false,
    maybeRiver: false,
    riverScore: 0,
  }

  try {
    const bitmap = await createImageBitmap(file)
    const width = bitmap.width
    const height = bitmap.height

    if (width < 200 || height < 200) {
      checks.push({
        id: 'resolution',
        status: 'fail',
        title: 'Resolution',
        detail: `${width}×${height}px is too low to verify a river scene.`,
      })
      score -= 20
    } else {
      checks.push({
        id: 'resolution',
        status: 'pass',
        title: 'Resolution',
        detail: `${width}×${height}px OK.`,
      })
      score += 4
    }

    const canvas = document.createElement('canvas')
    const sampleW = 96
    const sampleH = Math.max(1, Math.round((height / width) * sampleW))
    canvas.width = sampleW
    canvas.height = sampleH
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(bitmap, 0, 0, sampleW, sampleH)
    const { data } = ctx.getImageData(0, 0, sampleW, sampleH)

    let sum = 0
    let sumSq = 0
    let dark = 0
    const n = sampleW * sampleH
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
      sum += lum
      sumSq += lum * lum
      if (lum < 18) dark += 1
    }
    const mean = sum / n
    const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean))

    if (std < 8 || dark / n > 0.88) {
      checks.push({
        id: 'content',
        status: 'fail',
        title: 'Image content',
        detail: 'Image is blank, uniform, or too dark to show a river.',
      })
      score -= 25
    }

    riverDetection = analyseRiverScene(data, sampleW, sampleH)
    const pctWater = Math.round(riverDetection.waterFrac * 100)
    const pctPaint = Math.round(riverDetection.paintFrac * 100)
    const pctAsphalt = Math.round(riverDetection.asphaltFrac * 100)

    if (riverDetection.paintFrac >= 0.08 || riverDetection.asphaltFrac > 0.42) {
      checks.push({
        id: 'non-river-subject',
        status: 'fail',
        title: 'Non-river subject',
        detail: `Looks like a vehicle or urban object (~${pctPaint}% artificial colour, ~${pctAsphalt}% asphalt/metal) — not a river.`,
      })
      score -= 40
      riverDetection = { ...riverDetection, looksLikeRiver: false }
    }

    if (riverDetection.looksLikeRiver) {
      checks.push({
        id: 'river-scene',
        status: 'pass',
        title: 'River scene check',
        detail: `Verified watercourse scene (~${pctWater}% natural water colour, band ${Math.round(riverDetection.waterBandFrac * 100)}%, score ${riverDetection.riverScore}).`,
      })
      score += 28
    } else {
      checks.push({
        id: 'river-scene',
        status: 'fail',
        title: 'River scene check',
        detail: `Rejected — not a river photo (~${pctWater}% natural water, score ${riverDetection.riverScore}). Only clear river / watercourse images are accepted.`,
      })
      score -= 40
    }

    bitmap.close?.()
  } catch {
    checks.push({
      id: 'decode',
      status: 'fail',
      title: 'Image decode',
      detail: 'Could not decode the image — file may be corrupt.',
    })
    score -= 35
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  const failed = checks.some((c) => c.status === 'fail')
  const accepted = riverDetection.looksLikeRiver && !failed

  return {
    ok: accepted,
    score: accepted ? Math.max(score, 70) : Math.min(score, 35),
    label: accepted ? 'River photo verified' : 'Not a river photo',
    summary: accepted
      ? 'AquaTrust AI image check: this photo looks like a river / watercourse and can support the filing.'
      : 'AquaTrust AI image check: only photos of rivers or watercourses are accepted. Cars and other subjects are rejected.',
    checks,
    photoQuality: accepted ? Math.max(score, 70) : Math.min(score, 35),
    riverDetection,
    status: accepted ? 'pass' : 'fail',
  }
}
