import { motion } from 'framer-motion'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { isAbortError } from './abortError'
import {
  blobToBase64,
  detectLanguage,
  recognizeSpeech,
  speechLanguageCode,
  translateText,
} from './api'
import { useMagnetic } from './hooks/useMagnetic'
import { useTtsPlayback } from './hooks/useTtsPlayback'
import { useTypewriter } from './hooks/useTypewriter'
import { useVoiceRecorder, VIZ_BAR_COUNT } from './hooks/useVoiceRecorder'
import {
  LANGUAGES,
  PAIR_LANGUAGES,
  applyBidirectionalKanaJaHint,
  languageLabel,
  normalizeGoogleLangToAppCode,
  resolveBidirectionalTranslatePair,
} from './languages'
import './App.css'

type ProcessingStep = 'recognizing' | 'translating' | 'speaking'

type UiPhase = 'idle' | 'listening' | ProcessingStep

type TranslateMode = 'oneWay' | 'bidirectional'

function derivePhase(
  recording: boolean,
  busy: boolean,
  step: ProcessingStep,
): UiPhase {
  if (recording) return 'listening'
  if (!busy) return 'idle'
  return step
}

function StreamedText({
  text,
  charMs = 14,
}: {
  text: string
  charMs?: number
}) {
  const visible = useTypewriter(text, { charMs, enabled: text.length > 0 })
  const streaming = text.length > 0 && visible.length < text.length
  return (
    <>
      {visible}
      {streaming ? (
        <span className="stream-caret" aria-hidden="true" />
      ) : null}
    </>
  )
}

function VoiceWaveform({ levels }: { levels: number[] }) {
  return (
    <div className="voice-viz__bars" role="img" aria-label="音量波形">
      {levels.map((lv, i) => (
        <span
          key={i}
          className="voice-viz__bar"
          style={{
            transform: `scaleY(${0.12 + lv * 0.92})`,
            opacity: 0.35 + lv * 0.65,
          }}
        />
      ))}
    </div>
  )
}

