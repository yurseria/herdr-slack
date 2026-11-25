// Models and effort levels for Claude Code, Codex, and Antigravity (agy):
// what can be picked, how to start an agent with them, and how to switch a running one.
import { exec, hc } from "herdr";
import { CODEX_TITLE_CONFIG } from "./title.js";
import { parseAgyModel } from "./parse.js";

export const CLAUDE_MODELS = [
  { id: "claude-opus-5-5", name: "Opus 5.5", alias: "opus" },
  { id: "claude-sonnet-5-5", name: "Sonnet 5.5", alias: "sonnet" },
  { id: "claude-fable-5-1", name: "Fable 5.1", alias: "fable" },
  { id: "claude-haiku-5-5", name: "Haiku 5.5", alias: "haiku" },
];
export const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max"];

export const AGY_MODELS = [
  { id: "gemini-4-neon", name: "Gemini 4 Neon", efforts: ["low", "medium", "high"] },
  { id: "gemini-4-argon", name: "Gemini 4 Argon", efforts: ["low", "medium", "high"] },
  { id: "gemini-4-carbon", name: "Gemini 4 Carbon", efforts: ["low", "medium", "high"] },
  { id: "gemini-4-hydrogen", name: "Gemini 4 Hydrogen", efforts: ["low", "medium", "high", "xhigh"] },
  { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", efforts: ["low", "medium", "high"] },
  { id: "gemini-pro-orchestrator", name: "Orchestrator (Carbon)", efforts: [] },
  { id: "gemini-pro-orchestrator-argon", name: "Orchestrator (Argon)", efforts: [] },
  { id: "claude-opus-4-6-thinking", name: "Claude Opus 4.6", efforts: [] },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", efforts: [] },
  { id: "gpt-oss-120b-medium", name: "GPT-OSS 120B", efforts: [] },
];
export const AGY_EFFORTS = ["low", "medium", "high", "xhigh"];
const EFFORT_ORDER = { low: 0, medium: 1, high: 2, xhigh: 3, max: 4 };

export function parseAgyModelsOutput(stdout) {
  const byId = new Map();
  const clean = String(stdout ?? "").replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
  for (const rawLine of clean.split(/\r?\n/)) {
    const line = rawLine.split("\r").at(-1)?.trim() ?? "";
    const m = /^([a-z0-9][a-z0-9._-]+)\s{2,}(.+)$/.exec(line);
    if (!m) continue;
    const rawId = m[1].trim();
    const rawLabel = m[2].trim();
    const parsed = parseAgyModel(rawId);
    const id = parsed.model ?? rawId;
    const label = parsed.effort ? rawLabel.replace(/\s*\([^)]*\)\s*$/, "").trim() : rawLabel;
    let entry = byId.get(id);
    if (!entry) {
      entry = { id, name: label || id, efforts: [] };
      byId.set(id, entry);
    }
    if (parsed.effort && !entry.efforts.includes(parsed.effort)) {
      entry.efforts.push(parsed.effort);
      entry.efforts.sort((a, b) => (EFFORT_ORDER[a] ?? 9) - (EFFORT_ORDER[b] ?? 9));
    }
  }
  return [...byId.values()];
}

export function agyModelId(model, effort, models = AGY_MODELS) {
  if (!model) return null;
  const entry = (models ?? AGY_MODELS).find((m) => m.id === model) ?? AGY_MODELS.find((m) => m.id === model);
  if (entry?.efforts?.length) {
    const eff = effort && entry.efforts.includes(effort) ? effort : entry.efforts.includes("medium") ? "medium" : entry.efforts[0];
    return `${entry.id}-${eff}`;
  }
  if (effort && /^gemini-[a-z0-9.-]+$/.test(model) && !/-(low|medium|high|xhigh|max)$/.test(model) && !model.includes("orchestrator")) {
    return `${model}-${effort}`;
  }
  return model;
}

const cat = async (path, on) =>
  (await exec("sh", ["-c", 'cat "$HOME/$1" 2>/dev/null', "sh", path], { on })).stdout;

