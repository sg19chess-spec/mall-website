/**
 * Per-API-shape fetch logic. Each fetchShops_<provider>_() takes a MallConfig
 * row and returns an array of row objects with keys matching COLUMNS
 * (defined in SheetStore.gs).
 */

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
 * items plus a total-page count. See Main.gs header comment for column
 * meanings (QueryParams, PageParam, ItemsPath, TotalPagesPath, FieldMap).
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
