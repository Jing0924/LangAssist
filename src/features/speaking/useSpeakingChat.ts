import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { streamSpeakingChat } from "./speakingApi";
import type { ChatMessage, SpeakingChatError } from "./types";

export type UseSpeakingChatOptions = {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  model: string;
  setModel: (value: string) => void;
  /** When this changes (e.g. active session id), streaming stops and the composer resets. */
  sessionKey: string;
};

const DEFAULT_TEMPERATURE = 0.7;

export function useSpeakingChat({
  messages,
  setMessages,
  model,
  setModel,
  sessionKey,
}: UseSpeakingChatOptions) {
  const { t } = useTranslation();
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
  }, [cancelStream]);

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
      { role: "system" as const, content: t("speakingPage.systemPrompt") },
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
            setError(
              t("speakingPage.errorUpstream", { message: ce.message }),
            );
            break;
          case "NETWORK":
            setError(t("speakingPage.errorNetwork"));
            break;
          case "TIMEOUT":
            setError(t("speakingPage.errorTimeout"));
            break;
          case "VALIDATION":
            setError(ce.message);
            break;
          default:
            setError(t("speakingPage.errorUnknown"));
        }
      } else {
        setError(t("speakingPage.errorUnknown"));
      }
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  }, [input, isStreaming, messages, model, t]);

  return {
    messages,
    input,
    setInput,
    model,
    setModel,
    isStreaming,
    error,
    sendMessage,
    cancelStream,
    clearConversation,
  };
}
