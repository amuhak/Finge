import { agent } from "../voice/agent";
import { useStore } from "../store";
import { formatPct, pointFor, type Region } from "../types";
import { chanceWord, hotspotColor, krillWord, scenarioName, sureWord } from "../words";
import { HotspotBars, RegionChart } from "./Charts";
import { PipFish } from "./Pip";

function Tile({ label, value, word, tone }: { label: string; value: string; word: string; tone?: string }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <strong className="tile-value" style={tone ? { color: tone } : undefined}>
        {value}
      </strong>
      <span className="tile-word">{word}</span>
    </div>
  );
}

/** What Pip is pointing at right now, if anything. */
function PipShowing() {
  const highlight = useStore((s) => s.highlight);
  const regions = useStore((s) => s.dataset.regions);
  const setHighlight = useStore((s) => s.setHighlight);
  if (!highlight) return null;

  let title = "";
  let body = null;
  if (highlight.kind === "hotspots") {
    title = `Top krill hotspots in ${highlight.year}`;
    body = <HotspotBars ids={highlight.ids} year={highlight.year} />;
  } else {
    const region = regions.find((r) => r.id === highlight.id);
    if (!region) return null;
    title =
      highlight.kind === "compare"
        ? `${region.name}: ${highlight.years[0]} vs ${highlight.years[1]}`
        : `${region.name} in ${highlight.years[0]}`;
    body = <RegionChart region={region} marks={highlight.years} />;
  }

  return (
    <section className="showing" aria-live="polite">
      <header>
        <PipFish size={44} mood="speaking" />
        <div>
          <span className="eyebrow">Pip is showing you</span>
          <h3>{title}</h3>
        </div>
        <button className="icon" onClick={() => setHighlight(null)} aria-label="Hide Pip's chart">
          ✕
        </button>
      </header>
      {body}
    </section>
  );
}

function Overview() {
  const regions = useStore((s) => s.dataset.regions);
  const year = useStore((s) => s.year);
  const scenario = useStore((s) => s.scenario);
  const highlight = useStore((s) => s.highlight);
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
      <PipShowing />
      <h2>Where are the krill?</h2>
      <p className="lede">
        Each coloured patch of sea is one region. The number is the chance it's a krill hotspot in <b>{year}</b>. Tap a
        patch for its story, or drag and scroll the map to explore.
      </p>
      {highlight?.kind !== "hotspots" && (
        <>
          <div className="section-label">Top 3 right now</div>
          <ol className="toplist">
            {top.map(({ region, point }, index) => (
              <li key={region.id}>
                <button
                  onClick={() => {
                    select(region.id);
                    focusOn(region.id);
                  }}
                >
                  <span className="rank" style={{ background: hotspotColor(point?.hotspot ?? 0) }}>
                    {index + 1}
                  </span>
                  <span className="top-name">
                    {region.name}
                    <small>
                      {chanceWord(point?.hotspot ?? 0)} · {sureWord(point?.uncertainty ?? 0).toLowerCase()}
                    </small>
                  </span>
                  <span className="top-val">{formatPct(point?.hotspot ?? 0)}</span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
      <button className="btn primary wide" onClick={() => void agent.ask("Where are the krill hotspots right now?")}>
        Ask Pip where the krill are
      </button>
      {caveat && (
        <p className={`note ${sample ? "sample" : ""}`}>
          <b>{sample ? "Sample data." : "Note."}</b> {caveat}
        </p>
      )}
    </div>
  );
}

function Detail({ region }: { region: Region }) {
  const year = useStore((s) => s.year);
  const scenario = useStore((s) => s.scenario);
  const sample = useStore((s) => s.dataset.sample);
  const highlight = useStore((s) => s.highlight);
  const point = pointFor(region, year, scenario);
  if (!point) return null;
  const pipHere = highlight && highlight.kind !== "hotspots" && highlight.id === region.id;

  return (
    <div className="panel-body">
      {pipHere && <PipShowing />}
      <div className="region-head">
        <h2>{region.name}</h2>
        <span className={`tag ${region.mpa ? "mpa" : region.mpa_name ? "proposed" : "none"}`}>
          {region.mpa ? "Protected area" : region.mpa_name ? "Proposed protection" : "Not protected"}
        </span>
      </div>
      <p className="when">
        {year} · {scenarioName(year, scenario)}
      </p>

      <div className="tiles">
        <Tile label="Hotspot chance" value={formatPct(point.hotspot)} word={chanceWord(point.hotspot)} />
        <Tile label="Krill" value={formatPct(point.density)} word={krillWord(point.density)} />
        <Tile label="Model" value={`±${Math.round(point.uncertainty * 50)}`} word={sureWord(point.uncertainty)} />
      </div>

      {!pipHere && (
        <>
          <div className="section-label">Over time · tap a year</div>
          <RegionChart region={region} marks={[]} />
        </>
      )}

      <p className="lede">{region.summary}</p>
      <p className="ecology">{region.ecology}</p>

      <button
        className="btn primary wide"
        onClick={() => void agent.ask(`What does this mean for ${region.name} and the fish that live there?`)}
      >
        Ask Pip about {region.name}
      </button>
      {sample && <p className="note sample">Made-up demo numbers, not a forecast.</p>}
    </div>
  );
}

export function RegionPanel() {
  const regions = useStore((s) => s.dataset.regions);
  const selected = useStore((s) => s.selected);
  const region = regions.find((item) => item.id === selected);
  return region ? <Detail region={region} /> : <Overview />;
}
