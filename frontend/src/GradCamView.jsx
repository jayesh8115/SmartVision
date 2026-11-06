export default function GradCamView({ result, originalFile }) {
  if (!result || !result.heatmap_png_base64) return null

  const originalUrl = originalFile ? URL.createObjectURL(originalFile) : null

  return (
    <div className="card fade-up" style={{ animationDelay: '0.1s' }}>
      <div className="card-header">
        <span className="card-title">
          <span className="card-title-icon">🔥</span> Grad-CAM Explanation
        </span>
      </div>

      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.7 }}>
        Grad-CAM highlights the regions the model focused on to make its prediction.
        <strong style={{ color: 'var(--text-secondary)' }}> Warmer colors</strong> = higher importance.
      </p>

      <div className="gradcam-grid">
        {originalUrl && (
          <div className="gradcam-img-wrap">
            <img src={originalUrl} alt="Original" />
            <span className="gradcam-label">Original</span>
          </div>
        )}
        <div className="gradcam-img-wrap">
          <img
            src={`data:image/png;base64,${result.heatmap_png_base64}`}
            alt="Grad-CAM heatmap"
          />
          <span className="gradcam-label">Grad-CAM</span>
        </div>
      </div>

      <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(139,92,246,0.08)', borderRadius: 8, border: '1px solid rgba(139,92,246,0.2)' }}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          🔬 Using <strong style={{ color: 'var(--text-secondary)' }}>Gradient-weighted Class Activation Mapping</strong> (Grad-CAM)
          — a technique that uses gradient information flowing into the final convolutional layer to highlight class-discriminative regions.
        </p>
      </div>
    </div>
  )
}
