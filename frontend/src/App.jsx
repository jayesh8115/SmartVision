import { useState, useEffect } from 'react'
import { predictImage, explainImage } from './services/api'
import ModelBadge from './ModelBadge'
import ImageUploader from './ImageUploader'
import PredictionResults from './PredictionResults'
import GradCamView from './GradCamView'
import AuthPage from './AuthPage'
import UserMenu from './UserMenu'
import SampleImagesBar from './SampleImagesBar'
import ClassificationHistory from './ClassificationHistory'
import AIDetectionHistory from './AIDetectionHistory'
import Navbar from './Navbar'
import ModelInfoView from './ModelInfoView'
import AIDetectorView from './AIDetectorView'
import './App.css'
import { INITIAL_DEMO_RECORDS, INITIAL_AI_DEMO_RECORDS } from './demoRecords'

function getInitialHistory(currentUser) {
  if (!currentUser) return []
  const storageKey = `smartvision_history_${currentUser.email || 'user'}`
  try {
    const savedHistory = localStorage.getItem(storageKey)
    if (savedHistory) {
      const parsed = JSON.parse(savedHistory)
      // Always ensure demo records appear — deduplicate by id, append missing demos
      const existingIds = new Set(parsed.map((r) => r.id))
      const missingDemos = INITIAL_DEMO_RECORDS.filter((d) => !existingIds.has(d.id))
      const merged = [...parsed, ...missingDemos]
      // Persist merged so demos are always present on next load too
      if (missingDemos.length > 0) {
        localStorage.setItem(storageKey, JSON.stringify(merged))
      }
      return merged
    }
    localStorage.setItem(storageKey, JSON.stringify(INITIAL_DEMO_RECORDS))
    return INITIAL_DEMO_RECORDS
  } catch {
    return INITIAL_DEMO_RECORDS
  }
}

function getInitialAIDetectorHistory(currentUser) {
  const storageKey = `smartvision_detector_history_${currentUser?.email || 'user'}`
  try {
    const savedHistory = localStorage.getItem(storageKey)
    if (savedHistory) {
      const parsed = JSON.parse(savedHistory)
      // Deduplicate by imageName so strictly ONE record per image exists
      const seenNames = new Set()
      const deduplicated = []
      for (const rec of parsed) {
        const key = rec.imageName || rec.id
        if (!seenNames.has(key)) {
          seenNames.add(key)
          deduplicated.push(rec)
        }
      }
      // Add missing demos only if their imageName is not already in the records
      for (const demo of INITIAL_AI_DEMO_RECORDS) {
        if (!seenNames.has(demo.imageName)) {
          seenNames.add(demo.imageName)
          deduplicated.push(demo)
        }
      }
      localStorage.setItem(storageKey, JSON.stringify(deduplicated))
      return deduplicated
    }
    localStorage.setItem(storageKey, JSON.stringify(INITIAL_AI_DEMO_RECORDS))
    return INITIAL_AI_DEMO_RECORDS
  } catch {
    return INITIAL_AI_DEMO_RECORDS
  }
}

