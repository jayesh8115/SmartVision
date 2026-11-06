import { useState, useEffect } from 'react'
import { getModelInfo, getHealth } from './services/api'

export default function ModelInfoView({ onNavigateDashboard }) {
  const [info, setInfo] = useState(null)
  const [health, setHealth] = useState(null)

  useEffect(() => {
    Promise.all([
      getModelInfo().catch(() => null),
      getHealth().catch(() => null),
    ]).then(([infoData, healthData]) => {
      setInfo(infoData)
      setHealth(healthData)
    })
  }, [])

  return (
    <div className="model-info-view fade-up">
      {/* View Header */}
      <div className="model-info-hero">
        <div className="model-info-header-content">
          <div className="model-info-badge-icon">🧠</div>
          <div>
            <div className="model-info-subtitle">Neural Network Specifications & Live Telemetry</div>
            <h1 className="model-info-title">
              {info?.model_name || 'ResNet-50 (ImageNet Pretrained)'}
            </h1>
          </div>
        </div>

        <div className="model-info-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onNavigateDashboard}
          >
            ⚡ Test Model in Dashboard
          </button>
        </div>
      </div>

      {/* Live System Telemetry Cards */}
      <div className="model-telemetry-grid">
        <div className="card telemetry-card">
          <div className="telemetry-label">API Health</div>
          <div className="telemetry-value">
            <span className={`status-dot ${health?.status === 'ok' ? 'online' : 'offline'}`} />
            <span>{health?.status === 'ok' ? 'Online & Healthy' : 'Offline / Checking'}</span>
          </div>
          <div className="telemetry-sub">FastAPI async server on port 8000</div>
        </div>

        <div className="card telemetry-card">
          <div className="telemetry-label">Model Weights Loaded</div>
          <div className="telemetry-value highlight">
            {health?.model_loaded ? 'Ready in Memory' : 'Loading…'}
          </div>
          <div className="telemetry-sub">Zero cold-start during requests</div>
        </div>

        <div className="card telemetry-card">
          <div className="telemetry-label">Backend Engine</div>
          <div className="telemetry-value">
            {info?.backend ? info.backend.toUpperCase() : 'IMAGENET'}
          </div>
          <div className="telemetry-sub">Keras / TensorFlow 2.x</div>
        </div>

        <div className="card telemetry-card">
          <div className="telemetry-label">Confidence Threshold</div>
          <div className="telemetry-value">
            {info?.conf_threshold ? `${info.conf_threshold * 100}%` : '40%'}
          </div>
          <div className="telemetry-sub">Minimum score for confident flag</div>
        </div>
      </div>

      {/* Architecture & Pipeline Deep Dive */}
      <div className="model-details-grid">
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <span className="card-title-icon">📐</span>
              <span>Model Architecture Specifications</span>
            </div>
          </div>

          <div className="spec-table">
            <div className="spec-row">
              <span className="spec-name">Base Architecture</span>
              <span className="spec-val">ResNet-50 (Residual Network)</span>
            </div>
            <div className="spec-row">
              <span className="spec-name">Layers Depth</span>
              <span className="spec-val">50 Convolutional & Residual Blocks</span>
            </div>
            <div className="spec-row">
              <span className="spec-name">Input Tensor Resolution</span>
              <span className="spec-val">
                {info?.input_size || 224} × {info?.input_size || 224} × 3 (RGB)
              </span>
            </div>
            <div className="spec-row">
              <span className="spec-name">Total Trainable Parameters</span>
              <span className="spec-val">~25,636,712 weights</span>
            </div>
            <div className="spec-row">
              <span className="spec-name">Output Dimension</span>
              <span className="spec-val">1,000 Class Softmax Logits</span>
            </div>
            <div className="spec-row">
              <span className="spec-name">Top-K Returned</span>
              <span className="spec-val">{info?.top_k || 3} predictions per request</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <span className="card-title-icon">🔬</span>
              <span>Explainability & Preprocessing</span>
            </div>
          </div>

          <div className="spec-table">
            <div className="spec-row">
              <span className="spec-name">XAI Algorithm</span>
              <span className="spec-val">Grad-CAM (Class Activation Mapping)</span>
            </div>
            <div className="spec-row">
              <span className="spec-name">Target Conv Layer</span>
              <span className="spec-val highlight-code">conv5_block3_out</span>
            </div>
            <div className="spec-row">
              <span className="spec-name">Preprocessing Scheme</span>
              <span className="spec-val">ResNet Zero-Centering (Caffe style)</span>
            </div>
            <div className="spec-row">
              <span className="spec-name">Heatmap Normalization</span>
              <span className="spec-val">ReLU + Min-Max [0, 1] + Jet Colormap</span>
            </div>
            <div className="spec-row">
              <span className="spec-name">Training Benchmark</span>
              <span className="spec-val">ImageNet-1k (ILSVRC)</span>
            </div>
            <div className="spec-row">
              <span className="spec-name">Cloud Integration</span>
              <span className="spec-val">AWS S3 classification logs + EC2</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
