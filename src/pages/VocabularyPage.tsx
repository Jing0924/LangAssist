import { useTranslation } from 'react-i18next'

export default function VocabularyPage() {
  const { t } = useTranslation()

  return (
    <section
      className="glass-panel placeholder-page"
      aria-labelledby="vocab-heading"
    >
      <h2 id="vocab-heading" className="placeholder-page__title">
        {t('vocabularyPage.title')}
      </h2>
      <p className="placeholder-page__body">{t('vocabularyPage.body')}</p>
    </section>
  )
}
