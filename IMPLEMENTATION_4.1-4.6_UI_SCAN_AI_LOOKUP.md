# CheckAm — UI refresh, camera scan fix and AI lookup: Implementation Plan

**Status:** BUILT on 2026-11-22 (Phases A to E). Not yet deployed: the API still needs `SERPAPI_API_KEY` set as a FastAPI Cloud secret and a redeploy, and the camera path has not been tried on a real phone.

**What differs from the plan as written**
- Scan reading: the benchmark on real photos showed the plan's "single line, whitelist" recipe was the wrong choice. The shipped reader uses block mode on a cleaned crop, with sparse and raw fallbacks; whole photos use a separate unrestricted reader (`lib/ocr/reader.ts`).
- Scan safety: **every** read, even an exact registry hit, must repeat (two reads) before it is accepted, and a misread is repaired only through look-alike characters. The plan's "one character away" repair was dropped after it matched an unregistered number to a neighbouring registered product.
- Offline reader: the engine files are cached by a service-worker rule (CacheFirst for the Tesseract CDN) rather than bundled in `/public`; offline start-up after one online visit is untested on a device.
- AI cache and limits as planned (migration `0007`, applied to local and Neon). Social-media sources are filtered out of answers.
- Added: `vitest` for unit tests, an opt-in OCR benchmark, a Vibration switch in About, an AI disclosure line in About.
- Not built: the weekly link re-check is a different plan; Q4 (provider-error layout) reuses the Nothing-found layout.
**Written:** 2026-11-22
**Order of work (decided):** **build the UI first** from the Doop frames (Phase A, no backend, fixture data), then fix the camera scan (B), then the AI lookup backend (C) and its wiring (D), then haptics (E).
**Builds on:** `IMPLEMENTATION_2.1-3.5_API_AND_FRONTEND.md` (section 3.5b hands-free OCR was specified but never built), the Docker/Neon deployment, and the image enrichment work.

---

## 0. What is being delivered

| # | Item | Phase |
| :-- | :--- | :-- |
| 1 | Haptic feedback (Android) | E |
| 2 | Badge info bottom sheet (tap a badge on the product card or the result screen) | A |
| 3 | Camera scan that actually reads NAFDAC numbers | B |
| 4 | Skeleton loading frames for Home, Search, Saved, Result | A (verify against existing `Skeleton.tsx`) |
| 5 | Checklist: tick or cross per item, sticky action bar with Save this check and Share on WhatsApp | A (UI) and later wiring |
| 6 | AI lookup for unlisted products (SerpApi Google AI Mode), 5 per user per day, cached, with the disclaimer | A (UI), C and D |
| 7 | Home hero copy and alert arrows | A (partly done) |

---

## 1. Design source: Doop canvas

**Canvas:** https://doop.design/c/PUQwV-eftz ("Check AM", page **Screens**, new frames start at x = 7520).
**Theme key:** `data-doop-theme="basket"`. Tokens and components already match `frontend/src/styles/tokens.css`. Do not introduce new colors, fonts or radii.
**Frame previews:** every frame has a PNG at `https://doop.design/i/<frameId>.png?scale=2`. Open it side by side with the running app at 390 px wide.
A Doop clipboard reference was also supplied (`doop:clipboard:s7v9jT-Ww0wQheqUVAsbH`). This session has no tool to resolve clipboard references, so the frame ids below are the source of truth.

### 1.1 Frames to build against

