import clockHistorySvg from './icons/clock-history.svg'

export default function Navbar({ activeTab, onTabChange, historyCount = 0 }) {
  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: '📊',
      tooltip: 'Classifier workspace, sample images & inference',
    },
    {
      id: 'model-info',
      label: 'Model Info',
      icon: '🧠',
      tooltip: 'Architecture, weights, input size & parameters',
    },
    {
      id: 'ai-detector',
      label: 'AI Detector',
      icon: '🛡️',
      tooltip: 'Detect whether an image is AI-generated or real',
    },
    {
      id: 'history',
      label: 'History',
      icon: clockHistorySvg,
      isSvg: true,
      tooltip: 'Past classification records & confidence scores',
      badge: historyCount > 0 ? historyCount : null,
    },
  ]

  return (
    <nav className="main-navbar" aria-label="Main Navigation">
      <div className="nav-pill-track">
        {navItems.map((item) => {
          const isActive = activeTab === item.id

          return (
            <button
              key={item.id}
              type="button"
              id={`nav-link-${item.id}`}
              className={`nav-tab-item ${isActive ? 'active' : ''}`}
              onClick={() => onTabChange(item.id)}
              title={item.tooltip}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="nav-tab-icon">
                {item.isSvg || (typeof item.icon === 'string' && item.icon.includes('.svg')) ? (
                  <span
                    className="nav-svg-icon"
                    style={{
                      WebkitMaskImage: `url("${item.icon}")`,
                      maskImage: `url("${item.icon}")`,
                    }}
                    aria-hidden="true"
                  />
                ) : (
                  item.icon
                )}
              </span>
              <span className="nav-tab-label">{item.label}</span>
              {item.badge !== null && item.badge !== undefined && (
                <span className={`nav-tab-badge ${isActive ? 'active' : ''}`}>
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
