# CurioLab Pivot — Task Tracker

Source of truth for the pivot work breakdown. Mirrors the Cowork task list during this session; this file is the version-controlled record.

**Plan doc:** [`PIVOT_PLAN.md`](./PIVOT_PLAN.md)
**Plan as Gist:** https://gist.github.com/SriniC54/39c097a6898f7fd93feb13fad18f0095
**Branch:** `pivot/creator-flow`
**Rollback:** `pre-pivot-archive` (snapshot of `main` at `eff1645`)

Status legend: ✅ done · 🔄 in progress · ⬜ pending

---

## Phase 0 — Planning & setup

- [x] **#1 Draft pivot plan document** ✅
  Plan captured in `PIVOT_PLAN.md`. Covers role rename, validator loop, visibility model, MVP scope, deferred items, and rollback path.

- [x] **#2 Publish plan as GitHub Gist** ✅
  Secret Gist live at https://gist.github.com/SriniC54/39c097a6898f7fd93feb13fad18f0095

- [x] **#3 Archive pre-pivot branch + start working branch** ✅
  `pre-pivot-archive` snapshots `main` at `eff1645`. `pivot/creator-flow` is the working branch.

## Phase 1 — Data model foundation

- [x] **#4 Add `content_items` table + migration** ✅
  New table: id, creator_id, topic, skill_level, draft_content (JSON), final_content (JSON), validator_feedback (text), iteration_count, status (`draft`/`validated`/`published`), visibility (`private`/`assigned`/`public`), timestamps, deleted_at (soft-delete). Indexes on `(creator_id, deleted_at)`, `status`, `visibility`. Idempotent migration in `init_database()`. Verified on a clean DB: re-runs safe, defaults apply, JSON round-trips, soft-delete filters correctly.

- [x] **#5 Rename role `teacher` → `creator`** ✅
  Idempotent `UPDATE users SET role='creator' WHERE role='teacher'` added to `init_database()`. Backend: `require_teacher` → `require_creator` (function + 13 endpoint dependencies), validation tuple, error messages. Frontend: TS types in `AuthContext`, `AuthModal` (state + click handler + button label), role checks in `index.tsx`, `learn/[topic].tsx`, `teacher-dashboard.tsx`. Verified end-to-end: 'teacher' rows convert cleanly, idempotent on re-run, content_items table coexists. Cosmetic cleanup (route paths, column names, file rename, comments) tracked separately as task #21.

