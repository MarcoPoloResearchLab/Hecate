# ISSUES

Entries record newly discovered requests or changes.

Read @AGENTS.md (Workflow section), @POLICY.md, and relevant stack guides before implementing changes.

Format: `- [ ] [B042] (P1) {I007} Title`

- `[ ]` open, `[!]` blocked, `[x]` closed.
- Blocked issues (`[!]`) must include a `Blocked:` line in the body.

## BugFixes

- [ ] [B001] (P1) Add server-side crossword layout validation before charging for generation.
  Generated word sets are still trusted after the LLM call, but the browser renderer can reject a saved puzzle when `generateCrossword()` cannot build a valid layout from those words. Add backend-side layout validation, or an equivalent refund path, before generation succeeds.
- [ ] [B002] (P1) Validate generated puzzle words without silently deleting letters.
  The current LLM parser deletes non-ASCII letters before saving words, so an answer like `façade` can become `FAADE`; the browser crossword and word-search generators repeat the same deletion when building layouts from specs. Add edge validation that rejects mutated spellings or applies an explicit approved transliteration before charging, saving, or rendering generated puzzles, with black-box coverage for accented and punctuation-bearing words.
- [ ] [B003] (P0) Word search grid does not respond to touchscreen input in Chrome; investigate and enable touch interaction support.
  Context:
  Users report that the word search feature does not respond to touchscreen interactions when using Google Chrome (likely on touch-enabled devices such as tablets, 2-in-1 laptops, or touchscreen monitors). Tapping, dragging, or attempting to select words via touch does not behave as expected, while mouse/trackpad interaction presumably works.
  
  This issue may relate to differences between mouse, pointer, and touch events in Chrome, handling of passive event listeners, or CSS/DOM setup that interferes with touch input (e.g., touch-action, pointer-events, or default scrolling behavior). We need to understand what is special about using touchscreens with our current implementation and then adapt the word search interaction model to support touch reliably.
  
  Acceptance criteria:
  - On a Chrome browser running on a touch-enabled device, a user can:
    - Start selecting a word in the word search grid by touching the first letter.
    - Drag (or continue touching) across adjacent letters to extend the selection.
    - Complete the selection via touch, and, if the selection is a valid word according to the puzzle, it is recognized as such (e.g., highlighted/marked as found in the same way as with mouse input).
  - Touch interactions do not break or degrade mouse/trackpad interaction; both input methods work correctly on devices that support them.
  - Touch gestures do not unintentionally cause the page to scroll or zoom in a way that prevents normal word selection (within reasonable browser constraints).
  - The solution works in current stable Chrome on at least one verified touch device (e.g., a Chromebook or Windows laptop with touchscreen), with test steps documented.
  - Relevant event handling logic (e.g., pointer/mouse/touch events) is documented at a high level in comments or brief developer notes so future changes can maintain compatibility with touch.
  
  Known open questions:
  - Which specific Chrome + device combinations are affected (Android tablets, Chromebooks, Windows touchscreen laptops, etc.)? Is the bug reproducible across multiple environments?
  - Is this issue limited to Chrome, or does it also appear in other browsers with touch support (Safari iOS, Edge, mobile Firefox)?
  - How is input currently handled in the word search grid (pure mouse events, pointer events, or a mix), and is there any existing touch support that is partially working?
  - Are there any CSS or layout constraints (e.g., overlays, z-index, touch-action, pointer-events) that may be blocking or intercepting touch input on the grid?
  - Do we need to support additional touch gestures (e.g., tap-tap vs. drag) for accessibility or for users who cannot easily drag on touchscreens?


## Improvements

## Maintenance

- [ ] [M001] (P0) Analyze codebase against AGENTS.FRONTEND.md and POLICY.md; produce prioritized refactoring plan.
  ### Summary
  Review the existing frontend implementation in `/projects/tenants/1078274/MarcoPoloResearchLab/llm_crossword` and identify gaps against `AGENTS.FRONTEND.md` guidance and `POLICY.md`. Produce a concrete, prioritized refactoring plan that improves maintainability, correctness, and compliance without changing product scope.
  
  ### Analysis
  This project is a browser-based JavaScript game with strict architectural and coding standards (CDN-only dependencies, ES modules, separation of `core/` and `ui/`, constants centralization, typed JSDoc with `// @ts-check`, browser-based tests, and CSP-safe patterns). The analysis should evaluate the current code against these expectations and policy requirements, including:
  
  - Structure and module boundaries (`index.html`, `js/constants.js`, `js/core/*`, `js/ui/*`, `js/app.js`, `data/*.json`, `assets/*`, `tests/*`).
  - Compliance with naming, dead-code removal, duplication control, enum/constants usage, and error/logging patterns.
  - UX and runtime behavior requirements for the allergy wheel flow (selection screen, spin/stop/restart lifecycle, timed deceleration, modal ingredient reveal, conditional audio/visual outcomes, fullscreen/mute controls, and allergy-aware dish filtering).
  - Data validation approach at boot and consistency between dish/allergen catalogs and game logic.
  - Test coverage quality (public API/DOM black-box tests, table-driven cases, assertion helpers).
  - Policy and security concerns (no inline handlers, no `eval`, CDN-only external deps, gateway boundaries for external calls).
  
  Output should distinguish:
  
  - Confirmed compliant areas.
  - Non-compliant or risky areas.
  - Ambiguities requiring clarification.
  - Refactors that are blocking vs. non-blocking.
  
  ### Deliverables
  1. A gap-analysis report mapping each relevant `AGENTS.FRONTEND.md` and `POLICY.md` requirement to current state: `Compliant`, `Partially Compliant`, or `Non-Compliant`, with file-level evidence.
  2. A prioritized refactoring plan (P0/P1/P2) with task descriptions, rationale, dependencies, and estimated effort per task.
  3. A risk register for behavior regressions (game flow, timing/animation, audio controls, fullscreen behavior, modal rendering, and data-loading paths) and proposed mitigations.
  4. A test plan defining which browser tests must be added or updated, including explicit acceptance tests for the allergy outcome logic and spin lifecycle.
  5. A definition of done for the refactor phase.
  
  Acceptance criteria:
  
  - Every recommendation is traceable to a specific requirement in `AGENTS.FRONTEND.md` or `POLICY.md`.
  - Each finding references concrete code locations (file paths and relevant symbols).
  - Plan is implementation-ready: ordered tasks, clear owners/sequence assumptions, and measurable completion criteria.
  - No scope creep beyond policy compliance, architecture alignment, and maintainability improvements.


## Features

## Planning
*do not implement yet*

