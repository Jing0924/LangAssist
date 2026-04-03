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

export function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? '—'
}
