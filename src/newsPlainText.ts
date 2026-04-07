/**
 * Normalize NewsAPI article fields for display and TTS: remove truncation suffix,
 * strip HTML via the DOM, collapse whitespace.
 */
export function stripNewsApiPlainText(raw: string | null | undefined): string {
  if (raw == null) return ''
  let s = raw.trim()
  if (!s) return ''
  s = s.replace(/\s*\[\+\d+\s*chars\]\s*$/i, '').trim()
  if (!s) return ''
  const doc = new DOMParser().parseFromString(s, 'text/html')
  const plain = doc.body.textContent ?? ''
  return plain.replace(/\s+/g, ' ').trim()
}
