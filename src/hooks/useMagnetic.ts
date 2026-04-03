import {
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'

export type MagneticSpringConfig = {
  stiffness?: number
  damping?: number
  mass?: number
}

export type UseMagneticOptions = {
  strength?: number
  maxOffsetPx?: number
  parallaxFactor?: number
  spring?: MagneticSpringConfig
  disabled?: boolean
}

const defaultSpring: Required<MagneticSpringConfig> = {
  stiffness: 280,
  damping: 24,
  mass: 0.85,
}

export type UseMagneticResult = {
  x: MotionValue<number>
  y: MotionValue<number>
  innerX: MotionValue<number>
  innerY: MotionValue<number>
  onPointerMove: (e: ReactPointerEvent<Element>) => void
  onPointerLeave: (e: ReactPointerEvent<Element>) => void
}

export function useMagnetic(options: UseMagneticOptions = {}): UseMagneticResult {
  const {
    strength = 0.42,
    maxOffsetPx = 12,
    parallaxFactor = 0.34,
    spring: springOpt,
    disabled = false,
  } = options

  const [finePointer, setFinePointer] = useState(
    () =>
      typeof globalThis.window !== 'undefined' &&
      globalThis.window.matchMedia('(pointer: fine)').matches,
  )

  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof globalThis.window !== 'undefined' &&
      globalThis.window.matchMedia('(prefers-reduced-motion: reduce)')
        .matches,
  )

  useEffect(() => {
    const w = globalThis.window
    if (!w) return
    const mqFine = w.matchMedia('(pointer: fine)')
    const mqReduce = w.matchMedia('(prefers-reduced-motion: reduce)')
    const onFine = () => setFinePointer(mqFine.matches)
    const onReduce = () => setReducedMotion(mqReduce.matches)
    mqFine.addEventListener('change', onFine)
    mqReduce.addEventListener('change', onReduce)
    onFine()
    onReduce()
    return () => {
      mqFine.removeEventListener('change', onFine)
      mqReduce.removeEventListener('change', onReduce)
    }
  }, [])

  const springConfig = useMemo(
    () => ({
      stiffness: springOpt?.stiffness ?? defaultSpring.stiffness,
      damping: springOpt?.damping ?? defaultSpring.damping,
      mass: springOpt?.mass ?? defaultSpring.mass,
    }),
    [springOpt?.stiffness, springOpt?.damping, springOpt?.mass],
  )

  const xRaw = useMotionValue(0)
  const yRaw = useMotionValue(0)
  const x = useSpring(xRaw, springConfig)
  const y = useSpring(yRaw, springConfig)

  const magneticActive =
    !disabled && finePointer && !reducedMotion && maxOffsetPx > 0

  useEffect(() => {
    if (!magneticActive) {
      xRaw.set(0)
      yRaw.set(0)
    }
  }, [magneticActive, xRaw, yRaw])

  const innerX = useTransform(x, (v) => -v * parallaxFactor)
  const innerY = useTransform(y, (v) => -v * parallaxFactor)

  const clamp = useCallback(
    (v: number) => Math.max(-maxOffsetPx, Math.min(maxOffsetPx, v)),
    [maxOffsetPx],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<Element>) => {
      if (!magneticActive) return
      const el = e.currentTarget
      if (!(el instanceof HTMLElement)) return
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (w <= 0 || h <= 0) return
      const halfW = w / 2
      const halfH = h / 2
      const { offsetX, offsetY } = e.nativeEvent
      const nxx = (offsetX - halfW) / halfW
      const nyy = (offsetY - halfH) / halfH
      let mx = nxx * maxOffsetPx * strength
      let my = nyy * maxOffsetPx * strength
      mx = clamp(mx)
      my = clamp(my)
      xRaw.set(mx)
      yRaw.set(my)
    },
    [magneticActive, maxOffsetPx, strength, clamp, xRaw, yRaw],
  )

  const onPointerLeave = useCallback(() => {
    xRaw.set(0)
    yRaw.set(0)
  }, [xRaw, yRaw])

  return {
    x,
    y,
    innerX,
    innerY,
    onPointerMove,
    onPointerLeave,
  }
}
