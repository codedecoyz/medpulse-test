# MedPulse Edge Functions

All Edge Functions run in Supabase Deno runtime with JWT verification enabled, caller identity derived from the JWT, rate limiting, structured error logging, and `request_id` correlation (Section 8).

## Security Rules
- `GEMINI_API_KEY` must ONLY be stored in Supabase Edge Function secrets (`MP-NFR-001`, P4).
- Never pass patient-identifiable data or staff names to Gemini (roles, catalog IDs/names, and aggregated stats only — `MP-NFR-002`, P5).
- Never let Gemini write directly to `stock_levels` or `stock_movements` (P1, P3).

## Planned Edge Functions (Phases 2, 5, 6)
1. `post-count` (Phase 2) — Transactional, idempotent posting of approved count adjustments (`MP-CNT-020`).
2. `generate-tasks` (Phase 5) — Deterministic rules engine + Gemini prioritisation/explanation (`MP-TSK-001..006`).
3. `assistant-query` (Phase 5) — Read-only "Ask MedPulse" tool-whitelisted Gemini assistant under caller RLS (`MP-AST-001..005`).
4. `analyze-variances` (Phase 5) — Weekly variance analysis generating PAR suggestions for human review (`MP-TSK-005`).
5. `scenario-plan` (Phase 6) — Gemini scenario requirements generation with strict JSON schema validation + server-side readiness calculation (`MP-SEN-002..011`).
6. `refresh-readiness` (Phase 6) — Pure deterministic nightly/post-count readiness recomputation (`MP-SEN-006`).
