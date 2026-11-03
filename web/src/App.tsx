import { useEffect } from "react";
import { RegionPanel } from "./components/RegionPanel";
import { Timeline } from "./components/Timeline";
import { VoicePanel } from "./components/VoicePanel";
import { WorldMap } from "./components/WorldMap";
import { useStore } from "./store";
import { agent } from "./voice/agent";
import { PipFish } from "./components/Pip";
import { HOTSPOT_STEPS } from "./words";

function Legend() {
  return (
    <div className="legend" aria-label="Map key">
      <span className="legend-title">Hotspot chance</span>
      {HOTSPOT_STEPS.map((step) => (
        <span key={step.min} className="legend-step">
          <i style={{ background: step.color }} /> {step.label}
        </span>
      ))}
      <span className="legend-step">
        <i className="hatch" /> very unsure
      </span>
      <span className="legend-step">
        <i className="mpa" /> protected
      </span>
    </div>
  );
}

/** Pip waving from the corner of the map; shows the last thing Pip said. */
function PipBuddy() {
  const voiceOpen = useStore((s) => s.voiceOpen);
  const status = useStore((s) => s.voiceStatus);
  const log = useStore((s) => s.voiceLog);
  const last = [...log].reverse().find((line) => line.kind === "agent")?.text;
  const say = voiceOpen ? (last ?? "Listening…") : "Hi! I'm Pip. Tap me to ask about krill.";
  return (
    <button
      className={`buddy ${voiceOpen ? "live" : ""}`}
      onClick={() => (voiceOpen ? undefined : void agent.start())}
      aria-label={voiceOpen ? "Pip is on" : "Start talking to Pip"}
    >
      <span className="buddy-say">{say.length > 140 ? `${say.slice(0, 140)}…` : say}</span>
      <PipFish size={92} mood={voiceOpen ? status : "idle"} />
    </button>
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
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);

  useEffect(() => {
    void load("auto");
  }, [load]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0a1823" : "#f3f8fb");
  }, [theme]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      select(null);
      focusOn(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select, focusOn]);

  const empty = dataset.regions.length === 0;
  const sample = dataset.sample;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <PipFish size={54} />
          <div>
            <h1>FishCast</h1>
            <p>Krill around Antarctica, explained by Pip the icefish</p>
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
              Whole ocean
            </button>
          )}
          <button
            className={`btn voice ${voiceOpen ? "on" : ""}`}
            onClick={() => (voiceOpen ? agent.stop() : void agent.start())}
            title={voiceOpen ? "End the voice session" : "Starts Pip and asks for microphone access"}
            aria-pressed={voiceOpen}
          >
            <span className={`dot ${voiceStatus}`} aria-hidden="true" />
            {voiceOpen ? "End Pip" : "Ask Pip (mic)"}
          </button>
          <button
            className="icon theme-toggle"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-pressed={theme === "dark"}
          >
            <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
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
              <PipBuddy />
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
