import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { TopNav } from './components/TopNav'
import SpeakingPracticePage from './pages/SpeakingPracticePage'
import VocabularyPage from './pages/VocabularyPage'
import VoiceTranslatePage from './pages/VoiceTranslatePage'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <div className="app-bg" aria-hidden="true">
          <div className="app-bg__orb app-bg__orb--a" />
          <div className="app-bg__orb app-bg__orb--b" />
          <div className="app-bg__orb app-bg__orb--c" />
        </div>

        <div className="app-layout">
          <header className="glass-panel glass-panel--header site-header">
            <div className="brand">
              <span className="brand__mark" aria-hidden="true">
                <svg viewBox="0 0 32 32" width="28" height="28" fill="none">
                  <circle
                    cx="16"
                    cy="16"
                    r="14"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    opacity="0.35"
                  />
                  <path
                    d="M10 16h4l2-5 4 10 2-5h4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <div>
                <h1 className="brand__title">LangAssist</h1>
                <p className="brand__tagline">語言輔助 · VoiceTranslate</p>
              </div>
            </div>
            <TopNav />
          </header>

          <Routes>
            <Route path="/" element={<Navigate to="/voice" replace />} />
            <Route path="/voice" element={<VoiceTranslatePage />} />
            <Route path="/vocabulary" element={<VocabularyPage />} />
            <Route path="/speaking" element={<SpeakingPracticePage />} />
            <Route path="*" element={<Navigate to="/voice" replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}
