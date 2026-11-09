# PHASE 38 REPORT — KNOWLEDGE CENTER

## 1) Project Inspection
- Repo: `C:\inetpub\wwwroot\cmms-tpt` (Next.js + PHP + MySQL). Existing modules: Asset, WO/Repair, Failure/RCA, PM/AM, Spare Parts, Workforce, Shutdown, Calibration, Permit/LOTO, Contractor, ECR, IoT/Condition (Phase 36), Advanced Reliability (Phase 37), Document Control (Phase 32).
- Last commit before Phase 38: Phase 37. Additive only — no destructive changes to existing source transactions.
- Live state inspected: only sparse/seed data existed; `controlled_documents` has **0 rows**, so document-reference coverage in smoke is skipped with an explicit NOTE.

## 2) Existing Functionality (Gap Analysis)
Phase 32 Document Control answers *"which controlled document is effective right now"*. It does not answer *"how do I actually do this job, and did my search find anything?"*. Phase 38 therefore adds a knowledge layer **above** controlled documents, and keeps Phase 32 as the single owner of controlled content. No duplication of the existing search/review/approval engines; additive only.

## 3) Architecture
- Business engine `src/helpers/knowledge.php` (version `phase38.1`) — engine-level validation, visibility, and workflow.
- Thin API `public/api/v1/knowledge.php` with authentication, RBAC, CSRF, and audit. Action-dispatch adapter; unknown actions answer with a code, never a 500.
- 12 new tables + settings group `knowledge` + 10 menu permission keys. Menu permissions registered by the apply script.
- Frontend: typed client `frontend/lib/knowledge.ts` + 10 routes under `frontend/app/(dashboard)/knowledge/`, wired into sidebar, menu hrefs, i18n, and page layout.

## 4) Data Model
Migration: `database/migration_20260924_phase38_knowledge.sql`

| Table | Purpose |
|---|---|
| `knowledge_category` | Hierarchical categories (`parent_id`), active flag, sort order |
| `knowledge_article` | One row = one immutable-on-publish version |
| `knowledge_published_guard` | DB-level "one published version per `article_key`" guard |
| `knowledge_tag`, `knowledge_article_tag` | Tag vocabulary and article tags |
| `knowledge_relation` | Validated relation to another article or an existing CMMS entity |
| `knowledge_document_ref` | Reference to Phase 32 controlled document + `is_stale` flag |
| `knowledge_usage` | Real usage events (`view`, `print`, `download`, `feedback`, …) |
| `knowledge_search_log` | Search log + click attribution → source of Knowledge Gaps |
| `knowledge_gap` | Unanswered-search gap with status/priority |
| `knowledge_review` | Scheduled/incident review rounds and outcomes |
| `knowledge_activity` | Append-only audit of every state change |

Settings group `knowledge` (25 keys) includes feature toggle, publish preconditions (`requires_approved`, `requires_category`, `requires_relation`, `requires_review_record`), privileged roles, search toggles, logging toggles, retention, gap auto-creation thresholds, and page/export limits.

## 5) Lifecycle & Workflow Rules
`draft → in_review → approved → published`, plus `superseded`, `archived`.

- Transitions are declared in `KN_TRANSITIONS`; illegal transitions are refused server-side.
- Published versions are immutable — edits require `article_new_version`.
- An author cannot approve their own article (enforced in the engine, not only hidden in the UI).
- `in_review` content is locked; changes require `article_send_back` with a reason.
- Approve ≠ publish: publish is a separate permission and separate precondition check.

## 6) Search & Discovery
- Lexical ranking across article title/body/tags/category, plus opt-in inclusion of Phase 32 controlled documents and manuals.
- Minimum query length and max results are configurable (`knowledge_min_query_len`, `knowledge_max_results`).
- Search logs feed Knowledge Gaps; a search with no matching answer is reported as **unanswered**, never guessed.
- Click attribution links a search log row to the opened article (feeds `search_hit` usage and gap resolution evidence).

