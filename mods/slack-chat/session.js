import { exec } from "herdr";
import { HISTORY_PY } from "./history.js";
import { machineOf } from "./source.js";
import { codexTitleIdentity } from "./title.js";

// Match only structured conversation bodies, never tool output. Shared fork
// history is deliberately present in every candidate so it cannot break ties.
export const SESSION_PY = `
import json, pathlib, sys, re, io, contextlib, subprocess, time
screen, cwd, hint, history, *extra = json.loads(sys.argv[1])
identity = extra[0] if extra else None
previous = extra[1] if len(extra) > 1 else None
pid = extra[2] if len(extra) > 2 else None
root = pathlib.Path.home()/".codex"/"sessions"
def primary(meta):
    # Codex subagents (including Guardian) can copy their parent's complete
    # conversation. Their content must never identify the terminal's thread.
    return (bool(re.fullmatch(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", meta.get("id", "")))
            and not meta.get("parent_thread_id") and not isinstance(meta.get("source"), dict))
def read_meta(path):
    with pathlib.Path(path).open() as stream:
        item = json.loads(stream.readline())
    return item.get("payload", {}) if item.get("type") == "session_meta" else {}
try:
    previous_valid = not previous or primary(read_meta(previous))
except Exception:
    previous_valid = False
def emit(**result):
    result["invalidPrevious"] = not previous_valid
    print(json.dumps(result)); sys.exit()
# The terminal supplied this identity. Never replace it with a cwd/text guess
# while its new log is being created or when the prefix is ambiguous.
if identity:
    prefix = identity.get("prefix", "")
    if not re.fullmatch(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{5,12}", prefix):
        raise RuntimeError("Invalid terminal title identity")
    matches = []
    subagent_hits = 0
    for path in root.rglob("rollout-*" + prefix + "*.jsonl"):
        try:
            meta = read_meta(path)
            ident = meta.get("id", "")
            if ident.startswith(prefix) and re.fullmatch(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", ident):
                if identity.get("complete") and ident != prefix: continue
                if not primary(meta):
                    subagent_hits += 1
                    continue
                matches.append((str(path), ident))
        except Exception: pass
    found = matches[0] if len(matches) == 1 else (None, None)
    emit(file=found[0], sessionId=found[1], evidence="title", matchCount=len(matches), subagent=bool(subagent_hits and not matches))
# Started as \`codex resume <id>\` (Herdr reopening a conversation after a restart): the log
# already exists and was written before this process, so look it up by that ID.
resumed = extra[3] if len(extra) > 3 else None
if resumed:
    matches = []
    for path in root.rglob("rollout-*" + resumed + ".jsonl"):
        try:
            meta = read_meta(path)
            if meta.get("id") == resumed and primary(meta): matches.append(str(path))
        except Exception: pass
    if len(matches) == 1: emit(file=matches[0], sessionId=resumed, evidence="resume")
def norm(s):
    s = re.sub(r"\\x1b\\[[0-?]*[ -/]*[@-~]", "", s)
    return re.sub(r"[\\W_]+", "", s).casefold()
found = []
all_sessions = []
for path in root.rglob("rollout-*.jsonl"):
    try:
        meta = read_meta(path)
        if not primary(meta): continue
        all_sessions.append((str(path), meta.get("id")))
        if meta.get("cwd") == cwd: found.append((str(path), meta.get("id")))
    except Exception: pass
# Only a visible status panel can provide an exact identity. UUIDs in ordinary
# conversation text, command examples or scrollback are not identity evidence.
ids = re.findall(r"(?mi)^\\s*[│┃]?\\s*Session(?: ID)?\\s*:\\s*([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\\s*[│┃]?\\s*$", screen)
status = bool(re.search(r"(?i)context window\\s*:", screen) and re.search(r"(?i)(model|directory)\\s*:", screen))
if status and len(set(ids)) == 1:
    matches = [p for p, ident in all_sessions if ident == ids[0]]
    emit(file=matches[0] if len(matches)==1 else None,evidence="status")
# When the Codex process started (ps etime: [[dd-]hh:]mm:ss), give or take a few seconds. Codex
# writes its log only once the first message is sent: no log in this folder since then means the
# terminal has none yet (wait for it); exactly one means it is this terminal's.
def process_start():
    out = subprocess.run(["ps", "-o", "etime=", "-p", str(pid)], capture_output=True, text=True).stdout.strip()
    days, _, clock = out.rpartition("-")
    secs = 0
    for part in clock.split(":"): secs = secs * 60 + int(part)
    return time.time() - secs - int(days or 0) * 86400 - 5
def born(path):
    st = pathlib.Path(path).stat()
    return getattr(st, "st_birthtime", st.st_mtime)
if pid:
    try:
        start = process_start()
        fresh = [(p, i) for p, i in found if born(p) >= start]
        if len(fresh) == 1: emit(file=fresh[0][0], evidence="started")
        if not fresh: emit(file=None, evidence="no-log-yet")
    except SystemExit: raise
    except Exception: pass
# Bound the work. Never discard older candidates and select a newer one instead.
if len(found) > 40:
    emit(file=None,evidence="too-many-candidates")
anchors = []
for line in screen.splitlines():
    line = re.sub(r"^\\s*[›❯•●│┃]+\\s*", "", line)
    if re.search(r"(?i)context left|shortcuts|esc to|tokens? used|gpt-|codex |session:|https?://|^[-+>$]|^\\s*\\d+[:|]", line): continue
    text = norm(line)
    if len(text) >= 24 and text not in anchors: anchors.append(text)
anchors = anchors[-24:]
scores = []
failed = False
for path, ident in found:
    try:
        output = io.StringIO()
        saved = sys.argv
        sys.argv = ["history", path]
        with contextlib.redirect_stdout(output): exec(history, {})
        sys.argv = saved
        records = json.loads(output.getvalue())["lines"]
        bodies = []
        for line in records:
            item = json.loads(line); p = item.get("payload", {})
            if item.get("type") == "event_msg" and p.get("type") in ("user_message", "agent_message"):
                bodies.append(norm(p.get("message", "")))
            elif item.get("type") == "response_item" and p.get("type") == "message" and p.get("role") in ("user", "assistant"):
                bodies.append(norm("".join(c.get("text", "") for c in p.get("content", []) if c.get("type") in ("input_text", "output_text"))))
        bodies = list(dict.fromkeys(bodies))
        positions = {i: next((j for j, body in enumerate(bodies) if a in body), -1) for i, a in enumerate(anchors)}
        hits = {i for i, j in positions.items() if j >= 0}
        scores.append((path, hits, positions))
    except Exception:
        sys.argv = saved; failed = True
winners = []
for path, hits, positions in scores:
    others = set().union(*(h for p, h, _ in scores if p != path))
    unique = sorted(hits - others)
    # Two lines of one message are insufficient. Require two distinct messages
    # appearing in terminal order, not two duplicated event/response records.
    ordered = any(positions[a] < positions[b] for a in unique for b in unique if a < b)
    if ordered: winners.append(path)
file = winners[0] if len(winners)==1 and not failed else None
emit(file=file,evidence="text" if file else "ambiguous")
`;

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const CODEX_VALUE_FLAGS = new Set(["-c", "--config", "-m", "--model", "-p", "--profile", "-s", "--sandbox",
  "-a", "--ask-for-approval", "-C", "--cd", "-i", "--image", "--add-dir", "--enable", "--disable", "--remote"]);

// The session ID in "codex [options] resume [options] <uuid>", or null.
export function codexResumeId(argv) {
  if (!Array.isArray(argv) || !/(?:^|[/\\])codex(?:\.exe)?$/.test(argv[0] ?? "")) return null;
  let resumed = false;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (CODEX_VALUE_FLAGS.has(a)) { i++; continue; }
    if (a.startsWith("-")) continue;
    if (!resumed) { if (a !== "resume") return null; resumed = true; continue; }
    return UUID.test(a) ? a.toLowerCase() : null;
  }
  return null;
}

export async function resolveSession(term, screen, hint, previous = null) {
  const result = await exec("python3", ["-c", SESSION_PY, JSON.stringify([screen, term.foreground?.cwd ?? "", hint, HISTORY_PY, codexTitleIdentity(term), previous, term.foreground?.pid ?? null, codexResumeId(term.foreground?.argv)])], { on: machineOf(term.address), timeout: 30000 });
  if (result.code !== 0) throw new Error(result.stderr.trim() || "Could not identify the conversation");
  return JSON.parse(result.stdout);
}
