import { FILTER_OPTIONS } from '../data/observations'
import { WATERCOURSE_FORMS } from '../utils/watercourses'

const LEGEND_ITEMS = [
  { id: 'high', label: 'High Trust (citizen)' },
  { id: 'medium', label: 'Needs verification (citizen)' },
  { id: 'low', label: 'Low Trust (citizen)' },
]

const RIVER_DATA_ITEMS = [
  { id: 'high', label: 'Strong official EA data' },
  { id: 'medium', label: 'Limited official EA data' },
  { id: 'low', label: 'Little / no official EA data' },
]

const WATER_TYPES = [
  WATERCOURSE_FORMS.inlandRiver,
  WATERCOURSE_FORMS.tidalRiver,
  WATERCOURSE_FORMS.canal,
  WATERCOURSE_FORMS.lake,
]

function MapLegend({
  visibleLevels,
  onToggleFilter,
  officialStationsError = null,
}) {
  const allActive = visibleLevels.length === 3

  return (
    <section className="map-card legend-card" aria-label="Map legend">
      <p className="map-card-title">Watercourses</p>
      <ul className="legend-list">
        {WATER_TYPES.map((item) => (
          <li key={item.id}>
            <span
              className="legend-line"
              style={{ background: item.color }}
              aria-hidden="true"
            />
            {item.label}
          </li>
        ))}
      </ul>
      <p className="legend-note">Source: OS Open Rivers</p>

      <p className="map-card-title legend-section-title">
        River official data
      </p>
      <ul className="legend-list">
        {RIVER_DATA_ITEMS.map((item) => (
          <li key={`river-${item.id}`}>
            <span className={`legend-dot legend-dot--river-${item.id}`} />
            {item.label}
          </li>
        ))}
      </ul>
      <p className="legend-note">
        Circles = major rivers coloured by nearby Environment Agency sites
      </p>

      <p className="map-card-title legend-section-title">Citizen evidence</p>
      <div className="filter-pills" role="group" aria-label="Filter by trust level">
        {FILTER_OPTIONS.map((option) => {
          const isActive =
            option.id === 'all' ? allActive : visibleLevels.includes(option.id)

          return (
            <button
              key={option.id}
              type="button"
              className={`filter-pill${isActive ? ' is-active' : ''}`}
              aria-pressed={isActive}
              onClick={() => onToggleFilter(option.id)}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      <ul className="legend-list">
        {LEGEND_ITEMS.map((item) => (
          <li key={item.id}>
            <span className={`legend-dot legend-dot--${item.id}`} />
            {item.label}
          </li>
        ))}
        <li>
          <span className="legend-square legend-square--official" />
          Official EA monitoring site
        </li>
      </ul>

      {officialStationsError ? (
        <p className="legend-note legend-note--error">{officialStationsError}</p>
      ) : (
        <p className="legend-note">
          Green / yellow / red rivers use real EA station coverage only
        </p>
      )}
    </section>
  )
}

export default MapLegend
