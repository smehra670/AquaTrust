function SummaryStrip({ observations }) {
  const high = observations.filter((item) => item.trustLevel === 'high').length
  const medium = observations.filter((item) => item.trustLevel === 'medium').length
  const low = observations.filter((item) => item.trustLevel === 'low').length

  return (
    <section className="map-card summary-card" aria-label="Observation summary">
      <p className="summary-total">
        {observations.length} observation{observations.length === 1 ? '' : 's'}
      </p>
      <ul className="summary-counts">
        <li>
          <span className="legend-dot legend-dot--high" />
          {high} high trust
        </li>
        <li>
          <span className="legend-dot legend-dot--medium" />
          {medium} need verification
        </li>
        <li>
          <span className="legend-dot legend-dot--low" />
          {low} low trust
        </li>
      </ul>
    </section>
  )
}

export default SummaryStrip
