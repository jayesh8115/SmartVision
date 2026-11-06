import { useCallback, useEffect, useRef, useState } from 'react'

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export default function ImageUploader({ file, onFile, imageMeta, warnings }) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  const handleFile = useCallback((f) => {
    if (!f) return
    if (!f.type.startsWith('image/')) {
      alert('Please choose an image file')
      return
    }
    if (f.size > 25 * 1024 * 1024) {
      alert('Image is larger than 25 MB')
      return
    }
    onFile(f)
  }, [onFile])

  // Clipboard paste support
  useEffect(() => {
    const onPaste = (e) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const blob = item.getAsFile()
          if (blob) {
            const pasted = new File([blob], 'pasted-image.png', { type: blob.type })
            handleFile(pasted)
          }
          return
        }
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [handleFile])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files?.[0])
  }, [handleFile])

  const onDragOver = (e) => { e.preventDefault(); setDragOver(true) }
  const onDragLeave = () => setDragOver(false)

  const previewUrl = file ? URL.createObjectURL(file) : null

  const hasLowRes = warnings && warnings.includes('low_resolution')

  return (
    <div
      className={`upload-zone ${dragOver ? 'drag-over' : ''} ${file ? 'has-image' : ''}`}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      {!file ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/bmp,image/gif"
            onChange={(e) => handleFile(e.target.files?.[0])}
            id="file-upload"
          />
          <div className="upload-empty">
            <div className="upload-icon-wrap">🖼️</div>
            <p className="upload-title">Drop your image here</p>
            <p className="upload-hint">or click anywhere to browse files · Ctrl+V to paste</p>
            <div className="upload-formats">
              {['JPG', 'PNG', 'WEBP', 'GIF', 'BMP'].map((f) => (
                <span key={f} className="fmt-chip">{f}</span>
              ))}
              <span className="fmt-chip">Max 25 MB</span>
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted, #888)', marginTop: 10, textAlign: 'center', lineHeight: 1.5 }}>
            Works best on original full-size photos.
            Screenshots, thumbnails and heavily edited images are less reliable.
            Supported: JPG, PNG, WEBP, GIF, BMP.
          </p>
        </>
      ) : (
        <div className="upload-preview">
          <img src={previewUrl} alt="Preview" className="preview-img" />
          <div className="preview-info">
            <p className="preview-name">{file.name}</p>
            <p className="preview-size">{formatBytes(file.size)}</p>
            {imageMeta && (
              <p style={{ fontSize: 12, color: 'var(--text-muted, #888)', margin: '4px 0' }}>
                {imageMeta.width} × {imageMeta.height} px, {Math.round(imageMeta.file_kb)} KB
              </p>
            )}
            {hasLowRes && (
              <p style={{ fontSize: 12, color: '#d97706', margin: '4px 0' }}>
                ⚠ Small image: results may be less reliable. Try the original full-size file.
              </p>
            )}
            <span
              className="preview-change"
              onClick={(e) => { e.stopPropagation(); onFile(null) }}
            >
              ↩ Change image
            </span>
          </div>
          {/* hidden input so clicking anywhere on the card reopens picker */}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/bmp,image/gif"
            onChange={(e) => handleFile(e.target.files?.[0])}
            style={{ display: 'none' }}
          />
        </div>
      )}
    </div>
  )
}
