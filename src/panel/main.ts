// ============================================================
// panel/main.ts — Panel entry: connects to background, renders state
// ============================================================
import './styles.css';
import type { Run, RunState, ParsedSections } from '../shared/types';
import { makePanelStart, makePanelCancel, makePanelGetState, makeStateUpdate } from '../shared/messages';
import { getErrorDef } from '../shared/errors';
import { parseStructuredAnalysis } from '../shared/parseAnalysis';
import { setSafeInnerHTML } from './render';
import { CONFIG } from '../shared/config';

const root = document.getElementById('panel-root')!;

// ---- Accessible live region ----
const announce = document.createElement('div');
announce.id = 'a11y-announce';
announce.setAttribute('aria-live', 'polite');
announce.setAttribute('aria-atomic', 'true');
document.body.appendChild(announce);

function announceText(text: string): void {
  announce.textContent = '';
  requestAnimationFrame(() => { announce.textContent = text; });
}

// ---- Background connection ----
let port: chrome.runtime.Port | null = null;
let currentRun: Run | null = null;

function connectToBackground(): void {
  try {
    port = chrome.runtime.connect({ name: 'panel' });
    port.onDisconnect.addListener(() => {
      port = null;
      setTimeout(connectToBackground, 1_000); // reconnect on disconnect
    });
    port.onMessage.addListener((msg: unknown) => {
      if (msg && typeof msg === 'object' && (msg as { type: string }).type === 'STATE_UPDATE') {
        const update = msg as ReturnType<typeof makeStateUpdate>;
        currentRun = update.run;
        renderState(currentRun);
      }
    });
    // Request initial state
    port.postMessage(makePanelGetState());
  } catch (e) {
    console.error('panel: connect failed', e);
    setTimeout(connectToBackground, 2_000);
  }
}

function sendToBackground(msg: unknown): void {
  if (!port) {
    connectToBackground();
  }
  if (port) {
    try {
      port.postMessage(msg);
    } catch (e) {
      console.warn('panel: postMessage failed, reconnecting', e);
      connectToBackground();
      try {
        port?.postMessage(msg);
      } catch {
        // failed
      }
    }
  }
}

// ---- Consent check ----
async function hasConsent(): Promise<boolean> {
  const result = await chrome.storage.local.get('consentVersion');
  return result['consentVersion'] === CONFIG.CONSENT_VERSION;
}

async function setConsent(): Promise<void> {
  await chrome.storage.local.set({ consentVersion: CONFIG.CONSENT_VERSION });
}

// ---- State rendering ----
async function renderState(run: Run | null): Promise<void> {
  // Check consent first
  const consented = await hasConsent();
  if (!consented) {
    renderConsent();
    return;
  }

  if (!run || run.state === 'idle' || run.state === 'cancelled') {
    renderIdle(run);
    return;
  }

  if (['extracting', 'preparing_gemini', 'submitting', 'generating', 'capturing'].includes(run.state as RunState)) {
    renderRunning(run);
    return;
  }

  if (run.state === 'done') {
    renderResult(run);
    return;
  }

  if (run.state === 'error') {
    renderError(run);
    return;
  }

  renderIdle(null);
}

// ---- View: Consent ----
function renderConsent(): void {
  root.innerHTML = '';
  const panel = createPanel();

  const body = panel.querySelector('.panel-body')!;
  body.innerHTML = `
    <div class="consent-view">
      <div>
        <div class="consent-heading">Before you continue</div>
        <div class="text-muted text-small">Please read before using this tool</div>
      </div>
      <ul class="consent-list">
        <li>Your LeetCode problem text and your code will be sent to <strong>Google Gemini</strong> through <strong>your own signed-in Gemini web session</strong>.</li>
        <li>A new chat will appear in your <strong>Gemini history</strong> for each analysis (unless you delete it).</li>
        <li>This tool <strong>automates the Gemini website interface</strong>, not an official API. It may break at any time and may conflict with site terms — use at your own risk.</li>
        <li>This extension has <strong>no server</strong> and collects <strong>no data</strong>. Nothing leaves your browser except what's typed into your Gemini chat.</li>
        <li>This is an <strong>unofficial tool</strong>, not affiliated with LeetCode or Google.</li>
      </ul>
      <div class="consent-buttons">
        <button id="consent-accept" class="btn btn-primary">I understand — continue</button>
        <button id="consent-cancel" class="btn btn-secondary">Cancel</button>
      </div>
    </div>
  `;

  document.getElementById('consent-accept')!.addEventListener('click', async () => {
    await setConsent();
    sendToBackground(makePanelGetState());
    renderState(currentRun);
  });

  document.getElementById('consent-cancel')!.addEventListener('click', () => {
    window.close();
  });

  announceText('Consent required. Please read and accept to continue.');
}

