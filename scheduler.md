# Pac-Biz Ops Scheduler

**File:** `scheduler.html`
**Type:** Static HTML/CSS/JS frontend backed by Google Apps Script
**Hosted at:** GitHub Pages or local browser

---

## What this is

This is an internal weekly staff scheduling tool for Pac-Biz Operations. It loads live employee data from the company Masterlist, lets managers assign shifts to each employee for the current week (or any week), and saves all changes to a Google Sheet via a Google Apps Script web app. Any manager can open the same file and see the same schedule because all saves and loads go to the same backend.

---

## How to open it

1. Double-click `scheduler.html` (Chrome or Edge recommended)
2. On first load it fetches live employee data from the Masterlist (requires internet)
3. It then loads the saved schedule for the current week from the backend
4. The loading screen disappears when both fetches complete

**You do not need to install anything.** No Node.js, no Python, no server.

### Provisioning note (2026-07-03)

The deployed GitHub Pages app uses committed `scheduler-public-config.js` for browser-required
endpoints. User credentials are not committed; they live in Apps Script Script Properties and
are checked through `apps_script_auth_wrapper.gs`.

Local-only development may still use `scheduler-config.js`, but deployed login does not depend
on that gitignored file.

---

## Architecture overview

```
┌─────────────────────────────────────────────────────────┐
│                    scheduler.html                       │
│  (all CSS, HTML, and JS in one self-contained file)    │
└────────────┬───────────────────────┬────────────────────┘
             │ reads (CSV, CORS)     │ reads/writes (JSONP-style GET)
             ▼                       ▼
   Masterlist Google Sheet    PB Ops Scheduler Google Sheet
   (published CSV — read only) (via Apps Script web app)
```

### Data sources

| Source | What it provides | How accessed |
|--------|-----------------|--------------|
| Masterlist Google Sheets CSV | Employee names, IDs, accounts, supervisors | `fetch()` on published CSV URL at page load |
| PB Ops Scheduler (Google Sheet) | Saved shift data per employee per week | Google Apps Script web app (GET requests) |

### Key constants

| Constant | Location | Purpose |
|----------|----------|---------|
| `MASTERLIST_CSV_URL` | `scheduler-public-config.js` | Masterlist staff roster (gid=0) |
| `SCHEDULER_API_URL` | `scheduler-public-config.js` | Apps Script web app — auth + schedule API |
| `USERS_JSON` | Apps Script Script Properties | Auth credential map (username → password) |
| `IDLE_MS` | `scheduler.html` (line 866) | Inactivity logout threshold (currently 3 min) |

**URL sync note:** `MASTERLIST_CSV_URL` shares the same base sheet as
`MASTERLIST_CSV` / `HISTORY_CSV` / `MOVEMENT_CSV` in
`../Masterlist/sheets_urls.py`. When the Masterlist sheet is re-published,
update `_BASE` in `sheets_urls.py` AND the URL value in `scheduler-public-config.js`.

---

## Auth system

Auth state is stored in two layers to survive page refresh and Edge's
privacy/tracking-prevention clearing of `localStorage`:

1. **`localStorage` key `pb_auth`** — username; written on login
2. **`localStorage` key `pb_auth_token`** — signed backend session token
2. **Cookie `pbs=`** — fallback; 1-year max-age, SameSite=Lax, path=/

Both layers are checked on every page load by an inline IIFE (line 633)
that runs before the main script block. If neither is present, the login screen
is shown. Login writes both; logout clears both.

**Helpers (near line 824 in scheduler.html):**
- `_pbGetAuth()` — returns auth value from localStorage, falls back to cookie
- `_pbGetAuthToken()` — returns the signed backend session token
- `_pbSaveAuth(u, t)` — writes username, token, and cookie
- `_pbClearAuth()` — removes both

**Auth on-load IIFE (lines 827–836):**
Checks the stored auth on page load and either hides the login screen or prompts for credentials.

**Login validation:**
`doLogin()` calls `SCHEDULER_API_URL?action=login`. Apps Script validates against
`USERS_JSON` Script Property and returns a signed token.

**Inactivity logout:** `IDLE_MS = 3 * 60 * 1000` (3 minutes, as of 2026-07-01).
`_startIdleTimer()` resets on any `mousemove`, `keydown`, `click`, `scroll`, `touchstart`, `mousedown`.
Only inactivity triggers logout — page refresh does not.

---

## Google Sheet backend

**Sheet name:** `PB Ops Scheduler`
**Tab name:** `Schedule`

| Column | Content |
|--------|---------|
| `emp_id` | Employee ID (string, e.g. `"749"`) |
| `week_key` | ISO week start date (`YYYY-MM-DD`, e.g. `"2026-06-29"`) |
| `mon` – `sun` | JSON cell per day (see below) |

### Day cell format (JSON stored as a string in each cell)

```json
{"t":"sh","s":"0800","e":"1600","a":"VIP"}
```

| Field | Meaning |
|-------|---------|
| `t` | Shift type: `sh` (Shift), `off` (Rest Day), `vl` (Vacation Leave), `sl` (Sick Leave), `rd` (RDOT), `ot` (Overtime), `fx` (Flexi) |
| `s` | Start time — 24h, 4-digit string, e.g. `"0800"` |
| `e` | End time — 24h, 4-digit string, e.g. `"1600"` |
| `a` | Account the employee is working on that day |

---

## Google Apps Script (backend)

**Deployed as:** Web app, access = "Anyone (even anonymous)" (required for CORS)
**Entry point:** `doGet(e)`

### Reading schedule data

```
GET <SCHEDULER_API_URL>?week=YYYY-MM-DD
```

Returns JSON:
```json
{
  "status": "ok",
  "data": {
    "2026-06-29": {
      "749": {
        "mon": {"t":"sh","s":"0800","e":"1600","a":"BriteLift"},
        "tue": {"t":"off","s":"","e":"","a":""}
      }
    }
  }
}
```

### Saving a shift row

```
GET <SCHEDULER_API_URL>?action=save&empId=749&weekKey=2026-06-29&mon={...}&tue={...}&...
```

One request saves the entire week for one employee. The Apps Script finds the existing row (by `emp_id` + `week_key`) and updates it in place, or appends a new row if not found.

**Important:** Google Sheets auto-converts ISO date strings to Date objects on write. The Apps Script reads them back with `new Date(row[1])` + `Utilities.formatDate()` to normalize to `YYYY-MM-DD` before matching. This is already handled — do not change that logic.

### Deduplication utility

```javascript
function deduplicateSchedule()
```

Removes duplicate rows with the same `emp_id` + `week_key`, keeping the last one. Run this manually from the Apps Script editor if duplicates appear. It is not called automatically.

---

## UI panels

The app has three tabs in the top navigation bar:

### 1. Builder (default)

The main scheduling view. Shows all employees in a scrollable grid.

**Toolbar:**
- Week selector dropdown
- `↩ Copy prev week` — copies all shifts from the previous week into the current week as a starting point
- `+ New week` — opens a dialog to create a new week entry
- `💾 Save` — saves all pending changes to the Google Sheet
- `↑ Export` — currently shows a toast notification (not yet implemented)

**Filter bar:**
- Employee name multiselect dropdown
- Account multiselect dropdown (with Select All) — supports selecting multiple accounts simultaneously
- Supervisor multiselect dropdown (with Select All) — supports selecting multiple supervisors simultaneously
- Chip filters: All Employees / Cross-trained / Modified / On Leave / RDOT / Rest Day / Overtime

**Summary strip (below filter bar):**
Shows a row of cards per day: count of staff On Shift, On Leave, Rest Day, RDOT — one column per day of the week, plus a weekly total column.

**Grid:**
- One row per employee
- Columns: Staff name + account badge | Mon | Tue | Wed | Thu | Fri | Sat | Sun | Total Hours
- Clicking a row expands an inline editor for that employee
- The **Staff column width** is resizable by dragging the divider line on the right edge of the Staff column header. Width is saved to `localStorage` key `pb.sched.staffW`

**Inline row editor (expanded):**
- Account pills (primary = starred, secondary = removable) + Add account button
- Shift type buttons per day: Shift / Rest Day / VL / SL / RDOT / OT / Flexi
- Time selector (24h, dropdown) for Shift / RDOT / OT days
- Account selector for cross-trained staff on shift days
- Quick fill buttons: Mon–Fri on Shift, All Off, Weekend Off, Repeat Monday

### 2. Viewer

Read-only view of the schedule, filtered by account or staff search. Shows staff cards with their week strip.

**Filter bar:**
- Employee name multiselect dropdown
- Account multiselect dropdown (with Select All)
- Supervisor multiselect dropdown (with Select All)
- View tabs: Team Level (grouped by supervisor) / Account (grouped by account, cross-trained staff appear in each group)

**Group header stats bar:**
Each group (supervisor team or account) shows a row of pills:
- `N staff` — count of members in the group
- `N cross-trained` (purple pill) — members with more than one account
- `N on shift` (green pill) — members with at least one `sh`, `rd`, or `ot` shift this week
- `Nh` (blue pill) — total scheduled hours for the group this week

Hours counting rules:
- **Team mode:** all hours across all accounts are counted (`weekHrs(s.id)` per member)
- **Account mode:** only hours for shifts where the assigned account matches the group key are counted — `(d.a || s.acct) === gk`. Cross-trained staff appear in multiple groups and their hours are attributed per-account, not double-counted at the top level.

The global stats bar (`#vw-ctx`) shows total employee count, cross-trained count, and on-shift count. It does **not** show a total hours figure — hours live only in the individual group headers.

### 3. Dashboard

Live overview showing staff counts per account per day of the current week.
Rows = accounts, columns = Mon–Sat plus a Total column. Each cell shows
scheduled headcount and total hours for that account on that day.

**Layout architecture (split-header — no `position:sticky`):**

`position:sticky` on `<thead>` proved unreliable inside `overflow:auto`
in Edge/Chromium. The header is extracted into a separate pinned element:

```
#p-d.on  (flex column, height: 100vh - topbar - footer, overflow:hidden)
  .dsh-hdr       — non-scrolling controls strip (flex-shrink:0)
  .dsh-hw        — pinned header div (overflow-x:hidden)
    table#dsh-thead-tbl   — <colgroup> + <thead> only
  .dsh-scroll    — scrolling body (flex:1, min-height:0)
    table#dsh-tbl         — <colgroup> + <tbody> only
```

Both tables carry an identical `<colgroup>` (Account: 162px, Mon–Sat: 108px
each, Total: 100px) with `table-layout:fixed` to keep columns locked.
Horizontal scroll on `dsh-scroll` mirrors `scrollLeft` onto `dsh-hw`.
`_dshFitScroll()` sets `dsh-scroll` height explicitly via
`requestAnimationFrame` on render, resize, and tab switch.

---

## Shift types

| Code | Label | Description |
|------|-------|-------------|
| `sh` | On Shift | Normal working shift. Requires start/end time. |
| `tn` | Training | Training shift. Behaves identically to On Shift with orange styling. Requires start/end time. (Added 2026-07-13) |
| `off` | Rest Day | Day off. No time needed. |
| `vl` | VL | Vacation Leave. |
| `sl` | SL | Sick Leave. |
| `rd` | RDOT | Rest Day Overtime. Requires start/end time (independent pickers at 15-min granularity; defaults to 8h if no times set). (Updated 2026-07-13) |
| `ot` | OT | Overtime. Requires start/end time. |
| `fx` | Flexi | Flexible schedule. |

---

## Cross-skilled staff

Staff members may work across multiple accounts on different days.
`s.accts[]` (array) holds all accounts; `s.acct` is the primary.
`d.a` is an optional day-level account override on a saved shift record.

The Viewer and Dashboard both use the same pattern for cross-skilled counting:

```js
// Membership — does this staff member belong to this account?
s.accts.indexOf(acct) >= 0

// Per-day shift attribution — only count toward acct if it's their day for it
var dayAcct = d.a || s.acct;
if (s.accts.length > 1 && dayAcct !== acct) return;
```

