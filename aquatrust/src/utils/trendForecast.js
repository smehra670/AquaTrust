/**
 * Transparent trend projection from real Environment Agency samples.
 * Forecast points are model projections — never labelled as measured samples.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const MONTH_MS = 30.44 * DAY_MS

function finite(values) {
  return values.filter((v) => Number.isFinite(v))
}

function mean(values) {
  const nums = finite(values)
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

/**
 * Ordinary least-squares linear fit of value vs time (ms).
 */
export function fitLinearTrend(points = []) {
  const rows = points
    .map((p) => ({
      x: Number(p.dateMs ?? p.x),
      y: Number(p.value ?? p.y),
    }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .sort((a, b) => a.x - b.x)

  if (rows.length < 4) {
    return null
  }

  const n = rows.length
  const xs = rows.map((r) => r.x)
  const ys = rows.map((r) => r.y)
  const xMean = mean(xs)
  const yMean = mean(ys)
  let num = 0
  let den = 0
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - xMean) * (ys[i] - yMean)
    den += (xs[i] - xMean) ** 2
  }
  if (!den) return null

  const slope = num / den
  const intercept = yMean - slope * xMean

  let ssTot = 0
  let ssRes = 0
  for (let i = 0; i < n; i += 1) {
    const pred = intercept + slope * xs[i]
    ssTot += (ys[i] - yMean) ** 2
    ssRes += (ys[i] - pred) ** 2
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0
  const residuals = rows.map((r) => r.y - (intercept + slope * r.x))
  const rmse = Math.sqrt(
    residuals.reduce((sum, v) => sum + v * v, 0) / residuals.length
  )

  return {
    slopePerMs: slope,
    slopePerYear: slope * 365.25 * DAY_MS,
    intercept,
    r2: Math.max(0, Math.min(1, r2)),
    rmse,
    sampleCount: n,
    firstDateMs: rows[0].x,
    lastDateMs: rows[n - 1].x,
    lastValue: rows[n - 1].y,
    predict(atMs) {
      return intercept + slope * atMs
    },
  }
}

function directionLabel(slopePerYear, unit, isPh) {
  const abs = Math.abs(slopePerYear)
  if (!Number.isFinite(abs)) return 'Insufficient data for a trend call'
  const threshold = isPh ? 0.05 : Math.max(abs * 0.02, 0.01)
  if (abs < threshold) return 'Broadly stable'
  if (slopePerYear > 0) {
    return isPh
      ? 'Rising (becoming less acidic)'
      : `Rising (+${abs.toFixed(2)}${unit ? ` ${unit}` : ''}/year)`
  }
  return isPh
    ? 'Falling (becoming more acidic)'
    : `Falling (−${abs.toFixed(2)}${unit ? ` ${unit}` : ''}/year)`
}

function confidenceLabel(fit) {
  if (!fit) return { level: 'none', label: 'No forecast', score: 0 }
  const monthsSpan =
    (fit.lastDateMs - fit.firstDateMs) / MONTH_MS
  let score = 20
  if (fit.sampleCount >= 8) score += 20
  if (fit.sampleCount >= 20) score += 15
  if (monthsSpan >= 12) score += 15
  if (monthsSpan >= 36) score += 10
  if (fit.r2 >= 0.25) score += 10
  if (fit.r2 >= 0.45) score += 10
  score = Math.min(92, score)

  if (score >= 70) return { level: 'high', label: 'Higher confidence', score }
  if (score >= 45) return { level: 'medium', label: 'Moderate confidence', score }
  return { level: 'low', label: 'Lower confidence', score }
}

/**
 * Build historical + projected series for one determinand from real observations.
 */
export function buildTrendForecast(observations = [], options = {}) {
  const {
    monthsAhead = 6,
    label = 'Parameter',
    unit = '',
    determinandName = '',
  } = options

  const rows = [...observations]
    .filter((o) => Number.isFinite(o?.value) && Number.isFinite(o?.dateMs))
    .sort((a, b) => a.dateMs - b.dateMs)

  const fit = fitLinearTrend(rows)
  if (!fit) {
    return {
      ok: false,
      label,
      unit,
      reason: 'Need at least 4 official samples to project a trend.',
      history: rows.map((r) => ({
        dateMs: r.dateMs,
        dateLabel: new Date(r.dateMs).toLocaleDateString('en-GB', {
          month: 'short',
          year: '2-digit',
        }),
        value: r.value,
        kind: 'measured',
      })),
      forecast: [],
      chart: [],
    }
  }

  const isPh = /ph/i.test(determinandName) || label === 'pH'
  const confidence = confidenceLabel(fit)
  const direction = directionLabel(fit.slopePerYear, unit, isPh)

  const history = rows.map((r) => ({
    dateMs: r.dateMs,
    dateLabel: new Date(r.dateMs).toLocaleDateString('en-GB', {
      month: 'short',
      year: '2-digit',
    }),
    value: Number(r.value.toFixed(3)),
    kind: 'measured',
  }))

  const forecast = []
  for (let i = 1; i <= monthsAhead; i += 1) {
    const at = fit.lastDateMs + i * MONTH_MS
    const value = fit.predict(at)
    forecast.push({
      dateMs: at,
      dateLabel: new Date(at).toLocaleDateString('en-GB', {
        month: 'short',
        year: '2-digit',
      }),
      value: Number(value.toFixed(3)),
      kind: 'projected',
      low: Number((value - fit.rmse).toFixed(3)),
      high: Number((value + fit.rmse).toFixed(3)),
    })
  }

  const bridge = {
    ...history[history.length - 1],
    projected: history[history.length - 1].value,
  }

  const chart = [
    ...history.map((p) => ({ ...p, measured: p.value, projected: null })),
    {
      ...bridge,
      measured: bridge.value,
      projected: bridge.value,
    },
    ...forecast.map((p) => ({
      ...p,
      measured: null,
      projected: p.value,
    })),
  ]

  const horizon = forecast[forecast.length - 1]
  const delta = horizon.value - fit.lastValue

  return {
    ok: true,
    label,
    unit,
    direction,
    confidence,
    sampleCount: fit.sampleCount,
    r2: fit.r2,
    slopePerYear: fit.slopePerYear,
    latestValue: fit.lastValue,
    projectedValue: horizon.value,
    projectedDateLabel: horizon.dateLabel,
    delta,
    deltaNote:
      Math.abs(delta) < (isPh ? 0.05 : Math.abs(fit.lastValue) * 0.02 || 0.01)
        ? `Projected to stay near ${fit.lastValue.toFixed(2)}${unit ? ` ${unit}` : ''} by ${horizon.dateLabel}.`
        : delta > 0
          ? `Projected +${delta.toFixed(2)}${unit ? ` ${unit}` : ''} by ${horizon.dateLabel}.`
          : `Projected ${delta.toFixed(2)}${unit ? ` ${unit}` : ''} by ${horizon.dateLabel}.`,
    disclaimer:
      'Projection from historical Environment Agency samples using a linear trend model. Not a measured future sample.',
    history,
    forecast,
    chart,
  }
}

export function forecastFromChartSeries(chartSeries = []) {
  return (chartSeries || [])
    .map((series) =>
      buildTrendForecast(series.observations || [], {
        label: series.label,
        unit: series.unit || series.summary?.unit || '',
        determinandName: series.determinandName,
        monthsAhead: 6,
      })
    )
    .filter((item) => item.ok || item.history?.length)
}
