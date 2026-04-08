import type { FormEvent, KeyboardEvent } from "react";
import { useLayoutEffect, useMemo, useRef } from "react";
import { AssistantMarkdown } from "../features/speaking/AssistantMarkdown";
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
  }, [messages, isStreaming, activeId]);

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

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendAfterScrollFlag();
  };

  const onComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (isStreaming || !input.trim()) return;
    sendAfterScrollFlag();
  };

  const lastId = messages[messages.length - 1]?.id;
  const clearDisabled =
    messages.length === 0 && !isStreaming && !input.trim();
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
      <header className="glass-panel glass-panel--header speaking-page__toolbar">
        <div className="speaking-page__intro">
          <h2 className="speaking-page__title">會話練習</h2>
          <p className="speaking-page__subtitle">在前端直接串接 Gemini 進行文字對話。</p>
        </div>
        <button
          type="button"
          className="speaking-page__btn-clear"
          onClick={clearConversation}
          disabled={clearDisabled}
        >
          清空對話
        </button>
      </header>

      <div className="speaking-page__layout">
        <aside
          className="glass-panel speaking-page__sidebar"
          aria-label="對話歷史"
        >
          <div className="speaking-page__sidebar-head">
            <h3 className="speaking-page__sidebar-title">
              對話歷史
            </h3>
            {newChatDisabled ? (
              <span id="speaking-new-chat-disabled-hint" className="sr-only">
                請先在此對話送出至少一則訊息，才能建立新對話。
              </span>
            ) : null}
            <button
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
            </button>
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
                    <button
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
                    </button>
                    <button
                      type="button"
                      className="speaking-page__session-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(s.id);
                      }}
                      aria-label={`刪除對話：${label}`}
                    >
                      刪除
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </aside>

        <section
          className="glass-panel speaking-page__panel"
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
                  送出訊息即可開始。請先在 `.env` 設定 `VITE_GEMINI_API_KEY`、重啟開發伺服器，並讓上方模型欄位與可用 Gemini 模型一致（預設為 gemini-2.5-flash-lite）。
                </p>
              ) : null}
              {messages.map((m) => {
                const isUser = m.role === "user";
                const showCaret =
                  isStreaming &&
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
            <label className="speaking-page__model-label">
              <span className="speaking-page__model-label-text">
                模型
              </span>
              <output
                className="speaking-page__model-input"
                aria-live="polite"
              >
                {model}
              </output>
            </label>

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
              disabled={isStreaming}
              rows={3}
            />

            <div className="speaking-page__actions">
              {isStreaming ? (
                <span className="speaking-page__streaming" aria-live="polite">
                  回覆中…
                </span>
              ) : null}
              {isStreaming ? (
                <button
                  type="button"
                  className="quick-test__btn news-card__btn--stop"
                  onClick={cancelStream}
                >
                  停止
                </button>
              ) : null}
              <button
                type="submit"
                className="quick-test__btn"
                disabled={isStreaming || !input.trim()}
              >
                送出
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
