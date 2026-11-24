import React from 'react';
import { FAILURE_LABELS, ScanDiagnostics, classifyFailures } from '../../lib/ocr/diagnostics';

/** Small overlay shown on the Scan screen when the URL has ?scandebug=1. */
export const ScanDebugPanel: React.FC<{ diagnostics: ScanDiagnostics }> = ({ diagnostics: d }) => {
  const failures = classifyFailures(d);
  const size = (s: { width: number; height: number } | null) => (s ? `${s.width}x${s.height}` : '-');
  const rows: [string, string][] = [
    ['engine', d.engine + (d.engineError ? ` (${d.engineError})` : '')],
    ['camera', size(d.camera)],
    ['frame to OCR', size(d.frame)],
    ['last text', d.lastText.replace(/\s+/g, ' ').trim().slice(0, 80) || '-'],
    ['candidates', d.candidates.join(', ') || '-'],
    ['registry match', d.matched ?? '-'],
    ['ms per read', d.lastReadMs === null ? '-' : String(Math.round(d.lastReadMs))],
    ['reads', `${d.reads}${d.skippedBlurry ? ` (+${d.skippedBlurry} blurry skipped)` : ''}${d.usedEnhanced ? ' enhanced' : ''}`],
  ];
  return (
    <div
      data-testid="scan-debug"
      className="mx-4 mt-2 rounded-lg bg-black/80 p-2 font-mono text-[10px] leading-snug text-white"
    >
      {rows.map(([k, v]) => (
        <div key={k}>
          <span className="opacity-60">{k}: </span>
          {v}
        </div>
      ))}
      {failures.map((f) => (
        <div key={f} data-failure={f} className="mt-1 font-bold text-amber-300">
          ! {FAILURE_LABELS[f]}
        </div>
      ))}
    </div>
  );
};
