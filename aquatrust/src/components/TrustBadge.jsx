function TrustBadge({ trustLevel, trustLabel, overallScore, verificationRequested }) {
  return (
    <div className="trust-badge-block">
      <div className={`trust-badge trust-badge--${trustLevel}`}>
        <span className={`legend-dot legend-dot--${trustLevel}`} />
        <span className="trust-badge-label">{trustLabel}</span>
      </div>

      {Number.isFinite(overallScore) ? (
        <p className="trust-score-line">
          Overall score <strong>{overallScore} / 100</strong>
        </p>
      ) : null}

      {verificationRequested ? (
        <span className="verify-requested-badge">Verification requested</span>
      ) : null}
    </div>
  )
}

export default TrustBadge