// ---- View: Idle ----
async function renderIdle(run: Run | null): Promise<void> {
  // Check if we're on a LeetCode problem page
  let isOnProblem = false;
  let problemTitle = '';
  let problemLang = '';
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (tab?.url && /leetcode\.com\/problems\//.test(tab.url)) {
      isOnProblem = true;
    }
    if (run?.problem) {
      problemTitle = run.problem.title;
      problemLang = run.language?.label ?? '';
    }
  } catch { /* ignore */ }

  root.innerHTML = '';
  const panel = createPanel();
  const body = panel.querySelector('.panel-body')!;

  body.innerHTML = `
    <div class="idle-view">
      ${isOnProblem && problemTitle ? `
        <div class="problem-chip" id="problem-chip">
          <div class="problem-chip-icon">📝</div>
          <div class="problem-chip-content">
            <div class="problem-chip-title">${esc(problemTitle)}</div>
            ${problemLang ? `<div class="problem-chip-meta">${esc(problemLang)}</div>` : ''}
          </div>
        </div>
      ` : ''}
      ${!isOnProblem ? `
        <div class="idle-placeholder">
          <div class="idle-placeholder-icon">🔍</div>
          <div class="idle-placeholder-text">Open a LeetCode problem page to begin</div>
          <div class="text-muted text-small mt-2">Navigate to leetcode.com/problems/...</div>
        </div>
      ` : ''}
      <button id="analyze-btn" class="btn btn-primary" ${!isOnProblem ? 'disabled' : ''} aria-label="Analyze my code">
        ✨ Analyze Code
      </button>
      ${run?.state === 'cancelled' ? `
        <div class="banner banner-info">ℹ️ Analysis was cancelled.</div>
      ` : ''}
    </div>
  `;

  document.getElementById('analyze-btn')?.addEventListener('click', () => {
    sendToBackground(makePanelStart());
    announceText('Starting analysis…');
  });
}

