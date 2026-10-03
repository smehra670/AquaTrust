/**
 * Local Issues & Actions — evidence-first cards for the side panel.
 * Language carefully avoids unsupported causal claims.
 */

function confidenceClass(confidence) {
  if (confidence === 'HIGH') return 'issue-confidence--high'
  if (confidence === 'MEDIUM') return 'issue-confidence--medium'
  return 'issue-confidence--low'
}

function LocalIssuesActions({
  issues = [],
  onCreateVerificationMission,
  activeMissionIssueId = null,
}) {
  return (
    <section className="panel-section local-issues">
      <h3>Local Issues & Actions</h3>
      <p className="issues-preface">
        AquaTrust flags patterns in available evidence. It does not claim to know
        the true cause of a problem.
      </p>

      {issues.length === 0 ? (
        <div className="issues-empty">
          <p>
            No evidence-backed environmental issue is currently detected.
          </p>
          <p className="demo-note">
            Monitoring should continue as new observations arrive.
          </p>
        </div>
      ) : (
        <ul className="issue-list">
          {issues.map((issue) => (
            <li key={issue.id} className="issue-card">
              <div className="issue-card-head">
                <p className="issue-title">
                  <span aria-hidden="true">⚠</span> {issue.title}
                </p>
                <span
                  className={`issue-confidence ${confidenceClass(issue.confidence)}`}
                >
                  Confidence: {issue.confidence}
                </span>
              </div>

              <p className="issue-why-label">Why AquaTrust flagged this</p>
              <p className="issue-explanation">{issue.explanation}</p>

              <p className="issue-subhead">Evidence</p>
              <ul className="issue-evidence">
                {issue.evidence.map((item) => (
                  <li key={`${issue.id}-${item.text}`}>
                    <span className={`source-chip source-chip--${item.source.toLowerCase()}`}>
                      {item.source}
                    </span>
                    {item.text}
                  </li>
                ))}
              </ul>

              <p className="issue-subhead">Possible contributing factors</p>
              <p className="issue-soft">
                Possible contributing factors include:
              </p>
              <ul className="issue-bullets">
                {issue.possibleContributors.map((factor) => (
                  <li key={factor}>{factor}</li>
                ))}
              </ul>

              <div className="issue-actions-grid">
                <div>
                  <p className="issue-subhead">What citizens can do</p>
                  <ul className="issue-bullets">
                    {issue.suggestedActions.citizens.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="issue-subhead">
                    What authorities/researchers could investigate
                  </p>
                  <ul className="issue-bullets">
                    {issue.suggestedActions.authorities.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {issue.dataGaps?.length > 0 ? (
                <div className="issue-gap">
                  <p className="issue-subhead">More evidence needed</p>
                  <ul className="issue-bullets">
                    {issue.dataGaps.map((gap) => (
                      <li key={gap}>{gap}</li>
                    ))}
                  </ul>
                  {issue.verificationMission ? (
                    <div className="issue-mission">
                      <p className="mission-kicker">Suggested verification mission</p>
                      <p className="issue-mission-task">
                        {issue.verificationMission.instruction}
                      </p>
                      {issue.recommendedChecks[0] ? (
                        <p className="issue-recommended">
                          Recommended next check: {issue.recommendedChecks[0]}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() =>
                          onCreateVerificationMission?.(issue)
                        }
                      >
                        {activeMissionIssueId === issue.id
                          ? 'Verification mission created'
                          : 'Create Verification Mission'}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <details className="issue-sources">
                <summary>Sources used</summary>
                <ul className="issue-source-list">
                  {issue.sources.map((source, index) => (
                    <li key={`${issue.id}-src-${index}`}>
                      <strong>{source.type}</strong>
                      {source.label}
                      {source.detail ? ` · ${source.detail}` : ''}
                      {source.date ? ` · ${source.date}` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default LocalIssuesActions
