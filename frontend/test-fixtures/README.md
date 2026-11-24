# Scanner test fixtures and manual phone test sheet

`packs/` holds photos used by the OCR benchmark (`OCR_BENCH=1 npx vitest run src/lib/ocr/bench.test.ts`).
Automated tests (`npm test`) cover the logic only. A real camera cannot be tested in CI, so run this
sheet on a phone before shipping scanner changes.

## Setup
- Open the app over https (or localhost). Plain http hides the camera and the Scan screen says so.
- Add `?scandebug=1` to the Scan URL to see the diagnostics panel (engine state, camera resolution,
  frame size sent to OCR, last text, candidates, registry match, ms per read, reads). The same
  fields log as `console.info('[scan]', ...)` for remote devtools.
- Online runs: first scan after install also downloads the English data once. Offline runs: switch
  on airplane mode after one online scan, then reload and scan again.

## Pass criteria per pack
- Exact registry match: continues to the result by itself after two reads, labelled as a match.
- Not in the registry or one character off: the "Got it!" bubble appears with the number filled
  in. Fix a character if needed and tap Check. Nothing opens until you tap Check.
- A non-match is never labelled "Registry match".

## Sheet (fill one row per pack)

| # | Pack (name, NAFDAC no.) | Surface (flat / curved) | Light (good / poor) | Network (online / offline) | Camera res (from panel) | Time to result (s) | Result (auto / bubble / nothing) | Failure class shown | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 |  | flat | good | online |  |  |  |  |  |
| 2 |  | flat | good | offline |  |  |  |  |  |
| 3 |  | flat | poor | online |  |  |  |  |  |
| 4 |  | flat | poor | offline |  |  |  |  |  |
| 5 |  | curved | good | online |  |  |  |  |  |
| 6 |  | curved | good | offline |  |  |  |  |  |
| 7 |  | curved | poor | online |  |  |  |  |  |
| 8 |  | curved | poor | offline |  |  |  |  |  |
| 9 |  | glossy | good | online |  |  |  |  |  |
| 10 |  | small print | good | online |  |  |  |  |  |

Also check once: torch button appears on a phone that supports it, and the photo upload path still
reads a whole-pack photo.
