# Mall Shop Directory Downloader (Apps Script)

A small web UI, backed by Google Apps Script, for searching and picking a mall
and downloading its shop directory into this Google Sheet. Adding mall #2,
#3, ... #N is a config row, not new code, as long as its website uses an API
shape we've already implemented (see "Providers" below).

## Setup

1. Create a new Google Sheet.
2. Extensions → Apps Script. Delete the default `Code.gs` content.
3. Copy the contents of this folder into the Apps Script project:
   - `Code.gs`
   - `Index.html`
   - `appsscript.json` (Project Settings → check "Show appsscript.json" first)

   Or use [`clasp`](https://github.com/google/clasp) from this folder:
   ```
   clasp login
   clasp create --type sheet --title "Mall Shop Directory Downloader"
   clasp push
   ```
4. Back in the Sheet, add a tab named exactly `MallConfig` with this header
   row and one row per mall directory:

   | MallId | MallName | Provider | SiteKey | Culture | SearchUrl | ApiPath | BaseUrl | Enabled |
   |---|---|---|---|---|---|---|---|---|
   | 1 | Bluewater | landsec | 446cfce2-1e0b-466a-8c80-862385517399 | en-us | https://content.landsec.com/search | shops | https://www.bluewater.co.uk | TRUE |
   | 2 | Bluewater - Eat & Drink | landsec | 446cfce2-1e0b-466a-8c80-862385517399 | en-us | https://content.landsec.com/search | eateries | https://www.bluewater.co.uk | TRUE |

   `SearchUrl` is the base URL (no endpoint suffix); `ApiPath` picks the
   directory on that same site — `shops` for retail, `eateries` for
   restaurants/cafes/bars. Same site, same `SiteKey`, one row per directory.

5. Deploy → New deployment → type "Web app". Execute as "User accessing the
   web app", access "Anyone with the link" (or restrict to your org). Open
   the deployment URL — that's the search/select/run UI.

## Adding another mall or directory

- **Same API family (e.g. another Landsec mall, or another directory on a
  mall already configured — shops vs. eateries vs. whatever else the site
  exposes under `/search/<path>`):** just add a new row to `MallConfig` with
  the right `SiteKey`, `ApiPath`, and `BaseUrl`, `Provider` still `landsec`.
  No code change needed. (Confirmed so far: `shops`, `eateries`.)
- **Different API shape entirely:** add a new `fetchShops_<provider>_()` function in
  `Code.gs` that returns the same normalized row shape (`name`, `description`,
  `url`, `source_id`, `logo`, `image`, `floor`, `category`), wire it into the
  `if/else` in `runScrapeForMall()`, then add config rows using that
  `Provider` name.

## What it does

- `getMalls()` returns the `Enabled` rows from `MallConfig` for the UI's
  search box.
- `runScrapeForMall(mallId)` looks up that mall's config, paginates through
  its shop search API (never hardcoding page count — it reads `totalPages`
  from the response each time, same as `scripts/download_shops.py`), writes
  the normalized rows into a sheet tab named `Shops - <Mall Name>`, then
  exports that tab as a standalone `.xlsx` file and returns it to the browser
  as base64. The page decodes it and triggers a normal file download.

No local software is required on the user's end — everything (scraping,
pagination, and the Excel export) runs inside Apps Script. A browser is
enough; nothing needs to be installed, not Python, not Excel, nothing.

## Permissions note

Exporting to `.xlsx` needs Drive access (a temporary spreadsheet is created,
exported, then deleted) in addition to Sheets access, so `appsscript.json`
now requests the `spreadsheets`, `drive`, and `script.external_request`
scopes. The first time each user runs it, Google will show a one-time
consent screen for those scopes.