- [x] **#6 Link `batch_topics` to `content_item_id`** ✅
  Additive `ALTER TABLE batch_topics ADD COLUMN content_item_id INTEGER REFERENCES content_items(id)` wrapped in try/except for idempotency. Nullable so legacy rows survive untouched; new assignments (task #15) will populate it. Index `idx_batch_topics_content_item` for the JOIN path. Tightening to NOT NULL or `UNIQUE(batch_id, content_item_id)` requires a SQLite table rebuild — deferred to task #21. Verified on a fresh DB: legacy NULL rows preserved, linked rows JOIN cleanly to content_items, query plan uses the index, second migration run is a no-op.

## Phase 2 — Backend validator + generation loop

- [x] **#7 Implement validator critique function** ✅
  `validate_content_draft(draft, topic, skill_level)` in `backend/main.py`. Single Gemini call with `response_mime_type="application/json"` and thinking enabled (budget 2048). Six internal dimensions: accuracy, grade_level, bias, completeness, age_appropriate, safety — "politically correct" folded into bias since they collapse to the same fair-representation concern. Dimension framework is invisible to creators; the `summary` field is conversational and mentions only dimensions with a `concern` verdict (named in plain language, never as the rubric label). Returns `{dimensions, summary, needs_revision}`. Defensive shape validation; on any upstream failure returns a permissive default so the orchestrator never blocks behind a flaky reviewer. Standalone — wiring lands in #9.

- [x] **#8 Implement revision function** ✅
  `revise_content_draft(draft, critique, topic, skill_level)` in `backend/main.py`. Consumes the structured `dimensions` from the validator (not the conversational `summary`) so the revision model gets the full per-dimension signal. Filters to only the dimensions with `concern` verdict — pass dimensions are noise. Hard rules in the prompt: address every flagged issue, preserve section structure (headings + emoji + paragraph shape + ~900 words), do not rewrite unflagged parts, output the full revised draft only (no commentary or diff format). Temperature 0.5 (between generator's 0.7 and validator's 0.2), thinking off (validator already reasoned). Graceful degradation: returns the original draft on any upstream failure so the orchestrator's next validate pass surfaces the unchanged content + actionable feedback instead of an error. Smoke test deferred to task #9 since revision is only meaningful in the validate→revise→validate chain.

- [x] **#9 Wire generate→validate→revise orchestrator** ✅
  `orchestrate_content_creation(creator_id, topic, skill_level)` in `backend/main.py`. Hardcoded `MAX_REVISIONS = 2`. Loop: generate → validate → (revise → validate)×N until clean or cap. Persists a `content_items` row with `creator_id`, `topic`, `skill_level`, `draft_content` (the FIRST draft, for debugging), `final_content` (post-revision), `validator_feedback` (full final critique JSON), `iteration_count`, `status='draft'`, `visibility='private'`. First-draft generation failure raises (no draft = nothing to show); validator/revision failures absorbed by their permissive defaults so the loop always reaches persist. SQLite write failures surface — silent persist failure would create a successful-looking generate that never appears in the library. Sections / images / quiz NOT generated here — punted to task #16 (lazy-load when student opens assignment) so creators don't wait for assets they may regenerate away. Cheap observability via `_log_pass()` printing concern dimensions at each pass. Smoke test in `backend/test_orchestrator.py` (gitignored) covers easy topic + tricky topic; confirms row lands in DB with correct shape.

- [x] **#10 Add `POST /creator/content/generate` endpoint** ✅
  Creator-authenticated via existing `require_creator` dependency. Pydantic `CreatorContentRequest` (separate from legacy `ContentRequest` so the contract can evolve independently). Validates topic length + appropriateness + skill_level using the existing guards. Enforces a per-creator daily cap (`MAX_GENERATIONS_PER_DAY = 3`, midnight UTC reset, counts content_items rows including soft-deleted). On cap hit returns 429 with `{error, message, limit, used_today, resets_at}` for friendly UI messaging. Calls the orchestrator (#9) which handles all error recovery internally; only the first-draft generator failing escapes to a 500. Response includes the orchestrator's payload (content_item_id, content, summary, iteration_count, status, visibility) plus `remaining_today` and `daily_limit` so the UI can display budget state without an extra roundtrip. Curl-based verification rather than a Python smoke test since the endpoint exists to be hit over HTTP.

## Phase 3 — Creator UI

- [x] **#11 Replace homepage with sign-up funnel** ✅
  Rewrote `pages/index.tsx`. Removed the old `topicSuggestions` grid and freeform topic-search card entirely (they implied on-demand browse we no longer deliver). New homepage is a marketing landing for signed-out visitors: hero with owl + "Curiosity starts here" + new subhead about validated content, primary "Sign Up Free" CTA, secondary "Sign in" link, plus a 3-step "How it works" card (Pick any topic → AI reviews every draft → Assign and track) and a closing "Get Started Free" CTA. Role-aware routing: signed-in creators auto-redirect to `/create`, signed-in students to `/student-dashboard`. While auth state resolves or a redirect is in flight, a neutral spinner is rendered instead of the marketing pitch — avoids a flash of "Sign Up" for users already signed in. Reuses existing `AuthModal` (no new route). Imports cleaned (`UserProfile` and `analytics` removed; they weren't used in the new page). Note: `/create` page lands in task #12 — until then, signed-in creators get a 404 on redirect (acceptable for sequential dev).

- [x] **#12 Build `/create` page with loading UX** ✅
  New `pages/create.tsx`. Form: topic input + 3 skill-level cards (Beginner/Explorer/Expert with one-line descriptions) + Generate CTA. Auth guard mirrors `teacher-dashboard.tsx` pattern (non-creators bounced to `/`). Daily budget shown as "X / N generations left today", fetched from new `GET /creator/content/budget` endpoint on mount and re-derived from each generate response. When cap is hit (`remaining_today <= 0`) the button is disabled and an amber banner links to the library. Page state machine: `idle` → `generating` → `error` (form preserved across retry) or `success` (redirects to `/review/[content_item_id]`, which is task #13's territory). The generating state replaces the form with a card-shaped skeleton animation (Tailwind `animate-pulse`, gradient-tinted heading bars, gray paragraph bars) that's shaped like the article that's coming — not a generic spinner. Below the skeleton a rotating phase label cycles every 8 seconds: "Generating draft..." → "Reviewing content..." → "Checking accuracy and balance..." → "Revising for clarity..." → "Final review..." Labels are client-side scripted (no SSE channel) but sequenced to roughly match what the backend is actually doing. 429 from generate is caught and surfaced inline. 500 surfaces "Generation failed. Please try again." with form state preserved.

- [x] **#13 Build content review screen** ✅
  New `pages/review/[id].tsx`. Fetches the content_item on mount via new `GET /creator/content/{id}` (so hard refresh + bookmarks work, not just `router.push` from `/create`). Renders the validator's conversational summary at the top in a green callout (clean) or amber callout (concerns), then a meta line (topic · skill_level · time-ago · public/saved badges if applicable), then the article body in a single-card layout. Markdown rendered manually via a ~30-line parser that handles the generator's narrow shape: blank-line block splits, `## heading` lines, `**bold**` and `*italic*` inline runs. No new npm dep. Action bar with 5 buttons — sticky bottom on mobile, inline on desktop: **Save to library** + **Assign to students** (PUT status='validated', navigate to `/library` or `/teacher-dashboard`), **Publish public** (PUT visibility='public', stays on page, button toggles to **Unpublish**), **Regenerate** (POST `/creator/content/generate` with current topic+skill_level, costs 1 daily slot, navigates to new `/review/<newid>`; current draft stays untouched in the library), **Discard** (DELETE for soft-delete via `deleted_at` tombstone, navigates back to `/create`). All three "regret-feeling" actions (Regenerate / Publish / Discard) gated by a `ConfirmModal` so accidental clicks don't burn budget or change state. Optimistic local state updates after PUT so the UI doesn't need a re-fetch round trip. Page-level states for `loading` (skeleton), `not_found` (404 panel with link to `/create` — backend returns 404 for cross-creator access, so this also covers the "wrong creator" case without leaking row existence), and `error` (retry panel). Backend: added `GET`, `PUT`, `DELETE /creator/content/{id}` (all ownership-checked via shared `_fetch_creator_content` helper) and `CreatorContentUpdate` Pydantic model. Legal values pinned via `VALID_CONTENT_STATUS` and `VALID_CONTENT_VISIBILITY` sets so the API can't be coerced into an inconsistent state.

- [x] **#14 Build `/library` page for creators** ✅
  New `pages/library.tsx`. Read-only listing of every content_item the creator owns. Backed by new `GET /creator/content` which returns a trimmed row shape (no `draft_content`, `final_content`, or `validator_feedback`) so the list payload stays small even with many items; the review screen still hits `GET /creator/content/{id}` for the heavy fields. Newest first, soft-deleted excluded. Each row: topic + status badge (Draft/Saved/Published) + Public badge when applicable + skill_level + time-ago. Click row → `/review/[id]` where all state transitions happen. No inline edit/delete actions — review screen is the single source of state-change logic. Page states: `loading` (skeleton list), `ready` (the actual list), `empty` (📚 + "Create your first article" CTA), `error` (retry panel). "+ Create new" button in the header for one-tap entry into the generate flow without backtracking through the homepage. No pagination, filters, or search for MVP.

- [x] **#15 Update creator dashboard assign flow** ✅
  Backend: `AssignTopicRequest` now accepts optional `content_item_id`. POST `/teacher/batches/{id}/topics` branches: if `content_item_id` is provided (post-pivot), verify creator ownership via `_fetch_creator_content`, pull `topic` for the denormalized label, insert `batch_topics` with both fields, skip `prefetch_content` (already generated). Legacy text-only path preserved for backward compat with pre-pivot rows but is no longer exercised by our UI. Duplicate guards: 409 on `(batch_id, content_item_id)` repeat with a friendly message; 409 with explanatory text if the pre-pivot `UNIQUE(batch_id, topic)` constraint fires (two content_items with the same topic name in the same batch — schema rebuild deferred to task #21). `GET /teacher/batches/{id}/topics` now returns `content_item_id` so the UI can render Curated vs Legacy badges. Frontend (`pages/teacher-dashboard.tsx`): removed the free-text topic input entirely; Topics tab now shows a `<select>` populated from `GET /creator/content` (fetched lazily when the creator role mounts the dashboard). Library option label: `topic · skill_level · Status`. Empty library: amber banner with link to `/create`. Below the select: "Create a new article →" link for one-tap entry without backtracking. Assigned-topics list now shows a "Curated" indigo badge for rows with `content_item_id` and a "Legacy" gray badge for pre-pivot rows. Type-clean.

## Phase 4 — Student consumption

- [ ] **#16 Switch `/learn` to fetch stored content** ⬜
  `pages/learn/[topic].tsx` resolves to a stored `content_item` by id (via assignment lookup). Removes generate-on-demand fallback for students.

- [ ] **#17 End-to-end test student consumption flow** ⬜
  Full round-trip: creator signs up → generates → assigns → student signs in → opens assignment → reads/listens → takes quiz → score recorded.

## Phase 5 — Visibility wiring & cleanup

- [ ] **#18 Wire visibility states through UI + backend** ⬜
  `private` (library only), `assigned` (existing flow, points at content_item_id), `public` (flag set; no MVP browse surface). Endpoints + UI toggles.

- [ ] **#19 Remove `content_cache/` JSON layer** ⬜
  Rip out backend cache writes/reads. Content lives only in `content_items` going forward.

## Followups (post-MVP cleanup)

- [ ] **#20 Rotate GitHub PAT + move out of remote URL** ⬜
  Revoke embedded PAT, generate new one, move into a credential helper (`gh auth login`, `git-credential-manager`, or osxkeychain). Sanity grep for stray tokens before closing out.

---

## Out of scope for MVP (deferred to V2)

- Parent chatbot for iterative content feedback
- Public browse / search on the homepage
- Creator monetization / attribution
- Per-dimension validator UI breakdown
- Validator pass on quiz content
