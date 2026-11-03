"""Deterministic synthetic krill data for the FishCast console demo.

There is no real data in this repository: FishCast's CSVs and climate grids are
gitignored upstream. This module fabricates a plausible, clearly-labelled sample
dataset so the console and the voice agent have something to talk about behind a
user-triggered "turn on sample data" action.

Not a forecast. FishCast's own benchmark finds no climate-only skill against a
constant baseline, so every number here is illustrative.

    python server/sample_data.py     # one-line summary
"""

from __future__ import annotations

import random
from datetime import datetime, timezone

HISTORICAL_YEARS = (1990, 2000, 2010, 2020)
FUTURE_YEARS = (2035, 2050)
YEARS = (*HISTORICAL_YEARS, *FUTURE_YEARS)
SCENARIOS = (
    {"id": "historical", "label": "Historical"},
    {"id": "ssp245", "label": "SSP2-4.5"},
    {"id": "ssp585", "label": "SSP5-8.5"},
)
CAVEAT = (
    "Synthetic demo data. FishCast's own benchmark finds no climate-only skill, "
    "so these numbers are illustrative, not a forecast."
)

# id, name, lat, lon, MPA, MPA name, 1990 density, hauls, trend multiplier, summary, ecology.
# Densities peak on the Scotia arc and the peninsula, and are lowest in the deep
# Weddell and Ross embayments, matching the broad pattern in the krill literature.
REGIONS = (
    {
        "id": "south_georgia",
        "name": "South Georgia",
        "lat": -54.5,
        "lon": -36.5,
        "mpa": True,
        "mpa_name": "South Georgia & South Sandwich Islands MPA",
        "base": 0.82,
        "hauls": 420,
        "trend": 1.25,
        "summary": "A subantarctic island on the Scotia arc, ringed by a productive "
        "shelf and the krill belt of the Antarctic Circumpolar Current.",
        "ecology": "Krill here feed mackerel icefish, macaroni penguins and Antarctic fur "
        "seals; the shelf is one of the most closely monitored krill-predator systems "
        "in the Southern Ocean.",
    },
    {
        "id": "south_sandwich",
        "name": "South Sandwich Islands",
        "lat": -57.5,
        "lon": -26.5,
        "mpa": True,
        "mpa_name": "South Georgia & South Sandwich Islands MPA",
        "base": 0.55,
        "hauls": 90,
        "trend": 1.1,
        "summary": "A volcanic arc east of South Georgia with narrow shelves and strong "
        "currents.",
        "ecology": "Seabird and penguin colonies depend on krill advected past the arc; "
        "the surrounding waters are part of the South Georgia and South Sandwich "
        "Islands MPA.",
    },
    {
        "id": "south_orkney",
        "name": "South Orkney Islands",
        "lat": -60.6,
        "lon": -45.5,
        "mpa": True,
        "mpa_name": "South Orkney Islands Southern Shelf MPA",
        "base": 0.78,
        "hauls": 260,
        "trend": 1.2,
        "summary": "A remote island group on the Scotia arc, north of the Weddell Sea.",
        "ecology": "Krill and the fish that eat them concentrate along the shelf edge; "
        "Adelie and chinstrap penguins breed here, and the southern shelf is a no-take "
        "MPA.",
    },
    {
        "id": "bransfield",
        "name": "Bransfield Strait",
        "lat": -63.5,
        "lon": -57.0,
        "mpa": False,
        "mpa_name": "(proposed Antarctic Peninsula MPA)",
        "base": 0.74,
        "hauls": 320,
        "trend": 1.3,
        "summary": "A strait between the Antarctic Peninsula and the South Shetland "
        "Islands, fed by Weddell Sea water.",
        "ecology": "A nursery for mackerel icefish and a feeding ground for penguins and "
        "humpback whales; the peninsula is among the fastest-warming places on Earth.",
    },
    {
        "id": "weddell",
        "name": "Weddell Sea",
        "lat": -65.0,
        "lon": -35.0,
        "mpa": False,
        "mpa_name": "(proposed Weddell Sea MPA)",
        "base": 0.42,
        "hauls": 150,
        "trend": 0.85,
        "summary": "A vast, cold, ice-covered sea bounded by the Antarctic continent.",
        "ecology": "Krill are patchier here, but the sea supports toothfish and seals; a "
        "large MPA has been proposed but not adopted.",
    },
    {
        "id": "lazarev",
        "name": "Lazarev Sea",
        "lat": -68.0,
        "lon": -12.0,
        "mpa": False,
        "mpa_name": None,
        "base": 0.36,
        "hauls": 80,
        "trend": 0.8,
        "summary": "An ice-covered sea east of the Weddell, along Queen Maud Land.",
        "ecology": "Sparse survey coverage; krill-eating fish and penguins use the "
        "coastal shelf, and most of what is known comes from a handful of research "
        "cruises.",
    },
    {
        "id": "riiser_larsen",
        "name": "Riiser-Larsen Sea",
        "lat": -68.5,
        "lon": 20.0,
        "mpa": False,
        "mpa_name": None,
        "base": 0.33,
        "hauls": 60,
        "trend": 0.8,
        "summary": "A poorly surveyed stretch of the East Antarctic coast.",
        "ecology": "Icefish and silverfish are the main krill predators on the shelf; "
        "data here is thin enough that model uncertainty is high.",
    },
    {
        "id": "cosmonaut",
        "name": "Cosmonaut Sea",
        "lat": -66.0,
        "lon": 40.0,
        "mpa": False,
        "mpa_name": None,
        "base": 0.38,
        "hauls": 70,
        "trend": 0.85,
        "summary": "An East Antarctic sea with a broad shelf and heavy seasonal ice.",
        "ecology": "Krill and icefish aggregate near the shelf break; the area has been "
        "surveyed only intermittently.",
    },
    {
        "id": "prydz",
        "name": "Prydz Bay",
        "lat": -67.5,
        "lon": 73.0,
        "mpa": False,
        "mpa_name": None,
        "base": 0.52,
        "hauls": 140,
        "trend": 0.9,
        "summary": "A large embayment in East Antarctica with a deep shelf and a "
        "persistent coastal polynya.",
        "ecology": "A productive polynya supports krill, icefish and Adelie penguin "
        "colonies; the shelf is one of East Antarctica's best-studied krill systems.",
    },
    {
        "id": "kerguelen",
        "name": "Kerguelen Plateau",
        "lat": -50.0,
        "lon": 72.0,
        "mpa": True,
        "mpa_name": "French Southern Territories MPA",
        "base": 0.58,
        "hauls": 180,
        "trend": 1.0,
        "summary": "A subantarctic plateau in the southern Indian Ocean, downstream of "
        "the Antarctic Circumpolar Current.",
        "ecology": "Krill and mesopelagic fish on the plateau feed penguins, seals and "
        "toothfish; much of the plateau lies inside a French MPA.",
    },
    {
        "id": "macquarie",
        "name": "Macquarie Island",
        "lat": -54.5,
        "lon": 158.9,
        "mpa": True,
        "mpa_name": "Macquarie Island Marine Park",
        "base": 0.48,
        "hauls": 110,
        "trend": 1.0,
        "summary": "A subantarctic island south of New Zealand on the Pacific-Antarctic "
        "ridge.",
        "ecology": "Krill carried by the current support royal penguins and fur seals; "
        "the island and surrounding waters are a marine park.",
    },
    {
        "id": "amundsen",
        "name": "Amundsen Sea",
        "lat": -70.0,
        "lon": -110.0,
        "mpa": False,
        "mpa_name": None,
        "base": 0.31,
        "hauls": 45,
        "trend": 1.1,
        "summary": "A remote sector of West Antarctica where warm circumpolar water "
        "reaches the ice shelves.",
        "ecology": "Krill are scarce in the open sector; the coastal shelf feeds "
        "toothfish and emperor penguins, and survey effort is very low.",
    },
    {
        "id": "ross",
        "name": "Ross Sea",
        "lat": -72.0,
        "lon": 175.0,
        "mpa": True,
        "mpa_name": "Ross Sea region MPA",
        "base": 0.34,
        "hauls": 160,
        "trend": 0.7,
        "summary": "A deep embayment of the Ross Sea, the largest relatively intact "
        "marine ecosystem left.",
        "ecology": "Krill, silverfish and toothfish support penguins, seals and whales; "
        "the Ross Sea region MPA is the world's largest marine protected area.",
    },
    {
        "id": "bellingshausen",
        "name": "Bellingshausen Sea",
        "lat": -68.8,
        "lon": -90.5,
        "mpa": False,
        "mpa_name": None,
        "base": 0.44,
        "hauls": 95,
        "trend": 1.15,
        "summary": "A West Antarctic sea east of the Amundsen, along the warming "
        "Antarctic Peninsula's western side.",
        "ecology": "Krill and icefish are patchy but important for penguins and seals; "
        "the shelf has warmed and freshened over recent decades.",
    },
)


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _r3(value: float, low: float, high: float) -> float:
    return round(_clamp(value, low, high), 3)


