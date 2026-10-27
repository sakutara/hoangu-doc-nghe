---
name: sdd-tdd-pwa-webapp
description: >-
  Use this skill when building, designing, or modifying a Bilingual (English/Vietnamese)
  Offline-First PWA SPA webapp following the SDD (Specification-Driven Development) and
  TDD (Test-Driven Development) SDLC workflow: Epic (named by date: "epic <YYYY-MM-DD>") ->
  Business Requirement (BR) -> Solution Architect (SA + ADR) -> Test (>= 90% coverage) -> Code,
  where every code change is reflected in documents/, same-day fixes update the same day's epic,
  different-day enhancements or new features create a new date-named epic referencing the prior epic,
  BR-MASTER.md always reflects the latest code state with per-feature epic links, fluid mobile-first UI
  (<= 1280px, icon buttons, 1-screen priority, zoom disabled, bottom horizontal tabs with swipe, non-selectable text),
  skill copied into documents/skills/sdd-tdd-pwa-webapp/, and an after-merge Git hook building prod into docs/.
---

# Bilingual Offline-First PWA SPA — SDD & TDD SDLC Skill

This skill enforces a rigorous **Specification-Driven Development (SDD)** and **Test-Driven Development (TDD)** Software Development Life Cycle (SDLC) for building and evolving **Bilingual (English / Vietnamese) Offline-First Progressive Web App (PWA) Single Page Applications (SPA)** with a native-like, minimalist mobile-first UI.

---

## 1. Core Architectural, UI/UX & Governance Principles

1. **PWA SPA & 100% Offline-First**:
   - The application MUST be a Single Page Application (SPA) with a valid Web App Manifest (`manifest.webmanifest`) and a Service Worker (`vite-plugin-pwa` with `injectManifest` or `generateSW`) that precaches all static assets (HTML, JS, CSS, fonts, static data).
   - Use hash-based routing (`HashRouter` / `#/...`) and relative `base: './'` so the app runs seamlessly offline and on static hosts (e.g., GitHub Pages serving from `docs/`) without `404` reload errors.
   - Persist all user data, language preferences, state, and large assets locally in the browser (`IndexedDB`, `OPFS - Origin Private File System`, `LocalStorage`, and `Cache Storage`).

2. **Native-Like Minimalist UI/UX & Interaction Rules**:
   - **Fluid Mobile-First Responsive (Up to `1280px` Desktop)**:
     - Design mobile-first using fluid layouts (`w-full max-w-[1280px] mx-auto`) that fit compactly on phones while scaling cleanly up to `1280px` on desktop screens.
   - **Minimalist, Icon-First & Single-Screen Priority (`100dvh`)**:
     - Keep the interface clean and self-explanatory with **no verbose instructional text or filler paragraphs**.
     - **Replace text buttons with icon buttons** (`lucide-react` icons paired with `aria-label` / `title` for accessibility and testability) wherever possible.
     - Prioritize fitting each tab's content within **a single mobile screen height (`h-dvh` / `100dvh`)** without vertical scrolling whenever feasible.
   - **Disable Zooming Completely**:
     - Configure `index.html` viewport meta tag with:
       `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover" />`
     - Apply `touch-action: manipulation;` in global CSS and prevent pinch-zoom so the PWA behaves like a locked native app.
   - **Bottom Horizontal Tab Bar & Swipe-Between-Tabs Gesture**:
     - Structure primary navigation as **horizontal tabs** with the **tab index bar docked at the bottom of the app**.
     - Support **horizontal swipe gestures (`left` / `right`) on blank/non-interactive areas of a tab** to switch to the adjacent tab (`next` / `previous`), while ignoring swipe gestures started on interactive controls (`input`, `textarea`, `button`, `[data-no-swipe]`).
   - **Non-Selectable Text by Default**:
     - Apply `user-select: none; -webkit-user-select: none;` globally across the entire app (`html, body, #root`).
     - Only allow text selection (`user-select: text; -webkit-user-select: text;`) on **editable items or explicit copyable CTAs** (`input`, `textarea`, `[contenteditable="true"]`, `[data-selectable="true"]`).

3. **Mandatory Bilingual Support (English `en` & Vietnamese `vi`)**:
   - Every UI screen, `aria-label` / tooltip on icon buttons, compact status badge, notification, and user-facing message MUST support **both English (`en`) and Vietnamese (`vi`)**.
   - Provide a pure i18n domain module (`src/domains/i18n/`) with strongly-typed translation keys and a compact icon/badge language toggle (`EN`/`VI`) in the App Shell persisted offline.
   - Automated tests MUST verify both `en` and `vi` rendering and language switching.

4. **100% Documentation Traceability (`Every Change Reflected in documents/`)**:
   - **Every single change** to the application (new feature, enhancement, UI tweak, bug fix, or architectural adjustment) MUST be reflected in `documents/` before or alongside the code change. Never modify `src/` without updating the corresponding documents in `documents/`.
   - Strict SDLC order: `Epic (<ngày>) -> BR -> SA (+ ADR) -> Test (>= 90% coverage) -> Code`.

