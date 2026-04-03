import i18n from './i18n'

function getApiKey(): string {
  const key = import.meta.env.VITE_GOOGLE_CLOUD_API_KEY?.trim()
  if (!key) {
    throw new Error(i18n.t('api.missingKey'))
  }
  return key
}

function parseGoogleError(body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: { message?: string; status?: string } }).error
    const msg = err?.message ?? err?.status
    if (msg) return msg
  }
  return i18n.t('api.requestFailed')
}

/** Speech-to-Text `RecognitionConfig.languageCode` / `alternativeLanguageCodes` */
export function speechLanguageCode(code: string | undefined): string {
  const map: Record<string, string> = {
    'zh-TW': 'zh-TW',
    'zh-CN': 'zh-CN',
    en: 'en-US',
    ja: 'ja-JP',
    ko: 'ko-KR',
    es: 'es-ES',
    fr: 'fr-FR',
  }
  if (!code || code === 'auto') return 'zh-TW'
  return map[code] ?? 'en-US'
}

/** Translation API v2 target/source BCP-47 (simplified) */
function translateLanguageCode(code: string): string {
  if (code === 'en') return 'en'
  return code
}

/** Text-to-Speech `voice.languageCode`（與 Console 語音清單一致） */
function ttsVoiceLanguageCode(code: string): string {
  const map: Record<string, string> = {
    'zh-TW': 'cmn-TW',
    'zh-CN': 'cmn-CN',
    en: 'en-US',
    ja: 'ja-JP',
    ko: 'ko-KR',
    es: 'es-ES',
    fr: 'fr-FR',
  }
  return map[code] ?? 'en-US'
}

/**
 * 將文字轉成 MP3（base64）。需於 Console 啟用 Cloud Text-to-Speech API。
 */
export async function synthesizeSpeechMp3Base64(
  text: string,
  targetLanguageCode: string,
  signal?: AbortSignal,
): Promise<string> {
  const key = getApiKey()
  const trimmed = text.trim()
  if (!trimmed) throw new Error(i18n.t('api.emptyTtsText'))

  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text: trimmed },
        voice: {
          languageCode: ttsVoiceLanguageCode(targetLanguageCode),
        },
        audioConfig: {
          audioEncoding: 'MP3',
        },
      }),
      signal,
    },
  )

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(parseGoogleError(data))

  const audioContent = (data as { audioContent?: string }).audioContent
  if (typeof audioContent !== 'string' || !audioContent) {
    throw new Error(i18n.t('api.ttsMalformed'))
  }
  return audioContent
}

export async function detectLanguage(
  text: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const key = getApiKey()
  const trimmed = text.trim()
  if (!trimmed) return undefined

  const res = await fetch(
    `https://translation.googleapis.com/language/translate/v2/detect?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: trimmed }),
      signal,
    },
  )

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(parseGoogleError(data))

  const det = (
    data as {
      data?: { detections?: { language?: string }[][] }
    }
  ).data?.detections?.[0]?.[0]?.language
  return typeof det === 'string' ? det : undefined
}

export type RecognizeSpeechResult = {
  transcript: string
  detectedSpeechLanguage?: string
}

export async function translateText(
  text: string,
  targetLanguageCode: string,
  sourceLanguageCode?: string,
  signal?: AbortSignal,
): Promise<string> {
  const key = getApiKey()
  const target = translateLanguageCode(targetLanguageCode)
  const body: Record<string, unknown> = {
    q: text,
    target,
    format: 'text',
  }
  if (sourceLanguageCode && sourceLanguageCode !== 'auto') {
    body.source = translateLanguageCode(sourceLanguageCode)
  }

  const res = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    },
  )

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(parseGoogleError(data))

  const translations = (data as { data?: { translations?: { translatedText?: string }[] } })
    .data?.translations
  const out = translations?.[0]?.translatedText
  if (typeof out !== 'string') throw new Error(i18n.t('api.translateMalformed'))
  return out
}

export async function recognizeSpeech(
  audioBase64: string,
  mimeType: string,
  languageCode: string,
  signal?: AbortSignal,
  opts?: { alternativeLanguageCodes?: string[] },
): Promise<RecognizeSpeechResult> {
  const key = getApiKey()
  const lang = speechLanguageCode(
    languageCode === 'auto' ? undefined : languageCode,
  )
  const alts = opts?.alternativeLanguageCodes?.filter((c) => c && c !== lang).slice(0, 2)
  const isWebm =
    (mimeType && mimeType.includes('webm')) || !mimeType || mimeType.includes('opus')

  const config = isWebm
    ? {
        encoding: 'WEBM_OPUS' as const,
        sampleRateHertz: 48000,
        languageCode: lang,
        ...(alts && alts.length > 0
          ? { alternativeLanguageCodes: alts }
          : {}),
        enableAutomaticPunctuation: true,
      }
    : {
        encoding: 'LINEAR16' as const,
        sampleRateHertz: 16000,
        languageCode: lang,
        ...(alts && alts.length > 0
          ? { alternativeLanguageCodes: alts }
          : {}),
        enableAutomaticPunctuation: true,
      }

  const res = await fetch(
    `https://speech.googleapis.com/v1/speech:recognize?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config,
        audio: { content: audioBase64 },
      }),
      signal,
    },
  )

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(parseGoogleError(data))

  const results = (
    data as {
      results?: {
        alternatives?: { transcript?: string }[]
        languageCode?: string
      }[]
    }
  ).results

  let detectedSpeechLanguage: string | undefined
  for (const r of results ?? []) {
    const lc = r.languageCode
    if (typeof lc === 'string' && lc.length > 0) {
      detectedSpeechLanguage = lc
      break
    }
  }

  const transcript =
    results?.map((r) => r.alternatives?.[0]?.transcript ?? '').join('\n').trim() ?? ''
  return { transcript, detectedSpeechLanguage }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error(i18n.t('api.readAudioFailed')))
        return
      }
      const idx = result.indexOf(',')
      resolve(idx >= 0 ? result.slice(idx + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('read error'))
    reader.readAsDataURL(blob)
  })
}
