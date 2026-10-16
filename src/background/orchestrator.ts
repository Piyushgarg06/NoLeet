// ============================================================
// background/orchestrator.ts — Run state machine
//
// Owns all run state, coordinates extraction → Gemini → result.
// Background service worker only — no DOM access.
// ============================================================
import type {
  Run,
  RunState,
  ErrorCode,
  GeminiInboundMessage,
  GeminiProgressMessage,
  GeminiResultMessage,
  GeminiErrorMessage,
} from '../shared/types';
import { CONFIG, debugLog } from '../shared/config';
import { persistRun, loadRun } from './state';
import { startKeepAlive, stopKeepAlive } from './keepAlive';
import {
  validateLeetCodeUrl,
  extractEditorState,
  extractProblemContent,
  ExtractionError,
} from './leetcodeBridge';
import {
  findOrCreateGeminiTab,
  navigateToFreshChat,
  pingGeminiContentScript,
  unthrottleGeminiTab,
  closeGeminiTab,
  GeminiTabError,
} from './geminiTab';
import { buildPrompt, generateNonce } from '../shared/prompt';
import { parseAnalysis, cleanDuplicatedMath } from '../shared/parseAnalysis';
import { makeGeminiRun, makeGeminiCancel, makeStateUpdate } from '../shared/messages';

// Panel ports — we broadcast STATE_UPDATE to all connected panels
const panelPorts = new Set<chrome.runtime.Port>();

export function registerPanelPort(port: chrome.runtime.Port): void {
  panelPorts.add(port);
  port.onDisconnect.addListener(() => panelPorts.delete(port));
}

function broadcastState(run: Run | null): void {
  const msg = makeStateUpdate(run);
  for (const port of panelPorts) {
    try {
      port.postMessage(msg);
    } catch {
      // Port may have closed; it'll be cleaned up on disconnect
    }
  }
}

// Current run (in-memory reference)
let currentRun: Run | null = null;

// Gemini content script port (long-lived connection during a run)
let geminiPort: chrome.runtime.Port | null = null;

// AbortController for the current run
let runAbortController: AbortController | null = null;

/**
 * Initialize the orchestrator on worker startup.
 * Rehydrates any persisted run and sets it to error if it was mid-flight.
 */
export async function initOrchestrator(): Promise<void> {
  const persisted = await loadRun();
  if (persisted) {
    const inFlight: RunState[] = [
      'extracting', 'preparing_gemini', 'submitting', 'generating', 'capturing'
    ];
    if (inFlight.includes(persisted.state)) {
      // Worker restarted mid-run
      persisted.state = 'error';
      persisted.error = {
        code: 'WORKER_RESTARTED',
        message: 'The extension service worker was restarted. Please retry.',
        retryable: true,
      };
      currentRun = persisted;
      await persistRun(persisted);
    } else {
      currentRun = persisted;
    }
  }
}

export function getCurrentRun(): Run | null {
  return currentRun;
}

/**
 * Start a new analysis run from the panel.
 */
export async function startRun(leetcodeTabId: number): Promise<void> {
  // If a run is already in progress, return current state
  if (currentRun && ['extracting', 'preparing_gemini', 'submitting', 'generating', 'capturing'].includes(currentRun.state)) {
    broadcastState(currentRun);
    return;
  }

  // Cancel any previous run
  if (runAbortController) {
    runAbortController.abort();
    runAbortController = null;
  }

  const run: Run = {
    id: crypto.randomUUID(),
    nonce: generateNonce(),
    state: 'extracting',
    startedAt: Date.now(),
    leetcodeTabId,
    snapshotTime: Date.now(),
  };

  currentRun = run;
  await persistRun(run);
  broadcastState(run);

  runAbortController = new AbortController();
  const signal = runAbortController.signal;

  startKeepAlive();

  try {
    await executeRun(run, signal);
  } catch (e) {
    if (!signal.aborted) {
      debugLog('orchestrator: unhandled error in run', e);
      await transitionError(run, 'UNKNOWN', String(e), true);
    }
  } finally {
    stopKeepAlive();
    runAbortController = null;
  }
}

/**
 * Cancel the current run.
 */
export async function cancelRun(): Promise<void> {
  if (!currentRun) return;

  if (runAbortController) {
    runAbortController.abort();
  }

  // Try to stop Gemini generation
  if (geminiPort) {
    try {
      geminiPort.postMessage(makeGeminiCancel());
    } catch {
      // Port may be closed
    }
  }

  await transitionState(currentRun, 'cancelled');
  currentRun!.error = {
    code: 'CANCELLED',
    message: 'Analysis cancelled',
    retryable: false,
  };
  await persistRun(currentRun);
  broadcastState(currentRun);
  stopKeepAlive();
}