## 7) Knowledge Gaps
- `knowledge_auto_create_gap` + `knowledge_gap_min_occurrences` + `knowledge_gap_window_days` open gaps automatically from real repeated unanswered searches.
- Manual gap creation is also supported.
- Status flow `open → triaged → in_progress → resolved | rejected`; a gap can only be resolved by linking a real article (`resolved_article_id`).
- Fixed during build: gap occurrence counters did not persist, and a duplicate action button produced a broken `.then` chain in the UI.

## 8) Scheduled Reviews
- Triggers: `scheduled`, `incident`, `major_revision`, `user_report`, `manual`.
- Outcomes: `approved`, `needs_revision`, `rejected` (findings required when not approved).
- `knowledge_review_default_days` for scheduling, `knowledge_review_overdue_warn_days` for overdue highlighting; review_due lists what is due.

## 9) Taxonomy & Settings
- Categories are hierarchical and can be deactivated (no hard delete of taxonomy in use).
- Tags are normalized; unknown tags can be created inline by authorized users.
- Frontend `/knowledge/taxonomy` manages both and reuses `fetchKnConfig` capability flags.

## 10) Usage, Feedback & Analytics
- Usage events are written by real interactions only; `knowledge_usage_log_enabled` gates it.
- Helpfulness values: `helpful`, `not_helpful`, `no_answer`.
- `/knowledge/usage` shows real event rows, action breakdown, and helpfulness percentages — and explicitly shows "no data" instead of percentages when nobody has answered.
- Export is capped by `knowledge_export_row_limit` and reports truncation.
- Fixed during build: `feedback` was missing from the usage-action whitelist, and the transport action key collided with the usage-event filter key (usage now uses `usage_action`).

## 11) Document Control Bridge
- Link types: `implements`, `governs`, `summarises`, `evidenced_by`, `supersedes`, `reference`.
- One-way: Knowledge references Phase 32; it never writes to controlled-document tables.
- References are validated before insert, and `knowledge_auto_check_document_stale` marks references whose target was superseded/withdrawn.
- Fixed during build: stale-reference detection could surface deleted/unknown targets; check now returns only valid findings.

## 12) Security, RBAC, Audit, CSRF
- Permission actions: `read`, `search`, `create`, `edit`, `submit`, `review`, `approve`, `publish`, `archive`, `manage_gap`, `manage_review`, `manage_taxonomy`, `view_usage`, `export`.
- Visibility is enforced in SQL (`kn_visibility_clause`): ordinary users see only published, non-restricted/confidential content; authors keep access to their own unpublished version; roles in `knowledge_privileged_roles` (default `1,2,6`) see all versions.
- All mutations require a valid CSRF token (`X-CSRF-Token` via `apiJson`); every mutation writes an activity row.
- Frontend bug fixed during build: one feedback form used raw `fetch` (bypassing CSRF) and now uses `sendKnFeedback`.
- No secrets or dev URLs hardcoded; frontend calls relative `/api/v1/...` paths.

## 13) Frontend Delivered
| Route | Purpose |
|---|---|
| `/knowledge` | Overview: real KPIs, feature status, shortcuts |
| `/knowledge/search` | Search + log + click + feedback, unanswered handling |
| `/knowledge/articles` | Filterable article list |
| `/knowledge/articles/create` | Article authoring |
| `/knowledge/articles/[id]` | Detail, editing, workflow actions, relations, document refs, versions, reviews, usage, feedback |
| `/knowledge/gaps`, `/knowledge/gaps/[id]` | Gap list/board and gap resolution |
| `/knowledge/reviews` | Due and scheduled reviews, review modal |
| `/knowledge/taxonomy` | Category and tag management |
| `/knowledge/usage` | Usage events, helpfulness, CSV export |

Navigation/i18n integration: `sidebar-nav.tsx` (Knowledge group, 10 permission keys), `layout.tsx` `MENU_HREFS`, `i18n.ts` (dictionary, page titles, section map, page heroes), `pageLayout.ts` (page entries, sections, overrides).

## 14) Data Truthfulness (explicitly verified)
- Live DB after cleanup: **0** knowledge articles, 0 usage rows, 0 gaps, 0 reviews; only 11 seeded categories + 27 seeded tags remain.
- No metric is estimated, extrapolated, or displayed as a percentage when its denominator is 0.
- `estimated_minutes = null` is displayed as "not measured", never as `0`.
- Smoke cleanup verified: `knowledge_article rows remaining: 0`, and the transport smoke removed its own search log/gap rows.

