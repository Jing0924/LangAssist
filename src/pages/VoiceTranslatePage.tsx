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
import { cn } from '../lib/cn'
import { nativeGlassSelect, quickTestBtn } from '../lib/uiClasses'
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
        <span
          className="inline-block h-[1em] w-0.5 animate-caret-blink rounded-sm bg-current align-[-0.12em] opacity-55"
          aria-hidden="true"
        />
      ) : null}
    </>
  )
}

function VoiceWaveform({ levels }: { levels: number[] }) {
  return (
    <div
      className="flex h-[52px] w-full max-w-[420px] items-end justify-center gap-1"
      role="img"
      aria-label={t('voice.viz.waveformAria')}
    >
      {levels.map((lv, i) => (
        <span
          key={i}
          className="h-full min-w-[3px] max-w-[12px] flex-1 origin-bottom rounded-full bg-[linear-gradient(180deg,oklch(0.82_0.14_200/0.95)_0%,oklch(0.58_0.2_290/0.75)_100%)] shadow-[0_0_14px_oklch(0.78_0.14_200/0.28)] transition-[transform,opacity] duration-75"
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
    <main
      className="flex min-h-0 flex-1 flex-col gap-0"
      aria-label={t('voice.pageAria')}
    >
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-4 max-[839px]:gap-[0.85rem]',
          'min-[840px]:grid min-[840px]:grid-cols-12 min-[840px]:content-start min-[840px]:gap-4',
          recording
            ? 'min-[840px]:grid-rows-[auto_auto_auto_minmax(280px,1fr)_auto_auto]'
            : 'min-[840px]:grid-rows-[auto_auto_minmax(280px,1fr)_auto_auto]',
        )}
      >
        <GlassBentoCard className="order-1 flex min-[840px]:col-span-12 flex-wrap items-center justify-between gap-4 px-[clamp(0.85rem,2.2vw,1.35rem)] py-[clamp(0.65rem,1.5vw,0.9rem)]">
          <div className="flex min-w-0 flex-1 basis-[min(100%,200px)] flex-col gap-0.5 pr-1">
            <h2 className="m-0 text-[1.1rem] font-semibold tracking-tight text-foreground">
              {t('voice.toolbar.title')}
            </h2>
            <p className="m-0 text-[0.8125rem] font-normal leading-normal text-muted max-[799px]:line-clamp-2 max-[480px]:hidden">
              {t('voice.toolbar.subtitle')}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-4 gap-y-2.5">
            <div
              className={cn(
                'inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-[0.9rem] py-[0.45rem] text-[0.8125rem] font-medium text-secondary',
                phase === 'listening' &&
                  'border-accent-soft bg-cyan-400/10 text-accent',
                phase === 'recognizing' &&
                  'border-amber-400/40 bg-amber-400/10 text-amber-200/95',
                phase === 'translating' &&
                  'border-violet-400/40 bg-violet-500/10 text-violet-200/95',
                phase === 'speaking' &&
                  'border-emerald-400/40 bg-emerald-500/10 text-emerald-300/95',
              )}
              role="status"
              aria-live="polite"
            >
              <span
                className={cn(
                  'size-2 shrink-0 rounded-full bg-muted',
                  phase === 'listening' &&
                    'animate-pulse-dot bg-accent shadow-[0_0_12px_var(--accent-glow)]',
                  phase === 'recognizing' &&
                    'animate-pulse-dot-fast bg-amber-300/95',
                  phase === 'translating' && 'bg-violet-300/95 animate-translate-pulse',
                  phase === 'speaking' &&
                    'animate-speak-glow bg-emerald-300/95 shadow-[0_0_14px_rgba(52,211,153,0.35)]',
                )}
                aria-hidden="true"
              />
              <span className="shrink basis-auto">{statusLabel}</span>
              {phase === 'recognizing' ? (
                <span
                  className="ml-0.5 inline-flex h-3 items-end gap-0.5 [&>span]:w-[3px] [&>span]:animate-scan-bar [&>span]:rounded-sm [&>span]:bg-amber-300/85 [&>span:nth-child(2)]:[animation-delay:120ms] [&>span:nth-child(3)]:[animation-delay:240ms]"
                  aria-hidden="true"
                >
                  <span />
                  <span />
                  <span />
                </span>
              ) : null}
              {phase === 'translating' ? (
                <span
                  className="ml-0.5 size-3 animate-spin-orbit rounded-full border-2 border-violet-400/35 border-t-violet-200/95"
                  aria-hidden="true"
                />
              ) : null}
              {phase === 'speaking' ? (
                <span
                  className="ml-0.5 animate-note-bob text-lg text-emerald-300/95"
                  aria-hidden="true"
                >
                  ♪
                </span>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-2">
              <MotionPressable
                type="button"
                className="shrink-0 cursor-pointer rounded-[10px] border border-sky-400/35 bg-transparent px-[0.95rem] py-[0.45rem] font-sans text-[0.8125rem] font-semibold text-accent transition-[background,border-color] hover:border-sky-400/55 hover:bg-sky-400/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
          <GlassBentoCard className="order-2 max-h-[min(62vh,520px)] min-[840px]:col-span-12 self-stretch overflow-y-auto rounded-[18px] px-[clamp(1rem,2.2vw,1.35rem)] py-[clamp(0.9rem,2vw,1.15rem)]">
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

        <GlassBentoCard
          className="order-3 flex min-[840px]:col-span-12 flex-wrap items-center justify-center gap-3 px-[0.85rem] py-[0.65rem] min-[720px]:justify-center"
          aria-label={t('voice.langBarAria')}
        >
          <div
            className="flex w-full flex-1 flex-wrap justify-center gap-[0.35rem] pb-[0.15rem] min-[720px]:w-auto min-[720px]:flex-[0_1_auto] min-[720px]:justify-start min-[720px]:pb-0"
            role="group"
            aria-label={t('voice.mode.groupAria')}
          >
            <MotionPressable
              type="button"
              className={cn(
                'cursor-pointer rounded-[10px] border border-white/14 bg-white/[0.05] px-[0.85rem] py-[0.45rem] font-sans text-[0.8125rem] font-semibold text-muted transition-[color,border-color,background] hover:border-white/25 hover:text-secondary disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                translateMode === 'oneWay' &&
                  'border-accent-soft bg-cyan-400/10 text-accent',
              )}
              onClick={() => setTranslateMode('oneWay')}
              disabled={recording || busy}
            >
              {t('voice.mode.oneWay')}
            </MotionPressable>
            <MotionPressable
              type="button"
              className={cn(
                'cursor-pointer rounded-[10px] border border-white/14 bg-white/[0.05] px-[0.85rem] py-[0.45rem] font-sans text-[0.8125rem] font-semibold text-muted transition-[color,border-color,background] hover:border-white/25 hover:text-secondary disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                translateMode === 'bidirectional' &&
                  'border-accent-soft bg-cyan-400/10 text-accent',
              )}
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
                className={nativeGlassSelect}
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
                className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-white/14 bg-white/[0.06] text-secondary transition-[color,border-color,background] hover:border-accent-soft hover:bg-cyan-400/15 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
                className={nativeGlassSelect}
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
                className={nativeGlassSelect}
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
                className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-white/14 bg-white/[0.06] text-secondary transition-[color,border-color,background] hover:border-accent-soft hover:bg-cyan-400/15 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
                className={nativeGlassSelect}
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
          <GlassBentoCard
            className="order-5 flex min-[840px]:col-span-12 flex-col items-center gap-[0.65rem] rounded-[18px] px-4 pb-4 pt-[0.85rem] text-center"
            aria-live="polite"
          >
            <VoiceWaveform levels={safeLevels} />
            <p className="m-0 text-[0.8125rem] text-muted">
              {t('voice.viz.hint')}
            </p>
            <p className="m-0 text-xs tabular-nums text-muted opacity-[0.92]">
              {t('voice.viz.timer', {
                current: recordingElapsedSec,
                max: RECORDING_MAX_SECONDS,
              })}
            </p>
          </GlassBentoCard>
        ) : null}

        <GlassBentoCard
          className="order-4 flex min-h-[280px] flex-1 flex-col overflow-hidden max-[719px]:min-h-[200px] max-[839px]:h-auto max-[839px]:min-h-[280px] max-[839px]:flex-1 min-[840px]:col-span-12 min-[840px]:h-full min-[840px]:min-h-0"
          aria-label={t('voice.chatAria')}
        >
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-[1.1rem] pt-4">
            <div className="flex w-full justify-end">
              <article className="relative ml-8 max-w-[min(92%,560px)] rounded-[20px] rounded-br-md border border-[oklch(0.82_0.14_200/0.35)] bg-[linear-gradient(155deg,oklch(0.82_0.14_200/0.2)_0%,oklch(0.22_0.06_270/0.55)_100%)] px-[0.85rem] pb-3 pt-[0.65rem] shadow-[0_6px_28px_rgba(0,0,0,0.22)] max-[540px]:ml-2 max-[540px]:max-w-full">
                <header className="mb-[0.35rem] flex items-baseline justify-between gap-2">
                  <span className="text-[0.72rem] font-bold uppercase tracking-[0.06em] text-cyan-400/85">
                    {t('voice.bubble.you')}
                  </span>
                  <div className="flex shrink-0 items-center gap-[0.35rem]">
                    <span
                      className="text-[0.75rem] font-medium text-accent"
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
                        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/14 bg-white/[0.06] text-secondary transition-[color,border-color,background] hover:border-accent-soft hover:bg-cyan-400/15 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
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
                <div className="break-words text-[1.02rem] leading-relaxed text-foreground">
                  {sourceText ? (
                    <StreamedText text={sourceDisplay} charMs={12} />
                  ) : (
                    <span className="text-[0.9375rem] text-muted">
                      {t('voice.bubble.placeholderSource')}
                    </span>
                  )}
                </div>
              </article>
            </div>

            <div className="flex w-full justify-start">
              <motion.article
                className="relative mr-8 max-w-[min(92%,560px)] rounded-[20px] rounded-bl-md border border-white/12 bg-[linear-gradient(155deg,oklch(0.92_0.02_260/0.12)_0%,oklch(0.2_0.05_270/0.68)_100%)] px-[0.85rem] pb-3 pt-[0.65rem] shadow-[0_6px_28px_rgba(0,0,0,0.22)] max-[540px]:mr-2 max-[540px]:max-w-full"
                style={{ x: bubbleMagnetic.x, y: bubbleMagnetic.y }}
                onPointerMove={bubbleMagnetic.onPointerMove}
                onPointerLeave={bubbleMagnetic.onPointerLeave}
              >
                <header className="mb-[0.35rem] flex items-baseline justify-between gap-2">
                  <span className="text-[0.72rem] font-bold uppercase tracking-[0.06em] text-muted">
                    {t('voice.bubble.translation')}
                  </span>
                  <div className="flex shrink-0 items-center gap-[0.35rem]">
                    <span
                      className="text-[0.75rem] font-medium text-slate-200/65"
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
                        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/14 bg-white/[0.06] text-secondary transition-[color,border-color,background] hover:border-accent-soft hover:bg-cyan-400/15 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
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
                  className="break-words text-[1.02rem] leading-relaxed text-secondary"
                  style={{
                    x: bubbleMagnetic.innerX,
                    y: bubbleMagnetic.innerY,
                  }}
                >
                  {translatedText ? (
                    <StreamedText text={translatedText} charMs={10} />
                  ) : (
                    <span className="text-[0.9375rem] text-muted">
                      {t('voice.bubble.placeholderTranslation')}
                    </span>
                  )}
                </motion.div>
              </motion.article>
            </div>
          </div>
        </GlassBentoCard>

        <GlassBentoCard
          className="order-7 rounded-2xl px-4 py-[0.9rem] text-left min-[840px]:col-span-12 max-sm:px-3 max-sm:py-2.5"
          aria-label={t('voice.quickTest.aria')}
        >
          <div className="flex flex-col items-start gap-2.5">
            <MotionPressable
              type="button"
              className={quickTestBtn}
              onClick={() => void runQuickTranslateTest()}
              disabled={quickTestBusy || recording || busy}
            >
              {quickTestBusy
                ? t('voice.quickTest.testing')
                : t('voice.quickTest.button')}
            </MotionPressable>
            <p className="m-0 max-w-md text-xs leading-snug text-muted max-sm:hidden">
              {t('voice.quickTest.hint')}
            </p>
          </div>
          {quickTestResult ? (
            <p
              className={cn(
                'mt-2.5 mb-0 text-[0.8125rem] leading-normal break-words text-secondary',
                quickTestResult.kind === 'error' && 'text-danger',
              )}
            >
              {quickTestResult.kind === 'success'
                ? t('voice.quickTest.success', { result: quickTestResult.text })
                : t('voice.quickTest.error', { message: quickTestResult.text })}
            </p>
          ) : null}
        </GlassBentoCard>

        <GlassBentoCard
          className={cn(
            'order-6 flex min-[840px]:col-span-12 flex-col items-center gap-3 px-4 pb-4 pt-2 max-[839px]:sticky max-[839px]:bottom-0 max-[839px]:z-[25] max-[839px]:mt-auto max-[839px]:border max-[839px]:border-white/12 max-[839px]:bg-[oklch(0.17_0.055_275/0.82)] max-[839px]:pt-[0.85rem] max-[839px]:pb-[calc(1rem+env(safe-area-inset-bottom,0px))] max-[839px]:shadow-[0_-12px_36px_oklch(0.08_0.04_280/0.45),inset_0_1px_0_var(--glass-highlight)] max-[839px]:backdrop-blur-[22px]',
          )}
        >
          <motion.button
            type="button"
            className={cn(
              'group relative h-[88px] w-[88px] cursor-pointer rounded-full border-0 bg-transparent p-0 text-foreground focus-visible:outline-none',
              recording && 'text-accent',
            )}
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
            <span
              className={cn(
                'pointer-events-none absolute -inset-[14px] rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.45)_0%,rgba(34,211,238,0)_68%)] opacity-0 blur-[8px] transition-opacity duration-300',
                recording && 'animate-mic-breathe opacity-100',
              )}
              aria-hidden="true"
            />
            <span
              className={cn(
                'absolute inset-0 rounded-full border border-white/22 bg-gradient-to-br from-white/[0.16] to-white/[0.04] shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-xl transition-all duration-200 group-hover:border-cyan-400/45 group-hover:shadow-[0_8px_36px_rgba(34,211,238,0.15),inset_0_1px_0_rgba(255,255,255,0.2)] group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-4 group-focus-visible:outline-accent max-sm:backdrop-blur-[22px]',
                recording &&
                  'animate-mic-ring-breathe border-accent shadow-[0_0_0_4px_var(--accent-soft),0_12px_40px_rgba(34,211,238,0.25),inset_0_1px_0_rgba(255,255,255,0.2)]',
              )}
              aria-hidden="true"
            />
            <motion.span
              className="relative z-[1] flex size-full items-center justify-center"
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
            className={cn(
              'm-0 max-w-[min(420px,92vw)] text-center text-[0.8125rem] leading-snug text-muted',
              hint && 'text-danger',
            )}
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
