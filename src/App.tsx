import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { isAbortError } from './abortError'
import {
  blobToBase64,
  recognizeSpeech,
  translateText,
} from './api'
import { useTtsPlayback } from './hooks/useTtsPlayback'
import { useVoiceRecorder } from './hooks/useVoiceRecorder'
import { LANGUAGES, languageLabel } from './languages'
import './App.css'

export default function App() {
  const id = useId()
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sourceLang, setSourceLang] = useState<string>('auto')
  const [targetLang, setTargetLang] = useState<string>('en')
  const [sourceText, setSourceText] = useState(
    '點擊麥克風錄音，停止後會以瀏覽器直接呼叫 Google Cloud（Speech-to-Text、Translation、Text-to-Speech）辨識、翻譯並朗讀譯文；請在專案根目錄 .env 設定 VITE_GOOGLE_CLOUD_API_KEY。',
  )
  const [translatedText, setTranslatedText] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const [quickTestMsg, setQuickTestMsg] = useState<string | null>(null)
  const [quickTestBusy, setQuickTestBusy] = useState(false)

  const pipelineAbortRef = useRef<AbortController | null>(null)
  const quickTestAbortRef = useRef<AbortController | null>(null)

  const { stopTtsPlayback, playTranslatedTts } = useTtsPlayback()

  const abortPipeline = useCallback(() => {
    pipelineAbortRef.current?.abort()
    pipelineAbortRef.current = null
  }, [])

  const prepareRecording = useCallback(() => {
    abortPipeline()
    stopTtsPlayback()
    setHint(null)
  }, [abortPipeline, stopTtsPlayback])

  const { startRecording: armRecorder, stopRecordingAndGetBlob } =
    useVoiceRecorder(prepareRecording)

  useEffect(() => {
    return () => {
      abortPipeline()
      quickTestAbortRef.current?.abort()
      quickTestAbortRef.current = null
    }
  }, [abortPipeline])

  const startRecording = useCallback(async () => {
    await armRecorder()
    setRecording(true)
  }, [armRecorder])

  const swapLanguages = useCallback(() => {
    if (sourceLang === 'auto') return
    const s = sourceLang
    const t = targetLang
    setSourceLang(t)
    setTargetLang(s)
  }, [sourceLang, targetLang])

  const onMicClick = useCallback(async () => {
    if (busy) return

    if (recording) {
      setBusy(true)
      setRecording(false)
      abortPipeline()
      const ac = new AbortController()
      pipelineAbortRef.current = ac
      const { signal } = ac
      try {
        const blob = await stopRecordingAndGetBlob()
        if (!blob) {
          setHint('沒有錄到音訊，請再試一次。')
          return
        }
        const b64 = await blobToBase64(blob)
        const transcript = await recognizeSpeech(
          b64,
          blob.type || 'audio/webm',
          sourceLang,
          signal,
        )
        if (!transcript.trim()) {
          setHint('辨識結果為空，請靠近麥克風或說大聲一點。')
          setSourceText('（無辨識內容）')
          setTranslatedText('')
          return
        }
        setSourceText(transcript)
        const translated = await translateText(
          transcript,
          targetLang,
          sourceLang,
          signal,
        )
        setTranslatedText(translated)
        setHint(null)
        try {
          await playTranslatedTts(translated, targetLang, signal)
        } catch (ttsErr) {
          if (isAbortError(ttsErr)) return
          const ttsMsg =
            ttsErr instanceof Error ? ttsErr.message : String(ttsErr)
          setHint(`翻譯完成，但朗讀失敗：${ttsMsg}`)
        }
      } catch (e) {
        if (isAbortError(e)) return
        const msg = e instanceof Error ? e.message : String(e)
        setHint(msg)
      } finally {
        if (pipelineAbortRef.current === ac) pipelineAbortRef.current = null
        setBusy(false)
      }
      return
    }

    try {
      await startRecording()
    } catch {
      setHint('無法存取麥克風，請確認瀏覽器權限。')
    }
  }, [
    busy,
    recording,
    sourceLang,
    targetLang,
    startRecording,
    stopRecordingAndGetBlob,
    playTranslatedTts,
    abortPipeline,
  ])

  const runQuickTranslateTest = useCallback(async () => {
    setQuickTestMsg(null)
    setQuickTestBusy(true)
    quickTestAbortRef.current?.abort()
    const ac = new AbortController()
    quickTestAbortRef.current = ac
    try {
      const out = await translateText(
        '你好，這是前端直接呼叫 Google Translation API 的測試。',
        targetLang,
        'zh-TW',
        ac.signal,
      )
      setQuickTestMsg(`成功：${out}`)
      setHint(null)
    } catch (e) {
      if (isAbortError(e)) return
      const msg = e instanceof Error ? e.message : String(e)
      setQuickTestMsg(`失敗：${msg}`)
    } finally {
      if (quickTestAbortRef.current === ac) quickTestAbortRef.current = null
      setQuickTestBusy(false)
    }
  }, [targetLang])

  return (
    <div className="app-shell">
      <div className="app-bg" aria-hidden="true">
        <div className="app-bg__orb app-bg__orb--a" />
        <div className="app-bg__orb app-bg__orb--b" />
        <div className="app-bg__orb app-bg__orb--c" />
      </div>

      <div className="app-layout">
        <header className="glass-panel glass-panel--header">
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
              <h1 className="brand__title">VoiceTranslate</h1>
              <p className="brand__tagline">語音即時翻譯</p>
            </div>
          </div>
          <div
            className={`status-pill ${recording ? 'status-pill--live' : ''} ${busy ? 'status-pill--busy' : ''}`}
            role="status"
            aria-live="polite"
          >
            <span className="status-pill__dot" aria-hidden="true" />
            {busy ? '處理中…' : recording ? '聆聽中…' : '待機中'}
          </div>
        </header>

        <section className="lang-bar glass-panel" aria-label="語言設定">
          <label className="sr-only" htmlFor={`${id}-source`}>
            來源語言
          </label>
          <select
            id={`${id}-source`}
            className="glass-select"
            value={sourceLang}
            onChange={(e) => setSourceLang(e.target.value)}
            disabled={recording || busy}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="swap-btn"
            onClick={swapLanguages}
            disabled={sourceLang === 'auto' || recording || busy}
            title={sourceLang === 'auto' ? '自動偵測時無法交換' : '交換語言'}
            aria-label="交換來源與目標語言"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
              <path
                d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12m0 0l4-4m-4 4-4-4"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <label className="sr-only" htmlFor={`${id}-target`}>
            目標語言
          </label>
          <select
            id={`${id}-target`}
            className="glass-select"
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            disabled={recording || busy}
          >
            {LANGUAGES.filter((l) => l.code !== 'auto').map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </section>

        <div className="panels">
          <article className="glass-panel glass-panel--grow transcript-card">
            <header className="transcript-card__head">
              <span className="transcript-card__label">原文</span>
              <span className="transcript-card__lang">
                {languageLabel(sourceLang)}
              </span>
            </header>
            <div className="transcript-card__body" role="textbox" aria-readonly>
              {sourceText}
            </div>
          </article>

          <article className="glass-panel glass-panel--grow transcript-card">
            <header className="transcript-card__head">
              <span className="transcript-card__label">譯文</span>
              <span className="transcript-card__lang">
                {languageLabel(targetLang)}
              </span>
            </header>
            <div
              className="transcript-card__body transcript-card__body--translated"
              role="textbox"
              aria-readonly
            >
              {translatedText || '（翻譯將顯示於此）'}
            </div>
          </article>
        </div>

        <section className="quick-test glass-panel" aria-label="API 快速測試">
          <div className="quick-test__row">
            <button
              type="button"
              className="quick-test__btn"
              onClick={() => void runQuickTranslateTest()}
              disabled={quickTestBusy || recording || busy}
            >
              {quickTestBusy ? '測試中…' : '快速測試翻譯 API'}
            </button>
            <span className="quick-test__meta">
              使用目前「目標語言」；需已在根目錄 <code className="quick-test__code">.env</code> 設定{' '}
              <code className="quick-test__code">VITE_GOOGLE_CLOUD_API_KEY</code>
            </span>
          </div>
          {quickTestMsg ? (
            <p
              className={`quick-test__result ${quickTestMsg.startsWith('失敗') ? 'quick-test__result--error' : ''}`}
            >
              {quickTestMsg}
            </p>
          ) : null}
        </section>

        <footer className="controls">
          <button
            type="button"
            className={`mic-btn ${recording ? 'mic-btn--active' : ''}`}
            onClick={() => void onMicClick()}
            aria-pressed={recording}
            aria-busy={busy}
            disabled={busy}
            aria-label={recording ? '停止並辨識翻譯' : '開始錄音'}
          >
            <span className="mic-btn__ring" aria-hidden="true" />
            <span className="mic-btn__inner">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
                <path
                  d="M12 15a4 4 0 004-4V6a4 4 0 00-8 0v5a4 4 0 004 4zM19 11a7 7 0 01-14 0M12 19v3"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
          <p
            className={`controls__hint ${hint ? 'controls__hint--error' : ''}`}
          >
            {hint ??
              (busy
                ? '正在連線 Google Cloud…'
                : recording
                  ? '再次點擊結束錄音並送出辨識'
                  : '點擊開始錄音；憑證為 API 金鑰（非服務帳號 JSON），詳見 .env.example')}
          </p>
        </footer>
      </div>
    </div>
  )
}