// ---- View: Running ----
function renderRunning(run: Run): void {
  root.innerHTML = '';
  const panel = createPanel();
  const body = panel.querySelector('.panel-body')!;

  const steps: Array<{ id: RunState; label: string }> = [
    { id: 'extracting', label: 'Reading your code' },
    { id: 'preparing_gemini', label: 'Opening Gemini' },
    { id: 'submitting', label: 'Sending to Gemini' },
    { id: 'generating', label: 'Waiting for Gemini' },
    { id: 'capturing', label: 'Capturing response' },
  ];

  const stateOrder: RunState[] = ['extracting', 'preparing_gemini', 'submitting', 'generating', 'capturing'];
  const currentIdx = stateOrder.indexOf(run.state as RunState);
  const elapsedMs = run.progress?.elapsedMs ?? (Date.now() - run.startedAt);
  const charsReceived = run.progress?.charsReceived ?? 0;
  const showSlowHint = elapsedMs > CONFIG.SLOW_HINT_AFTER_MS;

  const snapshotTimeStr = run.snapshotTime
    ? new Date(run.snapshotTime).toLocaleTimeString()
    : '';

  body.innerHTML = `
    <div class="running-view">
      ${run.problem ? `
        <div class="problem-chip">
          <div class="problem-chip-icon">📝</div>
          <div class="problem-chip-content">
            <div class="problem-chip-title">${esc(run.problem.title)}</div>
            ${run.language ? `<div class="problem-chip-meta">${esc(run.language.label)}</div>` : ''}
          </div>
        </div>
      ` : ''}
      <div class="progress-track" role="progressbar" aria-valuenow="${(currentIdx + 1) * 20}" aria-valuemin="0" aria-valuemax="100">
        <div class="progress-fill" style="width: ${Math.max(15, (currentIdx + 1) * 20)}%"></div>
      </div>
      <div class="step-list">
        ${steps.map((step, i) => {
          const stepIdx = i;
          const isActive = stepIdx === currentIdx;
          const isDone = stepIdx < currentIdx;
          const isPending = stepIdx > currentIdx;
          return `
            <div class="step ${isActive ? 'active' : ''} ${isDone ? 'done' : ''} ${isPending ? 'pending' : ''}">
              <div class="step-icon">
                ${isDone ? '✅' : isActive ? '<div class="spinner" aria-hidden="true"></div>' : '⋯'}
              </div>
              <div class="step-text">${esc(step.label)}</div>
            </div>
          `;
        }).join('')}
      </div>
      <div class="elapsed-row">
        <span id="elapsed-display">Elapsed: ${formatMs(elapsedMs)}</span>
        ${run.state === 'generating' && charsReceived > 0 ? `<span>${charsReceived.toLocaleString()} chars</span>` : ''}
      </div>
      ${showSlowHint ? `<div class="slow-hint">⏳ Gemini is still working… complex solutions take longer.</div>` : ''}
      ${snapshotTimeStr ? `<div class="snapshot-note">Analyzing code as of ${esc(snapshotTimeStr)}</div>` : ''}
      <button id="cancel-btn" class="btn btn-danger">✕ Cancel</button>
    </div>
  `;

  document.getElementById('cancel-btn')?.addEventListener('click', () => {
    sendToBackground(makePanelCancel());
    announceText('Cancelling analysis…');
  });

  // Live elapsed time update
  let elapsed = elapsedMs;
  const timer = setInterval(() => {
    elapsed += 1_000;
    const display = document.getElementById('elapsed-display');
    if (display) {
      display.textContent = `Elapsed: ${formatMs(elapsed)}`;
    } else {
      clearInterval(timer);
    }
  }, 1_000);

  announceText(`Analysis in progress: ${steps[currentIdx]?.label ?? run.state}`);
}

function renderComplexityChartSvg(complexityStr: string): string {
  const norm = complexityStr.toLowerCase();
  let activeCurve = 'O(N)';

  if (norm.includes('2^') || norm.includes('2n') || norm.includes('exp')) {
    activeCurve = 'O(2^N)';
  } else if (norm.includes('n^2') || norm.includes('n²') || norm.includes('n2') || norm.includes('quadratic')) {
    activeCurve = 'O(N^2)';
  } else if (norm.includes('nlogn') || norm.includes('n log n') || norm.includes('n*log')) {
    activeCurve = 'O(N log N)';
  } else if (norm.includes('logn') || norm.includes('log n')) {
    activeCurve = 'O(log N)';
  } else if (norm.includes('o(1)') || norm.includes('constant')) {
    activeCurve = 'O(1)';
  } else {
    activeCurve = 'O(N)';
  }

  const curves = [
    { id: 'O(1)', d: 'M 18 92 L 148 92' },
    { id: 'O(log N)', d: 'M 18 92 Q 65 83, 148 76' },
    { id: 'O(N)', d: 'M 18 92 L 138 20' },
    { id: 'O(N log N)', d: 'M 18 92 Q 68 56, 108 14' },
    { id: 'O(N^2)', d: 'M 18 92 Q 42 66, 60 12' },
    { id: 'O(2^N)', d: 'M 18 92 Q 26 72, 32 10' },
  ];

  return `
    <svg class="complexity-svg" viewBox="0 0 156 106" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="active-curve-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="#ffffff" flood-opacity="0.9"/>
        </filter>
      </defs>
      <!-- Coordinate axes -->
      <line x1="18" y1="94" x2="150" y2="94" stroke="rgba(255, 255, 255, 0.2)" stroke-width="1.2" stroke-linecap="round"/>
      <line x1="18" y1="94" x2="18" y2="10" stroke="rgba(255, 255, 255, 0.2)" stroke-width="1.2" stroke-linecap="round"/>
      
      <!-- Curves -->
      ${curves.map(c => {
        const isActive = c.id === activeCurve;
        return `
          <path
            d="${c.d}"
            class="curve ${isActive ? 'curve-active' : 'curve-inactive'}"
            ${isActive ? 'filter="url(#active-curve-glow)"' : ''}
          />
        `;
      }).join('')}
    </svg>
  `;
}