/**
 * Main run execution — state machine.
 */
async function executeRun(run: Run, signal: AbortSignal): Promise<void> {
  // --- Phase 1: Validate tab URL ---
  checkAbort(signal, run);
  let leetcodeTab: chrome.tabs.Tab;
  try {
    leetcodeTab = await chrome.tabs.get(run.leetcodeTabId);
  } catch {
    await transitionError(run, 'NOT_A_PROBLEM_PAGE', 'LeetCode tab not found', false);
    return;
  }

  let slug: string;
  try {
    slug = validateLeetCodeUrl(leetcodeTab.url);
  } catch (e) {
    if (e instanceof ExtractionError) {
      await transitionError(run, e.code as ErrorCode, e.message, false, e.diagnostics);
    } else {
      await transitionError(run, 'NOT_A_PROBLEM_PAGE', String(e), false);
    }
    return;
  }

  // --- Phase 2: Extract editor + problem ---
  await updateProgress(run, 'Reading your code…');
  checkAbort(signal, run);

  let editorState: Awaited<ReturnType<typeof extractEditorState>>;
  try {
    editorState = await extractEditorState(run.leetcodeTabId);
  } catch (e) {
    if (e instanceof ExtractionError) {
      await transitionError(run, e.code as ErrorCode, e.message, e.code === 'EDITOR_EMPTY' ? false : true, e.diagnostics);
    } else {
      await transitionError(run, 'EDITOR_NOT_FOUND', String(e), true);
    }
    return;
  }

  checkAbort(signal, run);
  let problemResult: Awaited<ReturnType<typeof extractProblemContent>>;
  try {
    problemResult = await extractProblemContent(run.leetcodeTabId, slug);
  } catch {
    // Non-fatal if we at least have the slug
    problemResult = {
      problem: {
        slug,
        title: slug,
        statementMarkdown: '',
        statementTruncated: false,
      },
      partial: true,
    };
  }

  // Update run with extracted data
  run.problem = {
    slug: problemResult.problem.slug,
    title: problemResult.problem.title,
    statement: problemResult.problem.statementMarkdown,
    difficulty: problemResult.problem.difficulty,
  };
  run.language = {
    id: editorState.editorState.languageId,
    label: editorState.editorState.languageLabel,
  };
  run.codeLength = editorState.editorState.code.length;
  run.codeSnapshot = editorState.editorState.code; // stored in session only
  run.snapshotTime = Date.now();
  run.extractionPartial = problemResult.partial;
  run.statementTruncated = problemResult.problem.statementTruncated;

  await persistRun(run);
  broadcastState(run);

  // --- Phase 3: Build prompt ---
  const { prompt, sentinelCollisionEscaped, xmlTagsNeutralized } = buildPrompt({
    title: run.problem.title,
    difficulty: run.problem.difficulty,
    statement: run.problem.statement,
    languageLabel: run.language.label,
    code: run.codeSnapshot,
    nonce: run.nonce,
  });

  debugLog('orchestrator: prompt built, length', prompt.length,
    { sentinelCollisionEscaped, xmlTagsNeutralized });

  // --- Phase 4: Prepare Gemini tab ---
  await transitionState(run, 'preparing_gemini');
  await updateProgress(run, 'Opening Gemini…');
  checkAbort(signal, run);

  const leetcodeWindow = leetcodeTab.windowId;
  let geminiTabId: number;
  try {
    geminiTabId = await findOrCreateGeminiTab(leetcodeWindow, run.geminiTabId);
    run.geminiTabId = geminiTabId;
    await navigateToFreshChat(geminiTabId);
    await persistRun(run);
  } catch (e) {
    if (e instanceof GeminiTabError) {
      await transitionError(run, e.code as ErrorCode, e.message, true, e.diagnostics);
    } else {
      await transitionError(run, 'GEMINI_TAB_LOST', String(e), true);
    }
    return;
  }

  checkAbort(signal, run);

  // Ping content script for readiness
  let diagnosis: Awaited<ReturnType<typeof pingGeminiContentScript>>;
  try {
    diagnosis = await pingGeminiContentScript(geminiTabId);
  } catch (e) {
    if (e instanceof GeminiTabError) {
      await transitionError(run, e.code as ErrorCode, e.message, true, e.diagnostics);
    } else {
      await transitionError(run, 'SELECTORS_OUTDATED', String(e), true);
    }
    return;
  }

  // Check auth/challenge
  if (diagnosis.status === 'not_signed_in') {
    await transitionError(run, 'GEMINI_NOT_SIGNED_IN', 'Not signed in to Gemini', true);
    return;
  }
  if (diagnosis.status === 'challenge') {
    await transitionError(run, 'GEMINI_CHALLENGE', 'Gemini verification required', false);
    return;
  }
  if (diagnosis.status === 'unavailable') {
    await transitionError(run, 'GEMINI_UNAVAILABLE', 'Gemini unavailable', true);
    return;
  }

  // --- Phase 5: Submit prompt to Gemini ---
  await transitionState(run, 'submitting');
  await updateProgress(run, 'Sending to Gemini…');
  checkAbort(signal, run);

  // Unthrottle Gemini tab so background generation runs at full foreground speed
  try {
    await chrome.scripting.executeScript({
      target: { tabId: geminiTabId },
      world: 'MAIN',
      func: unthrottleGeminiTab,
    });
  } catch (e) {
    debugLog('orchestrator: unthrottle script injection skipped/failed', e);
  }

  // Establish long-lived port with content script
  const geminiResult = await sendToGeminiContentScript(run, geminiTabId, prompt, run.nonce, signal);

  if (!geminiResult.ok) {
    const error = geminiResult.error!;
    await transitionError(run, error.code, error.message, error.retryable, error.diagnostics);
    return;
  }

  // --- Phase 6: Capture response ---
  await transitionState(run, 'capturing');
  checkAbort(signal, run);

  const responseMarkdown = cleanDuplicatedMath(geminiResult.markdown!);
  const { sections, structured, formatDeviation } = parseAnalysis(responseMarkdown, run.nonce);

  run.state = 'done';
  run.resultMarkdown = responseMarkdown;
  run.sections = sections;
  run.structured = structured;
  run.incomplete = geminiResult.incomplete;
  run.formatDeviation = formatDeviation;
  // Clear code snapshot from memory (do not persist it)
  run.codeSnapshot = undefined;

  await persistRun(run);
  broadcastState(run);

  // Close the Gemini tab now that the output is displayed and persisted
  if (geminiTabId) {
    await closeGeminiTab(geminiTabId);
    run.geminiTabId = undefined;
  }
}

