// ============================================================
// shared/messages.ts — Typed message helpers
// ============================================================
import type {
  AnyMessage,
  PanelStartMessage,
  PanelCancelMessage,
  PanelGetStateMessage,
  StateUpdateMessage,
  GeminiPingMessage,
  GeminiRunMessage,
  GeminiCancelMessage,
  GeminiPingResponseMessage,
  GeminiProgressMessage,
  GeminiResultMessage,
  GeminiErrorMessage,
  Run,
  GeminiDiagnosis,
  ErrorCode,
} from './types';

// ---- Constructors ----

export function makePanelStart(): PanelStartMessage {
  return { type: 'PANEL_START' };
}

export function makePanelCancel(): PanelCancelMessage {
  return { type: 'PANEL_CANCEL' };
}

export function makePanelGetState(): PanelGetStateMessage {
  return { type: 'PANEL_GET_STATE' };
}

export function makeStateUpdate(run: Run | null): StateUpdateMessage {
  return { type: 'STATE_UPDATE', run };
}

export function makeGeminiPing(): GeminiPingMessage {
  return { type: 'GEMINI_PING' };
}

export function makeGeminiRun(prompt: string, nonce: string): GeminiRunMessage {
  return { type: 'GEMINI_RUN', prompt, nonce };
}

export function makeGeminiCancel(): GeminiCancelMessage {
  return { type: 'GEMINI_CANCEL' };
}

export function makeGeminiPingResponse(
  diagnosis: GeminiDiagnosis,
  ready: boolean
): GeminiPingResponseMessage {
  return { type: 'GEMINI_PING_RESPONSE', diagnosis, ready };
}

export function makeGeminiProgress(charsReceived: number, elapsedMs: number): GeminiProgressMessage {
  return { type: 'GEMINI_PROGRESS', charsReceived, elapsedMs };
}

export function makeGeminiResult(
  markdown: string,
  incomplete: boolean,
  formatDeviation: boolean
): GeminiResultMessage {
  return { type: 'GEMINI_RESULT', markdown, incomplete, formatDeviation };
}

export function makeGeminiError(
  code: ErrorCode,
  message: string,
  retryable: boolean,
  diagnostics?: unknown
): GeminiErrorMessage {
  return { type: 'GEMINI_ERROR', code, message, retryable, diagnostics };
}

// ---- Type guards ----

export function isMessage<T extends AnyMessage>(
  msg: unknown,
  type: T['type']
): msg is T {
  return (
    msg !== null &&
    typeof msg === 'object' &&
    (msg as Record<string, unknown>)['type'] === type
  );
}

export function isPanelMessage(msg: unknown): msg is PanelStartMessage | PanelCancelMessage | PanelGetStateMessage {
  return isMessage(msg, 'PANEL_START') || isMessage(msg, 'PANEL_CANCEL') || isMessage(msg, 'PANEL_GET_STATE');
}
