import { useEffect } from "react";
import { RegionPanel } from "./components/RegionPanel";
import { Timeline } from "./components/Timeline";
import { VoicePanel } from "./components/VoicePanel";
import { WorldMap } from "./components/WorldMap";
import { useStore } from "./store";
import { agent } from "./voice/agent";

function Legend() {
  return (
    <div className="legend">
      <span>
        <i className="swatch heat" /> hotspot probability
      </span>
      <span>
        <i className="swatch ring" /> MPA
      </span>
      <span>
        <i className="swatch dashed" /> high uncertainty
      </span>
      <span className="legend-note">size = krill density</span>
    </div>
  );
}

export default function App() {
  const load = useStore((s) => s.load);
  const dataset = useStore((s) => s.dataset);
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);
  const voiceOpen = useStore((s) => s.voiceOpen);
  const voiceStatus = useStore((s) => s.voiceStatus);
  const focusOn = useStore((s) => s.focusOn);
  const select = useStore((s) => s.select);

  useEffect(() => {
    void load("auto");
  }, [load]);

  const empty = dataset.regions.length === 0;
  const sample = dataset.sample;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="mark">◈</span>
          <div>
            <h1>FishCast</h1>
            <p>Antarctic krill · Southern Ocean · ask Pip</p>
          </div>
        </div>
        <div className="top-actions">
          {sample && <span className="pill">sample data</span>}
          {!empty && (
            <button
              className="btn ghost"
              onClick={() => {
                select(null);
                focusOn(null);
              }}
            >
              World
            </button>
          )}
          <button
            className={`btn voice ${voiceOpen ? "on" : ""}`}
            onClick={() => (voiceOpen ? agent.stop() : void agent.start())}
          >
            <span className={`dot ${voiceStatus}`} />
            {voiceOpen ? "End Pip" : "Ask Pip"}
          </button>
        </div>
      </header>

      {sample && (
        <div className="strip">
          Synthetic sample data · FishCast's own benchmark finds no climate-only skill · treat 2035–2050 as scenarios
        </div>
      )}

      {error && (
        <div className="strip error">
          {error}
          <button className="link" onClick={() => void load("auto")}>
            retry
          </button>
        </div>
      )}

      {empty ? (
        <main className="empty">
          <div className="empty-card">
            <span className="eyebrow">No dataset loaded</span>
            <h2>The krill are off-screen</h2>
            <p>
              FishCast's real CSVs and checkpoints are gitignored upstream, so this console starts empty. Turn on sample data
              to explore the map and talk to Pip.
            </p>
            <button className="btn primary" disabled={loading} onClick={() => void load("sample")}>
              {loading ? "Loading…" : "Turn on sample data"}
            </button>
            <p className="hint">
              Or drop a dataset at <code>data/dataset.json</code> and restart the server.
            </p>
          </div>
        </main>
      ) : (
        <>
          <main className="stage">
            <div className="map-wrap">
              <WorldMap />
              <Legend />
            </div>
            <aside className="side">
              <RegionPanel />
            </aside>
          </main>
          <Timeline />
        </>
      )}

      {voiceOpen && <VoicePanel />}
    </div>
  );
}