export default function App() {
  const [file, setFile] = useState(null)
  const [result, setResult] = useState(null)
  const [mode, setMode] = useState(null)   // 'predict' | 'explain'

  // Independent loading/error for classifier
  const [classLoading, setClassLoading] = useState(false)
  const [classError, setClassError] = useState(null)

  const [activeSampleId, setActiveSampleId] = useState(null)
  const [activeTab, setActiveTab] = useState('dashboard') // 'dashboard' | 'model-info' | 'ai-detector' | 'history'
  // File / record to hand off from dashboard/history to AI detector
  const [aiDetectorFile, setAiDetectorFile] = useState(null)
  const [aiDetectorRecord, setAiDetectorRecord] = useState(null)

  // Track image metadata & warnings from the last classifier response
  const [imageMeta, setImageMeta] = useState(null)
  const [warnings, setWarnings] = useState([])

  // Auth state — null means user is not signed in
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('smartvision_user') || sessionStorage.getItem('smartvision_user')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })

  // History state — scoped to current user
  const [history, setHistory] = useState(() => getInitialHistory(user))
  const [detectorHistory, setDetectorHistory] = useState(() => getInitialAIDetectorHistory(user))

  // Refresh detector history whenever switching to the history tab or when user changes
  useEffect(() => {
    if (activeTab === 'history') {
      setDetectorHistory(getInitialAIDetectorHistory(user))
    }
  }, [activeTab, user])

  const loading = classLoading

  const handleFile = (f) => {
    setFile(f)
    setResult(null)
    setClassError(null)
    setMode(null)
    setImageMeta(null)
    setWarnings([])
  }

  const handleLogout = () => {
    localStorage.removeItem('smartvision_user')
    sessionStorage.removeItem('smartvision_user')
    setUser(null)
    setHistory([])
    setDetectorHistory([])
    setFile(null)
    setResult(null)
  }

  const saveToHistory = async (data, targetFile, selectedMode) => {
    if (!data?.top1) return
    // Convert file to base64 for persistence across reloads
    const fileToBase64 = (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = (err) => reject(err)
        reader.readAsDataURL(file)
      })
    const thumbnailUrl = targetFile ? await fileToBase64(targetFile) : null
    const targetName = targetFile?.name || 'test_image.jpg'
    const newRecord = {
      id: 'scan-' + Date.now(),
      imageName: targetName,
      thumbnailUrl,
      top1: data.top1,
      top_k: data.top_k || [],
      status: data.status || 'confident',
      inference_ms: data.inference_ms || 42.0,
      timestamp: 'Just now',
      mode: selectedMode,
      heatmap_png_base64: data.heatmap_png_base64,
    }

    setHistory((prev) => {
      const filtered = prev.filter((r) => r.imageName !== targetName && r.id !== newRecord.id)
      const updated = [newRecord, ...filtered.slice(0, 19)]
      if (user?.email) {
        try {
          localStorage.setItem(`smartvision_history_${user.email}`, JSON.stringify(updated))
        } catch (e) {
          console.warn('Could not persist history', e)
        }
      }
      return updated
    })
  }

  const runWithFile = async (targetFile, selectedMode) => {
    if (!targetFile) return
    setClassLoading(true)
    setClassError(null)
    setResult(null)
    setMode(selectedMode)

    try {
      const data = selectedMode === 'explain'
        ? await explainImage(targetFile)
        : await predictImage(targetFile)
      setResult(data)
      // Capture image metadata and warnings from response
      if (data.image) setImageMeta(data.image)
      if (data.warnings) setWarnings(data.warnings)
      saveToHistory(data, targetFile, selectedMode)
    } catch (err) {
      setClassError(err.message || 'Something went wrong. Is the backend running?')
    } finally {
      setClassLoading(false)
    }
  }

  const run = (selectedMode) => {
    runWithFile(file, selectedMode)
  }

  const handleSelectSample = (sampleFile, sampleMeta, autoRun = false) => {
    setActiveSampleId(sampleMeta.id)
    handleFile(sampleFile)
    if (autoRun) {
      runWithFile(sampleFile, 'predict')
    }
  }

  const handleSelectRecord = (record) => {
    setResult({
      status: record.status,
      top1: record.top1,
      top_k: record.top_k,
      inference_ms: record.inference_ms,
      heatmap_png_base64: record.heatmap_png_base64,
    })
    setMode(record.mode || 'predict')
    window.scrollTo({ top: 400, behavior: 'smooth' })
  }

  const handleClearHistory = () => {
    // Clear user scans but always restore demo records so history is never empty
    setHistory(INITIAL_DEMO_RECORDS)
    if (user?.email) {
      const storageKey = `smartvision_history_${user.email}`
      try {
        localStorage.setItem(storageKey, JSON.stringify(INITIAL_DEMO_RECORDS))
      } catch (e) {
        console.warn('Could not update history', e)
      }
    }
  }

  const handleClearDetectorHistory = () => {
    setDetectorHistory(INITIAL_AI_DEMO_RECORDS)
    const storageKey = `smartvision_detector_history_${user?.email || 'user'}`
    try {
      localStorage.setItem(storageKey, JSON.stringify(INITIAL_AI_DEMO_RECORDS))
    } catch (e) {
      console.warn('Could not update detector history', e)
    }
  }

  return (
    <div className="app-wrapper">
      <div className="app-inner">

        {/* ── Header ── */}
        <header className="header">
          <div
            className="header-logo"
            title="SmartVision Home"
            onClick={() => setActiveTab('dashboard')}
            style={{ cursor: 'pointer' }}
          >
            <div className="logo-icon">👁️</div>
            <div>
              <div className="logo-text">SmartVision</div>
              <div className="logo-subtitle">AI Image Classifier</div>
            </div>
          </div>

          {/* Navigation Bar */}
          {user && (
            <Navbar
              activeTab={activeTab}
              onTabChange={setActiveTab}
              historyCount={history.length + detectorHistory.length}
            />
          )}

          <div className="header-actions">
            <ModelBadge />
            {user && (
              <UserMenu
                user={user}
                currentView={activeTab}
                onOpenAuth={() => {}}
                onNavigateClassifier={(tab) => setActiveTab(tab || 'dashboard')}
                onLogout={handleLogout}
              />
            )}
          </div>
        </header>

        {/* ── If NOT logged in: First display the Sign Up / Register page ── */}
        {!user ? (
          <AuthPage
            initialTab="signup"
            onLoginSuccess={(loggedInUser) => {
              setUser(loggedInUser)
              setHistory(getInitialHistory(loggedInUser))
              setDetectorHistory(getInitialAIDetectorHistory(loggedInUser))
            }}
          />
        ) : activeTab === 'model-info' ? (
          /* ── Model Info View ── */
          <ModelInfoView onNavigateDashboard={() => setActiveTab('dashboard')} />
        ) : activeTab === 'ai-detector' ? (
          /* ── AI Detector View ── */
          <AIDetectorView
            onNavigateDashboard={() => setActiveTab('dashboard')}
            initialFile={aiDetectorFile}
            initialRecord={aiDetectorRecord}
            user={user}
            key={aiDetectorFile ? aiDetectorFile.name + aiDetectorFile.lastModified : (aiDetectorRecord ? aiDetectorRecord.id : 'no-file')}
          />
        ) : activeTab === 'history' ? (
          /* ── Dedicated History View ── */
          <div className="dedicated-history-view fade-up">
            <div className="history-view-hero">
              <div>
                <div className="section-label">Classification & AI Detection History Records</div>
                <h2 className="history-view-title">Inference & Confidence Score Log</h2>
                <p className="history-view-desc">
                  Explore previous image classifications, AI detection verdicts, confidence distributions, and inspection details.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setActiveTab('dashboard')}
              >
                ⚡ Return to Dashboard Workspace
              </button>
            </div>

            {/* Classification History Table */}
            <ClassificationHistory
              records={history}
              onSelectRecord={(rec) => {
                handleSelectRecord(rec)
                setActiveTab('dashboard')
              }}
              onClearHistory={handleClearHistory}
            />

            {/* AI Detection History Table */}
            <AIDetectionHistory
              records={detectorHistory}
              onSelectRecord={(rec) => {
                setAiDetectorFile(null)
                setAiDetectorRecord(rec)
                setActiveTab('ai-detector')
              }}
              onClearHistory={handleClearDetectorHistory}
            />
          </div>
        ) : (
          /* ── Dashboard view (Default) ── */
          <div className="dashboard-view fade-up">

            {/* Dashboard Welcome Header */}
            <div className="dashboard-hero">
              <div className="dashboard-hero-content">
                <div className="dashboard-user-greeting">
                  <span className="greeting-avatar">
                    {user.avatarInitial || user.name?.[0]?.toUpperCase() || 'U'}
                  </span>
                  <div>
                    <h2 className="greeting-title">Welcome to your Dashboard, {user.name} 👋</h2>
                    <p className="greeting-desc">
                      ResNet-50 vision model active. Test sample images or upload your own image to get instant top-3 predictions and Grad-CAM heatmaps.
                    </p>
                  </div>
                </div>

                <div className="dashboard-stats-strip">
                  <div className="dash-stat">
                    <span className="stat-label">Model</span>
                    <span className="stat-value">ResNet-50</span>
                  </div>
                  <div className="dash-stat-divider" />
                  <div className="dash-stat">
                    <span className="stat-label">Classes</span>
                    <span className="stat-value">1,000 ImageNet</span>
                  </div>
                  <div className="dash-stat-divider" />
                  <div className="dash-stat">
                    <span className="stat-label">History Scans</span>
                    <span className="stat-value">{history.length} Records</span>
                  </div>
                  <div className="dash-stat-divider" />
                  <div className="dash-stat">
                    <span className="stat-label">Role</span>
                    <span className="stat-value highlight">{user.role || 'Researcher'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 1. Sample Images Bar for quick testing */}
            <SampleImagesBar
              onSelectSample={handleSelectSample}
              activeSampleId={activeSampleId}
              loading={loading}
            />

            {/* 2. Upload Section */}
            <div className="upload-section">
              <div className="section-label">
                <span>Upload Custom Image</span>
                <span className="sample-badge">Drag & drop, browse, or paste</span>
              </div>

              <ImageUploader
                file={file}
                onFile={(f) => { setActiveSampleId(null); handleFile(f); }}
                imageMeta={imageMeta}
                warnings={warnings}
              />

              {file && (
                <div className="action-row">
                  <button
                    id="btn-analyze"
                    className="btn btn-primary"
                    onClick={() => run('predict')}
                    disabled={loading}
                  >
                    {classLoading && mode === 'predict'
                      ? <><span className="spinner" /> Analyzing…</>
                      : '⚡ Analyze Image'}
                  </button>
                  <button
                    id="btn-explain"
                    className={`btn btn-secondary ${mode === 'explain' && result ? 'active' : ''}`}
                    onClick={() => run('explain')}
                    disabled={loading}
                  >
                    {classLoading && mode === 'explain'
                      ? <><span className="spinner" /> Explaining…</>
                      : '🔥 Explain (Grad-CAM)'}
                  </button>
                  <button
                    id="btn-detect-ai-from-dash"
                    className="btn btn-ai-detect"
                    onClick={() => { setAiDetectorFile(file); setAiDetectorRecord(null); setActiveTab('ai-detector') }}
                    disabled={loading}
                    title="Send this image to the AI Detector"
                  >
                    🛡️ Detect with AI
                  </button>
                </div>
              )}
            </div>

            {/* Classifier results */}
            <PredictionResults result={result} loading={classLoading} error={classError} />
            {!classLoading && result && mode === 'explain' && (
              <GradCamView result={result} originalFile={file} />
            )}

            {/* 3. Classification History Record */}
            <ClassificationHistory
              records={history}
              onSelectRecord={handleSelectRecord}
              onClearHistory={handleClearHistory}
            />

          </div>
        )}

      </div>
    </div>
  )
}
