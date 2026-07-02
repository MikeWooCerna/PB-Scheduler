# Pac Biz 2026 — Schedule Viewer & Dashboard

Two read-only tools for viewing the 2026 Pac Biz schedule data.

| File | Purpose |
|------|---------|
| `pac_biz_scheduler.html` | Browse staff schedules by person, account, or day |
| `pac_biz_dashboard.html` | Workforce coverage overview with account drill-down |

Both files are standalone HTML — open in any browser, no server needed.

---

## pac_biz_scheduler.html — Schedule Viewer

**Data:** 214 staff · 27 accounts · 23 weeks (Jan 5 – Jun 14, 2026)  
**Size:** ~1.3 MB

### Top bar controls

| Control | What it does |
|---------|-------------|
| Week selector | Choose any of the 23 schedule weeks |
| Account filter | Narrow to one account or show all |
| Search box | Filter by staff name or ID |
| View tabs | Switch between the four views below |

---

### Views

#### Staff View
One card per person. Each card shows:
- Avatar (initials), name, staff ID
- Primary account badge (color-coded)
- 7-day schedule strip — one cell per day showing shift type badge and times
- Secondary account color bar for cross-trained staff (small colored strip per day)
- Weekly hours total

Cards for cross-trained staff show a color legend at the top indicating which account each color represents.

**Grid layout:** 7 columns on wide screens, fewer on narrow.

---

#### Account View
Staff grouped under their primary account. Each account appears as a collapsible section with a table showing all assigned staff and their Mon–Sun schedule for the selected week.

Useful for checking coverage per account at a glance.

---

#### Summary View
All accounts shown as horizontal coverage bars. Each bar represents one account's active headcount across Mon–Sun — taller = more staff on shift that day.

Good for spotting thin coverage days or identifying accounts with weekend gaps.

---

#### ⚡ On Shift Now
Shows only staff currently on shift for a selected day. Day picker at the top (Mon–Sun). Staff are grouped by account with their shift time displayed.

Useful during operations to quickly see who is active on any given day of the selected week.

---

### Shift type badges

| Badge | Color | Meaning |
|-------|-------|---------|
| ON / time range | Blue | Active shift with start–end time |
| OFF | Grey | Rest day |
| VL | Yellow-green | Vacation leave |
| SL | Pink | Sick leave |
| RDOT | Pink-red | Rest day overtime |
| OT | Orange | Overtime |
| Flexi | Purple | Flexible schedule |
| Training | Teal | Training day |

---

### Cross-training display

Staff assigned to multiple accounts show:
- Their **primary account** as the main card color
- A **thin color bar** per day cell indicating which account they're working that day
- A **color legend** at the top of their card

---

## pac_biz_dashboard.html — Workforce Dashboard

**Data:** Same 214 staff · 27 accounts · 23 weeks  
**Size:** ~1.3 MB

### Layout

The dashboard shows all accounts as rows in a grid, with Mon–Sun as columns. It's designed for an at-a-glance operational view of headcount across the entire business for a selected week.

---

### Top bar

| Control | What it does |
|---------|-------------|
| Week selector | Choose any of the 23 weeks |
| Account search | Filter the account list by name |

The current week label shows on the right side of the top bar.

---

### Account rows

Each account appears as a row with:
- **Account name** and total staff count on the left
- **7 day cells** (Mon–Sun) each showing:
  - Active headcount (number of staff on shift)
  - Mini exception pills for VL / SL / RDOT occurrences that day
- Click any row to open the **drill-down modal**

Accounts are split into two sections:
- **Client accounts** (Canada, UK, US clients)
- **Internal** (internal operations staff)

---

### Drill-down modal

Click any account row to open a detailed modal for that account.

**5 KPI tiles at the top:**

| Tile | What it shows |
|------|--------------|
| Total staff | Number of staff assigned to this account |
| Cross-trained | How many are also assigned to other accounts |
| On VL | Staff with at least one vacation leave day this week |
| On SL | Staff with at least one sick leave day this week |
| RDOT days | Count of rest day overtime occurrences |

**Day summary bar:** A compact Mon–Sun breakdown showing active headcount per day for this account.

**Staff table:** Full list of staff in this account with their shift type and time per day, color-coded by status.

Close the modal by clicking outside it or pressing Escape.

---

## Accounts reference

### Canada
Associated Cab · Checkmate Cab · Hamilton Taxi · Kelowna · Keys Please · Yellow Cab Victoria

### UK
Alpha Taxis · Blueline Taxis · Datacarz · Skyline Taxis

### US
Buffalo Airport Shuttle · C&H Taxi · Circle Taxi · Delta Media Group · DeSoto Cab Co · M7 Taxi · Mediroutes · Motty's Car Services · Ollies · Parentis Health · R4H · Reno Sparks Cab · Ride X/Britelift · Trans Iowa · Vermont Ride Network · VIP Taxi · YCDC

### Internal
Internal

---

## Weeks covered

| # | Period |
|---|--------|
| 1 | January 5 – January 11 |
| 2 | January 12 – January 18 |
| 3 | January 19 – January 25 |
| 4 | January 26 – February 1 |
| 5 | February 2 – February 8 |
| 6 | February 9 – February 15 |
| 7 | February 16 – February 22 |
| 8 | February 23 – March 1 |
| 9 | March 2 – March 8 |
| 10 | March 9 – March 15 |
| 11 | March 16 – March 22 |
| 12 | March 23 – March 29 |
| 13 | March 30 – April 5 |
| 14 | April 6 – April 12 |
| 15 | April 13 – April 19 |
| 16 | April 20 – April 26 |
| 17 | April 27 – May 3 |
| 18 | May 4 – May 10 |
| 19 | May 11 – May 17 |
| 20 | May 18 – May 24 |
| 21 | May 25 – May 31 |
| 22 | June 1 – June 7 |
| 23 | June 8 – June 14 |

---

## Differences between the three tools

| Feature | Scheduler Viewer | Dashboard | Schedule Builder |
|---------|-----------------|-----------|-----------------|
| Edit schedules | ✗ | ✗ | ✓ |
| View by staff | ✓ | ✗ | ✓ |
| View by account | ✓ | ✓ | ✗ |
| Coverage summary | ✓ | ✓ | ✗ |
| Drill-down KPIs | ✗ | ✓ | ✗ |
| On shift now | ✓ | ✗ | ✗ |
| Export data | ✗ | ✗ | ✓ |
| Saves changes | ✗ | ✗ | ✓ (sessionStorage) |

---

*Built for Pac Biz Operations — June 2026*
