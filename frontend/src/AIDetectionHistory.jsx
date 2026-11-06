export default function AIDetectionHistory({ records, onSelectRecord, onClearHistory }) {
  if (!records || records.length === 0) {
    return (
      <div className="card history-card fade-up" style={{ marginTop: 24 }}>
        <div className="card-header">
          <div className="card-title">
            <span className="card-title-icon">🛡️</span>
            <span>AI Detection History Record</span>
          </div>
        </div>
        <div className="empty-history">
          <span style={{ fontSize: 24, opacity: 0.5 }}>📭</span>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
            No AI detection records yet. Upload an image in the AI Detector to test the model.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="card history-card fade-up" style={{ marginTop: 24 }}>
      <div className="card-header">
        <div className="card-title">
          <span className="card-title-icon">🛡️</span>
          <span>AI Detection History Record</span>
          <span className="history-count-badge">{records.length} Scans</span>
        </div>

        {onClearHistory && (
          <button
            type="button"
            className="history-clear-btn"
            onClick={onClearHistory}
            title="Clear all AI detection records"
          >
            Clear History
          </button>
        )}
      </div>

      <div className="history-table-wrap">
        <table className="history-table">
          <thead>
            <tr>
              <th>Image</th>
              <th>Verdict / Class</th>
              <th>Confidence Score</th>
              <th>Real %</th>
              <th>AI %</th>
              <th>Timestamp</th>
              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {records.map((rec) => {
              const recVerdict = rec.verdict || (
                rec.label === 'Likely AI' || rec.label === 'AI-generated' || rec.label === 'AI-Generated'
                  ? 'likely_ai'
                  : (rec.label === 'Uncertain' ? 'uncertain' : 'likely_real')
              )
              const isAI = recVerdict === 'likely_ai'
              const isUncertain = recVerdict === 'uncertain'
              const pct = ((rec.confidence || 0) * 100).toFixed(1)

              return (
                <tr key={rec.id} className="history-row">
                  <td className="history-img-cell">
                    <div className="history-thumb-wrap">
                      {rec.thumbnailUrl ? (
                        <img
                          src={rec.thumbnailUrl}
                          alt={rec.imageName}
                          className="history-thumb-img"
                        />
                      ) : (
                        <span className="history-thumb-placeholder">🖼️</span>
                      )}
                    </div>
                  </td>

                  <td className="history-label-cell">
                    <div className="history-main-label">
                      <span
                        className={`ai-verdict-badge ${isAI ? 'ai' : isUncertain ? 'uncertain' : 'real'}`}
                        style={{
                          fontSize: 12,
                          padding: '3px 10px',
                          marginRight: 8,
                          ...(isUncertain ? {
                            background: 'rgba(148, 163, 184, 0.15)',
                            color: '#94a3b8',
                            borderColor: 'rgba(148, 163, 184, 0.3)',
                          } : {}),
                        }}
                      >
                        {isAI ? '⚠ Likely AI' : isUncertain ? '❓ Uncertain' : '✓ Likely Real'}
                      </span>
                      <span>{rec.label || (isAI ? 'AI-Generated' : isUncertain ? 'Uncertain' : 'Real Image')}</span>
                    </div>
                    <div className="history-filename" style={{ marginTop: 4 }}>
                      {rec.imageName || 'image.jpg'}
                    </div>
                  </td>

                  <td className="history-confidence-cell">
                    <div className="confidence-num-wrap">
                      <span className="confidence-num">{pct}%</span>
                    </div>
                    <div className="bar-track history-bar">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${pct}%`,
                          background: isAI
                            ? 'linear-gradient(90deg, #f43f5e, #e11d48)'
                            : isUncertain
                            ? 'linear-gradient(90deg, #94a3b8, #64748b)'
                            : 'linear-gradient(90deg, #10b981, #059669)',
                        }}
                      />
                    </div>
                  </td>

                  <td style={{ color: 'var(--emerald)', fontSize: 13, fontWeight: 600 }}>
                    {rec.probabilities ? `${(rec.probabilities.real * 100).toFixed(1)}%` : '—'}
                  </td>

                  <td style={{ color: 'var(--rose)', fontSize: 13, fontWeight: 600 }}>
                    {rec.probabilities ? `${(rec.probabilities.ai * 100).toFixed(1)}%` : '—'}
                  </td>

                  <td className="history-time-cell">
                    {rec.timestamp || 'Recent'}
                  </td>

                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="history-action-btn"
                      onClick={() => onSelectRecord(rec)}
                      title="Inspect in AI Detector"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
