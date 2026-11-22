import { db } from '../db';

/**
 * Short vibration cues. Works where the Vibration API exists (Chrome, Edge and Firefox on
 * Android, including installed PWAs). iPhone has no such API, so these calls quietly do nothing
 * there; vibration is never the only feedback for anything.
 * Respects the Haptics switch in About and the system "reduce motion" preference.
 */
export type HapticEvent =
  | 'scanHit'
  | 'match'
  | 'lapsed'
  | 'alert'
  | 'tick'
  | 'cross'
  | 'save'
  | 'aiDone';

export const HAPTIC_PATTERNS: Record<HapticEvent, number | number[]> = {
  scanHit: 40,
  match: 30,
  lapsed: [60, 60, 60],
  alert: [50, 50, 50, 50, 50],
  tick: 15,
  cross: 30,
  save: 25,
  aiDone: 20,
};

export const HAPTICS_SETTING_KEY = 'haptics';

let enabled = true;

export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

export function isHapticsEnabled(): boolean {
  return enabled;
}

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

/** Persist the switch (Dexie settings) and apply it. */
export async function saveHapticsEnabled(value: boolean): Promise<void> {
  setHapticsEnabled(value);
  try {
    await db.settings.put({ key: HAPTICS_SETTING_KEY, value });
  } catch {
    // The switch still works for this session if storage is unavailable.
  }
}

/** Load the saved switch at startup. Defaults to on. */
export async function initHaptics(): Promise<void> {
  try {
    const row = await db.settings.get(HAPTICS_SETTING_KEY);
    if (row && typeof row.value === 'boolean') enabled = row.value;
  } catch {
    // keep the default
  }
}

/** Vibrate for an event. Call only from a user gesture or its direct result. */
export function haptic(event: HapticEvent): void {
  if (!enabled || !canVibrate() || prefersReducedMotion()) return;
  try {
    navigator.vibrate(HAPTIC_PATTERNS[event]);
  } catch {
    // some browsers throw if called without recent user activity; that is fine
  }
}
