# Cursor + GrokBot demo runbook

These are real product workflows to perform, not integrations claimed by a badge.

## Cursor task
Open this Finge checkout on branch brianna in Cursor. Ask:

"Read README.md and finge/analysis.py. Extend Finge with a run comparability manifest: dataset checksum, target transform, split years, baseline identifier and seed. Show mismatches beside comparisons. Keep Finge independent of FishCast's training code. Add tests for mismatched splits. Run the test suite and summarize the patch."

Save the resulting changes on this branch and retain a screenshot or recording showing Cursor's actual contribution. Do not claim that adding Cursor rules alone counts as using Cursor.

## GrokBot research routine
Open the actual GrokBot application and give it the accessible Finge URL (a loopback URL works only if its computer can access this same machine). If its browser runs remotely, run Finge on that environment or provide an appropriately secured reachable demo URL; do not assume it can reach your laptop.

Prompt:
"Open Finge. Import the FishCast benchmark_table.csv and metrics.json files I provide. Verify the workspace is labeled imported evidence. Compare climate-only and recent-krill tracks separately. Inspect a model whose reported skill interval includes zero. Ask the in-app research assistant whether these results establish long-term forecasting skill. Export the research brief and return it with the artifact source references. Identify missing evaluation metadata. Do not change FishCast, fabricate numbers, or publish anything."

For a sample-only rehearsal, explicitly tell the bot that samples/benchmark_table.csv is synthetic. Record GrokBot operating the app and delivering the brief. No automated GrokBot connector is implemented in Finge.

## Grok API
Configure XAI_API_KEY and a supported XAI_MODEL on the Finge server. Ask an evidence-specific question in the app. Capture an actual successful answer with source references. Missing keys produce an honest configuration message; they never produce a fake model response.

## Two-minute demo
1. Explain that FishCast generates models and Finge interprets its artifacts.
2. Import results; show provenance.
3. Filter climate-only, then recent krill. Explain why those tracks answer different questions.
4. Select an inconclusive interval.
5. Ask Grok for an interpretation and proposed controlled experiment.
6. Show the brief GrokBot exported and Cursor's implemented contribution.

Do not present the synthetic sample as a reproduced FishCast result.
