import { motion } from 'framer-motion'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { GlassBentoCard } from '../components/GlassBentoCard'
import { MotionPressable } from '../components/MotionPressable'
import {
  VOICE_GUIDE_PANEL_ID,
  VoiceGuidePanel,
} from '../components/VoiceGuidePanel'
import { isAbortError } from '../shared/lib/abortError'
import {
  blobToBase64,
  detectLanguage,
  recognizeSpeech,
  speechLanguageCode,
  translateText,
} from '../shared/api/speechTranslateApi'
import { useMagnetic } from '../hooks/useMagnetic'
import { useTtsPlayback } from '../hooks/useTtsPlayback'
import { useTypewriter } from '../hooks/useTypewriter'
import { useVoiceRecorder, VIZ_BAR_COUNT } from '../hooks/useVoiceRecorder'
import {
  LANGUAGES,
  PAIR_LANGUAGES,
  applyBidirectionalKanaJaHint,
  languageLabel,
  normalizeGoogleLangToAppCode,
  resolveBidirectionalTranslatePair,
} from '../shared/lib/languages'

/** Sync `recognize` 對過長音檔較不穩定；達上限則自動停止並辨識。 */
const RECORDING_MAX_SECONDS = 60

/** Internal state only; UI string is `voice.emptyTranscript`. */
const EMPTY_TRANSCRIPT_TOKEN = '__EMPTY__'

const VOICE_GUIDE_STORAGE_KEY = 'langassist-voice-guide-open'

type FooterHint =
  | null
  | { k: string; v?: Record<string, string> }
  | { raw: string }

type QuickTestResult =
  | { kind: 'success'; text: string }
  | { kind: 'error'; text: string }

type ProcessingStep = 'recognizing' | 'translating' | 'speaking'

type UiPhase = 'idle' | 'listening' | ProcessingStep

type TranslateMode = 'oneWay' | 'bidirectional'