5. **Date-Based Epic Naming (`epic <ngày>`) & Same-Day vs. Different-Day Evolution Rules**:
   - **Naming Convention (`epic <YYYY-MM-DD>`)**:
     - Epics MUST be named by creation date (`epic <YYYY-MM-DD>`, e.g. display name `epic 2026-10-21`, directory `documents/epics/epic-2026-10-21-<slug>/` or `documents/epics/epic-2026-10-21/`, containing `BR-EPIC-2026-10-21.md` and `SA-EPIC-2026-10-21.md`). If multiple independent epics are created on the same day, append a slug (`BR-EPIC-2026-10-21-<slug>.md` / `SA-EPIC-2026-10-21-<slug>.md`).
   - **Rule A — Modifying an Existing Feature Created on the SAME Day (`<ngày epic cũ> == <hôm nay>`)**:
     - Do **NOT** create a new Epic. Instead, **update the existing same-day Epic's documents** (`BR-EPIC-<YYYY-MM-DD>.md` and `SA-EPIC-<YYYY-MM-DD>.md`) in place, along with `documents/BR-MASTER.md`, `documents/SA-MASTER.md`, and any affected `ADR`.
   - **Rule B — Enhancing an Existing Feature from a DIFFERENT Day (`<ngày epic cũ> != <hôm nay>`) or Adding a New Feature**:
     - Create a **new Epic named with today's date** (`epic <YYYY-MM-DD>`, in `documents/epics/epic-<YYYY-MM-DD>-<slug>/`).
     - If improving or modifying an existing feature from an older Epic (`epic <ngày cũ>`), the new Epic's `BR` and `SA` MUST **explicitly state the improvements/changes made** and **link directly to the prior Epic** (`Cải thiện từ / Enhances: [epic <ngày cũ>](../epic-<ngày cũ>-.../BR-EPIC-<ngày cũ>.md)`).

6. **Master BR (`documents/BR-MASTER.md`) Always Reflects Latest Code & Links Epics per Feature**:
   - `documents/BR-MASTER.md` MUST always be updated to match the **latest state of the codebase**.
   - Every functional pillar and feature item in `documents/BR-MASTER.md` MUST **explicitly link to the corresponding Epic(s)** (`epic <ngày>` — both the originating Epic and the latest enhancement Epic) that define that feature, in addition to the master Epic Roadmap table.
   - `documents/SA-MASTER.md` MUST always reflect the latest holistic architecture and ADR index, while `documents/adr/ADR-XXX-*.md` records every SA-level change.

7. **Documentation in `documents/`, Bundled Skill & Production Build in `docs/`**:
   - **`documents/`**: Holds **ALL** SDD project documentation (`BR-MASTER.md`, `SA-MASTER.md`, `adr/`, `epics/epic-YYYY-MM-DD-*/`) AND a copy of this skill (`documents/skills/sdd-tdd-pwa-webapp/`).
   - **`docs/`**: Reserved **exclusively** for the compiled production static bundle (`vite build --outDir docs`), automatically built via the `.githooks/post-merge` (`after-merge`) Git hook whenever code is merged into `main`.
   - **`README.md`**: Contains the complete SDD/TDD governance rules (including the `epic <ngày>` same-day vs. different-day rules and UI/UX rules) so all AI agents follow the exact same workflow.
   ```text
   <project-root>/
   ├── README.md                                        # Project overview + FULL SDD/TDD & UI rules for all AI agents
   ├── documents/                                       # All SDD & Architectural Documentation
   │   ├── BR-MASTER.md                                 # Latest holistic BR state + per-feature links to "epic <ngày>"
   │   ├── SA-MASTER.md                                 # Latest holistic SA state & System Overview
   │   ├── adr/                                         # Architecture Decision Records
   │   │   └── ADR-XXX-<short-slug>.md                  # Records every SA-level decision or change
   │   ├── epics/                                       # Date-named Epic specifications ("epic <YYYY-MM-DD>")
   │   │   └── epic-YYYY-MM-DD-<short-slug>/
   │   │       ├── BR-EPIC-YYYY-MM-DD.md                # ONLY requirements for this Epic (+ link to prior epic if enhancing)
   │   │       └── SA-EPIC-YYYY-MM-DD.md                # ONLY solution architecture for this Epic
   │   └── skills/
   │       └── sdd-tdd-pwa-webapp/                      # Exact copy of this skill bundled with the app's documents
   ├── docs/                                            # Production PWA build output (auto-built after merge to main)
   ├── .githooks/
   │   └── post-merge                                   # Versioned after-merge hook (builds prod to docs/ on main)
   ├── src/
   └── tests/
   ```

8. **Hard Test Coverage Gate ($\ge 90\%$)**:
   - Automated tests MUST cover **at least 90%** of the codebase across all 4 metrics: **Lines $\ge 90\%$**, **Statements $\ge 90\%$**, **Functions $\ge 90\%$**, and **Branches $\ge 90\%$**.

---

## 2. Step-by-Step Workflow (Per Project / Per Change)

When asked to initialize a new webapp or implement/modify any feature, execute the following phases in strict order. Use the templates in [references/templates.md](./references/templates.md).

