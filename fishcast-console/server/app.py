"""FishCast console backend.

Serves the built web UI, a synthetic-or-real krill dataset, and short-lived xAI
realtime tokens so the browser's voice agent never sees the API key.

    python server/app.py                 # real data if present, else the "turn on sample data" prompt
    python server/app.py --sample        # start with synthetic sample data already loaded
"""

from __future__ import annotations

import argparse
import json
import os
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

ROOT = Path(__file__).resolve().parent.parent  # fishcast-console/
DIST = ROOT / "web" / "dist"
REAL_PATH = ROOT / "data" / "dataset.json"
XAI_SECRETS_URL = "https://api.x.ai/v1/realtime/client_secrets"

EMPTY_DATASET = {"source": "none", "sample": False, "meta": None, "regions": []}
SAMPLE_ENV = "FISHCAST_SAMPLE"


def load_env() -> None:
    """Minimal KEY=VALUE reader for fishcast-console/.env (no python-dotenv)."""
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


@app.post("/api/voice/token")
def voice_token() -> dict:
    """Mint a short-lived xAI token. The key stays on this machine."""
    key = xai_key()
    if not key:
        raise HTTPException(400, "No xAI key: put XAI_API_KEY=... in fishcast-console/.env")
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
