import { useState } from 'react'

/**
 * Citizen verification mission for Needs Verification observations.
 * Multi-metric checks feed an auditable evaluateVerification result.
 */
function VerifyMeCard({
  observation,
  verificationResult,
  onSubmitVerification,
  missionOverride = null,
}) {
  const [showForm, setShowForm] = useState(Boolean(missionOverride))
  const [ph, setPh] = useState('')
  const [turbidity, setTurbidity] = useState('')
  const [temperature, setTemperature] = useState('')
  const [formError, setFormError] = useState('')

  const checkLabel = missionOverride?.metric || 'pH + supporting metrics'
  const originalDisplay =
    missionOverride?.metric === 'turbidity'
      ? `${observation.turbidity} NTU`
      : missionOverride?.metric === 'temperature'
        ? `${observation.temperature.toFixed(1)}°C`
        : missionOverride?.metric === 'photo'
          ? 'Photo evidence'
          : `pH ${observation.ph.toFixed(1)} · ${observation.turbidity} NTU · ${observation.temperature.toFixed(1)}°C`
  const taskText =
    missionOverride?.instruction ||
    'Take independent measurements near this location (pH required; turbidity and temperature strengthen verification).'

  function submitForm(event) {
    event.preventDefault()
    const parsedPh = Number(ph)
    if (!Number.isFinite(parsedPh)) {
      setFormError('Please enter a pH value.')
      return
    }
    setFormError('')
    onSubmitVerification({
      ph: parsedPh,
      turbidity: turbidity === '' ? null : Number(turbidity),
      temperature: temperature === '' ? null : Number(temperature),
    })
    setShowForm(false)
  }

  if (verificationResult?.status === 'confirmed') {
    return (
      <section className="panel-section verifyme-card verifyme-card--confirmed">
        <p className="verifyme-badge">CONFIRMED EVENT</p>
        <h3>Verification successful</h3>
        <p className="verifyme-copy">
          {verificationResult.summary ||
            `Independent check agreed (pH ${Number(verificationResult.submittedPh).toFixed(1)} vs original ${observation.ph.toFixed(1)}).`}
        </p>
        {verificationResult.agreedMetrics?.length ? (
          <p className="verifyme-copy">
            Agreed metrics: {verificationResult.agreedMetrics.join(', ')}.
            Confidence {verificationResult.confidence ?? '—'}%
          </p>
        ) : null}
        {verificationResult.checks?.length ? (
          <ul className="verifyme-audit">
            {verificationResult.checks.map((check) => (
              <li key={check.metric}>
                <strong>{check.metric}</strong>: {check.reason}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="verifyme-status">Needs Verification → Verified</p>
      </section>
    )
  }

  if (verificationResult?.status === 'conflict' && !showForm) {
    return (
      <section className="panel-section verifyme-card verifyme-card--conflict">
        <h3>Conflicting evidence</h3>
        <p className="verifyme-copy">
          {verificationResult.summary ||
            'More observations are needed before this reading can be trusted.'}
        </p>
        {verificationResult.checks?.length ? (
          <ul className="verifyme-audit">
            {verificationResult.checks.map((check) => (
              <li key={check.metric}>
                <strong>{check.metric}</strong>: {check.reason}
              </li>
            ))}
          </ul>
        ) : (
          <p className="verifyme-copy">
            Submitted pH {Number(verificationResult.submittedPh).toFixed(1)}{' '}
            differs from original {observation.ph.toFixed(1)}.
          </p>
        )}
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setShowForm(true)
            setPh('')
            setTurbidity('')
            setTemperature('')
            setFormError('')
          }}
        >
          Try another verification
        </button>
      </section>
    )
  }

  return (
    <section className="panel-section verifyme-card">
      <h3>Verification needed</h3>
      <p className="verifyme-copy">
        This reading is unusual or does not yet have enough supporting evidence.
      </p>
      <p className="verifyme-explain">
        AquaTrust does not automatically reject unusual observations. Independent
        VerifyMe checks (pH + optional turbidity/temperature) produce an auditable
        agree/conflict result.
      </p>

      <div className="mission-box">
        <p className="mission-kicker">Verification Mission</p>
        <p className="mission-site">{observation.siteName}</p>
        <dl className="mission-facts">
          <div>
            <dt>Check</dt>
            <dd>{checkLabel}</dd>
          </div>
          <div>
            <dt>Original reading</dt>
            <dd>{originalDisplay}</dd>
          </div>
        </dl>
        <p className="mission-task">
          <strong>Task:</strong> {taskText}
        </p>

        {!showForm ? (
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowForm(true)}
          >
            Verify this reading
          </button>
        ) : (
          <VerificationForm
            ph={ph}
            turbidity={turbidity}
            temperature={temperature}
            formError={formError}
            onPhChange={setPh}
            onTurbidityChange={setTurbidity}
            onTemperatureChange={setTemperature}
            onSubmit={submitForm}
          />
        )}
      </div>
    </section>
  )
}

function VerificationForm({
  ph,
  turbidity,
  temperature,
  formError,
  onPhChange,
  onTurbidityChange,
  onTemperatureChange,
  onSubmit,
}) {
  return (
    <form className="verifyme-form" onSubmit={onSubmit}>
      <label>
        pH <span className="required">required</span>
        <input
          type="number"
          step="0.1"
          min="0"
          max="14"
          value={ph}
          onChange={(event) => onPhChange(event.target.value)}
          placeholder="e.g. 5.0"
          required
        />
      </label>
      <label>
        Turbidity <span className="optional">recommended</span>
        <input
          type="number"
          step="0.1"
          min="0"
          value={turbidity}
          onChange={(event) => onTurbidityChange(event.target.value)}
          placeholder="NTU"
        />
      </label>
      <label>
        Temperature <span className="optional">recommended</span>
        <input
          type="number"
          step="0.1"
          value={temperature}
          onChange={(event) => onTemperatureChange(event.target.value)}
          placeholder="°C"
        />
      </label>
      {formError ? <p className="form-error">{formError}</p> : null}
      <button type="submit" className="btn-primary">
        Submit Verification
      </button>
    </form>
  )
}

export default VerifyMeCard