// ---- View: Result ----
function renderResult(run: Run): void {
  root.innerHTML = '';
  const panel = createPanel();
  const body = panel.querySelector('.panel-body')!;

  const sections = run.sections ?? {};
  const structured = run.structured ?? parseStructuredAnalysis(null, sections);

  const sectionDefs: Array<{ key: keyof ParsedSections; label: string; icon: string }> = [
    { key: 'approach', label: 'Approach', icon: '🧠' },
    { key: 'timeComplexity', label: 'Time Complexity', icon: '⏱️' },
    { key: 'spaceComplexity', label: 'Space Complexity', icon: '💾' },
    { key: 'correctness', label: 'Correctness & Invariants', icon: '✔️' },
    { key: 'edgeCases', label: 'Edge Cases Checked', icon: '⚠️' },
    { key: 'optimizations', label: 'Optimization Suggestions', icon: '🚀' },
  ];

  const snapshotTimeStr = run.snapshotTime ? new Date(run.snapshotTime).toLocaleTimeString() : '';

  const wrapper = document.createElement('div');
  wrapper.className = 'result-view';

  // Banners for warnings
  if (run.formatDeviation && Object.keys(sections).length === 0) {
    const b = createBanner('warning', '⚠️ Analysis response had format deviations. Displaying available findings.');
    wrapper.appendChild(b);
  }
  if (run.extractionPartial) {
    const b = createBanner('info', 'ℹ️ Problem statement was partially extracted.');
    wrapper.appendChild(b);
  }

  // Top quick-action bar: user can analyze again or analyze a different problem without scrolling
  const topActionBar = document.createElement('div');
  topActionBar.className = 'result-top-bar';
  topActionBar.innerHTML = `
    <button id="top-analyze-btn" class="btn btn-primary top-analyze-btn">
      ✨ Analyze Active Code
    </button>
  `;
  topActionBar.querySelector('#top-analyze-btn')?.addEventListener('click', () => {
    const btn = topActionBar.querySelector('#top-analyze-btn') as HTMLButtonElement;
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Analyzing…';
    }
    sendToBackground(makePanelStart());
    announceText('Starting code analysis…');
  });
  wrapper.appendChild(topActionBar);

  // 1. Top status header & motivational banner
  const topHeader = document.createElement('div');
  topHeader.className = 'premium-header-bar';
  topHeader.innerHTML = `
    <div class="status-pills">
      <span class="status-pill status-pill-active">
        <svg class="pill-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        Approach
      </span>
      <span class="status-pill status-pill-active">
        <svg class="pill-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        Efficiency
      </span>
      <span class="status-pill status-pill-active">
        <svg class="pill-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        Code Style
      </span>
    </div>
    <div class="feedback-actions">
      <button class="feedback-btn" id="feedback-up" aria-label="Thumbs up" title="Helpful">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
      </button>
      <button class="feedback-btn" id="feedback-down" aria-label="Thumbs down" title="Not helpful">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"></path></svg>
      </button>
    </div>
  `;

  // Attach feedback event handlers
  const upBtn = topHeader.querySelector('#feedback-up');
  const downBtn = topHeader.querySelector('#feedback-down');
  upBtn?.addEventListener('click', () => {
    upBtn.classList.toggle('active');
    downBtn?.classList.remove('active');
  });
  downBtn?.addEventListener('click', () => {
    downBtn.classList.toggle('active');
    upBtn?.classList.remove('active');
  });

  wrapper.appendChild(topHeader);

  // Motivational headline banner
  const headlineEl = document.createElement('div');
  headlineEl.className = 'motivational-banner';
  headlineEl.textContent = structured.headline;
  wrapper.appendChild(headlineEl);

  // 2. Efficiency Card
  const efficiencyCard = document.createElement('div');
  efficiencyCard.className = 'analysis-card efficiency-card';
  efficiencyCard.innerHTML = `
    <div class="card-header">
      <div class="card-header-title">
        <span class="card-icon card-icon-efficiency">⚡</span>
        <span class="card-title-text">Efficiency</span>
      </div>
    </div>
    <div class="efficiency-body">
      <div class="efficiency-details">
        <div class="metric-row">
          <span class="metric-label">Current complexity:</span>
          <span class="metric-value math-complexity">${esc(structured.currentTimeComplexity)}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Suggested complexity:</span>
          <span class="metric-value math-complexity text-optimal">${esc(structured.suggestedTimeComplexity)}</span>
        </div>
        <div class="metric-row suggestions-row">
          <span class="metric-label">Suggestions:</span>
          <span class="metric-value suggestions-text">
            <strong>${structured.verdict === 'optimal' ? 'Perfect solution.' : 'Suggestions:'}</strong>
            ${esc(structured.efficiencyComment)}
          </span>
        </div>
      </div>
      <div class="efficiency-chart-col">
        <div class="chart-big-badge">${esc(structured.currentTimeComplexity)}</div>
        <div class="complexity-chart-wrapper">
          ${renderComplexityChartSvg(structured.currentTimeComplexity)}
        </div>
      </div>
    </div>
  `;
  wrapper.appendChild(efficiencyCard);

  // 3. Approach Card
  const approachCard = document.createElement('div');
  approachCard.className = 'analysis-card approach-card';
  approachCard.innerHTML = `
    <div class="card-header">
      <div class="card-header-title">
        <span class="card-icon card-icon-approach">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="18" cy="18" r="3"></circle>
            <circle cx="6" cy="6" r="3"></circle>
            <path d="M13 6h3a2 2 0 0 1 2 2v7"></path>
            <line x1="6" y1="9" x2="6" y2="21"></line>
          </svg>
        </span>
        <span class="card-title-text">Approach</span>
      </div>
    </div>
    <div class="card-body-content">
      <div class="metric-row">
        <span class="metric-label">Current:</span>
        <span class="metric-value approach-val">${esc(structured.currentApproach)}</span>
      </div>
      <div class="metric-row">
        <span class="metric-label">Suggested:</span>
        <span class="metric-value approach-val text-optimal">${esc(structured.suggestedApproach)}</span>
      </div>
      <div class="metric-row key-idea-row">
        <span class="metric-label">Key Idea:</span>
        <span class="metric-value key-idea-text">${esc(structured.keyIdea)}</span>
      </div>
    </div>
  `;
  wrapper.appendChild(approachCard);

  // 4. Refinement code snippet card (if an optimization snippet is suggested)
  if (structured.codeSnippet && structured.codeSnippet.code) {
    const snippet = structured.codeSnippet;
    const snippetCard = document.createElement('div');
    snippetCard.className = 'analysis-card snippet-card';
    snippetCard.innerHTML = `
      <div class="card-header">
        <div class="card-header-title">
          <span class="card-icon card-icon-code">💡</span>
          <span class="card-title-text">Refined Implementation</span>
        </div>
        <div class="snippet-actions">
          <span class="lang-badge">${esc(snippet.language)}</span>
          <button class="snippet-copy-btn" id="snippet-copy-btn">Copy</button>
        </div>
      </div>
      <pre class="snippet-code-box"><code>${esc(snippet.code)}</code></pre>
    `;

    const copyCodeBtn = snippetCard.querySelector('#snippet-copy-btn');
    copyCodeBtn?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(snippet.code);
        copyCodeBtn.textContent = 'Copied!';
        setTimeout(() => { copyCodeBtn.textContent = 'Copy'; }, 2000);
      } catch {
        copyCodeBtn.textContent = 'Failed';
      }
    });

    wrapper.appendChild(snippetCard);
  }

  // 5. Deep-Dive Detailed Breakdown (collapsible accordion)
  const hasSections = Object.keys(sections).length > 0;
  if (hasSections || run.resultMarkdown) {
    const deepDiveSection = document.createElement('div');
    deepDiveSection.className = 'deep-dive-section';
    deepDiveSection.innerHTML = `
      <button class="deep-dive-toggle" id="deep-dive-toggle" aria-expanded="false">
        <div class="deep-dive-toggle-left">
          <span class="deep-dive-icon">📖</span>
          <span class="deep-dive-title">Detailed Analysis & Invariants</span>
        </div>
        <span class="deep-dive-chevron">▾</span>
      </button>
      <div class="deep-dive-body" id="deep-dive-body" style="display: none;">
        ${hasSections
          ? sectionDefs.map(({ key, label, icon }) => {
              const content = sections[key];
              if (!content) return '';
              return `
                <div class="deep-dive-item">
                  <div class="deep-dive-item-title">${icon} ${esc(label)}</div>
                  <div class="deep-dive-item-content markdown-body" id="deep-dive-${key}"></div>
                </div>
              `;
            }).join('')
          : '<div class="deep-dive-item-content markdown-body" id="deep-dive-raw"></div>'
        }
      </div>
    `;

    // Populate safe inner HTML for sections
    if (hasSections) {
      sectionDefs.forEach(({ key }) => {
        const el = deepDiveSection.querySelector(`#deep-dive-${key}`);
        if (el && sections[key]) {
          setSafeInnerHTML(el, sections[key]!);
        }
      });
    } else if (run.resultMarkdown) {
      const el = deepDiveSection.querySelector('#deep-dive-raw');
      if (el) {
        setSafeInnerHTML(el, run.resultMarkdown);
      }
    }

    const toggleBtn = deepDiveSection.querySelector('#deep-dive-toggle')!;
    const bodyEl = deepDiveSection.querySelector('#deep-dive-body') as HTMLElement;
    toggleBtn.addEventListener('click', () => {
      const isHidden = bodyEl.style.display === 'none';
      bodyEl.style.display = isHidden ? 'block' : 'none';
      toggleBtn.classList.toggle('expanded', isHidden);
      toggleBtn.setAttribute('aria-expanded', String(isHidden));
    });

    wrapper.appendChild(deepDiveSection);
  }

  // 6. Action buttons (Copy full analysis & Re-analyze)
  const actions = document.createElement('div');
  actions.className = 'result-actions';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn btn-secondary';
  copyBtn.id = 'copy-analysis-btn';
  copyBtn.innerHTML = '📋 Copy full report';
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(run.resultMarkdown ?? '');
      copyBtn.textContent = '✅ Copied!';
      setTimeout(() => { copyBtn.innerHTML = '📋 Copy full report'; }, 2_000);
    } catch {
      copyBtn.textContent = '❌ Copy failed';
    }
  });
  actions.appendChild(copyBtn);

  const retryBtn = document.createElement('button');
  retryBtn.className = 'btn btn-secondary';
  retryBtn.id = 're-analyze-btn';
  retryBtn.innerHTML = '🔄 Re-analyze';
  retryBtn.addEventListener('click', () => {
    retryBtn.disabled = true;
    retryBtn.innerHTML = '🔄 Re-analyzing…';
    sendToBackground(makePanelStart());
    announceText('Starting new analysis…');
  });
  actions.appendChild(retryBtn);

  wrapper.appendChild(actions);

  if (snapshotTimeStr) {
    const note = document.createElement('div');
    note.className = 'snapshot-note';
    note.textContent = `Analyzed code as of ${snapshotTimeStr}`;
    wrapper.appendChild(note);
  }

  const disclaimer = document.createElement('div');
  disclaimer.className = 'snapshot-note';
  disclaimer.textContent = 'AI algorithms tutor — verify before submitting in contests.';
  wrapper.appendChild(disclaimer);

  body.appendChild(wrapper);
  announceText('Analysis complete.');
}

