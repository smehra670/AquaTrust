/**
 * Build river-specific audit context from data AquaTrust already holds:
 * nearby citizen readings + nearest named major river marker.
 */

import { haversineKm } from './trustEngine'

function finite(n) {
  const v = Number(n)
  return Number.isFinite(v) ? v : null
}

function avg(values) {
  const nums = values.filter((v) => Number.isFinite(v))
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function stdev(values, mean) {
  const nums = values.filter((v) => Number.isFinite(v))
  if (nums.length < 2 || !Number.isFinite(mean)) return null
  const variance =
    nums.reduce((sum, v) => sum + (v - mean) ** 2, 0) / nums.length
  return Math.sqrt(variance)
}

/**
 * @param {{ lat, lng, siteName, peers, majorRivers }}
 */
export function buildRiverAuditContext({
  lat,
  lng,
  siteName = '',
  peers = [],
  majorRivers = [],
} = {}) {
  const site = String(siteName || '').trim()
  const siteLower = site.toLowerCase()

  let nearestRiver = null
  let nearestKm = Infinity
  for (const river of majorRivers || []) {
    if (!Number.isFinite(river.lat) || !Number.isFinite(river.lng)) continue
    const km = haversineKm(lat, lng, river.lat, river.lng)
    if (km < nearestKm) {
      nearestKm = km
      nearestRiver = river
    }
  }
  if (nearestRiver && nearestKm > 35) {
    nearestRiver = null
  }

  const nameMatchRiver =
    (majorRivers || []).find((river) => {
      const name = String(river.name || '').toLowerCase()
      if (!name || !siteLower) return false
      return siteLower.includes(name) || name.includes(siteLower)
    }) || null

  const matchedRiver = nameMatchRiver || nearestRiver
  const matchKm =
    matchedRiver &&
    Number.isFinite(matchedRiver.lat) &&
    Number.isFinite(matchedRiver.lng)
      ? haversineKm(lat, lng, matchedRiver.lat, matchedRiver.lng)
      : null

  const localPeers = (peers || []).filter((item) => {
    if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return false
    const km = haversineKm(lat, lng, item.lat, item.lng)
    if (km <= 5) return true
    if (
      matchedRiver &&
      String(item.siteName || '')
        .toLowerCase()
        .includes(String(matchedRiver.name || '').toLowerCase().slice(0, 8))
    ) {
      return km <= 12
    }
    return false
  })

  const phVals = localPeers.map((p) => finite(p.ph)).filter((v) => v != null)
  const turbVals = localPeers
    .map((p) => finite(p.turbidity))
    .filter((v) => v != null)
  const tempVals = localPeers
    .map((p) => finite(p.temperature))
    .filter((v) => v != null)

  const phMean = avg(phVals)
  const turbMean = avg(turbVals)
  const tempMean = avg(tempVals)

  return {
    riverName: matchedRiver?.name || null,
    riverDistanceKm: matchKm,
    matchType: nameMatchRiver
      ? 'name'
      : nearestRiver
        ? 'nearest'
        : null,
    peerCount: localPeers.length,
    localBaseline:
      phMean != null
        ? {
            phMean,
            phStd: Math.max(stdev(phVals, phMean) ?? 0.35, 0.15),
            turbidityMean: turbMean,
            turbidityStd: Math.max(stdev(turbVals, turbMean) ?? 6, 2),
            temperatureMean: tempMean,
            temperatureStd: Math.max(stdev(tempVals, tempMean) ?? 2.5, 0.8),
            source: 'local-citizen-river-cluster',
            peerCount: localPeers.length,
          }
        : null,
    peers: localPeers,
  }
}
