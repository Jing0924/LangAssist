import {
  type SpeakingChatRequest,
  type SpeakingChatResponse,
  type SpeakingChatError,
} from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_STREAM_TIMEOUT_MS = 120_000;

type ChatRole = "system" | "user" | "assistant";
type GeminiRole = "user" | "model";
type GeminiPart = { text: string };
type GeminiMessage = { role: GeminiRole; parts: GeminiPart[] };
type GeminiContentRoot = { parts: GeminiPart[] };
type GeminiGenerateResponse = {
  candidates?: Array<{ content?: GeminiContentRoot }>;
  error?: { message?: string };
};
type GeminiErrorResponse = { error?: { message?: string } };

function createSpeakingError(
  code: SpeakingChatError["code"],
  message: string,
): SpeakingChatError {
  const error = new Error(message) as SpeakingChatError;
  error.code = code;
  return error;
}

function mergeAbortSignals(
  user: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; dispose: () => void } {
  const ctrl = new AbortController();
  const tid = window.setTimeout(() => ctrl.abort(), timeoutMs);

  const onUserAbort = () => {
    window.clearTimeout(tid);
    ctrl.abort();
  };

  const dispose = () => {
    window.clearTimeout(tid);
    if (user) user.removeEventListener("abort", onUserAbort);
  };

  if (user) {
    if (user.aborted) {
      window.clearTimeout(tid);
      ctrl.abort();
    } else {
      user.addEventListener("abort", onUserAbort);
    }
  }

  return { signal: ctrl.signal, dispose };
}

function validateSpeakingPayload(payload: SpeakingChatRequest): void {
  if (!payload.model.trim()) {
    throw createSpeakingError("VALIDATION", "Model is required.");
  }
  if (payload.messages.length === 0) {
    throw createSpeakingError(
      "VALIDATION",
      "At least one message is required.",
    );
  }
}

function geminiApiKey(): string | null {
  const key = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim();
  return key || null;
}

function geminiApiBase(): string {
  // Keep this browser-safe (no server env access); can be extended to VITE_GEMINI_API_BASE later if needed.
  return "https://generativelanguage.googleapis.com/v1beta";
}

function mapToGemini(messages: { role: ChatRole; content: string }[]): {
  contents: GeminiMessage[];
  systemInstruction?: GeminiContentRoot;
} {
  const systemTexts: string[] = [];
  const contents: GeminiMessage[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      if (message.content.trim()) {
        systemTexts.push(message.content);
      }
      continue;
    }
    contents.push({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    });
  }

  if (contents.length === 0) {
    contents.push({ role: "user", parts: [{ text: "" }] });
  }

  if (systemTexts.length === 0) {
    return { contents };
  }

  return {
    contents,
    systemInstruction: { parts: [{ text: systemTexts.join("\n\n") }] },
  };
}

function buildGenerateBody(payload: SpeakingChatRequest): Record<string, unknown> {
  const mapped = mapToGemini(payload.messages as { role: ChatRole; content: string }[]);
  const body: Record<string, unknown> = { contents: mapped.contents };
  if (mapped.systemInstruction) {
    body.systemInstruction = mapped.systemInstruction;
  }
  if (payload.temperature !== undefined) {
    body.generationConfig = { temperature: payload.temperature };
  }
  return body;
}

function extractGeminiText(payload: GeminiGenerateResponse): string {
  const parts = payload.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("");
}

function parseGeminiErrorText(raw: string): string | null {
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as GeminiErrorResponse;
    const message = parsed.error?.message;
    if (typeof message === "string" && message.trim()) return message;
  } catch {
    /* ignore parse error */
  }
  return raw.trim() || null;
}

function normalizeGeminiModel(model: string): string {
  const trimmed = model.trim();
  // UI stores a bare model id (e.g. "gemini-2.0-flash-lite-001"), but users may paste "models/...".
  return trimmed.startsWith("models/") ? trimmed.slice("models/".length) : trimmed;
}

function geminiGenerateUrl(model: string, key: string): string {
  const base = geminiApiBase();
  const normalized = normalizeGeminiModel(model);
  return `${base}/models/${encodeURIComponent(normalized)}:generateContent?key=${encodeURIComponent(key)}`;
}

