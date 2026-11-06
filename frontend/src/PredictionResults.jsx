import { useEffect, useState } from 'react'

function ConfidenceBar({ prediction, rank }) {
  const [width, setWidth] = useState(0)
  const pct = (prediction.confidence * 100).toFixed(1)

  useEffect(() => {
    // Animate in on mount
    const t = setTimeout(() => setWidth(prediction.confidence * 100), 50)
    return () => clearTimeout(t)
  }, [prediction.confidence])

  const barClass = `bar-fill rank-${rank}`

  return (
    <div className="topk-item">
      <div className="topk-meta">
        <span className="topk-rank">#{rank}</span>
        <span className="topk-label">{prediction.label.replace(/_/g, ' ')}</span>
        <span className="topk-pct">{pct}%</span>
      </div>
      <div className="bar-track">
        <div className={barClass} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

export default function PredictionResults({ result, loading, error }) {
  if (error) {
    return (
      <div className="results-section fade-up">
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <span className="card-title-icon">🎯</span> Prediction
            </span>
          </div>
          <div className="error-box" style={{ margin: 0 }}>
            <span className="error-icon">⚠️</span>
            <span>{error}</span>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="results-section fade-up">
        <div className="card">
          <div className="skeleton" style={{ height: 18, width: '40%', marginBottom: 20 }} />
          <div className="skeleton" style={{ height: 80, marginBottom: 20 }} />
          <div className="skeleton" style={{ height: 12, width: '100%', marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 12, width: '85%', marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 12, width: '65%' }} />
        </div>
      </div>
    )
  }

  if (!result) return null

  const { status, top1, top_k, model_name, inference_ms, low_confidence } = result

  return (
    <div className="results-section fade-up">
      {/* Top-1 Hero */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <span className="card-title-icon">🎯</span> Prediction
          </span>
          <span className={`status-badge ${status}`}>
            {status === 'confident' ? '✓ Confident' : '⚠ Not Sure'}
          </span>
        </div>

        {low_confidence && (
          <p style={{ fontSize: 13, color: '#d97706', margin: '0 0 14px', lineHeight: 1.5 }}>
            ⚠ Not sure: this model knows 1000 everyday object and animal categories and may not recognize this image.
          </p>
        )}

        <div className="top1-hero">
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Top Match</div>
            <div className="top1-label">{top1.label.replace(/_/g, ' ')}</div>
          </div>
          <div className="top1-confidence">
            {(top1.confidence * 100).toFixed(1)}%
          </div>
        </div>

        {/* Top-K Bars */}
        {top_k.length > 1 && (
          <>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 14 }}>
              Top {top_k.length} Results
            </div>
            <div className="topk-list">
              {top_k.map((pred, i) => (
                <ConfidenceBar key={pred.label} prediction={pred} rank={i + 1} />
              ))}
            </div>
          </>
        )}

        {/* Meta chips */}
        <div className="meta-row">
          <div className="meta-chip">⚡ <span>{inference_ms} ms</span></div>
          <div className="meta-chip">🧠 <span>{model_name}</span></div>
          <div className="meta-chip">📊 <span>ImageNet · 1000 classes</span></div>
        </div>
      </div>
    </div>
  )
}
