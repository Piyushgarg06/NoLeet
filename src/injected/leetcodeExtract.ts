// ============================================================
// injected/leetcodeExtract.ts
//
// Functions injected into the LeetCode page via chrome.scripting.executeScript.
// These run in the MAIN world and have access to page globals (window.monaco).
//
// CRITICAL RULES:
// - Must be self-contained (no closures over module imports)
// - Must return only plain JSON-serializable data
// - Must NOT throw; return structured errors instead
// ============================================================

// ---------------------------------------------------------------------------
// Editor extraction (MAIN world) — runs as a serialized function
// ---------------------------------------------------------------------------

/**
 * Extract the current editor state from Monaco.
 * This function is serialized and injected into the MAIN world of the LeetCode tab.
 * It must be entirely self-contained.
 *
 * Spike findings (Phase 0):
 * - window.monaco is available in MAIN world on LeetCode problem pages
 * - monaco.editor.getEditors() returns all editor instances
 * - The code editor container is .view-lines inside #editor or .monaco-editor-container
 * - The test-case editor (custom input) is typically in a separate pane
 * - Discriminator: pick the editor whose container is NOT inside the custom-testcase pane
 *   (identified by data-mode="custom-input" or similar, or using model URI)
 * - model.getValue() returns full code including unsaved edits
 * - model.getLanguageId() returns the Monaco language id (e.g. "python", "cpp", "java")
 */
