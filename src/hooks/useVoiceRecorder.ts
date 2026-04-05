import { useCallback, useEffect, useRef, useState } from 'react'

export const VIZ_BAR_COUNT = 28

export function useVoiceRecorder(onBeforeStart: () => void) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number>(0)

  const [levels, setLevels] = useState<number[]>(() =>
    Array.from({ length: VIZ_BAR_COUNT }, () => 0.06),
  )

  const stopVisualization = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    analyserRef.current = null
    const ctx = audioContextRef.current
    audioContextRef.current = null
    void ctx?.close().catch(() => {})
    setLevels(Array.from({ length: VIZ_BAR_COUNT }, () => 0.06))
  }, [])

  const startRecording = useCallback(async () => {
    onBeforeStart()
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    streamRef.current = stream

    try {
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.82
      analyser.minDecibels = -88
      analyser.maxDecibels = -22
      source.connect(analyser)
      analyserRef.current = analyser

      const freq = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        const a = analyserRef.current
        if (!a) return
        a.getByteFrequencyData(freq)
        const bins = VIZ_BAR_COUNT
        const chunk = Math.max(1, Math.floor(freq.length / bins))
        const next: number[] = []
        for (let i = 0; i < bins; i++) {
          let sum = 0
          const start = i * chunk
          for (let j = 0; j < chunk; j++) sum += freq[start + j] ?? 0
          const avg = sum / chunk / 255
          next.push(Math.min(1, Math.max(0.05, avg * 1.42)))
        }
        setLevels(next)
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch {
      /* visualization is best-effort */
    }

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : ''

    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream)

    chunksRef.current = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.start(250)
    mediaRecorderRef.current = recorder
  }, [onBeforeStart])

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const stopRecordingAndGetBlob = useCallback(async (): Promise<Blob | null> => {
    const recorder = mediaRecorderRef.current
    mediaRecorderRef.current = null

    if (!recorder || recorder.state === 'inactive') {
      stopVisualization()
      releaseStream()
      return null
    }

    return new Promise((resolve) => {
      recorder.addEventListener('stop', () => {
        stopVisualization()
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        })
        releaseStream()
        resolve(blob.size > 0 ? blob : null)
      })
      recorder.stop()
    })
  }, [releaseStream, stopVisualization])

  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current
      mediaRecorderRef.current = null
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop()
        } catch {
          /* ignore */
        }
      }
      stopVisualization()
      releaseStream()
    }
  }, [releaseStream, stopVisualization])

  return { startRecording, stopRecordingAndGetBlob, levels }
}
