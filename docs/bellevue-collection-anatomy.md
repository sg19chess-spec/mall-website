# Bellevue Collection Data Map

## Directory page

```
https://bellevuecollection.com/shop/guide/#/cat/open-now
```

Client-side (Vue) app. The `#/cat/open-now` part is a client-side route, not
sent to the server — the real content comes from a single JSON API call.

## API endpoint

```
GET https://bellevuecollection.com/wp-json/tbc/shopping-directory/retail
GET https://bellevuecollection.com/wp-json/tbc/shopping-directory/dining
GET https://bellevuecollection.com/wp-json/tbc/shopping-directory/hotels
```

Custom WordPress REST route (namespace `tbc`), discovered from the site's
`data-listing-route="shopping-directory/retail"` HTML attribute plus the
compiled Vue bundle (`app/themes/bc/dist/scripts/main_*.js`), which builds
the request as `baseUrl + listingRoute`.

**No pagination at all** — one GET returns every tenant of that type as a
bare JSON array (158 retail, 78 dining at time of writing). The site's own
JS does client-side pagination (`Math.ceil(items.length / perPage)`) purely
for display; the API itself has no `page`/`totalPages` concept.

### Response shape

```json
[
  {
    "title": "Abercrombie &#038; Fitch",
    "slug": "abercrombie-fitch",
    "link": "https://bellevuecollection.com/tenant/abercrombie-fitch/",
    "price": null,
    "hours": { "openClose": "closed today", "schedules": [] },
    "category_slugs": ["retail", "mens-apparel", "womens-apparel"],
    "category_names": ["Retail", "Men's Apparel", "Women's Apparel"],
    "building_slugs": [],
    "building_names": [],
    "property_slugs": ["bellevue-square"],
    "property_names": ["Bellevue Square"],
    "image": "https://bellevuecollection.com/app/uploads/.../Abercrombie-1-300x200.jpg",
    "tmp_message": "",
    "tmp_contact": "<p>425-454-5998</p>"
  }
]
```

`property_names` is which of the three Bellevue Collection buildings the
tenant is in (`Bellevue Square`, `Lincoln Square North/South`, `Bellevue
Place`) — used as our `floor` column since there's no literal floor field.

### Field mapping used

| API field | Our column |
|---|---|
| title | name |
| tmp_message | description (mostly blank in practice) |
| link | url |
| slug | source_id |
| image | logo and image |
| property_names | floor |
| category_names | category |

## Apps Script config

Two rows (`generic` provider — see `appscript/README.md`), `PageParam`/
`ItemsPath`/`TotalPagesPath` all left blank since there's no pagination:

```
MallName: Bellevue Collection - Retail
Provider: generic
SearchUrl: https://bellevuecollection.com/wp-json/tbc/shopping-directory
ApiPath: retail
BaseUrl: https://bellevuecollection.com
FieldMap: {"name":"title","description":"tmp_message","url":"link","source_id":"slug","logo":"image","image":"image","floor":"property_names","category":"category_names"}
```

Swap `ApiPath` to `dining` (or `hotels`) for the other directories.
