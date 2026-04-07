import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { translateText } from '../api'
import { isAbortError } from '../abortError'
import { fetchTechnologyHeadlines, type NewsArticle } from '../newsApi'
import { stripNewsApiPlainText } from '../newsPlainText'

function articleBody(a: NewsArticle): string {
  const c = stripNewsApiPlainText(a.content)
  const d = stripNewsApiPlainText(a.description)
  if (c) return c
  if (d) return d
  return ''
}

function buildSpeakText(a: NewsArticle): string {
  const title = a.title?.trim() ?? ''
  const body = articleBody(a)
  if (body) return `${title}. ${body}`
  return title
}

function articleKey(index: number, a: NewsArticle): string {
  return `${index}-${a.url}`
}

function formatPublishedAt(
  publishedAt: string | null,
  locale: string,
  unknownLabel: string,
): string {
  if (!publishedAt?.trim()) return unknownLabel
  const d = new Date(publishedAt)
  if (Number.isNaN(d.getTime())) return unknownLabel
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d)
  } catch {
    return unknownLabel
  }
}

export default function NewsPage() {
  const { t, i18n } = useTranslation()
  const [articles, setArticles] = useState<NewsArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [playingKey, setPlayingKey] = useState<string | null>(null)
  const [zhTitleByKey, setZhTitleByKey] = useState<Record<string, string>>({})

  const supportsSpeech =
    typeof window !== 'undefined' && 'speechSynthesis' in window

  const [, setVoiceListVersion] = useState(0)
  useEffect(() => {
    if (!supportsSpeech) return
    const ss = window.speechSynthesis
    const bump = () => setVoiceListVersion((n) => n + 1)
    bump()
    ss.addEventListener('voiceschanged', bump)
    return () => ss.removeEventListener('voiceschanged', bump)
  }, [supportsSpeech])

  useEffect(() => {
    const ac = new AbortController()
    fetchTechnologyHeadlines(ac.signal)
      .then((rows) => {
        setArticles(rows)
        setError(null)
      })
      .catch((e) => {
        if (isAbortError(e)) return
        setError(e instanceof Error ? e.message : t('api.newsRequestFailed'))
      })
      .finally(() => setLoading(false))
    return () => ac.abort()
  }, [t])

  useEffect(() => {
    if (!i18n.language.startsWith('zh')) return
    const ac = new AbortController()
    const { signal } = ac
    ;(async () => {
      const results = await Promise.all(
        articles.map(async (article, index) => {
          const key = articleKey(index, article)
          const title = article.title?.trim()
          if (!title) return null
          try {
            const zh = await translateText(title, 'zh-TW', 'en', signal)
            return { key, zh }
          } catch (e) {
            if (isAbortError(e)) return null
            return null
          }
        }),
      )
      if (signal.aborted) return
      const next: Record<string, string> = {}
      for (const row of results) {
        if (row?.zh) next[row.key] = row.zh
      }
      setZhTitleByKey(next)
    })().catch((e) => {
      if (!isAbortError(e)) console.error(e)
    })
    return () => ac.abort()
  }, [articles, i18n.language])

  const stopSpeaking = () => {
    if (!supportsSpeech) return
    window.speechSynthesis.cancel()
    setPlayingKey(null)
  }

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  const playArticle = (key: string, article: NewsArticle) => {
    if (!supportsSpeech) return
    const text = buildSpeakText(article).trim()
    if (!text) return

    window.speechSynthesis.cancel()
    setPlayingKey(key)

    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    const voices = window.speechSynthesis.getVoices()
    const voice =
      voices.find((v) => v.lang?.toLowerCase().startsWith('en')) ?? null
    if (voice) u.voice = voice
    u.onend = () => setPlayingKey(null)
    u.onerror = () => setPlayingKey(null)
    window.speechSynthesis.speak(u)
  }

  const unknownDate = t('newsPage.dateUnknown')
  const showZhLine = i18n.language.startsWith('zh')

  return (
    <main className="news-page" aria-labelledby="news-heading">
      <header className="glass-panel glass-panel--header news-page__toolbar">
        <div className="news-page__intro">
          <h2 id="news-heading" className="news-page__title">
            {t('newsPage.title')}
          </h2>
          <p className="news-page__hint">{t('newsPage.subtitle')}</p>
        </div>
      </header>

      <section
        className="glass-panel news-page__panel"
        aria-busy={loading}
        aria-live="polite"
      >
        {loading ? (
          <p className="news-page__status">{t('newsPage.loading')}</p>
        ) : null}

        {!loading && error ? (
          <p className="news-page__error" role="alert">
            {error}
          </p>
        ) : null}

        {!loading && !error && articles.length === 0 ? (
          <p className="news-page__status">{t('newsPage.empty')}</p>
        ) : null}

        {!loading && !error && articles.length > 0 ? (
          <ul className="news-page__list">
            {articles.map((article, index) => {
              const key = articleKey(index, article)
              const title = article.title?.trim() || t('newsPage.untitled')
              const zhTitle = zhTitleByKey[key]
              const isPlaying = playingKey === key
              const dateStr = formatPublishedAt(
                article.publishedAt,
                i18n.language,
                unknownDate,
              )
              return (
                <li key={key} className="news-card">
                  <h3 className="news-card__title">{title}</h3>
                  {showZhLine && zhTitle ? (
                    <p className="news-card__title-zh">{zhTitle}</p>
                  ) : null}
                  <p className="news-card__meta">
                    <time
                      className="news-card__date"
                      dateTime={article.publishedAt ?? undefined}
                    >
                      {dateStr}
                    </time>
                  </p>
                  <div className="news-card__actions">
                    {supportsSpeech ? (
                      isPlaying ? (
                        <button
                          type="button"
                          className="news-card__btn news-card__btn--stop"
                          onClick={stopSpeaking}
                        >
                          {t('newsPage.stop')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="news-card__btn"
                          onClick={() => playArticle(key, article)}
                        >
                          {t('newsPage.play')}
                        </button>
                      )
                    ) : (
                      <p className="news-card__tts-hint">
                        {t('newsPage.ttsUnsupported')}
                      </p>
                    )}
                    <a
                      className="news-card__link"
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t('newsPage.openSource')}
                    </a>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : null}
      </section>
    </main>
  )
}
