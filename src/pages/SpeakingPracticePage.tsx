import type { FormEvent, KeyboardEvent } from "react";
import { History, Settings2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GlassBentoCard } from "../components/GlassBentoCard";
import { MotionPressable } from "../components/MotionPressable";
import {
  SPEAKING_GUIDE_ORAL_SECTION_ID,
  SPEAKING_GUIDE_PANEL_ID,
  SpeakingGuidePanel,
} from "../components/SpeakingGuidePanel";
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
import type { SpeakingSession } from "../features/speaking/types";
import { useMediaQuery } from "../hooks/useMediaQuery";

const NEAR_BOTTOM_PX = 80;
const SPEAKING_GUIDE_STORAGE_KEY = "langassist-speaking-guide-open";
const SPEAKING_HISTORY_PANEL_ID = "speaking-history-panel";

type SpeakingHistoryCardProps = {
  sessions: SpeakingSession[];
  activeId: string;
  newChatDisabled: boolean;
  dateFmt: Intl.DateTimeFormat;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  /** Called after mobile drawer should close (select / new chat) */
  onNavigateMobile?: () => void;
};

function SpeakingHistoryCard({
  sessions,
  activeId,
  newChatDisabled,
  dateFmt,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onNavigateMobile,
}: SpeakingHistoryCardProps) {
  const wrapMobile = (fn: () => void) => {
    fn();
    onNavigateMobile?.();
  };

  return (
    <GlassBentoCard className="speaking-page__sidebar speaking-bento__sidebar-card">
      <div className="speaking-page__sidebar-head">
        <h3 className="speaking-page__sidebar-title">對話歷史</h3>
        {newChatDisabled ? (
          <span id="speaking-new-chat-disabled-hint" className="sr-only">
            請先在此對話送出至少一則訊息，才能建立新對話。
          </span>
        ) : null}
        <MotionPressable
          type="button"
          className="speaking-page__btn-new"
          onClick={() => wrapMobile(onNewChat)}
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
      <p className="speaking-page__sessions-hint">僅在此裝置</p>
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
                  onClick={() => wrapMobile(() => onSelectSession(s.id))}
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
                    wrapMobile(() => onDeleteSession(s.id));
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
  );
}

