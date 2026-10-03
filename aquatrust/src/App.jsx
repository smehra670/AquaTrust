import { useEffect, useMemo, useRef, useState } from 'react'
import { Map, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'

import Header from './components/Header'
import MapLegend from './components/MapLegend'
import SummaryStrip from './components/SummaryStrip'
import EvidencePanel from './components/EvidencePanel'
import HowAquaTrustWorks from './components/HowAquaTrustWorks'
import AddReadingModal from './components/AddReadingModal'
import HomePage from './components/HomePage'
import GraphsPage from './components/GraphsPage'
import AuthPage from './components/AuthPage'
import MyReadingsPage from './components/MyReadingsPage'
import { OBSERVATIONS, TRUST_LEVELS } from './data/observations'
import { enrichObservations } from './utils/trustEngine'
import {
  createCitizenReading,
} from './utils/createReading'
import { assessCitizenReading } from './utils/readingAuditor'
import { buildRiverAuditContext } from './utils/riverAuditContext'
import { getSession, logOut } from './utils/auth'
import {
  deleteUserReading,
  loadAllUserReadings,
  saveUserReading,
} from './utils/readingStore'
import {
  DATA_LEVELS,
  mapPool,
  scoreRiverDataCoverage,
} from './utils/riverDataCoverage'
import {
  findNearbySamplingPoints,
  getObservationsForSamplingPoint,
  selectChartSeries,
} from './services/environmentAgency'
import { warmPlaceImageCache } from './services/placeImages'
import { evaluateVerification } from './utils/verifyMe'
import {
  isDirectMonitoring,
  scoreStationRelation,
} from './utils/watercourses'
import {
  addWatercourseLayers,
  propsFromWatercourseFeature,
  RIVERS_HIT_LAYER,
  RIVERS_LAYER,
  setHoveredWatercourse,
  setSelectedWatercourse,
} from './map/watercourseLayers'
import {
  MAJOR_RIVERS_HIT_LAYER,
  MAJOR_RIVERS_LAYER,
  propsFromMajorRiverFeature,
  setSelectedMajorRiverMarker,
  syncMajorRiverMarkers,
} from './map/majorRiverMarkers'
import './App.css'

setWorkerUrl(workerUrl)

/** Prefetch Wikimedia photos for demo river/canal markers. */
warmPlaceImageCache(
  OBSERVATIONS.map((item) => ({
    placeName: item.siteName,
    lat: item.lat,
    lng: item.lng,
  }))
)

const LONDON_CENTER = { lat: 51.5072, lng: -0.1276 }
const OFFICIAL_SEARCH_RADIUS_KM = 12
const MAX_OFFICIAL_MARKERS = 28

function App() {
  const mapContainer = useRef(null)
  const mapRef = useRef(null)
  const clickMarkerRef = useRef(null)
  const searchRequestId = useRef(0)
  const officialSearchId = useRef(0)
  const moveTimerRef = useRef(null)

  const [rawObservations, setRawObservations] = useState(() => [
    ...OBSERVATIONS,
    ...loadAllUserReadings(),
  ])
  const [addReadingOpen, setAddReadingOpen] = useState(false)
  const [activeView, setActiveView] = useState('home')
  const [user, setUser] = useState(() => getSession())
  const [authIntent, setAuthIntent] = useState(null)

  const enrichedObservations = useMemo(
    () => enrichObservations(rawObservations),
    [rawObservations]
  )

  const [mapReady, setMapReady] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [visibleLevels, setVisibleLevels] = useState(() => [...TRUST_LEVELS])
  const [verificationRequestedIds, setVerificationRequestedIds] = useState([])
  const [verificationResults, setVerificationResults] = useState({})
  const [issueMissions, setIssueMissions] = useState({})

  const [clickedLocation, setClickedLocation] = useState(null)
  const [nearbyStations, setNearbyStations] = useState([])
  const [stationsLoading, setStationsLoading] = useState(false)
  const [stationsError, setStationsError] = useState(null)

  const [officialStations, setOfficialStations] = useState([])
  const [officialStationsError, setOfficialStationsError] = useState(null)
  const [selectedOfficialId, setSelectedOfficialId] = useState(null)
  const [officialObservations, setOfficialObservations] = useState([])
  const [officialLoading, setOfficialLoading] = useState(false)
  const [officialError, setOfficialError] = useState(null)
  const [selectedWatercourse, setSelectedWatercourseState] = useState(null)
  const [riversError, setRiversError] = useState(null)
  const [majorRivers, setMajorRivers] = useState([])
  /** Official EA data-coverage levels for major river markers (green/yellow/red). */
  const [riverCoverageById, setRiverCoverageById] = useState({})
  /** Real EA monitoring attached to a selected watercourse (never invented). */
  const [wcStations, setWcStations] = useState([])
  const [wcPrimaryStation, setWcPrimaryStation] = useState(null)
  const [wcObservations, setWcObservations] = useState([])
  const [wcMonitoringLoading, setWcMonitoringLoading] = useState(false)
  const [wcMonitoringError, setWcMonitoringError] = useState(null)
  const watercourseRequestId = useRef(0)

  const wcChartSeries = useMemo(
    () => selectChartSeries(wcObservations, 7),
    [wcObservations]
  )

  const watercourseCoverage = useMemo(() => {
    if (!selectedWatercourse) return null
    if (wcMonitoringLoading) {
      return (
        selectedWatercourse.dataCoverage || {
          level: 'pending',
          label: DATA_LEVELS.pending.label,
          color: DATA_LEVELS.pending.color,
          score: 0,
          stationCount: 0,
          reasons: ['Checking Environment Agency sites…'],
        }
      )
    }
    return scoreRiverDataCoverage(selectedWatercourse, wcStations)
  }, [selectedWatercourse, wcStations, wcMonitoringLoading])

  const selectedObservation = useMemo(
    () => enrichedObservations.find((item) => item.id === selectedId) ?? null,
    [selectedId, enrichedObservations]
  )

  const selectedOfficialStation = useMemo(
    () =>
      officialStations.find((item) => item.id === selectedOfficialId) ??
      nearbyStations.find((item) => item.id === selectedOfficialId) ??
      null,
    [officialStations, nearbyStations, selectedOfficialId]
  )

  const officialChartSeries = useMemo(
    () => selectChartSeries(officialObservations, 7),
    [officialObservations]
  )

  const visibleObservations = useMemo(
    () =>
      enrichedObservations.filter((item) => {
        const confirmed = verificationResults[item.id]?.status === 'confirmed'
        if (confirmed) {
          if (visibleLevels.length === 3) return true
          if (visibleLevels.length === 1 && visibleLevels[0] === 'medium') {
            return false
          }
          return visibleLevels.includes('high')
        }
        return visibleLevels.includes(item.trustLevel)
      }),
    [visibleLevels, verificationResults, enrichedObservations]
  )

  function toggleFilter(level) {
    if (level === 'all') {
      setVisibleLevels([...TRUST_LEVELS])
      return
    }

    setVisibleLevels((current) => {
      if (current.length === TRUST_LEVELS.length) {
        return [level]
      }

      const next = current.includes(level)
        ? current.filter((item) => item !== level)
        : [...current, level]

      return next.length === 0 ? current : next
    })
  }

  function requestVerification(observationId) {
    setVerificationRequestedIds((current) =>
      current.includes(observationId) ? current : [...current, observationId]
    )
  }

  function createIssueMission(observationId, issue) {
    if (!observationId || !issue?.verificationMission) return
    setIssueMissions((current) => ({
      ...current,
      [observationId]: {
        issueId: issue.id,
        issueType: issue.issueType,
        ...issue.verificationMission,
      },
    }))
    requestVerification(observationId)
  }

  function submitCitizenVerification(observationId, values) {
    const observation = rawObservations.find(
      (item) => item.id === observationId
    )
    if (!observation) return

    const result = evaluateVerification(observation, values)
    setVerificationResults((current) => ({
      ...current,
      [observationId]: {
        ...result,
        turbidity: values.turbidity,
        temperature: values.temperature,
      },
    }))
  }

  function openAddReading() {
    if (!user) {
      setAuthIntent('add-reading')
      setActiveView('auth')
      return
    }
    setAddReadingOpen(true)
  }

  function openSignIn(intent = null) {
    setAuthIntent(intent)
    setActiveView('auth')
  }

  function handleAuthenticated(session) {
    setUser(session)
    if (authIntent === 'add-reading') {
      setAuthIntent(null)
      setActiveView('map')
      setAddReadingOpen(true)
      requestAnimationFrame(() => mapRef.current?.resize())
      return
    }
    setAuthIntent(null)
    setActiveView(authIntent === 'my-readings' ? 'my-readings' : 'map')
    requestAnimationFrame(() => mapRef.current?.resize())
  }

  function handleSignOut() {
    logOut()
    setUser(null)
    setAddReadingOpen(false)
    if (activeView === 'my-readings' || activeView === 'auth') {
      setActiveView('home')
    }
  }

  function navigateTo(view) {
    if (view === 'my-readings' && !user) {
      openSignIn('my-readings')
      return
    }
    setActiveView(view)
    if (view === 'map') {
      requestAnimationFrame(() => mapRef.current?.resize())
    }
  }

  function flyToReading(reading) {
    const map = mapRef.current
    if (!map || !Number.isFinite(reading?.lng) || !Number.isFinite(reading?.lat)) {
      return
    }
    map.flyTo({
      center: [reading.lng, reading.lat],
      zoom: Math.max(map.getZoom(), 12),
      essential: true,
    })
  }

  function handleAddReading(formValues) {
    if (!user) {
      openSignIn('add-reading')
      return null
    }
    const created = createCitizenReading(
      { ...formValues, ownerId: user.userId },
      rawObservations
    )
    const riverContext = buildRiverAuditContext({
      lat: created.lat,
      lng: created.lng,
      siteName: created.siteName,
      peers: rawObservations,
      majorRivers,
    })
    if (riverContext.localBaseline) {
      created.historicalBaseline = {
        ...created.historicalBaseline,
        ...riverContext.localBaseline,
      }
      created.baselineSource = riverContext.localBaseline.source
      created.baselinePeerCount = riverContext.localBaseline.peerCount
      created.matchedRiverName = riverContext.riverName
    }
    const aiAssessment = assessCitizenReading(
      created,
      rawObservations,
      formValues.imageAssessment || null,
      riverContext
    )
    const withAi = {
      ...created,
      aiAssessment,
      ownerId: user.userId,
      ownerName: user.name,
      ownerEmail: user.email,
      photoName: formValues.photoName || '',
      hasPhoto: Boolean(formValues.hasPhoto),
      photoQuality:
        formValues.photoQuality ?? created.photoQuality,
      matchedRiverName: riverContext.riverName || null,
    }
    saveUserReading(withAi)
    setRawObservations((current) => [...current, withAi])
    setActiveView('map')
    setSelectedOfficialId(null)
    setSelectedWatercourseState(null)
    setClickedLocation(null)
    setNearbyStations([])
    clearClickPin()
    const map = mapRef.current
    if (map) setSelectedWatercourse(map, null)
    setSelectedId(withAi.id)
    setVerificationRequestedIds((current) =>
      current.includes(withAi.id) ? current : [...current, withAi.id]
    )
    // Ensure all trust filters show the new marker
    setVisibleLevels([...TRUST_LEVELS])
    warmPlaceImageCache([
      {
        placeName: withAi.siteName,
        lat: withAi.lat,
        lng: withAi.lng,
      },
    ])
    requestAnimationFrame(() => {
      mapRef.current?.resize()
      flyToReading(withAi)
    })
    return { reading: withAi, aiAssessment }
  }

  function handleDeleteReading(readingId) {
    if (!user) return
    deleteUserReading(readingId, user.userId)
    setRawObservations((current) =>
      current.filter(
        (row) => !(row.id === readingId && row.ownerId === user.userId)
      )
    )
    if (selectedId === readingId) setSelectedId(null)
  }

  function handleOpenMyReading(readingId) {
    setSelectedOfficialId(null)
    setSelectedWatercourseState(null)
    setClickedLocation(null)
    setNearbyStations([])
    clearClickPin()
    const map = mapRef.current
    if (map) setSelectedWatercourse(map, null)
    setSelectedId(readingId)
    setVisibleLevels([...TRUST_LEVELS])
    setActiveView('map')
    const reading = rawObservations.find((row) => row.id === readingId)
    requestAnimationFrame(() => {
      mapRef.current?.resize()
      if (reading) flyToReading(reading)
    })
  }

  const myReadings = useMemo(
    () =>
      enrichedObservations
        .filter((row) => user && row.ownerId === user.userId)
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
    [enrichedObservations, user]
  )

  const addReadingDefaults = useMemo(() => {
    if (selectedWatercourse) {
      return {
        siteName: selectedWatercourse.name || '',
        lat: selectedWatercourse.lat,
        lng: selectedWatercourse.lng,
      }
    }
    if (selectedObservation) {
      return {
        siteName: selectedObservation.siteName,
        lat: selectedObservation.lat,
        lng: selectedObservation.lng,
      }
    }
    if (clickedLocation) {
      return {
        siteName: '',
        lat: clickedLocation.lat,
        lng: clickedLocation.lng,
      }
    }
    return {
      siteName: '',
      lat: LONDON_CENTER.lat,
      lng: LONDON_CENTER.lng,
    }
  }, [selectedWatercourse, selectedObservation, clickedLocation])

  function clearClickPin() {
    if (clickMarkerRef.current) {
      clickMarkerRef.current.remove()
      clickMarkerRef.current = null
    }
  }

  function clearMapSelection() {
    setSelectedId(null)
    setSelectedOfficialId(null)
    setOfficialObservations([])
    setOfficialError(null)
    setOfficialLoading(false)
    setSelectedWatercourseState(null)
    setWcStations([])
    setWcPrimaryStation(null)
    setWcObservations([])
    setWcMonitoringLoading(false)
    setWcMonitoringError(null)
    setClickedLocation(null)
    setNearbyStations([])
    setStationsLoading(false)
    setStationsError(null)
    clearClickPin()
    const map = mapRef.current
    if (map) {
      setSelectedWatercourse(map, null)
      setSelectedMajorRiverMarker(map, null)
    }
  }

  async function loadOfficialStations(lat, lng, radiusKm = OFFICIAL_SEARCH_RADIUS_KM) {
    const requestId = ++officialSearchId.current
    try {
      const points = await findNearbySamplingPoints(lat, lng, radiusKm)
      if (requestId !== officialSearchId.current) return
      // Prefer open freshwater-ish sites, but keep a broad London set
      const ranked = [...points].sort((a, b) => {
        const aOpen = a.status === 'OPEN' ? 0 : 1
        const bOpen = b.status === 'OPEN' ? 0 : 1
        if (aOpen !== bOpen) return aOpen - bOpen
        return a.distanceKm - b.distanceKm
      })

      const freshwater = ranked.filter((point) => {
        const type = String(point.type || '').toUpperCase()
        if (type.includes('TRADE') || type.includes('SEWAGE')) return false
        return (
          type.includes('FRESHWATER') ||
          type.includes('RIVER') ||
          type.includes('CANAL') ||
          type.includes('LAKE') ||
          type.includes('POND') ||
          type.includes('UNSPECIFIED') ||
          type.length === 0
        )
      })

      const pool = freshwater.length >= 8 ? freshwater : ranked
      setOfficialStations(pool.slice(0, MAX_OFFICIAL_MARKERS))
      setOfficialStationsError(null)
    } catch (error) {
      if (requestId !== officialSearchId.current) return
      console.error('[EA] official station load failed', error)
      setOfficialStationsError('Official station layer is temporarily unavailable.')
    }
  }

  async function selectWatercourse(watercourse) {
    if (!watercourse) return
    setSelectedId(null)
    setSelectedOfficialId(null)
    setOfficialObservations([])
    setOfficialError(null)
    setClickedLocation(null)
    setNearbyStations([])
    setStationsLoading(false)
    setStationsError(null)
    clearClickPin()
    setSelectedWatercourseState(watercourse)
    const map = mapRef.current
    if (map) {
      setSelectedWatercourse(map, watercourse.featureId || watercourse.id)
    }

    const requestId = ++watercourseRequestId.current
    setWcMonitoringLoading(true)
    setWcMonitoringError(null)
    setWcStations([])
    setWcPrimaryStation(null)
    setWcObservations([])

    if (!Number.isFinite(watercourse.lat) || !Number.isFinite(watercourse.lng)) {
      setWcMonitoringLoading(false)
      setWcMonitoringError('No coordinates available for this watercourse click.')
      return
    }

    try {
      const points = await findNearbySamplingPoints(
        watercourse.lat,
        watercourse.lng,
        12
      )
      if (requestId !== watercourseRequestId.current) return

      const scored = points
        .map((station) => {
          const relation = scoreStationRelation(station, watercourse)
          return {
            ...station,
            relationScore: relation.score,
            relationReasons: relation.reasons,
            monitoringLabel: isDirectMonitoring(relation.score)
              ? 'DIRECT MONITORING'
              : 'NEAREST OFFICIAL MONITORING',
          }
        })
        .sort((a, b) => {
          if (b.relationScore !== a.relationScore) {
            return b.relationScore - a.relationScore
          }
          return a.distanceKm - b.distanceKm
        })

      const nearest = scored.slice(0, 5)
      setWcStations(nearest)

      const primary = nearest[0] || null
      setWcPrimaryStation(primary)

      if (!primary) {
        setWcMonitoringLoading(false)
        return
      }

      const rows = await getObservationsForSamplingPoint(primary.id, {
        dateFrom: '2015-01-01',
        dateTo: new Date().toISOString().slice(0, 10),
        maxPages: 12,
      })
      if (requestId !== watercourseRequestId.current) return
      setWcObservations(rows)
      setWcMonitoringLoading(false)
    } catch (error) {
      if (requestId !== watercourseRequestId.current) return
      console.error('[EA] watercourse monitoring failed', error)
      setWcMonitoringError(
        'Official monitoring data is temporarily unavailable.'
      )
      setWcMonitoringLoading(false)
    }
  }

  function selectOfficialStation(station) {
    if (!station) return
    setSelectedId(null)
    setSelectedWatercourseState(null)
    setWcStations([])
    setWcPrimaryStation(null)
    setWcObservations([])
    setWcMonitoringLoading(false)
    setWcMonitoringError(null)
    setClickedLocation(null)
    setNearbyStations([])
    setStationsLoading(false)
    setStationsError(null)
    clearClickPin()
    setSelectedOfficialId(station.id)
    const map = mapRef.current
    if (map) {
      setSelectedWatercourse(map, null)
      setSelectedMajorRiverMarker(map, null)
    }
  }

  async function selectWatercourseStation(station) {
    if (!station || !selectedWatercourse) return
    const requestId = ++watercourseRequestId.current
    setWcPrimaryStation(station)
    setWcMonitoringLoading(true)
    setWcMonitoringError(null)
    setWcObservations([])
    try {
      const rows = await getObservationsForSamplingPoint(station.id, {
        dateFrom: '2015-01-01',
        dateTo: new Date().toISOString().slice(0, 10),
        maxPages: 12,
      })
      if (requestId !== watercourseRequestId.current) return
      setWcObservations(rows)
      setWcMonitoringLoading(false)
    } catch (error) {
      if (requestId !== watercourseRequestId.current) return
      console.error('[EA] watercourse station switch failed', error)
      setWcMonitoringError(
        'Official monitoring data is temporarily unavailable.'
      )
      setWcMonitoringLoading(false)
    }
  }

  useEffect(() => {
    const container = mapContainer.current
    if (!container) return undefined

    const map = new Map({
      container,
      center: [-1.5, 52.4],
      zoom: 6.4,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
          },
        ],
      },
    })

    map.addControl(new NavigationControl(), 'top-right')
    map.once('load', () => {
      map.resize()
    })

    mapRef.current = map
    setMapReady(true)

    return () => {
      if (moveTimerRef.current) {
        clearTimeout(moveTimerRef.current)
      }
      clearClickPin()
      map.remove()
      mapRef.current = null
      setMapReady(false)
    }
  }, [])

  // Load OS Open Rivers overview geometry
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return undefined

    let cancelled = false

    async function loadRivers() {
      try {
        const result = await addWatercourseLayers(map)
        if (!cancelled) {
          setRiversError(null)
          setMajorRivers(result?.majorRivers || [])
        }
      } catch (error) {
        console.error('[OS Rivers] load failed', error)
        if (!cancelled) {
          setRiversError('OS Open Rivers layer could not be loaded.')
        }
      }
    }

    if (map.isStyleLoaded()) {
      loadRivers()
    } else {
      map.once('load', loadRivers)
    }

    return () => {
      cancelled = true
    }
  }, [mapReady])

  // Score every major river by real nearby EA monitoring (factual coverage only)
  useEffect(() => {
    if (majorRivers.length === 0) return undefined
    let cancelled = false

    async function scoreAll() {
      const pending = {}
      for (const river of majorRivers) {
        pending[river.id] = {
          level: 'pending',
          label: DATA_LEVELS.pending.label,
          color: DATA_LEVELS.pending.color,
          score: 0,
          stationCount: 0,
          reasons: ['Checking Environment Agency sites…'],
        }
      }
      setRiverCoverageById(pending)

      const results = await mapPool(majorRivers, 5, async (river) => {
        if (cancelled) return null
        if (!Number.isFinite(river.lat) || !Number.isFinite(river.lng)) {
          return {
            id: river.id,
            coverage: scoreRiverDataCoverage(river, []),
          }
        }
        try {
          const stations = await findNearbySamplingPoints(
            river.lat,
            river.lng,
            8
          )
          if (cancelled) return null
          return {
            id: river.id,
            coverage: scoreRiverDataCoverage(river, stations),
          }
        } catch (error) {
          console.error('[EA] river coverage failed', river.name, error)
          return {
            id: river.id,
            coverage: {
              ...scoreRiverDataCoverage(river, []),
              reasons: [
                'Official monitoring lookup temporarily unavailable for this river',
              ],
            },
          }
        }
      })

      if (cancelled) return
      const next = {}
      for (const row of results) {
        if (row?.id) next[row.id] = row.coverage
      }
      setRiverCoverageById(next)
    }

    scoreAll()
    return () => {
      cancelled = true
    }
  }, [majorRivers])

  // Watercourse hover + click
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return undefined

    function onMove(event) {
      if (!map.getLayer(RIVERS_HIT_LAYER)) return
      const hits = map.queryRenderedFeatures(event.point, {
        layers: [RIVERS_HIT_LAYER, RIVERS_LAYER],
      })
      const id = hits[0]?.properties?.id || ''
      setHoveredWatercourse(map, id)
      map.getCanvas().style.cursor = id ? 'pointer' : ''
    }

    function onLeave() {
      setHoveredWatercourse(map, null)
      map.getCanvas().style.cursor = ''
    }

    map.on('mousemove', onMove)
    map.on('mouseleave', RIVERS_HIT_LAYER, onLeave)
    map.on('mouseleave', RIVERS_LAYER, onLeave)

    return () => {
      map.off('mousemove', onMove)
      map.off('mouseleave', RIVERS_HIT_LAYER, onLeave)
      map.off('mouseleave', RIVERS_LAYER, onLeave)
    }
  }, [mapReady])

  // Initial London official stations + refresh when the map pans (debounced)
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return undefined

    loadOfficialStations(LONDON_CENTER.lat, LONDON_CENTER.lng)

    function scheduleReload() {
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
      moveTimerRef.current = setTimeout(() => {
        const center = map.getCenter()
        const zoom = map.getZoom()
        // Wider view → larger radius, but keep calls bounded for London/demo use
        const radius = zoom < 9 ? 18 : zoom < 11 ? 12 : 8
        loadOfficialStations(center.lat, center.lng, radius)
      }, 650)
    }

    map.on('moveend', scheduleReload)
    return () => {
      map.off('moveend', scheduleReload)
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
    }
  }, [mapReady])

  // Load real observations when an official station is selected
  useEffect(() => {
    if (!selectedOfficialId) {
      setOfficialObservations([])
      setOfficialError(null)
      setOfficialLoading(false)
      return undefined
    }

    let cancelled = false
    setOfficialLoading(true)
    setOfficialError(null)

    getObservationsForSamplingPoint(selectedOfficialId, {
      dateFrom: '2018-01-01',
      dateTo: new Date().toISOString().slice(0, 10),
    })
      .then((rows) => {
        if (cancelled) return
        setOfficialObservations(rows)
        setOfficialLoading(false)
      })
      .catch((error) => {
        if (cancelled) return
        console.error('[EA] observations failed', error)
        setOfficialObservations([])
        setOfficialError('Official observations are temporarily unavailable.')
        setOfficialLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedOfficialId])

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return undefined

    async function handleMapClick(event) {
      const { lng, lat } = event.lngLat

      // Prefer named river markers, then OS Open Rivers lines
      if (map.getLayer(MAJOR_RIVERS_HIT_LAYER) || map.getLayer(MAJOR_RIVERS_LAYER)) {
        const majorLayers = [MAJOR_RIVERS_HIT_LAYER, MAJOR_RIVERS_LAYER].filter(
          (id) => map.getLayer(id)
        )
        const majorHits = map.queryRenderedFeatures(event.point, {
          layers: majorLayers,
        })
        if (majorHits.length > 0) {
          selectWatercourse(propsFromMajorRiverFeature(majorHits[0]))
          return
        }
      }

      if (map.getLayer(RIVERS_HIT_LAYER) || map.getLayer(RIVERS_LAYER)) {
        const layers = [RIVERS_HIT_LAYER, RIVERS_LAYER].filter((id) =>
          map.getLayer(id)
        )
        const hits = map.queryRenderedFeatures(event.point, { layers })
        if (hits.length > 0) {
          const watercourse = propsFromWatercourseFeature(hits[0], {
            lat,
            lng,
          })
          selectWatercourse(watercourse)
          return
        }
      }

      setSelectedId(null)
      setSelectedOfficialId(null)
      setOfficialObservations([])
      setOfficialError(null)
      setSelectedWatercourseState(null)
      setSelectedWatercourse(map, null)
      setSelectedMajorRiverMarker(map, null)
      setClickedLocation({ lat, lng })
      setNearbyStations([])
      setStationsError(null)
      setStationsLoading(true)

      clearClickPin()

      const pin = document.createElement('div')
      pin.className = 'click-location-marker'
      pin.setAttribute('aria-hidden', 'true')
      clickMarkerRef.current = new Marker({ element: pin, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(map)

      const requestId = ++searchRequestId.current

      try {
        const points = await findNearbySamplingPoints(lat, lng, 5)
        if (requestId !== searchRequestId.current) return
        setNearbyStations(points.slice(0, 5))
      } catch (error) {
        if (requestId !== searchRequestId.current) return
        console.error('[EA] sampling-point search failed', error)
        setStationsError('Official data is temporarily unavailable.')
        setNearbyStations([])
      } finally {
        if (requestId === searchRequestId.current) {
          setStationsLoading(false)
        }
      }
    }

    map.on('click', handleMapClick)
    return () => {
      map.off('click', handleMapClick)
    }
  }, [mapReady])

  // Major named river markers as MapLibre circles (all rivers, same size)
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map || majorRivers.length === 0) return undefined

    syncMajorRiverMarkers(map, majorRivers, riverCoverageById)
    setSelectedMajorRiverMarker(
      map,
      selectedWatercourse?.markerId ||
        (selectedWatercourse
          ? majorRivers.find(
              (river) =>
                river.featureId === selectedWatercourse.featureId ||
                river.name === selectedWatercourse.name
            )?.id
          : null)
    )

    function onEnter() {
      map.getCanvas().style.cursor = 'pointer'
    }
    function onLeave() {
      map.getCanvas().style.cursor = ''
    }
    function onClick(event) {
      const feature = event.features?.[0]
      if (!feature) return
      event.originalEvent?.stopPropagation?.()
      selectWatercourse(propsFromMajorRiverFeature(feature))
    }

    map.on('mouseenter', MAJOR_RIVERS_HIT_LAYER, onEnter)
    map.on('mouseleave', MAJOR_RIVERS_HIT_LAYER, onLeave)
    map.on('click', MAJOR_RIVERS_HIT_LAYER, onClick)
    map.on('click', MAJOR_RIVERS_LAYER, onClick)

    return () => {
      map.off('mouseenter', MAJOR_RIVERS_HIT_LAYER, onEnter)
      map.off('mouseleave', MAJOR_RIVERS_HIT_LAYER, onLeave)
      map.off('click', MAJOR_RIVERS_HIT_LAYER, onClick)
      map.off('click', MAJOR_RIVERS_LAYER, onClick)
    }
  }, [mapReady, majorRivers, selectedWatercourse, riverCoverageById])

  // Citizen observation markers
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return undefined

    const markers = visibleObservations.map((observation) => {
      const element = document.createElement('button')
      element.type = 'button'
      const verified =
        verificationResults[observation.id]?.status === 'confirmed'
      element.className = `trust-marker trust-marker--${observation.trustLevel}`
      if (verified) element.classList.add('is-verified')
      if (observation.id === selectedId) {
        element.classList.add('is-selected')
        element.style.zIndex = '4'
      }
      if (verificationRequestedIds.includes(observation.id)) {
        element.classList.add('has-verification')
      }
      element.setAttribute(
        'aria-label',
        `${observation.siteName}, ${
          verified ? 'Verified' : observation.trustLabel
        }, score ${observation.overallScore}`
      )
      element.addEventListener('click', (event) => {
        event.stopPropagation()
        setSelectedOfficialId(null)
        setOfficialObservations([])
        setOfficialError(null)
        setSelectedWatercourseState(null)
        setWcStations([])
        setWcPrimaryStation(null)
        setWcObservations([])
        setWcMonitoringLoading(false)
        setWcMonitoringError(null)
        setClickedLocation(null)
        setNearbyStations([])
        setStationsLoading(false)
        setStationsError(null)
        clearClickPin()
        const map = mapRef.current
        if (map) setSelectedWatercourse(map, null)
        setSelectedId(observation.id)
      })

      return new Marker({ element, anchor: 'center' })
        .setLngLat([observation.lng, observation.lat])
        .addTo(map)
    })

    return () => {
      markers.forEach((marker) => marker.remove())
    }
  }, [
    mapReady,
    visibleObservations,
    selectedId,
    verificationRequestedIds,
    verificationResults,
  ])

  // Official EA station markers (teal squares)
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return undefined

    const markers = officialStations.map((station) => {
      const element = document.createElement('button')
      element.type = 'button'
      element.className = 'ea-marker'
      if (station.status && station.status !== 'OPEN') {
        element.classList.add('is-closed')
      }
      if (station.id === selectedOfficialId) {
        element.classList.add('is-selected')
        element.style.zIndex = '5'
      }
      element.title = `${station.name} (Environment Agency)`
      element.setAttribute(
        'aria-label',
        `Official monitoring site ${station.name}`
      )
      element.addEventListener('click', (event) => {
        event.stopPropagation()
        selectOfficialStation(station)
      })

      return new Marker({ element, anchor: 'center' })
        .setLngLat([station.lng, station.lat])
        .addTo(map)
    })

    return () => {
      markers.forEach((marker) => marker.remove())
    }
  }, [mapReady, officialStations, selectedOfficialId])

  useEffect(() => {
    if (!selectedObservation) return
    if (!visibleLevels.includes(selectedObservation.trustLevel)) {
      setSelectedId(null)
    }
  }, [selectedObservation, visibleLevels])

  const panelKey = selectedWatercourse
    ? `wc-${selectedWatercourse.id}-${selectedWatercourse.lat}-${selectedWatercourse.lng}`
    : selectedOfficialStation
      ? `ea-${selectedOfficialStation.id}`
      : selectedObservation
        ? `obs-${selectedObservation.id}`
        : clickedLocation
          ? `loc-${clickedLocation.lat}-${clickedLocation.lng}`
          : 'empty'

  useEffect(() => {
    if (activeView !== 'map') return
    const map = mapRef.current
    const timer = requestAnimationFrame(() => {
      map?.resize()
      if (map && majorRivers.length > 0) {
        syncMajorRiverMarkers(map, majorRivers, riverCoverageById)
      }
    })
    return () => cancelAnimationFrame(timer)
  }, [activeView, majorRivers, riverCoverageById])

  const isLanding =
    activeView === 'home' || activeView === 'about' || activeView === 'auth'

  return (
    <div className={`app${isLanding ? ' app--landing' : ''}`}>
      <Header
        activeView={activeView}
        onNavigate={navigateTo}
        onAddReading={openAddReading}
        user={user}
        onSignIn={() => openSignIn()}
        onSignOut={handleSignOut}
      />

      {activeView === 'home' || activeView === 'about' ? (
        <HomePage
          showAbout={activeView === 'about'}
          onExplore={() => navigateTo('map')}
          onAddReading={openAddReading}
          onGraphs={() => navigateTo('graphs')}
          onCloseAbout={() => navigateTo('home')}
        />
      ) : null}

      {activeView === 'auth' ? (
        <AuthPage
          onAuthenticated={handleAuthenticated}
          onCancel={() => setActiveView('home')}
        />
      ) : null}

      {activeView === 'my-readings' ? (
        <MyReadingsPage
          user={user}
          readings={myReadings}
          onAddReading={openAddReading}
          onOpenReading={handleOpenMyReading}
          onDeleteReading={handleDeleteReading}
          onSignIn={() => openSignIn('my-readings')}
        />
      ) : null}

      {activeView === 'graphs' ? (
        <GraphsPage
          majorRivers={majorRivers}
          observations={enrichedObservations}
          onExplore={() => navigateTo('map')}
          onAddReading={openAddReading}
        />
      ) : null}

      <div className={`workspace${activeView !== 'map' ? ' is-hidden' : ''}`}>
        <div className="map-stage">
          <div ref={mapContainer} className="map" />
          <MapLegend
            visibleLevels={visibleLevels}
            onToggleFilter={toggleFilter}
            officialStationsError={officialStationsError || riversError}
          />
          <HowAquaTrustWorks />
          <SummaryStrip observations={enrichedObservations} />
        </div>

        <EvidencePanel
          key={panelKey}
          observation={selectedObservation}
          officialStation={selectedOfficialStation}
          selectedWatercourse={selectedWatercourse}
          watercourseCoverage={watercourseCoverage}
          watercourseStations={wcStations}
          watercoursePrimaryStation={wcPrimaryStation}
          watercourseChartSeries={wcChartSeries}
          watercourseObservationsCount={wcObservations.length}
          watercourseMonitoringLoading={wcMonitoringLoading}
          watercourseMonitoringError={wcMonitoringError}
          onSelectWatercourseStation={selectWatercourseStation}
          officialChartSeries={officialChartSeries}
          officialObservationsCount={officialObservations.length}
          officialLoading={officialLoading}
          officialError={officialError}
          officialStations={officialStations}
          clickedLocation={clickedLocation}
          nearbyStations={nearbyStations}
          stationsLoading={stationsLoading}
          stationsError={stationsError}
          citizenObservations={enrichedObservations}
          verificationRequested={
            selectedObservation
              ? verificationRequestedIds.includes(selectedObservation.id)
              : false
          }
          verificationResult={
            selectedObservation
              ? verificationResults[selectedObservation.id] || null
              : null
          }
          issueMission={
            selectedObservation
              ? issueMissions[selectedObservation.id] || null
              : null
          }
          onSelectOfficialStation={selectOfficialStation}
          onRequestVerification={() => {
            if (selectedObservation) {
              requestVerification(selectedObservation.id)
            }
          }}
          onCreateIssueMission={(issue) => {
            if (selectedObservation) {
              createIssueMission(selectedObservation.id, issue)
            }
          }}
          onSubmitVerification={(values) => {
            if (selectedObservation) {
              submitCitizenVerification(selectedObservation.id, values)
            }
          }}
          onClose={clearMapSelection}
        />
      </div>

      <AddReadingModal
        open={addReadingOpen}
        onClose={() => setAddReadingOpen(false)}
        onSubmit={handleAddReading}
        defaults={addReadingDefaults}
        user={user}
      />
    </div>
  )
}

export default App
