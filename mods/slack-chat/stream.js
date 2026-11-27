// What an agent is doing right now, read off its terminal: the reply it's
// writing, or the command or tool it's running and its output so far. The
// terminal draws both as they happen; the log only gets them once done.

// Claude Code: a reply is a "⏺ " line and the lines indented under it. One
// whose first words name a tool ("⏺ Bash(…)") is a tool call, its output
// under "⎿"; a "! " line is a shell command typed into it. Codex: the same
// with "• ", its tool lines naming what it does, output under "└".
const CLAUDE = { mark: "⏺ ", prompt: /^❯ \S/, run: /^! \S/, tool: /^⏺ [\w.:-]+\(|^⏺ (Read|Searched|Listed|Wrote|Updated|Edited|Fetched|Ran|Called|Found)\b.*\b(file|files|pattern|patterns|lines?|director(y|ies)|command|tools?)\b/ };
const CODEX = { mark: "• ", prompt: /^› \S/, run: /^\$ \S/, tool: /^• (Running|Ran|Explored|Exploring|Edited|Editing|Read|Reading|Searched|Searching|Called|Calling|Updated Plan|Added|Deleted|Listed|Viewed|Applied|Proposed)\b/ };
const STATUS = /^• (Working|Waiting|Interrupted|Queued follow-up inputs|Messages to be submitted)\b/;
const WORKED = /^(?:\s*(?:─+\s*)?Worked for \d|[·✻✽✶✳✢]\s+[A-Za-z]+\s+for\s+\d)/;
const CHROME_BANNER = /^\s*(?:(?:New(?:\s+activity)?\s*·\s*)?↓\s*(?:Back to bottom|Bottom)(?:\s*·\s*esc)?|⚠\s+(?:weekly|5h|\d+[hd])\s+limit:.*\/status)\s*$/i;
const CLAUDE_STATUS = /^(?:[·✻✽✶✳✢]\s+\S.*(?:\u2026|\.\.\.|\besc to interrupt\b)|• (Working|Waiting|Interrupted)\b)/;
// The full-screen view's one-line summaries of tool calls ("Running 1 shell
// command…", "Read 2 files"): a command running, not text.
const SUMMARY = /^(Running|Ran|Reading|Read|Searching|Searched|Listing|Listed|Writing|Wrote|Editing|Edited|Updating|Updated|Fetching|Fetched|Calling|Called|Creating|Created|Stopping|Stopped)\b.*\b(commands?|files?|patterns?|director(y|ies)|tools?|agents?|pages?|tasks?|searches|times)\b|^\d+ tool calls?\b|^(Calling|Called)\s+[\w.-]+(\s+\d+\s+times?)?(…|\.\.\.|,|\s*\(|\s*$)/i;

// { kind: "text", text } | { kind: "run", title, out: [lines], time } | null
const AGY_SPINNER = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⣾⣽⣻⢿⡿⣟⣯⣷]\s+(.+)$/;
const AGY_BULLET = /^[○●]\s+(.+)$/;
const AGY_THOUGHT_COLLAPSED = /^▸\s+Thought\b(.*)$/i;
const AGY_MORE = /^…\s+\d+\s+more actions?\b/i;
const AGY_TIP = /^\s*[└⎿]\s*Tip:/i;
const AGY_TREE_LINE = /^\s*[└⎿├│]/;
const AGY_ATTACHMENT = /^\s*▸\s*📎/;
const AGY_ACTION_BULLET = /^[○●]\s+(?:Thought|Ran|Running|Explored|Exploring|Edited|Editing|Read|Reading|Searched|Searching|Listed|Listing|Wrote|Writing|Called|Calling|Updated|Created|Deleted)\b/i;
const AGY_QUEUE_HINT = /^\s*Press\s+\S+\s+to\s+edit\s+queued\s+messages\b/i;
const AGY_QUEUE_HEADER = /^\s*Queued(?:\s+messages?)?\s*[:·]?\s*$/i;
const AGY_SHORT_STATUS = /^(Thinking|Running(?:\s+\w+){0,2}|Working|Reading(?:\s+\w+){0,2}|Searching(?:\s+\w+){0,2}|Editing(?:\s+\w+){0,2}|Writing(?:\s+\w+){0,2}|Waiting|Generating|Planning|Analyzing|Loading)(?:\.{1,3}|\u2026)?$/i;

function extractAgyQueued(lines, end) {
  let cursor = end - 1;
  while (cursor >= 0 && (!lines[cursor].trim() || AGY_TIP.test(lines[cursor]) || CHROME_BANNER.test(lines[cursor]))) {
    cursor--;
  }
  let hintIdx = cursor >= 0 && AGY_QUEUE_HINT.test(lines[cursor]) ? cursor : -1;
  if (hintIdx < 0) {
    // Also check if Agy renders the hint below the composer rule (e.g. in the footer).
    const belowHint = lines.slice(end).some((l) => AGY_QUEUE_HINT.test(l));
    if (!belowHint) return { queued: [], end };
    hintIdx = cursor + 1;
  }
  let start = hintIdx;
  const raw = [];
  for (let i = hintIdx - 1; i >= 0; i--) {
    const l = lines[i];
    const trimmed = l.trim();
    if (!trimmed) {
      if (raw.length) break;
      start = i;
      continue;
    }
    if (AGY_QUEUE_HEADER.test(trimmed)) {
      start = i;
      break;
    }
    if (
      /^─{10,}/.test(trimmed) ||
      AGY_SPINNER.test(trimmed) ||
      AGY_ACTION_BULLET.test(trimmed) ||
      AGY_THOUGHT_COLLAPSED.test(trimmed) ||
      AGY_MORE.test(trimmed) ||
      AGY_TIP.test(l) ||
      CHROME_BANNER.test(l)
    ) {
      break;
    }
    raw.unshift(l);
    start = i;
  }
  const cleanQueued = (s) => {
    let out = s.trim();
    const trail = /\s*\((?:queued|(?:alt|ctrl|cmd|meta|opt)\+\w+\s+to\s+[^)]+|press\s+[^)]+)\)\s*$/i;
    while (trail.test(out)) out = out.replace(trail, "").trim();
    return out;
  };
  const queued = [];
  for (const l of raw) {
    const m = /^\s*(?:[>›↳•◦○●▸▹▶]|-\s)\s*(.+)$/.exec(l);
    if (m) {
      const text = cleanQueued(m[1]);
      if (text) queued.push(text);
    } else if (queued.length && /^\s{2,}\S/.test(l)) {
      const cont = cleanQueued(l);
      if (cont) queued[queued.length - 1] = `${queued[queued.length - 1]}\n${cont}`;
    } else {
      const text = cleanQueued(l);
      if (text) queued.push(text);
    }
  }
  return { queued, end: start };
}

