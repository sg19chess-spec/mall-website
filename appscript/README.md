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
   row, plus the generic-provider columns described below, and one row per
   mall directory:

   | MallId | MallName | Provider | SiteKey | Culture | SearchUrl | ApiPath | BaseUrl | Enabled | QueryParams | PageParam | ItemsPath | TotalPagesPath | FieldMap |
   |---|---|---|---|---|---|---|---|---|---|---|---|---|---|
   | 1 | Bluewater | landsec | 446cfce2-1e0b-466a-8c80-862385517399 | en-us | https://content.landsec.com/search | shops | https://www.bluewater.co.uk | TRUE | | | | | |
   | 2 | Bluewater - Eat & Drink | landsec | 446cfce2-1e0b-466a-8c80-862385517399 | en-us | https://content.landsec.com/search | eateries | https://www.bluewater.co.uk | TRUE | | | | | |

   `SearchUrl` is the base URL (no endpoint suffix); `ApiPath` picks the
   directory on that same site — `shops` for retail, `eateries` for
   restaurants/cafes/bars. Same site, same `SiteKey`, one row per directory.

5. Deploy → New deployment → type "Web app". Execute as "User accessing the
   web app", access "Anyone with the link" (or restrict to your org). Open
   the deployment URL — that's the search/select/run UI.

## Adding another mall or directory — without touching Code.gs

Two ways to add a site now, neither requires opening the Apps Script editor:

1. **Another Landsec mall, or another directory on a Landsec site**
   (`Provider = landsec`): just add a row with the right `SiteKey`,
   `ApiPath`, `BaseUrl`. (Confirmed so far: `shops`, `eateries`.)

2. **Any other site, as long as it's a paginated JSON API**
   (`Provider = generic`): most modern mall/CMS directory pages work this
   way — a JS page that fetches JSON from its own API, same as Bluewater
   does. Fill in:
   - `SearchUrl` / `ApiPath` — the endpoint URL
   - `QueryParams` — JSON of whatever static query params that API needs,
     e.g. `{"siteKey":"...","culture":"en-us","order":"asc"}`
   - `PageParam` — the query param name for page number (default `page`)
   - `ItemsPath` — dot-path to the array of results in the JSON response
     (default `data`)
   - `TotalPagesPath` — dot-path to the total-page-count field (default
     `totalPages`)
   - `FieldMap` — JSON mapping our columns to that API's field names, e.g.
     `{"name":"pageTitle","description":"pageDescription","url":"pageUrl",
     "source_id":"nodeId","logo":"pageLogoUrl","image":"pageImageUrl",
     "floor":"floors","category":"categories"}`

   To prove this covers Bluewater too: a `generic` row with
   `QueryParams = {"siteKey":"446cfce2-1e0b-466a-8c80-862385517399","culture":"en-us","order":"asc","search":"","tags":"","filters":""}`
   and the `FieldMap` above produces identical results to the `landsec`
   preset — `landsec` just saves you from typing that out per row.

Only a site that **isn't** a plain paginated JSON GET API — needs a login,
is pure server-rendered HTML with no API, paginates by cursor/token instead
of page number, etc. — requires adding a `fetchShops_<provider>_()` function
in `Code.gs`, returning the same normalized row shape (`name`, `description`,
`url`, `source_id`, `logo`, `image`, `floor`, `category`), wired into the
`if/else` in `runScrapeForMall()`.

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
