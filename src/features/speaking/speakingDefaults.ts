/** Default speaking model for the Gemini-backed speaking chat. */
export const DEFAULT_SPEAKING_MODEL = "gemini-2.5-flash-lite";

/** Live API model for native-audio oral practice (aligns with official Live WebSocket examples). */
export const DEFAULT_LIVE_ORAL_MODEL = "gemini-3.1-flash-live-preview";

/**
 * STT → REST Gemini → Cloud TTS pipeline; stored in session `liveModel` like Live ids.
 * Not a real Live API model id.
 */
export const PIPELINE_ORAL_MODE_ID = "oral-pipeline-flash-lite";

/**
 * Default oral path when no preference is stored. Uses the pipeline so new users
 * do not trigger Live API billing until they explicitly choose a Live model.
 */
export const DEFAULT_ORAL_MODE_ID = PIPELINE_ORAL_MODE_ID;

export type OralModeOption = { id: string; label: string };

/** REST Gemini models offered for typed speaking chat (sidebar dropdown). */
export const SPEAKING_TEXT_MODEL_OPTIONS: OralModeOption[] = [
  {
    id: DEFAULT_SPEAKING_MODEL,
    label: "Gemini 2.5 Flash Lite",
  },
];

const SPEAKING_TEXT_MODEL_IDS = new Set(
  SPEAKING_TEXT_MODEL_OPTIONS.map((o) => o.id),
);

/** Gemini Live / native-audio options only (for docs and `isGeminiLiveOralMode`). */
export const GEMINI_LIVE_ORAL_MODEL_OPTIONS: OralModeOption[] = [
  {
    id: "gemini-3.1-flash-live-preview",
    label: "Gemini 3.1 Flash Live",
  },
];

/** Dropdown: cheaper pipeline first, then Live native-audio options. */
export const ORAL_MODE_OPTIONS: OralModeOption[] = [
  {
    id: PIPELINE_ORAL_MODE_ID,
    label: "Gemini 2.5 Flash Lite（錄音 → STT → 串流 → TTS）",
  },
  ...GEMINI_LIVE_ORAL_MODEL_OPTIONS,
];

const GEMINI_LIVE_ORAL_MODEL_IDS = new Set(
  GEMINI_LIVE_ORAL_MODEL_OPTIONS.map((o) => o.id),
);

const ALL_ORAL_MODE_IDS = new Set(ORAL_MODE_OPTIONS.map((o) => o.id));

export function isGeminiLiveOralMode(id: string): boolean {
  return GEMINI_LIVE_ORAL_MODEL_IDS.has(id);
}

export function isPipelineOralMode(id: string): boolean {
  return id === PIPELINE_ORAL_MODE_ID;
}

/** Coerce stored or manual localStorage values to a supported oral mode id. */
export function normalizeStoredLiveModelId(id: unknown): string {
  if (typeof id !== "string" || !id.trim()) return DEFAULT_ORAL_MODE_ID;
  const t = id.trim();
  if (!ALL_ORAL_MODE_IDS.has(t)) return DEFAULT_ORAL_MODE_ID;
  return t;
}

/** Coerce stored text chat model to a supported REST model id. */
export function normalizeStoredSpeakingTextModel(id: unknown): string {
  if (typeof id !== "string" || !id.trim()) return DEFAULT_SPEAKING_MODEL;
  const t = id.trim();
  if (!SPEAKING_TEXT_MODEL_IDS.has(t)) return DEFAULT_SPEAKING_MODEL;
  return t;
}
