import { haversineKm } from './trustEngine'

/** England freshwater defaults when no local peers exist (not invented site history). */
const REGIONAL_BASELINE = {
  phMean: 7.2,
  phStd: 0.45,
  turbidityMean: 16,
  turbidityStd: 8,
  temperatureMean: 14.5,
  temperatureStd: 3.2,
}

const NEARBY_KM = 3

/**
 * Build a historical baseline from nearby citizen readings when available.
 */
export function buildBaselineFromPeers(lat, lng, peers = []) {
  const nearby = peers.filter((item) => {
    if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return false
    return haversineKm(lat, lng, item.lat, item.lng) <= NEARBY_KM
  })

  if (nearby.length === 0) {
    return {
      ...REGIONAL_BASELINE,
      source: 'regional-freshwater-default',
      peerCount: 0,
    }
  }

  const avg = (key) => {
    const vals = nearby.map((p) => Number(p[key])).filter(Number.isFinite)
    if (!vals.length) return null
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }

  const std = (key, mean) => {
    const vals = nearby.map((p) => Number(p[key])).filter(Number.isFinite)
    if (vals.length < 2 || !Number.isFinite(mean)) return null
    const variance =
      vals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / vals.length
    return Math.sqrt(variance)
  }

  const phMean = avg('ph') ?? REGIONAL_BASELINE.phMean
  const turbidityMean = avg('turbidity') ?? REGIONAL_BASELINE.turbidityMean
  const temperatureMean = avg('temperature') ?? REGIONAL_BASELINE.temperatureMean

  return {
    phMean,
    phStd: Math.max(std('ph', phMean) ?? REGIONAL_BASELINE.phStd, 0.15),
    turbidityMean,
    turbidityStd: Math.max(
      std('turbidity', turbidityMean) ?? REGIONAL_BASELINE.turbidityStd,
      2
    ),
    temperatureMean,
    temperatureStd: Math.max(
      std('temperature', temperatureMean) ?? REGIONAL_BASELINE.temperatureStd,
      0.8
    ),
    source: 'nearby-citizen-peers',
    peerCount: nearby.length,
  }
}

/**
 * Create a raw citizen observation ready for trust scoring.
 */
export function createCitizenReading(input, existingObservations = []) {
  const lat = Number(input.lat)
  const lng = Number(input.lng)
  const ph = Number(input.ph)
  const turbidity = Number(input.turbidity)
  const temperature = Number(input.temperature)

  const numericMax = existingObservations.reduce(
    (max, item) => Math.max(max, Number(item.id) || 0),
    0
  )
  const nextId =
    input.ownerId != null
      ? `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
      : numericMax + 1

  const baseline = buildBaselineFromPeers(lat, lng, existingObservations)

  const now = new Date()
  const timestamp = `Today, ${now.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })}`

  const photoQuality =
    input.photoQuality === '' || input.photoQuality == null
      ? 60
      : Number(input.photoQuality)

  return {
    id: nextId,
    siteName: String(input.siteName || 'Citizen reading').trim(),
    lat,
    lng,
    ph,
    turbidity,
    temperature,
    timestamp,
    photoQuality: Number.isFinite(photoQuality) ? photoQuality : 60,
    notes: String(input.notes || '').trim(),
    historicalBaseline: {
      phMean: baseline.phMean,
      phStd: baseline.phStd,
      turbidityMean: baseline.turbidityMean,
      turbidityStd: baseline.turbidityStd,
      temperatureMean: baseline.temperatureMean,
      temperatureStd: baseline.temperatureStd,
    },
    baselineSource: baseline.source,
    baselinePeerCount: baseline.peerCount,
    userSubmitted: true,
    createdAt: now.toISOString(),
  }
}

export function validateReadingInput(input) {
  const errors = []
  if (!String(input.siteName || '').trim()) {
    errors.push('Site name is required.')
  }
  const lat = Number(input.lat)
  const lng = Number(input.lng)
  if (!Number.isFinite(lat) || lat < 49.5 || lat > 56) {
    errors.push('Latitude must be a valid England coordinate.')
  }
  if (!Number.isFinite(lng) || lng < -6.5 || lng > 2.5) {
    errors.push('Longitude must be a valid England coordinate.')
  }
  const ph = Number(input.ph)
  if (!Number.isFinite(ph) || ph < 0 || ph > 14) {
    errors.push('pH must be between 0 and 14.')
  }
  const turbidity = Number(input.turbidity)
  if (!Number.isFinite(turbidity) || turbidity < 0) {
    errors.push('Turbidity (NTU) is required and must be ≥ 0.')
  }
  const temperature = Number(input.temperature)
  if (!Number.isFinite(temperature) || temperature < -5 || temperature > 45) {
    errors.push('Temperature must be between -5°C and 45°C.')
  }
  return errors
}
