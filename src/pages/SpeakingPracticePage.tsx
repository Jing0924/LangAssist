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
  SPEAKING_GUIDE_PANEL_ID,
  SpeakingGuidePanel,
} from "../components/SpeakingGuidePanel";
import { AssistantMarkdown } from "../features/speaking/AssistantMarkdown";
import {
  isGeminiLiveOralMode,
  isPipelineOralMode,
  ORAL_MODE_OPTIONS,
  SPEAKING_TEXT_MODEL_OPTIONS,
} from "../features/speaking/speakingDefaults";
import { useGeminiLiveSpeaking } from "../features/speaking/useGeminiLiveSpeaking";
import { usePipelineOralSpeaking } from "../features/speaking/usePipelineOralSpeaking";
import { useSpeakingChat } from "../features/speaking/useSpeakingChat";
import { useSpeakingSessionStore } from "../features/speaking/useSpeakingSessionStore";
import type { SpeakingSession } from "../features/speaking/types";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { cn } from "../lib/cn";
import {
  assistantMarkdownProse,
  nativeGlassSelect,
  quickTestBtn,
  speakingLiveSelect,
} from "../lib/uiClasses";

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
  variant: "rail" | "drawer";
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
  variant,
}: SpeakingHistoryCardProps) {
  const wrapMobile = (fn: () => void) => {
    fn();
    onNavigateMobile?.();
  };

  return (
    <GlassBentoCard
      className={cn(
        "flex min-h-0 flex-col gap-[0.65rem] p-[clamp(0.85rem,2vw,1.1rem)]",
        variant === "rail" && "h-full w-full max-w-full flex-1 basis-[260px]",
        variant === "drawer" &&
          "min-h-0 flex-1 overflow-y-auto overscroll-contain shadow-[8px_0_40px_oklch(0.08_0.04_280/0.35),inset_0_1px_0_var(--glass-highlight)]",
      )}
    >
      <div className="flex flex-col gap-2">
        <h3 className="m-0 text-[0.8125rem] font-semibold uppercase tracking-[0.04em] text-muted">
          對話歷史
        </h3>
        {newChatDisabled ? (
          <span id="speaking-new-chat-disabled-hint" className="sr-only">
            請先在此對話送出至少一則訊息，才能建立新對話。
          </span>
        ) : null}
        <MotionPressable
          type="button"
          className="cursor-pointer rounded-[10px] border border-white/[0.18] bg-sky-400/20 px-3 py-[0.45rem] text-center font-sans text-[0.8125rem] font-semibold text-foreground transition-[background,border-color] hover:border-white/25 hover:bg-sky-400/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
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
      <p className="m-0 text-[0.7rem] leading-snug text-muted">僅在此裝置</p>
      <ul
        className="m-0 flex min-h-0 flex-1 list-none flex-col gap-[0.4rem] overflow-y-auto p-0"
        role="list"
      >
        {sessions.map((s) => {
          const isActive = s.id === activeId;
          const label = s.title ?? "新對話";
          return (
            <li key={s.id} className="m-0">
              <div
                className={cn(
                  "flex items-stretch gap-[0.35rem] rounded-[10px] border border-transparent bg-white/[0.04] transition-[border-color,background]",
                  isActive && "border-sky-400/45 bg-sky-400/15",
                )}
              >
                <MotionPressable
                  type="button"
                  className="flex min-h-[44px] min-w-0 flex-1 cursor-pointer flex-col items-start justify-center gap-0.5 rounded-[10px] border-0 bg-transparent px-[0.85rem] py-3 text-left font-inherit text-inherit transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                  onClick={() => wrapMobile(() => onSelectSession(s.id))}
                >
                  <span
                    className={cn(
                      "line-clamp-2 text-[0.8125rem] font-semibold leading-snug text-secondary",
                      isActive && "text-foreground",
                    )}
                  >
                    {label}
                  </span>
                  <time
                    className="text-[0.68rem] font-medium text-muted"
                    dateTime={new Date(s.updatedAt).toISOString()}
                  >
                    {dateFmt.format(s.updatedAt)}
                  </time>
                </MotionPressable>
                <MotionPressable
                  type="button"
                  className="min-w-[2.75rem] shrink-0 cursor-pointer self-stretch rounded-lg border-0 bg-red-400/15 px-2 font-sans text-[0.65rem] font-semibold tracking-[0.03em] text-danger transition-colors hover:bg-red-400/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
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
      return (
        globalThis.localStorage?.getItem(SPEAKING_GUIDE_STORAGE_KEY) === "1"
      );
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

  const openGuide = () => {
    setGuideExpanded(true);
  };

  const toggleGuide = () => {
    setGuideExpanded((v) => !v);
  };

  const {
    sessions,
    activeId,
    messages,
    setMessages,
    model,
    setModel,
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

  const { liveState, liveError, isLiveActive, startLive, stopLive } =
    useGeminiLiveSpeaking({
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
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <GlassBentoCard className="flex flex-wrap items-start justify-between gap-4 rounded-[18px] px-5 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-[0.35rem]">
          <h2 className="m-0 text-[1.1rem] font-semibold tracking-tight text-foreground">
            會話練習
          </h2>
          <p className="m-0 max-w-[56ch] text-[0.8125rem] leading-snug text-muted max-[800px]:hidden">
            用文字與助手對話練習，必要時搭配麥克風即時或錄音回覆，在同一畫面完成輸入與口說。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-start justify-end gap-x-2 gap-y-2">
          {!isDesktop ? (
            <MotionPressable
              ref={historyTriggerRef}
              type="button"
              className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-[0.35rem] rounded-[10px] border border-white/[0.16] bg-white/[0.07] px-[0.85rem] py-[0.45rem] font-sans text-[0.8125rem] font-semibold text-foreground transition-[background,border-color] hover:border-white/25 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              onClick={() => setHistoryOpen((v) => !v)}
              aria-expanded={historyDrawerOpen}
              aria-controls={SPEAKING_HISTORY_PANEL_ID}
              aria-label="對話歷史"
              title="對話歷史"
            >
              <History size={18} aria-hidden className="shrink-0 opacity-90" />
              <span>歷史</span>
            </MotionPressable>
          ) : null}
          <MotionPressable
            type="button"
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 self-start rounded-[10px] border border-sky-400/35 bg-transparent px-[0.95rem] py-[0.45rem] font-sans text-[0.8125rem] font-semibold text-accent transition-[background,border-color] hover:border-sky-400/55 hover:bg-sky-400/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-[800px]:gap-1"
            onClick={toggleGuide}
            aria-expanded={guideExpanded}
            aria-controls={SPEAKING_GUIDE_PANEL_ID}
            title={guideExpanded ? "收合說明" : "設定與說明"}
          >
            <Settings2
              size={18}
              aria-hidden
              className="hidden shrink-0 max-[800px]:inline-flex"
            />
            <span className="max-[800px]:sr-only">
              {guideExpanded ? "收合說明" : "設定與說明"}
            </span>
            <span className="hidden max-[800px]:inline">
              {guideExpanded ? "收合" : "說明"}
            </span>
          </MotionPressable>
          <MotionPressable
            type="button"
            className="shrink-0 cursor-pointer self-start rounded-[10px] border border-white/[0.16] bg-white/[0.06] px-[0.95rem] py-[0.45rem] font-sans text-[0.8125rem] font-semibold text-secondary transition-[background,border-color,color] hover:border-white/25 hover:bg-white/[0.09] hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
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
        <GlassBentoCard className="max-h-[min(62vh,520px)] self-stretch overflow-y-auto rounded-[18px] px-[clamp(1rem,2.2vw,1.35rem)] py-[clamp(0.9rem,2vw,1.15rem)]">
          <SpeakingGuidePanel id={SPEAKING_GUIDE_PANEL_ID} />
        </GlassBentoCard>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 content-stretch min-[801px]:grid-cols-[minmax(240px,280px)_minmax(0,1fr)] min-[801px]:items-stretch">
        {isDesktop ? (
          <aside
            className="flex min-h-0 min-w-0 flex-col min-[801px]:contents"
            aria-label="對話歷史"
          >
            <SpeakingHistoryCard
              sessions={sessions}
              activeId={activeId}
              newChatDisabled={newChatDisabled}
              dateFmt={dateFmt}
              onNewChat={onNewChat}
              onSelectSession={onSelectSession}
              onDeleteSession={onDeleteSession}
              variant="rail"
            />
          </aside>
        ) : null}

        {!isDesktop ? (
          <>
            {historyDrawerOpen ? (
              <button
                type="button"
                className="fixed inset-0 z-[120] cursor-pointer border-0 bg-[oklch(0.08_0.04_280/0.55)] p-0 backdrop-blur-sm"
                aria-label="關閉對話歷史"
                onClick={closeHistory}
              />
            ) : null}
            <div
              ref={drawerPanelRef}
              id={SPEAKING_HISTORY_PANEL_ID}
              className={cn(
                "pointer-events-none fixed top-0 bottom-0 left-0 z-[125] flex min-h-0 w-[min(90vw,320px)] -translate-x-[102%] flex-col px-[0.85rem] py-[0.65rem] pb-[calc(0.65rem+env(safe-area-inset-bottom,0px))] pl-[0.85rem] pr-[0.65rem] transition-[transform,visibility] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] invisible",
                historyDrawerOpen &&
                  "pointer-events-auto translate-x-0 visible",
              )}
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
                variant="drawer"
              />
            </div>
          </>
        ) : null}

        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-4"
          aria-labelledby="speaking-heading"
        >
          <h2 id="speaking-heading" className="sr-only">
            會話練習
          </h2>

          <GlassBentoCard className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 p-[clamp(1rem,2.5vw,1.25rem)]">
            {error ? (
              <p
                className="m-0 text-[0.9rem] leading-normal text-danger"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <section
              className="flex min-h-[220px] max-h-[min(52vh,480px)] flex-1 flex-col overflow-hidden p-0"
              aria-label="會話練習對話"
            >
              <div
                ref={threadInnerRef}
                className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-[1.1rem] pt-4"
                onScroll={onThreadScroll}
              >
                {messages.length === 0 ? (
                  <div className="m-0 flex flex-col items-start gap-[0.65rem] text-[0.875rem] leading-normal text-muted">
                    <p className="m-0">輸入訊息或開始口說練習即可開場。</p>
                    <MotionPressable
                      type="button"
                      className="cursor-pointer self-start border-0 bg-transparent p-0 font-inherit text-[0.8125rem] font-semibold text-accent underline decoration-accent underline-offset-[0.15em] hover:text-foreground focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
                      className={cn(
                        "flex w-full",
                        isUser ? "justify-end" : "justify-start",
                      )}
                    >
                      <article
                        className={cn(
                          "relative max-w-[min(92%,560px)] rounded-[20px] px-[0.85rem] pb-3 pt-[0.65rem] shadow-[0_6px_28px_rgba(0,0,0,0.22)] max-[540px]:max-w-full",
                          isUser
                            ? "ml-8 rounded-br-md border border-[oklch(0.82_0.14_200/0.35)] bg-[linear-gradient(155deg,oklch(0.82_0.14_200/0.2)_0%,oklch(0.22_0.06_270/0.55)_100%)] max-[540px]:ml-2"
                            : "mr-8 rounded-bl-md border border-white/12 bg-[linear-gradient(155deg,oklch(0.92_0.02_260/0.12)_0%,oklch(0.2_0.05_270/0.68)_100%)] max-[540px]:mr-2",
                        )}
                      >
                        <header className="mb-[0.35rem] flex items-baseline justify-between gap-2">
                          <span
                            className={cn(
                              "text-[0.72rem] font-bold uppercase tracking-[0.06em] text-muted",
                              isUser && "text-cyan-400/85",
                            )}
                          >
                            {isUser ? "你" : "助手"}
                          </span>
                        </header>
                        <div
                          className={cn(
                            "break-words text-[1.02rem] leading-relaxed",
                            isUser
                              ? "text-foreground"
                              : `text-secondary ${assistantMarkdownProse}`,
                          )}
                        >
                          {m.content ? (
                            isUser ? (
                              m.content
                            ) : (
                              <AssistantMarkdown content={m.content} />
                            )
                          ) : showCaret ? (
                            <span
                              className="inline-block h-[1em] w-0.5 animate-caret-blink rounded-sm bg-current align-[-0.12em] opacity-55"
                              aria-hidden="true"
                            />
                          ) : (
                            <span className="text-[0.9375rem] text-muted">
                              …
                            </span>
                          )}
                          {m.content && showCaret ? (
                            <span
                              className="inline-block h-[1em] w-0.5 animate-caret-blink rounded-sm bg-current align-[-0.12em] opacity-55"
                              aria-hidden="true"
                            />
                          ) : null}
                        </div>
                      </article>
                    </div>
                  );
                })}
              </div>
            </section>
          </GlassBentoCard>

          <GlassBentoCard className="flex min-h-0 min-w-0 shrink-0 flex-col p-[clamp(1rem,2.5vw,1.25rem)]">
            <form className="flex shrink-0 flex-col gap-3" onSubmit={onSubmit}>
              <div className="flex flex-col gap-3 max-[800px]:sticky max-[800px]:bottom-0 max-[800px]:z-20 max-[800px]:-mx-[clamp(1rem,2.5vw,1.25rem)] max-[800px]:mt-auto max-[800px]:mb-[calc(-1*clamp(1rem,2.5vw,1.25rem))] max-[800px]:rounded-t-[18px] max-[800px]:border max-[800px]:border-white/10 max-[800px]:bg-[oklch(0.17_0.055_275/0.82)] max-[800px]:px-[clamp(1rem,2.5vw,1.25rem)] max-[800px]:py-[0.85rem] max-[800px]:pb-[calc(1rem+env(safe-area-inset-bottom,0px))] max-[800px]:shadow-[0_-12px_40px_oklch(0.08_0.04_280/0.4),inset_0_1px_0_var(--glass-highlight)] max-[800px]:backdrop-blur-[22px]">
                <div
                  className="flex flex-col gap-2 rounded-xl border border-white/10 bg-[rgb(15_23_42/0.28)] px-[0.85rem] py-3"
                  aria-label="口說練習"
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <span className="text-[0.8125rem] font-[650] uppercase tracking-[0.04em] text-muted">
                      口說練習
                    </span>
                    <span
                      className={cn(
                        "text-[0.8125rem] font-semibold text-secondary",
                        (liveState === "listening" || oralStatusActive) &&
                          "text-accent",
                      )}
                      aria-live="polite"
                    >
                      {oralStatusLabel}
                    </span>
                  </div>
                  {pipelineMode && pipelineError ? (
                    <div role="alert">
                      <p className="m-0 mb-2 text-[0.9rem] leading-normal text-danger">
                        {pipelineError}
                      </p>
                      <p className="m-0 text-xs leading-snug text-muted">
                        前綴 STT／Gemini／TTS 表示故障環節；請確認
                        `VITE_GOOGLE_CLOUD_API_KEY`
                        權限（Speech-to-Text、Text-to-Speech）或
                        `VITE_GEMINI_API_KEY`。
                      </p>
                    </div>
                  ) : null}
                  {!pipelineMode && liveError ? (
                    <div role="alert">
                      <p className="m-0 mb-2 text-[0.9rem] leading-normal text-danger">
                        {liveError}
                      </p>
                      <p className="m-0 text-xs leading-snug text-muted">
                        若訊息含 code／status，請複製全文並對照 Google AI Studio
                        Live 或專案 API 權限與配額。
                      </p>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-[0.65rem]">
                    {pipelineMode ? (
                      <>
                        {pipelineState === "idle" ||
                        pipelineState === "error" ? (
                          <MotionPressable
                            type="button"
                            className={quickTestBtn}
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
                              className={quickTestBtn}
                              onClick={() => {
                                void stopPipelineAndSend();
                              }}
                              disabled={isStreaming}
                            >
                              停止並送出
                            </MotionPressable>
                            <MotionPressable
                              type="button"
                              className={quickTestBtn}
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
                            className={quickTestBtn}
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
                        className={quickTestBtn}
                        onClick={() => {
                          void startLiveOral();
                        }}
                        disabled={isStreaming || liveState === "connecting"}
                      >
                        {liveState === "connecting" ? "連線中…" : "開始口說"}
                      </MotionPressable>
                    ) : (
                      <MotionPressable
                        type="button"
                        className={quickTestBtn}
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
                  className="min-h-[88px] w-full resize-y rounded-xl border border-white/12 bg-[rgb(15_23_42/0.35)] px-[0.85rem] py-[0.65rem] font-inherit text-[0.9375rem] leading-normal text-foreground placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-55"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onComposerKeyDown}
                  placeholder="輸入訊息…"
                  disabled={isStreaming || isLiveActive || isPipelineBusy}
                  rows={3}
                />

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {isStreaming && !isLiveActive ? (
                    <span
                      className="text-[0.8125rem] font-medium text-accent"
                      aria-live="polite"
                    >
                      回覆中…
                    </span>
                  ) : null}
                  {isStreaming && !isLiveActive ? (
                    <MotionPressable
                      type="button"
                      className={quickTestBtn}
                      onClick={cancelStream}
                    >
                      停止
                    </MotionPressable>
                  ) : null}
                  {isLiveActive ? (
                    <span
                      className="text-[0.8125rem] font-medium text-accent"
                      aria-live="polite"
                    >
                      Live 口說中，請停止口說後再打字送出。
                    </span>
                  ) : null}
                  {pipelineMode && isPipelineBusy ? (
                    <span
                      className="text-[0.8125rem] font-medium text-accent"
                      aria-live="polite"
                    >
                      語音管道處理中，請稍候或按「取消」；完成前無法打字送出。
                    </span>
                  ) : null}
                  <MotionPressable
                    type="submit"
                    className={quickTestBtn}
                    disabled={
                      isStreaming ||
                      isLiveActive ||
                      isPipelineBusy ||
                      !input.trim()
                    }
                  >
                    送出
                  </MotionPressable>
                </div>
              </div>
            </form>
          </GlassBentoCard>

          <GlassBentoCard className="flex min-h-0 min-w-0 shrink-0 flex-col p-[clamp(1rem,2.5vw,1.25rem)]">
            <div className="flex flex-col gap-4">
              <div className="flex w-full max-w-md min-w-0 flex-col gap-[0.35rem]">
                <label
                  htmlFor="speaking-text-model-select"
                  className="text-xs font-semibold uppercase tracking-[0.04em] text-muted"
                >
                  文字模型
                </label>
                <select
                  id="speaking-text-model-select"
                  className={cn(
                    nativeGlassSelect,
                    speakingLiveSelect,
                    "inline-flex min-h-9 min-w-0 flex-1 max-w-none items-center",
                  )}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  disabled={isStreaming}
                  aria-label="文字對話模型"
                >
                  {SPEAKING_TEXT_MODEL_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex w-full max-w-md min-w-0 flex-col gap-[0.35rem]">
                <label
                  htmlFor="speaking-oral-mode-select"
                  className="text-xs font-semibold uppercase tracking-[0.04em] text-muted"
                >
                  口說模型
                </label>
                <select
                  id="speaking-oral-mode-select"
                  className={cn(
                    nativeGlassSelect,
                    speakingLiveSelect,
                    "inline-flex min-h-9 min-w-0 flex-1 max-w-none items-center",
                  )}
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
              </div>
            </div>
          </GlassBentoCard>
        </div>
      </div>
    </div>
  );
}
