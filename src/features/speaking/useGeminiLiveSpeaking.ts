import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { connectGeminiLiveSession, type GeminiLiveSession } from "./geminiLiveSession";
import { createLivePcm24Player, startLiveMicCapture, type MicCapture } from "./liveAudio";
import { SPEAKING_SYSTEM_INSTRUCTION } from "./speakingSystemInstruction";
import type { ChatMessage } from "./types";

export type LiveOralState = "idle" | "connecting" | "listening";

export type UseGeminiLiveSpeakingOptions = {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  liveModelId: string;
  /** When this changes, Live is torn down (e.g. active session id). */
  sessionKey: string;
};

const ORAL_PLACEHOLDER_USER = "（語音）";
const ORAL_PLACEHOLDER_ASSISTANT = "（語音回覆）";

export function useGeminiLiveSpeaking({
  messages,
  setMessages,
  liveModelId,
  sessionKey,
}: UseGeminiLiveSpeakingOptions) {
  const [liveState, setLiveState] = useState<LiveOralState>("idle");
  const [liveError, setLiveError] = useState<string | null>(null);

  const sessionRef = useRef<GeminiLiveSession | null>(null);
  const micRef = useRef<MicCapture | null>(null);
  const playerRef = useRef<ReturnType<typeof createLivePcm24Player> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const userTextBufRef = useRef("");
  const assistantTextBufRef = useRef("");

  const flushTurnToMessages = useCallback(() => {
    const u = userTextBufRef.current.trim();
    const a = assistantTextBufRef.current.trim();
    userTextBufRef.current = "";
    assistantTextBufRef.current = "";

    const userContent = u || ORAL_PLACEHOLDER_USER;
    const assistantContent = a || ORAL_PLACEHOLDER_ASSISTANT;
    const now = Date.now();

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: userContent,
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: assistantContent,
        createdAt: now,
      },
    ]);
  }, [setMessages]);

  const cleanupResources = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = null;

    try {
      await micRef.current?.stop();
    } catch {
      /* ignore */
    }
    micRef.current = null;

    sessionRef.current?.close();
    sessionRef.current = null;

    try {
      await playerRef.current?.destroy();
    } catch {
      /* ignore */
    }
    playerRef.current = null;

    userTextBufRef.current = "";
    assistantTextBufRef.current = "";
  }, []);

  const tearDown = useCallback(
    async (opts?: { preserveError?: boolean }) => {
      await cleanupResources();
      setLiveState("idle");
      if (!opts?.preserveError) setLiveError(null);
    },
    [cleanupResources],
  );

  useEffect(() => {
    void tearDown();
  }, [sessionKey, tearDown]);

  const startLive = useCallback(async () => {
    setLiveError(null);
    setLiveState("connecting");
    await cleanupResources();

    const player = createLivePcm24Player();
    playerRef.current = player;

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const live = await connectGeminiLiveSession({
        liveModelId,
        systemInstruction: SPEAKING_SYSTEM_INSTRUCTION,
        historyMessages: messages,
        signal: abort.signal,
        callbacks: {
          onSetupComplete: () => {},
          onServerContent: (payload) => {
            if (payload.interrupted) {
              playerRef.current?.interrupt();
            }
            if (typeof payload.inputTranscriptionText === "string") {
              userTextBufRef.current += payload.inputTranscriptionText;
            }
            if (typeof payload.outputTranscriptionText === "string") {
              assistantTextBufRef.current += payload.outputTranscriptionText;
            }
            if (payload.audioInlineBase64) {
              playerRef.current?.enqueuePcm16Base64(payload.audioInlineBase64);
            }
            if (payload.turnComplete) {
              flushTurnToMessages();
            }
          },
          onError: (msg) => {
            setLiveError(msg);
            void tearDown({ preserveError: true });
          },
          onClose: () => {
            /* resources cleared by tearDown / session switch */
          },
        },
      });

      if (abort.signal.aborted) {
        live.close();
        await tearDown();
        return;
      }

      sessionRef.current = live;

      const mic = await startLiveMicCapture({
        signal: abort.signal,
        onPcm16Base64Chunk: (b64) => {
          live.sendAudioPcmBase64(b64);
        },
      });

      if (abort.signal.aborted) {
        await mic.stop();
        live.close();
        await tearDown();
        return;
      }

      micRef.current = mic;
      setLiveState("listening");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        await cleanupResources();
        setLiveState("idle");
        return;
      }
      const msg =
        e instanceof Error && e.message.trim()
          ? e.message.trim()
          : "無法開始口說連線。";
      setLiveError(msg);
      await cleanupResources();
      setLiveState("idle");
    }
  }, [cleanupResources, flushTurnToMessages, liveModelId, messages, tearDown]);

  const stopLive = useCallback(async () => {
    setLiveError(null);
    await tearDown();
  }, [tearDown]);

  return {
    liveState,
    liveError,
    isLiveActive: liveState !== "idle",
    startLive,
    stopLive,
  };
}
