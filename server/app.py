"""FishCast console backend.

Serves the built web UI, a synthetic-or-real krill dataset, a read-only bot API,
and short-lived xAI realtime tokens so the browser's voice agent never sees the API key.

    python server/app.py                 # real data if present, else the "turn on sample data" prompt
    python server/app.py --sample        # start with synthetic sample data already loaded
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

try:  # python server/app.py
    from sample_data import build_dataset
except ImportError:  # python -m server.app
    from server.sample_data import build_dataset

ROOT = Path(__file__).resolve().parent.parent  # repository root
DIST = ROOT / "web" / "dist"
REAL_PATH = ROOT / "data" / "dataset.json"
XAI_SECRETS_URL = "https://api.x.ai/v1/realtime/client_secrets"

EMPTY_DATASET = {"source": "none", "sample": False, "meta": None, "regions": []}
SAMPLE_ENV = "FISHCAST_SAMPLE"


def load_env() -> None:
    """Minimal KEY=VALUE reader for ./.env (no python-dotenv)."""
    env = ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.partition("=")
        key = key.strip()
        if sep and key and not key.startswith("#") and value.strip():
            os.environ.setdefault(key, value.strip().strip('"').strip("'"))


def env_first(*names: str) -> str | None:
    return next((os.environ[name] for name in names if os.environ.get(name)), None)


def xai_key() -> str | None:
    return env_first("XAI_API_KEY", "XAI_KEY", "GROK")


def sample_enabled() -> bool:
    return os.environ.get(SAMPLE_ENV, "").strip().lower() in {"1", "true", "yes", "on"}


def post_json(url: str, payload: dict, headers: dict, timeout: float = 10.0) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", **headers},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def load_dataset(source: str = "auto") -> dict:
    """The dataset the console would show: real file, sample, or empty."""
    if source == "none":
        return dict(EMPTY_DATASET)
    if source == "sample":
        return build_dataset()
    if REAL_PATH.exists():
        try:
            raw = REAL_PATH.read_text(encoding="utf-8")
            parsed = json.loads(raw)
        except (OSError, json.JSONDecodeError) as exc:
            raise HTTPException(500, f"data/dataset.json is not valid JSON: {exc}") from exc
        if not isinstance(parsed, dict) or not isinstance(parsed.get("regions"), list):
            raise HTTPException(500, "data/dataset.json must be an object with a 'regions' list")
        parsed.setdefault("source", "real")
        parsed.setdefault("sample", False)
        return parsed
    if sample_enabled():
        return build_dataset()
    return dict(EMPTY_DATASET)


app = FastAPI(title="FishCast console", version="0.1.0")
load_env()


@app.get("/api/config")
def config() -> dict:
    return {
        "voice_providers": {
            "grok": {
                "available": bool(xai_key()),
                "label": "Grok Voice",
                "model": os.environ.get("XAI_VOICE_MODEL", "grok-voice-latest"),
                "voice": os.environ.get("XAI_VOICE", "eve"),
            }
        },
        "sample_available": True,
        "real_available": REAL_PATH.exists(),
        "sample_enabled": sample_enabled(),
    }


@app.get("/api/dataset")
def dataset(source: str = Query("auto", pattern="^(auto|sample|none)$")) -> dict:
    """`auto` = real file if present, else sample if enabled, else empty."""
    return load_dataset(source)


@app.post("/api/voice/token")
def voice_token() -> dict:
    """Mint a short-lived xAI token. The key stays on this machine."""
    key = xai_key()
    if not key:
        raise HTTPException(400, "No xAI key: put XAI_API_KEY=... in .env at the repo root")
    try:
        return post_json(
            XAI_SECRETS_URL,
            {"expires_after": {"seconds": 600}},
            {"Authorization": f"Bearer {key}"},
        )
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        raise HTTPException(502, f"xAI refused the token request: {exc.code} {detail}") from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise HTTPException(502, f"Could not reach xAI: {exc}") from exc


BOT_FIELDS = {
    "density": "Relative krill density index, 0-1. Not biomass.",
    "density_pct": "density * 100, for readable answers.",
    "hotspot": "Probability the region is a krill hotspot, 0-1.",
    "hotspot_pct": "hotspot * 100, in percentage points.",
    "uncertainty": "Model uncertainty, 0-1. Higher means less sure.",
    "uncertainty_words": "fairly tight (<0.18), wide (0.18-0.3), very wide (>=0.3).",
    "n_hauls": "Net hauls behind the region. Under 150 is thin data.",
}


def bot_context(data: dict) -> dict:
    meta = data.get("meta") or {}
    return {
        "source": data.get("source"),
        "sample": bool(data.get("sample")),
        "caveat": meta.get("caveat"),
        "generated_at": meta.get("generated_at"),
    }


def dataset_years(data: dict) -> list[int]:
    meta = data.get("meta") or {}
    years = {int(year) for year in (meta.get("years") or []) if isinstance(year, (int, float))}
    if not years:
        for region in data.get("regions") or []:
            for point in region.get("series") or []:
                year = point.get("year")
                if isinstance(year, (int, float)):
                    years.add(int(year))
    return sorted(years)


def choose_year(data: dict, year: int | None) -> int | None:
    years = dataset_years(data)
    if not years:
        return None
    if year is None:
        return 2020 if 2020 in years else years[0]
    return min(years, key=lambda candidate: abs(candidate - year))


def choose_scenario(year: int, scenario: str) -> str:
    if year <= 2020:
        return "historical"
    return scenario if scenario in {"ssp245", "ssp585"} else "ssp245"


def point_at(region: dict, year: int, scenario: str) -> dict | None:
    series = [point for point in (region.get("series") or []) if isinstance(point, dict)]
    exact = next((point for point in series if point.get("year") == year and point.get("scenario") == scenario), None)
    if exact is not None:
        return exact
    candidates = [point for point in series if point.get("scenario") == scenario] or series
    if not candidates:
        return None
    return min(
        candidates,
        key=lambda point: abs(int(point["year"]) - year) if isinstance(point.get("year"), (int, float)) else 10**9,
    )


def as_pct(value: object) -> float | None:
    return round(value * 100, 1) if isinstance(value, (int, float)) else None


def uncertainty_words(value: object) -> str | None:
    if not isinstance(value, (int, float)):
        return None
    if value < 0.18:
        return "fairly tight"
    if value < 0.3:
        return "wide"
    return "very wide"


def bot_point(region: dict, point: dict | None) -> dict:
    density = point.get("density") if point else None
    hotspot = point.get("hotspot") if point else None
    uncertainty = point.get("uncertainty") if point else None
    hauls = point.get("n_hauls") if point else None
    return {
        "id": region.get("id"),
        "name": region.get("name"),
        "lat": region.get("lat"),
        "lon": region.get("lon"),
        "mpa": bool(region.get("mpa")),
        "mpa_name": region.get("mpa_name"),
        "density": density,
        "density_pct": as_pct(density),
        "hotspot": hotspot,
        "hotspot_pct": as_pct(hotspot),
        "uncertainty": uncertainty,
        "uncertainty_words": uncertainty_words(uncertainty),
        "n_hauls": hauls,
        "thin_data": hauls < 150 if isinstance(hauls, (int, float)) else None,
    }


def find_region(data: dict, ref: str) -> dict | None:
    def normalize(value: object) -> str:
        return re.sub(r"[^a-z0-9]+", " ", str(value).lower()).strip()

    wanted = normalize(ref)
    regions = data.get("regions") or []
    for region in regions:
        if normalize(region.get("id")) == wanted or normalize(region.get("name")) == wanted:
            return region
    for region in regions:
        name = normalize(region.get("name"))
        if wanted and (wanted in name or name in wanted):
            return region
    return None


@app.get("/api/bot/overview")
def bot_overview() -> dict:
    """Start here: dataset context, region roster, and links to the other bot endpoints."""
    data = load_dataset("auto")
    meta = data.get("meta") or {}
    regions = data.get("regions") or []
    return {
        "service": "FishCast",
        "description": "Southern Ocean krill hotspot demo, 1990-2050. Read-only data for the Grok Bot.",
        **bot_context(data),
        "loaded": bool(regions),
        "years": dataset_years(data),
        "scenarios": meta.get("scenarios") or [],
        "fields": BOT_FIELDS,
        "region_count": len(regions),
        "regions": [
            {
                "id": region.get("id"),
                "name": region.get("name"),
                "lat": region.get("lat"),
                "lon": region.get("lon"),
                "mpa": bool(region.get("mpa")),
                "mpa_name": region.get("mpa_name"),
                "summary": region.get("summary"),
            }
            for region in regions
        ],
        "endpoints": {
            "hotspots": "/api/bot/hotspots?year=2050&scenario=ssp585&limit=6",
            "region": "/api/bot/region/{region_id}",
        },
        "message": None
        if regions
        else "No dataset is loaded. Start the server with --sample or add data/dataset.json.",
    }


@app.get("/api/bot/hotspots")
def bot_hotspots(
    year: int | None = Query(None, description="Nearest available year. Defaults to 2020."),
    scenario: str = Query("ssp245", pattern="^(ssp245|ssp585)$"),
    limit: int = Query(6, ge=1, le=50),
) -> dict:
    """Rank regions by hotspot probability for a year and scenario."""
    data = load_dataset("auto")
    regions = data.get("regions") or []
    chosen_year = choose_year(data, year)
    if not regions or chosen_year is None:
        return {
            **bot_context(data),
            "year": chosen_year,
            "scenario": None,
            "count": 0,
            "hotspots": [],
            "message": "No dataset is loaded. Start the server with --sample or add data/dataset.json.",
        }
    chosen_scenario = choose_scenario(chosen_year, scenario)
    rows = []
    for region in regions:
        point = point_at(region, chosen_year, chosen_scenario)
        if point is not None:
            rows.append(bot_point(region, point))
    rows.sort(key=lambda row: row["hotspot"] if row["hotspot"] is not None else -1, reverse=True)
    ranked = [{**row, "rank": index} for index, row in enumerate(rows[:limit], start=1)]
    return {
        **bot_context(data),
        "year": chosen_year,
        "scenario": chosen_scenario,
        "count": len(ranked),
        "hotspots": ranked,
        "message": None,
    }


@app.get("/api/bot/region/{region_id}")
def bot_region(region_id: str) -> dict:
    """Full details and series for one region. Accepts a region id or name."""
    data = load_dataset("auto")
    region = find_region(data, region_id)
    if region is None:
        known = ", ".join(str(item.get("id")) for item in (data.get("regions") or []))
        raise HTTPException(404, f"No region '{region_id}'. Known ids: {known}")
    meta = data.get("meta") or {}
    return {
        **bot_context(data),
        "years": dataset_years(data),
        "scenarios": meta.get("scenarios") or [],
        "region": {
            "id": region.get("id"),
            "name": region.get("name"),
            "lat": region.get("lat"),
            "lon": region.get("lon"),
            "mpa": bool(region.get("mpa")),
            "mpa_name": region.get("mpa_name"),
            "summary": region.get("summary"),
            "ecology": region.get("ecology"),
            "series": region.get("series") or [],
        },
    }


if DIST.exists():
    assets = DIST / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str) -> FileResponse:
        if full_path.startswith("api"):
            raise HTTPException(404, "Not found")
        dist = DIST.resolve()
        target = (dist / full_path).resolve()
        if full_path and target.is_file() and dist in target.parents:
            return FileResponse(target)
        return FileResponse(dist / "index.html")
else:

    @app.get("/", include_in_schema=False)
    def root() -> dict:
        return {
            "service": "fishcast-console",
            "hint": "Build the web app first: cd web && npm install && npm run build",
        }


def main() -> None:
    parser = argparse.ArgumentParser(description="FishCast console backend")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--sample", action="store_true", help="start with synthetic sample data")
    parser.add_argument("--reload", action="store_true")
    args = parser.parse_args()

    if args.sample:
        os.environ[SAMPLE_ENV] = "1"

    if args.reload:
        sys.path.insert(0, str(ROOT))
        uvicorn.run("server.app:app", host=args.host, port=args.port, reload=True)
    else:
        uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
