import { useEffect, useState } from 'react'
import { getHealth, getModelInfo } from './services/api'

export default function ModelBadge() {
  const [info, setInfo] = useState(null)
  const [online, setOnline] = useState(null) // null = checking

  useEffect(() => {
    getHealth()
      .then((h) => setOnline(h.status === 'ok'))
      .catch(() => setOnline(false))

    getModelInfo()
      .then(setInfo)
      .catch(() => {})
  }, [])

  const dotClass = online === false ? 'model-badge-dot offline' : 'model-badge-dot'

  return (
    <div className="model-badge" title={info ? `${info.model_name} | Input: ${info.input_size}×${info.input_size} | Threshold: ${info.conf_threshold}` : ''}>
      <span className={dotClass} />
      <span className="model-badge-name">
        {online === null
          ? 'Connecting…'
          : online === false
          ? 'API offline'
          : info
          ? info.model_name
          : 'Loading…'}
      </span>
    </div>
  )
}