const UI_TEXT: Record<string, string> = {
  'voice.viz.waveformAria': '音量波形',
  'voice.status.listening': '聆聽中',
  'voice.status.recognizing': '辨識中',
  'voice.status.translating': '翻譯中',
  'voice.status.speaking': '播放語音中',
  'voice.status.idle': '待機中',
  'voice.bubble.fallbackDetectedSession': '本次辨識',
  'voice.bubble.fallbackTranslationSession': '本次譯文',
  'voice.emptyTranscript': '（無辨識內容）',
  'voice.pageAria': '語音即時翻譯',
  'voice.toolbar.title': '語音即時翻譯',
  'voice.toolbar.subtitle': '空白鍵或下方麥克風開始／結束收音',
  'voice.langBarAria': '語言設定',
  'voice.mode.groupAria': '翻譯模式',
  'voice.mode.oneWay': '單向',
  'voice.mode.bidirectional': '雙向對話',
  'voice.lang.source': '來源語言',
  'voice.lang.target': '目標語言',
  'voice.lang.pairA': '語言 A（主辨識）',
  'voice.lang.pairB': '語言 B（輔辨識）',
  'voice.swap.titleAuto': '自動偵測時無法交換',
  'voice.swap.titleOneWay': '交換來源與目標語言',
  'voice.swap.ariaOneWay': '交換來源與目標語言',
  'voice.pairSelect.aTitle': '語音辨識主語言（可多語時影響偏置，可與 B 交換）',
  'voice.swap.titleBidirectional': '交換語言 A/B（主／輔辨識）',
  'voice.swap.ariaBidirectional': '交換雙向語言 A 與 B',
  'voice.pairSelect.bTitle': '替代辨識語言',
  'voice.viz.hint': '系統正在收音，結束時再按一次或按空白鍵',
  'voice.chatAria': '對話',
  'voice.bubble.you': '你',
  'voice.bubble.titleDetectedThisRound': '本次辨識語言',
  'voice.bubble.replaySourceAria': '重播原文朗讀',
  'voice.bubble.replaySourceTitle': '重播原文朗讀',
  'voice.bubble.placeholderSource': '原文會顯示在這裡；點擊麥克風或按空白鍵開始說話。',
  'voice.bubble.translation': '譯文',
  'voice.bubble.titleTranslationThisRound': '本次朗讀／譯文語言',
  'voice.bubble.replayTranslationAria': '重播譯文朗讀',
  'voice.bubble.replayTranslationTitle': '重播譯文朗讀',
  'voice.bubble.placeholderTranslation': '譯文會以對話氣泡顯示，並在完成後自動朗讀。',
  'voice.quickTest.aria': '連線檢查',
  'voice.quickTest.testing': '測試中…',
  'voice.quickTest.button': '測試翻譯連線',
  'voice.quickTest.hint':
    '送出一則測試訊息，確認翻譯服務是否可用。',
  'voice.controls.micStop': '停止並辨識翻譯',
  'voice.controls.micStart': '開始錄音',
  'voice.controls.processingRecognizing': '語音辨識進行中…',
  'voice.controls.processingTranslating': '翻譯進行中…',
  'voice.controls.processingSpeaking': '播放譯文朗讀…',
  'voice.controls.processingGeneric': '處理中…',
  'voice.controls.recordingStop': '再次點擊或空白鍵結束錄音',
  'voice.controls.idleCredentials': '空白鍵或點擊麥克風開始',
  'voice.hints.noAudioBlob': '沒有錄到音訊，請再試一次。',
  'voice.hints.emptyRecognize': '辨識結果為空，請靠近麥克風或說大聲一點。',
  'voice.hints.bidirectionalUnknown': '無法判斷為已選的兩種語言之一，請再試一次或交換語言 A/B（主／輔辨識）。',
  'voice.hints.ttsAfterTranslate': '翻譯完成，但朗讀失敗：{{message}}',
  'voice.hints.micDenied': '無法存取麥克風，請確認瀏覽器權限。',
  'voice.hints.sourceReplayFailed': '原文朗讀失敗：{{message}}',
  'voice.hints.translationReplayFailed': '譯文朗讀失敗：{{message}}',
  'voice.quickTest.success': '連線正常。範例譯文：{{result}}',
  'voice.quickTest.error': '無法連線：{{message}}',
  'voice.viz.timer': '{{current}} / {{max}} 秒（達上限將自動停止並辨識）',
}

function t(key: string, vars?: Record<string, string | number>): string {
  const template = UI_TEXT[key] ?? key
  if (!vars) return template
  return template.replace(/\{\{(\w+)\}\}/g, (_, token) => String(vars[token] ?? ''))
}

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
    <div className="voice-viz__bars" role="img" aria-label={t('voice.viz.waveformAria')}>
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

