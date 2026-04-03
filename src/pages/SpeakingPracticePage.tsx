import { useTranslation } from 'react-i18next'

export default function SpeakingPracticePage() {
  const { t } = useTranslation()

  return (
    <section
      className="glass-panel placeholder-page"
      aria-labelledby="speaking-heading"
    >
      <h2 id="speaking-heading" className="placeholder-page__title">
        {t('speakingPage.title')}
      </h2>
      <p className="placeholder-page__body">{t('speakingPage.body')}</p>
    </section>
  )
}
