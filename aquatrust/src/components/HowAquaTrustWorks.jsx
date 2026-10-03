import { useState } from 'react'

function HowAquaTrustWorks() {
  const [open, setOpen] = useState(false)

  return (
    <section className="map-card how-card" aria-label="How AquaTrust works">
      <button
        type="button"
        className="how-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>How AquaTrust works</span>
        <span className="how-chevron" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>

      {open ? (
        <div className="how-body">
          <p>
            AquaTrust does not treat unusual data as incorrect. Each observation
            is evaluated using historical consistency, nearby agreement, physical
            plausibility, and photo quality.
          </p>
          <ol className="how-flow">
            <li>Observation</li>
            <li>Evidence checks</li>
            <li>Trust rating</li>
            <li>Trend inclusion / verification</li>
          </ol>
        </div>
      ) : null}
    </section>
  )
}

export default HowAquaTrustWorks
