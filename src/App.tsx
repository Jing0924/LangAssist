import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { TopNav } from './components/TopNav'
import NewsPage from './pages/NewsPage'
import SpeakingPracticePage from './pages/SpeakingPracticePage'
import VocabularyPage from './pages/VocabularyPage'
import VoiceTranslatePage from './pages/VoiceTranslatePage'
import './App.css'

function documentLangFromUi(uiLng: string): string {
  return uiLng.startsWith('en') ? 'en' : 'zh-Hant'
}

function AppShell() {
  const { t, i18n } = useTranslation()

  useEffect(() => {
    const apply = (lng: string) => {
      document.documentElement.lang = documentLangFromUi(lng)
      document.title = i18n.t('app.documentTitle')
    }
    apply(i18n.language)
    const onLang = (lng: string) => apply(lng)
    i18n.on('languageChanged', onLang)
    return () => {
      i18n.off('languageChanged', onLang)
    }
  }, [i18n])

  return (
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
              <h1 className="brand__title">{t('app.brandTitle')}</h1>
              <p className="brand__tagline">{t('app.tagline')}</p>
            </div>
          </div>
          <TopNav />
        </header>

        <Routes>
          <Route path="/" element={<Navigate to="/voice" replace />} />
          <Route path="/voice" element={<VoiceTranslatePage />} />
          <Route path="/vocabulary" element={<VocabularyPage />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/speaking" element={<SpeakingPracticePage />} />
          <Route path="*" element={<Navigate to="/voice" replace />} />
        </Routes>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}
