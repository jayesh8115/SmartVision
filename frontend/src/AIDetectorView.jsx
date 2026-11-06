import { useState, useCallback, useRef, useEffect } from 'react'
import { detectAIImage } from './services/api'

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function ConfidenceGauge({ value, label, color }) {
  const [animatedValue, setAnimatedValue] = useState(0)
  const pct = (value * 100).toFixed(1)
  const circumference = 2 * Math.PI * 54 // radius=54
  const strokeDashoffset = circumference - (animatedValue / 100) * circumference

  useEffect(() => {
    const t = setTimeout(() => setAnimatedValue(value * 100), 80)
    return () => clearTimeout(t)
  }, [value])

  return (
    <div className="ai-gauge-wrap">
      <svg className="ai-gauge-svg" viewBox="0 0 120 120">
        <circle className="ai-gauge-track" cx="60" cy="60" r="54" fill="none" strokeWidth="8" />
        <circle
          className="ai-gauge-fill"
          cx="60" cy="60" r="54"
          fill="none" strokeWidth="8" strokeLinecap="round"
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="ai-gauge-center">
        <span className="ai-gauge-pct">{pct}%</span>
        <span className="ai-gauge-label">{label}</span>
      </div>
    </div>
  )
}

function ProbabilityBar({ label, value, color, delay = 0 }) {
  const [width, setWidth] = useState(0)
  const pct = (value * 100).toFixed(1)

  useEffect(() => {
    const t = setTimeout(() => setWidth(value * 100), 50 + delay)
    return () => clearTimeout(t)
  }, [value, delay])

  return (
    <div className="ai-prob-item">
      <div className="ai-prob-meta">
        <span className="ai-prob-dot" style={{ background: color }} />
        <span className="ai-prob-label">{label}</span>
        <span className="ai-prob-pct">{pct}%</span>
      </div>
      <div className="ai-prob-track">
        <div className="ai-prob-fill" style={{ width: `${width}%`, background: color }} />
      </div>
    </div>
  )
}

