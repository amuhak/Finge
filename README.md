# Finge
An independent research companion to [FishCast](https://github.com/gt-big-data/fish-cast). Finge reads exported artifacts; it does not copy or retrain FishCast models.

## Run locally
Requires Python 3.11+. No dependency installation or frontend build needed.

```powershell
python server.py
```

Open http://127.0.0.1:8000. The first workspace contains explicitly **synthetic** example results, not FishCast findings.

## Connect the Grok API
Set environment variables in the terminal running the server:

```powershell
$env:XAI_API_KEY = "<your key>"
$env:XAI_MODEL = "grok-4.7"
python server.py
```

Use a model available to your xAI account; XAI_MODEL is configurable. On macOS/Linux use export instead. Keys stay on the server and are never returned to the browser. The connection badge indicates key configuration, not a verified API call. A live account, credits and internet access are needed. API requests can incur charges. No automatic calls occur: only Ask Grok sends your question and the normalized current workspace to xAI. Imports and export work without an API key. Environment files are ignored but not automatically loaded.

## What works
- Import up to 20 FishCast benchmark CSV or run metrics JSON files in one batch. Each import replaces the workspace.
- Compare RMSE skill and reported bootstrap intervals; filter climate-only versus recent-krill tracks and search models.
- Inspect exact source references and SHA-256 fingerprints.
- Ask the Grok API to interpret supplied evidence.
- Export a deterministic Markdown research brief with evidence and a proposed next experiment.

No data is stored on the server. Refreshing resets the workspace. The service binds to loopback only and is intended for a local hackathon demo; hosted multi-user deployment is outside this version.

## FishCast artifact contract
For benchmark CSV, required columns are model and test_rmse. Supported optional columns: track (climate, nowcast, baseline), skill_vs_constant, skill_ci_low, skill_ci_high, roc_auc, pr_auc. Skill values are fractions, not percentages. Bounds must both be supplied or both omitted. Scores must be finite; AUC must lie in [0, 1].

For metrics JSON, required field test_metrics.rmse is the held-out test error. Supports test_metrics.rmse_skill_vs_constant, roc_auc, pr_auc, model_name, and config.model_type. Known FishCast model keys determine the track; explicit config.include_lag_features=true forces nowcast. Unknown models stay unknown. No intervals are invented from a single run. Validation-only JSON is rejected. Run files and their ensemble rows may overlap; Finge does not treat them as independent replicates.

Files from different runs may have different datasets, targets, splits or baselines. Finge displays imported metrics and cannot establish their comparability from the benchmark CSV alone. The highest reported skill card is not an endorsement of a universally best model. Climate projections cannot be validated by nowcast scores. FishCast's data version and preprocessing fixes must be checked upstream.

## Hackathon workflow
See [docs/AGENT_WORKFLOW.md](docs/AGENT_WORKFLOW.md) for actual Cursor and GrokBot tasks. The in-app assistant is the Grok API, not GrokBot. This initial implementation was authored with Codex; Cursor and GrokBot use is still to be performed and evidenced in those products.

## Verification
```powershell
python -m unittest discover -s tests -v
node --check web/app.js
```

Python tests cover artifact compatibility, malformed imports, missing metrics, uncertainty interpretation and HTTP/Grok error handling. Browser QA should verify filtering, inspection, file imports and brief download.

## Structure
- finge/analysis.py: standalone artifact adapters and deterministic brief generation
- server.py: local HTTP service and server-side Grok API connection
- web/: buildless accessible dashboard
- samples/: synthetic artifacts
- tests/: parser, analysis and HTTP regression checks

## Sources and relationship
FishCast output conventions were inspected at commit b80a813556ee412e522e956a7ac76a4e1b68c873, particularly scripts/benchmark_skill.py. No FishCast or Tideline source code or datasets are copied here. Tideline inspired the dashboard-and-assistant interaction pattern only. Finge does not provide biological observations, krill forecasts or verified conservation advice of its own.