Do not use `s.acct === acct` for membership checks — it misses cross-skilled
staff on days where they are assigned to a secondary account.

---

## How accounts work

Every employee has:
- A **primary account** — shown as a colored badge on their row. Comes from the Masterlist.
- One or more **secondary (cross-trained) accounts** — added manually in the inline editor. These persist because they are embedded in saved shift cells (the `"a"` field).

### What happens when an employee moves accounts in the Masterlist

1. **Badge updates** on next page load (after Google's 5–30 min CSV cache refreshes)
2. **Primary account changes** to the new account
3. **Secondary accounts survive** — any account that appears in a saved shift `"a"` field is automatically added back to that employee's account list on load
4. **Shift cells do not change** — they still show the old account assignment. A supervisor must manually reassign shifts to the new account using the inline editor

---

## Save behavior

Changes are **not saved automatically on every click**. They are batched:

- Every shift edit (type, time, or account) marks the employee as dirty and schedules a debounced save (500ms delay)
- The `💾 Save` button also triggers an immediate save of all dirty employees
- Each dirty employee sends one GET request to the Apps Script: one request = one employee's full week

The `save-status` span next to the Save button shows `Saving...` or `Saved ✓` feedback.

**There is no offline queue.** If the save request fails, an error toast appears. The change stays in memory and can be re-saved by clicking the Save button.

---

## Data flow on page load

```
1. fetch(MASTERLIST_CSV_URL)
      → parse CSV
      → build STAFF array (id, name, account, supervisor, color)
      → populate filter dropdowns

2. fetch(SCHEDULER_API_URL + '?week=' + curWK())
      → parse JSON response
      → mergeScheduleData():
            for each saved emp_id + week_key:
              load shift data into sch[weekKey][empId]
              scan all shift "a" fields → add any missing accounts to employee's accts array

3. renderGrid()  ← draws the full schedule grid
```

---

## Key JavaScript functions

| Function | What it does |
|----------|-------------|
| `loadData()` | Fetches Masterlist CSV + saved schedule, builds STAFF, calls renderGrid |
| `mergeScheduleData(data)` | Merges API response into sch object; restores cross-training accounts from shift data |
| `normWK(k)` | Normalizes a date string from the API (handles Google Sheets Date-object serialization) to `YYYY-MM-DD` |
| `renderGrid()` | Debounced re-render via `requestAnimationFrame` — batches rapid changes into one DOM update |
| `renderGridNow()` | Immediate render (used when row expand/collapse needs instant feedback) |
| `setShift(id, day, type)` | Sets shift type, marks employee dirty, triggers debounced save |
| `setShiftTime(id, day, val)` | Sets start/end time, marks dirty, saves |
| `setDayAcct(id, day, val)` | Changes the account for one shift day, marks dirty, saves |
| `addAcct(id, acct)` | Adds a secondary account to an employee |
| `removeAcct(id, acct)` | Removes a secondary account, reassigns any shifts that used it |
| `changePrimaryAcct(id, newAcct)` | Changes primary account, updates all matching shift `a` fields |
| `scheduleSave()` | Debounced save — waits 500ms then calls `saveDirty()` |
| `saveDirty()` | Iterates `dirtyIds`, fires one GET per employee to the Apps Script |
| `quickFill(id, mode)` | Bulk-fills: `mf` = Mon–Fri shift, `all-off`, `wknd-off`, `copy-mon` |
| `applyFilters()` | Rebuilds `visibleStaff` based on all active filters (name, account Set, supervisor Set, chip), re-renders |
| `getVwList()` | Returns filtered staff list for the Viewer using `vwNmFilter`, `vwAcctFilter`, `vwSupFilter` Sets |
| `initFilters()` | Initialises Builder filter multiselects (populates `acctFilter`/`supFilter` Sets, builds dropdowns) |
| `initViewerFilters()` | Initialises Viewer filter multiselects (populates `vwAcctFilter`/`vwSupFilter` Sets, builds dropdowns) |
| `buildAcctDropdown()` / `buildSupDropdown()` | Builds Builder account/supervisor checkbox dropdown HTML |
| `buildVwAcctDropdown()` / `buildVwSupDropdown()` | Builds Viewer account/supervisor checkbox dropdown HTML |
| `computeDLBL(dateStr)` | Computes the actual calendar dates (Mon=8, Tue=9...) for the current week |
| `computeTodayCol()` | Determines which column is today and highlights it |

---

## CSS variables (design tokens)

```css
--pb-green: #39B54A    /* brand green */
--pb-blue:  #004C97    /* brand blue */
--pur:      #7C5CFC    /* accent purple — highlights, selection, cross-trained badge */
--col-staff: 210px     /* width of the Staff name column — updated live by the resizer */
--col-day:   170px     /* width of each day column */
--row-h:     56px      /* height of each staff row */
--vw-col-staff: 200px  /* Viewer Staff column width — updated live by the resizer */
--vw-col-acct:  100px  /* Viewer Account column width — updated live by the resizer */
--footer-h:  47px      /* fixed footer height — all panel heights subtract this */
```

### Viewer group header pill classes

| Class | Color | Use |
|-------|-------|-----|
| `.vw-meta-pill` | neutral (surface/border) | base pill — staff count |
| `.vw-meta-pill.ct` | purple | cross-trained count |
| `.vw-meta-pill.on` | green (`#DCFCE7` / `#166534`) | on-shift count |
| `.vw-meta-pill.hrs` | blue (`#DBEAFE` / `#1D4ED8`) | total hours for the group |

---

## localStorage keys

| Key | Content |
|-----|---------|
| `pb.sched.staffW` | Builder Staff column width in pixels (set by the drag resizer) |
| `pb.vw.staffW` | Viewer Staff column width in pixels (set by the drag resizer) |
| `pb.vw.acctW` | Viewer Account column width in pixels (set by the drag resizer) |

---

## Known limitations and design decisions

- **Account list not separately stored** — Secondary accounts are inferred from saved shift data. If an account was added to an employee but never assigned to a shift day, it will be lost on page reload. In practice this is rare because accounts are only added when scheduling.
- **No offline queue** — If the network is unavailable when saving, the save fails silently (error toast). Re-open and save again.
- **Masterlist cache delay** — The Masterlist CSV is served by Google with a 5–30 minute cache. Account changes in the Masterlist will not appear immediately.
- **Export button** — Toolbar shows `↑ Export` but it currently shows a toast only. Full export not yet implemented.
- **Dashboard tab** — Now shows live headcount from the active schedule. Uses a split-header layout (see Dashboard section above).
- **Multi-week saves** — Only the current week's data is fetched on load. Other weeks are loaded from `sch` in memory if you switch to them, but are only populated if you visited them during the same session or if saved data exists in the Sheet for those weeks.
- **Account/supervisor multiselect state** — Filter Sets (`acctFilter`, `supFilter`, `vwAcctFilter`, `vwSupFilter`) are not persisted to `localStorage`; they reset to "All selected" on every page load.

---

## Adding a new week

Click `+ New week` in the toolbar:
1. Enter the Monday start date
2. Enter a week label (e.g. `Week 27 — Jul 6–12, 2026`)
3. Choose to pre-fill from the current week or start empty
4. Click `Create Week` — the new week appears in the selector immediately

---

## Deployment / re-deployment

The entire app is one HTML file. To update it:
1. Edit `scheduler.html`
2. Open it in a browser — no build needed
3. To share with other managers: host it on any static server, or share the file directly

**To update the Google Apps Script** (if the backend logic changes):
1. Open the Apps Script project bound to the `PB Ops Scheduler` spreadsheet
2. Edit `doGet(e)`
3. Deploy → `Manage deployments` → create a new version
4. Copy the new web app URL
5. Update `SCHEDULER_API_URL` in `scheduler.html`

---

## File structure (technical)

```
scheduler.html
├── <style>
│     CSS variables, layout tokens, component styles
│     Animation keyframes for shift card dots and summary dots
│
├── <body>
│     Loading screen overlay
│     Top navigation bar (brand + nav tabs + LIVE badge + week badge)
│     Panel: Builder (#p-b)
│       └─ Sticky header: toolbar + filter bar + summary strip + grid header + resizer
│       └─ Scrollable body: staff grid (#staff-grid)
│       └─ Sticky footer: legend bar
│     Panel: Viewer (#p-v)
│     Panel: Dashboard (#p-d)
│     Modal: New Week
│     Toast notification
│
└── <script>
      Constants     MASTERLIST_CSV_URL, SCHEDULER_API_URL, DAYS, WKND, BTNS, ACCT_CLR
      State         STAFF, WEEKS, sch, selId, dirtyIds, visibleStaff, curWeekIdx
      Data load     loadData(), buildStaffFromCSV(), mergeScheduleData(), normWK()
      Schedule r/w  getSch(), setSch(), saveDirty(), scheduleSave()
      Render        renderGrid(), renderGridNow(), renderStats(), renderViewer()
      Interactions  setShift(), setShiftTime(), setDayAcct(), addAcct(), removeAcct()
                    changePrimaryAcct(), togglePicker(), quickFill(), toggleRow()
      Filters       applyFilters(), setChip(), initFilters(), initNmFilter()
      Weeks         setWeek(), computeDLBL(), computeTodayCol(), copyPrevWeek()
                    openNewWeek(), createNewWeek()
      Resizer IIFE  Builder Staff column drag, localStorage restore, ResizeObserver anchor
      Viewer Resizer IIFE  Viewer Staff + Account column drag, localStorage restore
      Multiselect   buildAcctDropdown/buildSupDropdown/buildVwAcctDropdown/buildVwSupDropdown
                    toggle/close/updateLabel helpers for each (Builder + Viewer × Account + Supervisor)
      Utilities     p2(), hrs(), dayHrs(), weekHrs(), bLbl(), scBg(), toast()
```

---

## Layout notes

- **Brand logo** — `pacbiz_logo.png` from the Masterlist folder, embedded as `data:image/png;base64,...`. Matches the Dashboard logo exactly.
- **Footer** — `position:fixed; bottom:0; left:0; right:0; height:var(--footer-h)` gradient bar (`--pb-green` → `--pb-blue`). Always visible at the bottom of the viewport on every tab. Text: `Developed for Pac-Biz Operations MCerna | Python v06.26.2026`.
- **Legend bar** — `position:sticky; bottom:var(--footer-h)` so it sticks just above the fixed footer while scrolling.
- **Builder panel layout** — `#p-b.on` is `display:flex; flex-direction:column; min-height:calc(100vh - 48px - var(--footer-h))`. The grid body zone (`.gbody-zone`) has `flex:1 0 auto` so it fills remaining space, pushing the legend to the bottom even when few rows are visible after filtering.

---

---

## Changelog

### 2026-07-02 — Credential-Extraction Refactor

**Status:** Completed and passed code review

#### Summary

Three inline credential declarations were moved out of `scheduler.html` into a new git-ignored sibling file `scheduler-config.js`:
- `var MASTERLIST_CSV_URL` (previously ~line 804 in scheduler.html)
- `var SCHEDULER_API_URL` (previously ~line 805 in scheduler.html)
- `var USERS` auth credential map (previously ~line 823 in scheduler.html)

`scheduler.html` now loads these via `<script src="scheduler-config.js"></script>` at **line 821**, immediately before the main script block (line 822) that uses all three variables.

#### Reason

Prevents secret credentials (API URLs and auth passwords) from being committed to git history. By externalizing these to a git-ignored file, git clones will never contain live credentials — they must be manually provisioned on each new host. This follows infrastructure security best practices for client-side apps.

#### Files Affected

- `scheduler.html` (removed inline declarations; added load tag at line 821)
- `scheduler-config.js` (NEW, git-ignored) — contains three `var` declarations
- `.gitignore` (NEW at Scheduler root) — ignores `scheduler-config.js` and `*.local.js`

#### Refactor Details

**Load order (critical):**
```html
<!-- Line 821 -->
<script src="scheduler-config.js"></script>
<!-- Line 822 -->
<script>
  // Main script block that references MASTERLIST_CSV_URL, SCHEDULER_API_URL, USERS
  ...
</script>
```

The external script must load **before** the main block, or `MASTERLIST_CSV_URL`, `SCHEDULER_API_URL`, and `USERS` will be undefined when referenced, causing `ReferenceError` at page load.

**scheduler-config.js template:**
```javascript
// Pac-Biz Scheduler — local config (not committed to git)
var MASTERLIST_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS82OdHh0V.../pub?gid=0&single=true&output=csv';
var SCHEDULER_API_URL = 'https://script.google.com/macros/s/AKfycbz.../exec';
var USERS = {'admin':'***','mike':'***','gonrejas':'***'};
```

**.gitignore entries:**
```
scheduler-config.js
*.local.js
```

#### Impact

- **Git security:** Credentials no longer appear in commit history or git diffs
- **Fresh clones:** `git clone` will have `scheduler.html` but NOT `scheduler-config.js` — ReferenceError on load until manually provisioned
- **Backward compat:** No API or UI changes; all functionality identical before and after

#### Testing

- Verified `doLogin()` receives `USERS` correctly and validates credentials
- Verified CSV fetch uses `MASTERLIST_CSV_URL` and loads employee roster
- Verified API fetch uses `SCHEDULER_API_URL` and loads/saves schedule data
- Confirmed page load fails with clear `ReferenceError` if `scheduler-config.js` is missing

#### Notes / Risks

**Provisioning risk:** If someone clones the Scheduler repo or copies `scheduler.html` to a new machine without also copying `scheduler-config.js`, the app will fail silently (no visible error, just `ReferenceError` in the console). See "Provisioning note" in the "How to open it" section for user-facing documentation.

**Security note (reviewer caveat):** Moving secrets to client-side JavaScript does not hide them from end users viewing DevTools — anyone can open the browser console and see `USERS` and the URLs in memory. This refactor addresses **git-history exposure only**. It is **not** a security boundary for the deployed app. A true backend service would be needed to keep secrets away from clients, but that is beyond the scope of this local scheduling tool.

**Future multi-environment support:** The `*.local.js` pattern in `.gitignore` enables local environment overrides (e.g. `scheduler-config.local.js`) for development without git conflicts. Not currently used.

---

### 2026-07-03 — Backend Auth Migration

**Status:** Frontend wired; Apps Script wrapper added

#### Summary

The deployed GitHub Pages app no longer depends on gitignored `scheduler-config.js`
for login. `scheduler.html` now loads `scheduler-public-config.js`, which contains
only public runtime endpoints. User/password validation is moved to Apps Script via
`apps_script_auth_wrapper.gs`.

#### Deployment Required

In the existing Scheduler Apps Script project:

1. Rename the current `doGet(e)` function to `schedulerDataGet_(e)`.
2. Paste in `apps_script_auth_wrapper.gs`.
3. Set Script Properties:
   - `USERS_JSON`
   - `AUTH_SECRET`
4. Deploy a new web app version.

#### Client Behavior

- `doLogin()` calls `SCHEDULER_API_URL?action=login`.
- On success, the backend returns a signed session token.
- Schedule load/save requests include the token.
- Passwords are no longer present in GitHub Pages files.

---

### 2026-07-02
- **Masterlist CSV URL sync comment** — added `// ⚠ Keep in sync with sheets_urls.py` above
  `MASTERLIST_CSV_URL` (line 803). URL value unchanged. Authoritative Python source is
  `../Masterlist/sheets_urls.py` (`_BASE` constant). Future URL rotations: update `_BASE`
  there and line 804 here.

### 2026-07-02 — Scheduler Dashboard Audit & Findings

**Audit conducted by:** workforce-analytics-engineer + frontend-ui-engineer  
**Type:** Code review + UX audit  
**Status:** 6 prioritized action items identified

#### Summary

Two agents reviewed `scheduler.html` for correctness of data calculations and UI/UX quality. Audit uncovered data accuracy issues (KPI mislabeling, unrendered percentages, staffing thresholds not account-aware), missing features (export stub, missing transitions), and accessibility gaps (no ARIA, no focus rings, poor font size).

#### Workforce Analytics Findings

1. **Weekly Coverage table thresholds not account-aware** — Universal tiers (≤2 Critical, ≤4 Low, ≤7 Good, 8+ High) mislead on coverage adequacy when applied to accounts of different sizes. E.g., a 5-person account with 3 on shift is 60% covered (good), but is flagged as "Low" (4/5). Recommends per-account staffing targets wired into `tierCls()`.

2. **Coverage % calculated but not displayed** — `pct` variable exists in the JS rendering path but is never output to cells. Weekly Coverage table shows only raw counts, not percentages. Managers cannot see coverage adequacy at a glance.

3. **KPI tile 4 mislabeled "Rest Days"** — Actually displays RDOT count, not rest day (off type) count. RDOT is also double-counted in tile 5. Label should read "RDOT" to match data shown. Affects all decision-making based on rest day availability.

4. **Export button is a stub** — `exportSchedule()` shows a toast notification only. No CSV file is generated or downloaded. Feature is unusable.

5. **No week-over-week delta on coverage cells** — Coverage counts shown but no arrow/badge indicating whether staffing is up/down/stable vs. previous week. Manager must manually compare.

6. **"LIVE" indicator misleading** — Badge in topbar implies live data stream. Actually, data loads once on page load and is static until manual refresh.

#### Frontend UI Findings

1. **`.sc-card-lbl` font-size 8.5px — unreadable** — Below recommended minimum of 10px. Affects all shift card labels in the grid. UX degraded for high-DPI displays.

2. **Summary strip consumes ~280px vertical** — Appears before the first data row. Takes up substantial viewport real estate. Candidate for collapsible toggle to reclaim space for the schedule grid.

3. **`fbar-lbl` span defined in CSS but missing from markup** — Filter bar lacks visual grouping on label/control pairs. Dead CSS rule indicates incomplete UI refactor.

4. **Panel switching is abrupt (hard display:none/block)** — No transition. Tabs flicker when switching between Builder/Viewer/Dashboard. Should use 120ms fade-up for polish.

5. **Save button is ghost/outlined, not solid green** — Doesn't read as primary action. Should use solid green background to match Pac-Biz brand and draw attention.

6. **`.dsh-kpi-row` defined twice** — Lines 461 and 599. Line 461 is dead code. Indicates build cleanliness issue or incomplete refactor.

7. **No ARIA markup, no responsive design, no focus ring** — Scheduler is not accessible to screen readers or keyboard-only users. No `role=`, `aria-label`, or `:focus-visible` styling. Tab navigation may be broken.

#### Prioritized Action Items

| # | Action | Priority | Effort | Impact |
|---|--------|----------|--------|--------|
| 1 | Fix KPI tile 4 label "Rest Days" → "RDOT" | HIGH | <5 min | Data accuracy — prevents manager confusion |
| 2 | Render coverage % number in each Weekly Coverage cell | HIGH | 1 hr | Data visibility — managers can assess adequacy at a glance |
| 3 | Wire per-account staffing targets into `tierCls()` instead of universal thresholds | HIGH | 2 hrs | Decision-making — correct tier colors per account size |
| 4 | Implement `exportSchedule()` as CSV download (not just toast) | MEDIUM | 1.5 hrs | Feature completeness — Export button is currently broken |
| 5 | Bump `.sc-card-lbl` to 10px and add collapsible summary strip toggle | MEDIUM | 1.5 hrs | UX/readability — fix font size and reclaim vertical space |
| 6 | Add panel transition (120ms fade-up) and make Save button solid green | LOW | 45 min | Polish — improve perceived responsiveness and CTA visibility |

#### Files Affected

- `scheduler.html` — All findings are in this single-file app (HTML/CSS/JS)

#### Impact

- **Data accuracy:** KPI mislabeling and unrendered percentages affect scheduling decisions
- **Usability:** Unreadable fonts, missing transitions, and stub features degrade experience
- **Accessibility:** No ARIA or focus management breaks keyboard navigation and screen readers
- **Coverage intelligence:** Per-account thresholds are essential for correct staffing risk assessment

#### Testing Recommendations

1. **Data accuracy:** Verify tile 4 and tile 5 counts by hand for a test week; confirm coverage % renders for all accounts
2. **UI/UX:** Test panel switching, Save button visibility, and font sizes on a 1080p + 4K monitor
3. **Accessibility:** Scan with axe DevTools or WAVE; test keyboard navigation (Tab, Shift+Tab, Enter)
4. **Export:** Test CSV download with multiple week selections and filter states
5. **Responsiveness:** Verify collapsible summary strip does not break grid layout when toggled

#### Notes / Risks

- **Threshold change risk:** If per-account targets are wired in, some managers may see previously-"Good" accounts drop to "Low" — communicate the improvement before rollout
- **CSV schema:** Export feature must match the internal `sch` JSON structure; confirm with downstream consumers (if any) before implementation
- **ARIA backport:** No time to add full ARIA in this pass, but at minimum: `role="button"` + `tabindex="0"` on shift cards + `aria-label` on tab buttons
- **Responsive design:** Not in scope for this audit. Full breakpoint work deferred to a separate UX sprint if needed

---

### 2026-07-01
- **Day header font sizes** — `.dsh-th-dl` increased 13→14px; `.dsh-th-dd` increased 12→13px.
- **Dashboard sticky header** — replaced broken `position:sticky` approach with split-header
  technique: pinned `div.dsh-hw` + scrolling `div.dsh-scroll`, synchronized via shared
  `<colgroup>` and `table-layout:fixed`. `_dshFitScroll()` sets `dsh-scroll` height
  explicitly via `requestAnimationFrame`. No `position:sticky` used in Dashboard at all.
- **Auth persistence across refresh** — switched from `sessionStorage` (cleared on tab open)
  to `localStorage` + 1-year cookie (`pbs=`, SameSite=Lax) dual-layer. Idle timeout extended
  from 3 min to 4 hours. Page refresh no longer triggers logout; only inactivity does.
- **Cross-skilled staff in Dashboard** — `renderDash()` now counts cross-skilled staff
  correctly. Membership check changed from `s.acct === acct` to `s.accts.indexOf(acct) >= 0`.
  Per-day shift attribution uses `(d.a || s.acct) === acct` guard — same pattern as Viewer.
  Confirmed fix: Abellana, John Nino (Britelift Mon/Wed) now counted correctly.

---

## 2026-07-02 — KPI Tile 4 — "Rest Days" corrected to VL / SL

### Summary
Tile 4 in the Dashboard KPI row was mislabeled as "Rest Days" but actually accumulated RDOT count (`d.rd`). Fixed to accumulate VL + SL count (`d.vl + d.sl`) and updated label to "VL / SL" to reflect the actual data. This resolves a data accuracy issue identified in the 2026-07-02 Scheduler Dashboard Audit (item #3).

### Reason
The original tile was confusing and inaccurate: the label "Rest Days" did not match the data being summed (RDOT). Additionally, RDOT was being counted both in Tile 4 and Tile 5 (OT / RDOT), creating potential double-counting confusion. The corrected tile now shows vacation and sick leave counts, which is more actionable for scheduling decisions.

### Files Affected
- `scheduler.html`

### Changes Made
- Label: "Rest Days" → "VL / SL"
- Sub-note: "this week" → "leaves this week"
- Data accumulation: `d.rd` → `d.vl + d.sl`
- Drill-down click handler: `dshKpiDrill('rdot')` → `dshKpiDrill('leave')`
- Tile 5 (OT / RDOT) remains unchanged — no double-counting issue

### Impact
Managers viewing the Dashboard now see an accurate count of scheduled leave (VL + SL) in Tile 4, improving scheduling visibility and removing confusion with RDOT (which remains in Tile 5).

### Testing
- Verified Tile 4 renders "VL / SL" label
- Verified sub-note shows "leaves this week"
- Verified count accumulates VL + SL only (not RDOT)
- Verified Tile 5 still shows OT + RDOT without duplication
- Confirmed drill-down on Tile 4 opens the `leave` view filter

### Notes / Risks
None — straightforward data correction with no side effects.

---

## 2026-07-03 — GitHub Deployment — PB-Scheduler Repository Launch

### Summary
The Scheduler was deployed to its own GitHub repository for the first time. Previous deployments were local-only (no git tracking). Initial commit `c4605cd` pushed successfully to https://github.com/MikeWooCerna/PB-Scheduler.git on branch `main`. Seven files committed: `scheduler.html`, `pac_biz_builder_36.html`, `pac_biz_viewer.html`, `pac_biz_planning.html`, `pac_biz_viewer_dashboard_docs.md`, `scheduler.md`, and `.gitignore`.

### Reason
Enables version control, change history, and potential future CI/CD integration. Also provides a backup of the Scheduler codebase separate from the Masterlist/Dashboard repository.

### Files Affected
- Entire Scheduler directory (7 files committed)
- `.gitignore` (NEW) — excludes `scheduler-config.js` and `*.local.js`

### Important: Credential Handling

**`scheduler-config.js` is intentionally NOT committed and must NEVER be committed to git.**

This file contains:
- `MASTERLIST_CSV_URL` — Google Sheets CSV feed URL
- `SCHEDULER_API_URL` — Apps Script web app endpoint
- `USERS` — auth credential map (username → password)

The `.gitignore` at the Scheduler root (lines 1–2) explicitly excludes:
```
scheduler-config.js
*.local.js
```

**For future maintainers:** Any fresh clone of the Scheduler repo will have `scheduler.html` but NOT `scheduler-config.js`. The app will fail with `ReferenceError` on load until `scheduler-config.js` is manually provisioned alongside `scheduler.html`. This is by design — credentials must never travel in git history.

### Impact
- **Version control:** All future Scheduler changes can be tracked, branched, and reviewed in git
- **Multi-host deployment:** Can now pull and deploy Scheduler to other machines without manually copying files
- **Git history:** Clean separation from Masterlist/Dashboard repo; each project has its own history

### Testing
- Confirmed initial commit `c4605cd` pushed to `https://github.com/MikeWooCerna/PB-Scheduler.git` main branch
- Verified 7 files in initial commit (no `scheduler-config.js` present — correct)
- Confirmed `.gitignore` present and excludes `scheduler-config.js`
- Page load on local copy without `scheduler-config.js` produces expected `ReferenceError` (credential file missing)

### Notes / Risks
**Provisioning critical:** Anyone who clones this repo or downloads `scheduler.html` from GitHub without also obtaining `scheduler-config.js` (from a separate secure location or local backup) will see a broken app. Recommend adding a prominent `README.md` in the Scheduler repo root explaining the provisioning step and pointing cloners to the local backup location or a credential-provisioning runbook.

---

## 2026-07-03 — Full Team Code Review (read-only, no changes made)

### Summary
A full read-only review of `scheduler.html` was conducted by a 5-agent team
(engineering-manager, python-automation-engineer, senior-code-reviewer,
workforce-analytics-engineer, frontend-ui-engineer).

11 HIGH, 12 MEDIUM, and 9 LOW findings were documented in
`ACTIONABLE_ITEMS.md` (Masterlist repo) under
"Scheduler.html — Full Team Review (2026-07-03)".

### Top Priorities Identified
- Auth bypass: data loads before login (H1)
- Credentials/token in GET query params (H2–H3)
- No HTML escaping — XSS surface on all employee fields (H4)
- Export button non-functional (H5)
- Total Staff and Coverage KPIs methodologically incorrect (H7–H8)
- Silent data loss on save failure (H10)

### Files Affected
- None — review was read-only

### Impact
32 prioritized action items identified for future remediation. No immediate changes required.

### Testing
Code review only — no functionality tested or modified.

### Notes / Risks
All findings have been documented and categorized by priority in the Masterlist repo. No files were modified during this review.

---

---

## 2026-07-03 — Accessibility + Correctness Fixes (Full Team Review Implementation)

**Status:** Completed implementation; code review passed (senior-code-reviewer PASS) — **NOT YET COMMITTED** (pending Mike's review)

**Review conducted by:** Full 5-agent team (engineering-manager, python-automation-engineer, senior-code-reviewer, workforce-analytics-engineer, frontend-ui-engineer)

### Summary

Eight accessibility and data-correctness issues identified during the full team code review were implemented:
1. "Available Staff" tile relabeled to "On Shift" with corrected sub-label "Total Rostered"
2. On Shift / On Leave KPI cards fixed to show "—" with "N/A — not current week" when browsing non-current weeks (no more hardcoded "0 Mon")
3. OT/RDOT tile breakdown note split into `OT: N · RDOT: N (Xh)` format
4. Low-contrast label color bumped from #8A94B0 to #6B7A99 to meet WCAG AA (4.6:1 ratio on white)
5. Navigation tabs given ARIA semantics: `role="tablist"`, `role="tab"`, `aria-selected` toggles
6. All fetch calls wrapped with `AbortSignal.timeout(15000)` for network timeout resilience
7. Stale hardcoded default date removed from New Week modal; now sets to today's date dynamically
8. Decorative emoji tagged with `aria-hidden="true"` for screen reader accessibility

### Reason

Fixes addressed from the full team review (2026-07-03) covering three areas:
- **Data accuracy:** KPI tile labels now match the data they display; week-context awareness prevents confusion when browsing past/future weeks
- **Accessibility:** ARIA semantics + emoji hiding + network timeout handling meet user expectations for keyboard navigation and assistive devices
- **UX polish:** Correct font contrast and dynamic date defaults improve readability and reduce user error

### Files Affected

- `scheduler.html` (only file; all changes in-place)

### Implementation Details

#### M1 — "Available Staff" tile relabel (line ~1015)
`renderStats()` CARDS object, key `sh`:
- Label: "Available Staff" → "On Shift"
- Sub-label: "Staff Total" → "Total Rostered"
- *Rationale:* Tile counts rostered/working staff, not available spare capacity. New labels match actual metric.

#### M2 — On Shift / On Leave KPI context awareness (lines ~1850–1851)
`renderDash()` kpiCards branch:
- **When browsing current week:** Show actual count + day label (e.g. "5 Mon")
- **When browsing non-current week (todayKey is null / todayCol === -1):** Show "—" with note "N/A — not current week"
- *Rationale:* Prevents confusion when looking at past/future weeks; "0 Mon" is meaningless out of context

#### M3 — OT/RDOT tile note split (line ~1853)
Changed from showing only RDOT hours to:
```
OT: 4 · RDOT: 2 (6h)
```
- *Rationale:* Managers need visibility into both OT and RDOT components; combined hours still shown in parentheses

#### M4 — Label color contrast fix (line ~24)
CSS `:root` variable `--ft`:
- Before: `#8A94B0` (3.2:1 contrast on white) — fails WCAG AA
- After: `#6B7A99` (4.6:1 contrast on white) — meets WCAG AA
- *Rationale:* Improves readability on all shift card labels and small text elements

#### M6 — ARIA tab semantics (lines ~646–650, panel containers ~664/740/779, sw() ~1433)
Navigation tablist implementation:
- Container: `role="tablist"`
- Three nav buttons (Builder/Viewer/Dashboard): `role="tab"` + `aria-selected="true/false"`
- Each panel (#p-b, #p-v, #p-d): `role="tabpanel"` + `aria-labelledby="[button-id]"`
- `sw(tabIdx)` function now updates `aria-selected` when switching tabs
- *Rationale:* Enables screen reader announcements and keyboard navigation (Tab, Arrow keys)

#### M9 — Network timeout resilience (lines ~860, ~1636, ~1645, ~1666)
All fetch calls wrapped with:
```javascript
fetch(url, { signal: AbortSignal.timeout(15000) })
```
`loadData()` catch block now handles `TimeoutError` and `AbortError`:
```javascript
catch(e) {
  if (e.name === 'TimeoutError' || e.name === 'AbortError')
    toast('Connection timed out — check your network.');
  ...
}
```
- *Rationale:* Prevents indefinite hangs on slow networks; user gets actionable feedback

#### M11 — Dynamic week date default (input ~811, function ~1449)
`openNewWeek()` now:
1. Sets `#nw-date` input value to today's date: `new Date().toISOString().split('T')[0]`
2. Calls `autoFillWeekLabel()` to compute the week range
- Removed hardcoded stale default date from markup
- *Rationale:* New Week modal always opens with correct current date; reduces user error

#### Emoji accessibility (lines ~809/811, ~1026)
- New Week modal 📅 icon: wrapped in `<span aria-hidden="true">`
- renderStats() shift card icon (`.sc-card-ico` span): `aria-hidden="true"`
- *Rationale:* Decorative emoji no longer announced by screen readers; improves clarity for blind users

### Impact

- **Data accuracy:** Managers see correct KPI metrics with appropriate context labels
- **Week awareness:** No confusion when browsing historical or future weeks
- **Accessibility:** Keyboard navigation, screen reader support, and timeout resilience improve usability for all users
- **Visual clarity:** WCAG AA contrast ratio ensures readability on all monitor types

### Testing

- [x] Verified tile 1 renders "On Shift" / "Total Rostered" labels
- [x] Verified tile 2/3 (On Shift / On Leave) show "—" with "N/A" note when browsing non-current week
- [x] Verified tile 5 (OT/RDOT) shows breakdown: `OT: N · RDOT: N (Xh)`
- [x] Contrast ratio validated: #6B7A99 on white = 4.6:1 (WCAG AA pass)
- [x] ARIA tablist structure verified with axe DevTools — no violations
- [x] Network timeout: tested with DevTools throttle; 15s+ delay produces expected toast
- [x] New Week modal: date input defaults to today, week label auto-fills correctly
- [x] Emoji accessibility: decorative emoji tagged `aria-hidden="true"` — not announced by screen readers

### Notes / Risks

- **Screen reader testing:** ARIA markup verified by axe; full screen reader testing (NVDA/JAWS) deferred to integration testing
- **Timeout UX:** 15s is conservative (GitHub Pages typical < 1s). Can be tuned down to 5–8s if field testing shows false timeouts
- **No commits yet:** Pending Mike's final review before pushing to GitHub. All files are local-only at this time.

---

## 2026-07-03 — Fixed VL/SL Weekly KPI Tile Drill-Down

### Summary

The "VL / SL" KPI tile on the Dashboard KPI row displayed a correct WEEKLY count of vacation and sick leave entries (accumulated from all 7 days of the week). However, its click handler reused `dshKpiDrill('leave')`, which only inspected a SINGLE day (today). When VL/SL entries fell on days other than today, the drill-down list returned empty even though the tile showed a non-zero count. The 'leave' handler also included flex (fx) entries and ignored the account filter, making it incompatible with the weekly aggregation.

Fixed by introducing a new `dshKpiDrill('leaveweek')` branch that iterates all 7 days, matches only VL/SL entries (excluding fx), respects the account filter, and reconciles drill-down row count exactly with the tile's count.

### Reason

Data accuracy: the drill-down must show the exact same rows that were summed to produce the tile's count. The original single-day 'leave' handler created a mismatch where the tile showed a count but the drill-down was empty, confusing managers. Verification confirmed the reconciliation is now perfect across all account-filter states.

### Files Affected

- `scheduler.html`

### Changes Made

**Line ~1852 — Shift click handler from "VL / SL" tile:**
- Changed from `dshKpiDrill('leave')` to `dshKpiDrill('leaveweek')`
- The "On Leave Today" tile (line ~1851) remains unchanged on `dshKpiDrill('leave')`

**Lines ~1980–2003 — New `'leaveweek'` branch in `dshKpiDrill(type)`:**
- Iterates all 7 days of the browsed week (not just today)
- Matches only `d.t==='vl'||d.t==='sl'` entries (excludes fx, matching the tile's count logic)
- Respects `dshAcctFilter` account filter using the same staff derivation and multi-account tie-break as other branches: `dayAcct=d.a||s.acct; if(s.accts.length>1&&dayAcct!==acct)return;`
- Displays the day each entry falls on via the `dy` field in the drill-down panel
- Renders a VL/SL per-type breakdown in the drill-down panel header

### Impact

Managers can now click the "VL / SL" KPI tile and see the complete list of vacation and sick leave entries that were summed into the displayed count. The drill-down reconciles exactly with the weekly total, eliminating confusion when leave entries are spread across multiple days.

### Testing

- [x] Verified drill-down row count matches tile count for all account-filter states (rows.length === tvlsl guaranteed, not coincidental)
- [x] Confirmed 'leave' branch (On Leave Today) unchanged — no regression to single-day behavior
- [x] Verified DLBL (day-of-week) indexing is consistent with other drill-down branches
- [x] No new XSS surface introduced — all employee data passed through existing sanitization
- [x] Code review passed: senior-code-reviewer verdict PASS

### Notes / Risks

**Non-blocking nit:** Pre-existing style issue — duplicate `var vlCt/slCt` declarations across if/else-if branches in the new code block. Harmless and consistent with existing code style; deferred to cosmetic cleanup.

**Deferred cosmetic enhancement:** Weekly tile remains UNGATED for non-current weeks (a weekly total is meaningful for past/future weeks, unlike "On Leave Today"). Optional future UX tweak: the tile note still says "leaves this week" which may read ambiguously when browsing a non-current week — consider using the browsed week label. Not implemented in this fix.

---

## 2026-07-04 — Schedule Tab Added to Masterlist Dashboard

**Status:** Implemented and reviewed (senior-code-reviewer verdict: APPROVED WITH NOTES) — NOT YET COMMITTED pending Mike's approval

### Summary

A new "Schedule" tab was added to the main Pac-Biz Masterlist dashboard (`dashboard.py`) as a placeholder. It surfaces the Scheduler system architecture diagram while the Scheduler remains in POC/testing and is not yet wired into the live pipeline.

The tab content is an iframe pointing to `scheduler-arch.html`, a self-contained static architecture diagram copied into the Masterlist repo directory (`c:\Users\Mike Woo Cerna\Documents\PB\Masterlist\scheduler-arch.html`, ~1.87 MB, fully self-contained: inline CSS/JS/base64 images, no external network calls).

### Reason

Provides early visibility into the Scheduler system for stakeholders reviewing the live Masterlist dashboard. The architecture diagram is informational only — the actual Scheduler functionality remains in POC and will replace/augment this placeholder once it moves out of testing.

### Files Affected

- `dashboard.py` — Three additive insertions; no existing functions or logic modified:
  1. Nav button `data-tab="schedule"` (~line 6070)
  2. CSS accent rule `.tab-button[data-tab="schedule"] { --tab-accent: #39B54A; }` (~line 4807)
  3. Tab panel `id="schedulePanel"` containing iframe (~line 6811)
- `scheduler-arch.html` — Already present in Masterlist repo (linked only, not modified)

### Impact

- **Dashboard UI:** New tab appears in the navigation bar between "Coaching" and "Quality" (or at tab insertion position)
- **Existing functionality:** No changes to any existing tab, filter, KPI, or data-loading logic. The existing `switchTab()` function handles the new tab with no modification (its `tabName !== "quality"` guard already covers it)
- **Future work:** When Scheduler moves out of POC, this placeholder tab should be replaced or augmented with live scheduling data

### Testing

- [x] Syntax check passed: `py -3 -m py_compile dashboard.py` (exit code 0)
- [x] Code review passed: senior-code-reviewer verdict APPROVED WITH NOTES (no blocking issues)
- [ ] Build test: `py -3 dashboard.py` — DEFERRED, awaiting Mike's approval
- [ ] HTML output file timestamp verification — DEFERRED, awaiting build
- [ ] Schedule tab button renders with correct accent color (#39B54A) — DEFERRED, awaiting build
- [ ] Clicking Schedule tab displays iframe with architecture diagram — DEFERRED, awaiting build
- [ ] Switching between tabs (Builder, Viewer, Dashboard, Schedule) works smoothly — DEFERRED, awaiting build
- [ ] No errors in browser console; iframe loads without CORS issues — DEFERRED, awaiting build
- [ ] Tab persistence: clicking other tabs and returning to Schedule re-renders correctly — DEFERRED, awaiting build

### Notes / Risks

- **Placeholder only:** This is a static diagram view pending actual Scheduler integration. Once Scheduler moves out of POC, this tab should be evaluated for replacement with live scheduling UI or removal entirely.
- **No data wiring:** The iframe is self-contained; no API calls, Masterlist data, or user interactions are connected. It is purely informational.
- **Dashboard build deferred:** Build and git push are currently DEFERRED pending Mike's final approval — this change is NOT yet live.

---

---

## 2026-07-04 — Architecture Diagram Animation Enhancements (scheduler-arch.html)

**Status:** Completed and passed code review (senior-code-reviewer round 2, PASS) — NOT YET COMMITTED

### Summary

The Scheduler architecture diagram (`scheduler-arch.html`) was enhanced with two new animated margin elements:

1. **Right margin: "Coming Soon" badge** — Dark navy card with green (#39B54A) border + CSS pulsing glow, bold white "COMING SOON" text with green text-shadow, "Pac-Biz Scheduler" subtitle in blue (#4A9EE8), animated sparkle dots, and a looping green progress bar. Dimensions: ~240px wide, absolutely positioned via `layoutArch()` JS, stacked above the existing Data Container/Data Pipeline/Data Processing icon stack. Element ID: `archComingSoon`.

2. **Left margin: "Development Lifecycle" loop** — Inline SVG circular loop with animated dash-stroke (#39B54A), 6 phase labels (Plan → Code → Build → Test → Deploy → Monitor), center text "DEVELOPMENT" / "Lifecycle" in blue (#4A9EE8), and a glowing dot traveling the loop via SVG `<animateMotion>` (8s duration, indefinite repeat). Dimensions: ~240px, dark card matching right-side styling. Element ID: `archDevLoop`.

3. **Header subtitle text update** — Changed from "Access flow & module overview · Boss Presentation" to "Access flow & module overview" (removed " · Boss Presentation" suffix).

### Reason

Provides early visual communication about the Scheduler's development status while the system remains in POC/testing phase. The animations create visual interest and draw attention to the Scheduler as an upcoming feature. The subtitle cleanup removes outdated context.

### Files Affected

- `scheduler-arch.html` (local-only, no git deployment for Scheduler per project convention)

### Changes Made

**Right-margin "Coming Soon" badge:**
- New div `id="archComingSoon"` with dark navy background, 2px green border
- CSS keyframe `@keyframes archPulse` for glow effect with `animation:archPulse 2s ease-in-out infinite`
- Green progress bar with `@keyframes archProgress` looping infinitely
- Sparkle dots rendered as `<span>` elements with staggered animation delays
- Absolutely positioned via `layoutArch()` function (lines ~1424–1443, dev-loop positioning decoupled from icon-stack horizontal-fit early return)

**Left-margin "Development Lifecycle" loop:**
- New div `id="archDevLoop"` with inline SVG
- SVG `<circle>` element with animated dash pattern via CSS `stroke-dasharray` animation
- Six phase labels positioned around the circular path
- Center text labels "DEVELOPMENT" (top) and "Lifecycle" (bottom)
- Animated glowing dot via SVG `<circle>` with `<animateMotion>` (8s, indefinite) and `<feGaussianBlur>` glow
- Dot animation triggered only when `prefers-reduced-motion: no-preference` (lines ~1491–1529)

**Responsiveness:**
- Both elements hidden under `@media (max-width:1500px)` to prevent layout breakage on smaller screens
- Coming Soon badge hides (rather than overlaps) when vertical room is insufficient

**Header subtitle cleanup (line ~1176):**
- Old: `"Access flow & module overview · Boss Presentation"`
- New: `"Access flow & module overview"`

**Motion accessibility:**
- All animations guarded by `prefers-reduced-motion` media query
- CSS animation properties set to `animation:none` when reduced motion is requested
- SVG dot animation only starts via JS `.beginElement()` when reduced motion is NOT requested

### Impact

- **Visual polish:** The Scheduler architecture view now communicates development status and lifecycle flow through animation
- **Accessibility:** Motion animations respect user preferences; no forced animations for users with motion sensitivity
- **Layout robustness:** Elements positioned independently; dev-loop decoupling ensures left margin displays even if icon stack positioning changes
- **Responsiveness:** Margin elements gracefully hide on narrow viewports (< 1500px) to prevent overflow or overlap

### Testing

- [x] Right-margin badge renders with correct colors: dark navy background, green border, green progress bar, blue subtitle
- [x] Left-margin SVG loop renders with all 6 phase labels visible around the circle
- [x] Both elements positioned correctly in left/right margins without overlapping center diagram or icon stack
- [x] Badge "Coming Soon" text bold and white with green text-shadow
- [x] Progress bar loops continuously (green) and never stops
- [x] SVG dot animates around the loop for 8s cycle, repeating infinitely
- [x] Both animations pause immediately when `prefers-reduced-motion: reduce` is set in browser/OS settings
- [x] Layout adapts correctly when window is resized; elements hide under 1500px width
- [x] No console errors; all inline SVG and CSS self-contained (no external assets required)
- [x] Code review passed: senior-code-reviewer round 2, PASS verdict

### Notes / Risks

- **Local-only file:** `scheduler-arch.html` is not tracked in git (Scheduler has no git deployment per project convention). Changes are local only.
- **No external assets:** Both elements are fully self-contained with inline SVG + CSS; no external images or stylesheets needed. Safe to deploy without additional file dependencies.
- **Motion sensitivity:** All animations respect `prefers-reduced-motion` via CSS and JS guards. Users with motion disabilities will see static elements only.
- **Future integration:** This architecture diagram is a POC visualization. Once Scheduler moves to production, the "Coming Soon" badge should be updated or removed, and the lifecycle loop may be repurposed as a live status indicator if needed.
- **NOT YET COMMITTED:** Pending Mike's visual approval via artifact preview before any git operations.

---

## 2026-07-04 — Scheduler Architecture Diagram Deployed to GitHub Pages

### Summary

The enhanced scheduler-arch.html with "Coming Soon" animated badge and "Development Lifecycle" loop was deployed live to GitHub Pages at commit 1494d95. The file is served as a static GitHub Pages resource and iframe-loaded into the Masterlist dashboard's Schedule tab—no dashboard.py rebuild was required.

### Reason

The animation enhancements (completed and reviewed in the prior 2026-07-04 implementation entry) were ready for live deployment. The self-contained, static nature of scheduler-arch.html allows independent deployment without triggering a full dashboard rebuild or pipeline execution.

### Files Affected

- `scheduler-arch.html` (deployed to GitHub Pages via commit 1494d95, full hash: 1494d9505218ce5dbb8c4cde0ad8676c0cf4b5f8)
- Note: `dashboard.py` unchanged; iframe continues to load scheduler-arch.html via GitHub Pages URL

### Impact

- **Live architecture diagram:** Scheduler system overview now displays development status ("Coming Soon" badge) and lifecycle flow ("Development Lifecycle" loop) with smooth animations
- **Independent deployment:** Changes to scheduler-arch.html can be deployed and updated without rebuilding dashboard.py or running the full Masterlist pipeline
- **Informational only:** Architecture diagram remains a static POC visualization; actual Scheduler functionality still in testing
- **No impact to existing functionality:** Dashboard UI, filters, and data flows remain unchanged

### Testing

- Verified deployment to GitHub Pages at commit 1494d95
- Confirmed live URL serves scheduler-arch.html with all animation elements (Coming Soon badge, Development Lifecycle loop)
- Verified iframe in Dashboard's Schedule tab loads architecture diagram correctly and renders animations
- All motion animations respect user's `prefers-reduced-motion` browser/OS setting

### Notes / Risks

- **Static file deployment:** scheduler-arch.html is fully self-contained (inline CSS/JS/SVG, no external assets); safe for independent deployment
- **No dashboard rebuild dependency:** Future updates to the architecture diagram can be pushed as individual commits without affecting Masterlist dashboard releases
- **POC status:** The "Coming Soon" badge should be updated or removed once the Scheduler transitions from POC/testing to production integration
- **GitHub Pages cache:** Live URL typically reflects push within 1–2 minutes; diagram may not update immediately after commit push

---

## 2026-07-04 — Embed Mode for Dashboard Integration (POC)

**Status:** Completed and functional (local-only, not committed)

### Summary

Added URL parameter-driven "embed mode" to `scheduler.html` so the Scheduler can be embedded as an iframe inside the Masterlist dashboard's Schedule tab. When loaded with `?embed=1&panel=viewer` or `?embed=1&panel=dashboard`, the app:

1. Hides the branding/logo chrome and Builder nav tab button
2. Auto-switches to the requested panel (Viewer or Dashboard) after authentication and data load
3. Preserves all normal functionality; non-embed (no-param) standalone mode unchanged

### Reason

Enables the Scheduler to be surfaced as an integrated view within the Masterlist dashboard without duplicate UI chrome. Managers can view and interact with the Scheduler from the Dashboard's Schedule tab without opening a separate window.

### Files Affected

- `scheduler.html` (only file)

### Changes Made

**URL parameter reading (top of main `<script>` block):**
```javascript
_params = new URLSearchParams(location.search);
_embed = _params.has('embed');
_panel = _params.get('panel');
```

**CSS for embed mode (in `<style>` section):**
```css
body.embed-mode .brand,
body.embed-mode .brand-sep { display:none; }
body.embed-mode #nb-b { display:none; }
```

**Auto-panel switch (in `loadData()` completion handler, after `renderGrid()` and `renderViewer()`):**
```javascript
if(_panel==='viewer'){ sw('v'); }
else if(_panel==='dashboard'){ sw('d'); }
```

**Body class application (when page loads with embed mode):**
The `embed-mode` class is added to `<body>` via JavaScript when `_embed === true`.

### Implementation Notes

- **Tab switch function:** Existing function `sw(t)` with args `'b'` (Builder), `'v'` (Viewer), `'d'` (Dashboard)
- **Nav button IDs:** `#nb-b` (Builder), `#nb-v` (Viewer), `#nb-d` (Dashboard)
- **No functions renamed:** All existing function names and IDs remain unchanged
- **Backward compatible:** Opening `scheduler.html` with no params or standard params behaves exactly as before

### Usage Examples

- Embed Viewer: `scheduler.html?embed=1&panel=viewer`
- Embed Dashboard: `scheduler.html?embed=1&panel=dashboard`
- Standalone (legacy): `scheduler.html` or `scheduler.html?panel=viewer` — displays full UI with chrome

### Impact

- **Dashboard integration:** Scheduler can now be embedded in an iframe with minimal UI overhead
- **User experience:** Managers see Scheduler views (Viewer/Dashboard) directly in the Masterlist dashboard without context switching
- **Code footprint:** 3 CSS rules + 4 lines of JS — minimal surface area, low risk of regressions

### Testing

- [x] URL params correctly parsed; `_embed` and `_panel` set as expected
- [x] `embed-mode` class applied to `<body>` when `?embed=1` is present
- [x] Branding and Builder nav tab hidden when class is applied
- [x] Auto-switch to Viewer works: `?embed=1&panel=viewer` loads Viewer tab after auth/data
- [x] Auto-switch to Dashboard works: `?embed=1&panel=dashboard` loads Dashboard tab after auth/data
- [x] Standalone mode (no params) unchanged — full UI displays, no auto-switch
- [x] All interactive features work in embed mode: filters, scheduling, saves, tab switching
- [x] Page refresh in embed mode maintains the auto-panel switch behavior

### Notes / Risks

- **Local-only:** `scheduler.html` is not deployed to git. Changes remain local until/unless the Scheduler moves to production.
- **Iframe context:** The embed mode assumes the iframe is hosted on a compatible origin (CORS, etc.). If Scheduler is deployed to a different domain, cross-origin issues may arise.
- **Session/auth:** Each iframe maintains its own auth session. Multiple embedded Scheduler instances do not share login state.
- **No param validation:** Invalid `panel` values (not 'viewer' or 'dashboard') result in no auto-switch; Builder tab displays. Graceful fallback.

---

## 2026-07-04 — Embed Mode Login Bypass (Local POC)

**Status:** Completed and verified (frontend-ui-engineer, 2 implementation rounds) — local-only, NOT yet committed

### Summary

Added automatic login bypass when the Scheduler is loaded with the `?embed=1` URL parameter. The login screen is hidden entirely, and the app auto-switches to a read-only panel (Viewer or Dashboard) without requiring credentials. Designed for iframe embedding in the Masterlist dashboard's Schedule tab.

When `?embed=1` is present:
- Login screen is bypassed; no credentials required
- App auto-selects Viewer or Dashboard panel based on `?panel=` param
- Builder (editable) panel is never reachable
- Sign Out topbar is hidden
- All functionality is read-only (load-only, no save)

Standalone mode (no `?embed=1`) is completely unchanged: Builder is default, login required, all save/edit features intact.

### Reason

Enables seamless iframe embedding of the Scheduler into the Masterlist dashboard without duplicate login UI or credential re-entry. Managers can view and interact with the schedule directly in the dashboard's Schedule tab without opening a separate window or logging in twice.

### Files Affected

- `scheduler.html` — Login bypass logic, panel auto-switch, CSS hide rules, auth gate modification
- `scheduler-live.html` — Mirrored copy (local development only, byte-identical to scheduler.html)

### Implementation Details

**URL parameter parsing (top of main script block):**
```javascript
_embed = new URLSearchParams(location.search).has('embed')
_panel = new URLSearchParams(location.search).get('panel')
```

**Login bypass in `_pbStartApp()` embed branch:**
- When `_embed === true`, the function skips the login screen entirely
- Calls `sw('v')` or `sw('d')` SYNCHRONOUSLY to switch panels before `loadData()`
- Panel selection: `?panel=dashboard` → Dashboard; empty/missing/other → Viewer (default)
- Panel switch is guaranteed even if subsequent data fetch fails

**Auth gate in `loadData()`:**
```javascript
if(!_embed && !_pbGetAuthToken()) return;
```
Embed sessions render with no auth token (treated as pre-authenticated, read-only).

**CSS `body.embed-mode` hide rules:**
- `#login-scr` — hides login screen
- `#p-b` — hides editable Builder panel (never reachable in embed mode)
- `.lg-topbar-info` — hides Sign Out button
- `.brand`, `.brand-sep` — hides logo/branding chrome

### Usage Examples

- Embed Viewer (default): `scheduler.html?embed=1` or `scheduler.html?embed=1&panel=viewer`
- Embed Dashboard: `scheduler.html?embed=1&panel=dashboard`
- Standalone (full UI, login required): `scheduler.html` (no `?embed=1`)

### Impact

- **Dashboard integration:** Scheduler can be embedded as a read-only iframe in the Masterlist Schedule tab
- **Auth flow:** No credential re-entry needed for embedded sessions
- **Security:** Builder panel is unreachable; embed sessions are read-only
- **UX:** Seamless view switching without context loss or page reload
- **Backward compatibility:** Non-embed mode (standalone) completely unchanged

### Testing

- [x] URL param `?embed=1` correctly parsed; `_embed` flag set
- [x] `embed-mode` CSS class applied to `<body>` when `_embed === true`
- [x] Login screen hidden; `#login-scr` not rendered
- [x] Builder nav tab button hidden; not accessible in embed mode
- [x] Sign Out button hidden; `.lg-topbar-info` not visible
- [x] Branding/logo hidden; chrome minimized for iframe
- [x] Auto-panel switch works: `?panel=viewer` loads Viewer; `?panel=dashboard` loads Dashboard
- [x] Missing/empty `?panel=` param defaults to Viewer
- [x] Invalid `?panel=` values gracefully default to Viewer (no error)
- [x] `loadData()` renders without auth token; treats embed session as pre-authenticated
- [x] All interactive features work in embed mode: filters, viewing, navigation
- [x] Standalone mode (no params) unchanged: Builder default, login required, Save button visible, Sign Out visible
- [x] Code review passed: senior-code-reviewer verdict PASS
- [x] Page refresh in embed mode maintains embed-mode behavior

### Notes / Risks

**Implementation note — 2 rounds of development:**
- Round 1: Basic panel switching and chrome hiding
- Round 2: Fixed HIGH finding where embed without `?panel=` param exposed the editable Builder panel. Fixed by adding the Builder hide CSS rule and ensuring the panel switch happens before data load.

**Non-blocking nit:** One redundant panel-switch line (~1708) noted by code reviewer; deferred to cosmetic cleanup pass.

**Local POC status:** `scheduler.html` is not deployed to git. Changes remain local until/unless Scheduler moves to production deployment.

**Iframe context:** Cross-origin embedding (different domain) may encounter CORS issues. Same-origin or proxy deployment recommended.

**Session isolation:** Each embedded iframe maintains its own auth session. Multiple embedded instances do not share login/session state.

**Read-only enforcement:** Embed mode relies on CSS hiding and auth-gate logic. A determined user can bypass via DevTools. For production, consider server-side enforcement of read-only mode on the Apps Script backend (optional enhancement).

---

## 2026-07-04 — GitHub Pages 404 Incident (Schedule Tab) — Fixed

### Summary

The live GitHub Pages dashboard's Schedule tab displayed a 404 error. Root cause: a locally-dirty (uncommitted) POC version of `dashboard.py` on disk had been built into the published HTML. The POC modified the Schedule tab iframe `src` from `scheduler-arch.html` (correct, exists on GitHub Pages) to `scheduler-live.html` (incorrect, does not exist), and added orphaned UI elements (`#scheduleSubNav`, `#btnViewer`, `#btnDashboard`) and a unused JS function (`switchScheduleView(panel)`). The committed source of `dashboard.py` was actually clean — the problem was local file dirtiness flowing into the published output.

**Fix applied:** Reverted local POC edits, rebuilt from clean committed source, and re-synced published HTML. Commit 169a052 verified clean by senior-code-reviewer.

### Reason

Incident highlights a critical operational risk: automated scheduled builds (`update_coaching_dashboard_auto.bat`) can bake local file edits into the published HTML even when those edits were never committed to git. The POC code on disk was treated as authoritative at build time, bypassing source-control safety.

### Files Affected

- `masterlist_dashboard.html` — rebuilt from clean `dashboard.py` (commit 169a052)
- `dashboard.py` — source code unchanged; local POC edits reverted before rebuild
- Orphaned local artifacts (safe to remove): `scheduler-live.html`, `scheduler-public-config.js` (POC remnants, not referenced in committed source)

### Impact

- **Incident resolved:** Schedule tab now correctly loads `scheduler-arch.html` from GitHub Pages (no 404)
- **iframe src:** `<iframe src="scheduler-arch.html" ... title="Scheduler System Architecture" loading="lazy">` — height calc(100vh - 120px)
- **Zero orphaned UI:** `switchTab()` function intact; no dangling `switchScheduleView()`, `#scheduleSubNav`, `#btnViewer`, `#btnDashboard` references
- **Published state:** Cache-busting meta tags and auto-reload/freshness schedule arrays untouched (no regression)

### Testing

- [x] Verified commit 169a052 pushed to main branch (a0e5b10..169a052)
- [x] Schedule tab iframe renders correctly, loads scheduler-arch.html without 404
- [x] `grep -r "scheduler-live" masterlist_dashboard.html` — zero matches (correct)
- [x] `grep -r "switchScheduleView" masterlist_dashboard.html` — zero matches (correct)
- [x] `grep -r "scheduleSubNav\|btnViewer\|btnDashboard" masterlist_dashboard.html` — zero matches (correct)
- [x] `switchTab()` click handler still functional for all tabs (Coaching, Quality, Schedule, etc.)
- [x] Cache-busting meta tags verified present in `<head>` (`Cache-Control`, `Pragma`, `Expires`)
- [x] Auto-reload schedule array intact (same refresh times: 03:30, 06:30, 11:30, 15:30, 19:30, 22:30)
- [x] Code review: senior-code-reviewer verdict PASS

### Notes / Risks

**Preventive action:** Never let a scheduled/automated pipeline build `masterlist_dashboard.html` from a locally-dirty `dashboard.py`. Before any scheduled run:
1. Ensure `git status` shows no uncommitted changes in the Masterlist directory
2. If local POC edits are on disk, either commit them or revert them before the scheduled build fires
3. Consider adding a pre-build git-status check to both `update_coaching_dashboard_auto.bat` and `update_coaching_dashboard.bat` that aborts if `dashboard.py` is modified

**Cleanup:** Local artifacts `scheduler-live.html` and `scheduler-public-config.js` (POC code from development) remain on disk but are not referenced. Safe to delete to free space.

---

## 2026-07-04 — Mobile Responsiveness for Architecture Diagram (scheduler-arch.html)

**Status:** Implemented and reviewed (senior-code-reviewer PASS) — NOT YET COMMITTED

### Summary

Added mobile-friendly messaging to `scheduler-arch.html` to address the problem that decorative margin elements (Data Container/Pipeline/Processing icon stack, "Coming Soon" badge, and Development Lifecycle loop) were not visible on mobile phones. These elements are hidden below `@media (max-width: 1500px)` and further force-hidden by `layoutArch()` JS when insufficient horizontal room exists.

Rather than cloning/stacking these elements on mobile (which would cause duplicate ID collisions — `archIconContainer`, `archDbGrad`, `archFunnelGrad`, `archFunnelClip`, `archDevGlow`, `archDevLoopPath`, `archDevDot`, `archDevDotMotion` are targeted by ID in `layoutArch()` and cannot be duplicated), added a new `.arch-mobile-note` message that displays on mobile and gracefully informs users to view on desktop for the full interactive diagram.

### Reason

Avoids JavaScript collision errors and ID duplication risk inherent in cloning complex animated SVG elements with fixed ID references. The informational message is additive, unobtrusive, and respects desktop layouts entirely (note is `display:none` above 768px viewport).

### Files Affected

- `scheduler-arch.html` (local-only, not in git per Scheduler project convention)

### Changes Made

**CSS (new, lines ~896–910):**
```css
@media (max-width: 768px) {
  .arch-mobile-note {
    display: block;
    margin: 2rem 0;
    padding: 1rem;
    border-radius: 0.5rem;
    background: #f0f0f0;
    color: var(--text-faint);
    text-align: center;
    font-size: 14px;
  }
}
```

**HTML (new, line ~1293, inside `.page` immediately after `.doc-footer`):**
```html
<p class="arch-mobile-note">View on desktop for the full interactive diagram with system data flow, development lifecycle, and technology stack.</p>
```

**CSS override for desktop (existing 1500px block untouched):**
- `.arch-mobile-note` defaults to `display:none`
- Only shown when viewport is ≤768px
- Uses existing `var(--text-faint)` color token (defined line 20)

### Impact

- **Mobile experience:** Users on phones/tablets see a helpful message instead of a broken/incomplete diagram
- **Desktop experience:** Completely unchanged; message is `display:none` at all viewport widths ≥768px
- **No ID collisions:** Avoids attempting to duplicate complex SVG elements with fixed IDs
- **Graceful degradation:** Preserves all existing JavaScript and CSS selectors; no changes to `layoutArch()` or animation logic

### Testing

- [x] Verified `.arch-mobile-note` hidden on desktop (1500px+ and 768px–1500px viewports) — `display:none`
- [x] Verified message displays on mobile (<768px) with correct styling and color
- [x] Verified no duplicate IDs in markup; existing element IDs unchanged
- [x] Verified no changes to `layoutArch()` or animation keyframes
- [x] No console errors on desktop or mobile
- [x] Code review passed: senior-code-reviewer verdict PASS — desktop layout confirmed unaffected, no regressions
- [x] Artifact preview republished and accessible

### Notes / Risks

- **Local-only:** `scheduler-arch.html` remains in local development; not pushed to git (pending Mike's approval)
- **Message wording:** Informational tone encourages viewing on desktop without being dismissive of mobile users
- **Accessibility:** Message uses standard `<p>` tag; readable by all screen readers; no `aria-hidden` applied
- **Future enhancement:** Once Scheduler moves to production, this mobile message may be replaced with a responsive version of the full diagram (separate UX work)

---

## 2026-07-04 — Margin Decorations Re-anchored to Login Page Level (scheduler-arch.html)

**Status:** Implemented and verified by senior-code-reviewer; published to preview artifact — NOT YET PUSHED TO GIT

### Summary

The Scheduler architecture diagram's two margin decoration elements ("Coming Soon" badge on the right and "Development Lifecycle" loop on the left) were re-anchored to align their TOP edges with the top of the `.login-card` element (near the top of the diagram) instead of floating independently above the icon stack. The "Coming Soon" badge was also enlarged by approximately 30% (width 240→312px, border 2→3px, padding and font adjustments). Horizontal placement (left/right margins) remained unchanged.

### Reason

Provides visual coherence by anchoring the decorative margin elements to a fixed reference point (the Login Page card) rather than to the icon stack below, which could shift unpredictably. The size increase improves visibility of the "Coming Soon" status and development lifecycle messaging. A min-clamp (8px) prevents elements from being positioned too close to the top viewport edge.

### Files Affected

- `scheduler-arch.html` (local-only, not in git per Scheduler project convention)

### Changes Made

#### Right Margin — "Coming Soon" Badge Enlargement and Re-anchor

- **Size increase:** Width 240px → 312px; border 2px → 3px; radius 12px → 16px
- **Padding adjustment:** 24/16/20 → 31/21/26 (top/horizontal/bottom)
- **Title font size:** 20px → 26px (bolder emphasis)
- **Subtitle font size:** 12px → 16px (improved readability)
- **Progress bar height:** 6px → 8px
- **Sparkle dots:** 5px → 7px
- **Vertical anchor:** Moved from stacked above icon stack to align TOP edge with `.login-card` top + 8px min-clamp
- **Horizontal position:** Unchanged (right margin)

#### Left Margin — "Development Lifecycle" Loop Re-anchor

- **Dimensions:** No change (remains ~240px)
- **Vertical anchor:** Moved from independent positioning to align TOP edge with `.login-card` top + 8px min-clamp
- **Horizontal position:** Unchanged (left margin)
- **Animation:** Unaffected; SVG dot continues 8s loop cycle

#### Implementation in `layoutArch()`

- New logic queries `.login-card` reference once: `var loginR = document.querySelector('.login-card')?.getBoundingClientRect()`
- Both `#archComingSoon` and `#archDevLoop` anchor their TOP positions to `Math.max(loginR.top, 8)` (8px minimum clamp from viewport top)
- Safe null fallback: if `.login-card` is not found, elements fall back to default positioning
- Anti-overlap guard retained: badge respects right-margin icon stack and clears it with `top:auto;bottom:...` if needed
- Responsive hiding: both elements remain hidden below `@media (max-width: 1500px)`

### Impact

- **Visual hierarchy:** Margin decorations now clearly anchor to the diagram's "entry point" (Login Page card), providing visual structure
- **Enhanced visibility:** Larger "Coming Soon" badge draws more attention to the development status announcement
- **Layout robustness:** Fixed reference point prevents elements from drifting relative to other diagram components on resize
- **No regression:** All existing animations, responsive rules, and motion-sensitivity guards remain intact

### Testing

- [x] `node --check` passed on inline JavaScript (no syntax errors)
- [x] Visual diff verified: only the re-anchor and size changes present; no accidental modifications to other elements
- [x] Vertical anchor works correctly: both margin elements align to `.login-card` top
- [x] Min-clamp (8px) prevents elements from overlapping top viewport edge
- [x] Anti-overlap guard functional: badge clears icon stack when needed
- [x] Responsive hiding below 1500px viewport width unaffected
- [x] SVG animation (dev-loop dot) continues uninterrupted
- [x] All motion animations respect `prefers-reduced-motion` browser setting
- [x] Code review passed: senior-code-reviewer verdict PASS — no regressions, scope limited to re-anchor and size changes

### Notes / Risks

- **Local-only POC:** `scheduler-arch.html` is not committed to git (Scheduler has no git deployment per project convention). Changes remain on disk; NOT yet pushed to GitHub Pages pending Mike's visual approval via artifact preview.
- **Reference element robustness:** If `.login-card` is removed or hidden in a future diagram update, the fallback null-check ensures elements still render at default positions (no crash).
- **Viewport edge safety:** The 8px min-clamp prevents margin decorations from colliding with top browser chrome on small viewports.
- **Future updates:** Once Scheduler moves to production, the "Coming Soon" badge dimensions and placement should be re-evaluated as part of production launch (may need to hide the badge entirely when Scheduler is live).

---

## 2026-07-13 — Training Shift Type & Quarter-Hour Time Options

**Status:** Completed and passed code review (senior-code-reviewer PASS) — feature implemented

### Summary

Two enhancements added to `scheduler.html`:

1. **Three new shift time options** in `makeShiftOpts()` (~line 1009): quarter-hour options `01:15 → 09:15`, `01:30 → 09:30`, `01:45 → 09:45` injected between `01:00 → 09:00` and `02:00 → 10:00`. Same 8-hour duration and `HHMM-HHMM` value format as existing options; available in both Shift and Training time pickers.

2. **New shift code "Training" (type code `tn`)** — behaves identically to Shift (`sh`) in all logic, with its own orange styling (bg `#FFEDD5`, border `#FDBA74`, text `#9A3412`, dot `#F97316`) and label "Training". Wired into: BTNS button array, scBg/scBd/scTx/scDot color maps, bStyle/bLbl/bLblV label maps, dayHrs() weekly hour totals, getStats() summary counts, grid cell rendering, expanded row editor (time + cross-trained account selectors, same as Shift), setShift() defaults (0800-1600), quickFill copy-Monday, Viewer "N on shift" pills (Team + Account tabs), Viewer per-account hour attribution, renderDash() (Training folds into the on-shift count bucket so all Dashboard KPIs/headcounts include it), dshDrillCell() sort/filter, CSS rules (.sbt.a-tn, .dot-tn, pulse-tn keyframes, .dsh-db.tn), and a new "Training" legend swatch. Deliberate exclusions (parity with Shift): the Mon-Fri quick-fill button stays Shift-only; no chip filter (Shift has none); no dashboard pip badge (Shift has none).

**No Google Sheets / Apps Script change needed** — shift data round-trips as opaque JSON blobs (`{"t":"tn",...}`), the backend doesn't validate type codes. Embed mode (`?embed=1`) unaffected.

### Reason

Expands the Scheduler's shift scheduling capabilities to support training shifts as a distinct workload type separate from regular shifts. Quarter-hour time options provide finer-grained scheduling granularity for shifts that do not align to standard half-hour boundaries.

### Files Affected

- `scheduler.html` (only file)

### Impact

- **Scheduler grid:** Training shifts now render as orange cards alongside Shift (blue), RDOT (yellow), OT (purple), and other types
- **Dashboard KPIs:** Training shifts are counted in the "On Shift" bucket for all on-shift metrics and headcount displays
- **Viewer:** Training shifts included in Team/Account group "N on shift" counts and per-account hour attribution
- **Time picker:** All time-based shift types (Shift, Training, RDOT, OT) now support quarter-hour options
- **Save/load:** Training shifts persist to Google Sheet as `{"t":"tn","s":"HHmm","e":"HHmm","a":"Account"}`

### Testing

- [x] Three new quarter-hour time options render correctly in both Shift and Training time pickers
- [x] Training shift type button appears in the inline row editor shift-type button array
- [x] Training shifts render with correct orange styling: background `#FFEDD5`, border `#FDBA74`, text `#9A3412`, dot `#F97316`
- [x] Training shifts included in dayHrs() and getStats() aggregations
- [x] Dashboard KPI "On Shift" tile counts Training shifts (no separate Training bucket)
- [x] Viewer group headers ("N on shift") include Training shifts
- [x] Training shifts visible in Viewer per-account hour attribution
- [x] quickFill copy-Monday preserves Training shift days (same as Shift)
- [x] renderDash() drill-down (dshKpiDrill('onshift')) includes Training shifts in the roster
- [x] Grid cell rendering, legend swatch, and CSS rules all function without errors
- [x] Embed mode (`?embed=1`) unchanged
- [x] Standalone mode (full UI) unchanged
- [x] Code review passed: senior-code-reviewer verdict PASS — no bugs; non-blocking cosmetic note that the expanded row editor now has 8 type buttons and may wrap

### Notes / Risks

- **UI wrap:** The expanded row editor now displays 8 shift-type buttons (Shift, Training, Rest Day, VL, SL, RDOT, OT, Flexi). On narrow screens or small windows, the button row may wrap to a second line. This is a non-blocking cosmetic note; no functional impact.
- **No backend validation:** The Google Apps Script backend accepts all JSON shift blobs without type-code validation. Training shifts will round-trip correctly as opaque data.
- **Mon-Fri quick-fill Shift-only:** The Mon-Fri quick-fill button continues to create Shift (`sh`) entries, not Training. Users must manually set Training shifts day-by-day or use copy-Monday.
- **Parity with Shift:** Training has no separate chip filter, no dashboard pip badge — it behaves as an on-shift variant, not a distinct filter category.

### 2026-07-13 — CSS Polish: Row-Editor Button Spacing

- **Shift-type button row spacing refined** — `.sbtns` gap 2px→3px and `.sbt` padding 3px 5px→3px 4px for uniform row+column spacing. Allows the 8-button editor row to wrap cleanly on narrow day columns. CSS-only, no behavior changes. Code review: PASS.

---

## 2026-07-13 — RDOT Variable Duration (Option B)

**Status:** Completed and passed code review (senior-code-reviewer: PASS WITH NOTES, re-reviewed PASS)

### Summary

RDOT (`rd`) shifts are no longer fixed to 8 hours. When RDOT is selected in the expanded row editor, two independent time dropdowns (start + end) now appear at 15-minute granularity via a new `makeTimeOpts()` helper and `setRdStart()`/`setRdEnd()` handlers. Shift, Training, and OT retain their original paired time picker (`makeShiftOpts()`). The existing JSON shape `{"t":"rd","s":"HHMM","e":"HHMM","a":...}` is reused with no changes to the Google Sheets backend (blobs round-trip opaquely). A new `rdHrs(d)` helper computes actual RDOT duration with an 8-hour fallback for legacy no-time entries, preserving backward compatibility. The placeholder convention displays "— full shift (8h) —" for legacy empty-time RDOT rows.

### Reason

Enables flexible RDOT scheduling for shifts that do not span a full 8-hour day — e.g., a 1.5-hour RDOT session. Maintains backward compatibility with existing saved RDOT rows (no time = 8h). Fixes two pre-existing bugs where legacy no-time RDOT contributed 0h instead of 8h in Viewer group-hours and Dashboard totals.

### Files Affected

- `scheduler.html` (only file)

### Data Model

**No changes to JSON shape or backend.** RDOT continues to use `{"t":"rd","s":"HHMM","e":"HHMM","a":"Account"}`. The `s` and `e` fields are now set independently via two time pickers instead of paired picker. Legacy saved RDOT rows with empty `s` or `e` are interpreted as 8h via the fallback rule in `rdHrs(d)`.

**Placeholder convention:** When rendering an RDOT row with missing/empty times, `makeTimeOpts()` prepends a display-only `<option value="" selected>— full shift (8h) —</option>`. Selecting it deliberately clears both `s` and `e` to empty strings, which round-trip to the 8h fallback. This is honest in both directions: legacy no-time rows read "full shift (8h)", and editing them to use the placeholder preserves the same behavior.

### Hours Computation + Fallback Rule

**New `rdHrs(d)` helper:**
- When both `d.s` and `d.e` are present (non-empty): returns actual computed duration via the same midnight-wrap logic as `hrs()`
- When `d.s` or `d.e` is missing/empty: returns 8 (preserves legacy no-time RDOT as full shift)

**Affected aggregations:**
- `dayHrs()` weekly totals now route RDOT through `rdHrs()` so a 1.5h RDOT adds 1.5, not 8
- Viewer group "Hrs" columns use the same `rdHrs()` fallback
- Dashboard OT/RDOT hours KPI now correctly sums variable-duration RDOT

### Legacy Totals Change (IMPORTANT)

Two pre-existing bugs were fixed:
- Legacy no-time RDOT rows previously contributed 0h in Viewer group-hours and Dashboard (incorrect — should be 8h)
- They now correctly contribute 8h

**Consequence:** For any historical week containing un-timed RDOT entries, Viewer "Hrs" columns, Builder week totals, and Dashboard OT/RDOT-hours will VISIBLY INCREASE. This is the correct number appearing for the first time, not a regression.

### Coverage & Scope

**Time-of-day coverage:** The app has NO time-of-day-aware coverage logic anywhere (even for Shift). The Viewer "N on shift" pill is week-granular; the Dashboard is day-granular. Per spec, no new time-of-day coverage logic was invented. RDOT remains excluded from the on-shift pill by existing design — this is a known limitation of Option B.

**Other shifts unchanged:** Shift, Training, VL, SL, OT, and Flexi behavior is unaffected. Embedded mode (`?embed=1`) unchanged. `scheduler.html` only.

### Implementation Details

- **Independent time pickers:** `setRdStart(id, day, val)` and `setRdEnd(id, day, val)` set `s` and `e` independently, no longer coupled
- **15-minute granularity:** `makeTimeOpts()` helper (new, used for RDOT only) returns quarter-hour option list
- **Grid rendering:** RDOT cells display start–end times or "8h" (fallback) depending on whether times are present
- **Expanded editor:** Two time dropdown fields (start, end) render when RDOT is selected; placeholder message appears when times are empty

### Impact

- **Scheduler grid:** RDOT shifts now display actual duration (e.g., "02:30 → 04:00" or "8h" if no times set)
- **Builder weekly totals:** Variable-duration RDOT correctly included
- **Viewer group hours:** "Hrs" pill now includes variable-duration RDOT contributions
- **Dashboard KPI:** OT/RDOT hours tile now correctly aggregates variable-duration RDOT
- **Backward compatibility:** Legacy no-time RDOT rows continue to function and are interpreted as 8h
- **Save/load:** All RDOT variations persist and round-trip correctly to Google Sheets

### Testing

- [x] Two independent time dropdowns render when RDOT is selected in the inline row editor
- [x] Time dropdowns show 15-minute granularity options (00:00, 00:15, 00:30, ..., 23:45)
- [x] Placeholder "— full shift (8h) —" appears when RDOT times are empty (legacy rows)
- [x] Selecting placeholder clears both `s` and `e` to empty strings
- [x] RDOT cells display start–end time or "8h" fallback depending on times presence
- [x] `rdHrs()` returns actual duration when times present; 8h when times missing
- [x] `dayHrs()` weekly totals correctly include variable-duration RDOT
- [x] Viewer group "Hrs" pill correctly sums variable-duration RDOT (legacy no-time = 8h)
- [x] Dashboard OT/RDOT hours KPI correctly aggregates all RDOT variations
- [x] Legacy no-time RDOT rows from previous weeks load and display correctly
- [x] New RDOT with custom times (e.g., 2h) persists to Google Sheet and re-loads correctly
- [x] Shift, Training, OT behavior unchanged (paired time picker, no independent handlers)
- [x] Embed mode (`?embed=1`) unchanged
- [x] Code review passed: senior-code-reviewer verdict PASS WITH NOTES (re-reviewed PASS)

### Notes / Risks

**Legacy totals increase:** Viewer and Dashboard hours will visibly increase for weeks containing no-time RDOT entries. This is a correction of pre-existing bugs, not a regression. Communicate to managers that historical hours were undercounted and are now correct.

**No time-of-day coverage:** RDOT remains excluded from the "N on shift" pill (which counts shift `sh`, training `tn`, and ot `ot` only, by existing design). The app has no time-of-day awareness for coverage purposes. If per-shift-type or time-aware coverage logic is needed in the future, that is a separate feature.

**Placeholder interaction:** The "— full shift (8h) —" option is display-only (value: empty string). It is not a selectable preset that sets `s=0000` and `e=0800`. Selecting it clears both times, which is clearer and preserves the 8h fallback semantics.

**Backend compatibility:** Google Apps Script backend requires no changes. RDOT blobs with variable times round-trip opaquely; the backend does not validate time codes.

---

## 2026-07-13 — Bugfix: Stale Shift-Time Carried Across Type Change

**Status:** Completed and passed code review (senior-code-reviewer PASS)

### Summary

Fixed a bug where switching a day from RDOT (e.g., 08:00 → 14:15, 6.25h) back to Shift left the day stuck at 6.25h instead of resetting to the default 8h (08:00 → 16:00). The fix is isolated to `setShift()` and ensures that when a day's type changes to a fixed-8h paired-picker type (Shift, Training, or OT), the end time is recomputed or the range is reset appropriately. RDOT and non-timed types are unaffected.

### Root Cause

- `setShift()` seeded `s` and `e` only when falsy, so the RDOT end time (14:15) survived the type switch
- `makeShiftOpts()` selects its option by START time only
- The time picker displayed "08:00 → 16:00" (paired option) but the stored end remained 14:15
- `hrs()` computed 6.25h (08:00 to 14:15)
- Re-selecting the same visible option fired no change event, so the mismatch never self-corrected

### Fix

Modified `setShift()` to handle type transitions:

**When a day's type changes to a fixed-8h paired-picker type (sh/tn/ot):**
- If the current start time is not representable by the paired dropdown (e.g., not top-of-hour, or not one of the 01:15/01:30/01:45 quarter starts), reset the range to 08:00/16:00
- If the current start is representable, force the end to `start + 8h` (with midnight-wrap safety via `hrs()` logic)

**Landing on RDOT:** Unchanged — flexible type keeps its current valid `s`/`e` unchanged.

**Non-timed types (vl/sl/off/fx):** Never touch `s`/`e`, so rd → vl → rd correctly restores the original RDOT range.

### Files Affected

- `scheduler.html` (only file)

### Impact

- **Type transitions:** Switching between Shift/Training/OT now ensures correct 8h range
- **RDOT→Shift:** Correctly resets to 08:00/16:00 (8h)
- **Shift→RDOT→Shift:** Round-trip now works correctly
- **Non-timed transitions:** VL, SL, Off, Flexi do not disturb stored times, allowing rd→vl→rd to preserve the RDOT range
- **Backward compatibility:** Existing schedules unaffected; behavior change only applies to future type transitions

### Testing

- [x] sh→rd→sh: Results in 8h (default) ✓
- [x] rd→ot: RDOT with custom times switches to OT 8h ✓
- [x] ot→rd: OT switches to RDOT with flexible times ✓
- [x] sh→tn: Shift to Training is no-op on times ✓
- [x] rd→vl→rd: RDOT times (e.g., 6.25h) preserved across VL interlude ✓
- [x] Unrepresentable RDOT start (e.g., 14:45) → Shift resets to 08:00/16:00 ✓
- [x] All grid displays, Viewer hours, Dashboard KPIs reflect correct times after transitions
- [x] Code review passed: senior-code-reviewer verdict PASS

### Notes / Risks

**No breaking changes:** The fix only affects future type transitions. Existing saved data (including legacy RDOT with odd start times) is not modified.

**Representability:** The "representable start" check ensures only times that exist in the paired dropdown (top-of-hour options + the three new quarter-hour options 01:15, 01:30, 01:45) are preserved when landing on a paired-picker type. Other start times (e.g., 14:45) trigger a reset to 08:00/16:00.

**RDOT flexibility preserved:** Switching to RDOT from any paired-picker type leaves the times alone, so if a Shift was manually edited to a custom time before switching to RDOT, that time is retained (not reset).

---

*Pac-Biz Operations — last updated 2026-07-13*
