export type ChatRole = "system" | "user" | "assistant";
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
}

export interface SpeakingChatRequest {
  model: string;
  messages: Array<Pick<ChatMessage, "role" | "content">>;
  temperature?: number;
  /** When true, server returns an SSE stream (`stream: true` in JSON body). */
  stream?: boolean;
}

export interface SpeakingChatResponse {
  reply: ChatMessage;
}

export type SpeakingChatErrorCode =
  | "VALIDATION"
  | "NETWORK"
  | "TIMEOUT"
  | "OLLAMA"
  | "UNKNOWN";

export interface SpeakingChatError extends Error {
  code: SpeakingChatErrorCode;
}

/** `title === null` → show default label until first user message sets a snippet. */
export interface SpeakingSession {
  id: string;
  title: string | null;
  model: string;
  messages: ChatMessage[];
  updatedAt: number;
}
