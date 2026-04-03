import { useCallback, useEffect, useRef } from 'react'
import { synthesizeSpeechMp3Base64 } from '../api'

export function useTtsPlayback() {
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null)
  const ttsObjectUrlRef = useRef<string | null>(null)

  const stopTtsPlayback = useCallback(() => {
    const a = ttsAudioRef.current
    if (a) {
      a.pause()
      a.src = ''
      ttsAudioRef.current = null
    }
    if (ttsObjectUrlRef.current) {
      URL.revokeObjectURL(ttsObjectUrlRef.current)
      ttsObjectUrlRef.current = null
    }
  }, [])

  const playTranslatedTts = useCallback(
    async (text: string, lang: string, signal?: AbortSignal) => {
      stopTtsPlayback()
      const b64 = await synthesizeSpeechMp3Base64(text, lang, signal)
      signal?.throwIfAborted()
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: 'audio/mpeg' })
      signal?.throwIfAborted()
      const url = URL.createObjectURL(blob)
      ttsObjectUrlRef.current = url
      const audio = new Audio(url)
      ttsAudioRef.current = audio
      audio.addEventListener('ended', () => {
        stopTtsPlayback()
      })
      try {
        await audio.play()
      } catch (err) {
        stopTtsPlayback()
        throw err
      }
    },
    [stopTtsPlayback],
  )

  useEffect(() => {
    return () => {
      stopTtsPlayback()
    }
  }, [stopTtsPlayback])

  return { stopTtsPlayback, playTranslatedTts }
}
