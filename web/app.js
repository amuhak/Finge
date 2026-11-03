"use strict";
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
let files = [], workspace = null, demo = true, track = "all", selected = null;
let revision = 0;
const percent = value => value == null ? "—" : (value > 0 ? "+" : "") + (value * 100).toFixed(1) + "%";
const decimal = value => value == null ? "—" : value.toFixed(3);
const label = value => ({climate:"Climate only",nowcast:"Recent krill",baseline:"Baseline",unknown:"Unknown"})[value] || value;
function notice(message) { $("notice").textContent = message; $("notice").hidden = !message; }
async function api(route, data) {
  const response = await fetch(route, data ? {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)} : {});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The request failed.");
  return result;
}
function payload() { return {files, demo}; }
function visibleModels() {
  const query = $("search").value.toLowerCase();
  return workspace.models.filter(m => (track === "all" || m.track === track) && m.model.toLowerCase().includes(query));
}
function render() {
  if (!workspace) return;
  const summary = workspace.summary;
  $("stat-models").textContent = summary.models;
  $("stat-skill").textContent = summary.best ? percent(summary.best.skill) : "—";
  $("stat-best").textContent = summary.best ? label(summary.best.track) + " · " + summary.best.model : "No reported skill";
  $("stat-positive").textContent = summary.positive_intervals;
  $("stat-sources").textContent = summary.sources;
  $("dataset-tag").textContent = workspace.demo ? "SYNTHETIC DEMO" : "IMPORTED EVIDENCE";
  $("dataset-description").textContent = workspace.demo ? "Illustrative results, not FishCast findings. Import real artifacts to begin." : summary.sources + " file(s) loaded in memory. Verify that their evaluation settings match.";
  const models = visibleModels();
  const extent = Math.max(.01, ...models.flatMap(m => [m.skill,m.ci_low,m.ci_high].filter(v => v != null).map(Math.abs))) * 1.15;
  const pos = value => 50 + value / extent * 50;
  $("chart").innerHTML = models.length ? models.map(m => {
    const start = m.skill == null ? 50 : Math.min(50,pos(m.skill));
    const width = m.skill == null ? 0 : Math.abs(pos(m.skill)-50);
    const color = m.track === "climate" ? "#8da56b" : m.track === "nowcast" ? "#8da8b6" : "#bfc6b6";
    return '<button class="chart-row '+(m.id === selected ? "chosen" : "")+'" data-model="'+m.id+'" aria-label="'+escapeHtml(m.model)+', skill '+escapeHtml(percent(m.skill))+'"><span class="model-label">'+escapeHtml(m.model)+'</span><span class="bar-area"><span class="bar" style="left:'+start+'%;width:'+width+'%;background:'+color+'"></span>'+(m.ci_low == null ? "" : '<span class="whisker" style="left:'+pos(m.ci_low)+'%;width:'+(pos(m.ci_high)-pos(m.ci_low))+'%"></span>')+'</span><span class="chart-value">'+percent(m.skill)+'</span></button>';
  }).join("") : '<div class="empty">No models match this filter. Try another track or search.</div>';
  $("results").innerHTML = models.map(m => '<tr><td><button class="row-select" data-model="'+m.id+'">'+escapeHtml(m.model)+'</button></td><td><span class="table-tag '+m.track+'">'+label(m.track)+'</span></td><td>'+decimal(m.test_rmse)+'</td><td>'+percent(m.skill)+'</td><td>'+decimal(m.pr_auc)+'</td><td class="source-cell">'+escapeHtml(m.evidence)+'</td></tr>').join("");
  document.querySelectorAll("[data-model]").forEach(button => button.addEventListener("click", () => { selected = button.dataset.model; render(); }));
  renderInspector();
  $("sources").innerHTML = workspace.sources.map(s => '<article class="source-item"><h3>'+escapeHtml(s.name)+'</h3><p>'+s.rows+' model row(s) · '+(workspace.demo ? "synthetic demonstration artifact" : "user-imported artifact")+'</p><code>SHA-256 '+s.sha256+'</code></article>').join("");
}
function renderInspector() {
  const m = workspace.models.find(m => m.id === selected) || workspace.models[0];
  if (!m) return;
  selected = m.id;
  $("inspector-title").textContent = m.model;
  let interpretation = "An uncertainty interval was not supplied. A point estimate alone does not establish a reliable improvement.";
  if (m.status === "positive interval") interpretation = "The reported skill interval is entirely above zero. This supports improvement over the constant baseline under this artifact’s evaluation settings.";
  if (m.status === "inconclusive") interpretation = "The reported interval includes zero. These results do not resolve whether this model improves over the constant baseline.";
  if (m.status === "no positive interval") interpretation = "The reported interval does not extend above zero. It provides no evidence of positive skill over the constant baseline.";
  $("inspector").innerHTML = '<span class="track-pill">'+label(m.track)+'</span><p>'+interpretation+'</p><div class="insight-metric"><span>Reported skill</span><strong>'+percent(m.skill)+'</strong></div><div class="insight-metric"><span>95% interval</span><strong>'+(m.ci_low == null ? "Not supplied" : percent(m.ci_low)+" to "+percent(m.ci_high))+'</strong></div><div class="callout">'+(m.track === "nowcast" ? "Uses recent krill observations. This result does not establish long-term climate forecasting skill." : "Before comparing runs, verify a shared dataset version, held-out split, target and baseline.")+'</div><div class="insight-source">SOURCE / '+escapeHtml(m.evidence)+'</div>';
}
async function loadDemo() {
  try {
    const result = await api("/api/analyze",{demo:true});
    files = []; demo = true; workspace = result; selected = null; revision++; $("conversation").replaceChildren(); notice(""); render();
  } catch (error) { notice(error.message); }
}
$("import").addEventListener("click", () => $("files").click());
$("files").addEventListener("change", async event => {
  const chosen = [...event.target.files];
  if (!chosen.length) return;
  if (chosen.length > 20 || chosen.reduce((sum,f) => sum+f.size,0) > 3500000) { notice("Choose up to 20 files totaling less than 3.5 MB."); return; }
  $("import").disabled = true;
  try {
    const next = await Promise.all(chosen.map(async file => ({name:file.name,content:await file.text()})));
    const result = await api("/api/analyze",{files:next,demo:false});
    files = next; demo = false; workspace = result; selected = null; revision++; $("conversation").replaceChildren(); notice(""); render();
  } catch (error) { notice(error.message); }
  finally { $("import").disabled = false; event.target.value = ""; }
});
$("demo").addEventListener("click", loadDemo);
$("search").addEventListener("input", render);
document.querySelectorAll("[data-track]").forEach(button => button.addEventListener("click", () => {
  track = button.dataset.track;
  document.querySelectorAll("[data-track]").forEach(b => b.classList.toggle("selected", b === button)); render();
}));
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".view").forEach(view => { view.hidden = view.id !== button.dataset.view; });
  document.querySelectorAll("[data-view]").forEach(b => b.classList.toggle("active", b === button));
  const text = {overview:["Observatory","Make sense of the signal.","Compare experiments. Follow the evidence. Find your next question."],evidence:["Evidence library","Know where the numbers came from.","Source artifacts, file fingerprints, and a clear chain of evidence."],workflow:["Agent workflow","Make research a repeatable routine.","A practical role for Cursor, Grok API, and the actual GrokBot."]}[button.dataset.view];
  $("breadcrumb").textContent = text[0]; $("page-title").textContent = text[1]; $("page-subtitle").textContent = text[2];
}));
$("export").addEventListener("click", async () => {
  if (!workspace) return;
  try {
    const result = await api("/api/brief",payload());
    const url = URL.createObjectURL(new Blob([result.markdown],{type:"text/markdown"}));
    const a = document.createElement("a"); a.href = url; a.download = "finge-research-brief.md"; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
    notice("Research brief exported with evidence references and artifact fingerprints.");
  } catch (error) { notice(error.message); }
});
document.querySelectorAll(".prompts button").forEach(button => button.addEventListener("click", () => { $("question").value = button.textContent; $("question").focus(); }));
function message(author, content) {
  const div = document.createElement("div"); div.className = "message" + (author === "YOU" ? " user" : "");
  const title = document.createElement("b"); title.textContent = author; div.append(title, document.createTextNode(content)); $("conversation").append(div);
}
$("ask-form").addEventListener("submit", async event => {
  event.preventDefault(); if (!workspace) return;
  const question = $("question").value.trim(); if (!question) return;
  const requestRevision = revision;
  $("ask").disabled = true; $("ask").textContent = "Reading evidence…"; message("YOU",question); $("question").value = "";
  try {
    const result = await api("/api/ask",{...payload(),question});
    if (revision === requestRevision) message("GROK · "+result.model,result.answer);
  } catch (error) { if (revision === requestRevision) message("CONNECTION",error.message); }
  finally { $("ask").disabled = false; $("ask").textContent = "Ask Grok ↗"; }
});
api("/api/status").then(result => {
  $("connection").textContent = result.grok_connected ? "Grok key configured" : "Grok not connected";
  $("connection").classList.toggle("connected",result.grok_connected);
}).catch(() => { $("connection").textContent = "Server unavailable"; });
loadDemo();
