/**
 * Proxies conversation practice chat to Gemini.
 * Keeps the existing frontend contract:
 * - non-stream: { reply }
 * - stream (SSE): data: {"c":"..."} ... data: {"done":true}
 */

type ChatRole = 'system' | 'user' | 'assistant'

type IncomingBody = {
  model?: unknown
  messages?: unknown
  temperature?: unknown
  stream?: unknown
}

type GeminiRole = 'user' | 'model'

type GeminiPart = { text: string }
type GeminiMessage = { role: GeminiRole; parts: GeminiPart[] }
type GeminiContentRoot = { parts: GeminiPart[] }
type GeminiGenerateResponse = {
  candidates?: Array<{ content?: GeminiContentRoot }>
  error?: { message?: string }
}
type GeminiErrorResponse = {
  error?: { message?: string }
}

function json(statusCode: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function geminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim()
  return key || null
}

function geminiApiBase(): string {
  const base = process.env.GEMINI_API_BASE?.trim()
  if (base) {
    return base.replace(/\/$/, '')
  }
  return 'https://generativelanguage.googleapis.com/v1beta'
}

function validate(
  raw: IncomingBody,
):
  | {
      ok: true
      data: {
        model: string
        messages: { role: ChatRole; content: string }[]
        temperature?: number
        stream: boolean
      }
    }
  | { ok: false; response: Response } {
  if (typeof raw.model !== 'string' || !raw.model.trim()) {
    return { ok: false, response: json(400, { message: 'model is required' }) }
  }
  if (!Array.isArray(raw.messages) || raw.messages.length === 0) {
    return { ok: false, response: json(400, { message: 'messages must be a non-empty array' }) }
  }
  const messages: { role: ChatRole; content: string }[] = []
  for (const row of raw.messages) {
    if (!row || typeof row !== 'object') {
      return { ok: false, response: json(400, { message: 'invalid message entry' }) }
    }
    const m = row as Record<string, unknown>
    const role = m.role
    const content = m.content
    if (role !== 'system' && role !== 'user' && role !== 'assistant') {
      return { ok: false, response: json(400, { message: 'invalid message role' }) }
    }
    if (typeof content !== 'string') {
      return { ok: false, response: json(400, { message: 'message content must be a string' }) }
    }
    messages.push({ role, content })
  }
  let temperature: number | undefined
  if (raw.temperature !== undefined) {
    if (typeof raw.temperature !== 'number' || Number.isNaN(raw.temperature)) {
      return { ok: false, response: json(400, { message: 'temperature must be a number' }) }
    }
    temperature = raw.temperature
  }
  const stream = raw.stream === true
  return {
    ok: true,
    data: { model: raw.model.trim(), messages, temperature, stream },
  }
}

function mapToGemini(
  messages: { role: ChatRole; content: string }[],
): { contents: GeminiMessage[]; systemInstruction?: GeminiContentRoot } {
  const systemTexts: string[] = []
  const contents: GeminiMessage[] = []

  for (const message of messages) {
    if (message.role === 'system') {
      if (message.content.trim()) {
        systemTexts.push(message.content)
      }
      continue
    }
    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    })
  }

  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: '' }] })
  }

  if (systemTexts.length === 0) {
    return { contents }
  }

  return {
    contents,
    systemInstruction: {
      parts: [{ text: systemTexts.join('\n\n') }],
    },
  }
}

function buildGenerateBody(
  messages: { role: ChatRole; content: string }[],
  temperature: number | undefined,
): Record<string, unknown> {
  const mapped = mapToGemini(messages)
  const body: Record<string, unknown> = { contents: mapped.contents }
  if (mapped.systemInstruction) {
    body.systemInstruction = mapped.systemInstruction
  }
  if (temperature !== undefined) {
    body.generationConfig = { temperature }
  }
  return body
}

function mapUpstreamStatus(status: number): number {
  if (status >= 400 && status < 600) {
    return status
  }
  return 502
}

function parseGeminiErrorText(raw: string): string | null {
  if (!raw.trim()) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as GeminiErrorResponse
    const message = parsed.error?.message
    if (typeof message === 'string' && message.trim()) {
      return message
    }
  } catch {
    /* ignore parse error */
  }
  return raw.trim() || null
}

function extractGeminiText(payload: GeminiGenerateResponse): string {
  const parts = payload.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) {
    return ''
  }
  return parts.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('')
}

