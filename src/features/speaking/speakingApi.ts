import {
  type SpeakingChatRequest,
  type SpeakingChatResponse,
  type SpeakingChatError,
} from "./types";

/** Same origin as `newsApi`: Netlify exposes functions at `/.netlify/functions/*`. */
const SPEAKING_API_ENDPOINT = "/.netlify/functions/speaking-chat";
const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_STREAM_TIMEOUT_MS = 120_000;

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

export async function sendSpeakingChat(
  payload: SpeakingChatRequest,
  signal?: AbortSignal,
): Promise<SpeakingChatResponse> {
  validateSpeakingPayload(payload);

  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(() => {
    timeoutController.abort();
  }, DEFAULT_TIMEOUT_MS);

  const linkedSignal = signal ?? timeoutController.signal;
  try {
    const response = await fetch(SPEAKING_API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, stream: false }),
      signal: linkedSignal,
    });
    if (!response.ok) {
      const raw = await response.text();
      let message: string | undefined;
      try {
        const errJson = JSON.parse(raw) as { message?: string };
        message =
          typeof errJson.message === "string" ? errJson.message : undefined;
      } catch {
        message =
          raw.trim().slice(0, 200) ||
          `HTTP ${response.status} ${response.statusText}`.trim();
      }
      throw createSpeakingError(
        "OLLAMA",
        message ?? "Speaking request failed.",
      );
    }
    const data = (await response
      .json()
      .catch(() => ({}))) as Partial<SpeakingChatResponse>;
    if (!data.reply?.content || !data.reply.role) {
      throw createSpeakingError("UNKNOWN", "Malformed speaking response.");
    }
    return data as SpeakingChatResponse;
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
  const timeoutMs = options.timeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS;
  const { signal, dispose } = mergeAbortSignals(options.signal, timeoutMs);

  try {
    const response = await fetch(SPEAKING_API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, stream: true }),
      signal,
    });

    if (!response.ok) {
      const raw = await response.text();
      let message: string | undefined;
      try {
        const errJson = JSON.parse(raw) as { message?: string };
        message =
          typeof errJson.message === "string" ? errJson.message : undefined;
      } catch {
        message =
          raw.trim().slice(0, 200) ||
          `HTTP ${response.status} ${response.statusText}`.trim();
      }
      throw createSpeakingError(
        "OLLAMA",
        message ?? "Speaking request failed.",
      );
    }

    if (!response.body) {
      throw createSpeakingError("UNKNOWN", "Empty response body.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let carry = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      carry += decoder.decode(value, { stream: true });

      let sep: number;
      while ((sep = carry.indexOf("\n\n")) !== -1) {
        const block = carry.slice(0, sep);
        carry = carry.slice(sep + 2);
        for (const line of block.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const raw = trimmed.slice(trimmed.indexOf(":") + 1).trim();
          if (!raw) continue;
          let parsed: unknown;
          try {
            parsed = JSON.parse(raw) as { c?: string; done?: boolean };
          } catch {
            throw createSpeakingError(
              "UNKNOWN",
              "Malformed stream data from speaking API.",
            );
          }
          if (!parsed || typeof parsed !== "object") continue;
          const rec = parsed as { c?: string; done?: boolean };
          if (rec.done) return;
          if (typeof rec.c === "string" && rec.c.length > 0) {
            options.onChunk(rec.c);
          }
        }
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
