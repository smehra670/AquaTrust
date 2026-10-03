import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { extractMajorRiverMarkers } from '../utils/majorRivers'
import {
  GRAPH_FACTORS,
  loadSingleRiverOfficialSeries,
  monthlySeries,
  PRIORITY_GRAPH_RIVERS,
} from '../utils/riverGraphData'
import { buildTrendForecast } from '../utils/trendForecast'
import { selectChartSeries } from '../services/environmentAgency'

const LINE_COLORS = [
  '#111111',
  '#4a5560',
  '#8a5a2b',
  '#2f6f78',
  '#5b6b4a',
  '#6b4f7a',
]

const RANGE_OPTIONS = [
  { id: '1y', label: '1 year' },
  { id: '5y', label: '5 years' },
  { id: 'all', label: 'All' },
]

function shortName(name) {
  return String(name || '')
    .replace(/^River\s+/i, '')
    .replace(/^Afon\s+/i, '')
}

function sortForGraphs(list) {
  const priority = new Map(
    PRIORITY_GRAPH_RIVERS.map((name, index) => [name.toLowerCase(), index])
  )
  return [...list].sort((a, b) => {
    const ap = priority.has(a.name?.toLowerCase())
      ? priority.get(a.name.toLowerCase())
      : 999
    const bp = priority.has(b.name?.toLowerCase())
      ? priority.get(b.name.toLowerCase())
      : 999
    if (ap !== bp) return ap - bp
    return (b.lengthM || 0) - (a.lengthM || 0)
  })
}

function hasFactorData(row, factorKey) {
  return Boolean(row?.latest?.[factorKey])
}

