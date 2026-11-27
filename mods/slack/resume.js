// Herdr core 가 다시 켜지면 터미널에는 빈 셸만 남고 그 안의 Claude 는 사라진다.
// Claude 가 살아 있는 동안 "터미널 → 세션 ID" 를 적어 두었다가, 그 탭을 다시 열 때
// 셸이 새로 만들어진 것(셸 PID 가 바뀜)이면 같은 대화를 --resume 으로 이어 붙인다.
// 사용자가 /exit 로 끈 경우는 셸 PID 가 그대로라서 건드리지 않는다.
import { terminals, panes, shared, setShared, exec, hc, notify, appHome } from "herdr";
import * as fs from "fs/promises";

const RECORDS = "slack.resume";       // { [address]: { session, cwd, args, shell, tab, at } }
export const RESUMING = "slack.resuming"; // { [address]: 시작 시각 } (slack-chat 이 "불러오는 중" 을 그린다)
const RECORD_MS = 15000;
const GIVE_UP_MS = 45000;
const SETTLE_MS = 15000;
// 이어 붙일 때 다시 넣지 않을 옵션(값을 받는 것은 true).
const DROP = { "--resume": true, "-r": true, "--session-id": true, "--continue": false, "-c": false,
  "--fork-session": false, "--print": false, "-p": false };
const VALUE_FLAGS = new Set(["--model", "--permission-mode", "--add-dir", "--settings", "--agent", "--mcp-config",
  "--allowedTools", "--allowed-tools", "--disallowedTools", "--disallowed-tools", "--append-system-prompt",
  "--system-prompt", "--output-format", "--input-format", "--fallback-model", "--name", "-n"]);

