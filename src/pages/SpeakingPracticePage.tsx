import type { FormEvent, KeyboardEvent } from "react";
import { useLayoutEffect, useMemo, useRef } from "react";
import { GlassBentoCard } from "../components/GlassBentoCard";
import { MotionPressable } from "../components/MotionPressable";
import { AssistantMarkdown } from "../features/speaking/AssistantMarkdown";
import {
  isGeminiLiveOralMode,
  isPipelineOralMode,
  ORAL_MODE_OPTIONS,
} from "../features/speaking/speakingDefaults";
import { useGeminiLiveSpeaking } from "../features/speaking/useGeminiLiveSpeaking";
import { usePipelineOralSpeaking } from "../features/speaking/usePipelineOralSpeaking";
import { useSpeakingChat } from "../features/speaking/useSpeakingChat";
import { useSpeakingSessionStore } from "../features/speaking/useSpeakingSessionStore";

const NEAR_BOTTOM_PX = 80;

export default function SpeakingPracticePage() {
  const {
    sessions,
    activeId,
    messages,
    setMessages,
    model,
    liveModel,
    setLiveModel,
    switchSession,
    createSession,
    deleteSession,
  } = useSpeakingSessionStore();

  const {
    input,
    setInput,
    isStreaming,
    error,
    sendMessage,
    cancelStream,
    clearConversation,
  } = useSpeakingChat({
    messages,
    setMessages,
    model,
    sessionKey: activeId,
  });

  const {
    liveState,
    liveError,
    isLiveActive,
    startLive,
    stopLive,
  } = useGeminiLiveSpeaking({
    messages,
    setMessages,
    liveModelId: liveModel,
    sessionKey: activeId,
    disabled: !isGeminiLiveOralMode(liveModel),
  });

  const {
    pipelineState,
    pipelineError,
    isPipelineBusy,
    isPipelineReplying,
    startPipelineRecording,
    stopPipelineAndSend,
    cancelPipelineOral,
  } = usePipelineOralSpeaking({
    messages,
    setMessages,
    sessionKey: activeId,
    disabled: !isPipelineOralMode(liveModel),
  });

  const pipelineMode = isPipelineOralMode(liveModel);

  const threadInnerRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const scrollAfterSendRef = useRef(false);
  const lastActiveIdRef = useRef(activeId);

  const onThreadScroll = () => {
    const el = threadInnerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distance <= NEAR_BOTTOM_PX;
  };

  useLayoutEffect(() => {
    const el = threadInnerRef.current;
    if (!el) return;

    const scrollToBottom = () => {
      el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
    };

    if (scrollAfterSendRef.current) {
      stickToBottomRef.current = true;
      scrollAfterSendRef.current = false;
    }

    if (lastActiveIdRef.current !== activeId) {
      lastActiveIdRef.current = activeId;
      stickToBottomRef.current = true;
    }

    if (stickToBottomRef.current) {
      scrollToBottom();
    }
  }, [messages, isStreaming, isLiveActive, isPipelineReplying, activeId]);

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat("zh-TW", {
        dateStyle: "short",
        timeStyle: "short",
      }),
    [],
  );

  const sendAfterScrollFlag = () => {
    scrollAfterSendRef.current = true;
    void sendMessage();
  };

  const oralStatusLive =
    liveState === "idle"
      ? "未連線"
      : liveState === "connecting"
        ? "連線中"
        : "聆聽中";

  const oralStatusPipeline =
    pipelineState === "idle"
      ? "待機"
      : pipelineState === "recording"
        ? "錄音中"
        : pipelineState === "transcribing"
          ? "轉錄中"
          : pipelineState === "replying"
            ? "生成回覆中"
            : pipelineState === "speaking"
              ? "朗讀中"
              : "錯誤";

  const oralStatusLabel = pipelineMode ? oralStatusPipeline : oralStatusLive;

  const oralStatusActive =
    pipelineMode &&
    (pipelineState === "recording" ||
      pipelineState === "replying" ||
      pipelineState === "speaking");

  const startLiveOral = async () => {
    cancelStream();
    await startLive();
  };

  const stopLiveOral = async () => {
    await stopLive();
  };

  const startPipelineOral = async () => {
    cancelStream();
    await startPipelineRecording();
  };

  const clearConversationAll = async () => {
    await stopLive();
    await cancelPipelineOral();
    clearConversation();
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendAfterScrollFlag();
  };

  const onComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (isStreaming || isLiveActive || isPipelineBusy || !input.trim()) return;
    sendAfterScrollFlag();
  };

  const lastId = messages[messages.length - 1]?.id;
  const clearDisabled =
    messages.length === 0 &&
    !isStreaming &&
    !isLiveActive &&
    !isPipelineBusy &&
    !input.trim();
  const newChatDisabled = messages.length === 0;

  const onNewChat = () => {
    cancelStream();
    createSession();
  };

  const onSelectSession = (id: string) => {
    if (id === activeId) return;
    cancelStream();
    switchSession(id);
  };

  const onDeleteSession = (id: string) => {
    cancelStream();
    deleteSession(id);
  };

  return (
    <div className="speaking-page">
      <GlassBentoCard className="glass-panel--header speaking-page__toolbar">
        <div className="speaking-page__intro">
          <h2 className="speaking-page__title">會話練習</h2>
          <p className="speaking-page__subtitle">
            在前端直接串接 Gemini 進行文字對話，並可選 Gemini Live 或 Flash
            Lite 錄音管道口說（後者需 Cloud STT／TTS）。
          </p>
        </div>
        <MotionPressable
          type="button"
          className="speaking-page__btn-clear"
          onClick={() => {
            void clearConversationAll();
          }}
          disabled={clearDisabled && !isLiveActive && !isPipelineBusy}
        >
          清空對話
        </MotionPressable>
      </GlassBentoCard>

      <div className="speaking-bento">
        <aside className="speaking-bento__aside" aria-label="對話歷史">
          <GlassBentoCard className="speaking-page__sidebar speaking-bento__sidebar-card">
          <div className="speaking-page__sidebar-head">
            <h3 className="speaking-page__sidebar-title">
              對話歷史
            </h3>
            {newChatDisabled ? (
              <span id="speaking-new-chat-disabled-hint" className="sr-only">
                請先在此對話送出至少一則訊息，才能建立新對話。
              </span>
            ) : null}
            <MotionPressable
              type="button"
              className="speaking-page__btn-new"
              onClick={onNewChat}
              disabled={newChatDisabled}
              title={
                newChatDisabled
                  ? "請先在此對話送出至少一則訊息，才能建立新對話。"
                  : undefined
              }
              aria-describedby={
                newChatDisabled ? "speaking-new-chat-disabled-hint" : undefined
              }
            >
              新對話
            </MotionPressable>
          </div>
          <p className="speaking-page__sessions-hint">
            對話僅存於此瀏覽器（最多 30 則）。
          </p>
          <ul className="speaking-page__session-list" role="list">
            {sessions.map((s) => {
              const isActive = s.id === activeId;
              const label = s.title ?? "新對話";
              return (
                <li key={s.id} className="speaking-page__session-li">
                  <div
                    className={`speaking-page__session-item${isActive ? " speaking-page__session-item--active" : ""}`}
                  >
                    <MotionPressable
                      type="button"
                      className="speaking-page__session-select"
                      onClick={() => onSelectSession(s.id)}
                    >
                      <span className="speaking-page__session-title">
                        {label}
                      </span>
                      <time
                        className="speaking-page__session-time"
                        dateTime={new Date(s.updatedAt).toISOString()}
                      >
                        {dateFmt.format(s.updatedAt)}
                      </time>
                    </MotionPressable>
                    <MotionPressable
                      type="button"
                      className="speaking-page__session-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(s.id);
                      }}
                      aria-label={`刪除對話：${label}`}
                    >
                      刪除
                    </MotionPressable>
                  </div>
                </li>
              );
            })}
          </ul>
          </GlassBentoCard>
        </aside>

        <GlassBentoCard
          className="speaking-page__panel"
          aria-labelledby="speaking-heading"
        >
          <h2 id="speaking-heading" className="sr-only">
            會話練習
          </h2>

          {error ? (
            <p className="speaking-page__error" role="alert">
              {error}
            </p>
          ) : null}

          <section
            className="chat-thread speaking-page__thread"
            aria-label="會話練習對話"
          >
            <div
              ref={threadInnerRef}
              className="chat-thread__inner"
              onScroll={onThreadScroll}
            >
              {messages.length === 0 ? (
                <p className="speaking-page__empty">
                  送出訊息或開啟口說練習即可開始。請先在 `.env` 設定 `VITE_GEMINI_API_KEY`、重啟開發伺服器；口說可選 Gemini
                  Live（即時音訊）或 Flash Lite
                  管道（需另設 `VITE_GOOGLE_CLOUD_API_KEY` 啟用 STT／TTS），詳見下方說明。
                </p>
              ) : null}
              {messages.map((m) => {
                const isUser = m.role === "user";
                const assistantStreaming =
                  (isStreaming && !isLiveActive) ||
                  (pipelineMode && isPipelineReplying);
                const showCaret =
                  assistantStreaming &&
                  !isUser &&
                  m.id === lastId &&
                  m.role === "assistant";
                return (
                  <div
                    key={m.id}
                    className={`bubble-row ${isUser ? "bubble-row--out" : "bubble-row--in"}`}
                  >
                    <article
                      className={`bubble ${isUser ? "bubble--out" : "bubble--in"}`}
                    >
                      <header className="bubble__meta">
                        <span className="bubble__name">
                          {isUser
                            ? "你"
                            : "助手"}
                        </span>
                      </header>
                      <div
                        className={`bubble__body ${!isUser ? "bubble__body--translation bubble__body--md" : ""}`}
                      >
                        {m.content ? (
                          isUser ? (
                            m.content
                          ) : (
                            <AssistantMarkdown content={m.content} />
                          )
                        ) : showCaret ? (
                          <span className="stream-caret" aria-hidden="true" />
                        ) : (
                          <span className="bubble__placeholder">…</span>
                        )}
                        {m.content && showCaret ? (
                          <span className="stream-caret" aria-hidden="true" />
                        ) : null}
                      </div>
                    </article>
                  </div>
                );
              })}
            </div>
          </section>

          <form className="speaking-page__composer" onSubmit={onSubmit}>
            <div className="speaking-page__models-row">
              <label className="speaking-page__model-label">
                <span className="speaking-page__model-label-text">
                  文字模型
                </span>
                <output
                  className="speaking-page__model-input"
                  aria-live="polite"
                >
                  {model}
                </output>
              </label>
              <label className="speaking-page__model-label">
                <span className="speaking-page__model-label-text">
                  口說模式
                </span>
                <select
                  className="speaking-page__model-input speaking-page__model-input--live-select"
                  value={liveModel}
                  onChange={(e) => setLiveModel(e.target.value)}
                  disabled={
                    isLiveActive ||
                    liveState === "connecting" ||
                    isPipelineBusy
                  }
                  aria-label="口說模式（Live 或語音管道）"
                >
                  {ORAL_MODE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="speaking-page__live-model-hint">
              <strong>Gemini Live</strong>
              ：瀏覽器即時麥克風／音訊，只需 `VITE_GEMINI_API_KEY`。
              <strong> Flash Lite 管道</strong>
              ：錄音後經 Google Cloud Speech-to-Text → Gemini 2.5 Flash
              Lite 串流 → Text-to-Speech 英文朗讀；需同一組
              `VITE_GOOGLE_CLOUD_API_KEY` 並在 GCP 啟用 STT 與 TTS。文字對話仍用上方文字模型；管道口說的 LLM 固定為
              flash-lite。
            </p>

            <div className="speaking-page__oral" aria-label="口說練習">
              <div className="speaking-page__oral-head">
                <span className="speaking-page__oral-title">口說練習</span>
                <span
                  className={`speaking-page__oral-status${liveState === "listening" || oralStatusActive ? " speaking-page__oral-status--live" : ""}`}
                  aria-live="polite"
                >
                  {oralStatusLabel}
                </span>
              </div>
              {pipelineMode && pipelineError ? (
                <div className="speaking-page__live-error" role="alert">
                  <p className="speaking-page__error">{pipelineError}</p>
                  <p className="speaking-page__error-hint">
                    前綴 STT／Gemini／TTS 表示故障環節；請確認
                    `VITE_GOOGLE_CLOUD_API_KEY` 權限（Speech-to-Text、Text-to-Speech）或
                    `VITE_GEMINI_API_KEY`。
                  </p>
                </div>
              ) : null}
              {!pipelineMode && liveError ? (
                <div className="speaking-page__live-error" role="alert">
                  <p className="speaking-page__error">{liveError}</p>
                  <p className="speaking-page__error-hint">
                    若訊息含 code／status，請複製全文並對照 Google AI Studio Live
                    或專案 API 權限與配額。
                  </p>
                </div>
              ) : null}
              <div className="speaking-page__oral-actions">
                {pipelineMode ? (
                  <>
                    {pipelineState === "idle" || pipelineState === "error" ? (
                      <MotionPressable
                        type="button"
                        className="quick-test__btn"
                        onClick={() => {
                          void startPipelineOral();
                        }}
                        disabled={isStreaming || isPipelineBusy}
                      >
                        開始錄音
                      </MotionPressable>
                    ) : null}
                    {pipelineState === "recording" ? (
                      <>
                        <MotionPressable
                          type="button"
                          className="quick-test__btn news-card__btn--stop"
                          onClick={() => {
                            void stopPipelineAndSend();
                          }}
                          disabled={isStreaming}
                        >
                          停止並送出
                        </MotionPressable>
                        <MotionPressable
                          type="button"
                          className="quick-test__btn"
                          onClick={() => {
                            void cancelPipelineOral();
                          }}
                          disabled={isStreaming}
                        >
                          取消錄音
                        </MotionPressable>
                      </>
                    ) : null}
                    {pipelineState === "transcribing" ||
                    pipelineState === "replying" ||
                    pipelineState === "speaking" ? (
                      <MotionPressable
                        type="button"
                        className="quick-test__btn news-card__btn--stop"
                        onClick={() => {
                          void cancelPipelineOral();
                        }}
                      >
                        取消
                      </MotionPressable>
                    ) : null}
                  </>
                ) : liveState === "idle" || liveState === "connecting" ? (
                  <MotionPressable
                    type="button"
                    className="quick-test__btn"
                    onClick={() => {
                      void startLiveOral();
                    }}
                    disabled={
                      isStreaming || liveState === "connecting"
                    }
                  >
                    {liveState === "connecting" ? "連線中…" : "開始口說"}
                  </MotionPressable>
                ) : (
                  <MotionPressable
                    type="button"
                    className="quick-test__btn news-card__btn--stop"
                    onClick={() => {
                      void stopLiveOral();
                    }}
                  >
                    停止口說
                  </MotionPressable>
                )}
              </div>
            </div>

            <label className="sr-only" htmlFor="speaking-input">
              訊息
            </label>
            <textarea
              id="speaking-input"
              className="speaking-page__textarea"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder="輸入訊息…"
              disabled={isStreaming || isLiveActive || isPipelineBusy}
              rows={3}
            />

            <div className="speaking-page__actions">
              {isStreaming && !isLiveActive ? (
                <span className="speaking-page__streaming" aria-live="polite">
                  回覆中…
                </span>
              ) : null}
              {isStreaming && !isLiveActive ? (
                <MotionPressable
                  type="button"
                  className="quick-test__btn news-card__btn--stop"
                  onClick={cancelStream}
                >
                  停止
                </MotionPressable>
              ) : null}
              {isLiveActive ? (
                <span className="speaking-page__streaming" aria-live="polite">
                  Live 口說中，請停止口說後再打字送出。
                </span>
              ) : null}
              {pipelineMode && isPipelineBusy ? (
                <span className="speaking-page__streaming" aria-live="polite">
                  語音管道處理中，請稍候或按「取消」；完成前無法打字送出。
                </span>
              ) : null}
              <MotionPressable
                type="submit"
                className="quick-test__btn"
                disabled={
                  isStreaming || isLiveActive || isPipelineBusy || !input.trim()
                }
              >
                送出
              </MotionPressable>
            </div>
          </form>
        </GlassBentoCard>
      </div>
    </div>
  );
}
