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
      <div
        className={`scenarios ${future ? "" : "muted"}`}
        title={future ? "Projection scenario" : "Scenarios apply to 2035 and 2050 only"}
      >
        <span className="section-label">Scenario</span>
        <button
          className={`chip ${scenario === "ssp245" && future ? "on" : ""}`}
          disabled={!future}
          onClick={() => setScenario("ssp245")}
          title={future ? "Projection under SSP2-4.5" : "Scenarios only apply to 2035 and 2050"}
        >
          SSP2-4.5
        </button>
        <button
          className={`chip ${scenario === "ssp585" && future ? "on" : ""}`}
          disabled={!future}
          onClick={() => setScenario("ssp585")}
          title={future ? "Projection under SSP5-8.5" : "Scenarios only apply to 2035 and 2050"}
        >
          SSP5-8.5
        </button>
        <span className="timeline-note" title="Scenarios apply to 2035 and 2050 only">
          {future ? "scenario, not a forecast" : "scenarios apply to 2035–2050"}
        </span>
      </div>
    </div>
  );
}
