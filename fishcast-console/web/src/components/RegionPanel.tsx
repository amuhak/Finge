import { agent } from "../voice/agent";
import { useStore } from "../store";
import { confidenceLabel, formatPct, pointFor, seriesFor, type Region } from "../types";

function Spark({ region }: { region: Region }) {
  const year = useStore((s) => s.year);
  const scenario = useStore((s) => s.scenario);
  const points = seriesFor(region, scenario).slice().sort((a, b) => a.year - b.year);
  const minYear = points[0]?.year ?? 1990;
  const maxYear = points.at(-1)?.year ?? 2050;
  const w = 264;
  const h = 62;
  const pad = 5;
  const x = (value: number) => pad + ((value - minYear) / Math.max(1, maxYear - minYear)) * (w - 2 * pad);
  const y = (value: number) => h - pad - value * (h - 2 * pad);
  const line = points.map((p, index) => `${index ? "L" : "M"}${x(p.year).toFixed(1)},${y(p.density).toFixed(1)}`).join(" ");
  const current = pointFor(region, year, scenario);

  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Krill density trend for ${region.name}`}>
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} className="spark-axis" />
      <path d={line} className="spark-line" />
      {current && (
        <circle cx={x(current.year)} cy={y(current.density)} r={3} className="spark-dot" />
      )}
      <text x={pad} y={h - 14} className="spark-text">
        {minYear}
      </text>
      <text x={w - pad} y={h - 14} textAnchor="end" className="spark-text">
        {maxYear}
      </text>
    </svg>
  );
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="metric">
      <div className="metric-head">
        <span>{label}</span>
        <strong>{formatPct(value)}</strong>
      </div>
      <div className="bar">
        <span style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <div className="metric-detail">{detail}</div>
    </div>
  );
}

function Overview() {
  const regions = useStore((s) => s.dataset.regions);
  const year = useStore((s) => s.year);
  const scenario = useStore((s) => s.scenario);
  const caveat = useStore((s) => s.dataset.meta?.caveat);
  const sample = useStore((s) => s.dataset.sample);
  const select = useStore((s) => s.select);
  const focusOn = useStore((s) => s.focusOn);

  const top = [...regions]
    .map((region) => ({ region, point: pointFor(region, year, scenario) }))
    .sort((a, b) => (b.point?.hotspot ?? 0) - (a.point?.hotspot ?? 0))
    .slice(0, 3);

  return (
    <div className="panel-body">
      <h2>The Southern Ocean</h2>
      <p className="lede">
        Click a region to inspect it, or ask Pip out loud. Every mark is a modelled krill hotspot, not a count.
      </p>
      <div className="section-label">Top hotspots · {year}</div>
      <ol className="hotlist">
        {top.map(({ region, point }) => (
          <li key={region.id}>
            <button
              className="hotrow"
              onClick={() => {
                select(region.id);
                focusOn(region.id);
              }}
            >
              <span className="hotname">{region.name}</span>
              <span className="hotval">{formatPct(point?.hotspot ?? 0)}</span>
            </button>
          </li>
        ))}
      </ol>
      {caveat && (
        <div className={`caveat ${sample ? "sample" : ""}`}>
          <strong>{sample ? "Sample data" : "Data note"}</strong>
          <span>{caveat}</span>
        </div>
      )}
      <button className="btn primary wide" onClick={() => void agent.start()}>
        Ask Pip what this means
      </button>
    </div>
  );
}

export function RegionPanel() {
  const regions = useStore((s) => s.dataset.regions);
  const selected = useStore((s) => s.selected);
  const year = useStore((s) => s.year);
  const scenario = useStore((s) => s.scenario);
  const sample = useStore((s) => s.dataset.sample);
  const region = regions.find((item) => item.id === selected);

  if (!region) return <Overview />;

  const point = pointFor(region, year, scenario);
  if (!point) return <Overview />;

  const mpaTag = region.mpa ? (
    <span className="tag mpa">{region.mpa_name ?? "Marine protected area"}</span>
  ) : region.mpa_name ? (
    <span className="tag proposed">{region.mpa_name}</span>
  ) : (
    <span className="tag none">No MPA</span>
  );

  return (
    <div className="panel-body">
      <div className="region-head">
        <h2>{region.name}</h2>
        <span className="coords">
          {Math.abs(region.lat).toFixed(1)}°S · {Math.abs(region.lon).toFixed(1)}°{region.lon < 0 ? "W" : "E"}
        </span>
      </div>
      {mpaTag}

      <div className="metrics">
        <Metric label="Krill density" value={point.density} detail="relative index, not a count" />
        <Metric label="Hotspot probability" value={point.hotspot} detail={`${year} · ${year > 2020 ? scenario : "historical"}`} />
        <Metric
          label="Model uncertainty"
          value={point.uncertainty}
          detail={`${confidenceLabel(point.uncertainty)} · ${point.n_hauls} historical hauls`}
        />
      </div>

      <div className="section-label">Krill density, 1990 → 2050</div>
      <Spark region={region} />

      <p className="lede">{region.summary}</p>
      <div className="ecology">{region.ecology}</div>

      <button
        className="btn primary wide"
        onClick={() => void agent.ask(`What does this mean for ${region.name} and the fish that live there?`)}
      >
        What does this mean?
      </button>
      <p className="hint">Pip answers from the loaded data and says when it is guessing.</p>

      {sample && <div className="caveat sample">Synthetic numbers for the demo, not a forecast.</div>}
    </div>
  );
}