### Phase 0: Project Initialization (When Creating or Bootstrapping an App)
1. **Create Directory Structure**:
   - Create `documents/`, `documents/adr/`, `documents/epics/`, `documents/skills/`, `.githooks/`, `src/domains/i18n/`, `src/domains/navigation/`, `src/services/`, `src/components/`, `src/pages/`, and `tests/`.
2. **Copy This Skill into `documents/skills/sdd-tdd-pwa-webapp/` & Install Hook**:
   - Run [setup-project-sdd.sh](./scripts/setup-project-sdd.sh) so the skill is bundled inside `documents/skills/sdd-tdd-pwa-webapp/` and `.githooks/post-merge` is active.
3. **Configure Locked Viewport, Non-Selectable Text & `docs/` Build Output**:
   - Configure `index.html` with `user-scalable=no, maximum-scale=1.0, minimum-scale=1.0` to disable zooming.
   - Configure global CSS (`src/index.css`) with `user-select: none` on the app root and `user-select: text` only on `input, textarea, [contenteditable="true"], [data-selectable="true"]`.
   - Configure `vite.config.ts` with `base: './'` and `build: { outDir: 'docs', emptyOutDir: true }`.
4. **Create Root `README.md` with Full Multi-Agent SDD & UI Instructions**:
   - Populate `README.md` using the template in [references/templates.md](./references/templates.md).

### Phase 1: Business Requirement (`BR` & Date-Based Epic Resolution)
1. **Determine Target Epic (`epic <YYYY-MM-DD>`)**:
   - Check the current date (`YYYY-MM-DD`) and inspect existing folders in `documents/epics/`:
     - **Case 1 (Modifying a feature whose Epic was created TODAY `YYYY-MM-DD`)**: Edit the existing `documents/epics/epic-YYYY-MM-DD-*/BR-EPIC-YYYY-MM-DD*.md` in place.
     - **Case 2 (Improving/modifying a feature from an OLDER Epic created on a different date, OR adding a new feature)**: Create a new folder `documents/epics/epic-YYYY-MM-DD-<slug>/` with `BR-EPIC-YYYY-MM-DD.md`. If enhancing an older feature, explicitly fill in the **"Cải thiện từ Epic cũ / Enhances Prior Epic"** section referencing `epic <ngày cũ>` and detailing what changed.
2. **Sync `documents/BR-MASTER.md`**:
   - Update `documents/BR-MASTER.md` so that:
     - Every feature description matches the **latest state of the code**.
     - Each feature section explicitly links to its defining/updating `epic <ngày>` document(s).
     - The Epic Roadmap table includes the new or updated `epic <YYYY-MM-DD>`.

### Phase 2: Solution Architecture (`SA`) & `ADR`
1. **Record Architectural Decisions (`ADR`)**:
   - For any new architecture decision or any change at the SA level, create a new `documents/adr/ADR-XXX-<slug>.md` (or update/supersede the relevant ADR).
2. **Design or Update Epic Solution Architecture (`SA-EPIC-YYYY-MM-DD.md`)**:
   - For a **same-day fix/change**, update the existing `SA-EPIC-YYYY-MM-DD.md` in place.
   - For a **different-day enhancement or new feature**, create `documents/epics/epic-YYYY-MM-DD-<slug>/SA-EPIC-YYYY-MM-DD.md` describing ONLY the architecture, delta changes from `epic <ngày cũ>` (if applicable), bilingual i18n keys, fluid `<= 1280px` single-screen icon UI, and the $\ge 90\%$ test matrix for `epic <YYYY-MM-DD>`.
3. **Sync `documents/SA-MASTER.md`**:
   - Update `documents/SA-MASTER.md` to reflect the latest holistic system architecture diagram, directory tree, and ADR Index.

### Phase 3: Test-Driven Development (`Test`)
1. **Configure Hard Coverage Thresholds**:
   - Ensure `vite.config.ts` enforces `thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 }`.
2. **Write/Update Tests Mapped to `BR-EPIC-YYYY-MM-DD` & `SA-EPIC-YYYY-MM-DD`**:
   - Cover all acceptance criteria, happy paths, edge cases, swipe/tab switching, icon button `aria-label` interactions, and `en`/`vi` bilingual switching.
3. Run `npm test` to confirm tests execute and validate the specification.

### Phase 4: Implementation & Verification (`Code`)
1. **Implement Domain, Services, and Minimalist Fluid UI (`src/`)**:
   - Implement code matching the updated `BR` and `SA`.
2. **Run Quality Gates & Finalize Documentation State**:
   - Run [verify-sdd-docs.sh](./scripts/verify-sdd-docs.sh)
   - Run `npm run typecheck && npm run test:coverage && npm run build`
   - Verify `documents/BR-MASTER.md`, `documents/SA-MASTER.md`, and the target `epic <YYYY-MM-DD>` documents accurately reflect the final implemented code state and mark the Epic status as **Implemented (`Đã triển khai`)**.
   - Sync any skill updates into `documents/skills/sdd-tdd-pwa-webapp/`.
