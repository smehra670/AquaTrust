#!/usr/bin/env python3
"""
Preprocess OS Open Rivers GeoPackage → England FlatGeobuf (+ overview GeoJSON).

FlatGeobuf supports HTTP range / bbox queries in the browser so we do not need
to load the full national dataset into React.

Outputs (under aquatrust/public/rivers/):
  - england_watercourses.fgb   (detail, all England links)
  - overview.geojson           (named / longer links, heavily simplified)
  - manifest.json
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import pyogrio
from shapely.ops import unary_union
from shapely.validation import make_valid

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
GPKG = REPO / "data" / "os-open-rivers" / "Data" / "oprvrs_gb.gpkg"
ENGLAND_GEOJSON = REPO / "data" / "england.geojson"
OUT_DIR = ROOT / "public" / "rivers"
OUT_FGB = OUT_DIR / "england_watercourses.fgb"
OUT_OVERVIEW = OUT_DIR / "overview.geojson"
OUT_MANIFEST = OUT_DIR / "manifest.json"


def form_label(form: str) -> str:
    return {
        "inlandRiver": "River / stream",
        "tidalRiver": "Tidal river / stream",
        "canal": "Canal",
        "lake": "Lake",
    }.get(form or "", form or "Unknown")


def clean_str(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    return str(value).strip()


def load_england_mask_simplified():
    if not ENGLAND_GEOJSON.exists():
        return None
    print("Loading England boundary (simplified)...")
    # Read only geometries via pyogrio for speed
    gdf = pyogrio.read_dataframe(ENGLAND_GEOJSON)
    mask = unary_union(gdf.geometry.values)
    mask = make_valid(mask).simplify(0.02, preserve_topology=True)
    print("  mask bounds", mask.bounds)
    return mask


def main():
    if not GPKG.exists():
        print(f"Missing GeoPackage: {GPKG}", file=sys.stderr)
        sys.exit(1)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print("Reading watercourse_link...")
    gdf = pyogrio.read_dataframe(GPKG, layer="watercourse_link")
    print(f"  {len(gdf)} features")

    gdf = gdf[gdf.geometry.notna()].copy()
    print("Reprojecting EPSG:27700 → EPSG:4326…")
    gdf = gdf.to_crs(4326)

    mask = load_england_mask_simplified()
    if mask is not None:
        print("Clipping to England…")
        # Fast bbox prefilter then precise intersects
        minx, miny, maxx, maxy = mask.bounds
        gdf = gdf.cx[minx:maxx, miny:maxy].copy()
        gdf = gdf[gdf.intersects(mask)].copy()
        print(f"  {len(gdf)} after England clip")
    else:
        gdf = gdf.cx[-6.5:2.0, 49.8:55.9].copy()
        print(f"  {len(gdf)} after bbox filter")

    # Normalise attributes for the browser
    gdf["id"] = gdf["id"].map(clean_str)
    gdf["name"] = gdf["watercourse_name"].map(clean_str)
    gdf["name_alt"] = gdf["watercourse_name_alternative"].map(clean_str)
    gdf["form"] = gdf["form"].map(clean_str)
    gdf["form_label"] = gdf["form"].map(form_label)
    gdf["length_m"] = gdf["length"].fillna(0).astype(float).round(1)
    gdf["flow"] = gdf["flow_direction"].map(clean_str)

    keep_cols = [
        "id",
        "name",
        "name_alt",
        "form",
        "form_label",
        "length_m",
        "flow",
        "geometry",
    ]
    detail = gdf[keep_cols].copy()
    # Light simplify for web size (still follows OS geometry)
    print("Simplifying geometries for web…")
    detail["geometry"] = detail.geometry.simplify(0.00015, preserve_topology=True)
    detail = detail[~detail.geometry.is_empty].copy()

    print(f"Writing FlatGeobuf → {OUT_FGB}")
    if OUT_FGB.exists():
        OUT_FGB.unlink()
    detail.to_file(OUT_FGB, driver="FlatGeobuf")

    # Overview: named OR longer links, more simplified
    overview = detail[
        (detail["name"] != "") | (detail["length_m"] >= 800)
    ].copy()
    overview["geometry"] = overview.geometry.simplify(0.0008, preserve_topology=True)
    overview = overview[~overview.geometry.is_empty].copy()
    print(f"Writing overview GeoJSON ({len(overview)} features)…")
    if OUT_OVERVIEW.exists():
        OUT_OVERVIEW.unlink()
    overview.to_file(OUT_OVERVIEW, driver="GeoJSON")

    bounds = detail.total_bounds.tolist()
    form_counts = {str(k): int(v) for k, v in detail["form"].value_counts().items()}
    manifest = {
        "detail": "england_watercourses.fgb",
        "overview": "overview.geojson",
        "source": "OS Open Rivers",
        "licence": "OS Open Data / Open Government Licence",
        "featureCount": int(len(detail)),
        "overviewCount": int(len(overview)),
        "bounds": bounds,
        "forms": {
            "inlandRiver": "River / stream",
            "tidalRiver": "Tidal river / stream",
            "canal": "Canal",
            "lake": "Lake",
        },
        "formCounts": form_counts,
    }
    OUT_MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    fgb_mb = OUT_FGB.stat().st_size / (1024 * 1024)
    ov_mb = OUT_OVERVIEW.stat().st_size / (1024 * 1024)
    print(f"Done. FGB {fgb_mb:.1f} MB · overview {ov_mb:.1f} MB")
    print(f"Manifest → {OUT_MANIFEST}")


if __name__ == "__main__":
    main()
