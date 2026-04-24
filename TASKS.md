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

- [ ] **#4 Add `content_items` table + migration** ⬜
  New table: id, creator_id, topic, skill_level, draft_content (JSON), final_content (JSON), validator_feedback (text), iteration_count, status (`draft`/`validated`/`published`), visibility (`private`/`assigned`/`public`), timestamps. Idempotent migration on backend startup.

- [ ] **#5 Rename role `teacher` → `creator`** ⬜
  DB migration on `users.role`. Update backend role checks, JWT claims, frontend role-gating, UI copy.

- [ ] **#6 Link `batch_topics` to `content_item_id`** ⬜
  Add foreign key so assignments reference a specific generated content piece, not a regeneratable topic string.

## Phase 2 — Backend validator + generation loop

- [ ] **#7 Implement validator critique function** ⬜
  Takes (draft, topic, skill_level), returns structured critique across 7 dimensions: accuracy, grade-level, bias, completeness, politically correct, age-appropriate, safety. Synthesized to one narrative summary for the creator.

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
