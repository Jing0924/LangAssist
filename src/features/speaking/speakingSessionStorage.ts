import {
  DEFAULT_ORAL_MODE_ID,
  normalizeStoredLiveModelId,
} from "./speakingDefaults";
import type { ChatMessage, SpeakingSession } from "./types";

export const SPEAKING_SESSIONS_STORAGE_KEY = "langassist:speaking-sessions:v1";

export const MAX_SPEAKING_SESSIONS = 30;
/** Rough guard so a single site data entry does not blow the typical ~5MB quota. */
export const MAX_STORED_JSON_CHARS = 4_500_000;

export type SpeakingSessionsStoredV1 = {
  v: 1;
  activeId: string;
  sessions: SpeakingSession[];
};

function truncateTitle(text: string, maxChars: number): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars).trimEnd() + "…";
}

export function titleFromFirstUserMessage(messages: ChatMessage[]): string | null {
  const first = messages.find((m) => m.role === "user");
  if (!first?.content.trim()) return null;
  return truncateTitle(first.content, 36);
}

export function createEmptySession(
  model: string,
  liveModel: string = DEFAULT_ORAL_MODE_ID,
): SpeakingSession {
  return {
    id: crypto.randomUUID(),
    title: null,
    model,
    liveModel,
    messages: [],
    updatedAt: Date.now(),
  };
}

function sortSessionsNewestFirst(sessions: SpeakingSession[]): SpeakingSession[] {
  return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
}

function clampSessions(sessions: SpeakingSession[]): SpeakingSession[] {
  if (sessions.length <= MAX_SPEAKING_SESSIONS) return sessions;
  const sorted = sortSessionsNewestFirst(sessions);
  return sorted.slice(0, MAX_SPEAKING_SESSIONS);
}

export function loadSpeakingSessions(): SpeakingSessionsStoredV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SPEAKING_SESSIONS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SpeakingSessionsStoredV1>;
    if (
      parsed?.v !== 1 ||
      typeof parsed.activeId !== "string" ||
      !Array.isArray(parsed.sessions)
    ) {
      return null;
    }
    const rawList = (parsed.sessions as unknown[]).filter(
      (s): s is Record<string, unknown> =>
        s !== null && typeof s === "object" && !Array.isArray(s),
    );
    const sessions = rawList
      .map((r): SpeakingSession | null => {
        if (typeof r.id !== "string") return null;
        if (typeof r.model !== "string" || typeof r.updatedAt !== "number")
          return null;
        const title =
          r.title === null || r.title === undefined
            ? null
            : typeof r.title === "string"
              ? r.title
              : null;
        if (!Array.isArray(r.messages)) return null;
        return {
          id: r.id,
          title,
          model: r.model,
          liveModel: normalizeStoredLiveModelId(r.liveModel),
          messages: r.messages as ChatMessage[],
          updatedAt: r.updatedAt,
        };
      })
      .filter((s): s is SpeakingSession => s != null);
    if (sessions.length === 0) return null;
    const clamped = clampSessions(sessions);
    const activeOk = clamped.some((s) => s.id === parsed.activeId);
    const activeId = activeOk ? parsed.activeId : clamped[0].id;
    return { v: 1, activeId, sessions: clamped };
  } catch {
    return null;
  }
}

function shrinkForSizeLimit(payload: SpeakingSessionsStoredV1): SpeakingSessionsStoredV1 {
  let sessions = [...payload.sessions];
  let json = JSON.stringify({ ...payload, sessions });
  while (
    json.length > MAX_STORED_JSON_CHARS &&
    sessions.length > 1
  ) {
    const sorted = sortSessionsNewestFirst(sessions);
    sessions = sorted.slice(0, sorted.length - 1);
    const activeStill = sessions.some((s) => s.id === payload.activeId);
    const activeId = activeStill ? payload.activeId : sessions[0].id;
    json = JSON.stringify({ v: 1, activeId, sessions });
  }
  const activeOk = sessions.some((s) => s.id === payload.activeId);
  return {
    v: 1,
    activeId: activeOk ? payload.activeId : sessions[0]?.id ?? payload.activeId,
    sessions,
  };
}

export function saveSpeakingSessions(payload: SpeakingSessionsStoredV1): void {
  if (typeof window === "undefined") return;
  try {
    let next = { ...payload, sessions: clampSessions(payload.sessions) };
    const activeOk = next.sessions.some((s) => s.id === next.activeId);
    if (!activeOk && next.sessions.length > 0) {
      next = { ...next, activeId: next.sessions[0].id };
    }
    next = shrinkForSizeLimit(next);
    window.localStorage.setItem(
      SPEAKING_SESSIONS_STORAGE_KEY,
      JSON.stringify(next),
    );
  } catch {
    // ignore quota / private mode
  }
}
