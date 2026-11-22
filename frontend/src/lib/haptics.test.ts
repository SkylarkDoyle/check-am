import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The module imports the Dexie database, which needs IndexedDB; stub it for these pure tests.
vi.mock('../db', () => ({ db: { settings: { put: vi.fn(), get: vi.fn() } } }));

import { HAPTIC_PATTERNS, canVibrate, haptic, setHapticsEnabled } from './haptics';

describe('haptics', () => {
  const vibrate = vi.fn();

  beforeEach(() => {
    vibrate.mockReset();
    setHapticsEnabled(true);
    vi.stubGlobal('navigator', { vibrate });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('vibrates with the pattern for the event', () => {
    haptic('lapsed');
    expect(vibrate).toHaveBeenCalledWith(HAPTIC_PATTERNS.lapsed);
    haptic('scanHit');
    expect(vibrate).toHaveBeenLastCalledWith(40);
  });

  it('stays silent when the switch is off', () => {
    setHapticsEnabled(false);
    haptic('tick');
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('stays silent when the system asks for reduced motion', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    haptic('tick');
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('does nothing and does not throw where vibration is unsupported (iPhone)', () => {
    vi.stubGlobal('navigator', {});
    expect(canVibrate()).toBe(false);
    expect(() => haptic('match')).not.toThrow();
  });

  it('swallows errors from a browser that refuses to vibrate', () => {
    vibrate.mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => haptic('save')).not.toThrow();
  });
});
