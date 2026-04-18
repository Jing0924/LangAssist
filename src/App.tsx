import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { lazy, Suspense, useEffect, useRef } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import { GlassBentoCard } from './components/GlassBentoCard'
import { TopNav } from './components/TopNav'

const VoiceTranslatePage = lazy(() => import('./pages/VoiceTranslatePage'))
const VocabularyPage = lazy(() => import('./pages/VocabularyPage'))
const SpeakingPracticePage = lazy(() => import('./pages/SpeakingPracticePage'))

const ROUTE_ANIM_ORDER = ['/voice', '/vocabulary', '/speaking'] as const

function RoutePageFallback() {
  return (
    <div
      className="flex min-h-[min(60vh,520px)] min-h-0 flex-1 flex-col items-center justify-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">載入頁面中</span>
      <div
        className="relative h-[3px] w-[min(240px,40vw)] overflow-hidden rounded-full bg-[oklch(0.85_0.02_275/0.22)] after:absolute after:inset-0 after:animate-route-shimmer after:bg-[linear-gradient(90deg,transparent,oklch(0.92_0.04_210/0.5),transparent)] motion-reduce:after:animate-none motion-reduce:after:opacity-45"
        aria-hidden
      />
    </div>
  )
}

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
              className="flex min-h-0 flex-1 flex-col"
              variants={variants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ type: 'spring', stiffness: 400, damping: 34 }}
            >
              <Suspense fallback={<RoutePageFallback />}>
                <VoiceTranslatePage />
              </Suspense>
            </motion.div>
          }
        />
        <Route
          path="/vocabulary"
          element={
            <motion.div
              className="flex min-h-0 flex-1 flex-col"
              variants={variants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ type: 'spring', stiffness: 400, damping: 34 }}
            >
              <Suspense fallback={<RoutePageFallback />}>
                <VocabularyPage />
              </Suspense>
            </motion.div>
          }
        />
        <Route
          path="/speaking"
          element={
            <motion.div
              className="flex min-h-0 flex-1 flex-col"
              variants={variants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ type: 'spring', stiffness: 400, damping: 34 }}
            >
              <Suspense fallback={<RoutePageFallback />}>
                <SpeakingPracticePage />
              </Suspense>
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
    <div className="relative min-h-svh overflow-x-hidden">
      <div
        className="fixed inset-0 z-0 bg-[linear-gradient(125deg,oklch(0.05_0.055_275)_0%,oklch(0.1_0.1_295)_38%,oklch(0.075_0.07_250)_68%,oklch(0.04_0.05_265)_100%)]"
        aria-hidden="true"
      >
        <div
          className="absolute -right-[8%] -top-[12%] size-[min(72vw,520px)] animate-float-a rounded-full bg-[radial-gradient(circle,oklch(0.78_0.16_210)_0%,oklch(0.6_0.12_240/0.45)_40%,transparent_68%)] blur-[64px] opacity-[0.65] pointer-events-none"
          aria-hidden
        />
        <div
          className="absolute -left-[18%] -bottom-[20%] size-[min(85vw,600px)] animate-float-b rounded-full bg-[radial-gradient(circle,oklch(0.62_0.26_305)_0%,oklch(0.45_0.15_300/0.4)_42%,transparent_65%)] blur-[64px] opacity-[0.65] pointer-events-none"
          aria-hidden
        />
        <div
          className="absolute top-[38%] left-[28%] size-[min(50vw,380px)] animate-float-c rounded-full bg-[radial-gradient(circle,oklch(0.72_0.14_200)_0%,oklch(0.55_0.1_220/0.35)_45%,transparent_70%)] blur-[64px] opacity-[0.35] pointer-events-none"
          aria-hidden
        />
      </div>

      <div className="relative z-[1] mx-auto flex min-h-svh max-w-[min(1240px,calc(100%-2rem))] flex-col gap-5 px-[clamp(1.25rem,4vw,2.25rem)] py-[clamp(1.25rem,4vw,2.25rem)] max-sm:gap-4 max-sm:px-[clamp(0.85rem,3vw,1.35rem)] max-sm:pb-[1.35rem] max-sm:pt-4">
        <GlassBentoCard className="flex flex-wrap items-center justify-between gap-4 gap-x-6 rounded-[18px] px-5 py-4 max-sm:sticky max-sm:top-0 max-sm:z-[60]">
          <div className="flex items-center gap-[0.85rem] text-left max-sm:gap-[0.65rem]">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border border-white/12 bg-white/[0.06] text-accent max-sm:h-10 max-sm:w-10 max-sm:rounded-xl [&_svg]:max-sm:h-[22px] [&_svg]:max-sm:w-[22px]"
              aria-hidden="true"
            >
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
              <h1 className="m-0 text-[1.35rem] font-semibold tracking-tight text-foreground max-sm:text-[1.05rem]">
                LangAssist
              </h1>
              <p className="mt-0.5 m-0 text-sm font-normal text-muted max-sm:hidden">
                語言輔助 · VoiceTranslate
              </p>
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