function agyLiveSnapshot(lines) {
  let end = lines.length;
  for (let i = lines.length - 1; i > 0; i--) {
    if (/^─{10,}/.test(lines[i]) && /^>(?:\s|$)/.test(lines[i + 1] ?? "")) {
      end = i;
      break;
    }
  }
  const q = extractAgyQueued(lines, end);
  const queued = q.queued;
  end = q.end;
  let from = 0;
  for (let i = end - 1; i >= 0; i--) {
    if (/^> \S/.test(lines[i])) {
      from = i + 1;
      break;
    }
  }
  const promptLine = from > 0 ? lines[from - 1] : null;
  // Skip continuation lines of a multi-line user prompt (including attachments and
  // blank lines between prompt paragraphs) until an agent action or spinner appears.
  let lastActionIdx = -1;
  let spinnerTitle = null;
  let blockOrdinal = 0;
  const actionLines = [];
  for (let i = from; i < end; i++) {
    const l = lines[i].trimEnd();
    if (!l || CHROME_BANNER.test(l) || /^─{10,}/.test(l) || AGY_TIP.test(l) || AGY_ATTACHMENT.test(l)) continue;
    const sp = AGY_SPINNER.exec(l);
    if (sp) {
      spinnerTitle = sp[1].trim();
      continue;
    }
    if (AGY_MORE.test(l)) {
      lastActionIdx = i;
      actionLines.push(l.trim());
      continue;
    }
    if (AGY_THOUGHT_COLLAPSED.test(l)) {
      lastActionIdx = i;
      blockOrdinal++;
      continue;
    }
    const b = AGY_BULLET.exec(l);
    if (b) {
      lastActionIdx = i;
      blockOrdinal++;
      const clean = b[1].replace(/\s*\(ctrl\+\w+ to [^)]+\)\s*$/i, "").trim();
      actionLines.push(clean);
    }
  }
  // Only read assistant streaming reply after at least one agent action/thought
  // boundary (`○`, `●`, `▸ Thought`, `… N more actions`), so multi-paragraph user
  // prompts (which Agy indents by 2 spaces, even across blank lines) never leak.
  const replyStart = lastActionIdx >= 0 ? lastActionIdx + 1 : end;
  const replyLines = [];
  for (let i = replyStart; i < end; i++) {
    const l = lines[i];
    if (CHROME_BANNER.test(l) || /^─{10,}/.test(l) || AGY_TIP.test(l) || AGY_SPINNER.test(l.trimEnd())) break;
    if (AGY_TREE_LINE.test(l) || AGY_ATTACHMENT.test(l)) continue;
    if (!l.trim()) {
      if (replyLines.length) replyLines.push("");
      continue;
    }
    if (l.startsWith("  ")) {
      const text = l.slice(2);
      if (/\(ctrl\+\w+ to (?:expand|collapse)\)\s*$/i.test(text)) continue;
      replyLines.push(text);
    }
  }
  const textItem = replyLines.length ? textOf(replyLines) : null;
  if (textItem) {
    return {
      item: textItem,
      queued,
      end,
      from,
      at: replyStart,
      promptLine,
      blockOrdinal: blockOrdinal + 1,
      afterToolInBlock: lastActionIdx >= 0,
      workedAfterAt: false,
      statusAfterAt: Boolean(spinnerTitle),
    };
  }
  let runTitle = null;
  const outLines = [];
  if (spinnerTitle) {
    if (AGY_SHORT_STATUS.test(spinnerTitle)) {
      runTitle = spinnerTitle;
      for (const a of actionLines) {
        if (a !== runTitle && !outLines.includes(a)) outLines.push(a);
      }
    } else {
      runTitle = "Thinking…";
      for (const a of actionLines) {
        if (a !== spinnerTitle && !outLines.includes(a)) outLines.push(a);
      }
      outLines.push(spinnerTitle);
    }
  } else if (actionLines.length) {
    const latest = actionLines[actionLines.length - 1];
    const thoughtMatch = /^(Thought for \d+[hms](?: \d+[ms])*)\s*\((.+)\)$/.exec(latest);
    if (thoughtMatch) {
      runTitle = thoughtMatch[1];
      for (const a of actionLines.slice(0, -1)) {
        if (!outLines.includes(a)) outLines.push(a);
      }
      outLines.push(thoughtMatch[2].trim());
    } else {
      runTitle = latest;
      for (const a of actionLines.slice(0, -1)) {
        if (a !== runTitle && !outLines.includes(a)) outLines.push(a);
      }
    }
  }
  const runItem = runTitle ? { kind: "run", title: runTitle.trim(), out: outLines.slice(-6), time: null } : null;
  return {
    item: runItem,
    queued,
    end,
    from,
    at: lastActionIdx,
    promptLine,
    blockOrdinal,
    afterToolInBlock: false,
    workedAfterAt: false,
    statusAfterAt: Boolean(spinnerTitle),
  };
}

