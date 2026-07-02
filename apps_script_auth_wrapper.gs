/**
 * Pac-Biz Scheduler auth wrapper for Google Apps Script.
 *
 * Deploy notes:
 * 1. In the existing Scheduler Apps Script project, rename the current doGet(e)
 *    function to schedulerDataGet_(e). Do not change its body.
 * 2. Paste this file into the same Apps Script project.
 * 3. Set Script Properties:
 *    USERS_JSON  = {"admin":"<password>","mike":"<password>","gonrejas":"<password>"}
 *    AUTH_SECRET = any long random string
 *    MASTERLIST_SPREADSHEET_ID = 18hKmm2SmlWqB23osiV3JTF0aWn86vvZ-YJSC-Rr3JcY
 *    MASTERLIST_GID = 0
 * 4. Deploy a new web app version using the same access mode.
 */

function doGet(e) {
  var action = String((e && e.parameter && e.parameter.action) || 'load').toLowerCase();

  if (action === 'login') {
    return schedulerLogin_(e);
  }

  var auth = schedulerVerifyToken_(e && e.parameter && e.parameter.token);
  if (!auth.ok) {
    return schedulerJson_({
      status: 'error',
      message: 'Unauthorized'
    });
  }

  if (action === 'masterlist') {
    return schedulerMasterlist_(e);
  }

  return schedulerDataGet_(e);
}

function schedulerLogin_(e) {
  var username = String((e && e.parameter && e.parameter.username) || '').trim().toLowerCase();
  var password = String((e && e.parameter && e.parameter.password) || '');
  var users = schedulerUsers_();

  if (!username || !users[username] || users[username] !== password) {
    return schedulerJson_({
      status: 'error',
      message: 'Incorrect username or password.'
    });
  }

  return schedulerJson_({
    status: 'ok',
    user: username,
    token: schedulerCreateToken_(username)
  });
}

function schedulerUsers_() {
  var raw = PropertiesService.getScriptProperties().getProperty('USERS_JSON') || '{}';
  return JSON.parse(raw);
}

function schedulerSecret_() {
  var secret = PropertiesService.getScriptProperties().getProperty('AUTH_SECRET');
  if (!secret) {
    throw new Error('Missing AUTH_SECRET Script Property');
  }
  return secret;
}

function schedulerCreateToken_(username) {
  var payload = {
    u: username,
    exp: Date.now() + (12 * 60 * 60 * 1000)
  };
  var body = schedulerB64_(JSON.stringify(payload));
  var sig = schedulerSign_(body);
  return body + '.' + sig;
}

function schedulerVerifyToken_(token) {
  try {
    token = String(token || '');
    var parts = token.split('.');
    if (parts.length !== 2) {
      return { ok: false };
    }
    if (schedulerSign_(parts[0]) !== parts[1]) {
      return { ok: false };
    }
    var payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
    if (!payload.u || !payload.exp || Date.now() > payload.exp) {
      return { ok: false };
    }
    return { ok: true, user: payload.u };
  } catch (err) {
    return { ok: false };
  }
}

function schedulerSign_(body) {
  var bytes = Utilities.computeHmacSha256Signature(body, schedulerSecret_());
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function schedulerB64_(text) {
  return Utilities.base64EncodeWebSafe(text).replace(/=+$/g, '');
}

function schedulerJson_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function schedulerMasterlist_(e) {
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = props.getProperty('MASTERLIST_SPREADSHEET_ID') || '18hKmm2SmlWqB23osiV3JTF0aWn86vvZ-YJSC-Rr3JcY';
  var gid = Number(props.getProperty('MASTERLIST_GID') || '0');
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheets = ss.getSheets();
  var sheet = null;

  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === gid) {
      sheet = sheets[i];
      break;
    }
  }

  if (!sheet) {
    throw new Error('Masterlist sheet gid not found: ' + gid);
  }

  var values = sheet.getDataRange().getDisplayValues();
  var csv = values.map(function(row) {
    return row.map(schedulerCsvCell_).join(',');
  }).join('\r\n');

  return schedulerJson_({
    status: 'ok',
    csv: csv
  });
}

function schedulerCsvCell_(value) {
  value = String(value == null ? '' : value);
  if (/[",\r\n]/.test(value)) {
    value = '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}