| Doop frame | Frame id | Preview | Becomes |
| :--- | :--- | :--- | :--- |
| Home (updated hero, alert) | `CsbsuRd3Cp` | https://doop.design/i/CsbsuRd3Cp.png?scale=2 | `HomeScreen.tsx` hero and `AlertBanner.tsx` |
| Home / Loading | `S76rIU_YNS` | https://doop.design/i/S76rIU_YNS.png?scale=2 | Home skeleton grid |
| Search / Loading | `YyhCvdEGjE` | https://doop.design/i/YyhCvdEGjE.png?scale=2 | Search skeleton rows |
| Saved / Loading | `yFdDy5Akg6` | https://doop.design/i/yFdDy5Akg6.png?scale=2 | Saved skeleton rows |
| Result / Loading | `AzNDMCcgHf` | https://doop.design/i/AzNDMCcgHf.png?scale=2 | `ResultScreenSkeleton` |
| Result / Badge info | `FnmeNZRD9l` | https://doop.design/i/FnmeNZRD9l.png?scale=2 | `BadgeInfoSheet` |
| Result / Checklist in progress | `Zl4zRdarnc` | https://doop.design/i/Zl4zRdarnc.png?scale=2 | checklist + `CheckBar` (progress) |
| Result / Checklist all match | `2Ra_L_1FB5` | https://doop.design/i/2Ra_L_1FB5.png?scale=2 | `CheckBar` (match) |
| Result / Checklist mismatch | `ZkT8kPTb9R` | https://doop.design/i/ZkT8kPTb9R.png?scale=2 | `CheckBar` (nomatch) |
| Search / No result + AI | `AyDE4RpVcA` | https://doop.design/i/AyDE4RpVcA.png?scale=2 | Search not-found view + `AiEntryCard` |
| AI lookup / Loading | `8IoH3RcuOP` | https://doop.design/i/8IoH3RcuOP.png?scale=2 | `AiLookupSheet` loading |
| AI lookup / Result | `PCU1vX7u8b` | https://doop.design/i/PCU1vX7u8b.png?scale=2 | `AiLookupSheet` result |
| AI lookup / Nothing found | `jzti5seJii` | https://doop.design/i/jzti5seJii.png?scale=2 | `AiLookupSheet` nothing found |
| AI lookup / Limit reached | `AWh_xAZ80D` | https://doop.design/i/AWh_xAZ80D.png?scale=2 | `AiLookupSheet` limit reached |

### 1.2 Doop components to mirror as React components

| Doop component | React target | Notes |
| :--- | :--- | :--- |
| `AlertBanner` (updated) | `components/AlertBanner.tsx` | Arrow buttons become **28 px ringed circles** (2 px alert-color border, 12% alert fill). The current frontend uses 20 px unringed circles. |
| `ProductCardSkeleton` (tile, row) | `components/Skeleton.tsx` (already exists) | Verify only; shapes already match. |
| `ChecklistRow` (todo, match, nomatch) | new `components/ChecklistRow.tsx` | Two round 36 px buttons on the right, **no dividers between rows**. |
| `CheckBar` (progress, match, nomatch) | new `components/CheckBar.tsx` | Sticky bar; top border ink, ok or alert by state. |
| `BadgeLegendRow` | inside new `components/BadgeInfoSheet.tsx` | Three badges: match, lapsed (covers not found), alert. |
| `AiSparkle`, `AiLoadingLines`, `AiEntryCard` | new `components/ai/` | Sparkle is three pulsing dots (eggplant, green, amber). |
| `Disclaimer` | existing `Disclaimer.tsx` | Add a `text` prop for "AI responses may include mistakes." |

The bottom sheet itself does **not change**: reuse `components/BottomSheet.tsx` (scrim blur, grabber, 28 px top radius).

---

## 2. Phase A: build the UI first (no backend, fixture data)

**Rule:** nothing in B to E starts until A matches the Doop frames. A needs no API change. AI screens run from fixtures behind a dev switch (`?ai=loading|result|nothing|limit` or a `VITE_AI_FIXTURES=1` build flag).

