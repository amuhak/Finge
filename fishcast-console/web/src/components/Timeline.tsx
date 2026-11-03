import { useStore } from "../store";
import { DEFAULT_YEARS } from "../types";

export function Timeline() {
  const years = useStore((s) => s.dataset.meta?.years) ?? DEFAULT_YEARS;
  const year = useStore((s) => s.year);
  const scenario = useStore((s) => s.scenario);
  const setYear = useStore((s) => s.setYear);
  const setScenario = useStore((s) => s.setScenario);
  const future = year > 2020;

  return (
    <div className="timeline">
      <div className="years">
        {years.map((value) => (
          <button key={value} className={`year ${value === year ? "on" : ""}`} onClick={() => setYear(value)}>
            {value}
          </button>
        ))}
      </div>
      <div className={`scenarios ${future ? "" : "muted"}`}>
        <span className="section-label">Scenario</span>
        <button
          className={`chip ${scenario === "ssp245" && future ? "on" : ""}`}
          disabled={!future}
          onClick={() => setScenario("ssp245")}
        >
          SSP2-4.5
        </button>
        <button
          className={`chip ${scenario === "ssp585" && future ? "on" : ""}`}
          disabled={!future}
          onClick={() => setScenario("ssp585")}
        >
          SSP5-8.5
        </button>
        <span className="timeline-note">{future ? "scenario, not a forecast" : "observed-era years"}</span>
      </div>
    </div>
  );
}
