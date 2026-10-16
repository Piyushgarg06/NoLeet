// ============================================================
// background/state.ts — chrome.storage.session persistence
// ============================================================
import type { Run } from '../shared/types';
import { CONFIG } from '../shared/config';

export async function persistRun(run: Run | null): Promise<void> {
  await chrome.storage.session.set({ [CONFIG.STORAGE_SESSION_RUN_KEY]: run });
}

export async function loadRun(): Promise<Run | null> {
  const result = await chrome.storage.session.get(CONFIG.STORAGE_SESSION_RUN_KEY);
  return (result[CONFIG.STORAGE_SESSION_RUN_KEY] as Run | undefined) ?? null;
}

export async function clearRun(): Promise<void> {
  await chrome.storage.session.remove(CONFIG.STORAGE_SESSION_RUN_KEY);
}

export async function hasConsent(): Promise<boolean> {
  const result = await chrome.storage.local.get(CONFIG.STORAGE_LOCAL_CONSENT_KEY);
  const version = result[CONFIG.STORAGE_LOCAL_CONSENT_KEY] as number | undefined;
  return version === CONFIG.CONSENT_VERSION;
}

export async function setConsent(): Promise<void> {
  await chrome.storage.local.set({ [CONFIG.STORAGE_LOCAL_CONSENT_KEY]: CONFIG.CONSENT_VERSION });
}

export async function revokeConsent(): Promise<void> {
  await chrome.storage.local.remove(CONFIG.STORAGE_LOCAL_CONSENT_KEY);
}

export interface Settings {
  closeGeminiTabAfterAnalysis?: boolean;
}

export async function loadSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(CONFIG.STORAGE_LOCAL_SETTINGS_KEY);
  return (result[CONFIG.STORAGE_LOCAL_SETTINGS_KEY] as Settings | undefined) ?? {};
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [CONFIG.STORAGE_LOCAL_SETTINGS_KEY]: settings });
}
