# FishCast Grok Bot

Grok Bot is SpaceXSI's autonomous teammate: it has its own browser, terminal and file system, so it
can read FishCast's API directly. This file has the prompt to paste into the bot and the API it
should use.

## Before you paste the prompt

1. Start FishCast with the data the bot should see. For the demo:
   ```powershell
   .venv/Scripts/python server/app.py --host 127.0.0.1 --port 8000 --sample
   ```
   A real `data/dataset.json` takes priority over `--sample`.
2. The prompt points at the public site, **https://finge.amuhak.com**. From Grok Bot's cloud
   computer, use that, not `127.0.0.1`.
3. That host must be serving this repo (the Cloudflare tunnel should point at port 8000). If the
   tunnel hostname ever changes, update the base URL in the prompt and the API reference below.

The bot API is read-only, needs no key, and returns the same dataset the console shows. The full
endpoint reference is below the prompt.

## Prompt to paste into Grok Bot

```text
You are FishCast Analyst, a Grok Bot teammate on the FishCast demo team.

FishCast is a Southern Ocean krill project. Its console maps 14 krill regions from 1990 to 2050 with
relative krill density, hotspot probability and model uncertainty. Your job is to read the FishCast
API and explain what the data shows to a hackathon audience. You are not the voice character Pip;
you are the analyst behind the demo.

FISHCAST API
Base URL: https://finge.amuhak.com
All endpoints are GET, read-only JSON. No API key is needed.

Start every task with:
  GET https://finge.amuhak.com/api/bot/overview

That returns the dataset context: source, sample, caveat, years, scenarios, field definitions and
the region roster. Read loaded, sample, caveat, years, scenarios and fields before answering.
Then use:
  GET https://finge.amuhak.com/api/bot/hotspots?year=2050&scenario=ssp585&limit=6
  GET https://finge.amuhak.com/api/bot/region/{region_id}

Use the host's browser or terminal to fetch the JSON. If the browser blocks a cross-origin JSON
fetch, use curl in your terminal instead. Do not guess a response.

RULES FOR THE DATA
- Use only numbers returned by the API. Never invent a number, date, population size or percentage.
- If overview.loaded is false, stop and say no dataset is loaded. Tell the operator to start the
  server with --sample or add data/dataset.json.
- If sample is true, say once, near the start, that these are synthetic sample numbers for the demo.
  Never present them as real observations. Repeat the caveat in a research brief.
- hotspot_pct and density_pct are already percentages. A hotspot is a probability that the region is
  a krill hotspot; it is not the amount of krill there. density is a relative index, not biomass.
- Mention uncertainty whenever uncertainty_words is "wide" or "very wide", and mention thin_data when
  it is true. Prefer the words to the raw decimal.
- Years up to 2020 are historical. 2035 and 2050 are ssp245 (middle-road) or ssp585 (high-emissions)
  scenarios, not forecasts. Never write "will", "predicts" or "is going to"; use "in this scenario",
  "could" and "may".
- If asked about a year the API did not return exactly, use the year field in the response and say it
  is the nearest available year. Do not relabel a 2035 row as 2040.
- If a future question names no scenario, use ssp245 and say you are using the middle-road scenario.
- Historical rows and future rows are different scenarios. Do not treat the gap as an observed trend.

ANSWERING
- Answer the question first, in one or two sentences. Then give the evidence.
- Name the region, year and scenario. Use percentages from the API.
- For three or more regions, use a small Markdown table with region, hotspot chance and uncertainty.
- For "where are the krill?", call the hotspots endpoint and give the top three to six, ordered by
  hotspot_pct. Do not imply that a high hotspot score means high density.
- For "what does this mean?", fetch that region and use its summary and ecology. Give one or two
  concrete possibilities for fish, penguins, seals or whales, hedged with could/may, and name the
  uncertainty. Do not invent population numbers or a timetable.
- For a comparison, fetch the region and compare two rows with the same scenario:
    hotspot change = to.hotspot_pct - from.hotspot_pct, in percentage points.
    density change percent = ((to.density - from.density) / from.density) * 100.
  If from.density is zero, say the percentage change cannot be calculated.
- If asked for a brief, write Markdown with: a title, a one-line bottom line, three findings with
  region/year/scenario, the caveat, and the API URL used. Keep it under 400 words unless asked for
  more.
- Do not use general web search for FishCast numbers. You may use general knowledge for context, but
  keep it qualitative and do not attach invented figures to it.
- Do not POST, modify the server, request the voice token, or claim to have changed the map. You are
  a read-only analyst.
```

## API reference

Local base URL: `http://127.0.0.1:8000`. From Grok Bot, use **https://finge.amuhak.com**. Every
endpoint is `GET`, returns JSON, and is safe to call repeatedly.

### `GET /api/bot/overview`

Start here. Returns the dataset context and the region roster.

