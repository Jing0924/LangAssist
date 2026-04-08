import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { streamSpeakingChat } from "./speakingApi";
import { SPEAKING_SYSTEM_INSTRUCTION } from "./speakingSystemInstruction";
import type { ChatMessage, SpeakingChatError } from "./types";

export type UseSpeakingChatOptions = {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  model: string;
  /** When this changes (e.g. active session id), streaming stops and the composer resets. */
  sessionKey: string;
};

const DEFAULT_TEMPERATURE = 0.7;

export function useSpeakingChat({
  messages,
  setMessages,
  model,
  sessionKey,
}: UseSpeakingChatOptions) {
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const userCancelledRef = useRef(false);

  const cancelStream = useCallback(() => {
    userCancelledRef.current = true;
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  useEffect(() => {
    cancelStream();
    setInput("");
    setError(null);
  }, [sessionKey, cancelStream]);

  const clearConversation = useCallback(() => {
    cancelStream();
    setMessages([]);
    setInput("");
    setError(null);
  }, [cancelStream, setMessages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    userCancelledRef.current = false;
    setError(null);
    setInput("");

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      createdAt: Date.now(),
    };

    const assistantId = crypto.randomUUID();
    const assistantDraft: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
    };

    const historyPayload = [
      {
        role: "system" as const,
        content: SPEAKING_SYSTEM_INSTRUCTION,
      },
      ...[...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    setMessages((prev) => [...prev, userMsg, assistantDraft]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamSpeakingChat(
        {
          model: model.trim(),
          messages: historyPayload,
          temperature: DEFAULT_TEMPERATURE,
        },
        {
          signal: controller.signal,
          onChunk: (delta) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + delta }
                  : m,
              ),
            );
          },
        },
      );
    } catch (e) {
      if (userCancelledRef.current) {
        userCancelledRef.current = false;
      } else if (e instanceof Error && "code" in e) {
        const ce = e as SpeakingChatError;
        switch (ce.code) {
          case "OLLAMA":
            setError(ce.message);
            break;
          case "NETWORK":
            setError("瀏覽器無法連線 Gemini。請檢查 `VITE_GEMINI_API_KEY`、網路與模型權限。");
            break;
          case "TIMEOUT":
            setError("串流已停止或逾時。");
            break;
          case "VALIDATION":
            setError(ce.message);
            break;
          default:
            setError("發生未預期錯誤。");
        }
      } else {
        setError("發生未預期錯誤。");
      }
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  }, [input, isStreaming, messages, model, setMessages]);

  return {
    messages,
    input,
    setInput,
    isStreaming,
    error,
    sendMessage,
    cancelStream,
    clearConversation,
  };
}