function geminiGenerateUrl(base: string, model: string, key: string): string {
  return `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
}

function geminiStreamUrl(base: string, model: string, key: string): string {
  return `${base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`
}

function parseGeminiChunkText(rawData: string): string {
  if (!rawData.trim()) {
    return ''
  }
  try {
    const parsed = JSON.parse(rawData) as GeminiGenerateResponse
    return extractGeminiText(parsed)
  } catch {
    return ''
  }
}

function readSseDataEvents(chunk: string, pending: { value: string }): string[] {
  pending.value += chunk
  const segments = pending.value.split('\n\n')
  pending.value = segments.pop() ?? ''

  const events: string[] = []
  for (const segment of segments) {
    const dataLines = segment
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .filter(Boolean)

    if (dataLines.length > 0) {
      events.push(dataLines.join('\n'))
    }
  }

  return events
}

async function handleNonStream(
  base: string,
  key: string,
  model: string,
  messages: { role: ChatRole; content: string }[],
  temperature: number | undefined,
): Promise<Response> {
  let upstream: Response
  try {
    upstream = await fetch(geminiGenerateUrl(base, model, key), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildGenerateBody(messages, temperature)),
    })
  } catch {
    return json(502, {
      message: 'Could not reach Gemini API. Verify network and GEMINI_API_KEY.',
    })
  }

  const rawBody = await upstream.text().catch(() => '')
  if (!upstream.ok) {
    const message = parseGeminiErrorText(rawBody) || 'Gemini returned an error'
    return json(mapUpstreamStatus(upstream.status), { message })
  }

  let parsed: GeminiGenerateResponse = {}
  try {
    parsed = JSON.parse(rawBody) as GeminiGenerateResponse
  } catch {
    /* keep empty object */
  }

  const text = extractGeminiText(parsed).trim()
  if (!text) {
    return json(502, { message: 'Malformed response from Gemini' })
  }

  const reply = {
    id: crypto.randomUUID(),
    role: 'assistant' as const,
    content: text,
    createdAt: Date.now(),
  }
  return json(200, { reply })
}

function handleStream(
  base: string,
  key: string,
  model: string,
  messages: { role: ChatRole; content: string }[],
  temperature: number | undefined,
): Promise<Response> {
  return (async () => {
    let upstream: Response
    try {
      upstream = await fetch(geminiStreamUrl(base, model, key), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildGenerateBody(messages, temperature)),
      })
    } catch {
      return json(502, {
        message: 'Could not reach Gemini API. Verify network and GEMINI_API_KEY.',
      })
    }

    if (!upstream.ok) {
      const errBody = (await upstream.text().catch(() => '')).trim()
      const message = parseGeminiErrorText(errBody) || 'Gemini request failed'
      return json(mapUpstreamStatus(upstream.status), { message })
    }

    if (!upstream.body) {
      return json(502, { message: 'Gemini returned an empty body' })
    }

    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    const pending = { value: '' }

    const stream = new ReadableStream({
      async start(controller) {
        const reader = upstream.body!.getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              break
            }
            const textChunk = decoder.decode(value, { stream: true })
            const events = readSseDataEvents(textChunk, pending)
            for (const eventData of events) {
              const piece = parseGeminiChunkText(eventData)
              if (piece) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ c: piece })}\n\n`))
              }
            }
          }

          const tailEvents = readSseDataEvents('\n\n', pending)
          for (const eventData of tailEvents) {
            const piece = parseGeminiChunkText(eventData)
            if (piece) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ c: piece })}\n\n`))
            }
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      },
    })

    return new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store, no-transform',
        connection: 'keep-alive',
      },
    })
  })()
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }
  if (request.method !== 'POST') {
    return json(405, { message: 'Method not allowed' })
  }

  let body: IncomingBody
  try {
    body = (await request.json()) as IncomingBody
  } catch {
    return json(400, { message: 'Invalid JSON body' })
  }

  const validated = validate(body)
  if (!validated.ok) {
    return validated.response
  }

  const key = geminiApiKey()
  if (!key) {
    return json(500, { message: 'Missing GEMINI_API_KEY' })
  }

  const { model, messages, temperature, stream } = validated.data
  const base = geminiApiBase()

  if (stream) {
    return handleStream(base, key, model, messages, temperature)
  }
  return handleNonStream(base, key, model, messages, temperature)
}
