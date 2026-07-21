/** Reading MallConfig and writing scraped results into their own sheet tab. */

const CONFIG_SHEET_NAME = 'MallConfig';

const COLUMNS = ['name', 'description', 'url', 'source_id', 'logo', 'image', 'floor', 'category'];

function readConfigRows_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet) {
    throw new Error('Missing "' + CONFIG_SHEET_NAME + '" tab. See README.md in the appscript folder.');
  }
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  return values.slice(1)
    .filter(function (row) { return row.some(function (cell) { return cell !== ''; }); })
    .map(function (row) {
      const obj = {};
      headers.forEach(function (header, i) { obj[header] = row[i]; });
      return obj;
    });
}

function sheetTabNameFor_(mallName) {
  const safe = String(mallName).replace(/[\[\]\*\/\\\?:]/g, '').substring(0, 90);
  return 'Shops - ' + safe;
}

function writeShopsToSheet_(tabName, rows) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(tabName);
  if (sheet) {
    sheet.clear();
  } else {
    sheet = spreadsheet.insertSheet(tabName);
  }

  const header = COLUMNS.map(function (c) { return c; });
  const body = rows.map(function (row) { return COLUMNS.map(function (c) { return row[c] || ''; }); });

  sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  if (body.length > 0) {
    sheet.getRange(2, 1, body.length, header.length).setValues(body);
  }
  sheet.autoResizeColumns(1, header.length);
  return sheet;
}
