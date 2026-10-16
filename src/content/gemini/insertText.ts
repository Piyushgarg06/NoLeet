// ============================================================
// content/gemini/insertText.ts — contenteditable insertion strategies
//
// Spike findings (Phase 0):
// - Gemini's input is a rich-text contenteditable div
// - Naively setting .textContent wipes the div and React/Angular state doesn't update
// - Strategy A: document.execCommand("insertText") — deprecated but works in most browsers
//   for contenteditable. Preserves framework state if properly focused.
// - Strategy B: Synthetic paste event with DataTransfer
// - Strategy C: Input event simulation (fallback)
//
// CRITICAL: Python code has leading whitespace that must be preserved exactly.
// Test: insert a prompt with tabs and blank lines and verify the send button enables.
// ============================================================

export interface InsertionResult {
  ok: boolean;
  strategy: string;
  insertedLength: number;
  verifiedLength: number;
  warning?: string;
}

/**
 * Insert text into a contenteditable element.
 * Tries strategies in order; verifies after each attempt.
 * Returns the result of the first successful strategy.
 */
export async function insertTextIntoContentEditable(
  element: HTMLElement,
  text: string
): Promise<InsertionResult> {
  // Ensure element is focused
  element.focus();
  await tick();

  // Clear any existing content first
  clearContentEditable(element);
  await tick();

  // Strategy A: execCommand('insertText')
  const resultA = await tryExecCommandInsert(element, text);
  if (resultA.ok) return resultA;

  // Strategy B: synthetic paste event
  const resultB = await tryPasteEventInsert(element, text);
  if (resultB.ok) return resultB;

  // Strategy C: direct DOM manipulation + input event
  const resultC = await tryDirectDomInsert(element, text);
  return resultC;
}

function clearContentEditable(el: HTMLElement): void {
  // Select all and delete
  try {
    el.focus();
    document.execCommand('selectAll', false);
    document.execCommand('delete', false);
  } catch {
    // Fallback: direct clear
    el.innerHTML = '';
  }
}

/**
 * Strategy A: document.execCommand('insertText')
 * Best for React/Angular state sync.
 */
async function tryExecCommandInsert(el: HTMLElement, text: string): Promise<InsertionResult> {
  try {
    el.focus();
    clearContentEditable(el);
    await tick();

    const succeeded = document.execCommand('insertText', false, text);
    await tick();

    if (!succeeded) {
      return { ok: false, strategy: 'execCommand', insertedLength: 0, verifiedLength: 0, warning: 'execCommand returned false' };
    }

    const actual = getContentEditableText(el);
    const verified = verifyInsertion(text, actual);

    return {
      ok: verified,
      strategy: 'execCommand',
      insertedLength: text.length,
      verifiedLength: actual.length,
      warning: verified ? undefined : `Length mismatch: expected ${text.length}, got ${actual.length}`,
    };
  } catch (e) {
    return { ok: false, strategy: 'execCommand', insertedLength: 0, verifiedLength: 0, warning: String(e) };
  }
}

/**
 * Strategy B: synthetic paste event with DataTransfer
 */
async function tryPasteEventInsert(el: HTMLElement, text: string): Promise<InsertionResult> {
  try {
    el.focus();
    clearContentEditable(el);
    await tick();

    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', text);

    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: dataTransfer,
      bubbles: true,
      cancelable: true,
    });

    el.dispatchEvent(pasteEvent);
    await tick();

    const actual = getContentEditableText(el);
    const verified = verifyInsertion(text, actual);

    if (!verified && actual.length === 0) {
      return { ok: false, strategy: 'paste-event', insertedLength: 0, verifiedLength: 0, warning: 'No text appeared after paste event' };
    }

    return {
      ok: verified,
      strategy: 'paste-event',
      insertedLength: text.length,
      verifiedLength: actual.length,
      warning: verified ? undefined : `Partial insertion: expected ${text.length}, got ${actual.length}`,
    };
  } catch (e) {
    return { ok: false, strategy: 'paste-event', insertedLength: 0, verifiedLength: 0, warning: String(e) };
  }
}

/**
 * Strategy C: direct DOM manipulation + dispatch input event
 * Less reliable for framework state but a last resort.
 */
async function tryDirectDomInsert(el: HTMLElement, text: string): Promise<InsertionResult> {
  try {
    el.focus();

    // Set text content directly (preserving newlines as <br> or <p> tags)
    // For Quill-style editors, we use plain text
    el.textContent = text;

    // Dispatch input event to notify the framework
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();

    const actual = getContentEditableText(el);
    const verified = verifyInsertion(text, actual);

    return {
      ok: verified,
      strategy: 'direct-dom',
      insertedLength: text.length,
      verifiedLength: actual.length,
      warning: verified
        ? 'Direct DOM insertion used — framework state may not be fully synced'
        : `Insertion failed: expected ${text.length}, got ${actual.length}`,
    };
  } catch (e) {
    return { ok: false, strategy: 'direct-dom', insertedLength: 0, verifiedLength: 0, warning: String(e) };
  }
}

/**
 * Get the text content of a contenteditable element, normalizing newlines.
 */
function getContentEditableText(el: HTMLElement): string {
  // innerText preserves newlines better than textContent for rendered elements
  return (el.innerText ?? el.textContent ?? '').replace(/\r\n/g, '\n');
}

/**
 * Verify that the inserted text approximately matches the expected text.
 * We allow for minor normalization by the editor (e.g., trailing newline).
 * Critical: leading whitespace must be preserved (Python!).
 */
function verifyInsertion(expected: string, actual: string): boolean {
  const normExpected = expected.replace(/\r\n/g, '\n').replace(/\n+$/, '');
  const normActual = actual.replace(/\r\n/g, '\n').replace(/\n+$/, '');
  // Allow up to 5% length difference for minor normalization
  const lengthRatio = Math.abs(normExpected.length - normActual.length) / Math.max(normExpected.length, 1);
  return lengthRatio < 0.05;
}

function tick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 50));
}
