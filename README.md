# PB-Scheduler

Pac-Biz workforce scheduling dashboard.

## Setup

This repo does **not** include `scheduler-config.js` — it is gitignored because it contains local-only credentials.
The deployed GitHub Pages app uses `scheduler-public-config.js`, which contains only browser-required endpoints and no passwords.

For local-only testing, create `scheduler-config.js` in the same folder with this structure:

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

For the deployed app, login is handled by Apps Script. Add `apps_script_auth_wrapper.gs`
to the existing Scheduler Apps Script project, rename the old `doGet(e)` to
`schedulerDataGet_(e)`, set `USERS_JSON` and `AUTH_SECRET` as Script Properties,
then deploy a new web app version.

## Files

| File | Purpose |
|------|---------|
| `scheduler.html` | Main scheduling dashboard |
| `scheduler-public-config.js` | Public runtime endpoints for GitHub Pages |
| `apps_script_auth_wrapper.gs` | Apps Script auth wrapper; passwords live in Script Properties |
| `pac_biz_builder_36.html` | Shift builder |
| `pac_biz_viewer.html` | Read-only viewer |
| `pac_biz_planning.html` | Planning view |
| `scheduler-config.js` | **Not committed** — provision manually (see Setup above) |

## Notes

- `scheduler-config.js` and `*.local.js` are gitignored — never commit them.
- Do not put passwords in GitHub Pages files. Passwords belong in Apps Script Script Properties.
