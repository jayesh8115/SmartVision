import { useState, useId } from 'react'

export default function AuthPage({ onLoginSuccess, onCancel, initialTab = 'signin' }) {
  const [tab, setTab] = useState(initialTab) // 'signin' | 'signup'
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const [forgotSent, setForgotSent] = useState(false)
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')

  const emailId = useId()
  const passwordId = useId()
  const nameId = useId()
  const confirmPasswordId = useId()
  const rememberMeId = useId()
  const agreeTermsId = useId()
  const forgotEmailId = useId()

  // Sign In form state
  const [signInData, setSignInData] = useState({
    email: '',
    password: '',
    rememberMe: true,
  })

  // Sign Up form state
  const [signUpData, setSignUpData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    agreeTerms: false,
  })

  // Password strength calculation
  const getPasswordStrength = (pwd) => {
    if (!pwd) return { score: 0, text: '', color: '' }
    let score = 0
    if (pwd.length >= 6) score += 1
    if (pwd.length >= 10) score += 1
    if (/[A-Z]/.test(pwd)) score += 1
    if (/[0-9]/.test(pwd)) score += 1
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1

    if (score <= 2) return { score: 1, text: 'Weak', color: 'var(--rose)' }
    if (score <= 4) return { score: 2, text: 'Medium', color: 'var(--amber)' }
    return { score: 3, text: 'Strong', color: 'var(--emerald)' }
  }

  const strength = getPasswordStrength(signUpData.password)

  // Demo user autofill
  const handleFillDemo = () => {
    setSignInData({
      email: 'researcher@smartvision.ai',
      password: 'DemoPassword2026!',
      rememberMe: true,
    })
    setError(null)
  }

  // Handle Sign In submission
  const handleSignIn = (e) => {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)

    if (!signInData.email || !signInData.password) {
      setError('Please provide both email and password.')
      return
    }

    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      const mockUser = {
        name: signInData.email.split('@')[0],
        email: signInData.email,
        role: 'Vision Researcher',
        avatarInitial: signInData.email[0].toUpperCase(),
        token: 'sv_mock_jwt_token_' + Date.now(),
      }
      if (signInData.rememberMe) {
        localStorage.setItem('smartvision_user', JSON.stringify(mockUser))
      } else {
        sessionStorage.setItem('smartvision_user', JSON.stringify(mockUser))
      }
      setSuccessMsg('Welcome back! Redirecting to workspace…')
      setTimeout(() => {
        onLoginSuccess(mockUser)
      }, 700)
    }, 600)
  }

  // Handle Sign Up submission
  const handleSignUp = (e) => {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)

    if (!signUpData.name.trim()) {
      setError('Please enter your full name.')
      return
    }
    if (!signUpData.email.trim() || !signUpData.email.includes('@')) {
      setError('Please enter a valid email address.')
      return
    }
    if (signUpData.password.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }
    if (signUpData.password !== signUpData.confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (!signUpData.agreeTerms) {
      setError('You must accept the terms of service and privacy policy.')
      return
    }

    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      const newUser = {
        name: signUpData.name.trim(),
        email: signUpData.email.trim(),
        role: 'Computer Vision Engineer',
        avatarInitial: signUpData.name.trim()[0].toUpperCase(),
        token: 'sv_mock_jwt_token_' + Date.now(),
      }
      localStorage.setItem('smartvision_user', JSON.stringify(newUser))
      setSuccessMsg('Account created successfully! Welcome to SmartVision.')
      setTimeout(() => {
        onLoginSuccess(newUser)
      }, 700)
    }, 700)
  }

  // Social login mock
  const handleSocialAuth = (provider) => {
    setError(null)
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      const socialUser = {
        name: provider === 'google' ? 'Google User' : 'GitHub Developer',
        email: provider === 'google' ? 'user@gmail.com' : 'dev@github.com',
        role: 'Verified Researcher',
        avatarInitial: provider === 'google' ? 'G' : 'H',
        token: `sv_${provider}_token_` + Date.now(),
      }
      localStorage.setItem('smartvision_user', JSON.stringify(socialUser))
      setSuccessMsg(`Authenticated with ${provider === 'google' ? 'Google' : 'GitHub'}!`)
      setTimeout(() => {
        onLoginSuccess(socialUser)
      }, 600)
    }, 500)
  }

  // Handle password reset
  const handleResetPassword = (e) => {
    e.preventDefault()
    if (!forgotEmail || !forgotEmail.includes('@')) {
      return
    }
    setForgotSent(true)
    setTimeout(() => {
      setShowForgotModal(false)
      setForgotSent(false)
      setForgotEmail('')
    }, 2500)
  }

  return (
    <div className="auth-container fade-up">
      {/* Navigation back */}
      {onCancel && (
        <button className="auth-back-btn" onClick={onCancel} type="button">
          ← Back to Classifier
        </button>
      )}

      <div className="auth-card">
        {/* Header Icon & Title */}
        <div className="auth-card-header">
          <div className="auth-badge-icon">👁️</div>
          <h1 className="auth-title">
            {tab === 'signin' ? 'Welcome Back' : 'Create an Account'}
          </h1>
          <p className="auth-subtitle">
            {tab === 'signin'
              ? 'Sign in to access your models, prediction logs, and Grad-CAM history'
              : 'Join SmartVision to analyze images with deep neural networks'}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="auth-tab-pill">
          <button
            type="button"
            className={`auth-tab-btn ${tab === 'signin' ? 'active' : ''}`}
            onClick={() => { setTab('signin'); setError(null); setSuccessMsg(null); }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${tab === 'signup' ? 'active' : ''}`}
            onClick={() => { setTab('signup'); setError(null); setSuccessMsg(null); }}
          >
            Sign Up
          </button>
        </div>

        {/* Status Alerts */}
        {error && (
          <div className="error-box auth-alert fade-up">
            <span className="error-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="auth-success-box fade-up">
            <span>✨</span>
            <span>{successMsg}</span>
          </div>
        )}

        {/* Social Buttons */}
        <div className="auth-social-row">
          <button
            type="button"
            className="auth-social-btn"
            onClick={() => handleSocialAuth('google')}
            disabled={loading}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
            </svg>
            <span>Google</span>
          </button>

          <button
            type="button"
            className="auth-social-btn"
            onClick={() => handleSocialAuth('github')}
            disabled={loading}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
            <span>GitHub</span>
          </button>
        </div>

        <div className="auth-divider">
          <span>or continue with email</span>
        </div>

        {/* ── Sign In Form ── */}
        {tab === 'signin' && (
          <form onSubmit={handleSignIn} className="auth-form">
            <div className="form-group">
              <label htmlFor={emailId} className="form-label">Email Address</label>
              <div className="input-wrap">
                <span className="input-icon">✉️</span>
                <input
                  id={emailId}
                  type="email"
                  className="auth-input"
                  placeholder="name@example.com"
                  value={signInData.email}
                  onChange={(e) => setSignInData({ ...signInData, email: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <div className="form-label-row">
                <label htmlFor={passwordId} className="form-label">Password</label>
                <button
                  type="button"
                  className="auth-link-btn"
                  onClick={() => setShowForgotModal(true)}
                >
                  Forgot password?
                </button>
              </div>
              <div className="input-wrap">
                <span className="input-icon">🔒</span>
                <input
                  id={passwordId}
                  type={showPassword ? 'text' : 'password'}
                  className="auth-input"
                  placeholder="Enter your password"
                  value={signInData.password}
                  onChange={(e) => setSignInData({ ...signInData, password: e.target.value })}
                  required
                />
                <button
                  type="button"
                  className="input-eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>

            <div className="auth-checkbox-row">
              <label htmlFor={rememberMeId} className="checkbox-label">
                <input
                  id={rememberMeId}
                  type="checkbox"
                  checked={signInData.rememberMe}
                  onChange={(e) => setSignInData({ ...signInData, rememberMe: e.target.checked })}
                />
                <span>Remember me on this browser</span>
              </label>

              <button
                type="button"
                className="auth-demo-btn"
                onClick={handleFillDemo}
              >
                Auto-fill demo
              </button>
            </div>

            <button
              id="btn-submit-signin"
              type="submit"
              className="btn btn-primary auth-submit-btn"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner" /> Signing in…
                </>
              ) : (
                'Sign In to SmartVision'
              )}
            </button>
          </form>
        )}

        {/* ── Sign Up Form ── */}
        {tab === 'signup' && (
          <form onSubmit={handleSignUp} className="auth-form">
            <div className="form-group">
              <label htmlFor={nameId} className="form-label">Full Name</label>
              <div className="input-wrap">
                <span className="input-icon">👤</span>
                <input
                  id={nameId}
                  type="text"
                  className="auth-input"
                  placeholder="e.g. Alex Turing"
                  value={signUpData.name}
                  onChange={(e) => setSignUpData({ ...signUpData, name: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor={emailId} className="form-label">Email Address</label>
              <div className="input-wrap">
                <span className="input-icon">✉️</span>
                <input
                  id={emailId}
                  type="email"
                  className="auth-input"
                  placeholder="alex@research.org"
                  value={signUpData.email}
                  onChange={(e) => setSignUpData({ ...signUpData, email: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor={passwordId} className="form-label">Password</label>
              <div className="input-wrap">
                <span className="input-icon">🔒</span>
                <input
                  id={passwordId}
                  type={showPassword ? 'text' : 'password'}
                  className="auth-input"
                  placeholder="At least 6 characters"
                  value={signUpData.password}
                  onChange={(e) => setSignUpData({ ...signUpData, password: e.target.value })}
                  required
                />
                <button
                  type="button"
                  className="input-eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>

              {signUpData.password && (
                <div className="password-strength-wrap">
                  <div className="strength-bars">
                    <span className={`strength-bar ${strength.score >= 1 ? 'active' : ''}`} style={{ background: strength.score >= 1 ? strength.color : '' }} />
                    <span className={`strength-bar ${strength.score >= 2 ? 'active' : ''}`} style={{ background: strength.score >= 2 ? strength.color : '' }} />
                    <span className={`strength-bar ${strength.score >= 3 ? 'active' : ''}`} style={{ background: strength.score >= 3 ? strength.color : '' }} />
                  </div>
                  <span className="strength-label" style={{ color: strength.color }}>
                    {strength.text} strength
                  </span>
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor={confirmPasswordId} className="form-label">Confirm Password</label>
              <div className="input-wrap">
                <span className="input-icon">🔒</span>
                <input
                  id={confirmPasswordId}
                  type={showPassword ? 'text' : 'password'}
                  className="auth-input"
                  placeholder="Repeat your password"
                  value={signUpData.confirmPassword}
                  onChange={(e) => setSignUpData({ ...signUpData, confirmPassword: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="auth-checkbox-row">
              <label htmlFor={agreeTermsId} className="checkbox-label">
                <input
                  id={agreeTermsId}
                  type="checkbox"
                  checked={signUpData.agreeTerms}
                  onChange={(e) => setSignUpData({ ...signUpData, agreeTerms: e.target.checked })}
                  required
                />
                <span>I agree to the <span className="auth-highlight">Terms of Service</span> and <span className="auth-highlight">Privacy Policy</span></span>
              </label>
            </div>

            <button
              id="btn-submit-signup"
              type="submit"
              className="btn btn-primary auth-submit-btn"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner" /> Creating account…
                </>
              ) : (
                'Create SmartVision Account'
              )}
            </button>
          </form>
        )}

        {/* Feature Badges */}
        <div className="auth-features-row">
          <div className="auth-feature-item">
            <span className="feature-dot">⚡</span>
            <span>ResNet-50 1K Classes</span>
          </div>
          <div className="auth-feature-item">
            <span className="feature-dot">🔥</span>
            <span>Grad-CAM Visual Heatmaps</span>
          </div>
          <div className="auth-feature-item">
            <span className="feature-dot">☁️</span>
            <span>AWS Cloud Storage</span>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="auth-modal-backdrop" onClick={() => setShowForgotModal(false)}>
          <div className="auth-modal-card fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Reset Password</div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowForgotModal(false)}
              >
                ✕
              </button>
            </div>
            {forgotSent ? (
              <div className="modal-body success-state">
                <div style={{ fontSize: 32, marginBottom: 8 }}>📬</div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Reset Link Sent!</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Check your inbox for instructions to reset your password.
                </div>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="modal-body">
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                  Enter your email address and we will send you a recovery link.
                </p>
                <div className="form-group">
                  <label htmlFor={forgotEmailId} className="form-label">Email Address</label>
                  <div className="input-wrap">
                    <span className="input-icon">✉️</span>
                    <input
                      id={forgotEmailId}
                      type="email"
                      className="auth-input"
                      placeholder="name@example.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: 16 }}
                >
                  Send Recovery Link
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
