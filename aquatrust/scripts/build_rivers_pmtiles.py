#!/usr/bin/env python3
"""
Preprocess OS Open Rivers (GB GeoPackage) into MapLibre-friendly PMTiles
for England watercourses.

Usage (from repo root or aquatrust/):
  python scripts/build_rivers_pmtiles.py

Inputs:
  ../data/os-open-rivers/Data/oprvrs_gb.gpkg
  ../data/england.geojson (optional clip)

Output:
  public/rivers/england_watercourses.pmtiles
  public/rivers/manifest.json
"""

from __future__ import annotations

import json
import math
import sys
import gzip
from collections import defaultdict
from pathlib import Path

import mercantile
import mapbox_vector_tile
import pyogrio
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer
from shapely.geometry import box, mapping, shape
from shapely.ops import transform, unary_union
from shapely.validation import make_valid

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
GPKG = REPO / "data" / "os-open-rivers" / "Data" / "oprvrs_gb.gpkg"
ENGLAND_GEOJSON = REPO / "data" / "england.geojson"
OUT_DIR = ROOT / "public" / "rivers"
OUT_PMTILES = OUT_DIR / "england_watercourses.pmtiles"
OUT_MANIFEST = OUT_DIR / "manifest.json"

MIN_ZOOM = 6
MAX_ZOOM = 12
# metres in British National Grid before project — simplify after WGS84
SIMPLIFY_DEG = {
    6: 0.004,
    7: 0.0025,
    8: 0.0015,
    9: 0.0008,
    10: 0.0004,
    11: 0.0002,
    12: 0.0001,
}
# At low zooms only keep longer / named links for performance
MIN_LENGTH_BY_ZOOM = {
    6: 2500,
    7: 1500,
    8: 800,
    9: 400,
    10: 150,
    11: 0,
    12: 0,
}


def project_bng_to_wgs84(geom):
    """EPSG:27700 → EPSG:4326 using pyproj if available, else approximate."""
    try:
        from pyproj import Transformer

        transformer = Transformer.from_crs(27700, 4326, always_xy=True)

        def _xf(x, y, z=None):
            lon, lat = transformer.transform(x, y)
            return (lon, lat) if z is None else (lon, lat, z)

        return transform(_xf, geom)
    except Exception:
        # Lightweight fallback (not used if pyproj present)
        def _approx(x, y, z=None):
            # crude — prefer pyproj
            lon = x / 111320.0 * math.cos(math.radians(54)) - 2.0
            lat = y / 111320.0 + 49.0
            return (lon, lat) if z is None else (lon, lat, z)

        return transform(_approx, geom)


def load_england_mask():
    if not ENGLAND_GEOJSON.exists():
        print("No england.geojson — using rough England bbox filter")
        return None
    data = json.loads(ENGLAND_GEOJSON.read_text(encoding="utf-8"))
    geoms = []
    if data.get("type") == "FeatureCollection":
        for f in data["features"]:
            geoms.append(shape(f["geometry"]))
    elif data.get("type") == "Feature":
        geoms.append(shape(data["geometry"]))
    else:
        geoms.append(shape(data))
    mask = unary_union(geoms)
    return make_valid(mask)


def form_label(form: str) -> str:
    return {
        "inlandRiver": "River / stream",
        "tidalRiver": "Tidal river / stream",
        "canal": "Canal",
        "lake": "Lake",
    }.get(form, form or "Unknown")


def feature_props(row) -> dict:
    name = row.get("watercourse_name")
    alt = row.get("watercourse_name_alternative")
    form = row.get("form") or ""
    length = float(row.get("length") or 0)
    return {
        "id": str(row.get("id") or ""),
        "name": "" if name is None or (isinstance(name, float) and math.isnan(name)) else str(name),
        "name_alt": ""
        if alt is None or (isinstance(alt, float) and math.isnan(alt))
        else str(alt),
        "form": str(form),
        "form_label": form_label(str(form)),
        "length_m": round(length, 1),
        "flow": str(row.get("flow_direction") or ""),
    }


def encode_tile(features_for_tile):
    layers = [
        {
            "name": "watercourses",
            "features": [
                {
                    "geometry": mapping(geom),
                    "properties": props,
                }
                for geom, props in features_for_tile
                if geom and not geom.is_empty
            ],
        }
    ]
    raw = mapbox_vector_tile.encode(
        layers,
        # default extents 4096; geometries must be in tile-local coords!
        # mapbox_vector_tile expects WGS84 if quantize_bounds provided
    )
    return raw


def encode_tile_wgs84(features_for_tile, tile):
    """Encode MVT with geometries clipped to tile, quantized to tile bounds."""
    bounds = mercantile.bounds(tile)
    quantize = (bounds.west, bounds.south, bounds.east, bounds.north)
    layers = [
        {
            "name": "watercourses",
            "features": [
                {
                    "geometry": mapping(geom),
                    "properties": props,
                }
                for geom, props in features_for_tile
                if geom and not geom.is_empty
            ],
        }
    ]
    return mapbox_vector_tile.encode(layers, quantize_bounds=quantize)


