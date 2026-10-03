import { useMemo, useState } from 'react'
import VerifyMeCard from './VerifyMeCard'
import TrustBadge from './TrustBadge'
import PlacePhotos from './PlacePhotos'
import PlaceHeroImage from './PlaceHeroImage'
import LocalIssuesActions from './LocalIssuesActions'
import OfficialDataSection from './OfficialDataSection'
import TrendForecastSection from './TrendForecastSection'
import { buildWaterbodyStory } from '../utils/waterbodySummary'
import { detectIssuesForObservation } from '../utils/issueEngine'
import { getWaterbodyProfile } from '../data/waterbodyProfiles'
import { OBSERVATIONS } from '../data/observations'
import { formatLengthM } from '../utils/watercourses'
import { enrichObservations, haversineKm } from '../utils/trustEngine'

const ALL_ENRICHED = enrichObservations(OBSERVATIONS)

const EVIDENCE_ROWS = [
  { key: 'historicalConsistency', label: 'Historical consistency' },
  { key: 'nearbyAgreement', label: 'Nearby agreement' },
  { key: 'measurementPlausibility', label: 'Measurement plausibility' },
  { key: 'photoQuality', label: 'Photo quality' },
]

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'official', label: 'Official data' },
  { id: 'citizen', label: 'Citizen data' },
]

function trendStatusText(observation) {
  if (observation.trustLevel === 'high' && observation.includedInTrend) {
    return {
      className: 'inclusion-note inclusion-note--in',
      text: 'Included in trusted trend analysis',
    }
  }

  if (observation.trustLevel === 'medium') {
    return {
      className: 'inclusion-note inclusion-note--wait',
      text: 'Awaiting verification',
    }
  }

  return {
    className: 'inclusion-note inclusion-note--out',
    text: 'Excluded from trusted trend analysis',
  }
}

