/** Turning row/column data into a downloadable .xlsx, no local software needed. */

/**
 * Builds a standalone .xlsx from the given rows, restricted to `columns` (in
 * that order — this is how the user's column-picker selection takes effect),
 * and returns it as base64 so the browser can trigger a real file download.
 */
function exportRowsAsXlsx_(mallName, columns, rows) {
  if (!columns || columns.length === 0) {
    throw new Error('Select at least one column to export.');
  }

  const tempSpreadsheet = SpreadsheetApp.create('tmp-export-' + new Date().getTime());
  const tempFileId = tempSpreadsheet.getId();
  try {
    const sheet = tempSpreadsheet.getSheets()[0];
    sheet.setName('Shops');

    sheet.getRange(1, 1, 1, columns.length).setValues([columns]).setFontWeight('bold');
    if (rows.length > 0) {
      const body = rows.map(function (row) {
        return columns.map(function (c) { return row[c] || ''; });
      });
      sheet.getRange(2, 1, body.length, columns.length).setValues(body);
    }
    sheet.autoResizeColumns(1, columns.length);

    const url = 'https://docs.google.com/spreadsheets/d/' + tempFileId + '/export?format=xlsx';
    const response = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
    });
    const blob = response.getBlob();

    return {
      base64: Utilities.base64Encode(blob.getBytes()),
      fileName: sanitizeFileName_(mallName) + '.xlsx'
    };
  } finally {
    DriveApp.getFileById(tempFileId).setTrashed(true);
  }
}

function sanitizeFileName_(name) {
  return String(name).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}
