import { useCallback, useEffect, useRef } from 'react'

export function useVoiceRecorder(onBeforeStart: () => void) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const startRecording = useCallback(async () => {
    onBeforeStart()
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    streamRef.current = stream
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

  const stopRecordingAndGetBlob = useCallback(async (): Promise<Blob | null> => {
    const recorder = mediaRecorderRef.current
    mediaRecorderRef.current = null

    if (!recorder || recorder.state === 'inactive') {
      releaseStream()
      return null
    }

    return new Promise((resolve) => {
      recorder.addEventListener('stop', () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        })
        releaseStream()
        resolve(blob.size > 0 ? blob : null)
      })
      recorder.stop()
    })
  }, [releaseStream])

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
      releaseStream()
    }
  }, [releaseStream])

  return { startRecording, stopRecordingAndGetBlob }
}
