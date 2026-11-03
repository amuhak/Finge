"""Strict adapters for FishCast benchmark CSV and metrics JSON. No model training."""
import csv
import hashlib
import io
import json
import math


def number(value, label, optional=True):
    if value is None or value == "":
        if optional:
            return None
        raise ValueError(f"Missing {label}")
    try:
        result = float(value)
    except (ValueError, TypeError):
        raise ValueError(f"Invalid number for {label}") from None
    if not math.isfinite(result):
        raise ValueError(f"{label} must be finite")
    return result


def normalize(row, source, index):
    name = row.get("model")
    if not isinstance(name, str) or not name.strip():
        raise ValueError(f"{source}: row {index} needs a model name")
    rmse = number(row.get("test_rmse"), "test_rmse", False)
    if rmse < 0:
        raise ValueError("test_rmse cannot be negative")
    track = row.get("track", "unknown")
    if track not in ("climate", "nowcast", "baseline", "unknown"):
        track = "unknown"
    low = number(row.get("skill_ci_low"), "skill_ci_low")
    high = number(row.get("skill_ci_high"), "skill_ci_high")
    if (low is None) != (high is None) or (low is not None and low > high):
        raise ValueError("Skill interval must have both bounds in increasing order")
    result = {
        "id": hashlib.sha256(f"{source}:{index}:{name}".encode()).hexdigest()[:12],
        "model": name.strip(), "track": track, "test_rmse": rmse,
        "skill": number(row.get("skill_vs_constant"), "skill_vs_constant"),
        "ci_low": low, "ci_high": high, "source": source,
        "evidence": f"{source} / row {index}",
        "synthetic": row.get("dataset_kind") == "synthetic",
    }
    for key in ("roc_auc", "pr_auc"):
        result[key] = number(row.get(key), key)
        if result[key] is not None and not 0 <= result[key] <= 1:
            raise ValueError(f"{key} must be between 0 and 1")
    result["status"] = ("positive interval" if low is not None and low > 0 else
                        "no positive interval" if high is not None and high <= 0 else
                        "inconclusive" if low is not None else "interval missing")
    return result


def parse_file(filename, content):
    if not isinstance(filename, str) or not isinstance(content, str):
        raise ValueError("Each file needs a name and text content")
    filename = filename.replace("\\", "/").split("/")[-1][:160]
    if filename.lower().endswith(".csv"):
        reader = csv.DictReader(io.StringIO(content.lstrip("\ufeff")))
        if not reader.fieldnames or not {"model", "test_rmse"}.issubset(reader.fieldnames):
            raise ValueError(f"{filename}: expected a FishCast benchmark CSV with model and test_rmse columns")
        rows = []
        for i, row in enumerate(reader, 2):
            if i > 1001:
                raise ValueError("Maximum 1,000 models per file")
            rows.append(normalize(row, filename, i))
        if not rows:
            raise ValueError(f"{filename}: no model rows")
        return rows
    if not filename.lower().endswith(".json"):
        raise ValueError("Use benchmark CSV or metrics JSON files")
    data = json.loads(content)
    if not isinstance(data, dict) or not isinstance(data.get("test_metrics"), dict):
        raise ValueError(f"{filename}: metrics JSON needs a test_metrics object; validation scores are not test scores")
    m = data["test_metrics"]
    config = data.get("config", {})
    if not isinstance(config, dict):
        raise ValueError("config must be an object")
    model = data.get("model_name") or config.get("model_type") or filename
    track = {"climate_conditioned_gp": "climate", "autoregressive_gp": "nowcast",
             "latent_state_augmented_gp": "nowcast", "autoregressive_sequence": "nowcast",
             "convlstm_baseline": "nowcast"}.get(model, "unknown")
    if config.get("include_lag_features") is True:
        track = "nowcast"
    return [normalize({"model": model, "track": track, "test_rmse": m.get("rmse"),
                       "skill_vs_constant": m.get("rmse_skill_vs_constant"),
                       "roc_auc": m.get("roc_auc"), "pr_auc": m.get("pr_auc")}, filename, 1)]


def analyze(files, demo=False):
    if not isinstance(files, list) or not 1 <= len(files) <= 20:
        raise ValueError("Import between 1 and 20 files")
    models, sources = [], []
    for file in files:
        if not isinstance(file, dict):
            raise ValueError("Invalid file entry")
        rows = parse_file(file.get("name"), file.get("content"))
        models.extend(rows)
        sources.append({"name": rows[0]["source"], "rows": len(rows),
                        "sha256": hashlib.sha256(file["content"].encode()).hexdigest()})
    # IDs must stay unique even when two uploaded metrics files share a basename.
    for i, model in enumerate(models):
        model["id"] += f"-{i}"
    demo = demo or any(m["synthetic"] for m in models)
    ranked = sorted((m for m in models if m["skill"] is not None and m["track"] != "baseline"),
                    key=lambda m: m["skill"], reverse=True)
    warnings = ["Intervals and scores are imported, not recomputed. Different files may use different datasets, splits, targets or baselines; verify comparability before ranking them.",
                "Nowcast skill using recent krill observations does not establish long-term climate forecasting skill.",
                "Seed-level rows and their ensemble can overlap; model rows are not independent experiments."]
    if demo:
        warnings.insert(0, "Synthetic demonstration results. These numbers are not FishCast findings.")
    return {"models": models, "sources": sources, "demo": demo, "warnings": warnings,
            "summary": {"models": len(models), "sources": len(sources),
                        "positive_intervals": sum(m["status"] == "positive interval" for m in models),
                        "best": ranked[0] if ranked else None}}


def brief(workspace):
    best = workspace["summary"]["best"]
    lines = ["# Finge research brief", "", "SYNTHETIC DEMO" if workspace["demo"] else "Imported FishCast artifacts", "",
             "## Evidence"]
    for m in workspace["models"]:
        skill = "unavailable" if m["skill"] is None else f"{m['skill']:.2%}"
        lines.append(f"- {m['model']} [{m['track']}]: RMSE {m['test_rmse']:.4f}; skill {skill}; {m['status']}. Source: {m['evidence']}.")
    lines += ["", "## Next experiment (proposal)",
              "Compare the climate-only model against constant and sector-climatology baselines on an identical, corrected dataset and a predeclared held-out split.",
              "Repeat across seeds. Use a year-block bootstrap for uncertainty and report spatially blocked validation separately.",
              "Success criterion: predeclare a meaningful improvement threshold and require its uncertainty interval to clear zero; do not choose it after inspecting the test results.",
              "", "## Interpretation limits", *[f"- {w}" for w in workspace["warnings"]], "", "## Artifact fingerprints"]
    lines += [f"- {s['name']}: SHA-256 {s['sha256']}" for s in workspace["sources"]]
    return "\n".join(lines)