function geminiStreamUrl(model: string, key: string): string {
  const base = geminiApiBase();
  const normalized = normalizeGeminiModel(model);
  return `${base}/models/${encodeURIComponent(normalized)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;
}

function readSseDataEvents(chunk: string, pending: { value: string }): string[] {
  pending.value += chunk;
  // SSE events are separated by a blank line. Be tolerant to both LF and CRLF.
  const segments = pending.value.split(/\r?\n\r?\n/);
  pending.value = segments.pop() ?? "";

  const events: string[] = [];
  for (const segment of segments) {
    const dataLines = segment
      // Each field line is separated by LF/CRLF; split with CRLF tolerance to avoid trailing "\r".
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .filter(Boolean);
    if (dataLines.length > 0) {
      events.push(dataLines.join("\n"));
    }
  }
  return events;
}

export async function sendSpeakingChat(
  payload: SpeakingChatRequest,
  signal?: AbortSignal,
): Promise<SpeakingChatResponse> {
  validateSpeakingPayload(payload);
  const key = geminiApiKey();
  if (!key) {
    throw createSpeakingError(
      "VALIDATION",
      "Missing VITE_GEMINI_API_KEY. Add it to your .env and restart the dev server.",
    );
  }

  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(() => {
    timeoutController.abort();
  }, DEFAULT_TIMEOUT_MS);

  const linkedSignal = signal ?? timeoutController.signal;
  try {
    const response = await fetch(geminiGenerateUrl(payload.model.trim(), key), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildGenerateBody(payload)),
      signal: linkedSignal,
    });
    if (!response.ok) {
      const raw = await response.text();
      const message =
        parseGeminiErrorText(raw)?.slice(0, 400) ||
        `HTTP ${response.status} ${response.statusText}`.trim();
      throw createSpeakingError(
        "OLLAMA",
        message || "Speaking request failed.",
      );
    }
    const raw = await response.text();
    let parsed: GeminiGenerateResponse = {};
    try {
      parsed = JSON.parse(raw) as GeminiGenerateResponse;
    } catch {
      /* keep empty */
    }
    const text = extractGeminiText(parsed).trim();
    if (!text) {
      throw createSpeakingError("UNKNOWN", "Malformed speaking response.");
    }
    return {
      reply: {
        id: crypto.randomUUID(),
        role: "assistant",
        content: text,
        createdAt: Date.now(),
      },
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw createSpeakingError("TIMEOUT", "Speaking request timed out.");
    }
    if (error instanceof Error && "code" in error) {
      throw error as SpeakingChatError;
    }
    throw createSpeakingError(
      "NETWORK",
      "Network error while calling speaking API.",
    );
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/**
 * Streams assistant deltas via SSE from the speaking-chat function.
 */
export async function streamSpeakingChat(
  payload: SpeakingChatRequest,
  options: {
    onChunk: (delta: string) => void;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<void> {
  validateSpeakingPayload(payload);
  const key = geminiApiKey();
  if (!key) {
    throw createSpeakingError(
      "VALIDATION",
      "Missing VITE_GEMINI_API_KEY. Add it to your .env and restart the dev server.",
    );
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS;
  const { signal, dispose } = mergeAbortSignals(options.signal, timeoutMs);

  try {
    const response = await fetch(geminiStreamUrl(payload.model.trim(), key), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildGenerateBody(payload)),
      signal,
    });

    if (!response.ok) {
      const raw = await response.text();
      const message =
        parseGeminiErrorText(raw)?.slice(0, 400) ||
        `HTTP ${response.status} ${response.statusText}`.trim();
      throw createSpeakingError(
        "OLLAMA",
        message || "Speaking request failed.",
      );
    }

    if (!response.body) {
      throw createSpeakingError("UNKNOWN", "Empty response body.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const pending = { value: "" };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const textChunk = decoder.decode(value, { stream: true });
      const events = readSseDataEvents(textChunk, pending);
      for (const eventData of events) {
        if (eventData.trim() === "[DONE]") return;
        try {
          const parsed = JSON.parse(eventData) as GeminiGenerateResponse;
          const piece = extractGeminiText(parsed);
          if (piece) options.onChunk(piece);
        } catch {
          // Ignore non-JSON events to be resilient to upstream changes.
        }
      }
    }

    const tailEvents = readSseDataEvents("\n\n", pending);
    for (const eventData of tailEvents) {
      if (eventData.trim() === "[DONE]") return;
      try {
        const parsed = JSON.parse(eventData) as GeminiGenerateResponse;
        const piece = extractGeminiText(parsed);
        if (piece) options.onChunk(piece);
      } catch {
        /* ignore */
      }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw createSpeakingError("TIMEOUT", "Speaking stream was aborted.");
    }
    if (error instanceof Error && "code" in error) {
      throw error as SpeakingChatError;
    }
    throw createSpeakingError(
      "NETWORK",
      "Network error while streaming speaking API.",
    );
  } finally {
    dispose();
  }
}
