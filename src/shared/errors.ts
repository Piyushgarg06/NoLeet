// ============================================================
// shared/errors.ts — Error taxonomy with user-facing copy
// ============================================================
import type { ErrorCode } from './types';

export interface ErrorDefinition {
  code: ErrorCode;
  retryable: boolean;
  title: string;
  body: string;
  action: string;
  isWarning?: boolean; // True for non-fatal warnings (EXTRACTION_PARTIAL, RESPONSE_INCOMPLETE, FORMAT_DEVIATION)
}

export const ERROR_DEFINITIONS: Record<ErrorCode, ErrorDefinition> = {
  NOT_A_PROBLEM_PAGE: {
    code: 'NOT_A_PROBLEM_PAGE',
    retryable: false,
    title: 'Not a problem page',
    body: 'Navigate to a LeetCode problem page (e.g. leetcode.com/problems/two-sum/) and try again.',
    action: 'Open a problem on LeetCode',
  },
  EDITOR_NOT_FOUND: {
    code: 'EDITOR_NOT_FOUND',
    retryable: true,
    title: 'Code editor not found',
    body: 'The code editor could not be detected on this page. Make sure you are on the problem\'s "Description" or "Code" tab where the editor is visible.',
    action: 'Switch to the editor tab and retry',
  },
  EDITOR_AMBIGUOUS: {
    code: 'EDITOR_AMBIGUOUS',
    retryable: true,
    title: 'Multiple editors detected',
    body: 'Multiple code editors were found and could not be disambiguated. Please ensure only the main problem editor is open.',
    action: 'Close any extra editor panes and retry',
  },
  EDITOR_EMPTY: {
    code: 'EDITOR_EMPTY',
    retryable: false,
    title: 'Editor is empty',
    body: 'Your code editor appears to be empty. Write some code first, then click Analyze.',
    action: 'Write code in the editor',
  },
  PROBLEM_NOT_FOUND: {
    code: 'PROBLEM_NOT_FOUND',
    retryable: true,
    title: 'Problem content not found',
    body: 'Could not extract the problem statement. Try switching to the "Description" tab.',
    action: 'Switch to Description tab and retry',
  },
  EXTRACTION_PARTIAL: {
    code: 'EXTRACTION_PARTIAL',
    retryable: false,
    title: 'Partial extraction',
    body: 'Some problem content (statement or examples) could not be extracted. Analysis will use available information — results may be less accurate.',
    action: '',
    isWarning: true,
  },
  CODE_TOO_LARGE: {
    code: 'CODE_TOO_LARGE',
    retryable: false,
    title: 'Code too large',
    body: 'Your code exceeds the 20,000 character limit and cannot be analyzed. Consider splitting it into smaller parts.',
    action: '',
  },
  GEMINI_NOT_SIGNED_IN: {
    code: 'GEMINI_NOT_SIGNED_IN',
    retryable: true,
    title: 'Not signed in to Gemini',
    body: 'You need to be signed in to Gemini to use this extension. Click the button below to open Gemini and sign in, then try again.',
    action: 'Open Gemini to sign in',
  },
  GEMINI_CHALLENGE: {
    code: 'GEMINI_CHALLENGE',
    retryable: false,
    title: 'Gemini verification required',
    body: 'Gemini is showing a CAPTCHA or verification challenge. Please open Gemini manually, complete the challenge, then try again.',
    action: 'Open Gemini manually',
  },
  GEMINI_UNAVAILABLE: {
    code: 'GEMINI_UNAVAILABLE',
    retryable: true,
    title: 'Gemini unavailable',
    body: 'Gemini appears to be unavailable in your region or is experiencing issues. Please try again later.',
    action: 'Retry',
  },
  GEMINI_TAB_LOST: {
    code: 'GEMINI_TAB_LOST',
    retryable: true,
    title: 'Gemini tab was closed',
    body: 'The Gemini tab was closed or discarded during the analysis. A new tab will be created on retry.',
    action: 'Retry',
  },
  GEMINI_RATE_LIMITED: {
    code: 'GEMINI_RATE_LIMITED',
    retryable: true,
    title: 'Gemini rate limit reached',
    body: 'Gemini is asking you to try again later. Please wait a moment and retry.',
    action: 'Retry later',
  },
  GEMINI_ERROR_MESSAGE: {
    code: 'GEMINI_ERROR_MESSAGE',
    retryable: true,
    title: 'Gemini returned an error',
    body: 'Gemini encountered an error while processing your request. Please try again.',
    action: 'Retry',
  },
  SELECTORS_OUTDATED: {
    code: 'SELECTORS_OUTDATED',
    retryable: false,
    title: 'Gemini UI has changed',
    body: 'The extension could not find expected elements on the Gemini page — it may have been updated. Please check for an extension update.',
    action: 'Copy diagnostics',
  },
  INPUT_FAILED: {
    code: 'INPUT_FAILED',
    retryable: true,
    title: 'Failed to insert prompt',
    body: 'The analysis prompt could not be inserted into Gemini\'s input box. The Gemini page may have changed.',
    action: 'Retry',
  },
  SUBMIT_FAILED: {
    code: 'SUBMIT_FAILED',
    retryable: true,
    title: 'Failed to submit prompt',
    body: 'The Send button could not be activated or no response appeared. Please retry.',
    action: 'Retry',
  },
  RESPONSE_STALLED: {
    code: 'RESPONSE_STALLED',
    retryable: true,
    title: 'Response stalled',
    body: 'Gemini stopped generating a response mid-way. Please retry.',
    action: 'Retry',
  },
  RESPONSE_INCOMPLETE: {
    code: 'RESPONSE_INCOMPLETE',
    retryable: true,
    title: 'Response may be incomplete',
    body: 'The analysis completed but the completion marker was not found — the response may be cut off. Review carefully and retry if needed.',
    action: 'Retry',
    isWarning: true,
  },
  FORMAT_DEVIATION: {
    code: 'FORMAT_DEVIATION',
    retryable: true,
    title: 'Unexpected response format',
    body: "Gemini didn't follow the expected format. The full response is shown below. Retry for a properly structured analysis.",
    action: 'Retry',
    isWarning: true,
  },
  TIMEOUT: {
    code: 'TIMEOUT',
    retryable: true,
    title: 'Analysis timed out',
    body: 'The analysis took too long to complete. Please retry — complex solutions may take longer.',
    action: 'Retry',
  },
  CANCELLED: {
    code: 'CANCELLED',
    retryable: false,
    title: 'Cancelled',
    body: 'The analysis was cancelled.',
    action: 'Analyze again',
  },
  WORKER_RESTARTED: {
    code: 'WORKER_RESTARTED',
    retryable: true,
    title: 'Extension restarted',
    body: 'The extension service worker was restarted mid-analysis. Please retry.',
    action: 'Retry',
  },
  UNKNOWN: {
    code: 'UNKNOWN',
    retryable: true,
    title: 'Unknown error',
    body: 'An unexpected error occurred. Please retry or copy diagnostics to report the issue.',
    action: 'Retry',
  },
};

export function getErrorDef(code: ErrorCode): ErrorDefinition {
  return ERROR_DEFINITIONS[code] ?? ERROR_DEFINITIONS['UNKNOWN'];
}

export function isWarning(code: ErrorCode): boolean {
  return getErrorDef(code).isWarning === true;
}
