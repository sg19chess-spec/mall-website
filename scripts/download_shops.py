#!/usr/bin/env python3
"""Download the full Bluewater shop directory and save it as an Excel file.

Usage:
    python scripts/download_shops.py [output.xlsx]

Data source: see docs/bluewater-anatomy.md for how this API was discovered.
"""
import sys
import time

import pandas as pd
import requests

SITE_KEY = "446cfce2-1e0b-466a-8c80-862385517399"
SEARCH_URL = "https://content.landsec.com/search/shops"
BASE_SITE_URL = "https://www.bluewater.co.uk"

FIELD_MAP = {
    "pageTitle": "name",
    "pageDescription": "description",
    "pageUrl": "url",
    "nodeId": "source_id",
    "pageLogoUrl": "logo",
    "pageImageUrl": "image",
    "floors": "floor",
    "categories": "category",
}


def fetch_page(page: int) -> dict:
    params = {
        "siteKey": SITE_KEY,
        "culture": "en-us",
        "page": page,
        "order": "asc",
        "search": "",
        "tags": "",
        "filters": "",
    }
    resp = requests.get(SEARCH_URL, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def normalize(shop: dict) -> dict:
    row = {}
    for api_field, column in FIELD_MAP.items():
        value = shop.get(api_field)
        if isinstance(value, list):
            value = ", ".join(str(v) for v in value)
        row[column] = value
    if row.get("url") and not str(row["url"]).startswith("http"):
        row["url"] = BASE_SITE_URL + row["url"]
    return row


def fetch_all_shops() -> list[dict]:
    first = fetch_page(1)
    total_pages = first.get("totalPages", 1)
    shops = list(first.get("data", []))

    for page in range(2, total_pages + 1):
        data = fetch_page(page)
        shops.extend(data.get("data", []))
        time.sleep(0.3)  # be polite to the API

    return shops


def main():
    output_path = sys.argv[1] if len(sys.argv) > 1 else "bluewater_shops.xlsx"

    print("Fetching shop directory...")
    shops = fetch_all_shops()
    print(f"Fetched {len(shops)} shops")

    rows = [normalize(shop) for shop in shops]
    columns = list(FIELD_MAP.values())
    df = pd.DataFrame(rows, columns=columns)

    df.to_excel(output_path, index=False, sheet_name="Shops")
    print(f"Saved to {output_path}")


if __name__ == "__main__":
    main()
