function getApiKey(): string {
  const key = import.meta.env.VITE_GOOGLE_CLOUD_API_KEY?.trim()
  if (!key) {
    throw new Error(
      '請在專案根目錄 .env 設定 VITE_GOOGLE_CLOUD_API_KEY（Google Cloud 憑證 → API 金鑰，並啟用 Speech-to-Text、Translation、Text-to-Speech）。',
    )
  }
  return key
}

function parseGoogleError(body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: { message?: string; status?: string } }).error
    const msg = err?.message ?? err?.status
    if (msg) return msg
  }
  return 'Google API 請求失敗'
}

/** @param {string | undefined} code */
function speechLanguageCode(code: string | undefined): string {
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
): Promise<string> {
  const key = getApiKey()
  const trimmed = text.trim()
  if (!trimmed) throw new Error('朗讀文字為空')

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
    },
  )

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(parseGoogleError(data))

  const audioContent = (data as { audioContent?: string }).audioContent
  if (typeof audioContent !== 'string' || !audioContent) {
    throw new Error('語音合成回應格式異常')
  }
  return audioContent
}

export async function translateText(
  text: string,
  targetLanguageCode: string,
  sourceLanguageCode?: string,
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
    },
  )

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(parseGoogleError(data))

  const translations = (data as { data?: { translations?: { translatedText?: string }[] } })
    .data?.translations
  const out = translations?.[0]?.translatedText
  if (typeof out !== 'string') throw new Error('翻譯回應格式異常')
  return out
}

export async function recognizeSpeech(
  audioBase64: string,
  mimeType: string,
  languageCode: string,
): Promise<string> {
  const key = getApiKey()
  const lang = speechLanguageCode(
    languageCode === 'auto' ? undefined : languageCode,
  )
  const isWebm =
    (mimeType && mimeType.includes('webm')) || !mimeType || mimeType.includes('opus')

  const config = isWebm
    ? {
        encoding: 'WEBM_OPUS' as const,
        sampleRateHertz: 48000,
        languageCode: lang,
        enableAutomaticPunctuation: true,
      }
    : {
        encoding: 'LINEAR16' as const,
        sampleRateHertz: 16000,
        languageCode: lang,
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
    },
  )

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(parseGoogleError(data))

  const results = (data as { results?: { alternatives?: { transcript?: string }[] }[] })
    .results
  const transcript =
    results?.map((r) => r.alternatives?.[0]?.transcript ?? '').join('\n').trim() ?? ''
  return transcript
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('無法讀取音訊'))
        return
      }
      const idx = result.indexOf(',')
      resolve(idx >= 0 ? result.slice(idx + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('read error'))
    reader.readAsDataURL(blob)
  })
}
