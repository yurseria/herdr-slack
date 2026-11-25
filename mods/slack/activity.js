// '내 활동': 내가 작업한 세션(에이전트)을 마지막으로 움직인 시각의 역순으로, 날짜별로 묶어 보인다(슬랙처럼).
//   shared "slack.activityAt"  { [terminal address]: { at: ms, seq } }   마지막으로 바뀐 때(seq 가 오르면 지금)
//   shared "slack.activityUnread"  true 면 읽지 않은 것(입력 필요 · 끝났는데 안 본 것)만
// Herdr 는 에이전트가 언제 바뀌었는지 시각으로 주지 않아서, 레일이 seq 가 오르는 것을 보고 적어 둔다.
// 처음 보는 에이전트는 그 탭의 changed_at(없으면 working_since)으로 시작한다. 둘 다 없으면(앱을 켠 뒤 한 번도
// 안 바뀐 세션) 대화 로그의 마지막 메시지 시각을 읽어 채운다(fillFromLogs).
import { agents, spaces, shared, setShared, exec, appHome } from "herdr";
import * as fs from "fs/promises";

export const ACTIVITY_KEY = "slack.activityAt";
export const UNREAD_ONLY_KEY = "slack.activityUnread";

// 레일의 타이머에서 부른다. 바뀐 것이 있을 때만 쓴다.
export function trackActivity() {
  const saved = shared(ACTIVITY_KEY) ?? {};
  const tabs = new Map(spaces().flatMap((s) => s.tabs.map((t) => [t.id, t])));
  const live = agents();
  const next = {};
  let changed = false;
  for (const a of live) {
    const old = saved[a.address];
    if (!old) {
      const tab = tabs.get(a.tab);
      next[a.address] = { at: tab?.changed_at ?? tab?.working_since ?? null, seq: a.seq };
      changed = true;
    } else if (a.seq > old.seq) {
      next[a.address] = { at: Date.now(), seq: a.seq };
      changed = true;
    } else next[a.address] = old;
  }
  // 사라진 에이전트는 지운다.
  if (Object.keys(saved).length !== live.length) changed = true;
  if (changed) setShared(ACTIVITY_KEY, next);
}

export const activityAt = (a) => (shared(ACTIVITY_KEY) ?? {})[a.address]?.at ?? null;
export const isUnread = (a) => a.status === "blocked" || a.status === "done";

// 날짜 머리: 오늘 · 어제 · 11월 23일 일요일 (올해가 아니면 연도도).
export function dayLabel(ms, now = Date.now()) {
  if (ms == null) return "날짜 모름";
  const d = new Date(ms);
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(new Date(now)) - start(d)) / 86400000);
  if (days === 0) return "오늘";
  if (days === 1) return "어제";
  const week = "일월화수목금토"[d.getDay()];
  const year = d.getFullYear() !== new Date(now).getFullYear() ? `${d.getFullYear()}년 ` : "";
  return `${year}${d.getMonth() + 1}월 ${d.getDate()}일 ${week}요일`;
}

// 시각: 오후 2:13
export function timeLabel(ms) {
  if (ms == null) return "";
  const d = new Date(ms);
  const h = d.getHours();
  return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// [{ label, items }] 최근 날짜 먼저, 날짜 안에서도 최근 먼저. 날짜 모름은 맨 아래.
export function groupByDay(list, now = Date.now()) {
  const sorted = [...list].sort((a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity) || b.agent.seq - a.agent.seq);
  const groups = [];
  for (const item of sorted) {
    const label = dayLabel(item.at, now);
    if (groups.at(-1)?.label !== label) groups.push({ label, items: [] });
    groups.at(-1).items.push(item);
  }
  return groups;
}

// 시각을 모르는 세션은 대화 로그의 마지막 메시지 시각으로 채운다. Flockbook 사이드카(slack-chat/bin)가
// 터미널의 로그를 찾아 요약 행을 주는데, 그 행의 ts(ms) 중 가장 늦은 것을 쓴다. 세션마다 한 번만 묻는다.
const asked = new Set();
export async function fillFromLogs() {
  const bin = `${appHome()}/mods/slack-chat/bin/flockbook-modfeed`;
  if (!(await fs.exists(bin).catch(() => false))) return;
  const missing = agents().filter((a) => !a.address.includes("/") && !asked.has(a.address)
    && (shared(ACTIVITY_KEY) ?? {})[a.address] && (shared(ACTIVITY_KEY) ?? {})[a.address].at == null);
  for (const a of missing) {
    asked.add(a.address);
    const r = await exec(bin, ["feed", "--terminal", a.address, "--cache", `${appHome()}/data/slack-chat/flockbook-cache.json`,
      "--home", appHome()], { timeout: 5000 }).catch(() => null);
    if (!r || r.code !== 0) continue;
    let last = null;
    for (const line of String(r.stdout ?? "").split("\n")) {
      let o; try { o = JSON.parse(line); } catch { continue; }
      if (o.type === "row" && Number.isFinite(o.ts) && (last == null || o.ts > last)) last = o.ts;
    }
    const saved = shared(ACTIVITY_KEY) ?? {};
    if (last != null && saved[a.address] && saved[a.address].at == null) {
      setShared(ACTIVITY_KEY, { ...saved, [a.address]: { ...saved[a.address], at: last } });
    }
  }
}
