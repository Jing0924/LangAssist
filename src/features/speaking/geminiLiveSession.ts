import type { ChatMessage } from "./types";

export const GEMINI_LIVE_WS_PATH =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

export function geminiLiveWebSocketUrl(apiKey: string): string {
  return `${GEMINI_LIVE_WS_PATH}?key=${encodeURIComponent(apiKey)}`;
}

export type GeminiLiveSessionCallbacks = {
  onSetupComplete: () => void;
  onServerContent: (payload: {
    inputTranscriptionText?: string;
    inputTranscriptionFinished?: boolean;
    outputTranscriptionText?: string;
    outputTranscriptionFinished?: boolean;
    audioInlineBase64?: string;
    interrupted?: boolean;
    turnComplete?: boolean;
    generationComplete?: boolean;
  }) => void;
  onError: (message: string) => void;
  onClose: () => void;
};

function geminiApiKey(): string | null {
  const key = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim();
  return key || null;
}

function normalizeLiveModelId(model: string): string {
  const t = model.trim();
  return t.startsWith("models/") ? t.slice("models/".length) : t;
}

function chatMessagesToLiveTurns(messages: ChatMessage[]) {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: (m.role === "user" ? "user" : "model") as "user" | "model",
      parts: [{ text: m.content.trim() || " " }],
    }));
}

function buildSetupMessage(params: {
  modelId: string;
  systemInstruction: string;
  temperature: number;
  seedHistory: boolean;
}) {
  const modelUri = `models/${normalizeLiveModelId(params.modelId)}`;
  return {
    setup: {
      model: modelUri,
      generationConfig: {
        responseModalities: ["AUDIO"],
        temperature: params.temperature,
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Puck" },
          },
        },
      },
      systemInstruction: { parts: [{ text: params.systemInstruction }] },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          silenceDurationMs: 2000,
          prefixPaddingMs: 500,
          endOfSpeechSensitivity: "END_SENSITIVITY_UNSPECIFIED",
          startOfSpeechSensitivity: "START_SENSITIVITY_UNSPECIFIED",
        },
        activityHandling: "ACTIVITY_HANDLING_UNSPECIFIED",
        turnCoverage: "TURN_INCLUDES_ONLY_ACTIVITY",
      },
      ...(params.seedHistory
        ? { historyConfig: { initialHistoryInClientContent: true } }
        : {}),
    },
  };
}

export type GeminiLiveSession = {
  sendAudioPcmBase64: (b64: string) => void;
  close: () => void;
};

/**
 * Opens a Live API WebSocket, sends setup, optionally replays chat history via clientContent, then exposes audio send + close.
 */
export function connectGeminiLiveSession(options: {
  liveModelId: string;
  systemInstruction: string;
  temperature?: number;
  historyMessages: ChatMessage[];
  callbacks: GeminiLiveSessionCallbacks;
  signal?: AbortSignal;
}): Promise<GeminiLiveSession> {
  const key = geminiApiKey();
  if (!key) {
    return Promise.reject(
      new Error(
        "Missing VITE_GEMINI_API_KEY. Add it to your .env and restart the dev server.",
      ),
    );
  }

  const temperature = options.temperature ?? 0.7;
  const turns = chatMessagesToLiveTurns(options.historyMessages);
  const seedHistory = turns.length > 0;

  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(
        new DOMException("Gemini Live session aborted.", "AbortError"),
      );
      return;
    }

    let settled = false;
    let ws: WebSocket | null = new WebSocket(geminiLiveWebSocketUrl(key));

    const onAbort = () => {
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      if (!settled) {
        settled = true;
        reject(
          new DOMException(
            "Gemini Live session aborted.",
            "AbortError",
          ),
        );
      }
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });

    const fail = (msg: string) => {
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      if (!settled) {
        options.signal?.removeEventListener("abort", onAbort);
        settled = true;
        reject(new Error(msg));
        return;
      }
      options.callbacks.onError(msg);
    };

    const finishConnect = () => {
      if (settled) return;
      options.signal?.removeEventListener("abort", onAbort);
      settled = true;
      resolve({
        sendAudioPcmBase64: (b64: string) => {
          if (!ws || ws.readyState !== WebSocket.OPEN) return;
          ws.send(
            JSON.stringify({
              realtimeInput: {
                audio: {
                  data: b64,
                  mimeType: "audio/pcm;rate=16000",
                },
              },
            }),
          );
        },
        close: () => {
          try {
            ws?.close();
          } catch {
            /* ignore */
          }
          ws = null;
        },
      });
    };

    ws.onerror = () => {
      fail("WebSocket connection error.");
    };

    ws.onclose = () => {
      options.callbacks.onClose();
      ws = null;
    };

    ws.onopen = () => {
      try {
        ws?.send(
          JSON.stringify(
            buildSetupMessage({
              modelId: options.liveModelId,
              systemInstruction: options.systemInstruction,
              temperature,
              seedHistory,
            }),
          ),
        );
      } catch {
        fail("Failed to send Live setup message.");
      }
    };

    ws.onmessage = (ev) => {
      void (async () => {
        let text: string;
        if (typeof ev.data === "string") text = ev.data;
        else if (ev.data instanceof Blob) text = await ev.data.text();
        else text = new TextDecoder().decode(ev.data as ArrayBuffer);

        let data: Record<string, unknown>;
        try {
          data = JSON.parse(text) as Record<string, unknown>;
        } catch {
          return;
        }

        const err = data.error as { message?: string } | undefined;
        if (err && typeof err.message === "string" && err.message.trim()) {
          fail(err.message.trim());
          return;
        }

        if (data.setupComplete) {
          options.callbacks.onSetupComplete();
          if (seedHistory && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                clientContent: {
                  turns,
                  turnComplete: true,
                },
              }),
            );
          }
          finishConnect();
          return;
        }

        const serverContent = data.serverContent as Record<string, unknown> | undefined;
        if (!serverContent) return;

        const payload: Parameters<GeminiLiveSessionCallbacks["onServerContent"]>[0] =
          {};

        if (serverContent.interrupted === true) payload.interrupted = true;
        if (serverContent.turnComplete === true) payload.turnComplete = true;
        if (serverContent.generationComplete === true) {
          payload.generationComplete = true;
        }

        const inTr = serverContent.inputTranscription as
          | { text?: string; finished?: boolean }
          | undefined;
        if (inTr) {
          if (typeof inTr.text === "string") payload.inputTranscriptionText = inTr.text;
          if (typeof inTr.finished === "boolean") {
            payload.inputTranscriptionFinished = inTr.finished;
          }
        }

        const outTr = serverContent.outputTranscription as
          | { text?: string; finished?: boolean }
          | undefined;
        if (outTr) {
          if (typeof outTr.text === "string") {
            payload.outputTranscriptionText = outTr.text;
          }
          if (typeof outTr.finished === "boolean") {
            payload.outputTranscriptionFinished = outTr.finished;
          }
        }

        const modelTurn = serverContent.modelTurn as
          | { parts?: Array<{ inlineData?: { data?: string } }> }
          | undefined;
        const parts = modelTurn?.parts;
        if (Array.isArray(parts)) {
          for (const part of parts) {
            const d = part.inlineData?.data;
            if (typeof d === "string" && d.length > 0) {
              payload.audioInlineBase64 = d;
              break;
            }
          }
        }

        options.callbacks.onServerContent(payload);
      })();
    };
  });
}
