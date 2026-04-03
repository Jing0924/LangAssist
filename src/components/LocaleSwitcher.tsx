import { useTranslation } from 'react-i18next'
import { UI_LOCALE_STORAGE_KEY } from '../i18n'

const OPTIONS = [
  { lng: 'zh-TW' as const, labelKey: 'localeSwitcher.zhTW' as const },
  { lng: 'en' as const, labelKey: 'localeSwitcher.en' as const },
]

export function LocaleSwitcher() {
  const { t, i18n } = useTranslation()

  return (
    <label className="locale-switcher">
      <span className="sr-only">{t('localeSwitcher.aria')}</span>
      <select
        className="locale-switcher__select glass-select glass-select--compact"
        value={i18n.language.startsWith('en') ? 'en' : 'zh-TW'}
        onChange={(e) => {
          const lng = e.target.value === 'en' ? 'en' : 'zh-TW'
          void i18n.changeLanguage(lng)
          try {
            localStorage.setItem(UI_LOCALE_STORAGE_KEY, lng)
          } catch {
            /* ignore */
          }
        }}
        aria-label={t('localeSwitcher.aria')}
      >
        {OPTIONS.map(({ lng, labelKey }) => (
          <option key={lng} value={lng}>
            {t(labelKey)}
          </option>
        ))}
      </select>
    </label>
  )
}