## 15) Tests & Results
| Check | Command | Result |
|---|---|---|
| Backend lifecycle | `php scripts/smoke_phase38_knowledge.php` | **PASS 82 · FAIL 0 · NOTES 2** |
| HTTP/JSON/session/CSRF | `php scripts/smoke_phase38_api_transport.php` | **PASS 19 · FAIL 0** |
| Phase 37 regression | `php scripts/smoke_phase37_reliability.php` | **PASS 57 · FAIL 0 · NOTES 1** |
| SQL balance | `php scripts/check_insert_balance.php` | PASS (Knowledge, Document Control, Reliability) |
| Frontend types | `npx tsc --noEmit` | PASS (0 errors) |
| Frontend build | `npm run build` | PASS (build to `.next-verify`; see notes) |

Backend smoke coverage includes: config/feature status, validation, taxonomy, article CRUD, transitions incl. illegal-transition refusal, self-approval refusal, version immutability, published-guard uniqueness, visibility clause for readers/owners/privileged roles, relations, search ranking + tag matching, document refs + stale check, usage log + feedback, summary/events, gap creation from repeated searches, review scheduling/due, catalog, export, append-only activity, and cleanup.

Frontend issues found and fixed during verification: raw-`fetch` CSRF bypass, nonexistent search-result field, `SearchBox` navigation via `useRouter`, `useRef` misuse in usage logging, `CardTail` closing-tag typo, broken `.then` chain + duplicate gap action, missing `KN_CONFIDENTIALITY_TONE` import, unsupported `Badge`/status tone values, and `KnReview` missing article metadata typing.

## 16) Deployment Requirements
- Apply: `php scripts/apply_phase38_knowledge.php --apply --yes` (idempotent — safe to re-run; creates tables, seeds settings + menu permissions + taxonomies).
- Deploy `src/helpers/knowledge.php`, `public/api/v1/knowledge.php`, RBAC wiring, frontend files, and docs.
- Rollback: drop the 12 `knowledge_*` tables, remove the `knowledge` settings group and 10 menu permission keys. No source transaction data is touched.
- Notes: no IIS worker bound to port 80 in this environment, so HTTP verification used PHP's built-in server (`smoke_phase38_api_transport.php`). Production standalone server may hold a lock on `.next/standalone`; build to an alternate dist dir via `$env:NEXT_DIST_DIR=".next-verify"; npm run build`.

## 17) Feature Status (Phase 38)
| Feature | Status | Evidence |
|---|---|---|
| Article lifecycle + immutability | PASS | Engine transitions + smoke (illegal transition, self-approval, version rules) |
| One published version per key | PASS | `knowledge_published_guard` + smoke uniqueness |
| Visibility / RBAC | PASS | `kn_visibility_clause` + smoke (reader, owner, privileged) |
| Search + unanswered detection | PASS | Smoke ranking/tag matching; transport "unanswered, not guessed" |
| Knowledge Gaps from real searches | PASS | Smoke repeated-search gap creation; fixed persistence bug |
| Usage + helpfulness | PASS | Smoke log/feedback/summary/events; fixed `feedback` action support |
| Scheduled reviews | PASS | Smoke request/start/complete + review_due |
| Document Control bridge | PASS (NOTE) | Smoke validates refs and stale check; NOTE = live `controlled_documents` empty |
| Taxonomy management | PASS | Smoke category/tag save + frontend `/knowledge/taxonomy` |
| Frontend routes (10) | PASS | `tsc --noEmit` clean; `next build` succeeded |
| Semantic/vector search | NOT IMPLEMENTED | Deliberate — lexical ranking only (documented) |

## 18) Known Limitations (with evidence)
- No knowledge articles exist in the live DB, so the UI intentionally shows empty states rather than demo content.
- `controlled_documents` is empty in the live DB → document-reference/staleness smoke is noted, not silently skipped.
- Search is lexical (title/body/tags/category), not semantic; ranking is heuristic.
- Raw usage/search logs respect retention settings, so analytics are not perpetual.
- Export is capped (`knowledge_export_row_limit`) and reports truncation instead of silently truncating.