def _uncertainty(rng: random.Random, year: int, hauls: int) -> float:
    """Grows with projection distance, and is worse where sampling is thin."""
    base = 0.10 + 0.005 * (year - 1990)
    if hauls < 100:
        base += 0.10
    elif hauls < 160:
        base += 0.04
    return _r3(base + rng.uniform(0.0, 0.03), 0.08, 0.45)


def _series_for_region(rng: random.Random, cfg: dict) -> list[dict]:
    hist_rate = rng.uniform(0.003, 0.011) * cfg["trend"] * 1.4
    future_245 = rng.uniform(0.005, 0.012) * cfg["trend"]
    future_585 = rng.uniform(0.014, 0.028) * cfg["trend"]
    anchor = cfg["base"] * (1.0 - hist_rate) ** (2020 - 1990)

    rows: list[dict] = []

    def add(year: int, scenario: str, density: float) -> None:
        # Hotspot probability tracks density, with region-scale noise so the two
        # views are not identical.
        noise = rng.uniform(-0.05, 0.05)
        rows.append(
            {
                "year": year,
                "scenario": scenario,
                "density": _r3(density, 0.05, 0.98),
                "hotspot": _r3(0.12 + 0.85 * density + noise, 0.02, 0.99),
                "uncertainty": _uncertainty(rng, year, cfg["hauls"]),
                "n_hauls": cfg["hauls"],
            }
        )

    for year in HISTORICAL_YEARS:
        add(year, "historical", cfg["base"] * (1.0 - hist_rate) ** (year - 1990))
    for year in FUTURE_YEARS:
        add(year, "ssp245", anchor * (1.0 - future_245) ** (year - 2020))
        add(year, "ssp585", anchor * (1.0 - future_585) ** (year - 2020))
    return rows


def build_dataset(seed: int = 7) -> dict:
    """A deterministic synthetic dataset for a given seed."""
    rng = random.Random(seed)
    regions = []
    for cfg in REGIONS:
        regions.append(
            {
                "id": cfg["id"],
                "name": cfg["name"],
                "lat": cfg["lat"],
                "lon": cfg["lon"],
                "mpa": cfg["mpa"],
                "mpa_name": cfg["mpa_name"],
                "summary": cfg["summary"],
                "ecology": cfg["ecology"],
                "series": _series_for_region(rng, cfg),
            }
        )

    generated_at = (
        datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    )
    return {
        "source": "sample",
        "sample": True,
        "meta": {
            "title": "FishCast demo",
            "generated_at": generated_at,
            "seed": seed,
            "years": list(YEARS),
            "scenarios": [dict(s) for s in SCENARIOS],
            "caveat": CAVEAT,
        },
        "regions": regions,
    }


if __name__ == "__main__":
    data = build_dataset()
    rows = sum(len(r["series"]) for r in data["regions"])
    print(
        f"sample dataset: {len(data['regions'])} regions, {rows} rows "
        f"({len(data['regions'][0]['series'])} per region), "
        f"years {data['meta']['years']}, seed {data['meta']['seed']}"
    )
