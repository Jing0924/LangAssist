import type { FormEvent, KeyboardEvent } from "react";
import { useLayoutEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AssistantMarkdown } from "../features/speaking/AssistantMarkdown";
import { useSpeakingChat } from "../features/speaking/useSpeakingChat";
import { useSpeakingSessionStore } from "../features/speaking/useSpeakingSessionStore";

const NEAR_BOTTOM_PX = 80;

export default function SpeakingPracticePage() {
  const { t, i18n } = useTranslation();
  const {
    sessions,
    activeId,
    messages,
    setMessages,
    model,
    setModel,
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
    setModel,
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
      new Intl.DateTimeFormat(i18n.language || undefined, {
        dateStyle: "short",
        timeStyle: "short",
      }),
    [i18n.language],
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
          <h2 className="speaking-page__title">{t("speakingPage.title")}</h2>
          <p className="speaking-page__subtitle">{t("speakingPage.subtitle")}</p>
        </div>
        <button
          type="button"
          className="speaking-page__btn-clear"
          onClick={clearConversation}
          disabled={clearDisabled}
        >
          {t("speakingPage.clear")}
        </button>
      </header>

      <div className="speaking-page__layout">
        <aside
          className="glass-panel speaking-page__sidebar"
          aria-label={t("speakingPage.chatHistory")}
        >
          <div className="speaking-page__sidebar-head">
            <h3 className="speaking-page__sidebar-title">
              {t("speakingPage.chatHistory")}
            </h3>
            {newChatDisabled ? (
              <span id="speaking-new-chat-disabled-hint" className="sr-only">
                {t("speakingPage.newChatDisabledHint")}
              </span>
            ) : null}
            <button
              type="button"
              className="speaking-page__btn-new"
              onClick={onNewChat}
              disabled={newChatDisabled}
              title={
                newChatDisabled
                  ? t("speakingPage.newChatDisabledHint")
                  : undefined
              }
              aria-describedby={
                newChatDisabled ? "speaking-new-chat-disabled-hint" : undefined
              }
            >
              {t("speakingPage.newChat")}
            </button>
          </div>
          <p className="speaking-page__sessions-hint">
            {t("speakingPage.sessionsStoredHint")}
          </p>
          <ul className="speaking-page__session-list" role="list">
            {sessions.map((s) => {
              const isActive = s.id === activeId;
              const label = s.title ?? t("speakingPage.newChat");
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
                      aria-label={t("speakingPage.deleteSessionAria", {
                        title: label,
                      })}
                    >
                      {t("speakingPage.deleteSession")}
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
            {t("speakingPage.title")}
          </h2>

          {error ? (
            <p className="speaking-page__error" role="alert">
              {error}
            </p>
          ) : null}

          <section
            className="chat-thread speaking-page__thread"
            aria-label={t("speakingPage.chatAria")}
          >
            <div
              ref={threadInnerRef}
              className="chat-thread__inner"
              onScroll={onThreadScroll}
            >
              {messages.length === 0 ? (
                <p className="speaking-page__empty">
                  {t("speakingPage.emptyThread")}
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
                            ? t("speakingPage.you")
                            : t("speakingPage.assistant")}
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
                {t("speakingPage.modelLabel")}
              </span>
              <input
                className="speaking-page__model-input"
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={isStreaming}
                autoComplete="off"
                spellCheck={false}
              />
            </label>

            <label className="sr-only" htmlFor="speaking-input">
              {t("speakingPage.inputLabel")}
            </label>
            <textarea
              id="speaking-input"
              className="speaking-page__textarea"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder={t("speakingPage.inputPlaceholder")}
              disabled={isStreaming}
              rows={3}
            />

            <div className="speaking-page__actions">
              {isStreaming ? (
                <span className="speaking-page__streaming" aria-live="polite">
                  {t("speakingPage.streaming")}
                </span>
              ) : null}
              {isStreaming ? (
                <button
                  type="button"
                  className="quick-test__btn news-card__btn--stop"
                  onClick={cancelStream}
                >
                  {t("speakingPage.stop")}
                </button>
              ) : null}
              <button
                type="submit"
                className="quick-test__btn"
                disabled={isStreaming || !input.trim()}
              >
                {t("speakingPage.send")}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
