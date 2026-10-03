/**
 * Official registry of the signed-in contributor's filed readings.
 */
function MyReadingsPage({
  user = null,
  readings = [],
  onAddReading,
  onOpenReading,
  onDeleteReading,
  onSignIn,
}) {
  if (!user) {
    return (
      <main className="my-readings-page">
        <section className="my-readings-intro">
          <p className="home-section-label">My readings</p>
          <h1>Your filed findings</h1>
          <p>
            Sign in to see readings you have submitted, open them on the map, or
            withdraw inaccurate filings.
          </p>
          <button type="button" className="btn-primary" onClick={onSignIn}>
            Sign in
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="my-readings-page">
      <section className="my-readings-intro">
        <div>
          <p className="home-section-label">Contributor registry</p>
          <h1>My readings</h1>
          <p>
            Official record of findings filed by{' '}
            <strong>{user.name}</strong>. Each submission is AI-audited for
            value plausibility and evidence-photo quality.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={onAddReading}>
          + File a reading
        </button>
      </section>

      {readings.length === 0 ? (
        <p className="my-readings-empty">
          No readings filed yet. Submit a measurement to start your record.
        </p>
      ) : (
        <div className="my-readings-table-wrap">
          <table className="my-readings-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Site</th>
                <th>pH</th>
                <th>Turbidity</th>
                <th>Temp</th>
                <th>AI verdict</th>
                <th>Filed</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {readings.map((row) => {
                const verdict = row.aiAssessment?.verdict || 'review'
                const label = row.aiAssessment?.label || 'Pending review'
                return (
                  <tr key={row.id}>
                    <td>
                      <code>
                        AT-
                        {String(row.id).replace(/^c_/, '').slice(0, 8).toUpperCase()}
                      </code>
                    </td>
                    <td>
                      <strong>{row.siteName}</strong>
                      <span className="my-readings-coords">
                        {Number(row.lat).toFixed(4)}, {Number(row.lng).toFixed(4)}
                      </span>
                    </td>
                    <td>{Number(row.ph).toFixed(1)}</td>
                    <td>{Number(row.turbidity).toFixed(1)} NTU</td>
                    <td>{Number(row.temperature).toFixed(1)}°C</td>
                    <td>
                      <span className={`ai-pill ai-pill--${verdict}`}>
                        {label}
                      </span>
                    </td>
                    <td>{row.timestamp || '—'}</td>
                    <td className="my-readings-actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => onOpenReading?.(row.id)}
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        className="btn-danger"
                        onClick={() => onDeleteReading?.(row.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

export default MyReadingsPage
