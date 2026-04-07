type NewsArticle = {
  title: string | null
  description: string | null
  content: string | null
  url: string
  publishedAt: string | null
}

type NewsApiPayload = {
  status?: string
  message?: string
  articles?: unknown[]
}

const NEWS_API_URL = 'https://newsapi.org/v2/top-headlines'

function json(statusCode: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function articleFromUnknown(row: unknown): NewsArticle | null {
  if (!row || typeof row !== 'object') return null
  const item = row as Record<string, unknown>
  if (typeof item.url !== 'string' || !item.url.trim()) return null

  return {
    title: typeof item.title === 'string' ? item.title : null,
    description: typeof item.description === 'string' ? item.description : null,
    content: typeof item.content === 'string' ? item.content : null,
    url: item.url,
    publishedAt: typeof item.publishedAt === 'string' ? item.publishedAt : null,
  }
}

export default async function handler(): Promise<Response> {
  const key = process.env.NEWSAPI_KEY?.trim()
  if (!key) {
    return json(500, { message: 'Server is missing NEWSAPI_KEY' })
  }

  const upstream = new URL(NEWS_API_URL)
  upstream.searchParams.set('category', 'technology')
  upstream.searchParams.set('language', 'en')
  upstream.searchParams.set('pageSize', '15')
  upstream.searchParams.set('apiKey', key)

  try {
    const res = await fetch(upstream.toString())
    const body = (await res.json().catch(() => ({}))) as NewsApiPayload

    if (!res.ok || body.status === 'error') {
      return json(res.status || 502, {
        message:
          typeof body.message === 'string' && body.message.trim()
            ? body.message
            : 'Failed to fetch news from upstream provider',
      })
    }

    if (!Array.isArray(body.articles)) {
      return json(502, { message: 'Malformed news payload from upstream provider' })
    }

    const articles = body.articles
      .map(articleFromUnknown)
      .filter((a): a is NewsArticle => a !== null)

    return json(200, { articles })
  } catch {
    return json(502, { message: 'Failed to reach upstream news provider' })
  }
}