export function extractEditorStateMainWorld(): {
  ok: boolean;
  code?: string;
  languageId?: string;
  editorCount?: number;
  error?: string;
  warning?: string;
  fallbackUsed?: boolean;
} {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const monaco = w.monaco;
    if (!monaco || !monaco.editor) {
      return { ok: false, error: 'EDITOR_NOT_FOUND', editorCount: 0 };
    }

    // Known LeetCode programming languages (used to strongly distinguish code editor from testcase inputs)
    const PROGRAMMING_LANGS = new Set([
      'python', 'python3', 'cpp', 'c', 'java', 'csharp', 'javascript', 'typescript',
      'php', 'swift', 'kotlin', 'dart', 'golang', 'go', 'ruby', 'scala', 'rust',
      'racket', 'erlang', 'elixir', 'mysql', 'mssql', 'oraclesql', 'postgresql', 'pythondata'
    ]);

    // Try getEditors() first (returns IEditor instances)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let editors: any[] = [];
    if (typeof monaco.editor.getEditors === 'function') {
      editors = monaco.editor.getEditors();
    }

    // Filter to editors that have models
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validEditors = editors.filter((ed: any) => {
      if (!ed || typeof ed.getModel !== 'function') return false;
      return !!ed.getModel();
    });

    if (validEditors.length > 0) {
      // Score each editor to find the real main code editor
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scored = validEditors.map((ed: any) => {
        let score = 0;
        const model = ed.getModel();
        const rawLang = (typeof model.getLanguageId === 'function'
          ? model.getLanguageId()
          : typeof model.getModeId === 'function'
            ? model.getModeId()
            : ''
        ).toLowerCase();

        // 1. Language check: Programming language is the single strongest signal
        if (PROGRAMMING_LANGS.has(rawLang)) {
          score += 1000;
        } else if (rawLang === 'plaintext' || rawLang === 'text' || rawLang === 'json') {
          score -= 500;
        }

        // 2. Read-only penalty (the user's solution editor is editable)
        const isReadOnly = (ed.getOption && ed.getOption(monaco.editor.EditorOption?.readOnly) === true)
          || (typeof ed.getRawOptions === 'function' && ed.getRawOptions()?.readOnly === true);
        if (isReadOnly) {
          score -= 800;
        }

        // 3. Physical DOM dimensions: the code editor is large; testcase inputs are small
        const container = ed.getContainerDomNode?.() ?? ed.getDomNode?.();
        if (container) {
          try {
            const rect = container.getBoundingClientRect ? container.getBoundingClientRect() : null;
            if (rect) {
              if (rect.height >= 180 && rect.width >= 200) {
                score += 500;
              } else if (rect.height < 120) {
                score -= 600; // testcase / console input box
              }
              score += Math.min(Math.round((rect.width * rect.height) / 1000), 400);
            }
          } catch {
            // ignore rect error
          }

          // 4. Ancestor checks: testcase, console, custom input
          let el: Element | null = container as Element;
          let depth = 0;
          while (el && depth < 12) {
            const id = (el.id || '').toLowerCase();
            const cls = (el.className || '').toLowerCase();
            const testId = (el.getAttribute?.('data-testid') || '').toLowerCase();
            const layoutPath = (el.getAttribute?.('data-layout-path') || '').toLowerCase();

            if (
              id.includes('testcase') || id.includes('console') || id.includes('custom-input') ||
              cls.includes('testcase') || cls.includes('console') || cls.includes('custom-input') ||
              testId.includes('testcase') || testId.includes('console') ||
              layoutPath.includes('bottom') || layoutPath.includes('console')
            ) {
              score -= 800;
              break;
            }
            el = el.parentElement;
            depth++;
          }
        }

        // 5. Code content patterns
        const val = typeof model.getValue === 'function' ? model.getValue() : '';
        if (/class\s+Solution|var\s+|def\s+|public\s+class|func\s+|int\s+|vector</i.test(val)) {
          score += 300;
        }
        if (val.trim().length > 10) {
          score += 100;
        }

        // 6. Has focus
        if (typeof ed.hasTextFocus === 'function' && ed.hasTextFocus()) {
          score += 150;
        }

        return { editor: ed, model, score, rawLang, val };
      });

      // Sort descending by score
      scored.sort((a, b) => b.score - a.score);

      const best = scored[0];
      if (best && (best.score > 0 || scored.length === 1)) {
        const rawCode: string = best.val || '';
        const code = rawCode.replace(/\r\n/g, '\n').replace(/\n+$/, '\n');
        const languageId = best.rawLang || 'unknown';
        const warning = scored.length > 1 && best.score <= 0
          ? 'Multiple editors found — selected primary editor based on heuristics'
          : undefined;

        return {
          ok: true,
          code,
          languageId,
          editorCount: scored.length,
          warning,
        };
      }
    }

    // Fallback: try all models approach
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let allModels: any[] = [];
    if (typeof monaco.editor.getModels === 'function') {
      allModels = monaco.editor.getModels();
    }

    if (allModels.length === 0) {
      return { ok: false, error: 'EDITOR_NOT_FOUND', editorCount: editors.length };
    }

    // Score models by language and content
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scoredModels = allModels.map((m: any) => {
      let score = 0;
      const lang = (typeof m.getLanguageId === 'function'
        ? m.getLanguageId()
        : typeof m.getModeId === 'function'
          ? m.getModeId()
          : ''
      ).toLowerCase();
      if (PROGRAMMING_LANGS.has(lang)) score += 1000;
      else if (lang === 'plaintext' || lang === 'text' || lang === 'json') score -= 500;

      const val = typeof m.getValue === 'function' ? m.getValue() : '';
      if (/class\s+Solution|var\s+|def\s+|public\s+class|func\s+/i.test(val)) score += 300;
      if (val.trim().length > 10) score += 100;

      return { model: m, score, lang, val };
    });

    scoredModels.sort((a, b) => b.score - a.score);
    const bestModel = scoredModels[0];

    if (bestModel) {
      const code = (bestModel.val || '').replace(/\r\n/g, '\n').replace(/\n+$/, '\n');
      const languageId = bestModel.lang || 'unknown';
      return {
        ok: true,
        code,
        languageId,
        editorCount: allModels.length,
        fallbackUsed: true,
        warning: 'Model API used (no editor DOM context)',
      };
    }

    return { ok: false, error: 'EDITOR_NOT_FOUND', editorCount: editors.length };
  } catch (e) {
    return {
      ok: false,
      error: 'EDITOR_NOT_FOUND',
      warning: String(e),
    };
  }
}