| Step | Task | Files | Done when |
| :-- | :--- | :--- | :--- |
| A1 | Alert arrows: 28 px ringed circles, keep swipe and auto-scroll | `AlertBanner.tsx` | Matches `slxtCChzdK` / Home frame |
| A2 | Home hero copy and subtitle, placeholder "Name or NAFDAC no." | `HomeScreen.tsx`, `styles/animations.css` | **Already done** in this repo; re-check against frame `CsbsuRd3Cp` |
| A3 | Skeletons: confirm Home (tile grid under "All products"), Search (rows under chips), Saved (rows), Result use the existing components; add chips row to the Search skeleton if missing | `Skeleton.tsx`, `SearchScreen.tsx`, `SavedScreen.tsx`, `App.tsx` | Four screens match their Loading frames |
| A4 | `BadgeInfoSheet`: tapping `StatusBadge` on `ProductCard` and on the Result verdict opens it; the tapped status is highlighted ("You tapped this badge") | `StatusBadge.tsx` (optional `onClick`), `ProductCard.tsx`, `ResultScreen.tsx`, new `BadgeInfoSheet.tsx` | Matches `FnmeNZRD9l` |
| A5 | `ChecklistRow`: tick and cross per item, no dividers, three states | new `ChecklistRow.tsx`, `ResultScreen.tsx` | Matches the three Checklist frames |
| A6 | `CheckBar`: derives its state from the rows (`progress` until every item is answered, then `match` if all ticked, else `nomatch`). Buttons: **Save this check** and **Share on WhatsApp** (both final states); progress shows Save only | new `CheckBar.tsx`, `ResultScreen.tsx` | Matches the three Checklist frames; existing Save and Share handlers reused |
| A7 | `AiEntryCard` on the **Not found search view only**, uses the typed query, shows "N lookups left today" | `SearchScreen.tsx`, new `components/ai/AiEntryCard.tsx` | Matches `AyDE4RpVcA` |
| A8 | `AiLookupSheet` with four states (loading, result, nothing found, limit reached), fixture-driven | new `components/ai/AiLookupSheet.tsx` | Matches the four AI frames |
| A9 | Visual QA: screenshot each state at 390×844 in the browser pane, compare to the Doop PNG, fix gaps. Save the screenshots in `docs/ui-qa/` | n/a | Reviewer signs off |

### 2.1 Checklist data model change (A5)

- `ChecklistItemModel.state` moves from `'todo' | 'done' | 'flag'` to `'todo' | 'match' | 'nomatch'`.
- Stored progress (`checklist_progress`, Dexie) keeps its shape; map on read: `done → match`, `flag → nomatch`. No Dexie version bump is needed (only the stored values change meaning), but add a unit test for the mapping.
- Toggle rules: tapping the tick on a ticked item clears it back to `todo`; tapping the cross on a crossed item clears it.
- `CheckBar` copy (neutral, never "fake" or "genuine", per PRD §5.2):
  - progress: "3 of 5 checked", "Finish the list, then decide."
  - all match: "All 5 checks match", "Your pack agrees with the registry record. Still use your own judgment."
  - mismatch: "2 checks don't match", "Hold off on buying or using this until you're sure."

### 2.2 Notes

- `ChecklistItem.tsx` stays for the Not found guidance row ("Check what you typed"); it is not the interactive checklist anymore.
- Old Doop result frames (`Result / Match`, `Not found`, `Alert`) still show the previous checklist; the new frames supersede them.
- The Home category row in Doop still says Toothpaste and Cosmetics; the app says Care and Meds. The app is the source of truth until the design is updated.

---

## 3. Phase B: camera scan fix

### 3.1 Why it fails today (from reading `ScanScreen.tsx`, not yet reproduced on a device)

1. It is **tap to capture**, not the hands-free loop planned in 3.5b.
2. It OCRs the **whole frame** (up to 1920×1080) with page-segmentation mode 6 ("uniform block of text"), which suits paragraphs, not a short code on a busy pack.
3. No crop to the on-screen guide, no grayscale or contrast step, no character whitelist, single attempt.
4. Confusable characters (O/0, I/1, S/5) are never repaired.
5. Tesseract language data downloads from a CDN at runtime, so a first scan offline fails.

### 3.2 Target design

| Stage | Behaviour |
| :--- | :--- |
| Capture | While the screen is open, grab a frame every ~700 ms from the `<video>` (no button) |
| Crop | Centre band matching the reticle (about 80% width × 28% height), downscaled to at most 720 px wide |
| Prepare | Grayscale, percentile contrast stretch, optional adaptive threshold |
| Read | Tesseract.js worker, mode 7 (single line) then 11 (sparse) if empty, whitelist `A-Z 0-9 - / .` |
| Extract | Regex for NAFDAC shapes: 1–2 alphanumerics, hyphen, 3–6 digits, optional letter (examples: `01-4721`, `A4-2260`, `A8-101168L`) |
| Repair | In the numeric part only: O→0, I/L→1, S→5, B→8, Z→2 |
| Constrain | Check against the **local registry** (3,618 numbers in Dexie): exact hit accepts at once; a unique one-character-away hit accepts with a flag; otherwise require two identical reads in a row |
| Show | Recognised number appears in the existing "Got it! …" speech bubble, vibrate (Phase E), then route to `lookupReg()` |
| Aids | Torch toggle and tap-to-focus when `getCapabilities()` allows |
| Fallbacks | "Type it instead" and gallery photo stay; the gallery path runs the same pipeline |