// ── Detector History Panel ────────────────────────────────────────────────────
function DetectorHistory({ records, onSelectRecord, onClearHistory }) {
  if (!records || records.length === 0) {
    return (
      <div className="card history-card fade-up" style={{ marginTop: 32 }}>
        <div className="card-header">
          <div className="card-title">
            <span className="card-title-icon">🛡️</span>
            <span>AI Detection History</span>
          </div>
        </div>
        <div className="empty-history">
          <span style={{ fontSize: 24, opacity: 0.5 }}>📭</span>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
            No detection records yet. Upload an image and run detection to see history here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="card history-card fade-up" style={{ marginTop: 32 }}>
      <div className="card-header">
        <div className="card-title">
          <span className="card-title-icon">🛡️</span>
          <span>AI Detection History</span>
          <span className="history-count-badge">{records.length} Scans</span>
        </div>
        {onClearHistory && (
          <button type="button" className="history-clear-btn" onClick={onClearHistory} title="Clear detector history">
            Clear History
          </button>
        )}
      </div>
      <div className="history-table-wrap">
        <table className="history-table">
          <thead>
            <tr>
              <th>Image</th>
              <th>Verdict</th>
              <th>Confidence</th>
              <th>Real %</th>
              <th>AI %</th>
              <th>Timestamp</th>
              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {records.map((rec) => {
              const recVerdict = rec.verdict || (
                rec.label === 'Likely AI' || rec.label === 'AI-generated'
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
                        <img src={rec.thumbnailUrl} alt={rec.imageName} className="history-thumb-img" />
                      ) : (
                        <span className="history-thumb-placeholder">🖼️</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`ai-verdict-badge ${isAI ? 'ai' : isUncertain ? 'uncertain' : 'real'}`}
                      style={{
                        fontSize: 12,
                        ...(isUncertain ? {
                          background: 'rgba(148, 163, 184, 0.15)',
                          color: '#94a3b8',
                          borderColor: 'rgba(148, 163, 184, 0.3)',
                        } : {}),
                      }}
                    >
                      {isAI ? '⚠ Likely AI' : isUncertain ? '❓ Uncertain' : '✓ Likely Real'}
                    </span>
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
                            ? 'linear-gradient(90deg,#f43f5e,#e11d48)'
                            : isUncertain
                            ? 'linear-gradient(90deg,#94a3b8,#64748b)'
                            : 'linear-gradient(90deg,#10b981,#059669)',
                        }}
                      />
                    </div>
                  </td>
                  <td style={{ color: 'var(--emerald)', fontSize: 13, fontWeight: 600 }}>
                    {rec.probabilities ? (rec.probabilities.real * 100).toFixed(1) + '%' : '—'}
                  </td>
                  <td style={{ color: 'var(--rose)', fontSize: 13, fontWeight: 600 }}>
                    {rec.probabilities ? (rec.probabilities.ai * 100).toFixed(1) + '%' : '—'}
                  </td>
                  <td className="history-time-cell">{rec.timestamp || 'Recent'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="history-action-btn"
                      onClick={() => onSelectRecord(rec)}
                      title="Re-run on this image"
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

// ── Main AI Detector View ─────────────────────────────────────────────────────
export default function AIDetectorView({ onNavigateDashboard, initialFile = null, user = null, initialRecord = null }) {
  const [file, setFile] = useState(initialFile)
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  // AI Detector History — scoped per user
  const detectorHistoryKey = `smartvision_detector_history_${user?.email || 'user'}`
  const [detectorHistory, setDetectorHistory] = useState(() => {
    try {
      const saved = localStorage.getItem(detectorHistoryKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        const seenNames = new Set()
        const deduplicated = []
        for (const rec of parsed) {
          const key = rec.imageName || rec.id
          if (!seenNames.has(key)) {
            seenNames.add(key)
            deduplicated.push(rec)
          }
        }
        return deduplicated
      }
      return []
    } catch {
      return []
    }
  })

  // Prevent duplicate runs on mount (e.g. React StrictMode)
  const autoRunDoneRef = useRef(false)
  const isDetectingRef = useRef(false)

  // Auto-run detection if an initialFile was passed in from the dashboard, or display initialRecord
  useEffect(() => {
    if (initialFile && !autoRunDoneRef.current) {
      autoRunDoneRef.current = true
      setFile(initialFile)
      runDetectionOnFile(initialFile)
    } else if (initialRecord) {
      handleSelectHistoryRecord(initialRecord)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleFile = useCallback((f) => {
    if (!f) { setFile(null); setResult(null); setError(null); return }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp']
    if (!allowed.includes(f.type)) {
      setError('Please upload a JPG, PNG, WEBP or BMP image.')
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('Image must be smaller than 10 MB.')
      return
    }
    setFile(f)
    setResult(null)
    setError(null)
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files?.[0])
  }, [handleFile])

  // Save a detection result to history — strictly one record per image (upsert by imageName)
  const saveDetectionToHistory = async (data, detectedFile) => {
    if (!data?.label || !detectedFile) return
    const targetName = detectedFile.name || 'image.jpg'
    const fileToBase64 = (f) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = (err) => reject(err)
        reader.readAsDataURL(f)
      })
    const thumbnailUrl = detectedFile ? await fileToBase64(detectedFile) : null
    const newRecord = {
      id: 'det-' + targetName.replace(/[^a-zA-Z0-9_-]/g, '_'),
      imageName: targetName,
      thumbnailUrl,
      label: data.label,
      verdict: data.verdict,
      confidence: data.confidence,
      probabilities: data.probabilities,
      timestamp: 'Just now',
    }

    setDetectorHistory((prev) => {
      // Remove any existing entry for this image so only ONE record exists
      const filtered = prev.filter((r) => r.imageName !== targetName && r.id !== newRecord.id)
      const updated = [newRecord, ...filtered.slice(0, 19)]
      if (detectorHistoryKey) {
        try { localStorage.setItem(detectorHistoryKey, JSON.stringify(updated)) } catch { /* quota */ }
      }
      return updated
    })
  }

  const runDetectionOnFile = async (targetFile) => {
    if (!targetFile || isDetectingRef.current) return
    isDetectingRef.current = true
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await detectAIImage(targetFile)
      setResult(data)
      await saveDetectionToHistory(data, targetFile)
    } catch (err) {
      setError(err.message || 'Detection failed. Is the backend running?')
    } finally {
      setLoading(false)
      isDetectingRef.current = false
    }
  }

  const runDetection = () => runDetectionOnFile(file)

  const handleClearDetectorHistory = () => {
    setDetectorHistory([])
    if (detectorHistoryKey) localStorage.removeItem(detectorHistoryKey)
  }

  const handleSelectHistoryRecord = (rec) => {
    // Load the stored thumbnail as a display-only preview (no File object needed, just show result)
    setResult({
      label: rec.label,
      verdict: rec.verdict,
      confidence: rec.confidence,
      probabilities: rec.probabilities,
    })
    setFile(null) // clear file so preview uses stored thumbnail
    // Show a synthetic "preview" via the stored base64 — we'll track this separately
    setHistoryPreviewUrl(rec.thumbnailUrl || null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Tracks the thumbnail URL when re-loading from history
  const [historyPreviewUrl, setHistoryPreviewUrl] = useState(null)

  const previewUrl = file ? URL.createObjectURL(file) : historyPreviewUrl
  const verdict = result ? (
    result.verdict || (
      result.label === 'Likely AI' || result.label === 'AI-generated'
        ? 'likely_ai'
        : (result.label === 'Uncertain' ? 'uncertain' : 'likely_real')
    )
  ) : null
  const isLikelyAI = verdict === 'likely_ai'
  const isUncertain = verdict === 'uncertain'
  const isLikelyReal = verdict === 'likely_real'

  return (
    <div className="ai-detector-view fade-up">

      {/* Hero section */}
      <div className="ai-detector-hero">
        <div className="ai-detector-hero-content">
          <div className="ai-hero-icon-wrap">
            <span className="ai-hero-icon">🛡️</span>
            <span className="ai-hero-pulse" />
          </div>
          <div>
            <h2 className="ai-hero-title">AI Image Detector</h2>
            <p className="ai-hero-desc">
              Upload any image to detect whether it was generated by AI or captured in the real world.
              Powered by a frozen CLIP vision encoder with a calibrated classifier.
            </p>
          </div>
        </div>

        <div className="ai-hero-badges">
          <div className="ai-hero-badge">
            <span className="ai-badge-icon">🧠</span>
            <div>
              <span className="ai-badge-label">Model</span>
              <span className="ai-badge-value">CLIP ViT-B/32</span>
            </div>
          </div>
          <div className="ai-hero-badge">
            <span className="ai-badge-icon">🎯</span>
            <div>
              <span className="ai-badge-label">Task</span>
              <span className="ai-badge-value">Binary Classification</span>
            </div>
          </div>
          <div className="ai-hero-badge">
            <span className="ai-badge-icon">⚡</span>
            <div>
              <span className="ai-badge-label">Classes</span>
              <span className="ai-badge-value">Real vs AI-Generated</span>
            </div>
          </div>
        </div>
      </div>

      {/* Upload zone */}
      <div className="ai-upload-section">
        <div className="section-label">
          <span>Upload Image for Detection</span>
          <span className="sample-badge">Drag & drop or browse</span>
        </div>

        <div
          className={`upload-zone ${dragOver ? 'drag-over' : ''} ${file ? 'has-image' : ''}`}
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
        >
          {!file ? (
            <>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/bmp"
                onChange={(e) => handleFile(e.target.files?.[0])}
                id="ai-file-upload"
              />
              <div className="upload-empty">
                <div className="upload-icon-wrap">🔍</div>
                <p className="upload-title">Drop an image to analyze</p>
                <p className="upload-hint">The detector will tell you if it's AI-generated or real</p>
                <div className="upload-formats">
                  {['JPG', 'PNG', 'WEBP', 'BMP'].map((f) => (
                    <span key={f} className="fmt-chip">{f}</span>
                  ))}
                  <span className="fmt-chip">Max 10 MB</span>
                </div>
              </div>
            </>
          ) : (
            <div className="upload-preview">
              <img src={URL.createObjectURL(file)} alt="Preview" className="preview-img" />
              <div className="preview-info">
                <p className="preview-name">{file.name}</p>
                <p className="preview-size">{formatBytes(file.size)}</p>
                {/* Change Image — triggers hidden file input */}
                <label htmlFor="ai-file-change" className="preview-change" style={{ cursor: 'pointer' }}>
                  ↩ Change Image
                </label>
                <input
                  id="ai-file-change"
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/bmp"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                  style={{ display: 'none' }}
                />
              </div>
            </div>
          )}
        </div>

        {file && (
          <div className="action-row">
            <button
              id="btn-detect-ai"
              className="btn btn-ai-detect"
              onClick={runDetection}
              disabled={loading}
            >
              {loading
                ? <><span className="spinner" /> Analyzing…</>
                : '🛡️ Detect AI / Real'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => { handleFile(null); setHistoryPreviewUrl(null) }}
              disabled={loading}
            >
              🔄 Change Image
            </button>
            <button
              className="btn btn-secondary"
              onClick={onNavigateDashboard}
              disabled={loading}
            >
              📊 Go to Classifier
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="error-box fade-up">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="ai-result-skeleton fade-up">
          <div className="card">
            <div className="skeleton" style={{ height: 18, width: '40%', marginBottom: 20 }} />
            <div className="skeleton" style={{ height: 120, marginBottom: 20 }} />
            <div className="skeleton" style={{ height: 12, width: '100%', marginBottom: 10 }} />
            <div className="skeleton" style={{ height: 12, width: '75%' }} />
          </div>
        </div>
      )}

      {/* Results */}
      {!loading && result && (
        <div className="ai-results-wrap fade-up">
          <div
            className={`ai-verdict-card ${isLikelyAI ? 'verdict-ai' : isUncertain ? 'verdict-uncertain' : 'verdict-real'}`}
            style={isUncertain ? { borderColor: 'rgba(148, 163, 184, 0.25)' } : undefined}
          >
            <div className="ai-verdict-header">
              <span className="card-title">
                <span className="card-title-icon">🛡️</span> Detection Verdict
              </span>
              <span
                className={`ai-verdict-badge ${isLikelyAI ? 'ai' : isUncertain ? 'uncertain' : 'real'}`}
                style={isUncertain ? {
                  background: 'rgba(148, 163, 184, 0.15)',
                  color: '#94a3b8',
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                } : undefined}
              >
                {isLikelyAI ? '⚠ Likely AI' : isUncertain ? '❓ Uncertain' : '✓ Likely Real'}
              </span>
            </div>

            <div className="ai-verdict-body">
              {/* Image preview + Gauge */}
              <div className="ai-verdict-visual">
                {previewUrl && (
                  <div className="ai-verdict-thumb-wrap">
                    <img src={previewUrl} alt="Analyzed" className="ai-verdict-thumb" />
                    <div
                      className={`ai-verdict-overlay ${isLikelyAI ? 'ai' : isUncertain ? 'uncertain' : 'real'}`}
                      style={isUncertain ? {
                        background: 'linear-gradient(to top, rgba(100, 116, 139, 0.85), rgba(100, 116, 139, 0.3))',
                        color: '#fff',
                      } : undefined}
                    >
                      <span>{isLikelyAI ? 'AI' : isUncertain ? 'UNCERTAIN' : 'REAL'}</span>
                    </div>
                  </div>
                )}
                <ConfidenceGauge
                  value={result.confidence}
                  label={isLikelyAI ? 'AI Confidence' : isUncertain ? 'Confidence' : 'Real Confidence'}
                  color={isLikelyAI ? '#f43f5e' : isUncertain ? '#94a3b8' : '#10b981'}
                />
              </div>

              {/* Detailed probabilities */}
              <div className="ai-verdict-details">
                <div className="ai-verdict-label-row">
                  <span
                    className={`ai-verdict-big-label ${isLikelyAI ? 'ai' : isUncertain ? 'uncertain' : 'real'}`}
                    style={isUncertain ? { color: '#94a3b8' } : undefined}
                  >
                    {result.label || (isLikelyAI ? 'Likely AI' : isUncertain ? 'Uncertain' : 'Likely Real')}
                  </span>
                  <span className="ai-verdict-conf">
                    {(result.confidence * 100).toFixed(1)}% confidence
                  </span>
                </div>

                <div className="ai-prob-section">
                  <div className="ai-prob-title">Probability Breakdown</div>
                  <ProbabilityBar label="Real" value={result.probabilities.real} color="#10b981" delay={0} />
                  <ProbabilityBar label="AI-Generated" value={result.probabilities.ai} color="#f43f5e" delay={100} />
                </div>

                <div
                  className={`ai-interpret-box ${isLikelyAI ? 'ai' : isUncertain ? 'uncertain' : 'real'}`}
                  style={isUncertain ? {
                    background: 'rgba(148, 163, 184, 0.06)',
                    borderColor: 'rgba(148, 163, 184, 0.2)',
                  } : undefined}
                >
                  <span className="ai-interpret-icon">
                    {isLikelyAI ? '🤖' : isUncertain ? '⚖️' : '📷'}
                  </span>
                  <div>
                    <div className="ai-interpret-title">
                      {isLikelyAI
                        ? 'AI Generation Traces Detected'
                        : isUncertain
                        ? 'Ambiguous or Inconclusive Traces'
                        : 'Authentic Image Signature'}
                    </div>
                    <div className="ai-interpret-desc">
                      {isLikelyAI
                        ? 'The model detected patterns consistent with AI image generation tools such as DALL·E, Midjourney, or Stable Diffusion.'
                        : isUncertain
                        ? 'The model prediction falls between confidence thresholds. The image shows mixed or subtle patterns that cannot be conclusively identified as AI or real.'
                        : 'The model classifies this image as a genuine photograph or real-world capture with high confidence.'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Action row after result */}
            <div className="meta-row" style={{ marginTop: 16, gap: 8, flexWrap: 'wrap' }}>
              <div className="meta-chip">🧠 <span>CLIP ViT-B/32</span></div>
              <div className="meta-chip">🎯 <span>Binary Classifier</span></div>
              <div className="meta-chip">📊 <span>Logistic Regression</span></div>
              <label
                htmlFor="ai-file-change-result"
                className="btn btn-secondary"
                style={{ cursor: 'pointer', padding: '6px 14px', fontSize: 13, marginLeft: 'auto' }}
              >
                🔄 Change Image
              </label>
              <input
                id="ai-file-change-result"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/bmp"
                onChange={(e) => { handleFile(e.target.files?.[0]); setHistoryPreviewUrl(null) }}
                style={{ display: 'none' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* AI Detector History */}
      <DetectorHistory
        records={detectorHistory}
        onSelectRecord={handleSelectHistoryRecord}
        onClearHistory={handleClearDetectorHistory}
      />
    </div>
  )
}

