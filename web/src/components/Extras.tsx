import { geoPath } from "d3-geo";
import { useEffect, useState } from "react";
import { useStore } from "../store";
import { HIGH_UNCERTAINTY, formatPct, pointFor, type Region } from "../types";
import { hotspotColor } from "../words";
import { LAND_GEO, globeProjection } from "./WorldMap";

function change(region: Region, scenario: "ssp245" | "ssp585", from = 2020, to = 2050) {
  const a = pointFor(region, from, scenario);
  const b = pointFor(region, to, scenario);
  return a && b ? b.hotspot - a.hotspot : 0;
}

/** Warnings computed from the loaded numbers. */
export function Warnings() {
  const regions = useStore((s) => s.dataset.regions);
  const scenario = useStore((s) => s.scenario);
  const sample = useStore((s) => s.dataset.sample);
  const drops = regions.filter((r) => change(r, scenario) <= -0.1);
  const unsure2050 = regions.filter((r) => (pointFor(r, 2050, scenario)?.uncertainty ?? 0) >= HIGH_UNCERTAINTY);
  const thin = regions.filter((r) => (r.series[0]?.n_hauls ?? 0) < 150);
  const mpaDrop = regions.filter((r) => r.mpa).map((r) => change(r, scenario));
  const mpaAvg = mpaDrop.length ? mpaDrop.reduce((a, b) => a + b, 0) / mpaDrop.length : 0;
  const items = [
    drops.length > 0 && { tone: "red", text: `${drops.length} of ${regions.length} regions lose 10+ points of hotspot chance by 2050.` },
    mpaDrop.length > 0 && {
      tone: mpaAvg < 0 ? "red" : "green",
      text: `Protected areas ${mpaAvg < 0 ? "lose" : "gain"} ${Math.abs(Math.round(mpaAvg * 100))} points on average by 2050.`,
    },
    unsure2050.length > 0 && { tone: "amber", text: `The model is very unsure about ${unsure2050.length} regions in 2050.` },
    thin.length > 0 && { tone: "amber", text: `Thin data: ${thin.map((r) => r.name).join(", ")} have under 150 net hauls behind them.` },
    sample && { tone: "amber", text: "All numbers here are made-up sample data." },
  ].filter(Boolean) as { tone: string; text: string }[];
  return (
    <ul className="warnings">
      {items.map((w) => (
        <li key={w.text} className={w.tone}>
          <span aria-hidden="true">{w.tone === "green" ? "✓" : "⚠"}</span> {w.text}
        </li>
      ))}
    </ul>
  );
}

