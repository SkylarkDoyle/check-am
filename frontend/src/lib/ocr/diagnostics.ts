export type EngineState = 'idle' | 'loading' | 'ready' | 'error';

export type FailureClass =
  | 'engine-failed'
  | 'low-res-camera'
  | 'no-candidate'
  | 'no-registry-match';

export interface ScanDiagnostics {
  engine: EngineState;
  engineError: string | null;
  camera: { width: number; height: number } | null;
  /** Size of the crop handed to the reader on the last read. */
  frame: { width: number; height: number } | null;
  lastText: string;
  candidates: string[];
  matched: string | null;
  lastReadMs: number | null;
  reads: number;
  skippedBlurry: number;
  usedEnhanced: boolean;
  confidence: number | null;
}

export const EMPTY_DIAGNOSTICS: ScanDiagnostics = {
  engine: 'idle',
  engineError: null,
  camera: null,
  frame: null,
  lastText: '',
  candidates: [],
  matched: null,
  lastReadMs: null,
  reads: 0,
  skippedBlurry: 0,
  usedEnhanced: false,
  confidence: null,
};

/** Below this long side (px) the camera is too coarse for small print. */
export const LOW_RES_LONG_SIDE = 1280;
/** Reads without any candidate before "no candidate" is reported, so the first frames stay quiet. */
export const NO_CANDIDATE_AFTER_READS = 3;

export function classifyFailures(d: ScanDiagnostics): FailureClass[] {
  const out: FailureClass[] = [];
  if (d.engine === 'error') out.push('engine-failed');
  if (d.camera && Math.max(d.camera.width, d.camera.height) < LOW_RES_LONG_SIDE) out.push('low-res-camera');
  if (d.reads > 0) {
    if (d.candidates.length === 0) {
      if (d.reads >= NO_CANDIDATE_AFTER_READS) out.push('no-candidate');
    } else if (!d.matched) {
      out.push('no-registry-match');
    }
  }
  return out;
}

export const FAILURE_LABELS: Record<FailureClass, string> = {
  'engine-failed': 'Reader failed to load (offline, blocked, or files missing)',
  'low-res-camera': 'Camera opened at low resolution',
  'no-candidate': 'Text read but no NAFDAC-shaped number (number may be outside the box, blurry, or glare)',
  'no-registry-match': 'Number found but it is not in this phone’s registry',
};

export function isScanDebug(search: string = typeof window !== 'undefined' ? window.location.search : ''): boolean {
  try {
    return new URLSearchParams(search).get('scandebug') === '1';
  } catch {
    return false;
  }
}

/** One console line per read, for remote devtools on a phone. */
export function logScan(event: string, d: ScanDiagnostics): void {
  console.info('[scan]', event, {
    engine: d.engine,
    engineError: d.engineError,
    camera: d.camera ? `${d.camera.width}x${d.camera.height}` : null,
    frame: d.frame ? `${d.frame.width}x${d.frame.height}` : null,
    text: d.lastText.replace(/\s+/g, ' ').trim().slice(0, 120),
    candidates: d.candidates,
    matched: d.matched,
    ms: d.lastReadMs,
    reads: d.reads,
    blurrySkipped: d.skippedBlurry,
    enhanced: d.usedEnhanced,
    failures: classifyFailures(d),
  });
}
