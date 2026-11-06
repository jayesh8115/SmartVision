export default function ClassificationHistory({ records, onSelectRecord, onClearHistory }) {
  if (!records || records.length === 0) {
    return (
      <div className="card history-card fade-up">
        <div className="card-header">
          <div className="card-title">
            <span className="card-title-icon">📜</span>
            <span>Classification History Record</span>
          </div>
        </div>
        <div className="empty-history">
          <span style={{ fontSize: 24, opacity: 0.5 }}>📭</span>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
            No classification records yet. Upload an image or click a sample above to test the model.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="card history-card fade-up">
      <div className="card-header">
        <div className="card-title">
          <span className="card-title-icon">📜</span>
          <span>Classification History Record</span>
          <span className="history-count-badge">{records.length} Scans</span>
        </div>

        {onClearHistory && (
          <button
            type="button"
            className="history-clear-btn"
            onClick={onClearHistory}
            title="Clear all history records"
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
              <th>Top-1 Predicted Class</th>
              <th>Confidence Score</th>
              <th>Status</th>
              <th>Latency</th>
              <th>Timestamp</th>
              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {records.map((rec) => {
              const pct = (rec.top1?.confidence ? rec.top1.confidence * 100 : 0).toFixed(1)
              const isConfident = rec.status === 'confident' || rec.top1?.confidence >= 0.4

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
                    <div className="history-main-label">{rec.top1?.label || 'Unknown'}</div>
                    <div className="history-filename">{rec.imageName || 'image.jpg'}</div>
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
                          background: isConfident
                            ? 'var(--grad-brand)'
                            : 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                        }}
                      />
                    </div>
                  </td>

                  <td>
                    <span className={`status-badge ${isConfident ? 'confident' : 'not_sure'}`}>
                      {isConfident ? '✓ Confident' : '⚠ Not Sure'}
                    </span>
                  </td>

                  <td className="history-ms-cell">
                    <span className="meta-chip">
                      ⚡ {rec.inference_ms ? `${Math.round(rec.inference_ms)}ms` : '40ms'}
                    </span>
                  </td>

                  <td className="history-time-cell">
                    {rec.timestamp || 'Recent'}
                  </td>

                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="history-action-btn"
                      onClick={() => onSelectRecord(rec)}
                      title="Load into workspace"
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