Constraining reads to the local registry is the biggest accuracy win. A number that is not in the registry still works (it becomes the Not found view) after two identical reads.

### 3.3 Work items

| Step | Task | Done when |
| :-- | :--- | :--- |
| B1 | Bench harness: a script runs the pipeline over `frontend/test-fixtures/packs/` (synthetic label renders plus **10–20 real pack photos from you**) and prints read rate and time | Baseline numbers for today's code recorded |
| B2 | Pure modules in `src/lib/ocr/`: crop, prepare, extract, repair, registry constraint, with unit tests | Tests green |
| B3 | Hands-free loop and worker lifecycle in `ScanScreen.tsx`; cancel on unmount; one in-flight OCR at a time | No taps needed |
| B4 | Bundle Tesseract worker, core and `eng` data under `/public/tesseract/`, cache them with a Workbox CacheFirst rule | First scan works offline after one online visit |
| B5 | Torch and focus controls | Works on a device that supports them |
| B6 | Real-device pass on 2–3 phones | See acceptance |

**Acceptance:** on the bench set, at least 85% of clearly visible numbers are read correctly; median time to a result under 2 seconds on a mid-range Android; no network calls during a scan after the assets are cached; a wrong number is never silently accepted (it must hit the registry or repeat twice).

---

## 4. Phase C: AI lookup backend

### 4.1 Provider

SerpApi, engine `google_ai_mode`:
`GET https://serpapi.com/search.json?engine=google_ai_mode&q=<query>&api_key=<SERPAPI_API_KEY>`
Response (verified against the sample you provided): `search_metadata.status` (`Success`, or `Processing` while running), `text_blocks[]` of type `paragraph`, `heading`, `list` (list items may nest), `references[]` (title, link, source, source_icon, thumbnail) and `reconstructed_markdown`.

- Call with a 25 s timeout. If `status` is `Processing`, poll `search_metadata.json_endpoint` once per second for up to 20 s, then give up (treated as a provider error, not counted).
- Verify before relying on them: whether `gl=ng` and `hl=en` are honoured by this engine (would localise to Nigeria), and whether identical queries inside SerpApi's own cache window are free.
- **The key lives only in the backend.** `SERPAPI_API_KEY` goes in the gitignored `.env` locally and as an **encrypted secret** on FastAPI Cloud. It is never sent to the browser and never committed. The key pasted into chat earlier must be **rotated** first.

### 4.2 Query building

- Name query: `What does the genuine {query} packaging sold in Nigeria look like, and what are common signs of counterfeit versions? Focus on NAFDAC-registered products.`
- NAFDAC number query (detected with the existing `looks_like_reg`): `Product with NAFDAC registration number {reg} in Nigeria: what is it and what does its genuine packaging look like?`
- Prompt text is versioned (`prompt_version`) so a wording change invalidates the cache.
- Input checks before any paid call: 3–80 characters, at least one letter or digit, no control characters. Otherwise return 422 and do not count it.

### 4.3 Response normalisation (our schema, never SerpApi's raw JSON)

```json
{
  "query": "Colgate toothpaste",
  "result": "ok",
  "cached": false,
  "generated_at": "2026-11-22T12:47:30Z",
  "blocks": [
    {"type": "heading", "text": "What the genuine pack looks like"},
    {"type": "paragraph", "text": "…"},
    {"type": "list", "items": [{"text": "…", "items": [{"text": "…"}]}]}
  ],
  "sources": [{"title": "…", "source": "Colgate-Palmolive", "url": "https://…", "icon": "https://…"}],
  "usage": {"limit": 5, "remaining": 4, "resets_at": "2026-11-23T00:00:00+01:00"},
  "disclaimer": "AI responses may include mistakes."
}
```

Post-processing rules (the sample answer shows why they matter: it described **US** packaging, a New York distributor, a US phone number and a conversational closing line):
- Drop a final paragraph that talks to the user ("tell me…", "let me know…", "if you have…").
- Drop any block containing a phone number.
- Plain text only: strip markup and HTML; keep links only as source chips (https only).
- Cap at 40 blocks and 4,000 characters.
- `result: "none"` when there are no blocks, or no references and less than ~200 characters of text.
- The app always adds the fixed note "Packaging can differ by country. Check the NAFDAC number on your own pack."