/**
 * Send the prompt to the Gemini content script via runtime messaging,
 * wait for result or error via long-lived port.
 */
async function sendToGeminiContentScript(
  run: Run,
  geminiTabId: number,
  prompt: string,
  nonce: string,
  signal: AbortSignal
): Promise<{
  ok: boolean;
  markdown?: string;
  incomplete?: boolean;
  error?: { code: ErrorCode; message: string; retryable: boolean; diagnostics?: unknown };
}> {
  return new Promise(resolve => {
    // Set up abort handler
    if (signal.aborted) {
      resolve({ ok: false, error: { code: 'CANCELLED', message: 'Cancelled', retryable: false } });
      return;
    }

    const onAbort = () => {
      if (geminiPort) {
        try { geminiPort.postMessage(makeGeminiCancel()); } catch { /* ignore */ }
      }
      resolve({ ok: false, error: { code: 'CANCELLED', message: 'Cancelled', retryable: false } });
    };
    signal.addEventListener('abort', onAbort, { once: true });

    // Open long-lived port
    try {
      geminiPort = chrome.tabs.connect(geminiTabId, { name: 'gemini-run' });
    } catch (e) {
      signal.removeEventListener('abort', onAbort);
      resolve({ ok: false, error: { code: 'GEMINI_TAB_LOST', message: String(e), retryable: true } });
      return;
    }

    let lastProgressTime = Date.now();
    const stallTimer = setInterval(() => {
      const now = Date.now();
      if (now - lastProgressTime > CONFIG.STALL_DETECTION_MS) {
        clearInterval(stallTimer);
        resolve({ ok: false, error: { code: 'RESPONSE_STALLED', message: 'Response stalled', retryable: true } });
      }
    }, 5_000);

    const overallTimer = setTimeout(() => {
      clearInterval(stallTimer);
      resolve({ ok: false, error: { code: 'TIMEOUT', message: 'Analysis timed out', retryable: true } });
    }, CONFIG.OVERALL_RUN_CAP_MS);

    geminiPort.onDisconnect.addListener(() => {
      clearInterval(stallTimer);
      clearTimeout(overallTimer);
      signal.removeEventListener('abort', onAbort);
      if (!signal.aborted) {
        resolve({ ok: false, error: { code: 'GEMINI_TAB_LOST', message: 'Gemini tab disconnected', retryable: true } });
      }
    });

    geminiPort.onMessage.addListener((msg: GeminiInboundMessage) => {
      if (msg.type === 'GEMINI_PROGRESS') {
        const m = msg as GeminiProgressMessage;
        lastProgressTime = Date.now();
        // Update run state to 'generating' once we start getting progress
        if (run.state !== 'generating') {
          run.state = 'generating';
          persistRun(run).catch(() => undefined);
          broadcastState(run);
        }
        run.progress = {
          message: 'Waiting for Gemini…',
          elapsedMs: m.elapsedMs,
          charsReceived: m.charsReceived,
        };
        broadcastState(run);
      } else if (msg.type === 'GEMINI_RESULT') {
        const m = msg as GeminiResultMessage;
        clearInterval(stallTimer);
        clearTimeout(overallTimer);
        signal.removeEventListener('abort', onAbort);
        geminiPort = null;
        resolve({ ok: true, markdown: m.markdown, incomplete: m.incomplete });
      } else if (msg.type === 'GEMINI_ERROR') {
        const m = msg as GeminiErrorMessage;
        clearInterval(stallTimer);
        clearTimeout(overallTimer);
        signal.removeEventListener('abort', onAbort);
        geminiPort = null;
        resolve({ ok: false, error: { code: m.code, message: m.message, retryable: m.retryable, diagnostics: m.diagnostics } });
      }
    });

    // Send the run message
    try {
      geminiPort.postMessage(makeGeminiRun(prompt, nonce));
    } catch (e) {
      clearInterval(stallTimer);
      clearTimeout(overallTimer);
      signal.removeEventListener('abort', onAbort);
      resolve({ ok: false, error: { code: 'GEMINI_TAB_LOST', message: String(e), retryable: true } });
    }
  });
}