function formatDistance(km) {
  if (!Number.isFinite(km)) return '—'
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

function formatChange(pct) {
  if (!Number.isFinite(pct)) return '—'
  if (pct === 0) return 'stable'
  return pct > 0 ? `↑ ${pct}%` : `↓ ${Math.abs(pct)}%`
}

function PanelTabs({ activeTab, onChange }) {
  return (
    <div className="panel-tabs" role="tablist" aria-label="Evidence sections">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          className={`panel-tab${activeTab === tab.id ? ' is-active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

function NearbyOfficialList({ stations, onSelect, emptyText }) {
  if (!stations?.length) {
    return <p className="panel-status">{emptyText}</p>
  }

  return (
    <ul className="station-list">
      {stations.map((station) => (
        <li key={station.id} className="station-item">
          <p className="station-name">{station.name}</p>
          <p className="station-meta">
            {station.monitoringLabel
              ? `${station.monitoringLabel} · `
              : ''}
            {station.type || 'Sampling point'}
            {Number.isFinite(station.distanceKm)
              ? ` · ${formatDistance(station.distanceKm)}`
              : ''}
          </p>
          <p className="station-meta">ID: {station.id}</p>
          {onSelect ? (
            <button
              type="button"
              className="btn-secondary station-open-btn"
              onClick={() => onSelect(station)}
            >
              Open official data
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function NearbyCitizenList({ origin, citizens }) {
  const nearby = useMemo(() => {
    if (!origin) return []
    return citizens
      .map((item) => ({
        ...item,
        distanceKm: haversineKm(origin.lat, origin.lng, item.lat, item.lng),
      }))
      .filter((item) => item.distanceKm <= 3)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 6)
  }, [origin, citizens])

  if (!nearby.length) {
    return (
      <p className="panel-status">
        No AquaTrust citizen observations within 3 km of this official site.
      </p>
    )
  }

  return (
    <ul className="station-list">
      {nearby.map((item) => (
        <li key={item.id} className="station-item">
          <p className="station-name">{item.siteName}</p>
          <p className="station-meta">
            {item.trustLabel} · score {item.overallScore}% ·{' '}
            {formatDistance(item.distanceKm)}
          </p>
          <p className="station-meta">
            Citizen · pH {item.ph.toFixed(1)} · {item.timestamp}
          </p>
        </li>
      ))}
    </ul>
  )
}

function EvidencePanel({
  observation,
  officialStation = null,
  selectedWatercourse = null,
  watercourseCoverage = null,
  watercourseStations = [],
  watercoursePrimaryStation = null,
  watercourseChartSeries = [],
  watercourseObservationsCount = 0,
  watercourseMonitoringLoading = false,
  watercourseMonitoringError = null,
  onSelectWatercourseStation = null,
  officialChartSeries = [],
  officialObservationsCount = 0,
  officialLoading = false,
  officialError = null,
  officialStations = [],
  clickedLocation,
  nearbyStations = [],
  stationsLoading = false,
  stationsError = null,
  citizenObservations = ALL_ENRICHED,
  verificationRequested,
  verificationResult = null,
  issueMission = null,
  onSelectOfficialStation,
  onRequestVerification,
  onSubmitVerification,
  onCreateIssueMission,
  onClose,
}) {
  const [activeTab, setActiveTab] = useState(
    officialStation ? 'official' : 'overview'
  )
  const [activeMissionIssueId, setActiveMissionIssueId] = useState(
    issueMission?.issueId || null
  )

  const profile = observation ? getWaterbodyProfile(observation.id) : null
  const issues = useMemo(() => {
    if (!observation || !profile) return []
    return detectIssuesForObservation(observation, ALL_ENRICHED, profile)
  }, [observation, profile])

  const nearbyOfficialForCitizen = useMemo(() => {
    if (!observation) return []
    return (officialStations || [])
      .map((station) => ({
        ...station,
        distanceKm: haversineKm(
          observation.lat,
          observation.lng,
          station.lat,
          station.lng
        ),
      }))
      .filter((station) => station.distanceKm <= 5)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 5)
  }, [observation, officialStations])

  // --- OS Open Rivers watercourse selected ---
  if (selectedWatercourse && !observation && !officialStation) {
    const wc = selectedWatercourse
    const displayName = wc.name || 'Unnamed watercourse'
    const primary = watercoursePrimaryStation
    return (
      <aside className="evidence-panel story-panel" aria-live="polite">
        <div className="evidence-header">
          <div>
            <p className="panel-eyebrow">Watercourse</p>
            <h2>{displayName}</h2>
            <p className="evidence-timestamp">{wc.formLabel}</p>
            {watercourseCoverage ? (
              <p
                className={`river-data-badge river-data-badge--${watercourseCoverage.level}`}
              >
                {watercourseCoverage.label}
                {Number.isFinite(watercourseCoverage.stationCount)
                  ? ` · ${watercourseCoverage.stationCount} EA site${
                      watercourseCoverage.stationCount === 1 ? '' : 's'
                    }`
                  : ''}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="panel-close"
            onClick={onClose}
            aria-label="Clear selected watercourse"
          >
            Close
          </button>
        </div>

        <section className="panel-section">
          <h3>Overview</h3>
          <p className="source-badge">OS OPEN RIVERS · Official geometry</p>
          <dl className="ea-site-facts">
            <div>
              <dt>Name</dt>
              <dd>{displayName}</dd>
            </div>
            {wc.nameAlt ? (
              <div>
                <dt>Alternative name</dt>
                <dd>{wc.nameAlt}</dd>
              </div>
            ) : null}
            <div>
              <dt>Type</dt>
              <dd>{wc.formLabel}</dd>
            </div>
            <div>
              <dt>Selected coordinates</dt>
              <dd>
                {Number.isFinite(wc.lat) && Number.isFinite(wc.lng)
                  ? `${wc.lat.toFixed(5)}, ${wc.lng.toFixed(5)}`
                  : '—'}
              </dd>
            </div>
            {formatLengthM(wc.lengthM) ? (
              <div>
                <dt>Mapped segment length</dt>
                <dd>{formatLengthM(wc.lengthM)}</dd>
              </div>
            ) : null}
            {wc.flow ? (
              <div>
                <dt>Flow direction</dt>
                <dd>{wc.flow}</dd>
              </div>
            ) : null}
            <div>
              <dt>OS feature ID</dt>
              <dd>{wc.id || '—'}</dd>
            </div>
          </dl>
          {watercourseCoverage?.reasons?.length ? (
            <ul className="river-data-reasons">
              {watercourseCoverage.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
        </section>

        {(wc.name || (Number.isFinite(wc.lat) && Number.isFinite(wc.lng))) && (
          <PlacePhotos
            placeName={wc.name || ''}
            lat={wc.lat}
            lng={wc.lng}
          />
        )}

        {primary ? (
          <>
            <OfficialDataSection
              station={primary}
              chartSeries={watercourseChartSeries}
              loading={watercourseMonitoringLoading}
              error={watercourseMonitoringError}
              observationCount={watercourseObservationsCount}
              showCharts
              relationLabel={primary.monitoringLabel}
            />
            <TrendForecastSection
              chartSeries={watercourseChartSeries}
              loading={watercourseMonitoringLoading}
            />
          </>
        ) : (
          <section className="panel-section">
            <h3>Official monitoring</h3>
            <p className="source-badge">Environment Agency</p>
            {watercourseMonitoringLoading ? (
              <p className="panel-status">Loading official samples…</p>
            ) : null}
            {watercourseMonitoringError ? (
              <p className="panel-status panel-status--error">
                {watercourseMonitoringError}
              </p>
            ) : null}
            {!watercourseMonitoringLoading &&
            !watercourseMonitoringError &&
            watercourseStations.length === 0 ? (
              <p className="panel-status">
                No Environment Agency sampling points found near this
                watercourse. Charts are only shown from real EA data — nothing
                is invented.
              </p>
            ) : null}
          </section>
        )}

        {watercourseStations.length > 1 ? (
          <section className="panel-section">
            <h3>Nearby official sites</h3>
            <p className="source-badge">Environment Agency · within 8 km</p>
            <NearbyOfficialList
              stations={watercourseStations}
              onSelect={onSelectWatercourseStation || onSelectOfficialStation}
              emptyText="No nearby official sites."
            />
          </section>
        ) : null}
      </aside>
    )
  }

  // --- Map click: nearest official sites ---
  if (!observation && !officialStation && clickedLocation) {
    return (
      <aside className="evidence-panel" aria-live="polite">
        <div className="evidence-header">
          <div>
            <h2>Selected location</h2>
            <p className="evidence-timestamp">
              {clickedLocation.lat.toFixed(5)}, {clickedLocation.lng.toFixed(5)}
            </p>
          </div>
          <button
            type="button"
            className="panel-close"
            onClick={onClose}
            aria-label="Clear selected location"
          >
            Close
          </button>
        </div>

        <section className="panel-section">
          <h3>Official monitoring</h3>
          <p className="source-badge">Environment Agency · 5 km search</p>

          {stationsLoading ? <p className="panel-status">Searching…</p> : null}
          {!stationsLoading && stationsError ? (
            <p className="panel-status panel-status--error">{stationsError}</p>
          ) : null}
          {!stationsLoading && !stationsError && nearbyStations.length === 0 ? (
            <p className="panel-status">
              No official sampling points found within 5 km.
            </p>
          ) : null}

          {!stationsLoading && nearbyStations.length > 0 ? (
            <NearbyOfficialList
              stations={nearbyStations}
              onSelect={onSelectOfficialStation}
              emptyText="No official sampling points found within 5 km."
            />
          ) : null}
        </section>

        {!stationsLoading ? (
          <PlacePhotos
            placeName={nearbyStations[0]?.name || ''}
            lat={clickedLocation.lat}
            lng={clickedLocation.lng}
          />
        ) : null}
      </aside>
    )
  }

  // --- Official EA station selected ---
  if (officialStation && !observation) {
    return (
      <aside className="evidence-panel story-panel" aria-live="polite">
        <div className="evidence-header">
          <div>
            <p className="panel-eyebrow">Official monitoring site</p>
            <h2>{officialStation.name}</h2>
            <p className="evidence-timestamp">
              Environment Agency · {officialStation.id}
            </p>
          </div>
          <button
            type="button"
            className="panel-close"
            onClick={onClose}
            aria-label="Clear selected station"
          >
            Close
          </button>
        </div>

        <PanelTabs activeTab={activeTab} onChange={setActiveTab} />

        {activeTab === 'overview' ? (
          <OfficialDataSection
            station={officialStation}
            chartSeries={officialChartSeries}
            loading={officialLoading}
            error={officialError}
            observationCount={officialObservationsCount}
            showCharts={false}
          />
        ) : null}

        {activeTab === 'official' ? (
          <>
            <OfficialDataSection
              station={officialStation}
              chartSeries={officialChartSeries}
              loading={officialLoading}
              error={officialError}
              observationCount={officialObservationsCount}
              showCharts
            />
            <TrendForecastSection
              chartSeries={officialChartSeries}
              loading={officialLoading}
            />
          </>
        ) : null}

        {activeTab === 'citizen' ? (
          <section className="panel-section">
            <h3>Nearby citizen observations</h3>
            <p className="source-badge">AquaTrust · within 3 km</p>
            <NearbyCitizenList
              origin={officialStation}
              citizens={citizenObservations}
            />
          </section>
        ) : null}
      </aside>
    )
  }

  if (!observation) {
    return (
      <aside className="evidence-panel is-empty">
        <p className="evidence-empty">
          Select a watercourse, citizen observation, or official EA site.
        </p>
      </aside>
    )
  }

  const story = buildWaterbodyStory(observation, citizenObservations)
  const trend = trendStatusText(observation)
  const isVerified = verificationResult?.status === 'confirmed'
  const score = story.confidence.score
  const needsVerifyMe =
    observation.trustLevel === 'medium' ||
    observation.userSubmitted ||
    verificationRequested ||
    isVerified ||
    verificationResult ||
    Boolean(issueMission)

  function handleCreateMission(issue) {
    setActiveMissionIssueId(issue.id)
    onCreateIssueMission?.(issue)
    requestAnimationFrame(() => {
      document.querySelector('.verifyme-card')?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    })
  }

  return (
    <aside className="evidence-panel story-panel" aria-live="polite">
      <div className="evidence-header">
        <div>
          <p className="panel-eyebrow">Citizen observation</p>
          <h2>{story.title}</h2>
          <p className="evidence-timestamp">{story.subtitle}</p>
        </div>
        <button
          type="button"
          className="panel-close"
          onClick={onClose}
          aria-label="Clear selected observation"
        >
          Close
        </button>
      </div>

      {isVerified ? (
        <div className="verified-banner">Verified · Confirmed event</div>
      ) : null}

      {observation.aiAssessment ? (
        <div
          className={`ai-verdict ai-verdict--${observation.aiAssessment.verdict} ai-verdict--panel`}
          role="status"
        >
          <p className="ai-verdict-label">
            AI auditor · {observation.aiAssessment.label}
          </p>
          <p className="ai-verdict-summary">{observation.aiAssessment.summary}</p>
          <p className="ai-verdict-confidence">
            Confidence {observation.aiAssessment.confidence}%
          </p>
          {observation.aiAssessment.checks?.length ? (
            <ul className="ai-check-list ai-check-list--compact">
              {observation.aiAssessment.checks.map((check) => (
                <li
                  key={check.id}
                  className={`ai-check ai-check--${check.status}`}
                >
                  <strong>{check.title}</strong>
                  <span>{check.detail}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <PanelTabs activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'overview' ? (
        <>
          <PlaceHeroImage
            placeName={observation.siteName}
            lat={observation.lat}
            lng={observation.lng}
          />

          <section className="panel-section confidence-block">
            <h3>Overall evidence confidence</h3>
            <div className="confidence-row">
              <div
                className="confidence-track"
                role="progressbar"
                aria-valuenow={score}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Overall evidence confidence"
              >
                <div
                  className={`confidence-fill confidence-fill--${
                    isVerified ? 'high' : story.confidence.trustLevel
                  }`}
                  style={{ width: `${score}%` }}
                />
              </div>
              <div className="confidence-meta">
                <strong>{score}%</strong>
                <span>
                  {isVerified
                    ? 'VERIFIED 🟢'
                    : `${story.confidence.label} ${story.confidence.emoji}`}
                </span>
              </div>
            </div>
            <p className="demo-note">
              TrustScore is calculated from citizen evidence checks. Official EA
              samples appear under Official data.
            </p>
          </section>

          <section className="panel-section">
            <h3>Water quality</h3>
            <ul className="wq-list">
              {story.waterQuality.map((row) => (
                <li key={row.label}>
                  <span className="wq-label">{row.label}</span>
                  <span className="wq-value">{row.value}</span>
                  <span className="wq-trend">
                    {row.arrow} {row.note}
                  </span>
                </li>
              ))}
            </ul>
            <p className="panel-status panel-status--warn">
              ⚠ Citizen readings — not live sensor data.
            </p>
          </section>

          <LocalIssuesActions
            issues={issues}
            activeMissionIssueId={activeMissionIssueId || issueMission?.issueId}
            onCreateVerificationMission={handleCreateMission}
          />

          {needsVerifyMe ? (
            <VerifyMeCard
              observation={observation}
              verificationResult={verificationResult}
              missionOverride={issueMission}
              onSubmitVerification={onSubmitVerification}
            />
          ) : null}
        </>
      ) : null}

      {activeTab === 'official' ? (
        <section className="panel-section">
          <h3>Nearby official monitoring</h3>
          <p className="source-badge">Environment Agency · within 5 km</p>
          <p className="issues-preface">
            Select a teal square on the map, or open a nearby station below, to
            load real historical Environment Agency measurements.
          </p>
          <NearbyOfficialList
            stations={nearbyOfficialForCitizen}
            onSelect={onSelectOfficialStation}
            emptyText="No official sampling points currently loaded within 5 km."
          />
        </section>
      ) : null}

      {activeTab === 'citizen' ? (
        <>
          <section className="panel-section">
            <h3>What has changed?</h3>
            <p className="section-kicker">Past 30 days</p>
            <ul className="change-list">
              <li>Turbidity {formatChange(story.change30d.turbidityPct)}</li>
              <li>Temperature {formatChange(story.change30d.temperaturePct)}</li>
              <li>pH {story.change30d.phNote}</li>
            </ul>
            <p className="demo-note">30-day change summary is demo context.</p>
          </section>

          <section className="panel-section">
            <h3>Why should I trust this?</h3>
            <ul className="reason-list">
              {story.trustReasons.map((item) => (
                <li key={item.text} className="reason-item reason-item--ok">
                  <span aria-hidden="true">✓</span>
                  <span>{item.text}</span>
                </li>
              ))}
              {story.trustWarnings.map((item) => (
                <li key={item.text} className="reason-item reason-item--warn">
                  <span aria-hidden="true">⚠</span>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel-section">
            <h3>Around this waterbody</h3>
            <ul className="context-list">
              <li>
                <span>Rainfall last 7 days</span>
                <span>
                  {story.surroundings.rainfallTrend}{' '}
                  {story.surroundings.rainfall7d}
                </span>
              </li>
              <li>
                <span>Urban land coverage</span>
                <span>{story.surroundings.urbanCoverage}</span>
              </li>
              <li>
                <span>Riparian vegetation</span>
                <span>{story.surroundings.riparianVegetation}</span>
              </li>
              <li>
                <span>Recent citizen litter reports</span>
                <span>{story.surroundings.litterReports}</span>
              </li>
            </ul>
            <p className="demo-note">
              Surroundings context is illustrative demo data for storytelling.
            </p>
          </section>

          <section className="panel-section">
            <h3>What can be done?</h3>
            <ul className="action-list">
              {story.actions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
            <button type="button" className="btn-primary contribute-btn">
              Contribute an observation
            </button>
          </section>

          {observation.unusualEventBoost ? (
            <p className="event-callout" role="note">
              Historically unusual, but nearby citizens report similar values —
              possible real environmental event. Prefer verification over
              discarding.
            </p>
          ) : null}

          <details className="evidence-details">
            <summary>Technical evidence breakdown</summary>

            <TrustBadge
              trustLevel={observation.trustLevel}
              trustLabel={observation.trustLabel}
              overallScore={observation.overallScore}
              verificationRequested={verificationRequested}
            />

            <ul className="evidence-bars">
              {EVIDENCE_ROWS.map((row) => {
                const value = observation[row.key]
                return (
                  <li key={row.key}>
                    <div className="evidence-bar-label">
                      <span>{row.label}</span>
                      <span>{value}%</span>
                    </div>
                    <div className="evidence-bar-track">
                      <div
                        className="evidence-bar-fill"
                        style={{ width: `${value}%` }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>

            <p className={trend.className}>
              {isVerified
                ? 'Citizen-verified — supporting evidence collected'
                : trend.text}
            </p>

            {observation.trustLevel === 'medium' && !isVerified && (
              <div className="verify-block">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={onRequestVerification}
                  disabled={verificationRequested}
                >
                  Request Verification
                </button>
                {verificationRequested ? (
                  <p className="verify-note" role="status">
                    Verification request created.
                  </p>
                ) : null}
              </div>
            )}
          </details>
        </>
      ) : null}
    </aside>
  )
}

export default EvidencePanel
