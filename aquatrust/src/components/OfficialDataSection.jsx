import { useMemo, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import {
  getTimeSeries,
  formatOfficialDate,
  formatOfficialValue,
} from '../services/environmentAgency'

const RANGE_OPTIONS = [
  { id: '1m', label: '1 month' },
  { id: '6m', label: '6 months' },
  { id: '1y', label: '1 year' },
  { id: 'all', label: 'All available' },
]

function OfficialTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  return (
    <div className="ea-tooltip">
      <p>{label}</p>
      <p>
        <strong>
          {Number.isFinite(point?.value) ? point.value : '—'}
          {point?.unit ? ` ${point.unit}` : ''}
        </strong>
      </p>
      <p className="ea-tooltip-source">Source: Environment Agency</p>
    </div>
  )
}

function ParameterCard({ series, rangeKey, siteName }) {
  const chartData = useMemo(
    () => getTimeSeries(series.observations, series.determinandName, rangeKey),
    [series, rangeKey]
  )
  const summary = series.summary

  if (!summary || chartData.length === 0) {
    return (
      <article className="ea-param-card">
        <h4>{series.label}</h4>
        <p className="panel-status">
          No historical {series.label.toLowerCase()} data available at this
          monitoring site.
        </p>
      </article>
    )
  }

  return (
    <article className="ea-param-card">
      <div className="ea-param-head">
        <h4>{series.label}</h4>
        <span className="ea-unit">{summary.unit || 'unit not reported'}</span>
      </div>

      <dl className="ea-stat-grid">
        <div>
          <dt>Latest available official sample</dt>
          <dd>{formatOfficialValue(summary.latestValue, summary.unit)}</dd>
        </div>
        <div>
          <dt>Sampled</dt>
          <dd>{formatOfficialDate(summary.latestDate)}</dd>
        </div>
        <div>
          <dt>Samples</dt>
          <dd>{summary.sampleCount}</dd>
        </div>
        <div>
          <dt>Recent median</dt>
          <dd>
            {summary.recentMedian == null
              ? '—'
              : formatOfficialValue(summary.recentMedian, summary.unit)}
          </dd>
        </div>
      </dl>

      {summary.changeNote ? (
        <p className="ea-change-note">{summary.changeNote}</p>
      ) : null}
      {summary.ageNote ? (
        <p className="ea-age-note">{summary.ageNote}</p>
      ) : null}

      {chartData.length === 1 ? (
        <p className="panel-status">
          Only one official sample is available for this parameter — not enough
          points for a trend line.
        </p>
      ) : (
        <div className="ea-chart-wrap">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#dbe3e6" />
              <XAxis
                dataKey="dateLabel"
                tick={{ fontSize: 10, fill: '#5f6b73' }}
                minTickGap={28}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#5f6b73' }}
                width={44}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<OfficialTooltip />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#1f6f78"
                strokeWidth={2}
                dot={chartData.length < 40}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="ea-chart-meta">
        Source: Environment Agency · Sampling site: {siteName} · Latest
        observation: {formatOfficialDate(summary.latestDate)} · Samples
        displayed: {chartData.length}
      </p>
    </article>
  )
}

/**
 * Official EA measurements + historical trends for a selected station.
 */
function OfficialDataSection({
  station,
  chartSeries = [],
  loading = false,
  error = null,
  observationCount = 0,
  showCharts = true,
  relationLabel = null,
}) {
  const [rangeKey, setRangeKey] = useState('1y')

  if (!station) return null

  const badge =
    relationLabel ||
    station.monitoringLabel ||
    null

  return (
    <div className="ea-official-section">
      <section className="panel-section">
        <h3>Official monitoring site</h3>
        <p className="source-badge">Environment Agency</p>
        {badge ? (
          <p
            className={`monitoring-relation-badge${
              String(badge).includes('DIRECT')
                ? ' monitoring-relation-badge--direct'
                : ' monitoring-relation-badge--nearest'
            }`}
          >
            {badge}
          </p>
        ) : null}
        <dl className="ea-site-facts">
          <div>
            <dt>Site name</dt>
            <dd>{station.name}</dd>
          </div>
          <div>
            <dt>Sampling point ID</dt>
            <dd>{station.id}</dd>
          </div>
          <div>
            <dt>Latitude / longitude</dt>
            <dd>
              {station.lat.toFixed(5)}, {station.lng.toFixed(5)}
            </dd>
          </div>
          {Number.isFinite(station.distanceKm) ? (
            <div>
              <dt>Distance from selection</dt>
              <dd>
                {station.distanceKm < 1
                  ? `${Math.round(station.distanceKm * 1000)} m`
                  : `${station.distanceKm.toFixed(1)} km`}
              </dd>
            </div>
          ) : null}
          {station.type ? (
            <div>
              <dt>Site type</dt>
              <dd>{station.type}</dd>
            </div>
          ) : null}
          {station.status ? (
            <div>
              <dt>Status</dt>
              <dd>{station.status}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="panel-section">
        <h3>Latest measurements</h3>
        {loading ? <p className="panel-status">Loading official samples…</p> : null}
        {error ? (
          <p className="panel-status panel-status--error">{error}</p>
        ) : null}
        {!loading && !error && observationCount === 0 ? (
          <p className="panel-status">
            No historical observations were returned for this monitoring site.
          </p>
        ) : null}
        {!loading && !error && chartSeries.length === 0 && observationCount > 0 ? (
          <p className="panel-status">
            This site has observations, but none of the priority parameters (pH,
            temperature, dissolved oxygen, turbidity, conductivity, nitrate,
            ammoniacal nitrogen) are available.
          </p>
        ) : null}

        <div className="ea-latest-list">
          {chartSeries.map((series) => {
            const s = series.summary
            if (!s) return null
            return (
              <div key={series.key} className="ea-latest-row">
                <div>
                  <p className="ea-latest-label">{series.label}</p>
                  <p className="ea-latest-meta">
                    Sampled {formatOfficialDate(s.latestDate)} · {s.sampleCount}{' '}
                    samples
                  </p>
                </div>
                <p className="ea-latest-value">
                  {formatOfficialValue(s.latestValue, s.unit)}
                </p>
              </div>
            )
          })}
        </div>
        <p className="demo-note">
          Values are latest available official samples — not live sensor
          readings.
        </p>
      </section>

      {showCharts ? (
        <section className="panel-section">
          <div className="ea-trends-head">
            <h3>Historical trends</h3>
            <div className="ea-range-pills" role="group" aria-label="Time range">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`filter-pill${rangeKey === option.id ? ' is-active' : ''}`}
                  aria-pressed={rangeKey === option.id}
                  onClick={() => setRangeKey(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {chartSeries.map((series) => (
            <ParameterCard
              key={series.key}
              series={series}
              rangeKey={rangeKey}
              siteName={station.name}
            />
          ))}
        </section>
      ) : null}
    </div>
  )
}

export default OfficialDataSection