### 4.4 Endpoints

| Method and path | Purpose |
| :--- | :--- |
| `GET /api/v1/ai-lookup/usage` | `{enabled, limit, remaining, resets_at}` for the entry card; consumes nothing |
| `POST /api/v1/ai-lookup` body `{"q": "..."}`, header `X-Device-Id` | The lookup. 200 with the schema above; 422 bad input; 429 `AI_LIMIT_REACHED` with `resets_at`; 503 `AI_UNAVAILABLE` |
| `GET /api/v1/meta` | Gains `ai_lookup_enabled` so the app hides the feature when it is off |

POST, not GET, so a paid call can never be triggered by prefetching or a CDN.

### 4.5 Limits (5 per user per day) and why it is only "per device"

CheckAm has no accounts, so "user" means an anonymous device id (a random UUID created in the browser, sent as `X-Device-Id`, never tied to a person). Clearing site data resets it, so it is a fair-use limit, not a hard one. Layers:

| Scope | Default | Env var |
| :--- | :--- | :--- |
| Per device per day | 5 | `AI_DAILY_LIMIT_PER_DEVICE` |
| Per IP per day (backstop; generous because mobile carriers share IPs) | 60 | `AI_DAILY_LIMIT_PER_IP` |
| Global per day (protects your SerpApi quota and bill) | 100 | `AI_DAILY_LIMIT_GLOBAL` |

- The "day" is the **Africa/Lagos** calendar day, so "left today" matches what people see.
- Reserve-then-refund: increment atomically before the call (`INSERT … ON CONFLICT DO UPDATE … WHERE count < limit RETURNING`), and **refund** if the call fails, times out, or returns `none`.
- **Cache hits are free** and never count. A "nothing found" result is not counted either (as drawn in the Doop frame).
- IPs are stored only as a daily-salted hash.

### 4.6 Cache (so the same query never re-triggers the API)

Table `ai_lookups` (Postgres, **not** memory, because FastAPI Cloud scales to zero):

| Column | Meaning |
| :--- | :--- |
| `query_key` (PK) | Normalised query + `prompt_version` (lowercase, collapse spaces, drop punctuation; NAFDAC numbers normalised with the existing `normalize_reg`) |
| `query_text`, `result` (jsonb), `status` (`ok` or `none`) | Stored answer |
| `created_at`, `expires_at`, `hit_count` | Freshness and use |

TTL: 30 days for `ok`, 7 days for `none`. A per-key in-process lock plus the unique key stops two simultaneous requests from paying twice (Neon free and Nano allow only a small connection pool, so no long DB locks).

### 4.7 Database (migration `0007_ai_lookup`)

- `ai_lookups` as above.
- `ai_usage(scope text, key text, day date, count int, PRIMARY KEY (scope, key, day))` with scope `device`, `ip` or `global`.
- Apply to the local database first, then Neon (direct URL), like migration 0006.

### 4.8 Backend files and tests

`backend/app/routers/ai_lookup.py`, `backend/app/services/serpapi.py` (client, polling, normalisation), `backend/app/services/ai_cache.py`, `backend/app/services/ai_limits.py`, settings for the env vars above, schemas in `schemas.py`.
Tests never call the internet: a recorded fixture from the Colgate sample covers parsing, the post-processing rules, `none`, cache hit, limit reached, refund on failure, and input rejection.

---

## 5. Phase D: wire the frontend to the AI lookup

| Step | Task |
| :-- | :--- |
| D1 | `lib/deviceId.ts` (UUID in localStorage with an IndexedDB copy) and `api.aiLookupUsage()`, `api.aiLookup(q)` in `api/client.ts` |
| D2 | `useAiLookup(query)` state machine: idle, loading, result, none, limit, error, offline |
| D3 | Replace the fixtures in `AiLookupSheet` and `AiEntryCard` with the hook; "Done" closes; "Edit my search" focuses the input; "Scan the label" opens the scanner |
| D4 | Offline: hide the entry card (the lookup needs internet; no frame needed) |
| D5 | Provider error: reuse the Nothing found layout with "The lookup isn't available right now. Try again later." (small design addition, see decisions) |
| D6 | About screen: one line saying the search text is sent to a third-party AI service when you use this feature |
| D7 | Cache the last result locally (Dexie `settings` or a small table) so re-opening the same query is instant and offline-readable |

