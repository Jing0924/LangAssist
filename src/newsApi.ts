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

type HnStoryIdList = number[]

type HnItem = {
  id?: unknown
  type?: unknown
  title?: unknown
  url?: unknown
  time?: unknown
}

const HN_TOP_STORIES_URL = 'https://hacker-news.firebaseio.com/v0/topstories.json'
const HN_ITEM_URL = (id: number) =>
  `https://hacker-news.firebaseio.com/v0/item/${encodeURIComponent(String(id))}.json`

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}

function safeIsoDateFromUnixSeconds(raw: unknown): string | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  const ms = raw * 1000
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function articleFromHnItem(item: unknown): NewsArticle | null {
  if (!isRecord(item)) return null
  if (item.type !== 'story') return null
  const url = typeof item.url === 'string' ? item.url.trim() : ''
  if (!url) return null

  return {
    title: typeof item.title === 'string' && item.title.trim() ? item.title : null,
    description: null,
    content: null,
    url,
    publishedAt: safeIsoDateFromUnixSeconds(item.time),
  }
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`.trim())
  }
  return (await res.json()) as T
}

/**
 * Fetch technology headlines from a public, browser-callable source.
 *
 * Note: to keep the app frontend-only, we use Hacker News' public Firebase API.
 */
export async function fetchTechnologyHeadlines(
  signal?: AbortSignal,
): Promise<NewsArticle[]> {
  try {
    const ids = await fetchJson<HnStoryIdList>(HN_TOP_STORIES_URL, signal)
    if (!Array.isArray(ids)) {
      throw new Error(i18n.t('api.newsMalformed'))
    }

    // Fetch a bit more than we need because many top stories may not have URLs.
    const candidateIds = ids.filter((n) => typeof n === 'number').slice(0, 40)
    const items = await Promise.all(
      candidateIds.map(async (id) => fetchJson<HnItem>(HN_ITEM_URL(id), signal).catch(() => null)),
    )

    const articles = items
      .map(articleFromHnItem)
      .filter((a): a is NewsArticle => a !== null)
      .slice(0, 15)

    if (articles.length === 0) {
      throw new Error(i18n.t('api.newsMalformed'))
    }

    return articles
  } catch (err) {
    if (err instanceof Error) {
      // If we threw a user-friendly message earlier, keep it.
      if (err.message === i18n.t('api.newsMalformed')) throw err
    }
    throw new Error(parseNewsApiError(err))
  }
}