const what = (term) => `${term?.report?.app ?? ""} ${term?.foreground?.name ?? ""} ${term?.foreground?.argv?.[0] ?? ""}`.toLowerCase();
const isClaude = (term) => what(term).includes("claude");
const isAgent = (term) => isClaude(term) || what(term).includes("codex");
// 한 번만 읽고 지우는 복구 파일: 기록이 생기기 전에 날아간 탭을 손으로 채울 때 쓴다.
const SEED = () => `${appHome()}/data/slack/resume-seed.json`;
const local = (term) => term?.address && !term.address.includes("/");
const quote = (s) => (/^[A-Za-z0-9_@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

// claude 다음에 붙었던 옵션만 남긴다. 처음 프롬프트(옵션이 아닌 낱말)는 다시 보내지 않는다.
export function resumeArgs(argv) {
  const out = [];
  const rest = (argv ?? []).slice(1);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const [flag] = a.split("=");
    if (flag in DROP) { if (DROP[flag] && !a.includes("=")) i++; continue; }
    if (!a.startsWith("-")) continue;
    out.push(a);
    if (VALUE_FLAGS.has(flag) && !a.includes("=") && i + 1 < rest.length) out.push(rest[++i]);
  }
  return out;
}

// 살아 있는 Claude 터미널마다 지금 세션 ID 를 적는다(~/.claude/sessions/<pid>.json).
export function recordSessions(state, cx) {
  if (!state.seedChecked) {
    state.seedChecked = true;
    cx.spawn(async () => {
      try {
        const seed = JSON.parse(await fs.readFile(SEED(), "utf8"));
        setShared(RECORDS, { ...(shared(RECORDS) ?? {}), ...seed });
        await fs.unlink(SEED());
      } catch {}
    });
  }
  if (state.recording || Date.now() - (state.recordedAt ?? 0) < RECORD_MS) return;
  const live = terminals().filter((t) => t.state === "live" && local(t) && isClaude(t) && t.foreground?.pid);
  state.recordedAt = Date.now();
  if (!live.length) return;
  state.recording = true;
  cx.spawn(async () => {
    try {
      const script = 'for p in "$@"; do f="$HOME/.claude/sessions/$p.json"; [ -f "$f" ] && printf "%s\\t%s\\n" "$p" "$(tr -d "\\n" < "$f")"; done';
      const r = await exec("sh", ["-c", script, "sh", ...live.map((t) => String(t.foreground.pid))]);
      const ids = new Map();
      for (const line of r.stdout.split("\n")) {
        const [pid, json] = line.split("\t");
        try { const id = JSON.parse(json ?? "").sessionId; if (id) ids.set(pid, id); } catch {}
      }
      const records = { ...(shared(RECORDS) ?? {}) };
      let changed = false;
      for (const t of live) {
        const session = ids.get(String(t.foreground.pid));
        if (!session) continue;
        const next = { session, cwd: t.foreground.cwd ?? t.cwd, args: resumeArgs(t.foreground.argv),
          shell: t.pid, tab: t.labels?.["herdr.tab"] ?? null, title: t.title ?? null };
        const prev = records[t.address];
        if (prev && prev.session === next.session && prev.shell === next.shell && prev.tab === next.tab
          && prev.title === next.title && JSON.stringify(prev.args) === JSON.stringify(next.args)) continue;
        records[t.address] = { ...next, at: Date.now() };
        changed = true;
      }
      if (changed) setShared(RECORDS, records);
    } finally { state.recording = false; }
  });
}

// 이 탭에서 이어 붙일 창: 기록이 있고, 셸이 새로 떴고, 셸이 아무것도 돌리지 않는 터미널.
function resumable(tabId) {
  const records = shared(RECORDS) ?? {};
  for (const p of panes().filter((x) => x.tab === tabId && x.terminal)) {
    const term = terminals().find((t) => t.address === p.terminal);
    const rec = term && records[term.address];
    if (!rec || !local(term) || term.state !== "live" || isAgent(term)) continue;
    if (rec.tab && term.labels?.["herdr.tab"] && rec.tab !== term.labels["herdr.tab"]) continue;
    if (term.pid === rec.shell || term.foreground?.pid !== term.pid) continue;
    return { pane: p, term, rec };
  }
  return null;
}

// 지금 탭에서 이어 붙이는 중인 창(없으면 null). 머리줄 타이머가 부른다.
export function resumePane(state, tabId, cx) {
  const r = state.resume;
  if (r && r.tab === tabId) {
    const term = terminals().find((t) => t.address === r.address);
    const age = Date.now() - r.since;
    if (isAgent(term)) {
      r.agentAt ??= Date.now();
      if (Date.now() - r.agentAt > SETTLE_MS) finish(state);
      return null; // 에이전트가 떴으니 보통 흐름(채팅 열기)이 맡는다.
    }
    if (age > GIVE_UP_MS) {
      finish(state);
      notify({ title: "지난 대화를 불러오지 못했어요", body: `${r.address} 터미널에서 직접 확인해 주세요.`, level: "error" });
      return null;
    }
    return panes().find((p) => p.pane === r.pane) ?? null;
  }
  if (r) finish(state);
  const found = tabId && resumable(tabId);
  if (!found) return null;
  const { pane, term, rec } = found;
  // 같은 셸에 두 번 보내지 않게 먼저 적는다.
  setShared(RECORDS, { ...(shared(RECORDS) ?? {}), [term.address]: { ...rec, shell: term.pid } });
  state.resume = { tab: tabId, pane: pane.pane, address: term.address, since: Date.now() };
  setShared(RESUMING, { ...(shared(RESUMING) ?? {}), [term.address]: Date.now() });
  const cmd = (rec.kind === "codex" ? ["codex", "resume", ...rec.args, rec.session]
    : ["claude", ...rec.args, "--resume", rec.session]).map(quote).join(" ");
  cx.spawn(async () => {
    const res = await hc(["send", term.address, cmd]);
    if (res.code !== 0) {
      finish(state);
      notify({ title: "지난 대화를 불러오지 못했어요", body: res.stderr || "셸에 명령을 보내지 못했어요.", level: "error" });
    }
  });
  return pane;
}

function finish(state) {
  const r = state.resume;
  state.resume = null;
  if (!r) return;
  const all = { ...(shared(RESUMING) ?? {}) };
  delete all[r.address];
  setShared(RESUMING, all);
}