export default function App() {
  const id = useId()
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [processingStep, setProcessingStep] =
    useState<ProcessingStep>('recognizing')
  const [translateMode, setTranslateMode] =
    useState<TranslateMode>('oneWay')
  const [sourceLang, setSourceLang] = useState<string>('auto')
  const [targetLang, setTargetLang] = useState<string>('en')
  const [pairLangA, setPairLangA] = useState<string>('zh-TW')
  const [pairLangB, setPairLangB] = useState<string>('ja')
  const [lastDetectedLang, setLastDetectedLang] = useState<string>('')
  const [lastTargetLang, setLastTargetLang] = useState<string>('')
  const [sourceText, setSourceText] = useState('')
  const [translatedText, setTranslatedText] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const [quickTestMsg, setQuickTestMsg] = useState<string | null>(null)
  const [quickTestBusy, setQuickTestBusy] = useState(false)

  const pipelineAbortRef = useRef<AbortController | null>(null)
  const quickTestAbortRef = useRef<AbortController | null>(null)
  const micActionRef = useRef<() => void>(() => {})

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

  const { startRecording: armRecorder, stopRecordingAndGetBlob, levels } =
    useVoiceRecorder(prepareRecording)

  useEffect(() => {
    return () => {
      abortPipeline()
      quickTestAbortRef.current?.abort()
      quickTestAbortRef.current = null
    }
  }, [abortPipeline])

  useEffect(() => {
    setLastDetectedLang('')
    setLastTargetLang('')
  }, [translateMode])

  const startRecording = useCallback(async () => {
    await armRecorder()
    setRecording(true)
  }, [armRecorder])

  const swapLanguages = useCallback(() => {
    if (translateMode === 'bidirectional') {
      const a = pairLangA
      setPairLangA(pairLangB)
      setPairLangB(a)
      return
    }
    if (sourceLang === 'auto') return
    const s = sourceLang
    const t = targetLang
    setSourceLang(t)
    setTargetLang(s)
  }, [translateMode, pairLangA, pairLangB, sourceLang, targetLang])

  const setPairA = useCallback((code: string) => {
    setPairLangA(code)
    if (code === pairLangB) {
      const pick = PAIR_LANGUAGES.find((l) => l.code !== code)
      if (pick) setPairLangB(pick.code)
    }
  }, [pairLangB])

  const setPairB = useCallback((code: string) => {
    setPairLangB(code)
    if (code === pairLangA) {
      const pick = PAIR_LANGUAGES.find((l) => l.code !== code)
      if (pick) setPairLangA(pick.code)
    }
  }, [pairLangA])

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
        setProcessingStep('recognizing')

        let transcript: string
        let effectiveSource: string
        let effectiveTarget: string

        if (translateMode === 'bidirectional') {
          const primary = pairLangA
          const altCode = speechLanguageCode(pairLangB)
          const { transcript: tr, detectedSpeechLanguage } =
            await recognizeSpeech(
              b64,
              blob.type || 'audio/webm',
              primary,
              signal,
              { alternativeLanguageCodes: [altCode] },
            )
          transcript = tr

          if (!transcript.trim()) {
            setHint('辨識結果為空，請靠近麥克風或說大聲一點。')
            setSourceText('（無辨識內容）')
            setTranslatedText('')
            setLastDetectedLang('')
            setLastTargetLang('')
            return
          }

          setProcessingStep('translating')
          const detRaw = await detectLanguage(transcript, signal)
          let textApp = detRaw
            ? normalizeGoogleLangToAppCode(detRaw)
            : null
          textApp = applyBidirectionalKanaJaHint(
            textApp,
            transcript,
            pairLangA,
            pairLangB,
          )
          let detectedApp = textApp
          if (!detectedApp && detectedSpeechLanguage) {
            detectedApp = normalizeGoogleLangToAppCode(detectedSpeechLanguage)
          }

          const dir = resolveBidirectionalTranslatePair(
            detectedApp,
            pairLangA,
            pairLangB,
          )
          if (!dir) {
            setHint(
              '無法判斷為已選的兩種語言之一，請再試一次或交換語言 A/B（主／輔辨識）。',
            )
            setSourceText(transcript)
            setTranslatedText('')
            setLastDetectedLang('')
            setLastTargetLang('')
            return
          }

          effectiveSource = dir.sourceLang
          effectiveTarget = dir.targetLang
          setLastDetectedLang(effectiveSource)
          setLastTargetLang(effectiveTarget)
        } else {
          const { transcript: tr } = await recognizeSpeech(
            b64,
            blob.type || 'audio/webm',
            sourceLang,
            signal,
          )
          transcript = tr
          effectiveSource = sourceLang
          effectiveTarget = targetLang

          if (!transcript.trim()) {
            setHint('辨識結果為空，請靠近麥克風或說大聲一點。')
            setSourceText('（無辨識內容）')
            setTranslatedText('')
            return
          }
        }

        setSourceText(transcript)
        setProcessingStep('translating')
        const translated = await translateText(
          transcript,
          effectiveTarget,
          effectiveSource,
          signal,
        )
        setTranslatedText(translated)
        setHint(null)
        setProcessingStep('speaking')
        try {
          await playTranslatedTts(translated, effectiveTarget, signal)
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
    translateMode,
    pairLangA,
    pairLangB,
    sourceLang,
    targetLang,
    startRecording,
    stopRecordingAndGetBlob,
    playTranslatedTts,
    abortPipeline,
  ])

  micActionRef.current = () => {
    void onMicClick()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return
      const t = e.target as HTMLElement | null
      if (
        t?.closest(
          'input, textarea, select, [contenteditable="true"], button',
        )
      ) {
        return
      }
      e.preventDefault()
      if (busy) return
      micActionRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy])

  const quickTestTarget =
    translateMode === 'bidirectional' ? pairLangB : targetLang

  const runQuickTranslateTest = useCallback(async () => {
    setQuickTestMsg(null)
    setQuickTestBusy(true)
    quickTestAbortRef.current?.abort()
    const ac = new AbortController()
    quickTestAbortRef.current = ac
    try {
      const out = await translateText(
        '你好，這是前端直接呼叫 Google Translation API 的測試。',
        quickTestTarget,
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
  }, [quickTestTarget])

  const phase = derivePhase(recording, busy, processingStep)

  const micMagnetic = useMagnetic({
    disabled: busy,
    maxOffsetPx: 11,
    parallaxFactor: 0.36,
  })

  const bubbleMagnetic = useMagnetic({
    maxOffsetPx: 10,
    parallaxFactor: 0.28,
    spring: { stiffness: 220, damping: 26, mass: 0.9 },
  })

  const statusLabel =
    phase === 'listening'
      ? '聆聽中'
      : phase === 'recognizing'
        ? '辨識中'
        : phase === 'translating'
          ? '翻譯中'
          : phase === 'speaking'
            ? '播放語音中'
            : '待機中'

  const safeLevels =
    levels.length >= VIZ_BAR_COUNT
      ? levels
      : [...levels, ...Array.from({ length: VIZ_BAR_COUNT - levels.length }, () => 0.06)]

  const bubbleOutLangTag =
    translateMode === 'bidirectional'
      ? lastDetectedLang
        ? languageLabel(lastDetectedLang)
        : '本次辨識'
      : languageLabel(sourceLang)

  const bubbleInLangTag =
    translateMode === 'bidirectional'
      ? lastTargetLang
        ? languageLabel(lastTargetLang)
        : '本次譯文'
      : languageLabel(targetLang)

  const swapDisabled =
    recording ||
    busy ||
    (translateMode === 'oneWay' && sourceLang === 'auto')

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
            className={[
              'status-pill',
              phase === 'listening' ? 'status-pill--live' : '',
              phase === 'idle' ? '' : '',
              phase === 'recognizing' ? 'status-pill--recognizing' : '',
              phase === 'translating' ? 'status-pill--translating' : '',
              phase === 'speaking' ? 'status-pill--speaking' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            role="status"
            aria-live="polite"
          >
            <span className="status-pill__dot" aria-hidden="true" />
            <span className="status-pill__label">{statusLabel}</span>
            {phase === 'recognizing' ? (
              <span className="status-pill__waves" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            ) : null}
            {phase === 'translating' ? (
              <span className="status-pill__orbit" aria-hidden="true" />
            ) : null}
            {phase === 'speaking' ? (
              <span className="status-pill__note" aria-hidden="true">
                ♪
              </span>
            ) : null}
          </div>
        </header>

        <section className="lang-bar glass-panel" aria-label="語言設定">
          <div
            className="mode-switch"
            role="group"
            aria-label="翻譯模式"
          >
            <button
              type="button"
              className={[
                'mode-switch__btn',
                translateMode === 'oneWay' ? 'mode-switch__btn--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setTranslateMode('oneWay')}
              disabled={recording || busy}
            >
              單向
            </button>
            <button
              type="button"
              className={[
                'mode-switch__btn',
                translateMode === 'bidirectional'
                  ? 'mode-switch__btn--active'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setTranslateMode('bidirectional')}
              disabled={recording || busy}
            >
              雙向對話
            </button>
          </div>

          {translateMode === 'oneWay' ? (
            <>
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
                disabled={swapDisabled}
                title={
                  sourceLang === 'auto'
                    ? '自動偵測時無法交換'
                    : '交換來源與目標語言'
                }
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
            </>
          ) : (
            <>
              <label className="sr-only" htmlFor={`${id}-pair-a`}>
                語言 A（主辨識）
              </label>
              <select
                id={`${id}-pair-a`}
                className="glass-select"
                value={pairLangA}
                onChange={(e) => setPairA(e.target.value)}
                disabled={recording || busy}
                title="語音辨識主語言（可多語時影響偏置，可與 B 交換）"
              >
                {PAIR_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="swap-btn"
                onClick={swapLanguages}
                disabled={recording || busy}
                title="交換語言 A/B（主／輔辨識）"
                aria-label="交換雙向語言 A 與 B"
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

              <label className="sr-only" htmlFor={`${id}-pair-b`}>
                語言 B（輔辨識）
              </label>
              <select
                id={`${id}-pair-b`}
                className="glass-select"
                value={pairLangB}
                onChange={(e) => setPairB(e.target.value)}
                disabled={recording || busy}
                title="替代辨識語言"
              >
                {PAIR_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </>
          )}
        </section>

        {recording ? (
          <div className="voice-viz glass-panel" aria-live="polite">
            <VoiceWaveform levels={safeLevels} />
            <p className="voice-viz__hint">系統正在收音，結束時再按一次或按空白鍵</p>
          </div>
        ) : null}

        <section className="chat-thread glass-panel" aria-label="對話">
          <div className="chat-thread__inner">
            <div className="bubble-row bubble-row--out">
              <article className="bubble bubble--out">
                <header className="bubble__meta">
                  <span className="bubble__name">你</span>
                  <span
                    className="bubble__lang"
                    title={
                      translateMode === 'bidirectional'
                        ? '本次辨識語言'
                        : undefined
                    }
                  >
                    {bubbleOutLangTag}
                  </span>
                </header>
                <div className="bubble__body">
                  {sourceText ? (
                    <StreamedText text={sourceText} charMs={12} />
                  ) : (
                    <span className="bubble__placeholder">
                      原文會顯示在這裡；點擊麥克風或按空白鍵開始說話。
                    </span>
                  )}
                </div>
              </article>
            </div>

            <div className="bubble-row bubble-row--in">
              <motion.article
                className="bubble bubble--in"
                style={{ x: bubbleMagnetic.x, y: bubbleMagnetic.y }}
                onPointerMove={bubbleMagnetic.onPointerMove}
                onPointerLeave={bubbleMagnetic.onPointerLeave}
              >
                <header className="bubble__meta">
                  <span className="bubble__name">譯文</span>
                  <span
                    className="bubble__lang"
                    title={
                      translateMode === 'bidirectional'
                        ? '本次朗讀／譯文語言'
                        : undefined
                    }
                  >
                    {bubbleInLangTag}
                  </span>
                </header>
                <motion.div
                  className="bubble__body bubble__body--translation"
                  style={{
                    x: bubbleMagnetic.innerX,
                    y: bubbleMagnetic.innerY,
                  }}
                >
                  {translatedText ? (
                    <StreamedText text={translatedText} charMs={10} />
                  ) : (
                    <span className="bubble__placeholder">
                      譯文會以對話氣泡顯示，並在完成後自動朗讀。
                    </span>
                  )}
                </motion.div>
              </motion.article>
            </div>
          </div>
        </section>

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
              {translateMode === 'bidirectional'
                ? `使用目前雙向配對的語言 B（${languageLabel(pairLangB)}）；`
                : '使用目前「目標語言」；'}
              需已在根目錄 <code className="quick-test__code">.env</code> 設定{' '}
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
          <motion.button
            type="button"
            className={[
              'mic-btn',
              recording ? 'mic-btn--active' : '',
              recording ? 'mic-btn--breathing' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ x: micMagnetic.x, y: micMagnetic.y }}
            onPointerMove={micMagnetic.onPointerMove}
            onPointerLeave={micMagnetic.onPointerLeave}
            onClick={() => void onMicClick()}
            aria-pressed={recording}
            aria-busy={busy}
            disabled={busy}
            aria-label={recording ? '停止並辨識翻譯' : '開始錄音'}
          >
            <span className="mic-btn__glow" aria-hidden="true" />
            <span className="mic-btn__ring" aria-hidden="true" />
            <motion.span
              className="mic-btn__inner"
              style={{ x: micMagnetic.innerX, y: micMagnetic.innerY }}
            >
              {recording ? (
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
                  <rect
                    x="7"
                    y="7"
                    width="10"
                    height="10"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.75"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
                  <path
                    d="M12 15a4 4 0 004-4V6a4 4 0 00-8 0v5a4 4 0 004 4zM19 11a7 7 0 01-14 0M12 19v3"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </motion.span>
          </motion.button>
          <p
            className={`controls__hint ${hint ? 'controls__hint--error' : ''}`}
          >
            {hint ??
              (busy
                ? phase === 'recognizing'
                  ? '語音辨識進行中…'
                  : phase === 'translating'
                    ? '翻譯進行中…'
                    : phase === 'speaking'
                      ? '播放譯文朗讀…'
                      : '處理中…'
                : recording
                  ? '再次點擊或空白鍵結束錄音'
                  : '空白鍵或點擊麥克風開始；憑證為 API 金鑰，詳見 .env.example')}
          </p>
        </footer>
      </div>
    </div>
  )
}