/** Winners and losers: change in hotspot chance, 2020 → 2050, as a diverging bar chart. */
export function ChangeBars() {
  const regions = useStore((s) => s.dataset.regions);
  const scenario = useStore((s) => s.scenario);
  const select = useStore((s) => s.select);
  const focusOn = useStore((s) => s.focusOn);
  const rows = regions.map((r) => ({ r, d: change(r, scenario) })).sort((a, b) => a.d - b.d);
  const max = Math.max(0.05, ...rows.map((x) => Math.abs(x.d)));
  return (
    <div className="change">
      {rows.map(({ r, d }) => (
        <button
          key={r.id}
          className="change-row"
          onClick={() => {
            select(r.id);
            focusOn(r.id);
          }}
        >
          <span className="change-name">{r.name}</span>
          <span className="change-track">
            <span
              className={`change-bar ${d < 0 ? "down" : "up"}`}
              style={{ width: `${(Math.abs(d) / max) * 50}%`, [d < 0 ? "right" : "left"]: "50%" }}
            />
          </span>
          <span className={`change-val ${d < 0 ? "down" : "up"}`}>
            {d > 0 ? "+" : ""}
            {Math.round(d * 100)}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Ocean-wide average hotspot chance, both scenarios, as one small chart. */
export function OceanTrend() {
  const regions = useStore((s) => s.dataset.regions);
  const years = useStore((s) => s.dataset.meta?.years) ?? [1990, 2000, 2010, 2020, 2035, 2050];
  const avg = (year: number, sc: "ssp245" | "ssp585") =>
    regions.reduce((sum, r) => sum + (pointFor(r, year, sc)?.hotspot ?? 0), 0) / Math.max(1, regions.length);
  const W = 340;
  const H = 120;
  const x = (y: number) => 30 + ((y - years[0]) / (years.at(-1)! - years[0])) * (W - 44);
  const y = (v: number) => 12 + (1 - v) * (H - 34);
  const line = (sc: "ssp245" | "ssp585") => years.map((yr, i) => `${i ? "L" : "M"}${x(yr)},${y(avg(yr, sc))}`).join(" ");
  const last = avg(years.at(-1)!, "ssp585");
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ocean-wide average hotspot chance over time">
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line x1={30} x2={W - 14} y1={y(v)} y2={y(v)} className="chart-grid" />
            <text x={24} y={y(v) + 4} textAnchor="end" className="chart-axis">
              {v * 100}%
            </text>
          </g>
        ))}
        <path d={line("ssp245")} className="chart-density" />
        <path d={line("ssp585")} className="chart-hotspot" />
        {years.map((yr) => (
          <text key={yr} x={x(yr)} y={H - 4} textAnchor="middle" className="chart-axis">
            {yr}
          </text>
        ))}
        <circle cx={x(years.at(-1)!)} cy={y(last)} r={6} fill={hotspotColor(last)} className="chart-mark-dot" />
      </svg>
      <figcaption>
        <span className="key hot" /> high-emissions <span className="key dens" /> middle-road · average of all regions
      </figcaption>
    </figure>
  );
}

const LINKS = [
  {
    to: [-38, -15] as [number, number],
    place: "Brazil & West Africa coasts",
    icon: "🐋",
    title: "Whale nurseries",
    body: "Humpback whales fatten on krill in summer, then swim to warm coasts to give birth. Fewer krill can mean thinner mothers and fewer calves far from Antarctica.",
  },
  {
    to: [152, -22] as [number, number],
    place: "Eastern Australia",
    icon: "🐋",
    title: "Whale-watching towns",
    body: "The humpbacks seen off Australia each winter fed in the Southern Ocean. Local tourism depends on krill thousands of kilometres away.",
  },
  {
    to: [10, 62] as [number, number],
    place: "Norway, China, South Korea, Chile",
    icon: "🚢",
    title: "Krill fishing fleets",
    body: "Krill is caught mostly near the Antarctic Peninsula and turned into fish-farm feed, pet food and omega-3 pills sold worldwide.",
  },
  {
    to: [-160, 20] as [number, number],
    place: "The whole planet",
    icon: "🌡️",
    title: "Climate",
    body: "Krill droppings sink carbon into the deep ocean. Fewer krill could weaken that natural carbon sink, which affects everyone.",
  },
  {
    to: [-70, -40] as [number, number],
    place: "South America & sub-Antarctic islands",
    icon: "🐧",
    title: "Penguins, seals & seabirds",
    body: "Albatrosses, fur seals and penguins that roam the southern oceans all lead back to krill. Their colonies feel shortages first.",
  },
];

/** "What does this mean for the rest of the world?" — a spinning mini-globe with the links drawn on it. */
export function WorldPopup({ onClose }: { onClose: () => void }) {
  const regions = useStore((s) => s.dataset.regions);
  const scenario = useStore((s) => s.scenario);
  const selected = useStore((s) => s.selected);
  const region = regions.find((r) => r.id === selected);
  const [lon, setLon] = useState(0);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      setLon((v) => v + (now - last) * 0.015);
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const from: [number, number] = region ? [region.lon, region.lat] : [-45, -62];
  const proj = globeProjection({ rot: [lon, 25], zoom: 0.95 });
  const path = geoPath(proj);
  const avgDelta = regions.length ? regions.reduce((s, r) => s + change(r, scenario), 0) / regions.length : 0;
  const d = region ? change(region, scenario) : avgDelta;

  return (
    <div className="modal-back" onClick={onClose}>
      <section className="modal" role="dialog" aria-modal="true" aria-label="What this means for the rest of the world" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow">Ripple effects</span>
            <h2>What does this mean for the rest of the world?</h2>
          </div>
          <button className="icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <p className="lede">
          {region ? region.name : "Across the Southern Ocean"}, hotspot chance {d < 0 ? "falls" : "rises"} by{" "}
          <b className={d < 0 ? "down" : "up"}>{Math.abs(Math.round(d * 100))} points</b> from 2020 to 2050 in the{" "}
          {scenario === "ssp585" ? "high-emissions" : "middle-road"} scenario. Krill feed animals and people far beyond
          Antarctica:
        </p>
        <div className="modal-grid">
          <svg viewBox="0 0 1000 1000" className="mini-globe" role="img" aria-label="Globe with lines from the Southern Ocean to the places that depend on krill">
            <path d={path({ type: "Sphere" }) ?? ""} className="sea" />
            <path d={path(LAND_GEO) ?? ""} className="land" />
            {LINKS.map((l, i) => (
              <path
                key={l.title}
                d={path({ type: "LineString", coordinates: [from, l.to] }) ?? ""}
                className={`arc ${i === active ? "on" : ""}`}
              />
            ))}
            {LINKS.map((l, i) => {
              const xy = proj(l.to);
              const visible = path({ type: "Point", coordinates: l.to });
              return xy && visible ? (
                <text key={l.title} x={xy[0]} y={xy[1]} className={`arc-icon ${i === active ? "on" : ""}`} textAnchor="middle">
                  {l.icon}
                </text>
              ) : null;
            })}
            {path({ type: "Point", coordinates: from }) && (
              <circle cx={proj(from)?.[0]} cy={proj(from)?.[1]} r={16} className="arc-home" />
            )}
          </svg>
          <ul className="links">
            {LINKS.map((l, i) => (
              <li key={l.title}>
                <button className={i === active ? "on" : ""} onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onClick={() => setActive(i)}>
                  <span className="link-icon">{l.icon}</span>
                  <span>
                    <b>{l.title}</b> <small>{l.place}</small>
                    <span className="link-body">{l.body}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <p className="note sample">These are general food-web links, not predictions. The krill numbers here are sample data.</p>
      </section>
    </div>
  );
}