---

## 6. Phase E: haptics

- `lib/haptics.ts` with feature detection (`'vibrate' in navigator`), a no-op elsewhere, and patterns: scan hit 40 ms; registry match 30 ms; lapsed 2×60 ms; alert 3×50 ms; checklist tick 15 ms, cross 30 ms; save 25 ms.
- Works on Android Chrome, Edge and Firefox (including installed PWAs); **not on iPhone**, where the Vibration API does not exist. Never use vibration as the only feedback.
- Respect a new **Haptics** toggle in About (stored in Dexie `settings`, default on) and `prefers-reduced-motion`. Only fire after a user gesture.

---

## 7. Order of work

| Step | Scope | Size | Checkpoint you will see |
| :-- | :--- | :-- | :--- |
| 1 | **Phase A (UI)**: A1 to A9 | L | Screenshots next to the Doop frames for all 14 frames |
| 2 | B1 bench baseline plus B2 modules | M | Today's read rate, then the new rate on the same set |
| 3 | B3 to B6 scan loop, offline assets, device pass | M | Scanner reads without a tap; offline first scan works |
| 4 | Rotate key, then Phase C backend with fixtures | M | Tests green; one real call with a throwaway query after your go-ahead |
| 5 | Migration 0007 local, then Neon | S | Tables on both |
| 6 | Phase D wiring | M | Real lookup on the Not found screen; limit and cache visible |
| 7 | Phase E haptics | S | Works on an Android phone |

## 8. Definition of done

- Every state in section 1.1 matches its Doop frame at 390 px (screenshots saved).
- Scan meets the section 3.3 acceptance numbers on the bench set and works offline after one visit.
- AI lookup: limit, cache and refund behaviour covered by tests; the SerpApi key exists only in secrets; the disclaimer shows on every AI state; no UI string calls a product fake or genuine.
- `ruff`, `mypy --strict`, backend tests and `tsc` pass; nothing committed without your say-so.

## 9. Risks and limits

1. **AI answers can be wrong or describe another country.** Mitigations: Nigeria-focused prompt, source chips, the always-on country note, the disclaimer, dropping phone numbers and chatty closers. It still cannot be trusted as a verdict.
2. **PRD §5.2 forbids calling a product fake.** The AI sheet lists general "signs of a counterfeit" for a brand, not a judgement of the user's item. This wording was approved in the mockups; it should still get a legal read before public launch.
3. **Per-device limits are bypassable** by clearing site data. The global cap is the real cost protection.
4. **SerpApi cost and quota are unknown to me.** Set `AI_DAILY_LIMIT_GLOBAL` conservatively and check your plan.
5. **Privacy:** the typed query leaves the device for SerpApi and Google. Disclose it (D6).
6. **Scan accuracy depends on real photos.** Without your sample photos, only synthetic tests are possible.
7. **iPhone gets no haptics.**

## 10. Decisions I need from you

| # | Question | My recommendation |
| :-- | :--- | :--- |
| Q1 | Rotate the SerpApi key now (it was pasted in chat)? | Yes, before Phase C |
| Q2 | Your SerpApi plan's monthly search quota? | Needed to set the global cap; I assumed 100 per day |
| Q3 | Global daily cap and per-IP cap values (100 and 60 above)? | Keep as defaults, adjust once you know the quota |
| Q4 | Provider-error state: reuse the Nothing found layout with different copy, or should I add a Doop frame? | Reuse; add a frame only if you want it |
| Q5 | Offline: hide the AI entry card (no new design)? | Yes |
| Q6 | Can you share 10–20 photos of real packs for the scan bench? | Yes, with clear and awkward angles |
| Q7 | Update the old Doop result frames to the new checklist? | Yes, after Phase A passes QA |

## 11. Not covered

Accounts or login, paid AI plans beyond SerpApi, iOS haptics workarounds, barcode scanning (zxing-wasm stays excluded), translating the AI answers, and any change to the registry data pipeline.
