import { useStore } from "../store";
import { formatPct, pointFor, seriesFor, type Region } from "../types";
import { hotspotColor } from "../words";

const W = 360;
const H = 210;
const L = 34;
const R = 14;
const T = 30;
const B = 30;

/**
 * Hotspot chance (thick line, with its uncertainty as a flat band) and krill density (thin line)
 * across the years. `marks` are the years Pip is talking about; they get big labels.
 */
export function RegionChart({ region, marks }: { region: Region; marks: number[] }) {
  const scenario = useStore((s) => s.scenario);
  const year = useStore((s) => s.year);
  const setYear = useStore((s) => s.setYear);
  const points = seriesFor(region, scenario).slice().sort((a, b) => a.year - b.year);
  if (points.length < 2) return null;

  const minYear = points[0].year;
  const maxYear = points.at(-1)!.year;
  const x = (v: number) => L + ((v - minYear) / Math.max(1, maxYear - minYear)) * (W - L - R);
  const y = (v: number) => T + (1 - Math.max(0, Math.min(1, v))) * (H - T - B);
  const line = (key: "hotspot" | "density") =>
    points.map((p, i) => `${i ? "L" : "M"}${x(p.year).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
  const band =
    points.map((p, i) => `${i ? "L" : "M"}${x(p.year).toFixed(1)},${y(p.hotspot + p.uncertainty / 2).toFixed(1)}`).join(" ") +
    " " +
    points
      .slice()
      .reverse()
      .map((p) => `L${x(p.year).toFixed(1)},${y(p.hotspot - p.uncertainty / 2).toFixed(1)}`)
      .join(" ") +
    " Z";

  const shown = marks.length ? marks : [year];
  const marked = shown
    .map((v) => pointFor(region, v, scenario))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const delta = marked.length === 2 ? marked[1].hotspot - marked[0].hotspot : null;

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Hotspot chance and krill density for ${region.name}`}>
        {x(2020) < W - R && (
          <g>
            <rect x={x(2020)} y={T - 6} width={W - R - x(2020)} height={H - T - B + 6} className="chart-future" />
            <text x={x(2020) + 6} y={T + 8} className="chart-tag">
              scenarios
            </text>
          </g>
        )}
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="chart-grid" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" className="chart-axis">
              {v * 100}%
            </text>
          </g>
        ))}
        <path d={band} className="chart-band" />
        <path d={line("density")} className="chart-density" />
        <path d={line("hotspot")} className="chart-hotspot" />
        {points.map((p) => (
          <g key={p.year} className="chart-year" onClick={() => setYear(p.year)}>
            <rect x={x(p.year) - 16} y={T} width={32} height={H - T} fill="transparent" />
            <circle cx={x(p.year)} cy={y(p.hotspot)} r={3.5} className="chart-dot" />
            <text x={x(p.year)} y={H - 10} textAnchor="middle" className={`chart-axis ${p.year === year ? "on" : ""}`}>
              {p.year}
            </text>
          </g>
        ))}
        {marked.length === 2 && (
          <line
            x1={x(marked[0].year)}
            y1={y(marked[0].hotspot)}
            x2={x(marked[1].year)}
            y2={y(marked[1].hotspot)}
            className="chart-compare"
          />
        )}
        {marked.map((p) => {
          const cx = x(p.year);
          const cy = y(p.hotspot);
          const above = cy > T + 40;
          const bx = Math.min(W - R - 30, Math.max(L + 30, cx));
          return (
            <g key={`m-${p.year}`} className="chart-mark">
              <circle cx={cx} cy={cy} r={8} style={{ fill: hotspotColor(p.hotspot) }} className="chart-mark-dot" />
              <rect x={bx - 30} y={above ? cy - 40 : cy + 12} width={60} height={26} rx={13} className="chart-bubble" />
              <text x={bx} y={above ? cy - 22 : cy + 30} textAnchor="middle" className="chart-bubble-text">
                {formatPct(p.hotspot)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption>
        <span className="key hot" /> hotspot chance
        <span className="key band" /> how unsure
        <span className="key dens" /> krill density
        {delta !== null && (
          <strong className={`delta ${delta < 0 ? "down" : "up"}`}>
            {delta < 0 ? "▼" : "▲"} {Math.abs(Math.round(delta * 100))} pts, {marked[0].year} → {marked[1].year}
          </strong>
        )}
      </figcaption>
    </figure>
  );
}

/** Pip's ranking as big flat bars. */
export function HotspotBars({ ids, year }: { ids: string[]; year: number }) {
  const regions = useStore((s) => s.dataset.regions);
  const scenario = useStore((s) => s.scenario);
  const select = useStore((s) => s.select);
  const focusOn = useStore((s) => s.focusOn);
  const rows = ids
    .map((id) => regions.find((r) => r.id === id))
    .filter((r): r is Region => Boolean(r))
    .map((region) => ({ region, point: pointFor(region, year, scenario) }));

  return (
    <ol className="bars">
      {rows.map(({ region, point }, index) => (
        <li key={region.id}>
          <button
            onClick={() => {
              select(region.id);
              focusOn(region.id);
            }}
          >
            <span className="bars-name">
              <b>{index + 1}</b> {region.name}
            </span>
            <span className="bars-track">
              <span
                className="bars-fill"
                style={{ width: `${Math.round((point?.hotspot ?? 0) * 100)}%`, background: hotspotColor(point?.hotspot ?? 0) }}
              />
            </span>
            <span className="bars-val">{formatPct(point?.hotspot ?? 0)}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