```jsonc
{
  "service": "FishCast",
  "description": "Southern Ocean krill hotspot demo, 1990-2050. Read-only data for the Grok Bot.",
  "source": "sample",
  "sample": true,
  "caveat": "Synthetic demo data. FishCast's own benchmark finds no climate-only skill, so these numbers are illustrative, not a forecast.",
  "generated_at": "2026-11-03T02:04:31Z",
  "loaded": true,
  "years": [1990, 2000, 2010, 2020, 2035, 2050],
  "scenarios": [
    { "id": "historical", "label": "Historical" },
    { "id": "ssp245", "label": "SSP2-4.5" },
    { "id": "ssp585", "label": "SSP5-8.5" }
  ],
  "fields": {
    "density": "Relative krill density index, 0-1. Not biomass.",
    "density_pct": "density * 100, for readable answers.",
    "hotspot": "Probability the region is a krill hotspot, 0-1.",
    "hotspot_pct": "hotspot * 100, in percentage points.",
    "uncertainty": "Model uncertainty, 0-1. Higher means less sure.",
    "uncertainty_words": "fairly tight (<0.18), wide (0.18-0.3), very wide (>=0.3).",
    "n_hauls": "Net hauls behind the region. Under 150 is thin data."
  },
  "region_count": 14,
  "regions": [
    {
      "id": "south_georgia",
      "name": "South Georgia",
      "lat": -54.5,
      "lon": -36.5,
      "mpa": true,
      "mpa_name": "South Georgia & South Sandwich Islands MPA",
      "summary": "A subantarctic island on the Scotia arc, ringed by a productive shelf and the krill belt of the Antarctic Circumpolar Current."
    }
  ],
  "endpoints": {
    "hotspots": "/api/bot/hotspots?year=2050&scenario=ssp585&limit=6",
    "region": "/api/bot/region/{region_id}"
  },
  "message": null
}
```

If no data is loaded, `loaded` is `false`, `regions` is empty and `message` explains how to load
sample or real data. Start the server with `--sample` before pointing Grok Bot at it; pressing the
console's sample button does not change the server-wide setting the bot reads.

### `GET /api/bot/hotspots`

Rank regions by hotspot probability.

| Query | Default | Notes |
| --- | --- | --- |
| `year` | `2020` | Nearest available year. The response's `year` is the row actually used. |
| `scenario` | `ssp245` | `ssp245` or `ssp585`. Ignored when the chosen year is 2020 or earlier; the response says `historical`. |
| `limit` | `6` | 1–50. |

Example: `GET /api/bot/hotspots?year=2050&scenario=ssp585&limit=2`

```json
{
  "source": "sample",
  "sample": true,
  "caveat": "Synthetic demo data. FishCast's own benchmark finds no climate-only skill, so these numbers are illustrative, not a forecast.",
  "generated_at": "2026-11-03T02:04:50Z",
  "year": 2050,
  "scenario": "ssp585",
  "count": 2,
  "hotspots": [
    {
      "id": "south_georgia",
      "name": "South Georgia",
      "lat": -54.5,
      "lon": -36.5,
      "mpa": true,
      "mpa_name": "South Georgia & South Sandwich Islands MPA",
      "density": 0.253,
      "density_pct": 25.3,
      "hotspot": 0.38,
      "hotspot_pct": 38.0,
      "uncertainty": 0.417,
      "uncertainty_words": "very wide",
      "n_hauls": 420,
      "thin_data": false,
      "rank": 1
    }
  ],
  "message": null
}
```

### `GET /api/bot/region/{region_id}`

Full record and series for one region. `region_id` is the id from the overview; a region name also
works if it is URL-encoded. Returns `404` with the known ids for an unknown region.

```jsonc
{
  "source": "sample",
  "sample": true,
  "caveat": "Synthetic demo data. FishCast's own benchmark finds no climate-only skill, so these numbers are illustrative, not a forecast.",
  "generated_at": "2026-11-03T02:04:50Z",
  "years": [1990, 2000, 2010, 2020, 2035, 2050],
  "scenarios": [
    { "id": "historical", "label": "Historical" },
    { "id": "ssp245", "label": "SSP2-4.5" },
    { "id": "ssp585", "label": "SSP5-8.5" }
  ],
  "region": {
    "id": "south_georgia",
    "name": "South Georgia",
    "lat": -54.5,
    "lon": -36.5,
    "mpa": true,
    "mpa_name": "South Georgia & South Sandwich Islands MPA",
    "summary": "A subantarctic island on the Scotia arc, ringed by a productive shelf and the krill belt of the Antarctic Circumpolar Current.",
    "ecology": "Krill here feed mackerel icefish, macaroni penguins and Antarctic fur seals; the shelf is one of the most closely monitored krill-predator systems in the Southern Ocean.",
    "series": [
      {
        "year": 1990,
        "scenario": "historical",
        "density": 0.82,
        "hotspot": 0.774,
        "uncertainty": 0.116,
        "n_hauls": 420
      }
    ]
  }
}
```

`series` contains every historical year plus both future scenarios for 2035 and 2050. Compare rows
from the same scenario.

## Quick local checks

```bash
curl -s http://127.0.0.1:8000/api/bot/overview
curl -s "http://127.0.0.1:8000/api/bot/hotspots?year=2050&scenario=ssp585&limit=6"
curl -s http://127.0.0.1:8000/api/bot/region/south_georgia
```

The FastAPI schema is also at `http://127.0.0.1:8000/docs` while the server is running.