export function liveSnapshot(screen, kind) {
  const lines = (screen ?? "").split("\n").filter((l) => !l.startsWith("[hc]"));
  if (kind === "agy") return agyLiveSnapshot(lines);
  const k = kind === "codex" ? CODEX : CLAUDE;
  // Claude blinks the "⏺ " of a tool summary while it runs ("⏺ Calling Atlassian 2 times…"), so
  // every other frame the line starts with two spaces. Put the mark back on a summary line that
  // starts its own paragraph, so both frames read the same and the chat doesn't flicker.
  if (kind !== "codex") for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const prev = i > 0 ? lines[i - 1] : "";
    if (/^  \S/.test(l) && SUMMARY.test(l.trim()) && (!prev.trim() || k.prompt.test(prev))) lines[i] = k.mark + l.slice(2);
  }
  // The message box at the bottom: its rule line (Claude) or its prompt (Codex).
  let end = lines.length;
  if (kind === "codex") { for (let i = lines.length - 1; i >= 0; i--) if (/^›(?:\s|$)/.test(lines[i])) { end = i; break; } }
  else for (let i = lines.length - 1; i > 0; i--) if (/^─{10,}/.test(lines[i]) && /^❯/.test(lines[i + 1] ?? "")) { end = i; break; }
  // This turn: after the last message sent.
  let from = 0;
  for (let i = end - 1; i >= 0; i--) if (k.prompt.test(lines[i])) { from = i + 1; break; }
  const isStatus = (l) => (kind === "codex" ? STATUS.test(l) : CLAUDE_STATUS.test(l) && !WORKED.test(l));
  // The last block in it: a reply, a tool call or a shell command.
  let at = -1;
  for (let i = end - 1; i >= from; i--) {
    const l = lines[i];
    if (l.startsWith(k.mark) && !isStatus(l)) { at = i; break; }
    if (k.run.test(l)) { at = i; break; }
  }
  const promptLine = from > 0 ? lines[from - 1] : null;
  const blockOrdinal = at >= 0
    ? lines.slice(from, at + 1).filter((l) => (l.startsWith(k.mark) && !isStatus(l)) || k.run.test(l)).length
    : 0;
  const workedAfterAt = at >= 0 && lines.slice(at + 1, end).some((l) => WORKED.test(l));
  const statusAfterAt = lines.slice(at >= 0 ? at + 1 : from, end).some(isStatus);
  if (at < 0) {
    return { item: null, end, from, at, promptLine, blockOrdinal, afterToolInBlock: false, workedAfterAt, statusAfterAt };
  }
  const head = lines[at];
  const body = [];
  for (let i = at + 1; i < end; i++) {
    const l = lines[i];
    if ((l && !l.startsWith(" ")) || WORKED.test(l) || CHROME_BANNER.test(l)) break;
    body.push(l);
  }
  const depth = (l) => l.length - l.trimStart().length;
  const isOut = (l) => /^\s*[⎿└]/.test(l);
  // A tool shown inside the block, as the full-screen view draws them: a line
  // with its output under "⎿". The last one counts, unless text follows it.
  let g = -1;
  for (let j = body.length - 1; j >= 0; j--) if (isOut(body[j])) { g = j; break; }
  let item = null;
  let afterToolInBlock = false;
  if (g >= 0) {
    while (g > 0 && isOut(body[g - 1])) g--;
    let last = g;
    while (last + 1 < body.length && (isOut(body[last + 1]) || (body[last + 1].trim() && depth(body[last + 1]) > depth(body[g])))) last++;
    const after = body.slice(last + 1);
    const said = after.filter((l) => l.trim());
    if (kind !== "codex" && said.length && said.every((l) => SUMMARY.test(l.trim()))) {
      item = runOf(said[said.length - 1].trim(), []);
    } else if (said.length) {
      // Text written after the tool: that's what's new.
      item = textOf(after.map((l) => l.slice(2)));
      afterToolInBlock = item?.kind === "text";
    } else {
      let h = g - 1;
      while (h >= 0 && !body[h].trim()) h--;
      const title = h >= 0 ? body[h].trim() : k.run.test(head) ? `$ ${head.slice(2)}` : head.slice(k.mark.length);
      item = runOf(title, body.slice(g, last + 1));
    }
  } else if (k.run.test(head) || k.tool.test(head)) {
    item = runOf(k.run.test(head) ? `$ ${head.slice(2)}` : head.slice(k.mark.length), body);
  } else {
    // A summary line last in a text block: the tool it's running now (Claude only).
    const lastLine = [...body].reverse().find((l) => l.trim());
    const said = [head.slice(k.mark.length), ...body].map((l) => l.trim()).filter(Boolean);
    if (kind !== "codex" && lastLine && SUMMARY.test(lastLine.trim())) {
      item = runOf(lastLine.trim(), []);
    } else if (kind !== "codex" && said.length && said.every((l) => SUMMARY.test(l))) {
      item = runOf(said[said.length - 1], []);
    } else {
      item = textOf([head.slice(k.mark.length), ...body.map((l) => l.slice(2))]);
    }
  }
  return { item, end, from, at, promptLine, blockOrdinal, afterToolInBlock, workedAfterAt, statusAfterAt };
}

