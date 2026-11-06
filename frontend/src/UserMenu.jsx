import { useState, useRef, useEffect } from 'react'

export default function UserMenu({ user, onOpenAuth, onLogout, onNavigateClassifier, currentView }) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const menuRef = useRef(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!user) {
    return (
      <div className="user-menu-wrap">
        <button
          type="button"
          className={`auth-nav-btn ${currentView === 'auth' ? 'active' : ''}`}
          onClick={onOpenAuth}
        >
          <span className="auth-nav-icon">👤</span>
          <span>Sign In / Register</span>
        </button>
      </div>
    )
  }

  return (
    <div className="user-menu-wrap" ref={menuRef}>
      <button
        type="button"
        className="user-profile-pill"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        aria-expanded={dropdownOpen}
      >
        <span className="user-avatar-circle">
          {user.avatarInitial || user.name?.[0]?.toUpperCase() || 'U'}
        </span>
        <span className="user-profile-name">{user.name || 'User'}</span>
        <span className="user-chevron">{dropdownOpen ? '▲' : '▼'}</span>
      </button>

      {dropdownOpen && (
        <div className="user-dropdown-card fade-up">
          <div className="dropdown-user-header">
            <div className="dropdown-avatar">
              {user.avatarInitial || user.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="dropdown-info">
              <div className="dropdown-name">{user.name}</div>
              <div className="dropdown-email">{user.email}</div>
              <div className="dropdown-badge">{user.role || 'Vision Researcher'}</div>
            </div>
          </div>

          <div className="dropdown-divider" />

          <div className="dropdown-menu-list">
            <button
              type="button"
              className="dropdown-item"
              onClick={() => {
                if (onNavigateClassifier) onNavigateClassifier('dashboard')
                setDropdownOpen(false)
              }}
            >
              <span className="dropdown-item-icon">📊</span>
              <span>Dashboard</span>
            </button>

            <button
              type="button"
              className="dropdown-item"
              onClick={() => {
                if (onNavigateClassifier) onNavigateClassifier('model-info')
                setDropdownOpen(false)
              }}
            >
              <span className="dropdown-item-icon">🧠</span>
              <span>Model Info</span>
            </button>

            <button
              type="button"
              className="dropdown-item"
              onClick={() => {
                if (onNavigateClassifier) onNavigateClassifier('history')
                setDropdownOpen(false)
              }}
            >
              <span className="dropdown-item-icon">📜</span>
              <span>History Records</span>
            </button>

            <button
              type="button"
              className="dropdown-item logout"
              onClick={() => {
                setDropdownOpen(false)
                onLogout()
              }}
            >
              <span className="dropdown-item-icon">🚪</span>
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