// ---------------------------------------------------------------------------
// Problem content extraction (ISOLATED world is fine since it's DOM only)
// ---------------------------------------------------------------------------

/**
 * Extract the problem content from the LeetCode page DOM.
 * This runs in the ISOLATED world — no access to window.monaco needed.
 * It must be entirely self-contained (no module imports).
 */
export function extractProblemContentIsolatedWorld(): {
  ok: boolean;
  slug?: string;
  title?: string;
  difficulty?: string;
  statementHTML?: string;
  partial?: boolean;
  error?: string;
} {
  try {
    // Extract slug from URL
    const urlMatch = window.location.pathname.match(/\/problems\/([^/]+)\//);
    const slug = urlMatch ? urlMatch[1] : '';

    // Extract title — multiple approaches
    let title: string | undefined;

    // Try: the main heading on the problem page
    const headings = [
      document.querySelector('[data-cy="question-title"]'),
      document.querySelector('.question-title'),
      document.querySelector('div[class*="title"] a[class*="title"]'),
      document.querySelector('.css-v4kbbu'), // LeetCode class (may change)
      document.querySelector('#qd-content h4'),
      document.querySelector('title'),
    ];

    for (const el of headings) {
      if (el && el.textContent?.trim()) {
        title = el.textContent.trim();
        // Strip "- LeetCode" suffix from page title
        title = title.replace(/\s*[-–|]\s*LeetCode.*$/i, '').trim();
        if (title) break;
      }
    }

    // Fallback title from slug
    if (!title && slug) {
      title = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    // Extract difficulty
    let difficulty: string | undefined;
    const diffSelectors = [
      '[diff]',
      '[data-difficulty]',
      'div[class*="difficulty"]',
      '.css-10o4wqw', // may change
    ];
    for (const sel of diffSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent?.trim() ?? '';
        if (/^(easy|medium|hard)$/i.test(text)) {
          difficulty = text;
          break;
        }
      }
    }

    // Extract problem statement HTML
    let statementHTML: string | undefined;
    const statementSelectors = [
      '[data-track-load="description_content"]',
      '.question-content',
      '#question-detail-main-tabs [role="tabpanel"]:first-child',
      '.css-13cdu3a', // may change
    ];

    for (const sel of statementSelectors) {
      const el = document.querySelector(sel);
      if (el && el.innerHTML.trim()) {
        statementHTML = el.innerHTML;
        break;
      }
    }

    const partial = !statementHTML;

    return {
      ok: true,
      slug,
      title,
      difficulty,
      statementHTML: statementHTML ?? '',
      partial,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ---------------------------------------------------------------------------
// Language label mapping: Monaco language ID → display label
// (These are the labels shown in LeetCode's language dropdown)
// ---------------------------------------------------------------------------
export const MONACO_LANG_TO_LABEL: Record<string, string> = {
  python: 'Python',
  python3: 'Python3',
  cpp: 'C++',
  c: 'C',
  java: 'Java',
  csharp: 'C#',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  php: 'PHP',
  swift: 'Swift',
  kotlin: 'Kotlin',
  dart: 'Dart',
  golang: 'Go',
  go: 'Go',
  ruby: 'Ruby',
  scala: 'Scala',
  rust: 'Rust',
  racket: 'Racket',
  erlang: 'Erlang',
  elixir: 'Elixir',
  mysql: 'MySQL',
  mssql: 'MS SQL Server',
  oraclesql: 'Oracle',
  postgresql: 'PostgreSQL',
};

export function getLanguageLabel(monacoId: string): string {
  return MONACO_LANG_TO_LABEL[monacoId.toLowerCase()] ?? monacoId;
}
