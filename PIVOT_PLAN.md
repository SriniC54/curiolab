# CurioLab Pivot Plan

**Status:** Pre-implementation — plan approved, code work pending.
**Date:** 2026-04-22
**Owner:** SriniC54
**Archive branch:** `pre-pivot-archive` (rollback point)
**Working branch:** `pivot/creator-flow`
**Also published as Gist:** https://gist.github.com/SriniC54/39c097a6898f7fd93feb13fad18f0095
**Task tracker:** see [`TASKS.md`](./TASKS.md)

---

## Why we're pivoting

Today CurioLab generates educational content on demand: a user (student or otherwise) picks a topic, an LLM generates content, the student reads it and takes a quiz. There is no editorial layer. No one owns the content. Quality depends entirely on a single LLM call.

The pivot reframes CurioLab as a **content creation platform for parents and teachers**, not an ad-hoc generator. Good content is authored, reviewed, and published by a human who stands behind it. An AI validator agent provides a second pair of eyes before the human decides to publish.

The long-term vision is a marketplace: creators publish, consumers (other parents, teachers, the public) find and reuse high-quality pieces, and good creators are rewarded. That surface is V2; MVP locks in the authoring workflow.

## What changes

**Role model.** DB role `teacher` is renamed to `creator`. Anyone generating content — parent, teacher, future contributor — is a creator. Student remains a consumer only. Admin arrives later for moderation of public content.

**Content lifecycle.** Content becomes a persisted, owned entity (`content_items` table) with a clear status and visibility. It is no longer generated on demand for students; it is generated, validated, and assigned by a creator.

**Generation loop.** Single LLM call becomes a generate → validate → revise → validate → revise cycle (2 revisions, capped). The validator agent checks seven dimensions:

1. Accuracy
2. Grade-level appropriateness
3. Bias
4. Completeness
5. Political correctness
6. Age-appropriateness
7. Safety (no prohibited-topic zones)

The validator's final output to the creator is a **single synthesized narrative summary**, not a per-dimension breakdown. Per-dimension is a V2 refinement.

**Creator UI.** New `/create` page with modern skeleton-style loading indicator while the 20–40s orchestrator runs. Review screen shows the final content plus the validator summary and four actions: Regenerate, Save to library, Assign to students, Publish public. New `/library` page lists a creator's content. Existing creator dashboard gets updated so assignment pulls from library instead of typing a topic string.

**Student UI.** Homepage topic-browse is removed. Students see only what's been assigned to them. `/learn/[topic]` switches from generate-on-demand to fetching a stored `content_item` by id. Quiz flow is unchanged.

**Homepage.** No topic browse. Marketing landing with sign-up/sign-in CTAs. Signed-in creators route to `/create`; signed-in students route to student dashboard.

**Visibility.** Three states: `private` (library only), `assigned` (existing assignment flow, now pointing at a specific content_item), `public` (flag set; no public browse UI in MVP, but data ready for V2 marketplace).

**Cache removal.** The current `content_cache/` JSON layer is removed. It conflicts with the ownership model (silent reuse across creators breaks attribution and monetization). Reuse in V2 flows through explicit public publishing, not a backend cache.

## What does not change

- JWT auth, classes → batches → students scaffolding
- Three skill levels (Beginner / Explorer / Expert)
- Quiz generation and scoring
- Gemini as the LLM provider
- Student dashboard shape (only the source of content changes)

## Explicitly out of scope for MVP

- Parent chatbot for iterative content feedback (V2)
- Public browse / search on the homepage (V2)
- Creator monetization (V2)
- Per-dimension validator UI (V2)
- Validator pass on quiz content

## Work breakdown

Tasks are tracked in the Cowork task list for this session. Summary:

**Foundation**
- Add `content_items` table + idempotent migration
- Rename role `teacher` → `creator` (DB + code + UI copy)
- Link `batch_topics` to `content_item_id`

**Backend**
- Validator critique function (7 dimensions, structured internally)
- Revision function
- Orchestrator (generate → validate → revise × 2)
- `POST /creator/content/generate` endpoint (role-gated to creator)

**Creator UI**
- Replace homepage with sign-up funnel
- `/create` page with skeleton loading
- Content review screen (single narrative feedback + 4 action buttons)
- `/library` page
- Update creator dashboard assign flow

**Student consumption**
- Switch `/learn/[topic]` to fetch stored `content_item`
- End-to-end smoke test

**Cleanup**
- Wire visibility states through UI + backend
- Remove `content_cache/` JSON layer

## Key design decisions locked in

| Decision | Choice | Notes |
|---|---|---|
| Validator dimensions | 7 (5 user + age-appropriate + safety) | Single narrative summary to creator |
| Revision loop | 2 revisions (3 drafts, 2 critiques) | Configurable later |
| Parent editing | Regenerate only (no direct edit) | Chatbot-style editing is V2 |
| Role naming | `creator` | Replaces `teacher`; future admin role separate |
| Cache | Removed | Reuse via public publishing in V2 |
| Public browse | None in MVP | Flag set; no surface yet |
| Loading UX | Skeleton / card-shaped | Not a classic spinner |

## Open items to revisit

- **Latency.** Orchestrator runs ~20–40s with Gemini 2.5-flash × 5 calls (3 generate + 2 validate). If this feels too slow in practice, consider streaming progress events rather than a single skeleton.
- **Content size.** Generated content is structured JSON with 6–8 sections. Validator critique and revision prompts must preserve that structure.
- **Cost.** ~5× token usage per content item vs. today. Acceptable for the editorial workflow; revisit if volume spikes.
- **Role migration.** One-line UPDATE against `users.role` — simple, but needs to run before any code that checks for `creator` ships.

## Rollback

Archive branch `pre-pivot-archive` is a frozen snapshot of `main` at commit `eff1645`. To roll back: `git checkout pre-pivot-archive` or reset `main` to that commit. All pivot work lives on `pivot/creator-flow` until merged.
