/**
 * Mall Shop Directory Downloader
 *
 * This is a container-bound Apps Script: bind it to a Google Sheet that has
 * a "MallConfig" tab listing every mall website we know how to scrape. Adding
 * mall #N is a new config row, not new code — see README.md in this folder.
 *
 * MallConfig columns (row 1 = header):
 *   MallId | MallName | Provider | SiteKey | Culture | SearchUrl | ApiPath | BaseUrl | Enabled
 *   | QueryParams | PageParam | ItemsPath | TotalPagesPath | FieldMap
 *
 * "Provider" picks how the row below is interpreted:
 *
 *   - "landsec": preset for the Landsec API family (Bluewater, and any other
 *     Landsec mall/directory) — just fill SiteKey/SearchUrl/ApiPath/BaseUrl.
 *
 *   - "generic": works for ANY paginated JSON API, purely from config, with
 *     no code change — see the "generic" columns below. Use this for a new
 *     site whose API isn't Landsec's, as long as it's a JSON GET endpoint
 *     that takes a page number and reports how many pages exist.
 *
 * Only a site that *isn't* a plain paginated JSON API (needs a login, is
 * server-rendered HTML with no API, uses GraphQL, etc.) requires touching
 * Code.gs at all — add a new fetchShops_<provider>_() function for that case.
 *
 * Generic-provider columns (leave blank to use the default shown):
 *   QueryParams     JSON object of static query params, e.g.
 *                    {"siteKey":"...","culture":"en-us","order":"asc"}
 *   PageParam        query param name for the page number. Default: "page"
 *   ItemsPath        dot-path to the array of items in the response.
 *                    Default: "data"
 *   TotalPagesPath   dot-path to the total-page-count field. Default:
 *                    "totalPages"
 *   FieldMap         JSON object mapping our output columns to the source
 *                    item's field names, e.g.
 *                    {"name":"pageTitle","description":"pageDescription",
 *                     "url":"pageUrl","source_id":"nodeId","logo":"pageLogoUrl",
 *                     "image":"pageImageUrl","floor":"floors","category":"categories"}
 *
 * "ApiPath" (both providers) is the segment appended after SearchUrl, e.g.
 * "shops" vs. "eateries" for Bluewater's two directories on the same site.
 * One mall with several directories gets one row per directory, same
 * SiteKey/BaseUrl, different MallName/ApiPath.
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
  } else if (provider === 'generic') {
    shops = fetchShops_generic_(config);
  } else {
    throw new Error('No scraper implemented for provider "' + config.Provider + '". ' +
      'Use "generic" for any paginated JSON API (no code change needed), or ' +
      'add a fetchShops_' + provider + '_() function and wire it into runScrapeForMall().');
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
  const apiPath = String(config.ApiPath || 'shops').replace(/^\/+/, '');
  const baseSearchUrl = String(config.SearchUrl).replace(/\/+$/, '');

  do {
    const url = baseSearchUrl + '/' + apiPath + '?' + [
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

/**
 * Config-driven provider for any paginated JSON API. No code change needed
 * for a new site as long as it's a GET endpoint that returns a JSON array of
 * items plus a total-page count. See the header comment for column meanings.
 */
function fetchShops_generic_(config) {
  const apiPath = String(config.ApiPath || '').replace(/^\/+/, '');
  const baseSearchUrl = String(config.SearchUrl).replace(/\/+$/, '');
  const endpoint = apiPath ? baseSearchUrl + '/' + apiPath : baseSearchUrl;

  const pageParam = config.PageParam || 'page';
  const itemsPath = config.ItemsPath || 'data';
  const totalPagesPath = config.TotalPagesPath || 'totalPages';
  const staticParams = config.QueryParams ? JSON.parse(config.QueryParams) : {};
  const fieldMap = config.FieldMap ? JSON.parse(config.FieldMap) : {
    name: 'pageTitle', description: 'pageDescription', url: 'pageUrl',
    source_id: 'nodeId', logo: 'pageLogoUrl', image: 'pageImageUrl',
    floor: 'floors', category: 'categories'
  };

  const shops = [];
  let page = 1;
  let totalPages = 1;

  do {
    const params = Object.assign({}, staticParams);
    params[pageParam] = page;
    const queryString = Object.keys(params)
      .map(function (key) { return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]); })
      .join('&');

    const response = UrlFetchApp.fetch(endpoint + '?' + queryString, { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) {
      throw new Error('Request failed (' + response.getResponseCode() + ') for ' + config.MallName);
    }

    const data = JSON.parse(response.getContentText());
    totalPages = Number(getPath_(data, totalPagesPath)) || 1;
    const items = getPath_(data, itemsPath) || [];
    items.forEach(function (item) {
      shops.push(normalizeGeneric_(item, fieldMap, config.BaseUrl));
    });

    page += 1;
    Utilities.sleep(300); // be polite to the API
  } while (page <= totalPages);

  return shops;
}

function normalizeGeneric_(item, fieldMap, baseUrl) {
  const row = {};
  COLUMNS.forEach(function (column) {
    const sourceField = fieldMap[column];
    let value = sourceField ? getPath_(item, sourceField) : '';
    if (Array.isArray(value)) value = value.join(', ');
    row[column] = value == null ? '' : value;
  });
  if (row.url && baseUrl && String(row.url).indexOf('http') !== 0) {
    row.url = baseUrl.replace(/\/$/, '') + row.url;
  }
  return row;
}

function getPath_(obj, path) {
  return String(path).split('.').reduce(function (acc, key) {
    return acc == null ? undefined : acc[key];
  }, obj);
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