export default function VoiceTranslatePage() {
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
  /** 單向模式且來源為「自動」時，最後一次成功辨識所解析的 TTS 語言代碼 */
  const [lastOneWayAutoSourceLang, setLastOneWayAutoSourceLang] =
    useState<string>('')
  const [sourceText, setSourceText] = useState('')
  const [translatedText, setTranslatedText] = useState('')
  const [hint, setHint] = useState<FooterHint>(null)
  const [quickTestResult, setQuickTestResult] = useState<QuickTestResult | null>(
    null,
  )
  const [quickTestBusy, setQuickTestBusy] = useState(false)
  const [replayTtsBusy, setReplayTtsBusy] = useState(false)
  const [recordingElapsedSec, setRecordingElapsedSec] = useState(0)
  const [guideExpanded, setGuideExpanded] = useState(() => {
    try {
      return globalThis.localStorage?.getItem(VOICE_GUIDE_STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })

  const pipelineAbortRef = useRef<AbortController | null>(null)
  const quickTestAbortRef = useRef<AbortController | null>(null)
  const micActionRef = useRef<() => void>(() => {})

  const { stopTtsPlayback, playTranslatedTts } = useTtsPlayback()

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(
        VOICE_GUIDE_STORAGE_KEY,
        guideExpanded ? '1' : '0',
      )
    } catch {
      /* ignore quota / private mode */
    }
  }, [guideExpanded])

  const toggleGuide = () => {
    setGuideExpanded((v) => !v)
  }

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
    if (!recording) {
      setRecordingElapsedSec(0)
      return
    }
    setRecordingElapsedSec(0)
    let cleared = false
    const id = window.setInterval(() => {
      if (cleared) return
      setRecordingElapsedSec((s) => {
        const next = s + 1
        if (next >= RECORDING_MAX_SECONDS) {
          cleared = true
          window.clearInterval(id)
          queueMicrotask(() => micActionRef.current())
        }
        return next
      })
    }, 1000)
    return () => {
      cleared = true
      window.clearInterval(id)
    }
  }, [recording])

  useEffect(() => {
    setLastDetectedLang('')
    setLastTargetLang('')
    setLastOneWayAutoSourceLang('')
  }, [translateMode])

  useEffect(() => {
    if (translateMode !== 'oneWay' || sourceLang !== 'auto') {
      setLastOneWayAutoSourceLang('')
    }
  }, [translateMode, sourceLang])

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
          setHint({ k: 'voice.hints.noAudioBlob' })
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
            setHint({ k: 'voice.hints.emptyRecognize' })
            setSourceText(EMPTY_TRANSCRIPT_TOKEN)
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
            setHint({ k: 'voice.hints.bidirectionalUnknown' })
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
          const { transcript: tr, detectedSpeechLanguage } =
            await recognizeSpeech(
              b64,
              blob.type || 'audio/webm',
              sourceLang,
              signal,
              sourceLang === 'auto'
                ? {
                    autoLastDetectedAppCode: lastOneWayAutoSourceLang || undefined,
                    autoTargetAppCode: targetLang,
                  }
                : undefined,
            )
          transcript = tr
          effectiveSource = sourceLang
          effectiveTarget = targetLang

          if (!transcript.trim()) {
            setHint({ k: 'voice.hints.emptyRecognize' })
            setSourceText(EMPTY_TRANSCRIPT_TOKEN)
            setTranslatedText('')
            setLastOneWayAutoSourceLang('')
            return
          }

          if (sourceLang === 'auto') {
            let app = detectedSpeechLanguage
              ? normalizeGoogleLangToAppCode(detectedSpeechLanguage)
              : null
            if (!app) {
              const detRaw = await detectLanguage(transcript, signal)
              app = detRaw ? normalizeGoogleLangToAppCode(detRaw) : null
            }
            if (app) setLastOneWayAutoSourceLang(app)
            else setLastOneWayAutoSourceLang('')
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
          setHint({
            k: 'voice.hints.ttsAfterTranslate',
            v: { message: ttsMsg },
          })
        }
      } catch (e) {
        if (isAbortError(e)) return
        const msg = e instanceof Error ? e.message : String(e)
        setHint({ raw: msg })
      } finally {
        if (pipelineAbortRef.current === ac) pipelineAbortRef.current = null
        setBusy(false)
      }
      return
    }

    try {
      await startRecording()
    } catch {
      setHint({ k: 'voice.hints.micDenied' })
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
    lastOneWayAutoSourceLang,
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
    setQuickTestResult(null)
    setQuickTestBusy(true)
    quickTestAbortRef.current?.abort()
    const ac = new AbortController()
    quickTestAbortRef.current = ac
    try {
      // Fixed Chinese test utterance — source for API check, not UI copy.
      const out = await translateText(
        '你好，這是前端直接呼叫 Google Translation API 的測試。',
        quickTestTarget,
        'zh-TW',
        ac.signal,
      )
      setQuickTestResult({ kind: 'success', text: out })
      setHint(null)
    } catch (e) {
      if (isAbortError(e)) return
      const msg = e instanceof Error ? e.message : String(e)
      setQuickTestResult({ kind: 'error', text: msg })
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
      ? t('voice.status.listening')
      : phase === 'recognizing'
        ? t('voice.status.recognizing')
        : phase === 'translating'
          ? t('voice.status.translating')
          : phase === 'speaking'
            ? t('voice.status.speaking')
            : t('voice.status.idle')

  const safeLevels =
    levels.length >= VIZ_BAR_COUNT
      ? levels
      : [...levels, ...Array.from({ length: VIZ_BAR_COUNT - levels.length }, () => 0.06)]

  const bubbleOutLangTag =
    translateMode === 'bidirectional'
      ? lastDetectedLang
        ? languageLabel(lastDetectedLang)
        : t('voice.bubble.fallbackDetectedSession')
      : languageLabel(sourceLang)

  const bubbleInLangTag =
    translateMode === 'bidirectional'
      ? lastTargetLang
        ? languageLabel(lastTargetLang)
        : t('voice.bubble.fallbackTranslationSession')
      : languageLabel(targetLang)

  const ttsReplayLang =
    translateMode === 'bidirectional' ? lastTargetLang : targetLang
  const ttsSourceReplayLang =
    translateMode === 'bidirectional'
      ? lastDetectedLang
      : sourceLang === 'auto'
        ? lastOneWayAutoSourceLang
        : sourceLang

  const sourceTextForReplay = sourceText.trim()
  const hasReplayableSourceBody =
    Boolean(sourceTextForReplay) &&
    sourceTextForReplay !== EMPTY_TRANSCRIPT_TOKEN

  const canReplaySourceTts =
    hasReplayableSourceBody &&
    (translateMode === 'bidirectional'
      ? Boolean(lastDetectedLang)
      : sourceLang === 'auto'
        ? Boolean(lastOneWayAutoSourceLang)
        : true)

  const canReplayTranslatedTts =
    Boolean(translatedText.trim()) &&
    (translateMode === 'oneWay' || Boolean(lastTargetLang))

  const replaySourceTts = useCallback(async () => {
    if (!canReplaySourceTts) return
    setReplayTtsBusy(true)
    try {
      await playTranslatedTts(sourceText, ttsSourceReplayLang)
      setHint(null)
    } catch (e) {
      if (isAbortError(e)) return
      const ttsMsg = e instanceof Error ? e.message : String(e)
      setHint({
        k: 'voice.hints.sourceReplayFailed',
        v: { message: ttsMsg },
      })
    } finally {
      setReplayTtsBusy(false)
    }
  }, [
    canReplaySourceTts,
    sourceText,
    ttsSourceReplayLang,
    playTranslatedTts,
  ])

  const replayTranslatedTts = useCallback(async () => {
    if (!canReplayTranslatedTts) return
    setReplayTtsBusy(true)
    try {
      await playTranslatedTts(translatedText, ttsReplayLang)
      setHint(null)
    } catch (e) {
      if (isAbortError(e)) return
      const ttsMsg = e instanceof Error ? e.message : String(e)
      setHint({
        k: 'voice.hints.translationReplayFailed',
        v: { message: ttsMsg },
      })
    } finally {
      setReplayTtsBusy(false)
    }
  }, [
    canReplayTranslatedTts,
    translatedText,
    ttsReplayLang,
    playTranslatedTts,
  ])

  const swapDisabled =
    recording ||
    busy ||
    (translateMode === 'oneWay' && sourceLang === 'auto')

  const sourceDisplay =
    sourceText === EMPTY_TRANSCRIPT_TOKEN ? t('voice.emptyTranscript') : sourceText

  const footerHintText =
    hint === null
      ? null
      : 'raw' in hint
        ? hint.raw
        : t(hint.k, hint.v)

  return (
    <main className="voice-page" aria-label={t('voice.pageAria')}>
      <div
        className={[
          'bento-grid bento-grid--voice',
          recording ? 'bento-grid--voice--recording' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <GlassBentoCard className="glass-panel--header voice-page__toolbar bento-voice__toolbar">
          <div className="voice-page__intro">
            <h2 className="voice-page__title">{t('voice.toolbar.title')}</h2>
            <p className="voice-page__hint">{t('voice.toolbar.subtitle')}</p>
          </div>
          <div className="voice-page__toolbar-right">
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
            <div className="voice-page__toolbar-actions">
              <MotionPressable
                type="button"
                className="voice-page__btn-guide"
                onClick={toggleGuide}
                aria-expanded={guideExpanded}
                aria-controls={VOICE_GUIDE_PANEL_ID}
              >
                {guideExpanded ? '收合說明' : '新手導引'}
              </MotionPressable>
            </div>
          </div>
        </GlassBentoCard>

        {guideExpanded ? (
          <GlassBentoCard className="voice-page__guide-wrap bento-voice__guide">
            <VoiceGuidePanel
              id={VOICE_GUIDE_PANEL_ID}
              translateMode={translateMode}
              connectionCheckTargetLabel={
                translateMode === 'bidirectional'
                  ? languageLabel(pairLangB)
                  : languageLabel(targetLang)
              }
            />
          </GlassBentoCard>
        ) : null}

        <GlassBentoCard className="lang-bar bento-voice__lang" aria-label={t('voice.langBarAria')}>
          <div
            className="mode-switch"
            role="group"
            aria-label={t('voice.mode.groupAria')}
          >
            <MotionPressable
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
              {t('voice.mode.oneWay')}
            </MotionPressable>
            <MotionPressable
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
              {t('voice.mode.bidirectional')}
            </MotionPressable>
          </div>

          {translateMode === 'oneWay' ? (
            <>
              <label className="sr-only" htmlFor={`${id}-source`}>
                {t('voice.lang.source')}
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
                    {languageLabel(l.code)}
                  </option>
                ))}
              </select>

              <MotionPressable
                type="button"
                className="swap-btn"
                onClick={swapLanguages}
                disabled={swapDisabled}
                title={
                  sourceLang === 'auto'
                    ? t('voice.swap.titleAuto')
                    : t('voice.swap.titleOneWay')
                }
                aria-label={t('voice.swap.ariaOneWay')}
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
              </MotionPressable>

              <label className="sr-only" htmlFor={`${id}-target`}>
                {t('voice.lang.target')}
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
                    {languageLabel(l.code)}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <label className="sr-only" htmlFor={`${id}-pair-a`}>
                {t('voice.lang.pairA')}
              </label>
              <select
                id={`${id}-pair-a`}
                className="glass-select"
                value={pairLangA}
                onChange={(e) => setPairA(e.target.value)}
                disabled={recording || busy}
                title={t('voice.pairSelect.aTitle')}
              >
                {PAIR_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {languageLabel(l.code)}
                  </option>
                ))}
              </select>

              <MotionPressable
                type="button"
                className="swap-btn"
                onClick={swapLanguages}
                disabled={recording || busy}
                title={t('voice.swap.titleBidirectional')}
                aria-label={t('voice.swap.ariaBidirectional')}
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
              </MotionPressable>

              <label className="sr-only" htmlFor={`${id}-pair-b`}>
                {t('voice.lang.pairB')}
              </label>
              <select
                id={`${id}-pair-b`}
                className="glass-select"
                value={pairLangB}
                onChange={(e) => setPairB(e.target.value)}
                disabled={recording || busy}
                title={t('voice.pairSelect.bTitle')}
              >
                {PAIR_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {languageLabel(l.code)}
                  </option>
                ))}
              </select>
            </>
          )}
        </GlassBentoCard>

        {recording ? (
          <GlassBentoCard className="voice-viz bento-voice__viz" aria-live="polite">
            <VoiceWaveform levels={safeLevels} />
            <p className="voice-viz__hint">{t('voice.viz.hint')}</p>
            <p className="voice-viz__timer">
              {t('voice.viz.timer', {
                current: recordingElapsedSec,
                max: RECORDING_MAX_SECONDS,
              })}
            </p>
          </GlassBentoCard>
        ) : null}

        <GlassBentoCard
          className="chat-thread bento-voice__chat"
          aria-label={t('voice.chatAria')}
        >
          <div className="chat-thread__inner">
            <div className="bubble-row bubble-row--out">
              <article className="bubble bubble--out">
                <header className="bubble__meta">
                  <span className="bubble__name">{t('voice.bubble.you')}</span>
                  <div className="bubble__meta-trailing">
                    <span
                      className="bubble__lang"
                      title={
                        translateMode === 'bidirectional'
                          ? t('voice.bubble.titleDetectedThisRound')
                          : undefined
                      }
                    >
                      {bubbleOutLangTag}
                    </span>
                    {canReplaySourceTts ? (
                      <MotionPressable
                        type="button"
                        className="bubble-tts-replay"
                        onClick={() => void replaySourceTts()}
                        disabled={
                          replayTtsBusy || busy || recording
                        }
                        aria-label={t('voice.bubble.replaySourceAria')}
                        title={t('voice.bubble.replaySourceTitle')}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="16"
                          height="16"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M8 5v14l11-7L8 5z" />
                        </svg>
                      </MotionPressable>
                    ) : null}
                  </div>
                </header>
                <div className="bubble__body">
                  {sourceText ? (
                    <StreamedText text={sourceDisplay} charMs={12} />
                  ) : (
                    <span className="bubble__placeholder">
                      {t('voice.bubble.placeholderSource')}
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
                  <span className="bubble__name">
                    {t('voice.bubble.translation')}
                  </span>
                  <div className="bubble__meta-trailing">
                    <span
                      className="bubble__lang"
                      title={
                        translateMode === 'bidirectional'
                          ? t('voice.bubble.titleTranslationThisRound')
                          : undefined
                      }
                    >
                      {bubbleInLangTag}
                    </span>
                    {canReplayTranslatedTts ? (
                      <MotionPressable
                        type="button"
                        className="bubble-tts-replay"
                        onClick={() => void replayTranslatedTts()}
                        disabled={
                          replayTtsBusy || busy || recording
                        }
                        aria-label={t('voice.bubble.replayTranslationAria')}
                        title={t('voice.bubble.replayTranslationTitle')}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="16"
                          height="16"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M8 5v14l11-7L8 5z" />
                        </svg>
                      </MotionPressable>
                    ) : null}
                  </div>
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
                      {t('voice.bubble.placeholderTranslation')}
                    </span>
                  )}
                </motion.div>
              </motion.article>
            </div>
          </div>
        </GlassBentoCard>

        <GlassBentoCard
          className="quick-test bento-voice__quick"
          aria-label={t('voice.quickTest.aria')}
        >
          <div className="quick-test__row quick-test__row--stack">
            <MotionPressable
              type="button"
              className="quick-test__btn"
              onClick={() => void runQuickTranslateTest()}
              disabled={quickTestBusy || recording || busy}
            >
              {quickTestBusy
                ? t('voice.quickTest.testing')
                : t('voice.quickTest.button')}
            </MotionPressable>
            <p className="quick-test__hint">{t('voice.quickTest.hint')}</p>
          </div>
          {quickTestResult ? (
            <p
              className={`quick-test__result ${quickTestResult.kind === 'error' ? 'quick-test__result--error' : ''}`}
            >
              {quickTestResult.kind === 'success'
                ? t('voice.quickTest.success', { result: quickTestResult.text })
                : t('voice.quickTest.error', { message: quickTestResult.text })}
            </p>
          ) : null}
        </GlassBentoCard>

        <GlassBentoCard className="bento-voice__controls controls">
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
            whileTap={{ scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 520, damping: 32 }}
            onPointerMove={micMagnetic.onPointerMove}
            onPointerLeave={micMagnetic.onPointerLeave}
            onClick={() => void onMicClick()}
            aria-pressed={recording}
            aria-busy={busy}
            disabled={busy}
            aria-label={
              recording ? t('voice.controls.micStop') : t('voice.controls.micStart')
            }
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
            {footerHintText ??
              (busy
                ? phase === 'recognizing'
                  ? t('voice.controls.processingRecognizing')
                  : phase === 'translating'
                    ? t('voice.controls.processingTranslating')
                    : phase === 'speaking'
                      ? t('voice.controls.processingSpeaking')
                      : t('voice.controls.processingGeneric')
                : recording
                  ? t('voice.controls.recordingStop')
                  : t('voice.controls.idleCredentials'))}
          </p>
        </GlassBentoCard>
      </div>
    </main>
  )
}