// { models: [{ id, name, efforts }], model, effort }: the choices and the defaults.
export async function catalog(kind, on) {
  if (kind === "agy") {
    const [settingsRaw, modelsRes] = await Promise.all([
      cat(".gemini/antigravity-cli/settings.json", on).catch(() => ""),
      exec("sh", ["-c", 'agy models 2>/dev/null'], { on, timeout: 10000 }).catch(() => ({ stdout: "" })),
    ]);
    let s = {};
    try { s = JSON.parse(settingsRaw); } catch {}
    const parsed = parseAgyModel(s.model);
    const dynamic = parseAgyModelsOutput(modelsRes?.stdout ?? "");
    const baseModels = dynamic.length ? dynamic : AGY_MODELS;
    const known = baseModels.find((m) => m.id === parsed.model);
    const models = known || !parsed.model
      ? baseModels
      : [{ id: parsed.model, name: String(s.model ?? parsed.model).replace(/\s*\([^)]*\)\s*$/, "").trim() || parsed.model, efforts: parsed.effort ? AGY_EFFORTS : [] }, ...baseModels];
    const model = known?.id ?? parsed.model ?? models[0]?.id;
    const allowedEfforts = known?.efforts ?? (parsed.effort ? AGY_EFFORTS : []);
    const effort = allowedEfforts.length
      ? (parsed.effort && allowedEfforts.includes(parsed.effort) ? parsed.effort : "medium")
      : null;
    return { models, model, effort };
  }
  if (kind === "claude") {
    let s = {};
    try { s = JSON.parse(await cat(".claude/settings.json", on)); } catch {}
    const custom = typeof s.model === "string" && s.model.trim() ? s.model.trim() : null;
    // "opus[1m]": an alias with a context suffix. It is that model (shown as "Opus 5.5 1M"), kept as written
    // so a launch from here asks for the same context.
    const suffix = /\[([^\]]+)\]$/.exec(custom ?? "")?.[1] ?? null;
    const bare = custom?.replace(/\[[^\]]+\]$/, "") ?? null;
    const known = CLAUDE_MODELS.find((m) => m.alias === bare || m.id === bare);
    const extra = custom && !(known && !suffix) ? [{ id: custom, name: known ? `${known.name} ${suffix.toUpperCase()}` : custom }] : [];
    const models = [...extra, ...CLAUDE_MODELS].map((m) => ({ ...m, efforts: CLAUDE_EFFORTS }));
    const model = extra[0]?.id ?? known?.id ?? CLAUDE_MODELS[0].id;
    const effort = s.modelSettings?.[model]?.effortLevel ?? s.modelSettings?.[known?.id]?.effortLevel ?? s.effortLevel ?? "medium";
    // The permission mode a new session starts in (Claude Code's own default when unset).
    const mode = typeof s.permissions?.defaultMode === "string" ? s.permissions.defaultMode : "default";
    return { models, model, effort, mode };
  }
  let c = {};
  try { c = JSON.parse(await cat(".codex/models_cache.json", on)); } catch {}
  const models = (c.models ?? []).filter((m) => m.visibility === "list").map((m) => ({
    id: m.slug, name: m.display_name ?? m.slug,
    efforts: (m.supported_reasoning_levels ?? []).map((l) => l.effort),
  }));
  const toml = await cat(".codex/config.toml", on);
  const top = toml.split(/^\s*\[/m)[0] ?? "";
  return {
    models,
    model: /^model\s*=\s*["']([^"']+)["']/m.exec(top)?.[1] ?? models[0]?.id,
    effort: /^model_reasoning_effort\s*=\s*["']([^"']+)["']/m.exec(top)?.[1] ?? "medium",
  };
}

export const modelName = (models, id) =>
  models?.find((m) => m.id === id)?.name
  ?? CLAUDE_MODELS.find((m) => m.id === id || id?.startsWith(m.id))?.name
  ?? AGY_MODELS.find((m) => m.id === id || id?.startsWith(m.id))?.name
  ?? id ?? "";

export function launchArgv(kind, model, effort, task) {
  if (kind === "agy") {
    const m = agyModelId(model, effort);
    const argv = ["agy", ...(m ? ["--model", m] : []), ...(effort ? ["--effort", effort] : [])];
    if (task) argv.push("-i", task);
    return argv;
  }
  const argv = kind === "codex"
    ? ["codex", "-c", CODEX_TITLE_CONFIG, ...(model ? ["-m", model] : []), ...(effort ? ["-c", `model_reasoning_effort="${effort}"`] : [])]
    : ["claude", ...(model ? ["--model", model] : []), ...(effort ? ["--effort", effort] : [])];
  if (task) argv.push(task);
  return argv;
}

// Codex switches for the session only. Claude's /model and /effort also save
// themselves as the default for new sessions, so its settings file is put back.
export async function switchModel(term, kind, model, effort, on, sleep) {
  const send = async command => {
    const result = await hc(["send", term, command]);
    if (result.code !== 0) throw new Error(result.stderr?.trim() || "Could not apply model settings");
    return result;
  };
  if (kind === "codex") {
    if (!model) throw new Error("Choose a model before changing reasoning effort");
    return send(`/model ${model}${effort ? ` --reasoning=${effort}` : ""}`);
  }
  if (kind === "agy") {
    const targetModel = agyModelId(model, effort);
    if (targetModel) {
      await send(`/model ${targetModel}`);
      if (effort) { await sleep(800); await send(`/effort ${effort}`); }
      return;
    }
    if (effort) return send(`/effort ${effort}`);
    return;
  }
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const f = '"$HOME/.claude/settings.json"';
  const bak = `"$HOME/.claude/settings.json.chat-bak-${stamp}"`;
  const probe = await exec("sh", ["-c", `if [ -f ${f} ]; then cp ${f} ${bak} && echo had; elif [ ! -e ${f} ]; then echo missing; fi`], { on });
  const state = (probe?.stdout ?? "").trim();
  try {
    if (model) { await send(`/model ${model}`); await sleep(1200); }
    if (effort) { await send(`/effort ${effort}`); await sleep(1200); }
  } finally {
    if (state === "had") await exec("sh", ["-c", `[ -f ${bak} ] && mv -f ${bak} ${f}`], { on });
    else if (state === "missing") await exec("sh", ["-c", `rm -f ${f} ${bak}`], { on });
  }
}
