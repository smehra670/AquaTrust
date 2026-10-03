import heroImage from '../../1mAup9.webp'

function HomePage({
  showAbout = false,
  onExplore,
  onAddReading,
  onGraphs,
  onCloseAbout,
}) {
  return (
    <main className="home-page">
      <div
        className="home-backdrop"
        style={{ '--hero-image': `url("${heroImage}")` }}
        aria-hidden="true"
      />
      <div className="home-hero-mist" aria-hidden="true" />

      <section className="home-hero-content">
        <h1>
          Protecting Rivers,
          <br />
          Restoring Trust.
        </h1>
        <p className="home-lead">
          Official Environment Agency data and citizen readings, scored so you
          can see what is trustworthy — and what still needs verification.
        </p>
        <div className="home-actions">
          <button
            type="button"
            className="home-button home-button--dark"
            onClick={onExplore}
          >
            Explore The Map
          </button>
          <button
            type="button"
            className="home-button home-button--ghost"
            onClick={onAddReading}
          >
            Add A Reading
          </button>
        </div>
      </section>

      {showAbout ? (
        <section
          className="home-about-panel"
          id="how-it-works"
          aria-label="How AquaTrust works"
        >
          <button
            type="button"
            className="home-about-close"
            onClick={onCloseAbout}
            aria-label="Close how it works"
          >
            Close
          </button>
          <div className="home-story-copy">
            <p className="home-section-label">Why AquaTrust</p>
            <h2>Unusual data should be investigated, not ignored.</h2>
            <p>
              AquaTrust combines official monitoring with explainable checks for
              citizen readings. Every score shows its evidence, and VerifyMe asks
              the community to independently confirm possible events.
            </p>
          </div>
          <div className="home-process">
            <article>
              <span>01</span>
              <div>
                <h3>Explore</h3>
                <p>Find rivers, EA sites and available measurements.</p>
              </div>
            </article>
            <article>
              <span>02</span>
              <div>
                <h3>Contribute</h3>
                <p>Add pH, turbidity and temperature readings.</p>
              </div>
            </article>
            <article>
              <span>03</span>
              <div>
                <h3>Verify</h3>
                <p>Confirm unusual readings with independent evidence.</p>
              </div>
            </article>
            <button type="button" className="home-text-link" onClick={onGraphs}>
              Open evidence dashboard <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>
      ) : null}
    </main>
  )
}

export default HomePage
