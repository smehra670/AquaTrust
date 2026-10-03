import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { forecastFromChartSeries } from '../utils/trendForecast'

function ForecastTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const measured = payload.find((p) => p.dataKey === 'measured')?.value
  const projected = payload.find((p) => p.dataKey === 'projected')?.value
  return (
    <div className="ea-tooltip">
      <p>{label}</p>
      {Number.isFinite(measured) ? (
        <p>
          <strong>Measured: {measured}</strong>
        </p>
      ) : null}
      {Number.isFinite(projected) && !Number.isFinite(measured) ? (
        <p>
          <strong>Projected: {projected}</strong>
        </p>
      ) : null}
      <p className="ea-tooltip-source">
        {Number.isFinite(projected) && !Number.isFinite(measured)
          ? 'Model projection · not a measured sample'
          : 'Source: Environment Agency'}
      </p>
    </div>
  )
}

/**
 * Hackathon-ready trend outlook from real EA chart series.
 */
function TrendForecastSection({ chartSeries = [], loading = false }) {
  const forecasts = useMemo(
    () => forecastFromChartSeries(chartSeries),
    [chartSeries]
  )
  const usable = forecasts.filter((f) => f.ok)
  const [activeKey, setActiveKey] = useState(usable[0]?.label || '')

  const active =
    usable.find((f) => f.label === activeKey) || usable[0] || null

  if (loading) {
    return (
      <section className="panel-section trend-forecast">
        <h3>Trend outlook</h3>
        <p className="panel-status">Building projection from official samples…</p>
      </section>
    )
  }

  if (!usable.length) {
    return (
      <section className="panel-section trend-forecast">
        <h3>Trend outlook</h3>
        <p className="source-badge">MODEL FROM EA HISTORY</p>
        <p className="panel-status">
          Not enough official samples yet to project a reliable 6-month trend.
        </p>
      </section>
    )
  }

  return (
    <section className="panel-section trend-forecast">
      <h3>Trend outlook</h3>
      <p className="source-badge">MODEL FROM EA HISTORY · 6-MONTH PROJECTION</p>

      <div className="ea-range-pills" role="group" aria-label="Forecast parameter">
        {usable.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`filter-pill${active?.label === item.label ? ' is-active' : ''}`}
            onClick={() => setActiveKey(item.label)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {active ? (
        <>
          <div className="trend-forecast-summary">
            <div>
              <p className="trend-kicker">Direction</p>
              <p className="trend-value">{active.direction}</p>
            </div>
            <div>
              <p className="trend-kicker">Outlook</p>
              <p className="trend-value">{active.deltaNote}</p>
            </div>
            <div>
              <p className="trend-kicker">Confidence</p>
              <p
                className={`trend-confidence trend-confidence--${active.confidence.level}`}
              >
                {active.confidence.label} · {active.confidence.score}%
              </p>
            </div>
          </div>

          <div className="ea-chart-wrap">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart
                data={active.chart}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e8e8" />
                <XAxis
                  dataKey="dateLabel"
                  tick={{ fontSize: 10, fill: '#6a6a6a' }}
                  minTickGap={28}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#6a6a6a' }}
                  width={44}
                  domain={['auto', 'auto']}
                />
                <Tooltip content={<ForecastTooltip />} />
                <Line
                  type="monotone"
                  dataKey="measured"
                  stroke="#1f6f78"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                  name="Measured"
                />
                <Line
                  type="monotone"
                  dataKey="projected"
                  stroke="#c97816"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                  name="Projected"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p className="ea-chart-meta">{active.disclaimer}</p>
          <p className="demo-note">
            Based on {active.sampleCount} official samples · R²{' '}
            {(active.r2 * 100).toFixed(0)}% fit to history
          </p>
        </>
      ) : null}
    </section>
  )
}

export default TrendForecastSection
