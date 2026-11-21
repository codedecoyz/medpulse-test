# MedPulse: Product & Technical Specification

> **Always ready. Before the emergency arrives.**

| | |
|---|---|
| **Product** | MedPulse, Hospital Warehouse & Emergency Readiness System |
| **Designed and developed by** | Rajiv Kumar Singh |
| **Spec version** | 1.0.0 (draft for build) |
| **Date** | 21 November 2026 |
| **Platform** | Mobile (iOS + Android) via Expo / React Native |
| **Backend** | Supabase (Postgres, Auth, RLS, Realtime, Storage, Edge Functions, pg_cron) |
| **AI** | Google Gemini API, server-side only (Supabase Edge Functions) |
| **App identifiers** | Expo slug `medpulse`, bundle/package ID `com.medpulse.app` (verify availability on both stores before publishing) |

---

## 0. How to use this spec

This document is the single source of truth. It is written to be handed to a human developer or an AI coding agent (Claude Code, Cursor, etc.).

**Rules for the implementer**

1. **Spec first.** Do not build anything that is not traceable to a requirement ID (`MP-XXX-000`). If something is missing, add it to [Section 16: Open Questions](#16-risks-assumptions-and-open-questions) instead of guessing.
2. **Work in phase order** ([Section 14](#14-delivery-plan)). Each task lists the requirements it satisfies and a "Done when" check.
3. **Requirements use EARS syntax** (Easy Approach to Requirements Syntax):
   - `WHEN <trigger> THE SYSTEM SHALL <response>`
   - `WHILE <state> THE SYSTEM SHALL <response>`
   - `IF <condition> THEN THE SYSTEM SHALL <response>`
   - `WHERE <feature is on> THE SYSTEM SHALL <response>`
4. **Priority keys:** `MUST` (launch blocker), `SHOULD` (important, can slip one phase), `COULD` (nice to have).
5. **Every acceptance criterion must become an automated test** where practical ([Section 13](#13-testing-and-acceptance)).
6. **The database ledger is the source of truth** for stock. The AI never writes stock numbers.

---

## 1. Overview

### 1.1 Problem
Hospitals run on consumables, medicines, blood, oxygen and equipment, yet stock is often tracked on paper or spreadsheets. When an emergency arrives (a road accident with many casualties, a fire, an outbreak) staff lose critical minutes working out what is needed, how much, and where it is stored.

### 1.2 Vision
MedPulse is warehouse-management software built for hospitals. It keeps stock accurate through disciplined **manual counting** and movement logging, then uses Gemini to **pre-calculate emergency scenarios** so the hospital already knows the requirements, the shortfalls and the pick routes before the emergency happens.

### 1.3 Goals
| ID | Goal |
|---|---|
| G1 | Know what stock exists, where it is, and when it expires, per location and batch |
| G2 | Keep stock accurate with a fast, glove-friendly manual counter with variance control |
| G3 | Tell each ward exactly what it needs to get back to PAR level |
| G4 | Pre-compute emergency scenarios and show a live readiness score |
| G5 | Reduce time-to-ready when a scenario is activated, with tasks, reservations and notifications |
| G6 | Full audit trail suitable for regulated environments |

### 1.4 Non-goals (v1.0)
- No patient records, no patient-identifiable data anywhere in the system
- No billing or insurance
- No automatic ordering without human approval
- No automated stock adjustments by AI
- No hardware integrations (RFID, smart cabinets, IoT sensors). Temperature and pressure are manual entries in v1.0
- Barcode/QR scanning is **In Testing** (see MP-SCN-*), not a launch dependency

### 1.5 Success metrics
| Metric | Target |
|---|---|
| Time to count a 50-item ward PAR sheet | Under 10 minutes |
| Count accuracy (items within tolerance on first count) | At least 90% after 3 months |
| Scenario plan load time (cached) | Under 2 seconds |
| Scenario plan generation (new) | Under 30 seconds |
| Items past expiry in active stock | 0 |
| Readiness score data freshness | Updated nightly, plus on every approved count |

---

## 2. Principles (non-negotiables)

| # | Principle | Consequence |
|---|---|---|
| P1 | **Ledger is truth.** Stock = sum of append-only `stock_movements`. | No direct edits to `stock_levels`. Corrections are new movements. |
| P2 | **Humans decide.** AI suggests, humans approve. | Scenario activation, PAR changes and stock adjustments always need a person. |
| P3 | **AI never does stock arithmetic.** | Gemini returns *requirements*. Shortfalls and readiness are computed deterministically by the server. |
| P4 | **No key in the app.** | Gemini key lives only in Edge Function secrets. |
| P5 | **No patient data.** | Only stock, location, role and scenario parameters reach Gemini. No names, not even staff names (roles only). |
| P6 | **Separation of duties.** | The person who counts cannot approve; controlled items need a witness. |
| P7 | **Offline-first for the floor.** | Counting and stock lookup work with no connectivity. |
| P8 | **Never rely on color alone.** | Every status has an icon and a label (accessibility). |
| P9 | **Fail safe.** | If Gemini is down, cached plans and manual workflows still work. |
| P10 | **Small, large-touch, one-hand UI.** | Min 48px targets, 56px for counter buttons, usable with gloves. |

---

## 3. Users, roles and permissions

### 3.1 Roles
| Role | Purpose |
|---|---|
| `admin` | Hospital administrator: users, settings, flags, reports |
| `store_manager` | Stock, suppliers, POs, creates and approves counts |
| `pharmacist` | Medicines, expiry, controlled drugs, witnesses controlled counts |
| `nurse` | Ward in-charge/nurse: requests, receipts, ward counts |
| `coordinator` | Emergency coordinator: scenarios, approval, activation |
| `auditor` | Read-only plus audit logs |

### 3.2 Permission matrix
`Y` = allowed, `Own` = only own records/assigned location, `-` = no.

| Capability | admin | store_manager | pharmacist | nurse | coordinator | auditor |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| View stock (scoped by location) | Y | Y | Y | Own | Y | Y |
| Record receive / issue / transfer manually | Y | Y | Y | Own | - | - |
| Create count session | Y | Y | Y | - | - | - |
| Perform count | Y | Y | Y | Own | - | - |
| Witness controlled-drug / blood count | Y | - | Y | - | - | - |
| Approve count variance | Y | Y | Y (controlled) | - | - | - |
| Create requisition | Y | Y | Y | Own | - | - |
| Approve requisition | Y | Y | - | - | - | - |
| Create / approve purchase order | Y | Y | - | - | - | - |
| Generate scenario plan | Y | - | - | - | Y | - |
| Approve and activate scenario | Y | - | - | - | Y | - |
| Use "Ask MedPulse" assistant | Y | Y | Y | Y | Y | Y (read-only tools) |
| Manage users, PAR levels, reason codes | Y | PAR only | - | - | - | - |
| Toggle feature flags | Y | - | - | - | - | - |
| View audit log | Y | - | - | - | - | Y |

---

## 4. Scope map and feature flags

| Module | Code | Phase | Flag |
|---|---|---|---|
| Auth & access | AUTH | 0 | none |
| Inventory & items | INV | 1 | none |
| Manual movements | MOV | 1 | none |
| **Manual Stock Counter** | CNT | 2 | none |
| **Barcode/QR scanning (In Testing)** | SCN | 8 | `scanner_beta` (default OFF) |
| Alerts | ALR | 3 | none |
| Requisitions & procurement | REQ | 4 | none |
| AI task manager | TSK | 5 | `ai_tasks` (default ON) |
| Scenario engine | SCN-E → **SEN** | 6 | `ai_scenarios` (default ON) |
| Activation board | ACT | 7 | none |
| Assistant | AST | 5 | `ai_assistant` (default ON) |
| Reports & audit | RPT | 9 | none |
| Localisation (EN/HI) | I18N | 9 | none |

> Note: scanning uses prefix **SCN**; the scenario engine uses prefix **SEN** to avoid collision.

---

## 5. Functional requirements

### 5.1 AUTH: Authentication and access

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| MP-AUTH-001 | MUST | WHEN a user submits a valid email THE SYSTEM SHALL send a one-time passcode (OTP) and sign the user in on correct entry. | Given a registered email, when OTP is entered within 10 minutes, then a session is created. Wrong or expired OTP shows an error and does not create a session. |
| MP-AUTH-002 | MUST | THE SYSTEM SHALL assign every user exactly one role and one or more hospital locations. | A user with no role cannot reach any data screen. |
| MP-AUTH-003 | MUST | THE SYSTEM SHALL enforce all access using Postgres Row Level Security, not client checks alone. | Direct API calls with a nurse token cannot read another ward's stock. Automated RLS test per role. |
| MP-AUTH-004 | MUST | THE SYSTEM SHALL store session tokens in `expo-secure-store`. | No token in AsyncStorage or logs. |
| MP-AUTH-005 | SHOULD | WHEN the app is idle for 15 minutes THE SYSTEM SHALL require re-authentication (biometric or OTP) before showing data. | Idle timeout configurable by admin. |
| MP-AUTH-006 | MUST | THE SYSTEM SHALL record sign-in, sign-out and role changes in `audit_logs`. | Entries include user, time, action. |

### 5.2 INV: Inventory

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| MP-INV-001 | MUST | THE SYSTEM SHALL maintain an item catalog with: SKU, name, category, base unit, optional barcode, criticality (A/B/C), controlled flag, cold-chain flag, expiry-tracked flag, batch-tracked flag, cost, supplier. | Creating an item with a duplicate SKU in a hospital is rejected. |
| MP-INV-002 | MUST | THE SYSTEM SHALL support multiple units of measure per item with integer conversion factors to the base unit (e.g. 1 box = 10 strips = 100 tablets). | 3 boxes entered = 300 base units stored. |
| MP-INV-003 | MUST | THE SYSTEM SHALL track stock per item, per location, per batch, with expiry date. | Stock view can be grouped by location or by batch. |
| MP-INV-004 | MUST | THE SYSTEM SHALL support locations of types: central_store, pharmacy, er, icu, ot, ward, blood_bank. | Locations can be nested (ward → room/shelf) to one extra level. |
| MP-INV-005 | MUST | THE SYSTEM SHALL maintain `par_levels` (par, min, max) per item per location. | Par must satisfy `min <= par <= max`. |
| MP-INV-006 | MUST | THE SYSTEM SHALL separate stock by condition: `usable`, `damaged`, `expired`, `quarantined`. | Only `usable` stock counts toward availability, PAR and scenario readiness. |
| MP-INV-007 | MUST | THE SYSTEM SHALL provide FEFO pick suggestions (earliest expiry first) when issuing. | Issue screen lists batches ordered by expiry ascending and pre-selects the first. |
| MP-INV-008 | MUST | THE SYSTEM SHALL provide search by name, SKU or barcode text, with filters for category, location and status. | Search returns within 300 ms for 10,000 items on a mid-range phone (local cache). |
| MP-INV-009 | SHOULD | THE SYSTEM SHALL support oxygen cylinders with fields: size, status (full / in-use / empty), pressure. | Cylinder below 50% pressure raises an alert. |
| MP-INV-010 | SHOULD | THE SYSTEM SHALL support blood units by ABO/Rh group, expiry and status. | Blood stock view groups by blood group. |
| MP-INV-011 | MUST | THE SYSTEM SHALL cache inventory for offline read. | With airplane mode on, item search and stock detail still work, showing "Last synced <time>". |

### 5.3 MOV: Manual stock movements

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| MP-MOV-001 | MUST | THE SYSTEM SHALL record movements of types: `receive` (GRN), `issue`, `transfer`, `return`, `wastage`, `adjustment`, `count_adjustment`. | Each movement stores item, batch, from/to location, quantity (base units), type, reason, user, timestamp. |
| MP-MOV-002 | MUST | THE SYSTEM SHALL make `stock_movements` append-only. | UPDATE and DELETE on the table are blocked by policy and trigger. |
| MP-MOV-003 | MUST | WHEN a movement is saved THE SYSTEM SHALL update `stock_levels` atomically in the same transaction. | Concurrent issues cannot drive stock negative. |
| MP-MOV-004 | MUST | IF an issue or transfer would make usable stock negative THEN THE SYSTEM SHALL block it and show the available quantity. | Error shows "Only 12 available". |
| MP-MOV-005 | MUST | THE SYSTEM SHALL provide manual forms for Receive, Issue and Transfer: item search → location → quantity (with UoM) → batch/expiry → confirm. | A trained user completes an issue in under 30 seconds. |
| MP-MOV-006 | MUST | WHEN a batch-tracked item is received THE SYSTEM SHALL require batch number and expiry date. | Missing batch or expiry blocks save. |
| MP-MOV-007 | MUST | WHEN wastage or adjustment is recorded THE SYSTEM SHALL require a reason code. | See reason code list in 5.4. |
| MP-MOV-008 | SHOULD | WHEN the device is offline THE SYSTEM SHALL queue movements locally and sync them in order when online. | Queue persists across app restarts; failed items show "Needs attention". |
| MP-MOV-009 | MUST | THE SYSTEM SHALL make queued writes idempotent using a client-generated UUID. | Replaying the same request never creates a duplicate movement. |

### 5.4 CNT: Manual Stock Counter (primary accuracy mechanism)

#### 5.4.1 Count types and session lifecycle

| Type | Purpose |
|---|---|
| `par` | Count a location and compare to PAR; calculates what is needed |
| `cycle` | Rotating subset of items (A weekly, B monthly, C quarterly) |
| `full` | Whole location, for audits or year-end |
| `spot` | Single-item quick verification |

**Status flow**

```
draft → scheduled → in_progress → submitted → pending_approval
                                       │              │
                                       │              ├─→ recount_requested → in_progress (recount lines)
                                       │              ├─→ approved → posted
                                       │              └─→ rejected
                                       └─ (auto-approve if all lines within tolerance and policy allows) → posted
```

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| MP-CNT-001 | MUST | WHEN a manager creates a count session THE SYSTEM SHALL capture: type, location, item list (filter by category/criticality/all), assignee, due date, mode (`blind` or `visible`), and variance tolerance. | Session appears in the assignee's "To Do" list with a push notification. |
| MP-CNT-002 | MUST | THE SYSTEM SHALL default tolerance to 2%, with 0% for controlled drugs and blood, and 5% for low-value consumables (C-class). Admin may change defaults. | A controlled-drug line with variance 1 unit is out of tolerance. |
| MP-CNT-003 | MUST | WHILE a session is `blind` THE SYSTEM SHALL NOT send the system quantity to the counting client. | Inspecting network traffic for a blind session shows no `system_qty`. (Server returns it only after submit.) |
| MP-CNT-004 | MUST | WHILE a session is `visible` THE SYSTEM SHALL show the system quantity and a live variance chip (match / small variance / above tolerance). | Chip changes as the counter changes. |
| MP-CNT-005 | MUST | THE SYSTEM SHALL provide a counter control with large −/+ buttons (min 56px), tap-to-type numeric entry, quick-add chips (+5, +10, +50), long-press repeat, and haptic feedback. | Counter value can be set to any integer 0–999,999 in under 3 taps for common values. |
| MP-CNT-006 | MUST | THE SYSTEM SHALL let the counter switch unit of measure during a count and convert to base units automatically. | 3 boxes of 10 shows "= 30 units". |
| MP-CNT-007 | MUST | WHERE an item is batch-tracked THE SYSTEM SHALL let the counter add one line per batch with batch number, expiry and quantity. | Unknown batch numbers are allowed but flagged "New batch". |
| MP-CNT-008 | MUST | THE SYSTEM SHALL split counted quantity by condition (Good / Damaged / Expired / Quarantined). | Only Good contributes to usable stock after posting; others post as separate condition stock or wastage per reason. |
| MP-CNT-009 | MUST | THE SYSTEM SHALL provide "Not found / Zero", "Skip", "Add note" and "Add photo" per line. | Skipped items remain "uncounted" in the submit summary. |
| MP-CNT-010 | MUST | THE SYSTEM SHALL autosave after every change and support undo of the last entry. | Force-quitting the app loses no more than the last edit. |
| MP-CNT-011 | MUST | THE SYSTEM SHALL allow counting fully offline and sync on reconnect. | Count started offline can be submitted offline; it syncs automatically. |
| MP-CNT-012 | MUST | WHEN the counter taps Submit THE SYSTEM SHALL show a summary (counted vs uncounted) and require confirmation. | Submitting with uncounted lines requires explicit "Submit anyway". |
| MP-CNT-013 | MUST | WHEN a session is submitted THE SYSTEM SHALL snapshot `system_qty` at submit time and calculate variance qty and variance % per line. | `variance = counted_good − system_qty_snapshot`. |
| MP-CNT-014 | MUST | IF stock movements occurred in the location between count start and submit THEN THE SYSTEM SHALL flag affected lines "Stock moved during count". | Flag appears in the review screen with the movement list. |
| MP-CNT-015 | SHOULD | WHERE a full count is started THE SYSTEM SHALL offer an optional location movement lock for its duration. | Locked locations reject movements with a clear message; admin can override. |
| MP-CNT-016 | MUST | IF a line's variance exceeds the session tolerance THEN THE SYSTEM SHALL set the line to `recount_requested` and assign it to a user different from the original counter where one is available. | Original counter's ID ≠ recounter's ID when ≥ 2 eligible users exist. |
| MP-CNT-017 | MUST | IF variance persists after recount THEN THE SYSTEM SHALL require an approver to choose a reason code and add a note (photo optional) before approving. | Approve button disabled until reason code selected. |
| MP-CNT-018 | MUST | THE SYSTEM SHALL prevent the counter of a session (or any of its lines) from approving it. | DB trigger raises an error; UI hides Approve. Automated test. |
| MP-CNT-019 | MUST | WHERE an item is controlled or blood THE SYSTEM SHALL require a second-person witness sign-off (witness PIN or confirmation) at count time. | Line cannot be submitted without `witness_id`; witness ≠ counter. |
| MP-CNT-020 | MUST | WHEN a session is approved THE SYSTEM SHALL post `count_adjustment` movements for each line with non-zero variance, in one transaction, and write to `audit_logs`. | Posting twice is impossible (idempotent by session ID). |
| MP-CNT-021 | MUST | THE SYSTEM SHALL provide reason codes: Miscount, Unrecorded issue, Unrecorded receipt, Wastage/spillage, Damaged, Expired, Theft/loss suspected, Transfer not recorded, Wrong unit of measure, Found stock, Other (note required). Admin can add codes. | Reason is stored per adjusted line and visible in history. |
| MP-CNT-022 | MUST | WHEN a `par` count is submitted THE SYSTEM SHALL compute and display the **What's Needed** result (Section 10.1). | Result shows per item: PAR, counted usable, needed, rounded-to-pack suggestion, and flags. |
| MP-CNT-023 | MUST | FROM the What's Needed screen THE SYSTEM SHALL offer one-tap: create requisition (ward → store), create PO draft (store → supplier), or transfer from Central Store (shows availability). | Created documents are pre-filled with the needed quantities. |
| MP-CNT-024 | SHOULD | THE SYSTEM SHALL show per-item count history (who, when, variance) and a "repeat variance" list (items with variance in ≥ 3 of the last 5 counts). | List is available to managers and feeds AI variance analysis. |
| MP-CNT-025 | SHOULD | WHERE an item is an oxygen cylinder THE SYSTEM SHALL count by status (full / in-use / empty) with a pressure field. | Counts post per status. |
| MP-CNT-026 | COULD | WHERE an item is cold-chain THE SYSTEM SHALL offer an optional temperature reading field at count time. | Out-of-range reading creates an alert. |
| MP-CNT-027 | SHOULD | THE SYSTEM SHALL export a count report (PDF/CSV) for any session. | Export includes lines, variances, reasons, counter, approver, witness. |

**Count screen layout (portrait)**

```
┌──────────────────────────────────┐
│ ←  ICU PAR Count        12 / 48  │  header + progress bar
├──────────────────────────────────┤
│ [photo]  Normal Saline 0.9% 500ml│
│          SKU NS-500 · Bin B2     │
│          Last counted 6 days ago │
│          (Visible mode) System 40│  hidden in blind mode
├──────────────────────────────────┤
│  Unit: [ Box (x20) ▾ ]  = 40 u   │
│                                  │
│   [  −  ]     2     [  +  ]      │  48px number, 56px buttons
│   [+5] [+10] [+50]               │
│                                  │
│  Condition: Good 2 · Dmg 0 · Exp 0│
│  Batch/expiry rows  [+ Add batch]│
│  [Note] [Photo] [Zero] [Skip]    │
├──────────────────────────────────┤
│  [ ◀ Prev ]            [ Next ▶ ]│
└──────────────────────────────────┘
```

### 5.5 SCN: Barcode / QR scanning (IN TESTING)

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| MP-SCN-001 | MUST | THE SYSTEM SHALL keep all scanner code behind the feature flag `scanner_beta`, default OFF, toggleable per hospital and per user by admin. | With the flag OFF, no scan icon renders anywhere; all workflows complete without it. |
| MP-SCN-002 | MUST | WHERE `scanner_beta` is ON THE SYSTEM SHALL display a visible **"In Testing"** badge (Powder Blush chip, dark text) next to every scan entry point. | Badge appears on search bar, Count screen, Receive/Issue. |
| MP-SCN-003 | MUST | WHEN a user opens the scanner for the first time THE SYSTEM SHALL show a notice: "Scanning is in testing. Please double-check the item and quantity before confirming." | Notice shown once per user, re-viewable in Settings. |
| MP-SCN-004 | MUST | WHEN a code is scanned THE SYSTEM SHALL only pre-select the item. The user SHALL still enter and confirm quantity manually. | A scan never changes stock or a count by itself. |
| MP-SCN-005 | SHOULD | THE SYSTEM SHALL log scan outcomes (success, no match, multiple match, error) to `scan_events` and provide a "Report a scan problem" button. | Admin can view scan success rate. |
| MP-SCN-006 | MUST | THE SYSTEM SHALL support camera permission denial gracefully. | Denied permission shows manual search and a settings link. |

### 5.6 ALR: Alerts

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| MP-ALR-001 | MUST | THE SYSTEM SHALL raise alerts for: below min, below PAR, expiring in 30/60/90 days, expired in usable stock, count overdue, count variance above tolerance, temperature breach, cylinder pressure low. | Alert has type, severity, item/location, created time, status (open/acknowledged/resolved). |
| MP-ALR-002 | MUST | THE SYSTEM SHALL evaluate alerts on every stock change and on a nightly job. | Expiry alerts appear without any user action. |
| MP-ALR-003 | MUST | THE SYSTEM SHALL map severity to status colors with icon and label: Healthy = Pearl Aqua, Warning = Powder Blush, Critical = Dark Raspberry. | Contrast ratio ≥ 4.5:1 for text on each. |
| MP-ALR-004 | SHOULD | THE SYSTEM SHALL push-notify the relevant role for Critical alerts. | Notification opens the alert detail. |
| MP-ALR-005 | MUST | WHEN an expired batch has usable stock THE SYSTEM SHALL prompt to move it to `expired` condition (a movement, with reason). | Expired stock disappears from available totals once moved. |

### 5.7 REQ: Requisitions and procurement

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| MP-REQ-001 | MUST | THE SYSTEM SHALL support ward requisitions with lines (item, quantity, UoM, urgency) and states: draft, submitted, approved, rejected, partially fulfilled, fulfilled. | Approver can edit quantities before approval; changes are logged. |
| MP-REQ-002 | MUST | WHEN a requisition is fulfilled THE SYSTEM SHALL create the transfer movements and let the ward confirm receipt. | Receipt confirmation by a ward user closes the loop. |
| MP-REQ-003 | MUST | THE SYSTEM SHALL support suppliers and purchase orders (draft → sent → partially received → received → closed). | Receiving against a PO creates GRN movements. |
| MP-REQ-004 | SHOULD | THE SYSTEM SHALL show AI-suggested reorder quantities with the reasoning, editable before submission. | Suggestion never auto-submits. |
| MP-REQ-005 | SHOULD | THE SYSTEM SHALL track delivery status and expected date on POs. | Overdue deliveries create an alert. |

### 5.8 TSK: AI Task Manager

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| MP-TSK-001 | MUST | THE SYSTEM SHALL generate daily tasks (restock, rotate expiring batches, calibrate equipment, count cylinders, cycle counts) per role and shift. | Tasks include title, due time, location, role, priority (critical/high/normal) and a one-line reasoning. |
| MP-TSK-002 | MUST | THE SYSTEM SHALL create "Cycle count" tasks from item criticality, last-counted date, expiry risk and past variances. | A-class items never exceed 7 days since last count without a task. |
| MP-TSK-003 | MUST | THE SYSTEM SHALL let users mark tasks done, snooze (with reason) or escalate (to the next role). | All actions stored in `task_events`. |
| MP-TSK-004 | MUST | THE SYSTEM SHALL generate tasks with a deterministic rules engine first and use Gemini only to prioritise, group and explain. | If Gemini is unavailable, rule-based tasks still generate with templated reasoning. |
| MP-TSK-005 | SHOULD | THE SYSTEM SHALL analyse count variances weekly and suggest PAR changes with evidence (suggestion only). | A manager must accept a suggestion for it to change `par_levels`. |
| MP-TSK-006 | MUST | WHEN a task is auto-generated THE SYSTEM SHALL de-duplicate against open tasks for the same item/location/type. | Re-running generation creates no duplicates. |

### 5.9 AST: "Ask MedPulse" assistant

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| MP-AST-001 | MUST | THE SYSTEM SHALL answer natural-language stock questions using Gemini function calling over a **whitelist of read-only tools** (Section 9.3). | The model cannot run arbitrary SQL; unknown tool calls are rejected and logged. |
| MP-AST-002 | MUST | THE SYSTEM SHALL execute tool calls with the **caller's** permissions (RLS applies). | A nurse asking about another ward gets "No access". |
| MP-AST-003 | MUST | THE SYSTEM SHALL show data answers with "as of <timestamp>" and a link to the underlying screen. | Answer card includes timestamp. |
| MP-AST-004 | SHOULD | WHEN Gemini is unavailable THE SYSTEM SHALL show a fallback message and offer search instead. | No crash; error logged. |
| MP-AST-005 | MUST | THE SYSTEM SHALL NOT perform writes via the assistant in v1.0. | No write tool exists in the whitelist. |

### 5.10 SEN: Scenario engine (headline feature)

**Scenario templates (v1.0):** Road accident / mass casualty, fire, building collapse, disease outbreak, chemical exposure, cardiac surge, natural disaster, mass food poisoning, maternity surge.

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| MP-SEN-001 | MUST | THE SYSTEM SHALL provide scenario templates with editable parameters: casualty count, injury mix (trauma, burns, head injury, fractures, other), time of day, arrival window (minutes). | Parameter ranges validated (e.g. casualties 1–500). |
| MP-SEN-002 | MUST | WHEN a coordinator taps Generate Plan THE SYSTEM SHALL call Gemini with parameters, the item catalog (IDs and names only) and role list, and require a structured JSON plan matching the schema in Section 9.1. | Invalid JSON or schema violation → one automatic retry → then a clear error; nothing is saved. |
| MP-SEN-003 | MUST | THE SYSTEM SHALL compute shortfalls and readiness **server-side** by comparing the plan's required quantities against current **usable** stock (Section 10.3). | Changing stock changes readiness without calling Gemini again. |
| MP-SEN-004 | MUST | THE SYSTEM SHALL display each plan with: summary, assumptions, resources needed vs available (green/amber/red with icons), shortfalls with severity, staff by role, timeline checklist (T-0 to T+60), storage location and pick route per item, and suggested borrowing/emergency procurement. | All sections present on the Plan screen. |
| MP-SEN-005 | MUST | THE SYSTEM SHALL cache plans and serve cached plans instantly, even offline. | Plan screen loads in under 2 s with no network. |
| MP-SEN-006 | MUST | THE SYSTEM SHALL refresh each scenario's readiness score nightly and after each approved count that affects its items. | `scenario_plans.readiness_score` and `computed_at` update. |
| MP-SEN-007 | MUST | THE SYSTEM SHALL show data confidence per plan (High / Medium / Low) based on how recently relevant items were counted. | Item rows show "Last counted N days ago"; stale items are marked. |
| MP-SEN-008 | MUST | THE SYSTEM SHALL require a human coordinator to review and approve a plan before it can be activated, with assumptions visible at approval. | Activate button disabled until status = `approved`. |
| MP-SEN-009 | MUST | WHEN Gemini is unavailable THE SYSTEM SHALL serve the last cached plan and mark it with its generation time. | Banner: "Showing saved plan from <date>". |
| MP-SEN-010 | SHOULD | THE SYSTEM SHALL let a coordinator duplicate and edit a scenario's parameters and regenerate. | Plans are versioned. |
| MP-SEN-011 | MUST | THE SYSTEM SHALL map Gemini's item references to catalog item IDs and ignore or flag any unknown item. | Unknown items listed as "Unmapped (needs review)". |

### 5.11 ACT: Scenario activation and live board

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| MP-ACT-001 | MUST | WHEN a coordinator activates an approved plan THE SYSTEM SHALL create tasks for each role/location from the checklist, send push notifications, and open the live board. | Tasks appear on assignees' devices within 10 s. |
| MP-ACT-002 | SHOULD | WHEN a plan is activated THE SYSTEM SHALL create soft reservations on stock for required items. | Reserved quantity is visible and excluded from "available to issue" for non-scenario movements. |
| MP-ACT-003 | MUST | THE SYSTEM SHALL show a live board: progress ring, task columns (To do / In progress / Done), shortfall tracker, updating via Realtime. | Completing a task updates all viewers within 3 s. |
| MP-ACT-004 | MUST | THE SYSTEM SHALL allow the coordinator to stand down an activation, releasing reservations and closing open tasks with a reason. | Stand-down is audit-logged. |
| MP-ACT-005 | SHOULD | THE SYSTEM SHALL provide a high-visibility Emergency Mode (larger type, high contrast, simplified navigation) during an activation. | Switchable manually or auto-on at activation. |

### 5.12 RPT: Reports and audit

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| MP-RPT-001 | MUST | THE SYSTEM SHALL provide: readiness by scenario, consumption trends, wastage, expiry loss, stock-out history, and **count accuracy** (accuracy % per location, recount rate, variance value, overdue counts, top variance items). | Each report filters by date range and location. |
| MP-RPT-002 | MUST | THE SYSTEM SHALL keep an immutable audit log of all stock, count, approval, role, flag and activation actions. | Log shows who, what, when, before/after summary. |
| MP-RPT-003 | MUST | THE SYSTEM SHALL export reports and audit logs as CSV and PDF. | File opens in the device share sheet. |

### 5.13 I18N and accessibility

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| MP-I18N-001 | MUST | THE SYSTEM SHALL support English and Hindi, switchable in Settings, with no hard-coded UI strings. | Language switch applies without restart. |
| MP-I18N-002 | MUST | THE SYSTEM SHALL meet WCAG 2.1 AA contrast and support dynamic type up to 200%. | Automated contrast check on all token pairs. |
| MP-I18N-003 | MUST | THE SYSTEM SHALL provide screen-reader labels on all interactive controls, including the counter. | Counter announces "Quantity 2, adjustable". |
| MP-I18N-004 | SHOULD | THE SYSTEM SHALL provide a dark mode. | Both themes pass contrast checks. |

---

## 6. Architecture

```
┌────────────────────────────┐        ┌──────────────────────────────────────┐
│ Expo / React Native app    │        │ Supabase                             │
│ - Expo Router              │  HTTPS │ - Auth (OTP)                         │
│ - TanStack Query + Zustand │◀──────▶│ - Postgres + RLS + triggers          │
│ - Offline store (SQLite)   │        │ - Realtime (stock, tasks, activations)│
│ - Write queue (idempotent) │        │ - Storage (count photos)             │
│ - i18n (EN/HI)             │        │ - pg_cron (nightly jobs)             │
└────────────────────────────┘        │ - Edge Functions (Deno/TS)           │
                                      └───────────────┬──────────────────────┘
                                                      │ server-side only
                                                      ▼
                                              Google Gemini API
```

### 6.1 Technology decisions
| Area | Decision | Reason |
|---|---|---|
| Navigation | Expo Router | File-based, deep links for notifications |
| Server state | TanStack Query | Caching, retries, offline persistence |
| Local state | Zustand | Small, simple (counter drafts, UI state) |
| Offline DB | expo-sqlite (or WatermelonDB) | Offline reads and queued writes |
| Charts | react-native-svg + small chart helpers | Lightweight |
| Animations | react-native-reanimated | Smooth gauge/counter feedback |
| Haptics | expo-haptics | Counter feedback |
| Push | expo-notifications | Alerts, tasks, activation |
| Photos | expo-image-picker → Supabase Storage | Count evidence |
| AI models | Fast "Flash" tier for tasks/assistant; stronger tier for scenario planning | Cost/latency vs quality. Model names are config, not code |

### 6.2 Folder structure
```
medpulse/
├─ app/                         # Expo Router screens
│  ├─ (auth)/login.tsx
│  ├─ (tabs)/
│  │  ├─ index.tsx              # Home
│  │  ├─ inventory/             # items, counts, movements
│  │  ├─ scenarios/
│  │  ├─ tasks/
│  │  └─ more/
│  ├─ count/[sessionId].tsx     # counter
│  ├─ scenario/[id]/plan.tsx
│  └─ activation/[id].tsx
├─ src/
│  ├─ components/ (Counter, StatusChip, ReadinessGauge, ...)
│  ├─ features/ (inventory, counting, scenarios, tasks, ...)
│  ├─ lib/ (supabase, offlineQueue, i18n, flags)
│  ├─ theme/ (tokens.ts)
│  └─ locales/ (en.json, hi.json)
├─ supabase/
│  ├─ migrations/
│  ├─ functions/
│  │  ├─ generate-tasks/
│  │  ├─ scenario-plan/
│  │  ├─ refresh-readiness/
│  │  ├─ assistant-query/
│  │  ├─ post-count/
│  │  └─ analyze-variances/
│  ├─ seed.sql
│  └─ tests/ (rls, triggers)
├─ specs/MedPulse-SPEC.md
└─ README.md                    # "Designed & developed by Rajiv Kumar Singh"
```

---

## 7. Data model

All quantities are **integers in base units**. All tables carry `hospital_id` and have RLS enabled.

### 7.1 Core tables (excerpt)

```sql
-- Enums
create type user_role as enum ('admin','store_manager','pharmacist','nurse','coordinator','auditor');
create type stock_condition as enum ('usable','damaged','expired','quarantined');
create type movement_type as enum ('receive','issue','transfer','return','wastage','adjustment','count_adjustment');
create type count_type as enum ('par','cycle','full','spot');
create type count_mode as enum ('blind','visible');
create type count_status as enum ('draft','scheduled','in_progress','submitted','pending_approval','recount_requested','approved','posted','rejected');

create table profiles (
  id uuid primary key references auth.users,
  hospital_id uuid not null references hospitals,
  full_name text not null,
  role user_role not null,
  locale text not null default 'en'
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null,
  parent_id uuid references locations,
  name text not null,
  type text not null check (type in ('central_store','pharmacy','er','icu','ot','ward','blood_bank'))
);

create table items (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null,
  sku text not null,
  name text not null,
  category_id uuid references categories,
  base_unit text not null,
  barcode text,
  criticality char(1) not null default 'B' check (criticality in ('A','B','C')),
  is_controlled boolean not null default false,
  is_cold_chain boolean not null default false,
  tracks_batch boolean not null default true,
  tracks_expiry boolean not null default true,
  unit_cost numeric(12,2),
  supplier_id uuid references suppliers,
  unique (hospital_id, sku)
);

create table item_units (
  item_id uuid references items,
  unit text not null,
  factor_to_base int not null check (factor_to_base > 0),
  primary key (item_id, unit)
);

create table batches (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items,
  batch_no text not null,
  expiry_date date,
  unique (item_id, batch_no)
);

create table par_levels (
  item_id uuid references items,
  location_id uuid references locations,
  min_qty int not null,
  par_qty int not null,
  max_qty int not null,
  check (min_qty <= par_qty and par_qty <= max_qty),
  primary key (item_id, location_id)
);

-- Ledger (append-only)
create table stock_movements (
  id uuid primary key,                       -- client-generated for idempotency
  hospital_id uuid not null,
  item_id uuid not null references items,
  batch_id uuid references batches,
  from_location_id uuid references locations,
  to_location_id uuid references locations,
  condition stock_condition not null default 'usable',
  qty int not null check (qty > 0),
  type movement_type not null,
  reason_code text,
  ref_type text, ref_id uuid,                -- e.g. 'count_session', 'requisition'
  created_by uuid not null references profiles,
  created_at timestamptz not null default now()
);
create index on stock_movements (item_id, created_at);

-- Maintained by trigger from stock_movements only
create table stock_levels (
  item_id uuid, batch_id uuid, location_id uuid, condition stock_condition,
  qty int not null default 0 check (qty >= 0),
  reserved_qty int not null default 0 check (reserved_qty >= 0),
  last_counted_at timestamptz,
  primary key (item_id, batch_id, location_id, condition)
);
create index on batches (expiry_date);
```

### 7.2 Counting tables

```sql
create table count_sessions (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null,
  type count_type not null,
  mode count_mode not null default 'blind',
  location_id uuid not null references locations,
  status count_status not null default 'draft',
  tolerance_pct numeric(5,2) not null default 2.00,
  assigned_to uuid references profiles,
  created_by uuid references profiles,
  approved_by uuid references profiles,
  due_date date,
  started_at timestamptz, submitted_at timestamptz, approved_at timestamptz, posted_at timestamptz
);
create index on count_sessions (status, location_id);

create table count_lines (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references count_sessions on delete cascade,
  item_id uuid not null references items,
  batch_id uuid references batches,
  batch_no_entered text, expiry_entered date,   -- when batch is new
  system_qty_snapshot int,                       -- null until submit in blind mode
  counted_good int not null default 0,
  counted_damaged int not null default 0,
  counted_expired int not null default 0,
  counted_quarantined int not null default 0,
  variance int generated always as (counted_good - coalesce(system_qty_snapshot,0)) stored,
  status text not null default 'pending'
    check (status in ('pending','counted','skipped','recount_requested','recounted','approved')),
  reason_code text,
  note text, photo_path text,
  counted_by uuid references profiles,
  witness_id uuid references profiles,
  recount_of uuid references count_lines,
  moved_during_count boolean not null default false
);

create table count_reason_codes (
  code text primary key, label_en text not null, label_hi text,
  requires_note boolean not null default false, is_active boolean not null default true
);

create table feature_flags (
  key text, hospital_id uuid, user_id uuid, enabled boolean not null default false,
  primary key (key, hospital_id, coalesce(user_id, '00000000-0000-0000-0000-000000000000'))
);

create table scan_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid, context text, outcome text check (outcome in ('success','no_match','multi_match','error')),
  raw_value text, created_at timestamptz default now()
);
```

### 7.3 Scenario and task tables

```sql
create table scenarios (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null,
  template text not null,
  name text not null,
  parameters jsonb not null
);

create table scenario_plans (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios,
  version int not null,
  requirements jsonb not null,            -- Gemini output (validated)
  shortfalls jsonb,                       -- computed server-side
  readiness_score numeric(5,2),
  confidence text check (confidence in ('high','medium','low')),
  status text not null default 'pending_approval'
    check (status in ('pending_approval','approved','rejected','superseded')),
  generated_at timestamptz not null default now(),
  computed_at timestamptz,
  approved_by uuid references profiles, approved_at timestamptz,
  model text, prompt_version text
);

create table scenario_activations (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references scenario_plans,
  activated_by uuid not null references profiles,
  activated_at timestamptz not null default now(),
  stood_down_at timestamptz, stand_down_reason text
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null,
  title text not null, reasoning text,
  priority text not null check (priority in ('critical','high','normal')),
  role user_role, location_id uuid, assigned_to uuid,
  status text not null default 'todo' check (status in ('todo','in_progress','done','snoozed','escalated')),
  due_at timestamptz,
  source text not null check (source in ('rules','ai','scenario','count')),
  source_ref uuid, dedupe_key text unique,
  created_at timestamptz default now()
);
create table task_events (id uuid primary key default gen_random_uuid(), task_id uuid references tasks, actor uuid, action text, note text, at timestamptz default now());
```

Remaining tables (`hospitals`, `categories`, `suppliers`, `purchase_orders`, `po_lines`, `requisitions`, `requisition_lines`, `alerts`, `audit_logs`) follow the same conventions (hospital_id, timestamps, RLS).

### 7.4 Integrity rules and triggers
| Rule | Mechanism |
|---|---|
| `stock_movements` is append-only | `BEFORE UPDATE OR DELETE` trigger raises exception; no UPDATE/DELETE policy |
| Movement updates `stock_levels` atomically | `AFTER INSERT` trigger with row locks; fails if result would be negative |
| Counter cannot approve own session | `BEFORE UPDATE` on `count_sessions`: raise if `approved_by = assigned_to` or exists line with `counted_by = approved_by` |
| Witness ≠ counter for controlled/blood lines | `CHECK` via trigger on `count_lines` |
| Blind-mode system qty not exposed before submit | `count_lines` select policy hides `system_qty_snapshot` while session is `in_progress` and mode = `blind`; use a view for counters |
| Posting once | `post-count` locks the session row, checks `status = 'approved'`, sets `posted` in same transaction |
| Audit everything | `audit_logs` written from triggers/Edge Functions, no client write access |

### 7.5 RLS policy summary
- Every table: `hospital_id = auth_hospital_id()`.
- Location-scoped reads/writes: nurse limited to assigned locations; others to all hospital locations unless restricted.
- Write policies call role checks from the permission matrix (Section 3.2).
- `audit_logs`: insert via service role only; select for `admin` and `auditor`.
- `feature_flags`: select for all users in hospital (to hide/show UI), write for `admin`.

---

## 8. Edge Function contracts

All functions: JWT required, caller identity from token, rate-limited, structured error logging, `request_id` returned.

| Function | Trigger | Input | Output | Notes |
|---|---|---|---|---|
| `generate-tasks` | pg_cron daily 05:30 + on demand | `{ hospital_id? }` | `{ created: n, skipped: n }` | Rules first, Gemini to prioritise/explain |
| `scenario-plan` | App | `{ scenario_id, parameters }` | `{ plan_id, status:'pending_approval' }` | Validates JSON, computes shortfall/readiness, saves |
| `refresh-readiness` | pg_cron nightly 02:00 + after count posted | `{ scenario_id? }` | `{ updated: n }` | No Gemini call; pure computation |
| `assistant-query` | App | `{ message, conversation_id }` | `{ answer, sources[], as_of }` | Whitelisted tools only |
| `post-count` | App (on approve) | `{ session_id }` | `{ posted: n }` | Transactional, idempotent |
| `analyze-variances` | pg_cron weekly | `{ hospital_id }` | `{ suggestions: [...] }` | Suggestions only, stored for manager review |

**Standard error shape**
```json
{ "error": { "code": "GEMINI_UNAVAILABLE", "message": "AI is unavailable. Showing saved data.", "request_id": "..." } }
```
Error codes: `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_FAILED`, `GEMINI_UNAVAILABLE`, `GEMINI_SCHEMA_INVALID`, `RATE_LIMITED`, `CONFLICT`, `INTERNAL`.

---

## 9. AI specification

### 9.1 Scenario plan: Gemini output contract
Gemini receives: scenario template and parameters, the **item catalog as `{item_id, name, category}`** (no stock quantities), role names, and the unit conventions. It returns **JSON only**, validated against this schema:

```json
{
  "type": "object",
  "required": ["summary", "assumptions", "resources", "staff", "timeline"],
  "properties": {
    "summary": { "type": "string", "maxLength": 600 },
    "assumptions": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
    "resources": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["item_id", "required_qty", "unit", "criticality", "basis"],
        "properties": {
          "item_id": { "type": "string" },
          "required_qty": { "type": "integer", "minimum": 0 },
          "unit": { "type": "string" },
          "criticality": { "enum": ["critical", "high", "normal"] },
          "basis": { "type": "string", "description": "short reasoning, e.g. '2 units per severe trauma case'" }
        }
      }
    },
    "beds_and_capacity": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["resource", "required"],
        "properties": { "resource": { "enum": ["icu_bed", "er_bay", "ot_slot", "ventilator", "isolation_bed"] }, "required": { "type": "integer" } }
      }
    },
    "staff": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["role", "count"],
        "properties": { "role": { "type": "string" }, "count": { "type": "integer" } }
      }
    },
    "timeline": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["t_offset_min", "action", "owner_role"],
        "properties": { "t_offset_min": { "type": "integer" }, "action": { "type": "string" }, "owner_role": { "type": "string" } }
      }
    },
    "external_support": { "type": "array", "items": { "type": "string" } }
  }
}
```

**Prompt rules (system prompt for scenario-plan)**
1. You are a hospital emergency-logistics planner. You produce *requirements only*.
2. Use only `item_id`s from the provided catalog. Never invent IDs. If an important item is not in the catalog, list it under `assumptions` as "Not in catalog: ...".
3. Do not state or guess current stock. Do not compute shortfalls.
4. State every assumption (e.g. casualty severity split, average items per case).
5. Output JSON only, matching the schema. No prose, no markdown fences.
6. This is decision support. Quantities are estimates for human review.

**Server-side validation:** schema check → `item_id` existence check → sanity limits (quantity caps per category, configurable) → on failure one retry with the validation error appended → then fail with `GEMINI_SCHEMA_INVALID`.

### 9.2 Task generation
- Rules engine produces candidate tasks (below-PAR, expiring ≤ 30 d, count overdue by criticality, equipment calibration due, cylinder checks).
- Gemini input: candidate task list and counts (no patient data) → output: priority (critical/high/normal), grouping by shift/role, one-line reasoning. Output validated; unknown task IDs ignored.
- If Gemini fails: use rule-based priority and template reasoning (MP-TSK-004).

### 9.3 Assistant tool whitelist (read-only)
| Tool | Parameters | Returns |
|---|---|---|
| `get_stock` | `item_query`, `location_id?` | usable qty per location/batch, as_of |
| `list_expiring` | `days`, `location_id?` | items/batches expiring within window |
| `list_below_par` | `location_id` | items with counted/usable < PAR and needed qty |
| `get_count_status` | `location_id?` | open sessions, overdue counts |
| `get_readiness` | `scenario_id?` | readiness score, top shortfalls, confidence |
| `list_open_tasks` | `role?`, `location_id?` | open tasks |

Every tool runs under the caller's JWT. Tool arguments are validated; the model cannot supply SQL.

### 9.4 Variance analysis
Weekly job passes aggregated variance statistics per item/location (no names) to Gemini, which returns JSON suggestions: `{ item_id, location_id, finding, suggested_par, evidence }`. Stored in `par_suggestions`; managers accept or dismiss.

### 9.5 AI safety and cost controls
- Per-user and per-hospital rate limits; daily token budget with alert at 80%.
- Log `model`, `prompt_version`, latency, token counts, validation result (no user content beyond what is needed).
- Prompts and schemas are versioned in the repo; changes require a test run against fixture scenarios.

---

## 10. Business rules and formulas

### 10.1 What's Needed (PAR count)
For each item in the counted location:

```
usable_counted   = counted_good (all batches, excluding expired)
needed           = max(par_qty − usable_counted, 0)
suggested_order  = ceil(needed / pack_size) × pack_size     # pack_size = largest UoM factor flagged as "order pack"
```
Flags:
- **Below PAR:** `usable_counted < par_qty`
- **At/below MIN:** `usable_counted <= min_qty`
- **Overstock:** `usable_counted > max_qty`
- **Expiring:** any counted batch expiring within 90 days
- **Unusable removed:** damaged + expired + quarantined quantities listed separately

### 10.2 Variance
```
variance_qty = counted_good − system_qty_snapshot
variance_pct = abs(variance_qty) / max(system_qty_snapshot, 1) × 100
out_of_tolerance = variance_pct > tolerance_pct   (any non-zero variance if tolerance = 0)
value_impact     = variance_qty × unit_cost
```

### 10.3 Scenario readiness
For each required resource *r* with required quantity `Rq` and weight `w` (critical = 3, high = 2, normal = 1):

```
available_r = Σ usable stock across relevant locations − reserved (excluding other active scenarios' soft reservations optional)
coverage_r  = min(available_r / Rq, 1)           # 1 if Rq = 0
score_raw   = 100 × Σ(w_r × coverage_r) / Σ(w_r)
```
Cap rule: IF any `critical` resource has `coverage < 0.5` THEN `score = min(score_raw, 59)`.

| Score | Band | Color + icon + label |
|---|---|---|
| 85–100 | Ready | Pearl Aqua · check · "Ready" |
| 60–84 | Partially ready | Powder Blush · alert-triangle · "Partially ready" |
| 0–59 | Not ready | Dark Raspberry · alert-octagon · "Not ready" |

**Shortfall severity:** `critical` if a critical resource coverage < 0.5; `high` if < 0.8 or a high resource < 0.5; otherwise `moderate`.

**Confidence**
- High: ≥ 90% of weighted resources counted within the last 14 days
- Medium: ≥ 60% within 30 days
- Low: otherwise (UI shows which items are stale)

### 10.4 Cycle count frequency
| Criticality | Interval | Examples |
|---|---|---|
| A | 7 days | Blood, controlled drugs, ventilator consumables, emergency drugs |
| B | 30 days | Common medicines, IV fluids, major consumables |
| C | 90 days | Low-value general consumables |

Priority boost: items with ≥ 3 variances in the last 5 counts, expiry within 60 days, or recent stock-out.

### 10.5 FEFO
Issue suggestions sort by `expiry_date asc nulls last`, then `batch created_at asc`. Expired batches are never suggested.

### 10.6 Default alert thresholds
Expiry 90/60/30 days; count overdue by interval + 2 days; cylinder pressure < 50% warning, < 25% critical.

---

## 11. UI specification

### 11.1 Navigation
Bottom tabs (5): **Home · Inventory · Scenarios · Tasks · More**.

```
Home ── Alerts, Counts due today, Top scenarios, AI button
Inventory ── [Items | Counts | Movements]
   Items → Item detail (batches, movements, count history, PAR, reorder)
   Counts → My counts → Count screen → Review & submit → (Manager) Variance review → What's Needed
   Movements → Receive / Issue / Transfer (manual)
Scenarios ── Templates → Detail (parameters) → Plan → Activate → Live board
Tasks ── Grouped by priority
More ── Profile, Settings, Users, Suppliers, Requisitions & POs, Reports, PAR levels, Reason codes, Feature flags, Audit log, About
```

### 11.2 Screens (functional contract)
| Screen | Must show | Key actions |
|---|---|---|
| Login | Logo (heartbeat line in a medical cross), tagline, email field, OTP step, footer "Designed & developed by Rajiv Kumar Singh" | Send OTP, verify |
| Home | Greeting, location switcher, notification bell, readiness gauge (subtle pulse), 3 stat cards (Low stock, Expiring soon, Open tasks), "Counts due today", Critical alerts, Top scenarios, floating AI button | Start count, open alert, open scenario |
| Inventory › Items | Search, filter chips, list with stock bar, PAR indicator, expiry badge | Open item, quick count |
| Count screen | See 5.4 layout | Count, switch UoM, add batch, note/photo, skip, submit |
| Variance review | Table (system, counted, variance, %, value), flags, recount, reason code | Approve / Recount / Reject |
| What's Needed | Per item PAR/counted/needed/suggested order, flags | Create requisition, PO draft, transfer, export |
| Receive/Issue/Transfer | Stepper form with FEFO suggestion | Confirm |
| Scenarios | Template grid with readiness % | Open |
| Scenario detail | Parameter steppers/sliders | Generate plan |
| Plan | Summary → Resources needed vs available → Shortfalls → Staff → Timeline → Assumptions | Approve, Activate |
| Live board | Progress ring, columns, shortfall tracker | Update task, stand down |
| Tasks | Priority groups with AI reasoning | Swipe complete, snooze, escalate |
| Reports | Charts, filters | Export CSV/PDF |
| More › About | "MedPulse v1.0, Designed & developed by Rajiv Kumar Singh" | n/a |

### 11.3 Design tokens

```json
{
  "palette": {
    "Frozen Water": "ddfff7",
    "Pearl Aqua": "93e1d8",
    "Powder Blush": "ffa69e",
    "Berry Crush": "aa4465",
    "Dark Raspberry": "861657"
  }
}
```

```ts
// src/theme/tokens.ts
export const colors = {
  background: '#ddfff7',      // Frozen Water
  surfaceSoft: '#ddfff7',
  healthy: '#93e1d8',         // Pearl Aqua
  warning: '#ffa69e',         // Powder Blush (use dark text)
  primary: '#aa4465',         // Berry Crush
  critical: '#861657',        // Dark Raspberry
  text: '#2B0F20',
  textSecondary: '#6B4A5C',
  card: '#FFFFFF',
  border: '#CDEFE8',
  onPrimary: '#FFFFFF',
  onCritical: '#FFFFFF',
  onWarning: '#2B0F20',
  onHealthy: '#2B0F20',
};
export const radius = { card: 16, button: 12 };
export const space = (n: number) => n * 8;
export const type = { h1: 28, h2: 22, h3: 18, body: 16, small: 14, counter: 48 };
```

| Role in UI | Token |
|---|---|
| App background, soft surfaces | Frozen Water |
| Secondary actions, healthy status, chips, charts | Pearl Aqua |
| Warnings, low stock, small variance, "In Testing" badge | Powder Blush + dark text |
| Primary buttons, active tab, counter "+", links | Berry Crush + white text |
| Headers, critical alerts, stock-out/expired, above-tolerance variance, pressed | Dark Raspberry + white text |

**Contrast note:** Powder Blush and Pearl Aqua must use dark text (#2B0F20). Berry Crush and Dark Raspberry must use white text. Check all pairs in CI (MP-I18N-002). Dark mode derives surfaces from Dark Raspberry/near-black and keeps statuses recognisable by icon and label.

**Typography:** Inter or Poppins; scale 28/22/18/16/14; counter number 48 bold. **Shape:** 16px cards, 12px buttons, soft shadows, 8px grid. **Motion:** Reanimated micro-animations (counter bump, gauge pulse); respect "reduce motion".

### 11.4 Components
| Component | Spec |
|---|---|
| `Counter` | −/+ buttons ≥ 56px, numeric tap-to-type, quick chips, long-press repeat (accelerating), haptics, min 0, accessibility value/adjust actions |
| `StatusChip` | Color + icon + label, three levels plus "In Testing" |
| `ReadinessGauge` | Circular gauge, number + band label, "confidence" subtext |
| `StockBar` | Current vs min/par/max markers |
| `VarianceChip` | Match / small / above tolerance (color + icon + text) |
| `OfflineBanner` | Shows when offline with queue count |

### 11.5 Required states for every data screen
Loading (skeleton), Empty (explanation + action), Error (retry), Offline (banner + cached data with "Last synced"), Permission denied (clear message).

---

## 12. Non-functional requirements

| ID | Category | Requirement |
|---|---|---|
| MP-NFR-001 | Security | Gemini key only in Edge Function secrets; rotated on schedule |
| MP-NFR-002 | Privacy | No patient-identifiable data stored or sent to AI; no staff names sent to AI (roles only) |
| MP-NFR-003 | Compliance | Designed with India's DPDP Act in mind: purpose limitation, minimal personal data, access logging, deletion/export pathways for staff data |
| MP-NFR-004 | Performance | Lists virtualised; pagination 50/page; cold start to Home under 3 s on mid-range Android |
| MP-NFR-005 | Reliability | Offline read of inventory and plans; offline count and movements with queued, idempotent sync |
| MP-NFR-006 | Availability | Core workflows unaffected by Gemini outage |
| MP-NFR-007 | Observability | Structured logs for Edge Functions, error tracking in the app, AI call metrics |
| MP-NFR-008 | Data | Daily backups, point-in-time recovery enabled, tested restore |
| MP-NFR-009 | Accessibility | See MP-I18N-002 / 003 |
| MP-NFR-010 | Maintainability | TypeScript strict mode, generated DB types, lint/format in CI |

---

## 13. Testing and acceptance

### 13.1 Test layers
| Layer | What | Tooling (suggested) |
|---|---|---|
| Unit | UoM conversion, variance, tolerance, Needed = PAR − counted, readiness formula, FEFO ordering | Jest |
| DB | RLS per role, append-only ledger, negative-stock prevention, separation-of-duties triggers, posting idempotency | pgTAP / SQL tests |
| Contract | AI JSON schema validation with good and bad fixtures; tool whitelist enforcement | Jest + fixtures |
| Component | Counter, StatusChip, VarianceChip, flag gating of scanner | React Native Testing Library |
| E2E | Critical flows below | Maestro / Detox |
| Accessibility | Contrast checks on token pairs, screen-reader labels | Script + manual |

### 13.2 Key acceptance scenarios (Gherkin)

```gherkin
Feature: Manual PAR count with variance control

  Scenario: Blind count hides system quantity
    Given a blind PAR count session for ICU assigned to Nurse A
    When Nurse A opens the count screen for "Normal Saline 500ml"
    Then no system quantity is shown or present in the API response

  Scenario: Out-of-tolerance variance triggers recount by another person
    Given a visible count with tolerance 2%
    And system quantity is 100 and Nurse A counts 90
    When Nurse A submits the session
    Then the line status becomes "recount_requested"
    And the recount is assigned to a user other than Nurse A

  Scenario: Counter cannot approve own count
    Given Nurse A counted a session
    When Nurse A attempts to approve it
    Then the request is rejected with FORBIDDEN

  Scenario: Controlled drug needs a witness
    Given a controlled-drug line
    When the counter submits without a witness
    Then submission is blocked with "Witness required"

  Scenario: What's Needed after PAR count
    Given item PAR is 50 and counted usable is 32
    When the PAR count is submitted
    Then the item shows Needed = 18
    And "Create requisition" pre-fills 18 (rounded to pack size)

  Scenario: Offline count syncs once
    Given the device is offline
    When the counter completes and submits a count
    And connectivity returns
    Then the session syncs once and no duplicate movements exist

Feature: Scanner is in testing

  Scenario: Flag off hides scanning
    Given scanner_beta is OFF
    Then no scan icon is shown on any screen

  Scenario: Scan only preselects
    Given scanner_beta is ON
    When the user scans a valid barcode
    Then the item is preselected with an "In Testing" badge visible
    And no quantity is changed until the user enters it

Feature: Scenario engine

  Scenario: Server computes readiness
    Given a plan requiring 20 units of item X and 10 usable units in stock
    Then coverage for X is 0.5 and readiness is computed without calling Gemini

  Scenario: Critical shortfall caps score
    Given a critical resource at coverage 0.4
    Then the readiness score is at most 59 and band is "Not ready"

  Scenario: Plan requires human approval
    Given a plan with status "pending_approval"
    Then the Activate button is disabled until a coordinator approves it

  Scenario: Gemini outage
    Given Gemini is unavailable
    When a coordinator opens a scenario
    Then the last cached plan is shown with its generation time
```

### 13.3 Definition of Done (per task)
- Requirement IDs referenced in the PR
- Acceptance criteria covered by automated tests (or documented manual test where not feasible)
- RLS/DB tests updated for any schema change
- No hard-coded strings (EN + HI keys added)
- Accessibility checks pass
- No secrets in the repo; `.env.example` updated
- Works with airplane mode where the requirement says offline

---

## 14. Delivery plan

Each task: `T-<phase>.<n>`, requirement IDs, and "Done when".

### Phase 0: Foundation
| Task | Reqs | Done when |
|---|---|---|
| T-0.1 Create Expo (TS) project, Expo Router, lint, CI | NFR-010 | App boots on iOS/Android, CI green |
| T-0.2 Supabase project, migrations folder, seed scaffolding | n/a | `supabase db reset` runs clean |
| T-0.3 Auth (email OTP), profiles, roles, locations assignment | AUTH-001, 002, 004, 006 | Sign-in works; no-role user blocked |
| T-0.4 RLS baseline + per-role test suite | AUTH-003 | RLS tests pass for all 6 roles |
| T-0.5 Theme tokens, i18n scaffold (EN/HI), feature flags table + hook | I18N-001, 002 | Tokens used everywhere; flag hook returns values |

### Phase 1: Inventory and manual movements
| Task | Reqs | Done when |
|---|---|---|
| T-1.1 Items, units, batches, locations, PAR tables | INV-001–006 | CRUD with validation |
| T-1.2 Ledger, triggers, `stock_levels` maintenance | MOV-001–004 | Negative stock impossible; append-only tests pass |
| T-1.3 Items list/search/filter + item detail | INV-008 | Search < 300 ms on 10k cached items |
| T-1.4 Receive/Issue/Transfer forms with FEFO | MOV-005–007, INV-007 | Issue in < 30 s |
| T-1.5 Offline cache + write queue (idempotent) | INV-011, MOV-008, 009 | Airplane-mode test passes |
| T-1.6 Seed: 1 hospital, 100 items with PAR levels, locations, batches | n/a | Realistic data visible |

### Phase 2: Manual Stock Counter
| Task | Reqs | Done when |
|---|---|---|
| T-2.1 Count tables, triggers (separation of duties, witness, blind view) | CNT-003, 018, 019 | DB tests pass |
| T-2.2 Session creation and assignment (manager) | CNT-001, 002 | Assignee notified |
| T-2.3 `Counter` component + count screen | CNT-004–010 | Meets layout and accessibility specs |
| T-2.4 Offline counting + sync | CNT-010, 011 | Offline submit syncs once |
| T-2.5 Submit summary, snapshot, variance calc, moved-during-count flag | CNT-012–014 | Unit tests on variance formulas |
| T-2.6 Recount and variance review with reason codes | CNT-016, 017, 021 | Approve disabled without reason |
| T-2.7 `post-count` Edge Function (transactional, idempotent) | CNT-020 | Double post impossible |
| T-2.8 What's Needed screen and actions | CNT-022, 023 | Pre-filled requisition/PO/transfer |
| T-2.9 Count history, repeat-variance list, export | CNT-024, 027 | Export opens in share sheet |
| T-2.10 Oxygen/blood/cold-chain extras, location lock | CNT-015, 025, 026, INV-009, 010 | Per-requirement checks |

### Phase 3: Alerts and dashboard
| Task | Reqs | Done when |
|---|---|---|
| T-3.1 Alert rules + nightly job | ALR-001, 002, 005 | Expiry/low-stock alerts appear automatically |
| T-3.2 Home dashboard (stat cards, alerts, counts due) | ALR-003 | Status chips meet contrast |
| T-3.3 Push notifications for critical alerts | ALR-004 | Device receives push |

### Phase 4: Requisitions and procurement
| Task | Reqs | Done when |
|---|---|---|
| T-4.1 Requisitions flow with approval and receipt | REQ-001, 002 | End-to-end flow passes E2E |
| T-4.2 Suppliers, POs, GRN receiving | REQ-003, 005 | Receiving posts movements |

### Phase 5: AI tasks and assistant
| Task | Reqs | Done when |
|---|---|---|
| T-5.1 Rules engine for tasks incl. cycle-count tasks | TSK-001, 002, 006 | No duplicates on rerun |
| T-5.2 Gemini prioritisation with schema validation and fallback | TSK-004 | Works with Gemini disabled |
| T-5.3 Tasks UI (done/snooze/escalate) | TSK-003 | Events logged |
| T-5.4 Variance analysis and PAR suggestions | TSK-005 | Manager accept/dismiss flow |
| T-5.5 Assistant with tool whitelist | AST-001–005 | Unknown tool rejected; RLS honoured |
| T-5.6 AI rate limits, logging, cost budget | NFR-007 | Metrics visible |

### Phase 6: Scenario engine
| Task | Reqs | Done when |
|---|---|---|
| T-6.1 Scenario templates and parameter UI | SEN-001 | 9 templates selectable |
| T-6.2 `scenario-plan` with prompt, schema validation, retry | SEN-002, 011 | Bad JSON never saved |
| T-6.3 Deterministic shortfall + readiness + confidence | SEN-003, 007 | Unit tests for 10.3 formula |
| T-6.4 Plan screen with all sections and cache | SEN-004, 005, 009 | Loads < 2 s offline |
| T-6.5 Nightly `refresh-readiness` and post-count trigger | SEN-006 | Scores update after count |
| T-6.6 Approval workflow and versioning | SEN-008, 010 | Activation blocked until approval |

### Phase 7: Activation
| Task | Reqs | Done when |
|---|---|---|
| T-7.1 Activation: tasks, notifications, reservations | ACT-001, 002 | Tasks arrive within 10 s |
| T-7.2 Live board with Realtime | ACT-003 | Updates within 3 s |
| T-7.3 Stand-down and Emergency Mode | ACT-004, 005 | Reservations released |

### Phase 8: Scanner beta
| Task | Reqs | Done when |
|---|---|---|
| T-8.1 Scanner behind `scanner_beta`, with "In Testing" badge and first-use notice | SCN-001–004, 006 | Flag off = no scan UI anywhere |
| T-8.2 Scan event logging and "Report a problem" | SCN-005 | Admin sees scan success rate |

### Phase 9: Reports, localisation, polish
| Task | Reqs | Done when |
|---|---|---|
| T-9.1 Reports incl. count accuracy; CSV/PDF export | RPT-001, 003 | Exports verified |
| T-9.2 Audit log viewer | RPT-002 | Auditor can read; nobody can edit |
| T-9.3 Hindi translation pass and dark mode | I18N-001, 004 | All strings localised |
| T-9.4 Accessibility audit and performance pass | I18N-002, 003, NFR-004 | Meets targets |
| T-9.5 README, About screen credit, release checklist | n/a | See Section 17 |

### Deliverables checklist
- [ ] Folder structure per Section 6.2
- [ ] SQL migrations for all tables, enums, triggers, RLS
- [ ] Edge Functions (six listed in Section 8)
- [ ] Gemini prompt templates with JSON schemas (Section 9) and fixtures
- [ ] Seed data: 1 hospital, 100 items with PAR levels, 5 scenarios, 3 sample count sessions with variances
- [ ] Test suites (Section 13)
- [ ] README titled "MedPulse" crediting "Designed & developed by Rajiv Kumar Singh"

---

## 15. Traceability (summary)

| Goal | Primary requirements |
|---|---|
| G1 Know stock | INV-001–011, MOV-001–009 |
| G2 Accurate counting | CNT-001–027 |
| G3 What each ward needs | CNT-022, 023, INV-005, REQ-001 |
| G4 Pre-computed scenarios | SEN-001–011 |
| G5 Faster activation | ACT-001–005 |
| G6 Audit | AUTH-006, MOV-002, CNT-018–020, RPT-002 |
| Scanner in testing | SCN-001–006 |

---

## 16. Risks, assumptions and open questions

### 16.1 Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Stale or inaccurate stock makes readiness misleading | High | Confidence indicator, cycle counts, count-overdue alerts |
| Gemini returns wrong quantities | High | Human approval, assumptions shown, sanity caps, server-side math |
| Staff skip counts or rush them | Medium | Blind mode for critical items, recount rules, accuracy reports |
| Poor connectivity on wards | Medium | Offline-first counting and queue |
| Scope creep into patient data | High | Non-goal; no patient tables; reviewed at PR |
| Scanner misreads create bad data | Medium | Scan only preselects; manual confirmation; feature flag |

### 16.2 Assumptions
- One hospital per deployment in v1.0 (schema supports multi-hospital via `hospital_id`).
- Staff have smartphones (hospital-provided or personal) with camera and push support.
- Item master data is loaded by the store team at rollout (CSV import is a COULD).
- Stock reservations for scenarios are *soft* (visible and warned, not hard-blocking).

### 16.3 Open questions (resolve before the relevant phase)
| # | Question | Needed by |
|---|---|---|
| Q1 | Should counts auto-approve when all lines are within tolerance, or always need a manager? (Default in spec: configurable, off for controlled/blood) | Phase 2 |
| Q2 | How are nearby-hospital borrowing contacts stored (free text vs directory)? | Phase 6 |
| Q3 | Is CSV import of the item master required at launch? | Phase 1 |
| Q4 | Which Gemini model names to use for "Flash" and "strong" tiers at build time? (kept as config) | Phase 5 |
| Q5 | Is Hindi required for all screens at launch, or core flows only? | Phase 9 |
| Q6 | Retention period for audit logs and count photos? | Phase 9 |

---

## 17. Release checklist
- [ ] All MUST requirements pass their acceptance tests
- [ ] RLS tests green for every role
- [ ] Gemini key only in Edge Function secrets; none in the app bundle
- [ ] `scanner_beta` default OFF in production
- [ ] "In Testing" badge verified wherever scanner appears
- [ ] About screen reads "MedPulse v1.0, Designed & developed by Rajiv Kumar Singh"
- [ ] README titled "MedPulse" with the same credit
- [ ] `com.medpulse.app` verified available on Play Store and App Store (or changed)
- [ ] Backup and restore tested
- [ ] DPDP review done (data inventory, access logging, retention)

---

## 18. Glossary
| Term | Meaning |
|---|---|
| PAR level | Target quantity a location should hold; counts compare against it and restock back up to it |
| Cycle count | Counting a rotating subset of items regularly instead of a single full stocktake |
| Blind count | Count where the system quantity is hidden from the counter |
| Variance | Counted quantity minus system quantity |
| Tolerance | Allowed variance % before a recount is required |
| FEFO | First-Expiry-First-Out issuing |
| GRN | Goods Received Note |
| EARS | Easy Approach to Requirements Syntax |
| Readiness score | 0–100 measure of how well current usable stock covers a scenario's requirements |

---

**MedPulse** · Designed and developed by Rajiv Kumar Singh