def main():
    if not GPKG.exists():
        print(f"Missing GeoPackage: {GPKG}", file=sys.stderr)
        sys.exit(1)

    try:
        import pyproj  # noqa: F401
    except ImportError:
        print("Installing pyproj is required — run: pip install pyproj")
        sys.exit(1)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print("Loading England mask…")
    mask = load_england_mask()

    print("Reading watercourse_link from GeoPackage (this can take a minute)…")
    gdf = pyogrio.read_dataframe(GPKG, layer="watercourse_link")
    print(f"  {len(gdf)} features, CRS={gdf.crs}")

    # Drop empty geometries
    gdf = gdf[gdf.geometry.notna()].copy()

    print("Reprojecting to WGS84…")
    gdf = gdf.to_crs(4326)

    if mask is not None:
        print("Clipping to England…")
        # spatial index intersection
        gdf = gdf[gdf.intersects(mask)].copy()
        print(f"  {len(gdf)} features after England clip")
    else:
        # Rough England bbox (excludes most of Scotland/Northern Isles)
        gdf = gdf.cx[-6.5:2.0, 49.8:55.9].copy()
        print(f"  {len(gdf)} features after bbox filter")

    # Build feature list
    features = []
    for _, row in gdf.iterrows():
        geom = row.geometry
        if geom is None or geom.is_empty:
            continue
        geom = make_valid(geom)
        props = feature_props(row)
        features.append((geom, props))

    print(f"Prepared {len(features)} England watercourse features")

    # Bounds
    minx = min(g.bounds[0] for g, _ in features)
    miny = min(g.bounds[1] for g, _ in features)
    maxx = max(g.bounds[2] for g, _ in features)
    maxy = max(g.bounds[3] for g, _ in features)
    print(f"Bounds: {minx},{miny},{maxx},{maxy}")

    tiles_written = 0
    with OUT_PMTILES.open("wb") as fp:
        writer = Writer(fp)
        for z in range(MIN_ZOOM, MAX_ZOOM + 1):
            min_len = MIN_LENGTH_BY_ZOOM[z]
            simp = SIMPLIFY_DEG[z]
            # Filter for this zoom
            zoom_feats = []
            for geom, props in features:
                if props["length_m"] < min_len and not props["name"] and z < 11:
                    continue
                if props["length_m"] < min_len and z <= 8:
                    continue
                g = geom.simplify(simp, preserve_topology=True)
                if g.is_empty:
                    continue
                zoom_feats.append((g, props))

            print(f"Zoom {z}: {len(zoom_feats)} features → tiling…")
            # Group by tile
            tile_map = defaultdict(list)
            for geom, props in zoom_feats:
                bx = geom.bounds
                for tile in mercantile.tiles(bx[0], bx[1], bx[2], bx[3], [z]):
                    tb = mercantile.bounds(tile)
                    tile_box = box(tb.west, tb.south, tb.east, tb.north)
                    clipped = geom.intersection(tile_box)
                    if clipped.is_empty:
                        continue
                    tile_map[(tile.z, tile.x, tile.y)].append((clipped, props))

            for (tz, tx, ty), feats in tile_map.items():
                tile = mercantile.Tile(x=tx, y=ty, z=tz)
                try:
                    raw = encode_tile_wgs84(feats, tile)
                except Exception as exc:
                    print(f"  skip tile {tz}/{tx}/{ty}: {exc}")
                    continue
                compressed = gzip.compress(raw)
                writer.write_tile(zxy_to_tileid(tz, tx, ty), compressed)
                tiles_written += 1

            print(f"  zoom {z} done ({len(tile_map)} tiles)")

        header = {
            "tile_type": TileType.MVT,
            "tile_compression": Compression.GZIP,
            "min_zoom": MIN_ZOOM,
            "max_zoom": MAX_ZOOM,
            "min_lon": minx,
            "min_lat": miny,
            "max_lon": maxx,
            "max_lat": maxy,
            "center_zoom": 8,
            "center_lon": (minx + maxx) / 2,
            "center_lat": (miny + maxy) / 2,
        }
        metadata = {
            "name": "AquaTrust England Watercourses",
            "description": "OS Open Rivers watercourse_link clipped to England",
            "attribution": "© Ordnance Survey — OS Open Rivers",
            "type": "overlay",
            "format": "pbf",
            "bounds": f"{minx},{miny},{maxx},{maxy}",
            "minzoom": str(MIN_ZOOM),
            "maxzoom": str(MAX_ZOOM),
            "vector_layers": json.dumps(
                [
                    {
                        "id": "watercourses",
                        "description": "OS Open Rivers WatercourseLink",
                        "minzoom": MIN_ZOOM,
                        "maxzoom": MAX_ZOOM,
                        "fields": {
                            "id": "String",
                            "name": "String",
                            "name_alt": "String",
                            "form": "String",
                            "form_label": "String",
                            "length_m": "Number",
                            "flow": "String",
                        },
                    }
                ]
            ),
        }
        writer.finalize(header, metadata)

    manifest = {
        "file": "england_watercourses.pmtiles",
        "source": "OS Open Rivers",
        "layer": "watercourses",
        "minzoom": MIN_ZOOM,
        "maxzoom": MAX_ZOOM,
        "featureCount": len(features),
        "tilesWritten": tiles_written,
        "bounds": [minx, miny, maxx, maxy],
        "forms": {
            "inlandRiver": "River / stream",
            "tidalRiver": "Tidal river / stream",
            "canal": "Canal",
            "lake": "Lake",
        },
    }
    OUT_MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    size_mb = OUT_PMTILES.stat().st_size / (1024 * 1024)
    print(f"Wrote {OUT_PMTILES} ({size_mb:.1f} MB, {tiles_written} tiles)")
    print(f"Manifest {OUT_MANIFEST}")


if __name__ == "__main__":
    main()