export default function SpeakingPracticePage() {
  const [guideExpanded, setGuideExpanded] = useState(() => {
    try {
      return globalThis.localStorage?.getItem(SPEAKING_GUIDE_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(
        SPEAKING_GUIDE_STORAGE_KEY,
        guideExpanded ? "1" : "0",
      );
    } catch {
      /* ignore quota / private mode */
    }
  }, [guideExpanded]);

  const oralGuideScrollPendingRef = useRef(false);

  const openGuide = () => {
    setGuideExpanded(true);
  };

  const toggleGuide = () => {
    setGuideExpanded((v) => !v);
  };

  const openGuideToOralSection = () => {
    if (guideExpanded) {
      globalThis.document
        .getElementById(SPEAKING_GUIDE_ORAL_SECTION_ID)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    oralGuideScrollPendingRef.current = true;
    setGuideExpanded(true);
  };

  useLayoutEffect(() => {
    if (!guideExpanded || !oralGuideScrollPendingRef.current) return;
    oralGuideScrollPendingRef.current = false;
    globalThis.document
      .getElementById(SPEAKING_GUIDE_ORAL_SECTION_ID)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [guideExpanded]);

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

  const isDesktop = useMediaQuery("(min-width: 801px)");
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyTriggerRef = useRef<HTMLButtonElement | null>(null);
  const drawerPanelRef = useRef<HTMLDivElement | null>(null);

  const closeHistory = useCallback(() => {
    setHistoryOpen(false);
    requestAnimationFrame(() => historyTriggerRef.current?.focus());
  }, []);

  const historyDrawerOpen = historyOpen && !isDesktop;

  useEffect(() => {
    if (!historyDrawerOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") closeHistory();
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [historyDrawerOpen, closeHistory]);

  useEffect(() => {
    if (!historyDrawerOpen) return;
    const id = requestAnimationFrame(() => {
      const root = drawerPanelRef.current;
      if (!root) return;
      const el = root.querySelector<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      );
      el?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [historyDrawerOpen]);

  return (
    <div className="speaking-page">
      <GlassBentoCard className="glass-panel--header speaking-page__toolbar">
        <div className="speaking-page__intro">
          <h2 className="speaking-page__title">會話練習</h2>
          <p className="speaking-page__subtitle">
            用文字與助手對話練習，必要時搭配麥克風即時或錄音回覆，在同一畫面完成輸入與口說。
          </p>
        </div>
        <div className="speaking-page__toolbar-actions">
          {!isDesktop ? (
            <MotionPressable
              ref={historyTriggerRef}
              type="button"
              className="speaking-page__btn-history"
              onClick={() => setHistoryOpen((v) => !v)}
              aria-expanded={historyDrawerOpen}
              aria-controls={SPEAKING_HISTORY_PANEL_ID}
              aria-label="對話歷史"
              title="對話歷史"
            >
              <History size={18} aria-hidden className="speaking-page__btn-history-icon" />
              <span className="speaking-page__btn-history-label">歷史</span>
            </MotionPressable>
          ) : null}
          <MotionPressable
            type="button"
            className="speaking-page__btn-guide"
            onClick={toggleGuide}
            aria-expanded={guideExpanded}
            aria-controls={SPEAKING_GUIDE_PANEL_ID}
            title={guideExpanded ? "收合說明" : "設定與說明"}
          >
            <Settings2
              size={18}
              aria-hidden
              className="speaking-page__btn-guide-icon"
            />
            <span className="speaking-page__btn-guide-label speaking-page__btn-guide-label--full">
              {guideExpanded ? "收合說明" : "設定與說明"}
            </span>
            <span className="speaking-page__btn-guide-label speaking-page__btn-guide-label--short">
              {guideExpanded ? "收合" : "說明"}
            </span>
          </MotionPressable>
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
        </div>
      </GlassBentoCard>

      {guideExpanded ? (
        <GlassBentoCard className="speaking-page__guide-wrap">
          <SpeakingGuidePanel id={SPEAKING_GUIDE_PANEL_ID} />
        </GlassBentoCard>
      ) : null}

      <div className="speaking-bento">
        {isDesktop ? (
          <aside className="speaking-bento__aside" aria-label="對話歷史">
            <SpeakingHistoryCard
              sessions={sessions}
              activeId={activeId}
              newChatDisabled={newChatDisabled}
              dateFmt={dateFmt}
              onNewChat={onNewChat}
              onSelectSession={onSelectSession}
              onDeleteSession={onDeleteSession}
            />
          </aside>
        ) : null}

        {!isDesktop ? (
          <>
            {historyDrawerOpen ? (
              <button
                type="button"
                className="speaking-drawer__backdrop"
                aria-label="關閉對話歷史"
                onClick={closeHistory}
              />
            ) : null}
            <div
              ref={drawerPanelRef}
              id={SPEAKING_HISTORY_PANEL_ID}
              className={`speaking-drawer${historyDrawerOpen ? " speaking-drawer--open" : ""}`}
              role="dialog"
              aria-modal="true"
              aria-hidden={!historyDrawerOpen}
              aria-label="對話歷史"
              inert={historyDrawerOpen ? undefined : true}
            >
              <SpeakingHistoryCard
                sessions={sessions}
                activeId={activeId}
                newChatDisabled={newChatDisabled}
                dateFmt={dateFmt}
                onNewChat={onNewChat}
                onSelectSession={onSelectSession}
                onDeleteSession={onDeleteSession}
                onNavigateMobile={closeHistory}
              />
            </div>
          </>
        ) : null}

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
                <div className="speaking-page__empty speaking-page__empty--cta">
                  <p className="speaking-page__empty-text">
                    輸入訊息或開始口說練習即可開場。
                  </p>
                  <MotionPressable
                    type="button"
                    className="speaking-guide__trigger-link"
                    onClick={openGuide}
                    aria-expanded={guideExpanded}
                    aria-controls={SPEAKING_GUIDE_PANEL_ID}
                  >
                    設定與說明
                  </MotionPressable>
                </div>
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
              <div className="speaking-page__oral-mode-field">
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
                <MotionPressable
                  type="button"
                  className="speaking-page__oral-mode-help"
                  onClick={openGuideToOralSection}
                  aria-expanded={guideExpanded}
                  aria-controls={SPEAKING_GUIDE_PANEL_ID}
                  aria-label="口說模式說明，開啟設定與說明並捲動至口說模式小節"
                >
                  說明
                </MotionPressable>
              </div>
            </div>

            <div className="speaking-page__thumb-zone">
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
            </div>
          </form>
        </GlassBentoCard>
      </div>
    </div>
  );
}