// ---- View: Error ----
function renderError(run: Run): void {
  root.innerHTML = '';
  const panel = createPanel();
  const body = panel.querySelector('.panel-body')!;

  const errDef = run.error ? getErrorDef(run.error.code) : null;

  const wrapper = document.createElement('div');
  wrapper.className = 'error-view';

  const card = document.createElement('div');
  card.className = 'error-card';

  const title = document.createElement('div');
  title.className = 'error-title';
  title.innerHTML = `❌ ${esc(errDef?.title ?? 'Error')}`;
  card.appendChild(title);

  const body2 = document.createElement('div');
  body2.className = 'error-body';
  body2.textContent = errDef?.body ?? run.error?.message ?? 'An unexpected error occurred.';
  card.appendChild(body2);

  wrapper.appendChild(card);

  const actions = document.createElement('div');
  actions.className = 'error-actions';

  if (errDef?.retryable) {
    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn btn-primary';
    retryBtn.id = 'retry-btn';
    retryBtn.innerHTML = '🔄 Retry';
    retryBtn.style.width = 'auto';
    retryBtn.style.padding = '9px 18px';
    retryBtn.addEventListener('click', () => {
      retryBtn.disabled = true;
      retryBtn.innerHTML = '🔄 Retrying…';
      sendToBackground(makePanelStart());
      announceText('Retrying analysis…');
    });
    actions.appendChild(retryBtn);
  }

  if (run.error?.code === 'GEMINI_NOT_SIGNED_IN') {
    const signInBtn = document.createElement('button');
    signInBtn.className = 'btn btn-secondary';
    signInBtn.id = 'open-gemini-signin-btn';
    signInBtn.innerHTML = '🔐 Open Gemini to sign in';
    signInBtn.addEventListener('click', () => {
      sendToBackground({ type: 'PANEL_OPEN_GEMINI_SIGNIN' });
    });
    actions.appendChild(signInBtn);
  }

  const diagBtn = document.createElement('button');
  diagBtn.className = 'btn btn-icon';
  diagBtn.id = 'copy-diagnostics-btn';
  diagBtn.innerHTML = '🔬 Copy diagnostics';
  diagBtn.addEventListener('click', async () => {
    const diag = {
      errorCode: run.error?.code,
      errorMessage: run.error?.message,
      diagnostics: run.error?.diagnostics,
      runId: run.id,
      runState: run.state,
      extensionVersion: chrome.runtime.getManifest().version,
      problemSlug: run.problem?.slug,
      language: run.language?.id,
      codeLength: run.codeLength,
      elapsedMs: run.progress?.elapsedMs,
      // NOTE: Code, statement, and prompt are deliberately excluded
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(diag, null, 2));
      diagBtn.textContent = '✅ Copied';
      setTimeout(() => { diagBtn.innerHTML = '🔬 Copy diagnostics'; }, 2_000);
    } catch {
      diagBtn.textContent = '❌ Failed';
    }
  });
  actions.appendChild(diagBtn);

  wrapper.appendChild(actions);

  const newBtn = document.createElement('button');
  newBtn.className = 'btn btn-secondary w-full';
  newBtn.id = 'new-analyze-btn';
  newBtn.innerHTML = '✨ Analyze again';
  newBtn.addEventListener('click', () => {
    sendToBackground(makePanelStart());
  });
  wrapper.appendChild(newBtn);

  body.appendChild(wrapper);
  announceText(`Error: ${errDef?.title ?? 'Analysis failed'}`);
}

