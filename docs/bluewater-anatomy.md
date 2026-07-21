# Bluewater Mall Data Map

## 1. Main website pages

### Directory page

```
https://www.bluewater.co.uk/en/shop-listing
```

Purpose:

* Human-facing shop directory
* Loads shop data dynamically
* Does NOT contain the shop list in HTML

---

### Individual shop pages

Example:

```
https://www.bluewater.co.uk/bluewater/en/shop-listing/apple/
```

Each shop has its own page.

From API:

```json
{
 "pageTitle": "Apple",
 "pageUrl": "/bluewater/en/shop-listing/apple/"
}
```

These pages contain:

* description
* logo
* images
* possibly opening hours
* contact information
* offers

---

## 2. API endpoints discovered

### A) Category endpoint

This is the first API we found.

```
GET
https://content.landsec.com/content/filters/en-us/446cfce2-1e0b-466a-8c80-862385517399/shopListingPage
```

Purpose:

Returns:

* categories
* groups
* filter IDs

Example:

```json
{
"groupName":"Fashion",
"categories":[
 {
  "categoryName":"Womenswear",
  "categoryId":"62872c97..."
 }
]
}
```

---

### Category structure

Current categories:

```
Fashion
 |
 + Womenswear
 + Menswear
 + Kidswear
 + Sportswear & Outdoor
 + Accessories
 + Jewellery & Watches
 + Shoes
 + Lingerie

Lifestyle
 |
 + Health & Fitness
 + Toys
 + Technology
 + Books
 + Gifts & Speciality
 + Beauty
 + Home
 + Grocery

Food & Drink
 |
 + Restaurants
 + Cafes
 + Bars

Services
 |
 + Banks
 + Alterations
 + Personal Services
```

(Exact list comes from API, so do not hardcode.)

---

## 3. Main shop search API

This is the important one.

```
GET
https://content.landsec.com/search/shops
```

Parameters:

```
siteKey
culture
page
order
search
tags
filters
```

Example:

```
https://content.landsec.com/search/shops?
siteKey=446cfce2-1e0b-466a-8c80-862385517399
&culture=en-us
&page=1
&order=asc
&search=
&tags=
&filters=
```

---

### Response structure

```json
{
"data":[
 {
  "pageTitle":"Apple",
  "pageDescription":"...",
  "floors":[],
  "nodeId":"8b495960...",
  "pageUrl":"/bluewater/en/shop-listing/apple/",
  "pageLogoUrl":"/media/apple.jpg",
  "pageImageUrl":"/media/apple-store.jpg"
 }
],
"documentsCount":201,
"totalPages":17,
"currentPage":1
}
```

---

### Fields we should store

Our universal schema mapping:

| API field       | Database    |
| --------------- | ----------- |
| pageTitle       | name        |
| pageDescription | description |
| pageUrl         | url         |
| nodeId          | source_id   |
| pageLogoUrl     | logo        |
| pageImageUrl    | image       |
| floors          | floor       |
| categories      | category    |

---

## 4. Pagination logic

Currently:

```
totalPages = 17
```

But this can change.

Tomorrow:

* new shops added → 18 pages
* shops deleted → 15 pages

So script should always:

```
download page 1
read totalPages
loop:
page=2
page=3
...
until totalPages
```

Never hardcode 17.

---

## 5. Category extraction

There are two methods.

### Method A (recommended)

Download everything:

```
/search/shops
```

Then use categories from shop detail.

---

### Method B

Run category filters:

Example:

```
filters=62872c97-ec63-4af3-860c-f2216d7eb415
```

Returns:

Women's fashion only.

The category IDs are dynamic, so script should first call:

```
shopListingPage
```

and discover categories.

---

## 6. What our daily script should do

Something like:

```
bluewater_sync.py
START
 |
 |
 v
GET categories API
save categories.json
 |
 |
 v
GET shop API
discover totalPages
 |
 |
 v
download every page
 |
 |
 v
normalize:
{
 name,
 description,
 category,
 url,
 logo,
 image
}
 |
 |
 v
compare with previous snapshot
 |
 |
 +---- New shop?
 |
 +---- Removed shop?
 |
 +---- Changed description?
 |
 +---- Changed category?

 |
 |
 v
save database
END
```

---

## Current status

For Bluewater:

| Component            | Status |
| --------------------- | ------ |
| Directory page        | ✅      |
| Shop API              | ✅      |
| Pagination            | ✅      |
| Categories API        | ✅      |
| Individual shop URLs  | ✅      |
| Logos/images          | ✅      |
