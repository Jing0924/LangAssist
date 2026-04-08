import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { streamSpeakingChat } from "./speakingApi";
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
        content:
          "你是口說／會話練習的語伴與助教。請以英文與學習者進行自然、簡短的對話。若表達有誤，先正常接話，再附上一兩點簡短、溫和的改正（必要時）。適時追問以延續話題。請專注於語言練習；若與學習無關、有安全疑慮或超出助教範圍的請求，請婉拒。\n\n當學習者明確要程式或技術範例時，所有程式碼請放在 Markdown 圍欄程式區塊內，開頭一行須標註語言（例如 tsx、ts、bash）。範例盡量短；必要時拆成多個區塊。其餘說明用簡短條列，避免過多層級標題。若對方沒有要程式，以口說練習為主，避免大段程式。",
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