function toChartPoints(observations, rangeKey) {
  const now = Date.now()
  const rangeMs =
    rangeKey === '1y'
      ? 365 * 24 * 60 * 60 * 1000
      : rangeKey === '5y'
        ? 5 * 365 * 24 * 60 * 60 * 1000
        : null
  return [...(observations || [])]
    .filter((obs) => (rangeMs == null ? true : now - obs.dateMs <= rangeMs))
    .sort((a, b) => a.dateMs - b.dateMs)
    .map((obs) => ({
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

function GraphsPage({ majorRivers = [], onExplore, onAddReading }) {
  const [rivers, setRivers] = useState([])
  const [profilesById, setProfilesById] = useState({})
  const [loadingIds, setLoadingIds] = useState({})
  const [listError, setListError] = useState(null)
  const [factorKey, setFactorKey] = useState('ph')
  const [rangeKey, setRangeKey] = useState('5y')
  const [trendIds, setTrendIds] = useState([])
  const [focusId, setFocusId] = useState('')
  const loadQueueRef = useRef(new Set())
  const profilesRef = useRef({})
  const riversRef = useRef([])

  const factor =
    GRAPH_FACTORS.find((item) => item.key === factorKey) || GRAPH_FACTORS[0]

  const upsertProfile = useCallback((row) => {
    const next = { ...row, loaded: true }
    profilesRef.current = { ...profilesRef.current, [next.id]: next }
    setProfilesById(profilesRef.current)
  }, [])

  const fetchRiver = useCallback(
    async (riverId) => {
      if (!riverId) return null
      const existing = profilesRef.current[riverId]
      if (existing?.loaded || existing?.error) return existing
      if (loadQueueRef.current.has(riverId)) return existing || null

      const river = riversRef.current.find((row) => row.id === riverId)
      if (!river) return null

      loadQueueRef.current.add(riverId)
      setLoadingIds((current) => ({ ...current, [riverId]: true }))

      try {
        const row = await loadSingleRiverOfficialSeries(river)
        upsertProfile(row)
        return row
      } catch {
        const failed = {
          id: river.id,
          name: river.name,
          station: null,
          observations: [],
          latest: {},
          error: true,
        }
        upsertProfile(failed)
        return failed
      } finally {
        loadQueueRef.current.delete(riverId)
        setLoadingIds((current) => {
          const next = { ...current }
          delete next[riverId]
          return next
        })
      }
    },
    [upsertProfile]
  )

  // Boot once on mount
  useEffect(() => {
    let alive = true

    async function boot() {
      let list = majorRivers
      if (!list.length) {
        try {
          const response = await fetch('/rivers/overview.geojson')
          const data = await response.json()
          list = extractMajorRiverMarkers(data, {
            maxMarkers: 240,
            minLengthM: 250,
          })
        } catch {
          if (alive) setListError('River list could not be loaded.')
          return
        }
      }
      if (!alive) return

      const ordered = sortForGraphs(list)
      riversRef.current = ordered
      setRivers(ordered)
      setListError(null)

      const starterIds = ordered.slice(0, 6).map((row) => row.id)
      setFocusId(starterIds[0] || '')
      setTrendIds(starterIds.slice(0, 4))

      // Load starters in parallel so charts appear quickly
      await Promise.all(starterIds.map((id) => (alive ? fetchRiver(id) : null)))
    }

    boot()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep riversRef in sync if parent later provides majorRivers
  useEffect(() => {
    if (!majorRivers.length || riversRef.current.length) return
    const ordered = sortForGraphs(majorRivers)
    riversRef.current = ordered
    setRivers(ordered)
    if (!focusId && ordered[0]) {
      setFocusId(ordered[0].id)
      setTrendIds(ordered.slice(0, 4).map((r) => r.id))
    }
  }, [majorRivers, focusId])

  useEffect(() => {
    riversRef.current = rivers
  }, [rivers])

  // Load focus + every ticked river
  useEffect(() => {
    const needed = [...new Set([focusId, ...trendIds].filter(Boolean))]
    needed.forEach((id) => {
      fetchRiver(id)
    })
  }, [focusId, trendIds, fetchRiver, rivers])

  const profiles = useMemo(() => Object.values(profilesById), [profilesById])

  const comparisonData = useMemo(() => {
    return profiles
      .map((row) => {
        const latest = row.latest?.[factor.key]
        if (!latest) return null
        return {
          id: row.id,
          name: shortName(row.name),
          fullName: row.name,
          station: row.station?.name || '',
          value: Number(latest.value.toFixed(3)),
          date: latest.date,
          unit: latest.unit,
          samples: latest.sampleCount,
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [profiles, factor])

  const trendRivers = useMemo(
    () =>
      trendIds
        .map((id) => profilesById[id])
        .filter((row) => row && hasFactorData(row, factor.key)),
    [profilesById, trendIds, factor.key]
  )

  const trendData = useMemo(() => {
    const monthMap = new Map()
    trendRivers.forEach((row) => {
      monthlySeries(row.observations, factor, rangeKey).forEach((point) => {
        if (!monthMap.has(point.month)) {
          monthMap.set(point.month, { month: point.month, label: point.label })
        }
        monthMap.get(point.month)[row.id] = point.value
      })
    })
    return [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month))
  }, [trendRivers, factor, rangeKey])

  const focusRiver = profilesById[focusId] || null
  const focusLoading = Boolean(loadingIds[focusId])

  const focusSeries = useMemo(
    () => selectChartSeries(focusRiver?.observations || [], 5),
    [focusRiver]
  )

  const focusDetailSeries = useMemo(() => {
    const match =
      focusSeries.find((s) => s.key === factor.key) || focusSeries[0]
    if (!match) return []
    return toChartPoints(match.observations, rangeKey)
  }, [focusSeries, factor, rangeKey])

  const focusForecast = useMemo(() => {
    if (!focusRiver) return null
    const rows = (focusRiver.observations || []).filter((obs) =>
      factor.match(String(obs.determinandName || ''))
    )
    return buildTrendForecast(rows, {
      label: factor.label,
      unit: rows[0]?.unit || '',
      determinandName: rows[0]?.determinandName || factor.label,
      monthsAhead: 6,
    })
  }, [focusRiver, factor])

  const withData = profiles.filter((row) =>
    GRAPH_FACTORS.some((item) => row.latest?.[item.key])
  ).length

  const tickList = useMemo(() => {
    const withSeries = rivers.filter((river) =>
      hasFactorData(profilesById[river.id], factor.key)
    )
    const rest = rivers.filter(
      (river) => !hasFactorData(profilesById[river.id], factor.key)
    )
    return [...withSeries, ...rest].slice(0, 60)
  }, [rivers, profilesById, factor.key])

  function toggleTrend(id) {
    setTrendIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id)
      if (current.length >= 6) return [...current.slice(1), id]
      return [...current, id]
    })
    setFocusId(id)
    fetchRiver(id)
  }

  function selectFocus(id) {
    setFocusId(id)
    setTrendIds((current) => {
      if (current.includes(id) || !id) return current
      if (current.length >= 6) return [...current.slice(1), id]
      return [...current, id]
    })
    fetchRiver(id)
  }

  const unit = comparisonData[0]?.unit || focusDetailSeries[0]?.unit || ''
  const anyTrendLoading = trendIds.some((id) => loadingIds[id])
  const focusName =
    focusRiver?.name || rivers.find((r) => r.id === focusId)?.name || 'Choose a river'

  return (
    <main className="graphs-page">
      <section className="graphs-intro">
        <div>
          <p className="home-section-label">Official data</p>
          <h1>Compare rivers.</h1>
          <p>
            Tick rivers on the right to load their Environment Agency samples
            onto the charts. Values are real official measurements only.
          </p>
        </div>
        <div className="graphs-actions">
          <button type="button" className="btn-secondary" onClick={onExplore}>
            Open map
          </button>
          <button type="button" className="btn-primary" onClick={onAddReading}>
            + Add reading
          </button>
        </div>
      </section>

      <section className="graphs-picker">
        <label>
          Select a river
          <select
            value={focusId}
            onChange={(event) => selectFocus(event.target.value)}
          >
            <option value="" disabled>
              Choose a river…
            </option>
            {rivers.map((river) => (
              <option key={river.id} value={river.id}>
                {river.name}
              </option>
            ))}
          </select>
        </label>
        <p className="graphs-picker-meta">
          {listError
            ? listError
            : focusLoading
              ? `Fetching EA data for ${focusName}…`
              : focusRiver?.station
                ? `EA site: ${focusRiver.station.name}`
                : focusRiver?.loaded
                  ? 'No nearby freshwater EA site found yet — try another river.'
                  : `${rivers.length} rivers available · tick rivers to plot`}
        </p>
      </section>

      <section className="graphs-toolbar" aria-label="Chart controls">
        <div className="graphs-pills" role="group" aria-label="Measurement">
          {GRAPH_FACTORS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={factorKey === item.key ? 'is-active' : ''}
              onClick={() => setFactorKey(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="graphs-pills" role="group" aria-label="Time range">
          {RANGE_OPTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={rangeKey === item.id ? 'is-active' : ''}
              onClick={() => setRangeKey(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="graphs-metrics">
        <article>
          <span>Rivers listed</span>
          <strong>{rivers.length || '…'}</strong>
          <p>OS Open Rivers named watercourses</p>
        </article>
        <article>
          <span>With official samples</span>
          <strong>{withData}</strong>
          <p>EA sites linked so far</p>
        </article>
        <article>
          <span>Showing</span>
          <strong>{factor.label}</strong>
          <p>{unit ? `Unit: ${unit}` : 'Unit as reported by EA'}</p>
        </article>
        <article>
          <span>Samples in focus</span>
          <strong>
            {focusLoading
              ? '…'
              : focusRiver?.latest?.[factor.key]?.sampleCount ||
                focusDetailSeries.length ||
                0}
          </strong>
          <p>Official EA observations</p>
        </article>
      </section>

      <section className="graphs-card graphs-card--wide">
        <div className="graphs-card-head">
          <div>
            <p className="home-section-label">Selected river</p>
            <h2>
              {focusName} · {factor.label}
            </h2>
          </div>
          <p className="graphs-note">
            Historical official samples for the selected river.
          </p>
        </div>
        {focusLoading ? (
          <p className="graphs-status">Loading Environment Agency samples…</p>
        ) : focusDetailSeries.length === 0 ? (
          <p className="graphs-status">
            No official {factor.label.toLowerCase()} series for this river yet.
            Tick another river or switch measurement.
          </p>
        ) : (
          <div className="graphs-chart">
            <ResponsiveContainer width="100%" height={320} minWidth={0}>
              <LineChart
                data={focusDetailSeries}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid vertical={false} stroke="#ececec" />
                <XAxis
                  dataKey="dateLabel"
                  tick={{ fontSize: 11, fill: '#6a6a6a' }}
                  minTickGap={24}
                  axisLine={{ stroke: '#e6e6e6' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6a6a6a' }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={{
                    border: '1px solid #ececec',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  name={factor.label}
                  stroke="#111"
                  strokeWidth={2}
                  dot={focusDetailSeries.length < 40}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="graphs-split">
        <article className="graphs-card">
          <div className="graphs-card-head">
            <div>
              <p className="home-section-label">Trends</p>
              <h2>Monthly {factor.label.toLowerCase()}</h2>
            </div>
            <p className="graphs-note">
              Tick rivers on the right — charts update as EA samples load.
            </p>
          </div>
          {anyTrendLoading && trendData.length === 0 ? (
            <p className="graphs-status">Loading ticked rivers…</p>
          ) : trendData.length === 0 ? (
            <p className="graphs-status">
              Tick one or more rivers to plot their official samples here.
            </p>
          ) : (
            <div className="graphs-chart">
              <ResponsiveContainer width="100%" height={320} minWidth={0}>
                <LineChart
                  data={trendData}
                  margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} stroke="#ececec" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#6a6a6a' }}
                    minTickGap={24}
                    axisLine={{ stroke: '#e6e6e6' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#6a6a6a' }}
                    axisLine={false}
                    tickLine={false}
                    width={42}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={{
                      border: '1px solid #ececec',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {trendRivers.map((row, index) => (
                    <Line
                      key={row.id}
                      type="monotone"
                      dataKey={row.id}
                      name={shortName(row.name)}
                      stroke={LINE_COLORS[index % LINE_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>

        <article className="graphs-card graphs-rivers">
          <p className="home-section-label">Trend rivers</p>
          <h2>Tick up to 6</h2>
          <ul>
            {tickList.map((river) => {
              const profile = profilesById[river.id]
              const loading = Boolean(loadingIds[river.id])
              const ready = hasFactorData(profile, factor.key)
              return (
                <li key={river.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={trendIds.includes(river.id)}
                      onChange={() => toggleTrend(river.id)}
                    />
                    <span>
                      {river.name}
                      {loading
                        ? ' · loading…'
                        : ready
                          ? ''
                          : profile?.loaded
                            ? ' · no series'
                            : ''}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </article>
      </section>

      <section className="graphs-card graphs-card--wide">
        <div className="graphs-card-head">
          <div>
            <p className="home-section-label">Loaded rivers</p>
            <h2>Latest {factor.label.toLowerCase()}</h2>
          </div>
          <p className="graphs-note">
            One latest official sample per river that has loaded so far.
          </p>
        </div>
        {comparisonData.length === 0 ? (
          <p className="graphs-status">
            Tick rivers above to load official {factor.label.toLowerCase()}{' '}
            samples into this chart.
          </p>
        ) : (
          <div className="graphs-chart graphs-chart--all">
            <ResponsiveContainer width="100%" height={420} minWidth={0}>
              <BarChart
                data={comparisonData}
                margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
              >
                <CartesianGrid vertical={false} stroke="#ececec" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: '#6a6a6a' }}
                  interval={0}
                  angle={-50}
                  textAnchor="end"
                  height={88}
                  axisLine={{ stroke: '#e6e6e6' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6a6a6a' }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                  contentStyle={{
                    border: '1px solid #ececec',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value, _, item) => [
                    `${value}${item.payload.unit ? ` ${item.payload.unit}` : ''}`,
                    item.payload.fullName,
                  ]}
                />
                <Bar
                  dataKey="value"
                  fill="#111"
                  radius={[2, 2, 0, 0]}
                  maxBarSize={18}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="graphs-card graphs-card--wide graphs-forecast-card">
        <div className="graphs-card-head">
          <div>
            <p className="home-section-label">Prediction</p>
            <h2>6-month outlook · {focusName}</h2>
          </div>
        </div>

        {focusLoading ? (
          <p className="graphs-status">Loading samples for outlook…</p>
        ) : !focusForecast?.ok ? (
          <p className="graphs-status">
            {focusForecast?.reason ||
              'Need at least 4 official samples to project a trend.'}
          </p>
        ) : (
          <>
            <div className="trend-forecast-summary graphs-forecast-summary">
              <div>
                <p className="trend-kicker">Direction</p>
                <p className="trend-value">{focusForecast.direction}</p>
              </div>
              <div>
                <p className="trend-kicker">Outlook</p>
                <p className="trend-value">{focusForecast.deltaNote}</p>
              </div>
              <div>
                <p className="trend-kicker">Confidence</p>
                <p
                  className={`trend-confidence trend-confidence--${focusForecast.confidence.level}`}
                >
                  {focusForecast.confidence.label} ·{' '}
                  {focusForecast.confidence.score}%
                </p>
              </div>
            </div>
            <div className="graphs-chart">
              <ResponsiveContainer width="100%" height={320} minWidth={0}>
                <LineChart
                  data={focusForecast.chart}
                  margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} stroke="#ececec" />
                  <XAxis
                    dataKey="dateLabel"
                    tick={{ fontSize: 11, fill: '#6a6a6a' }}
                    minTickGap={22}
                    axisLine={{ stroke: '#e6e6e6' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#6a6a6a' }}
                    axisLine={false}
                    tickLine={false}
                    width={42}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={{
                      border: '1px solid #ececec',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="measured"
                    name="Measured"
                    stroke="#111"
                    strokeWidth={1.8}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="projected"
                    name="Projected"
                    stroke="#c97816"
                    strokeWidth={1.8}
                    strokeDasharray="5 4"
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="graphs-note graphs-note--left">
              {focusForecast.disclaimer}
            </p>
          </>
        )}
      </section>
    </main>
  )
}

export default GraphsPage
