import i18n from './i18n'

function getNewsApiKey(): string {
  const key = import.meta.env.VITE_NEWSAPI_KEY?.trim()
  if (!key) {
    throw new Error(i18n.t('api.newsMissingKey'))
  }
  return key
}

function parseNewsApiError(body: unknown): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const msg = (body as { message?: string }).message
    if (typeof msg === 'string' && msg.trim()) return msg.trim()
  }
  return i18n.t('api.newsRequestFailed')
}

export type NewsArticle = {
  title: string | null
  description: string | null
  content: string | null
  url: string
  publishedAt: string | null
}

type NewsApiResponse = {
  status?: string
  articles?: NewsArticle[]
}

/**
 * NewsAPI top headlines（technology、en）。需 `VITE_NEWSAPI_KEY`。
 * @see https://newsapi.org/docs/endpoints/top-headlines
 */
export async function fetchTechnologyHeadlines(
  signal?: AbortSignal,
): Promise<NewsArticle[]> {
  const key = getNewsApiKey()
  const url = new URL('https://newsapi.org/v2/top-headlines')
  url.searchParams.set('category', 'technology')
  url.searchParams.set('language', 'en')
  url.searchParams.set('pageSize', '15')
  url.searchParams.set('apiKey', key)

  const res = await fetch(url.toString(), { signal })
  const data = (await res.json().catch(() => ({}))) as NewsApiResponse

  if (!res.ok) {
    throw new Error(parseNewsApiError(data))
  }
  if (data.status === 'error') {
    throw new Error(parseNewsApiError(data))
  }
  if (!Array.isArray(data.articles)) {
    throw new Error(i18n.t('api.newsMalformed'))
  }
  return data.articles.map((a) => ({
    ...a,
    publishedAt: a.publishedAt ?? null,
  }))
}
