// Slack threads for the chat (Slack layout only).
//   Work threads: a turn's tool runs, thinking, edits and raw output fold into one "🧵 작업 기록 N개"
//   link under the turn's replies; the link opens them in the thread pane. The main column keeps
//   what people read: your messages, the agent's replies, questions, errors and notices.
//   Reply threads: "스레드에서 답장" on a reply asks a side question about it (the /btw side chat),
//   kept per reply and shown in the same pane.

export const WORK_KINDS = new Set(["tools", "thinking", "changes", "output"]);

// entries → { main, threads }. main has one { kind: "threadlink", key, turn, items } in place of each
// turn's work, placed after the turn's other entries and before its "completed" notice.
// threads: Map(turn key → work entries, in order).
export function threadify(entries) {
  const main = [];
  const threads = new Map();
  let turn = "start";
  let link = null;
  const flush = () => {
    if (link) main.push(link);
    link = null;
  };
  for (const e of entries) {
    if (e.kind === "user") {
      flush();
      turn = e.key;
      main.push(e);
      continue;
    }
    if (WORK_KINDS.has(e.kind)) {
      if (!link) {
        link = { kind: "threadlink", key: `thread-${turn}`, turn, items: [] };
        threads.set(turn, link.items);
      }
      link.items.push(e);
      continue;
    }
    if (e.kind === "notice" && e.event === "completed") flush();
    main.push(e);
  }
  flush();
  return { main, threads };
}

// Paging counts what the main column draws: each non-work entry is one, and each run of work
// entries (folded into one thread link) is one. mainStart: the first index that keeps `limit` of
// those; it never splits a run, so a thread link shows all of its turn's work.
export function mainStart(entries, limit) {
  let count = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    const work = WORK_KINDS.has(entries[i].kind);
    if (!work || !WORK_KINDS.has(entries[i + 1]?.kind)) count++;
    if (count > limit) return i + 1;
  }
  return 0;
}

// How many main-column items entries[0, end) would draw (for "Show earlier (N)").
export function mainCount(entries, end) {
  let count = 0;
  for (let i = 0; i < end; i++) {
    if (!WORK_KINDS.has(entries[i].kind) || !WORK_KINDS.has(entries[i - 1]?.kind)) count++;
  }
  return count;
}

// The latest time among a thread's entries (ms), for "마지막 기록 오후 2:13".
export const lastAt = (items) => items.reduce((max, e) => (Number.isFinite(e.sentAt) && e.sentAt > max ? e.sentAt : max), -Infinity);

// What a reply thread asks: the question about one reply, with that reply quoted for context.
export function replyQuestion(replyText, question) {
  const excerpt = String(replyText ?? "").trim().slice(0, 1500).split("\n").map((l) => `> ${l}`).join("\n");
  return `대화 중 아래 답변에 대한 질문입니다.\n${excerpt}\n\n${question}`;
}