export function live(screen, kind) {
  return liveSnapshot(screen, kind).item;
}

// A reply: wrapped lines back into paragraphs; blank lines, lists and code stay.
function textOf(block) {
  const out = [];
  for (const l of block) {
    const prev = out[out.length - 1];
    const starts = /^\s*([-*•]|\d+[.)]|#|>|```|\|)/.test(l);
    if (prev && prev.trim() && l.trim() && !starts && !/^\s{2,}/.test(l)) out[out.length - 1] = `${prev} ${l.trim()}`;
    else out.push(l);
  }
  const text = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return text ? { kind: "text", text } : null;
}

// A running tool: its title (its elapsed time split off) and its output lines.
function runOf(title, body) {
  let time = null;
  title = title.replace(/\s*\((?:ctrl|cmd|alt)\+\w+ to [^)]*\)\s*$/i, "");
  const tm = /\s+·\s+(\d+[hms](?: \d+[ms])*)$/.exec(title);
  if (tm) { time = tm[1]; title = title.slice(0, tm.index); }
  // Output lines wrap under where the first one's text starts.
  const first = body.find((l) => /^\s*[⎿└]/.test(l)) ?? "";
  const col = first.length - first.replace(/^\s*[⎿└]\s*/, "").length;
  const out = [];
  for (const l of body) {
    const t = (/^\s*[⎿└]/.test(l) ? l.replace(/^\s*[⎿└]\s*/, "") : l.slice(Math.min(col, l.length - l.trimStart().length))).trimEnd();
    if (/^\(ctrl\+\w+ to .*\)$|^\(esc to .*\)$/i.test(t.trim())) continue;
    const m = /^\((\d+[hms](?: \d+[ms])*)\)$/.exec(t.trim());
    if (m) { time = m[1]; continue; }
    out.push(t);
  }
  while (out.length && !out[out.length - 1].trim()) out.pop();
  const indent = Math.min(...out.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length), 99);
  if (indent < 99) for (let i = 0; i < out.length; i++) out[i] = out[i].slice(indent);
  return { kind: "run", title: title.trim(), out, time };
}

export const streaming = (screen, kind) => {
  const x = live(screen, kind);
  return x?.kind === "text" ? x.text : null;
};
