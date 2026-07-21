/**
 * Mall Shop Directory Downloader — entry points
 *
 * This is a container-bound Apps Script: bind it to a Google Sheet that has
 * a "MallConfig" tab listing every mall website we know how to scrape.
 *
 * Project files:
 *   Main.gs         - web app entry point, getMalls(), loadMallData(), export
 *   Providers.gs    - per-API-shape fetch logic (landsec, generic, ...)
 *   SheetStore.gs   - MallConfig reading + writing scraped data to tabs
 *   ExcelExport.gs  - turning rows into a downloadable .xlsx
 *   Index.html      - the UI (search/select mall, preview table, column
 *                     picker, download)
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
 *   - "generic": works for ANY JSON GET API, purely from config, with no
 *     code change — see Providers.gs. Covers both paginated APIs (a page
 *     number + a total-page count, like Bluewater/Landsec) and unpaginated
 *     ones that return everything in one response (like Bellevue
 *     Collection's shopping-directory endpoints) — leave the pagination
 *     columns blank for the latter.
 *
 * Only a site that *isn't* a plain JSON GET API (needs a login, is
 * server-rendered HTML with no API, uses GraphQL, etc.) requires touching
 * Providers.gs at all — add a new fetchShops_<provider>_() function there.
 *
 * "ApiPath" (both providers) is the segment appended after SearchUrl, e.g.
 * "shops" vs. "eateries" for Bluewater's two directories on the same site.
 * One mall with several directories gets one row per directory, same
 * SiteKey/BaseUrl, different MallName/ApiPath.
 */

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

/**
 * Scrapes one mall's directory, writes the full result into its own sheet
 * tab (kept as a durable copy / history), and returns the data plus column
 * list so the UI can render a preview table with a column picker. Nothing
 * is exported to Excel yet — see exportRowsAsXlsx().
 */
function loadMallData(mallId) {
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
      'add a fetchShops_' + provider + '_() function in Providers.gs.');
  }

  const tabName = sheetTabNameFor_(config.MallName);
  const sheet = writeShopsToSheet_(tabName, shops);

  return {
    mallName: config.MallName,
    count: shops.length,
    tabName: tabName,
    sheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl() + '#gid=' + sheet.getSheetId(),
    columns: COLUMNS,
    rows: shops
  };
}

/**
 * Builds a standalone .xlsx from whatever rows/columns the browser sends
 * back — this is the data loadMallData() already returned, filtered down to
 * the columns the user checked in the UI. No re-scraping happens here.
 */
function exportRowsAsXlsx(mallName, columns, rows) {
  return exportRowsAsXlsx_(mallName, columns, rows);
}
