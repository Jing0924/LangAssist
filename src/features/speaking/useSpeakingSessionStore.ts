import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_SPEAKING_MODEL, normalizeStoredLiveModelId } from "./speakingDefaults";
import {
  createEmptySession,
  loadSpeakingSessions,
  MAX_SPEAKING_SESSIONS,
  saveSpeakingSessions,
  titleFromFirstUserMessage,
} from "./speakingSessionStorage";
import type { ChatMessage, SpeakingSession } from "./types";

type StoreState = {
  sessions: SpeakingSession[];
  activeId: string;
};

function initialState(): StoreState {
  const loaded = loadSpeakingSessions();
  if (loaded && loaded.sessions.length > 0) {
    return { sessions: loaded.sessions, activeId: loaded.activeId };
  }
  const s = createEmptySession(DEFAULT_SPEAKING_MODEL);
  return { sessions: [s], activeId: s.id };
}

export function useSpeakingSessionStore() {
  const [state, setState] = useState<StoreState>(initialState);

  useEffect(() => {
    saveSpeakingSessions({
      v: 1,
      sessions: state.sessions,
      activeId: state.activeId,
    });
  }, [state.sessions, state.activeId]);

  const activeSession = useMemo(
    () => state.sessions.find((s) => s.id === state.activeId) ?? null,
    [state.sessions, state.activeId],
  );

  const setMessages = useCallback<React.Dispatch<React.SetStateAction<ChatMessage[]>>>(
    (action) => {
      setState((prev) => {
        const idx = prev.sessions.findIndex((s) => s.id === prev.activeId);
        if (idx === -1) return prev;
        const s = prev.sessions[idx];
        const nextMessages =
          typeof action === "function" ? action(s.messages) : action;
        let title = s.title;
        if (nextMessages.length === 0) {
          title = null;
        } else if (title === null) {
          const derived = titleFromFirstUserMessage(nextMessages);
          if (derived) title = derived;
        }
        const updated: SpeakingSession = {
          ...s,
          messages: nextMessages,
          title,
          updatedAt: Date.now(),
        };
        const sessions = [...prev.sessions];
        sessions[idx] = updated;
        return { ...prev, sessions };
      });
    },
    [],
  );

  const setModel = useCallback((value: string) => {
    setState((prev) => {
      const idx = prev.sessions.findIndex((s) => s.id === prev.activeId);
      if (idx === -1) return prev;
      const s = prev.sessions[idx];
      const updated: SpeakingSession = {
        ...s,
        model: value,
        updatedAt: Date.now(),
      };
      const sessions = [...prev.sessions];
      sessions[idx] = updated;
      return { ...prev, sessions };
    });
  }, []);

  const setLiveModel = useCallback((value: string) => {
    const nextId = normalizeStoredLiveModelId(value);
    setState((prev) => {
      const idx = prev.sessions.findIndex((s) => s.id === prev.activeId);
      if (idx === -1) return prev;
      const s = prev.sessions[idx];
      const updated: SpeakingSession = {
        ...s,
        liveModel: nextId,
        updatedAt: Date.now(),
      };
      const sessions = [...prev.sessions];
      sessions[idx] = updated;
      return { ...prev, sessions };
    });
  }, []);

  const sortedSessions = useMemo(
    () => [...state.sessions].sort((a, b) => b.updatedAt - a.updatedAt),
    [state.sessions],
  );

  const switchSession = useCallback((id: string) => {
    setState((prev) => {
      if (!prev.sessions.some((s) => s.id === id)) return prev;
      return { ...prev, activeId: id };
    });
  }, []);

  const createSession = useCallback(() => {
    setState((prev) => {
      const current = prev.sessions.find((s) => s.id === prev.activeId);
      if (current && current.messages.length === 0) return prev;
      const model = current?.model?.trim() || DEFAULT_SPEAKING_MODEL;
      const liveModel = normalizeStoredLiveModelId(current?.liveModel);
      const next = createEmptySession(model, liveModel);
      let combined = [next, ...prev.sessions];
      if (combined.length > MAX_SPEAKING_SESSIONS) {
        combined = combined
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, MAX_SPEAKING_SESSIONS);
      }
      return { sessions: combined, activeId: next.id };
    });
  }, []);

  const deleteSession = useCallback((id: string) => {
    setState((prev) => {
      const rest = prev.sessions.filter((s) => s.id !== id);
      if (rest.length === 0) {
        const fresh = createEmptySession(DEFAULT_SPEAKING_MODEL);
        return { sessions: [fresh], activeId: fresh.id };
      }
      if (prev.activeId !== id) {
        return { ...prev, sessions: rest };
      }
      const nextActive = [...rest].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      return { sessions: rest, activeId: nextActive.id };
    });
  }, []);

  return {
    sessions: sortedSessions,
    activeId: state.activeId,
    messages: activeSession?.messages ?? [],
    setMessages,
    model: activeSession?.model ?? DEFAULT_SPEAKING_MODEL,
    setModel,
    liveModel: normalizeStoredLiveModelId(activeSession?.liveModel),
    setLiveModel,
    switchSession,
    createSession,
    deleteSession,
  };
}
