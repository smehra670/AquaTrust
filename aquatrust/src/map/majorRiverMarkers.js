/**
 * Named major-river markers as MapLibre circle layers (reliable at scale).
 */

export const MAJOR_RIVERS_SOURCE = 'major-rivers-points'
export const MAJOR_RIVERS_LAYER = 'major-rivers-circles'
export const MAJOR_RIVERS_HIT_LAYER = 'major-rivers-hit'
export const MAJOR_RIVERS_SELECTED_LAYER = 'major-rivers-selected'

function toFeatureCollection(rivers = [], coverageById = {}) {
  return {
    type: 'FeatureCollection',
    features: rivers
      .filter(
        (river) => Number.isFinite(river.lat) && Number.isFinite(river.lng)
      )
      .map((river) => {
        const coverage = coverageById[river.id] || {}
        return {
          type: 'Feature',
          id: river.id,
          properties: {
            id: river.id,
            featureId: river.featureId || '',
            name: river.name || '',
            nameAlt: river.nameAlt || '',
            form: river.form || '',
            formLabel: river.formLabel || '',
            lengthM: river.lengthM || 0,
            flow: river.flow || '',
            level: coverage.level || 'pending',
            coverageLabel: coverage.label || 'Checking official data…',
            stationCount: coverage.stationCount || 0,
          },
          geometry: {
            type: 'Point',
            coordinates: [river.lng, river.lat],
          },
        }
      }),
  }
}

export function syncMajorRiverMarkers(map, rivers = [], coverageById = {}) {
  if (!map) return
  const data = toFeatureCollection(rivers, coverageById)

  if (map.getSource(MAJOR_RIVERS_SOURCE)) {
    map.getSource(MAJOR_RIVERS_SOURCE).setData(data)
    return
  }

  map.addSource(MAJOR_RIVERS_SOURCE, {
    type: 'geojson',
    data,
    promoteId: 'id',
  })

  map.addLayer({
    id: MAJOR_RIVERS_HIT_LAYER,
    type: 'circle',
    source: MAJOR_RIVERS_SOURCE,
    paint: {
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        5,
        10,
        8,
        12,
        12,
        14,
      ],
      'circle-opacity': 0,
      'circle-color': '#000',
    },
  })

  map.addLayer({
    id: MAJOR_RIVERS_LAYER,
    type: 'circle',
    source: MAJOR_RIVERS_SOURCE,
    paint: {
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        5,
        4.5,
        8,
        5.5,
        11,
        6.5,
        14,
        7.5,
      ],
      'circle-color': [
        'match',
        ['get', 'level'],
        'high',
        '#2f8f5b',
        'medium',
        '#d4a017',
        'low',
        '#c24b3d',
        '#5b7c8a',
      ],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
      'circle-opacity': 0.95,
    },
  })

  map.addLayer({
    id: MAJOR_RIVERS_SELECTED_LAYER,
    type: 'circle',
    source: MAJOR_RIVERS_SOURCE,
    filter: ['==', ['get', 'id'], ''],
    paint: {
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        5,
        7,
        11,
        9,
        14,
        11,
      ],
      'circle-color': 'transparent',
      'circle-stroke-width': 3,
      'circle-stroke-color': '#111111',
      'circle-opacity': 1,
    },
  })
}

export function setSelectedMajorRiverMarker(map, riverId) {
  if (!map?.getLayer(MAJOR_RIVERS_SELECTED_LAYER)) return
  map.setFilter(MAJOR_RIVERS_SELECTED_LAYER, [
    '==',
    ['get', 'id'],
    riverId || '',
  ])
}

export function propsFromMajorRiverFeature(feature) {
  const p = feature?.properties || {}
  const coords = feature?.geometry?.coordinates || []
  return {
    id: p.featureId || p.id,
    featureId: p.featureId || p.id,
    markerId: p.id,
    name: p.name || '',
    nameAlt: p.nameAlt || '',
    form: p.form || '',
    formLabel: p.formLabel || 'River / stream',
    lengthM: Number(p.lengthM) || null,
    flow: p.flow || '',
    lat: Number(coords[1]),
    lng: Number(coords[0]),
    source: 'OS Open Rivers',
    dataCoverage: {
      level: p.level || 'pending',
      label: p.coverageLabel || '',
      stationCount: Number(p.stationCount) || 0,
    },
  }
}
