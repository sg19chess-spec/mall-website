/**
 * Mall Shop Directory Downloader
 *
 * This is a container-bound Apps Script: bind it to a Google Sheet that has
 * a "MallConfig" tab listing every mall website we know how to scrape. Adding
 * mall #N is a new config row, not new code — see README.md in this folder.
 *
 * MallConfig columns (row 1 = header):
 *   MallId | MallName | Provider | SiteKey | Culture | SearchUrl | BaseUrl | Enabled
 *
 * "Provider" selects which fetch function below understands that site's API
 * shape. Today only "landsec" (the API documented in docs/bluewater-anatomy.md,
 * shared by Landsec-operated malls like Bluewater) is implemented.
 */

const CONFIG_SHEET_NAME = 'MallConfig';

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Mall Shop Directory Downloader')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Returns the list of enabled malls for the UI's search/select box. */
function getMalls() {
  const rows = readConfigRows_();
  return rows
    .filter(function (row) { return row.Enabled === true || String(row.Enabled).toUpperCase() === 'TRUE'; })
    .map(function (row) { return { id: row.MallId, name: row.MallName }; });
}

/** Runs the scrape for one mall and writes results into its own sheet tab. */
function runScrapeForMall(mallId) {
  const rows = readConfigRows_();
  const config = rows.filter(function (row) { return String(row.MallId) === String(mallId); })[0];
  if (!config) {
    throw new Error('Unknown mall id: ' + mallId);
  }

  const provider = String(config.Provider || '').toLowerCase();
  let shops;
  if (provider === 'landsec') {
    shops = fetchShops_landsec_(config);
  } else {
    throw new Error('No scraper implemented for provider "' + config.Provider + '". ' +
      'Add a fetchShops_' + provider + '_() function and wire it into runScrapeForMall().');
  }

  const tabName = sheetTabNameFor_(config.MallName);
  const sheet = writeShopsToSheet_(tabName, shops);
  const xlsx = exportSheetAsXlsx_(sheet, config.MallName);

  return {
    mallName: config.MallName,
    count: shops.length,
    tabName: tabName,
    sheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl() + '#gid=' + sheet.getSheetId(),
    xlsxBase64: xlsx.base64,
    fileName: xlsx.fileName
  };
}

/**
 * Exports a single sheet tab as a standalone .xlsx file, returned as base64
 * so the browser can download it directly — no local software needed on the
 * user's machine, not even a spreadsheet app.
 */
function exportSheetAsXlsx_(sheet, mallName) {
  const tempSpreadsheet = SpreadsheetApp.create('tmp-export-' + sheet.getSheetId());
  const tempFileId = tempSpreadsheet.getId();
  try {
    sheet.copyTo(tempSpreadsheet).setName(sheet.getName());
    tempSpreadsheet.deleteSheet(tempSpreadsheet.getSheets()[0]); // remove the blank default sheet

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

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

/**
 * Landsec-style shop search API (used by Bluewater and other Landsec malls).
 * See docs/bluewater-anatomy.md for how this endpoint was discovered.
 */
function fetchShops_landsec_(config) {
  const shops = [];
  let page = 1;
  let totalPages = 1;

  do {
    const url = config.SearchUrl + '?' + [
      'siteKey=' + encodeURIComponent(config.SiteKey),
      'culture=' + encodeURIComponent(config.Culture || 'en-us'),
      'page=' + page,
      'order=asc',
      'search=',
      'tags=',
      'filters='
    ].join('&');

    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) {
      throw new Error('Request failed (' + response.getResponseCode() + ') for ' + config.MallName);
    }

    const data = JSON.parse(response.getContentText());
    totalPages = data.totalPages || 1;
    (data.data || []).forEach(function (shop) {
      shops.push(normalizeLandsecShop_(shop, config.BaseUrl));
    });

    page += 1;
    Utilities.sleep(300); // be polite to the API
  } while (page <= totalPages);

  return shops;
}

function normalizeLandsecShop_(shop, baseUrl) {
  const pageUrl = shop.pageUrl || '';
  const fullUrl = pageUrl && baseUrl && pageUrl.indexOf('http') !== 0
    ? (baseUrl.replace(/\/$/, '') + pageUrl)
    : pageUrl;

  return {
    name: shop.pageTitle || '',
    description: shop.pageDescription || '',
    url: fullUrl,
    source_id: shop.nodeId || '',
    logo: shop.pageLogoUrl || '',
    image: shop.pageImageUrl || '',
    floor: Array.isArray(shop.floors) ? shop.floors.join(', ') : (shop.floors || ''),
    category: Array.isArray(shop.categories) ? shop.categories.join(', ') : (shop.categories || '')
  };
}

// ---------------------------------------------------------------------------
// Sheet helpers
// ---------------------------------------------------------------------------

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

const COLUMNS = ['name', 'description', 'url', 'source_id', 'logo', 'image', 'floor', 'category'];

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
