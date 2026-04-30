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

- [ ] **#8 Implement revision function** ⬜
  Takes (draft, critique, topic, skill_level), returns revised draft addressing the critique while preserving section structure.

- [ ] **#9 Wire generate→validate→revise orchestrator** ⬜
  Runs generate → validate → revise → validate → revise (2 revisions cap). Persists `content_items` row with iteration_count, drafts, final, feedback.

- [ ] **#10 Add `POST /creator/content/generate` endpoint** ⬜
  Creator-authenticated. Runs orchestrator, returns content_item id + payload to frontend.

## Phase 3 — Creator UI

- [ ] **#11 Replace homepage with sign-up funnel** ⬜
  Remove student topic-browse. Marketing landing + Sign up / Sign in CTAs. Role-aware routing post-auth.

- [ ] **#12 Build `/create` page with loading UX** ⬜
  Topic input, skill_level selector, Generate button. Modern skeleton/card-shaped loading state for the 20–40s orchestrator run.

- [ ] **#13 Build content review screen** ⬜
  Final content + single validator narrative + 4 actions: Regenerate · Save to library · Assign to students · Publish public.

- [ ] **#14 Build `/library` page for creators** ⬜
  Lists creator's content_items with topic, skill_level, visibility badge, created date. Click to re-open / re-assign / change visibility.

- [ ] **#15 Update creator dashboard assign flow** ⬜
  Pick from library instead of typing a topic string. Assigns specific `content_item_id` to batch/students.

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
