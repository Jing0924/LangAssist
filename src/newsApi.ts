import i18n from './i18n'

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
  message?: string
}

/**
 * Fetch technology headlines from the app's serverless proxy.
 */
export async function fetchTechnologyHeadlines(
  signal?: AbortSignal,
): Promise<NewsArticle[]> {
  const res = await fetch('/.netlify/functions/news', { signal })
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
