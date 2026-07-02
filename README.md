# PB-Scheduler

Pac-Biz workforce scheduling dashboard.

## Setup

This repo does **not** include `scheduler-config.js` — it is gitignored because it contains credentials.

Before opening `scheduler.html`, create `scheduler-config.js` in the same folder with this structure:

```js
// Pac-Biz Scheduler — local config (not committed to git)
var MASTERLIST_CSV_URL = '<your published Google Sheets CSV URL>';
var SCHEDULER_API_URL  = '<your Apps Script web app URL>';
var USERS = {
  'admin':    '<password>',
  'mike':     '<password>',
  'gonrejas': '<password>'
};
```

All username keys must be **lowercase**. The login form lowercases the input before lookup.

## Files

| File | Purpose |
|------|---------|
| `scheduler.html` | Main scheduling dashboard |
| `pac_biz_builder_36.html` | Shift builder |
| `pac_biz_viewer.html` | Read-only viewer |
| `pac_biz_planning.html` | Planning view |
| `scheduler-config.js` | **Not committed** — provision manually (see Setup above) |

## Notes

- `scheduler-config.js` and `*.local.js` are gitignored — never commit them.
- Login is client-side only (cosmetic auth). Do not expose this dashboard publicly without additional server-side protection.