// ---- Helpers ----

async function transitionState(run: Run, state: RunState): Promise<void> {
  run.state = state;
  await persistRun(run);
  broadcastState(run);
}

async function updateProgress(run: Run, message: string): Promise<void> {
  run.progress = { message, elapsedMs: Date.now() - run.startedAt };
  broadcastState(run);
}

export async function transitionError(
  run: Run,
  code: ErrorCode,
  message: string,
  retryable: boolean,
  diagnostics?: unknown
): Promise<void> {
  run.state = 'error';
  run.error = { code, message, retryable, diagnostics };
  run.codeSnapshot = undefined; // never persist code
  await persistRun(run);
  broadcastState(run);
}

function checkAbort(signal: AbortSignal, run: Run): void {
  if (signal.aborted) {
    run.state = 'cancelled';
    throw new Error('Cancelled');
  }
}

/**
 * Handle tab removal (LeetCode or Gemini closed mid-run).
 * Never triggers an error if the analysis is already done.
 */
export function handleTabRemoved(tabId: number): void {
  if (!currentRun || currentRun.state === 'done') return;

  const isRunning = ['extracting', 'preparing_gemini', 'submitting', 'generating', 'capturing'].includes(currentRun.state);
  if (!isRunning) return;

  if (tabId === currentRun.leetcodeTabId) {
    debugLog('orchestrator: LeetCode tab closed mid-run');
    if (runAbortController) runAbortController.abort();
    transitionError(currentRun, 'NOT_A_PROBLEM_PAGE', 'LeetCode tab was closed', false).catch(() => undefined);
  } else if (tabId === currentRun.geminiTabId) {
    debugLog('orchestrator: Gemini tab closed mid-run');
    transitionError(currentRun, 'GEMINI_TAB_LOST', 'Gemini tab was closed', true).catch(() => undefined);
  }
}

/**
 * Handle LeetCode tab navigating away from the problem.
 */
export function handleTabUpdated(tabId: number, changeInfo: chrome.tabs.TabChangeInfo, _tab: chrome.tabs.Tab): void {
  if (!currentRun) return;
  if (tabId !== currentRun.leetcodeTabId) return;
  if (changeInfo.url && !CONFIG.LEETCODE_PROBLEMS_PATTERN.test(changeInfo.url)) {
    debugLog('orchestrator: LeetCode tab navigated away');
    // Don't abort — we already snapshotted the code; just note the navigation
    // The run continues with the already-extracted code
  }
}
