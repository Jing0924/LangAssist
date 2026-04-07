/**
 * Proxies chat to a local Ollama instance (default http://127.0.0.1:11434).
 * For local dev use `ollama serve` and `netlify dev`; this is not suitable for
 * public serverless deployment unless Ollama is reachable from the function runtime.
 */

type ChatRole = 'system' | 'user' | 'assistant'

type IncomingBody = {
  model?: unknown
  messages?: unknown
  temperature?: unknown
  stream?: unknown
}

const OLLAMA_BASE_DEFAULT = 'http://127.0.0.1:11434'

function json(statusCode: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function ollamaBase(): string {
  const fromEnv = process.env.OLLAMA_HOST?.trim() || process.env.OLLAMA_URL?.trim()
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '')
  }
  return OLLAMA_BASE_DEFAULT
}

function validate(
  raw: IncomingBody,
): { ok: true; data: { model: string; messages: { role: ChatRole; content: string }[]; temperature?: number; stream: boolean } } | { ok: false; response: Response } {
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

async function handleNonStream(
  base: string,
  model: string,
  messages: { role: ChatRole; content: string }[],
  temperature: number | undefined,
): Promise<Response> {
  const options: Record<string, number> = {}
  if (temperature !== undefined) {
    options.temperature = temperature
  }
  let upstream: Response
  try {
    upstream = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        ...(Object.keys(options).length > 0 ? { options } : {}),
      }),
    })
  } catch {
    return json(502, {
      message:
        'Could not reach Ollama. Start it with `ollama serve` and ensure the model is pulled.',
    })
  }
  const data = (await upstream.json().catch(() => ({}))) as {
    message?: { role?: string; content?: unknown }
    error?: string
  }
  if (!upstream.ok) {
    const msg =
      typeof data.error === 'string' && data.error.trim()
        ? data.error
        : 'Ollama returned an error'
    return json(upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502, {
      message: msg,
    })
  }
  const text =
    typeof data.message?.content === 'string' ? data.message.content : ''
  if (!text) {
    return json(502, { message: 'Malformed response from Ollama' })
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
  model: string,
  messages: { role: ChatRole; content: string }[],
  temperature: number | undefined,
): Promise<Response> {
  const options: Record<string, number> = {}
  if (temperature !== undefined) {
    options.temperature = temperature
  }

  return (async () => {
    let upstream: Response
    try {
      upstream = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          ...(Object.keys(options).length > 0 ? { options } : {}),
        }),
      })
    } catch {
      return json(502, {
        message:
          'Could not reach Ollama. Start it with `ollama serve` and ensure the model is pulled.',
      })
    }

    if (!upstream.ok) {
      const errBody = (await upstream.text().catch(() => '')).trim()
      let message = 'Ollama request failed'
      try {
        const j = JSON.parse(errBody) as { error?: string }
        if (typeof j.error === 'string' && j.error.trim()) {
          message = j.error
        }
      } catch {
        if (errBody) {
          message = errBody
        }
      }
      return json(upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502, {
        message,
      })
    }

    if (!upstream.body) {
      return json(502, { message: 'Ollama returned an empty body' })
    }

    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    let lineBuf = ''

    const stream = new ReadableStream({
      async start(controller) {
        const reader = upstream.body!.getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            lineBuf += decoder.decode(value, { stream: true })
            const parts = lineBuf.split('\n')
            lineBuf = parts.pop() ?? ''
            for (const line of parts) {
              const trimmed = line.trim()
              if (!trimmed) continue
              let parsed: unknown
              try {
                parsed = JSON.parse(trimmed)
              } catch {
                continue
              }
              if (!parsed || typeof parsed !== 'object') continue
              const rec = parsed as Record<string, unknown>
              const msg = rec.message
              if (!msg || typeof msg !== 'object') continue
              const piece = (msg as Record<string, unknown>).content
              if (typeof piece === 'string' && piece.length > 0) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ c: piece })}\n\n`),
                )
              }
            }
          }
          const tail = lineBuf.trim()
          if (tail) {
            try {
              const parsed = JSON.parse(tail) as Record<string, unknown>
              const msg = parsed.message
              if (msg && typeof msg === 'object') {
                const piece = (msg as Record<string, unknown>).content
                if (typeof piece === 'string' && piece.length > 0) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ c: piece })}\n\n`),
                  )
                }
              }
            } catch {
              /* ignore trailing garbage */
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
          controller.close()
        } catch (e) {
          controller.error(e)
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

  const { model, messages, temperature, stream } = validated.data
  const base = ollamaBase()

  if (stream) {
    return handleStream(base, model, messages, temperature)
  }
  return handleNonStream(base, model, messages, temperature)
}