// ---- Helpers ----
function createPanel(): Element {
  root.innerHTML = `
    <div class="panel">
      <header class="panel-header">
        <div class="panel-logo">
          <div class="panel-logo-icon" aria-hidden="true">✦</div>
          <div>
            <div class="panel-title">NoLeet</div>
            <div class="panel-subtitle">Free AI code analysis</div>
          </div>
        </div>
        <button id="header-analyze-btn" class="header-analyze-btn" title="Analyze Code (Alt + A)">
          ⚡ Analyze
        </button>
      </header>
      <main class="panel-body" id="panel-body" role="main" aria-label="Analysis panel"></main>
      <footer class="panel-footer">
        <div class="footer-note">NoLeet · Free LeetCode analysis · No API keys, no tab switching</div>
      </footer>
    </div>
  `;

  const headerBtn = root.querySelector('#header-analyze-btn') as HTMLButtonElement;
  headerBtn?.addEventListener('click', () => {
    headerBtn.disabled = true;
    headerBtn.textContent = '⏳ Analyzing…';
    sendToBackground(makePanelStart());
    announceText('Starting code analysis…');
  });

  return root.querySelector('.panel')!;
}

function createBanner(type: 'warning' | 'info', html: string): HTMLElement {
  const el = document.createElement('div');
  el.className = `banner banner-${type}`;
  el.innerHTML = html;
  return el;
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1_000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---- Initialization ----
connectToBackground();
renderState(null); // Show loading/idle immediately
