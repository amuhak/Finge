# FishCast console

A talking-fish interface over FishCast, the Georgia Tech krill model, for the Grok hackathon.

The map is the Southern Ocean: 14 krill regions with density, hotspot probability and model
uncertainty across 1990–2050. Pip — a mackerel icefish, because krill are what it eats — is a
Grok realtime voice agent that answers from the loaded data and drives the map while it talks.

The app lives at the repository root. `fish-cast/` and `hackgt-26/` are reference checkouts,
left untouched and untracked; this borrows the Grok transport from the latter and the domain
from the former.

## Quick start

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r server/requirements.txt   # Windows
# source .venv/bin/activate && pip install -r server/requirements.txt   # macOS/Linux

cd web
npm install
npm run build
cd ..

cp -n server/.env.example .env     # then put XAI_API_KEY=... in it
.venv/Scripts/python server/app.py # Windows; http://127.0.0.1:8000
# .venv/bin/python server/app.py   # macOS/Linux
```

Open http://127.0.0.1:8000 and press **Turn on sample data**.

A `.venv` with the server dependencies already exists in this working copy, so on this machine
you can skip the two install lines and run `.venv/Scripts/python server/app.py`.

For UI work, run the API and Vite separately:

```bash
.venv/Scripts/python server/app.py   # :8000, serves /api and the built SPA
cd web && npm run dev                # :5173, proxies /api to :8000
```

## Data

There is no real data in this repository. FishCast's CSVs, climate grids and checkpoints are
gitignored upstream, so the console ships empty and the sample data is behind a button.

- **Sample data** — `server/sample_data.py`, deterministic (seed 7), 14 regions × 8 rows. Clearly
  labelled in the UI and in every voice tool result.
- **Real data** — drop a `data/dataset.json` with the schema below and restart. `GET /api/dataset`
  picks it up automatically and the sample button disappears.

```jsonc
{
  "source": "real",
  "sample": false,
  "meta": {
    "title": "FishCast",
    "generated_at": "2026-11-02T00:00:00Z",
    "seed": 0,
    "years": [1990, 2000, 2010, 2020, 2035, 2050],
    "scenarios": [{ "id": "historical", "label": "Historical" }],
    "caveat": "…"
  },
  "regions": [
    {
      "id": "south_georgia",
      "name": "South Georgia",
      "lat": -54.5,
      "lon": -36.5,
      "mpa": true,
      "mpa_name": "South Georgia & South Sandwich Islands MPA",
      "summary": "…",
      "ecology": "…",
      "series": [
        { "year": 1990, "scenario": "historical", "density": 0.8, "hotspot": 0.78, "uncertainty": 0.12, "n_hauls": 420 }
      ]
    }
  ]
}
```

`density` is a relative index (0–1), `hotspot` a probability (0–1), `uncertainty` grows with
projection distance. Future rows use `ssp245` and `ssp585`; years ≤ 2020 use `historical`.

## The voice agent

Grok only. `POST /api/voice/token` mints a short-lived xAI client secret; the browser opens
`wss://api.x.ai/v1/realtime` directly, so the API key never leaves the server.

Pip's tools: `get_hotspots`, `get_region`, `compare_years`, `explain_region`, `focus_map`,
`set_year`, `end_session`. All of them read the dataset already in the browser; there is no live
inference and no model checkpoint. Tool calls also move the map and the timeline, which is the
point of voice here.

Voice needs Chrome, a microphone, `XAI_API_KEY` in `.env`, and a network. If the mic fails, the
text box in the voice panel uses the same session.

## Grok Bot

`GROK_BOT.md` has a copy-paste prompt for a Grok Bot teammate and the read-only `/api/bot`
endpoints it uses to read the data. Start the server with `--sample` so the bot and the console see
the same dataset.

## Layout

```
server/app.py          FastAPI: dataset, xAI token, built SPA
server/sample_data.py  deterministic synthetic dataset (stdlib only)
web/src/components/    world map, region panel, timeline, voice panel
web/src/voice/grok.ts  xAI realtime transport (browser-side)
web/src/voice/agent.ts Pip's instructions, tools and audio plumbing
```
