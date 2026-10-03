import { useEffect, useState } from 'react'
import { validateReadingInput } from '../utils/createReading'
import { assessEvidenceImage } from '../utils/imageAuditor'

/**
 * Official filing form for a new citizen water reading.
 * Runs AI checks on values + optional evidence photo before / after submit.
 */
function AddReadingModal({
  open,
  onClose,
  onSubmit,
  defaults = null,
  user = null,
}) {
  const [siteName, setSiteName] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [ph, setPh] = useState('')
  const [turbidity, setTurbidity] = useState('')
  const [temperature, setTemperature] = useState('')
  const [notes, setNotes] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [errors, setErrors] = useState([])
  const [aiResult, setAiResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setSiteName(defaults?.siteName || '')
    setLat(
      Number.isFinite(defaults?.lat) ? String(defaults.lat.toFixed(5)) : ''
    )
    setLng(
      Number.isFinite(defaults?.lng) ? String(defaults.lng.toFixed(5)) : ''
    )
    setPh('')
    setTurbidity('')
    setTemperature('')
    setNotes('')
    setPhotoFile(null)
    setPhotoPreview('')
    setErrors([])
    setAiResult(null)
    setSubmitting(false)
  }, [open, defaults])

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview('')
      return undefined
    }
    const url = URL.createObjectURL(photoFile)
    setPhotoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photoFile])

  if (!open) return null

  async function handleSubmit(event) {
    event.preventDefault()
    const payload = {
      siteName,
      lat,
      lng,
      ph,
      turbidity,
      temperature,
      notes,
      photoFile,
    }
    const nextErrors = validateReadingInput(payload)
    if (!photoFile) {
      nextErrors.push('A river / watercourse photo is required.')
    }
    if (nextErrors.length) {
      setErrors(nextErrors)
      return
    }
    setErrors([])
    setSubmitting(true)
    try {
      const imageAssessment = await assessEvidenceImage(photoFile)
      const result = await Promise.resolve(
        onSubmit({
          ...payload,
          photoQuality: imageAssessment.photoQuality,
          imageAssessment,
          photoName: photoFile?.name || '',
          hasPhoto: Boolean(photoFile),
        })
      )
      if (result?.aiAssessment) {
        setAiResult(result.aiAssessment)
      } else {
        onClose()
      }
    } finally {
      setSubmitting(false)
    }
  }

  function handleDone() {
    setAiResult(null)
    onClose()
  }

  return (
    <div className="add-reading-overlay" role="presentation" onClick={handleDone}>
      <div
        className="add-reading-modal add-reading-modal--official"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-reading-title"
        onClick={(event) => event.stopPropagation()}
      >
        {aiResult ? (
          <>
            <div className="add-reading-header">
              <div>
                <p className="panel-eyebrow">Official AI audit</p>
                <h2 id="add-reading-title">Filing assessed</h2>
              </div>
              <button
                type="button"
                className="panel-close"
                onClick={handleDone}
                aria-label="Close"
              >
                Close
              </button>
            </div>

            <div
              className={`ai-verdict ai-verdict--${aiResult.verdict}`}
              role="status"
            >
              <p className="ai-verdict-label">{aiResult.label}</p>
              <p className="ai-verdict-summary">{aiResult.summary}</p>
              <p className="ai-verdict-confidence">
                Confidence {aiResult.confidence}%
              </p>
            </div>

            <ul className="ai-check-list">
              {(aiResult.checks || []).map((check) => (
                <li
                  key={check.id}
                  className={`ai-check ai-check--${check.status}`}
                >
                  <strong>{check.title}</strong>
                  <span>{check.detail}</span>
                </li>
              ))}
            </ul>

            <div className="add-reading-actions">
              <button type="button" className="btn-primary" onClick={handleDone}>
                View on map
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="add-reading-header">
              <div>
                <p className="panel-eyebrow">Official filing</p>
                <h2 id="add-reading-title">File a reading</h2>
              </div>
              <button
                type="button"
                className="panel-close"
                onClick={onClose}
                aria-label="Close"
              >
                Close
              </button>
            </div>

            <p className="add-reading-intro">
              Filed by <strong>{user?.name || 'contributor'}</strong>. AI checks
              your values against this river’s existing AquaTrust data and
              verifies the photo is a real watercourse scene.
            </p>

            <form className="add-reading-form" onSubmit={handleSubmit}>
              <label>
                Site / watercourse name <span className="required">required</span>
                <input
                  type="text"
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  placeholder="e.g. River Lea – Homerton"
                  required
                />
              </label>

              <div className="add-reading-grid">
                <label>
                  Latitude <span className="required">required</span>
                  <input
                    type="number"
                    step="0.00001"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Longitude <span className="required">required</span>
                  <input
                    type="number"
                    step="0.00001"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    required
                  />
                </label>
              </div>

              <div className="add-reading-grid add-reading-grid--3">
                <label>
                  pH <span className="required">required</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="14"
                    value={ph}
                    onChange={(e) => setPh(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Turbidity (NTU) <span className="required">required</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={turbidity}
                    onChange={(e) => setTurbidity(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Temperature (°C) <span className="required">required</span>
                  <input
                    type="number"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    required
                  />
                </label>
              </div>

              <label>
                River photo <span className="required">required</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                  required
                />
              </label>
              <p className="add-reading-photo-hint">
                Only river / watercourse photos pass. Cars, people, indoors and
                other subjects are rejected.
              </p>
              {photoPreview ? (
                <img
                  className="add-reading-photo-preview"
                  src={photoPreview}
                  alt="Evidence preview"
                />
              ) : null}

              <label>
                Field notes <span className="optional">optional</span>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Weather, sampling method, anything unusual…"
                />
              </label>

              {errors.length > 0 ? (
                <ul className="add-reading-errors">
                  {errors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              ) : null}

              <div className="add-reading-actions">
                <button type="button" className="btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting}
                >
                  {submitting ? 'Auditing…' : 'Submit & AI audit'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

export default AddReadingModal
