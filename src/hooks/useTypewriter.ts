import { useEffect, useState } from 'react'

type Options = {
  charMs?: number
  enabled?: boolean
}

/**
 * Reveals fullText progressively when it changes (typewriter / stream feel).
 */
export function useTypewriter(fullText: string, options: Options = {}) {
  const charMs = options.charMs ?? 18
  const enabled = options.enabled !== false
  const [visible, setVisible] = useState(() => (enabled ? '' : fullText))

  useEffect(() => {
    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | undefined

    const run = () => {
      if (cancelled) return
      if (!enabled) {
        setVisible(fullText)
        return
      }
      if (!fullText) {
        setVisible('')
        return
      }
      setVisible('')
      let pos = 0
      intervalId = window.setInterval(() => {
        if (cancelled) return
        pos += 1
        if (pos >= fullText.length) {
          setVisible(fullText)
          if (intervalId !== undefined) window.clearInterval(intervalId)
          return
        }
        setVisible(fullText.slice(0, pos))
      }, Math.max(8, charMs))
    }

    const t = window.setTimeout(run, 0)
    return () => {
      cancelled = true
      window.clearTimeout(t)
      if (intervalId !== undefined) window.clearInterval(intervalId)
    }
  }, [fullText, charMs, enabled])

  return visible
}
