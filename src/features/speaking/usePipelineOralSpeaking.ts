import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTtsPlayback } from "../../hooks/useTtsPlayback";
import { useVoiceRecorder } from "../../hooks/useVoiceRecorder";
import {
  blobToBase64,
  recognizeSpeech,
} from "../../shared/api/speechTranslateApi";
import { streamSpeakingChat } from "./speakingApi";
import { DEFAULT_SPEAKING_MODEL } from "./speakingDefaults";
import { SPEAKING_SYSTEM_INSTRUCTION } from "./speakingSystemInstruction";
import type { ChatMessage, SpeakingChatError } from "./types";

export type PipelineOralState =
  | "idle"
  | "recording"
  | "transcribing"
  | "replying"
  | "speaking"
  | "error";

export type UsePipelineOralSpeakingOptions = {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  /** When this changes, pipeline recording/playback is reset (e.g. active session id). */
  sessionKey: string;
  /** When true, recording/TTS/stream are inactive; controls are no-ops. */
  disabled: boolean;
};

const TEMPERATURE = 0.7;

function mapGeminiStreamError(e: unknown): string {
  if (e instanceof Error && "code" in e) {
    const ce = e as SpeakingChatError;
    switch (ce.code) {
      case "OLLAMA":
        return ce.message;
      case "NETWORK":
        return "瀏覽器無法連線 Gemini。請檢查 `VITE_GEMINI_API_KEY`、網路與模型權限。";
      case "TIMEOUT":
        return "串流已停止或逾時。";
      case "VALIDATION":
        return ce.message;
      default:
        return "發生未預期錯誤。";
    }
  }
  return "發生未預期錯誤。";
}

export function usePipelineOralSpeaking({
  messages,
  setMessages,
  sessionKey,
  disabled,
}: UsePipelineOralSpeakingOptions) {
  const [pipelineState, setPipelineState] = useState<PipelineOralState>("idle");
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { stopTtsPlayback, playTranslatedTts } = useTtsPlayback();

  const { startRecording, stopRecordingAndGetBlob, levels } = useVoiceRecorder(
    useCallback(() => {
      setPipelineError(null);
    }, []),
  );

  const cleanupHardware = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    try {
      await stopRecordingAndGetBlob();
    } catch {
      /* ignore */
    }
    stopTtsPlayback();
  }, [stopRecordingAndGetBlob, stopTtsPlayback]);

  const resetToIdle = useCallback(async () => {
    await cleanupHardware();
    setPipelineState("idle");
    setPipelineError(null);
  }, [cleanupHardware]);

  useEffect(() => {
    void resetToIdle();
  }, [sessionKey, resetToIdle]);

  useEffect(() => {
    if (!disabled) return;
    void resetToIdle();
  }, [disabled, resetToIdle]);

  const isPipelineBusy = useMemo(
    () =>
      pipelineState === "recording" ||
      pipelineState === "transcribing" ||
      pipelineState === "replying" ||
      pipelineState === "speaking",
    [pipelineState],
  );

  const startPipelineRecording = useCallback(async () => {
    if (disabled) return;
    setPipelineError(null);
    await cleanupHardware();
    setPipelineState("recording");
    try {
      await startRecording();
    } catch (e) {
      const msg =
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "無法使用麥克風。請允許瀏覽器權限後再試。"
          : e instanceof Error && e.message.trim()
            ? e.message.trim()
            : "無法開始錄音。";
      setPipelineError(msg);
      setPipelineState("error");
      await cleanupHardware();
    }
  }, [disabled, cleanupHardware, startRecording]);

  const stopPipelineAndSend = useCallback(async () => {
    if (disabled) return;

    const blob = await stopRecordingAndGetBlob();
    if (!blob || blob.size === 0) {
      setPipelineError("未錄到音訊，請再試一次。");
      setPipelineState("error");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setPipelineState("transcribing");

    let transcript: string;
    try {
      const b64 = await blobToBase64(blob);
      const { transcript: tr } = await recognizeSpeech(
        b64,
        blob.type,
        "en-US",
        controller.signal,
        { alternativeLanguageCodes: ["zh-TW"] },
      );
      transcript = tr.trim();
    } catch (e) {
      if (controller.signal.aborted) {
        await resetToIdle();
        return;
      }
      const msg =
        e instanceof Error && e.message.trim()
          ? e.message.trim()
          : "語音轉文字失敗。";
      setPipelineError(`STT：${msg}`);
      setPipelineState("error");
      return;
    }

    if (!transcript) {
      setPipelineError("STT：無辨識結果，請再說一次。");
      setPipelineState("error");
      return;
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: transcript,
      createdAt: Date.now(),
    };
    const assistantId = crypto.randomUUID();
    const assistantDraft: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg, assistantDraft]);
    setPipelineState("replying");

    let assistantAccum = "";
    try {
      const historyPayload = [
        { role: "system" as const, content: SPEAKING_SYSTEM_INSTRUCTION },
        ...[...messages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        })),
      ];
      await streamSpeakingChat(
        {
          model: DEFAULT_SPEAKING_MODEL,
          messages: historyPayload,
          temperature: TEMPERATURE,
        },
        {
          signal: controller.signal,
          onChunk: (delta) => {
            assistantAccum += delta;
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
      if (controller.signal.aborted) {
        await resetToIdle();
        return;
      }
      setPipelineError(`Gemini：${mapGeminiStreamError(e)}`);
      setPipelineState("error");
      return;
    }

    const toSpeak = assistantAccum.trim();
    if (!toSpeak) {
      abortRef.current = null;
      setPipelineState("idle");
      return;
    }

    setPipelineState("speaking");
    try {
      await playTranslatedTts(toSpeak, "en", controller.signal);
    } catch (e) {
      if (
        controller.signal.aborted ||
        (e instanceof DOMException && e.name === "AbortError")
      ) {
        await resetToIdle();
        return;
      }
      const msg =
        e instanceof Error && e.message.trim()
          ? e.message.trim()
          : "語音合成或播放失敗。";
      setPipelineError(`TTS：${msg}`);
      setPipelineState("error");
      return;
    }

    abortRef.current = null;
    setPipelineState("idle");
  }, [
    disabled,
    messages,
    playTranslatedTts,
    resetToIdle,
    setMessages,
    stopRecordingAndGetBlob,
  ]);

  const cancelPipelineOral = useCallback(async () => {
    await resetToIdle();
  }, [resetToIdle]);

  return {
    pipelineState,
    pipelineError,
    isPipelineBusy,
    isPipelineReplying: pipelineState === "replying",
    levels,
    startPipelineRecording,
    stopPipelineAndSend,
    cancelPipelineOral,
  };
}
