export const LANGUAGES = [
  { code: 'auto', label: '自動偵測' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
] as const

const APP_LANG_CODES = new Set<string>(
  LANGUAGES.filter((l) => l.code !== 'auto').map((l) => l.code),
)

export const PAIR_LANGUAGES = LANGUAGES.filter((l) => l.code !== 'auto')

export function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? '—'
}

function isChineseAppCode(code: string): boolean {
  return code === 'zh-TW' || code === 'zh-CN'
}

/**
 * Map Google STT / Translate BCP-47 codes to app language codes.
 */
export function normalizeGoogleLangToAppCode(raw: string): string | null {
  const t = raw.trim().replace(/_/g, '-')
  if (!t) return null

  if (APP_LANG_CODES.has(t)) return t

  const lower = t.toLowerCase()

  if (lower.startsWith('ja')) return 'ja'
  if (lower.startsWith('ko')) return 'ko'
  if (lower.startsWith('en')) return 'en'
  if (lower.startsWith('es')) return 'es'
  if (lower.startsWith('fr')) return 'fr'

  if (lower === 'zh-tw' || lower === 'zh-hant' || lower === 'zh-hk' || lower === 'zh-mo')
    return 'zh-TW'
  if (lower === 'zh-cn' || lower === 'zh-hans' || lower === 'zh-sg') return 'zh-CN'

  if (
    lower.includes('hant') ||
    lower.includes('-tw') ||
    lower.includes('-hk') ||
    lower.includes('-mo')
  )
    return 'zh-TW'
  if (lower.includes('hans') || lower.includes('-cn') || lower.includes('-sg'))
    return 'zh-CN'

  if (lower.startsWith('cmn')) {
    if (lower.includes('hant') || lower.includes('tw')) return 'zh-TW'
    if (lower.includes('hans') || lower.includes('cn')) return 'zh-CN'
    return 'zh-TW'
  }

  if (lower.startsWith('zh')) {
    if (lower.includes('tw') || lower.includes('hk') || lower.includes('mo') || lower.includes('hant'))
      return 'zh-TW'
    if (lower.includes('cn') || lower.includes('hans') || lower.includes('sg'))
      return 'zh-CN'
    return null
  }

  if (lower.startsWith('yue')) return 'zh-TW'

  return null
}

/** Hiragana, katakana, and half-width katakana (for STT transcripts). */
const KANA_RE = /[\u3040-\u309F\u30A0-\u30FF\uFF65-\uFF9F]/

/**
 * When the pair includes Japanese and the transcript contains kana, prefer `ja` over
 * Chinese or unknown detection — complements Translation detect on CJK-heavy strings.
 */
export function applyBidirectionalKanaJaHint(
  textApp: string | null,
  transcript: string,
  pairA: string,
  pairB: string,
): string | null {
  if (pairA !== 'ja' && pairB !== 'ja') return textApp
  if (!KANA_RE.test(transcript)) return textApp
  if (textApp === null || textApp === 'zh-TW' || textApp === 'zh-CN') return 'ja'
  return textApp
}

/**
 * Given a normalized app language for the utterance, pick source/target for Translation.
 * When exactly one side of the pair is Chinese, any Chinese variant matches that side;
 * source uses the detected variant when available.
 */
export function resolveBidirectionalTranslatePair(
  detectedAppCode: string | null,
  pairA: string,
  pairB: string,
): { sourceLang: string; targetLang: string } | null {
  if (pairA === pairB || !detectedAppCode) return null

  const aZh = isChineseAppCode(pairA)
  const bZh = isChineseAppCode(pairB)
  const dZh = isChineseAppCode(detectedAppCode)

  if (aZh && bZh) {
    if (detectedAppCode === pairA) return { sourceLang: pairA, targetLang: pairB }
    if (detectedAppCode === pairB) return { sourceLang: pairB, targetLang: pairA }
    return null
  }

  if (detectedAppCode === pairA) return { sourceLang: pairA, targetLang: pairB }
  if (detectedAppCode === pairB) return { sourceLang: pairB, targetLang: pairA }

  if (dZh && aZh && !bZh)
    return { sourceLang: detectedAppCode, targetLang: pairB }
  if (dZh && bZh && !aZh)
    return { sourceLang: detectedAppCode, targetLang: pairA }

  return null
}
