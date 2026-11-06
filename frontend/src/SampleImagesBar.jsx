import { useState } from 'react'

const SAMPLE_IMAGES = [
  {
    id: 'golden_retriever',
    title: 'Golden Retriever',
    category: 'Canine / Animal',
    url: '/samples/golden_retriever.jpg',
    filename: 'golden_retriever.jpg',
    expectedClass: 'golden retriever',
    
  },
  {
    id: 'sports_car',
    title: 'Sports Car',
    category: 'Vehicle / Transport',
    url: '/samples/sports_car.jpg',
    filename: 'sports_car.jpg',
    expectedClass: 'sports car',
    
  },
  {
    id: 'monarch_butterfly',
    title: 'Monarch Butterfly',
    category: 'Insect / Nature',
    url: '/samples/monarch_butterfly.jpg',
    filename: 'monarch_butterfly.jpg',
    expectedClass: 'monarch butterfly',
    
  },
  {
    id: 'coffee_mug',
    title: 'Coffee Mug',
    category: 'Object / Drinkware',
    url: '/samples/coffee_mug.jpg',
    filename: 'coffee_mug.jpg',
    expectedClass: 'coffee mug',
    
  },
]

export default function SampleImagesBar({ onSelectSample, activeSampleId, loading }) {
  const [loadingSample, setLoadingSample] = useState(null)

  const handleSelect = async (sample, autoRun = false) => {
    try {
      setLoadingSample(sample.id)
      const res = await fetch(sample.url)
      const blob = await res.blob()
      const file = new File([blob], sample.filename, { type: 'image/jpeg' })
      onSelectSample(file, sample, autoRun)
    } catch (err) {
      console.error('Failed to load sample image', err)
    } finally {
      setLoadingSample(null)
    }
  }

  return (
    <div className="sample-section fade-up">
      <div className="section-label">
        <span>Sample Test Images</span>
        <span className="sample-badge">Click to test model</span>
      </div>

      <div className="sample-grid">
        {SAMPLE_IMAGES.map((sample) => {
          const isActive = activeSampleId === sample.id
          const isLoadingThis = loadingSample === sample.id

          return (
            <div
              key={sample.id}
              className={`sample-card ${isActive ? 'active' : ''}`}
            >
              <div className="sample-img-wrap">
                <img
                  src={sample.url}
                  alt={sample.title}
                  className="sample-thumb"
                  loading="lazy"
                />
                {sample.icon && <span className="sample-icon-tag">{sample.icon}</span>}
                {isActive && <div className="sample-active-pill">Loaded</div>}
              </div>

              <div className="sample-info">
                <div className="sample-title">{sample.title}</div>
                <div className="sample-category">{sample.category}</div>
              </div>

              <div className="sample-actions">
                <button
                  type="button"
                  className="sample-btn primary"
                  disabled={loading || isLoadingThis}
                  onClick={() => handleSelect(sample, true)}
                  title="Load image and run inference immediately"
                >
                  {isLoadingThis ? 'Loading…' : '⚡ Test Model'}
                </button>
                <button
                  type="button"
                  className="sample-btn secondary"
                  disabled={loading || isLoadingThis}
                  onClick={() => handleSelect(sample, false)}
                  title="Load into workspace uploader"
                >
                  Load
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
