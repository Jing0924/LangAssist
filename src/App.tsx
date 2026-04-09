import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import { GlassBentoCard } from './components/GlassBentoCard'
import { TopNav } from './components/TopNav'
import SpeakingPracticePage from './pages/SpeakingPracticePage'
import VoiceTranslatePage from './pages/VoiceTranslatePage'
import './App.css'

const ROUTE_ANIM_ORDER = ['/voice', '/speaking'] as const

function navDirection(from: string, to: string): number {
  const i0 = ROUTE_ANIM_ORDER.indexOf(
    from as (typeof ROUTE_ANIM_ORDER)[number],
  )
  const i1 = ROUTE_ANIM_ORDER.indexOf(
    to as (typeof ROUTE_ANIM_ORDER)[number],
  )
  if (i0 === -1 || i1 === -1) return 1
  return i1 > i0 ? 1 : -1
}

function AnimatedRoutes() {
  const location = useLocation()
  const reducedMotion = useReducedMotion()
  const transitionPrevRef = useRef(location.pathname)

  // Previous pathname must be read in the same render as the route swap so exit/enter
  // axes match Framer's AnimatePresence; ESLint forbids ref access during render.
  /* eslint-disable react-hooks/refs */
  let dir = 1
  if (transitionPrevRef.current !== location.pathname) {
    dir = navDirection(transitionPrevRef.current, location.pathname)
    transitionPrevRef.current = location.pathname
  }
  /* eslint-enable react-hooks/refs */

  const slide = !reducedMotion
  const variants = {
    initial: slide ? { x: dir * 32, opacity: 0.88 } : { opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: slide ? { x: dir * -32, opacity: 0.88 } : { opacity: 0 },
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Navigate to="/voice" replace />} />
        <Route
          path="/voice"
          element={
            <motion.div
              className="route-page"
              variants={variants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ type: 'spring', stiffness: 400, damping: 34 }}
            >
              <VoiceTranslatePage />
            </motion.div>
          }
        />
        <Route path="/vocabulary" element={<Navigate to="/voice" replace />} />
        <Route
          path="/speaking"
          element={
            <motion.div
              className="route-page"
              variants={variants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ type: 'spring', stiffness: 400, damping: 34 }}
            >
              <SpeakingPracticePage />
            </motion.div>
          }
        />
        <Route path="*" element={<Navigate to="/voice" replace />} />
      </Routes>
    </AnimatePresence>
  )
}

function AppShell() {
  useEffect(() => {
    document.documentElement.lang = 'zh-Hant'
    document.title = 'LangAssist — 語言輔助'
  }, [])

  return (
    <div className="app-shell">
      <div className="app-bg" aria-hidden="true">
        <div className="app-bg__orb app-bg__orb--a" />
        <div className="app-bg__orb app-bg__orb--b" />
        <div className="app-bg__orb app-bg__orb--c" />
      </div>

      <div className="app-layout">
        <GlassBentoCard className="glass-panel--header site-header">
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
        </GlassBentoCard>

        <AnimatedRoutes />
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
