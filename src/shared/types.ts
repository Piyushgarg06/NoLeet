// ============================================================
// shared/types.ts — All shared TypeScript types
// ============================================================

// --------------- Error codes ---------------
export type ErrorCode =
  | 'NOT_A_PROBLEM_PAGE'
  | 'EDITOR_NOT_FOUND'
  | 'EDITOR_AMBIGUOUS'
  | 'EDITOR_EMPTY'
  | 'PROBLEM_NOT_FOUND'
  | 'EXTRACTION_PARTIAL'
  | 'CODE_TOO_LARGE'
  | 'GEMINI_NOT_SIGNED_IN'
  | 'GEMINI_CHALLENGE'
  | 'GEMINI_UNAVAILABLE'
  | 'GEMINI_TAB_LOST'
  | 'GEMINI_RATE_LIMITED'
  | 'GEMINI_ERROR_MESSAGE'
  | 'SELECTORS_OUTDATED'
  | 'INPUT_FAILED'
  | 'SUBMIT_FAILED'
  | 'RESPONSE_STALLED'
  | 'RESPONSE_INCOMPLETE'
  | 'FORMAT_DEVIATION'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'WORKER_RESTARTED'
  | 'UNKNOWN';

// --------------- Run states ---------------
export type RunState =
  | 'idle'
  | 'extracting'
  | 'preparing_gemini'
  | 'submitting'
  | 'generating'
  | 'capturing'
  | 'done'
  | 'error'
  | 'cancelled';

// --------------- Run record ---------------
export interface RunProblem {
  slug: string;
  title: string;
  statement: string;
  difficulty?: string;
}

export interface RunLanguage {
  id: string;
  label: string;
}

export interface RunError {
  code: ErrorCode;
  message: string;
  diagnostics?: unknown;
  retryable: boolean;
}

export interface RunProgress {
  message: string;
  elapsedMs: number;
  charsReceived?: number;
}

export interface ParsedSections {
  approach?: string;
  timeComplexity?: string;
  spaceComplexity?: string;
  correctness?: string;
  edgeCases?: string;
  optimizations?: string;
}

export interface StructuredAnalysis {
  verdict: 'optimal' | 'good' | 'suboptimal' | 'buggy';
  headline: string;
  currentApproach: string;
  suggestedApproach: string;
  keyIdea: string;
  currentTimeComplexity: string;
  suggestedTimeComplexity: string;
  currentSpaceComplexity: string;
  suggestedSpaceComplexity: string;
  efficiencyComment: string;
  codeSnippet?: {
    language: string;
    code: string;
  };
}

export interface Run {
  id: string;
  nonce: string;
  state: RunState;
  startedAt: number;
  leetcodeTabId: number;
  geminiTabId?: number;
  problem?: RunProblem;
  language?: RunLanguage;
  codeLength?: number;     // do NOT persist the code or prompt itself beyond the run's lifetime
  codeSnapshot?: string;   // the actual code, stored only during run in session storage
  progress?: RunProgress;
  resultMarkdown?: string;
  sections?: ParsedSections;
  structured?: StructuredAnalysis;
  incomplete?: boolean;
  formatDeviation?: boolean;
  extractionPartial?: boolean;
  statementTruncated?: boolean;
  codeTooLargeWarning?: boolean;
  error?: RunError;
  snapshotTime?: number;   // timestamp when code was snapshotted
}

// --------------- LeetCode extraction result ---------------
export interface LeetCodeEditorState {
  code: string;
  languageId: string;
  languageLabel: string;
}

export interface LeetCodeProblemContent {
  slug: string;
  title: string;
  statementMarkdown: string;
  difficulty?: string;
  statementTruncated?: boolean;
}

export interface LeetCodeExtractResult {
  editor?: LeetCodeEditorState;
  problem?: LeetCodeProblemContent;
  editorWarning?: string; // e.g., "DOM fallback used — code may be incomplete"
}

// --------------- Gemini page diagnosis ---------------
export type GeminiPageStatus =
  | 'ready'
  | 'not_signed_in'
  | 'consent_interstitial'
  | 'challenge'
  | 'unavailable'
  | 'unknown';

export interface GeminiDiagnosis {
  status: GeminiPageStatus;
  detail?: string;
}

// --------------- Messages ---------------
// Panel → Background
export interface PanelStartMessage {
  type: 'PANEL_START';
}

export interface PanelCancelMessage {
  type: 'PANEL_CANCEL';
}

export interface PanelGetStateMessage {
  type: 'PANEL_GET_STATE';
}

// Background → Panel
export interface StateUpdateMessage {
  type: 'STATE_UPDATE';
  run: Run | null;
}

// Background → Gemini content script
export interface GeminiPingMessage {
  type: 'GEMINI_PING';
}

export interface GeminiRunMessage {
  type: 'GEMINI_RUN';
  prompt: string;
  nonce: string;
}

export interface GeminiCancelMessage {
  type: 'GEMINI_CANCEL';
}

// Gemini content script → Background
export interface GeminiPingResponseMessage {
  type: 'GEMINI_PING_RESPONSE';
  diagnosis: GeminiDiagnosis;
  ready: boolean;
}

export interface GeminiProgressMessage {
  type: 'GEMINI_PROGRESS';
  charsReceived: number;
  elapsedMs: number;
}

export interface GeminiResultMessage {
  type: 'GEMINI_RESULT';
  markdown: string;
  incomplete: boolean;
  formatDeviation: boolean;
}

export interface GeminiErrorMessage {
  type: 'GEMINI_ERROR';
  code: ErrorCode;
  message: string;
  diagnostics?: unknown;
  retryable: boolean;
}

export type BackgroundMessage =
  | PanelStartMessage
  | PanelCancelMessage
  | PanelGetStateMessage;

export type PanelMessage = StateUpdateMessage;

export type GeminiOutboundMessage = GeminiPingMessage | GeminiRunMessage | GeminiCancelMessage;

export type GeminiInboundMessage =
  | GeminiPingResponseMessage
  | GeminiProgressMessage
  | GeminiResultMessage
  | GeminiErrorMessage;

export type AnyMessage =
  | BackgroundMessage
  | PanelMessage
  | GeminiOutboundMessage
  | GeminiInboundMessage;
