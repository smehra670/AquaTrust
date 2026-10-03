/**
 * MapLibre OS Open Rivers layers from preprocessed overview.geojson.
 */

import { WATERCOURSE_FORMS } from '../utils/watercourses'
import { extractMajorRiverMarkers } from '../utils/majorRivers'

export const RIVERS_SOURCE = 'os-open-rivers'
export const RIVERS_LAYER = 'watercourses-line'
export const RIVERS_HIT_LAYER = 'watercourses-hit'
export const RIVERS_HOVER_LAYER = 'watercourses-hover'
export const RIVERS_SELECTED_LAYER = 'watercourses-selected'

const OVERVIEW_URL = '/rivers/overview.geojson'

const FORM_MATCH = [
  'match',
  ['get', 'form'],
  'inlandRiver',
  WATERCOURSE_FORMS.inlandRiver.color,
  'tidalRiver',
  WATERCOURSE_FORMS.tidalRiver.color,
  'canal',
  WATERCOURSE_FORMS.canal.color,
  'lake',
  WATERCOURSE_FORMS.lake.color,
  WATERCOURSE_FORMS.inlandRiver.color,
]

async function fetchOverview() {
  const response = await fetch(OVERVIEW_URL)
  if (!response.ok) {
    throw new Error(`Failed to load OS Open Rivers overview (${response.status})`)
  }
  return response.json()
}

function buildMajorRivers(data) {
  return extractMajorRiverMarkers(data, {
    maxMarkers: 240,
    minLengthM: 250,
  })
}

/**
 * Load overview GeoJSON, add line layers, return major-river marker candidates.
 */
export async function addWatercourseLayers(map) {
  const data = await fetchOverview()
  const majorRivers = buildMajorRivers(data)

  if (map.getSource(RIVERS_SOURCE)) {
    // Already loaded (e.g. HMR) — still return a full marker set
    return {
      majorRivers,
      featureCount: data.features?.length || 0,
    }
  }

  map.addSource(RIVERS_SOURCE, {
    type: 'geojson',
    data,
    promoteId: 'id',
  })

  map.addLayer({
    id: RIVERS_HIT_LAYER,
    type: 'line',
    source: RIVERS_SOURCE,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#000',
      'line-opacity': 0,
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        6,
        8,
        10,
        12,
        14,
        16,
      ],
    },
  })

  map.addLayer({
    id: RIVERS_LAYER,
    type: 'line',
    source: RIVERS_SOURCE,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': FORM_MATCH,
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        6,
        0.7,
        9,
        1.4,
        12,
        2.4,
        14,
        3.2,
      ],
      'line-opacity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        5,
        0.18,
        8,
        0.4,
        11,
        0.72,
        14,
        0.88,
      ],
    },
  })

  map.addLayer({
    id: RIVERS_HOVER_LAYER,
    type: 'line',
    source: RIVERS_SOURCE,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    filter: ['==', ['get', 'id'], ''],
    paint: {
      'line-color': '#f59e0b',
      'line-width': ['interpolate', ['linear'], ['zoom'], 6, 2, 12, 5],
      'line-opacity': 0.95,
    },
  })

  map.addLayer({
    id: RIVERS_SELECTED_LAYER,
    type: 'line',
    source: RIVERS_SOURCE,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    filter: ['==', ['get', 'id'], ''],
    paint: {
      'line-color': '#d97706',
      'line-width': ['interpolate', ['linear'], ['zoom'], 6, 2.5, 12, 6],
      'line-opacity': 1,
    },
  })

  return {
    majorRivers,
    featureCount: data.features?.length || 0,
  }
}

export function setHoveredWatercourse(map, featureId) {
  if (!map?.getLayer(RIVERS_HOVER_LAYER)) return
  map.setFilter(RIVERS_HOVER_LAYER, ['==', ['get', 'id'], featureId || ''])
}

export function setSelectedWatercourse(map, featureId) {
  if (!map?.getLayer(RIVERS_SELECTED_LAYER)) return
  map.setFilter(RIVERS_SELECTED_LAYER, ['==', ['get', 'id'], featureId || ''])
}

export function propsFromWatercourseFeature(feature, lngLat) {
  const p = feature?.properties || {}
  const id = String(p.id || feature.id || '')
  return {
    id,
    featureId: id,
    name: p.name || '',
    nameAlt: p.name_alt || '',
    form: p.form || '',
    formLabel:
      p.form_label || WATERCOURSE_FORMS[p.form]?.label || p.form || 'Unknown',
    lengthM: Number(p.length_m) || null,
    flow: p.flow || '',
    lat: lngLat?.lat ?? null,
    lng: lngLat?.lng ?? null,
    source: 'OS Open Rivers',
  }
}
