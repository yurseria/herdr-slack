// How messages look: avatar + name line at the start of each author's run, later entries of the
// same run under it without repeating them (Slack's grouped messages); date pills, typing lines, glow.
// (typingLine and the non-Slack branches are left from the Discord look this mod was cloned from.)
import { div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { shared } from "herdr";

// Discord: round 40px avatars, blurple APP badge. Slack (layout "slack"): 36px rounded squares, grey APP badge.
const STYLES = {
  discord: { avatar: 40, gutter: 16, radius: (s) => s / 2, badgeBg: (t) => t.accent, badgeFg: (t) => t.accent_foreground },
  slack: { avatar: 36, gutter: 8, radius: () => 8, badgeBg: (t) => (isLight(t) ? "#1d1c1d14" : "#ffffff1f"), badgeFg: (t) => t.muted },
};
const style = () => (shared("layout") === "slack" ? STYLES.slack : STYLES.discord);

const AGENT_KINDS = new Set(["assistant", "tools", "thinking", "changes", "question", "card", "output", "error", "threadlink"]);

// Who wrote an entry: "user", "agent", or null (system lines: notices, notes).
export function authorOf(entry) {
  if (!entry) return null;
  if (entry.kind === "user" || entry.kind === "pending") return "user";
  if (AGENT_KINDS.has(entry.kind)) return "agent";
  return null;
}

// 바탕이 밝은 테마인가(슬랙 라이트 모드). 바탕색의 밝기로 판단한다.
let lastBg, lastLight;
function isLight(t) {
  if (t.background === lastBg) return lastLight; // 렌더마다 여러 번 불리니 바탕이 같으면 다시 계산하지 않는다.
  lastBg = t.background;
  const hex = String(t.background ?? "").replace(/^#/, "");
  if (!/^[0-9a-f]{6}/i.test(hex)) return (lastLight = false);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (lastLight = 0.299 * r + 0.587 * g + 0.114 * b > 140);
}
// 가장 진한 글자(이름, 날짜, 제목). 다크에선 흰색(ansi15), 라이트에선 본문색. ansi15 는 라이트 터미널에서 회색이다.
export const strong = (t) => (isLight(t) ? t.foreground : t.ansi15 ?? t.foreground);
// Claude 의 주황. 다른 에이전트는 프로그램 색(없으면 진한 글자색).
const CLAUDE_ORANGE = "#d97757";
export const nameColor = (t, program) => /claude/i.test(`${program?.key ?? ""} ${program?.name ?? ""}`) ? CLAUDE_ORANGE
  : program?.color ?? program?.tile ?? strong(t);

export function programFace(t, program, size, radius) {
  const glyph = Math.round(size * 0.6);
  const art = !program?.icon ? div().text_size(size * 0.45).font_semibold().child((program?.name ?? "A").slice(0, 1))
    : program.tint ? svg(program.icon).size(glyph).text_color(program.color ?? t.accent_foreground)
      : image(program.icon).w(glyph).h(glyph);
  return div().size(size).flex_none().rounded(radius).flex().items_center().justify_center()
    .bg(program?.tile ?? t.accent).text_color(t.accent_foreground).child(art);
}

export function userFace(t, name, size, radius, picture = null) {
  if (picture) return image(picture).size(size).flex_none().rounded(radius);
  return div().size(size).flex_none().rounded(radius).flex().items_center().justify_center()
    .bg(t.accent).text_size(16).font_semibold().text_color(t.accent_foreground)
    .child(Array.from(name)[0]?.toUpperCase() ?? "?");
}

// One row. `head` shows the avatar and the name line; otherwise the body sits indented.
export function messageRow(t, { author, head, at, userName, userImage = null, program, body }) {
  const st = style();
  if (!author) return h_flex().w_full().pl(st.avatar + st.gutter).child(div().flex_1().min_w(0).child(body));
  const agent = author === "agent";
  const name = agent ? program?.name ?? "Agent" : userName;
  const radius = st.radius(st.avatar);
  const avatar = agent ? programFace(t, program, st.avatar, radius) : userFace(t, userName, st.avatar, radius, userImage);
  return h_flex().w_full().items_start().gap(st.gutter)
    .child(div().w(st.avatar).flex_none().when(head, (el) => el.mt(2).child(avatar)))
    .child(v_flex().flex_1().min_w(0).gap(2)
      .when(head, (el) => el.child(h_flex().gap(6).items_center()
        .child(div().text_size(15).font_semibold().text_color(agent ? nameColor(t, program) : strong(t)).child(name))
        .when(agent, (row) => row.child(div().px(4).h(15).flex().items_center().rounded(3).bg(st.badgeBg(t))
          .text_size(10).font_semibold().text_color(st.badgeFg(t)).child("APP")))
        .when(Number.isFinite(at), (row) => row.child(div().text_size(12).text_color(t.dim).child(clock(at))))))
      .child(body));
}

// Discord 의 '… 님이 입력하고 있어요' 한 줄. 누르면 지금 하는 일(명령과 출력)을 아래에 편다.
export function typingLine(t, { program, detail, waiting, open, canOpen, onToggle, extra }) {
  const dot = (period) => div().size(6).flex_none().rounded_full().bg(t.foreground)
    .loop("opacity", { from: 0.25, to: 1, period });
  const name = program?.name ?? "에이전트";
  return h_flex().id("typing").w_full().h(22).px(4).gap(6).items_center().text_size(13)
    .when(canOpen, (el) => el.cursor_pointer().on_click(onToggle).hover((s) => s.text_color(t.foreground)))
    .text_color(waiting ? t.blocked : t.muted)
    .child(h_flex().flex_none().gap(3).items_center().child(dot(900)).child(dot(1100)).child(dot(1300)))
    .child(div().flex_none().font_semibold().text_color(nameColor(t, program)).child(name))
    .child(div().flex_none().child(waiting ? "님이 기다리고 있어요" : "님이 입력하고 있어요…"))
    .when(Boolean(detail), (el) => el.child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`· ${detail}`)))
    .when(!detail, (el) => el.child(div().flex_1()))
    .when(canOpen, (el) => el.child(svg(`mods/slack-chat/icons/${open ? "chevron-down" : "chevron"}.svg`).size(12).flex_none().text_color(t.dim)))
    .when(Boolean(extra), (el) => el.child(extra));
}

const pad = (n) => String(n).padStart(2, "0");
// "오전 10:46" (Slack · Discord 모두 한국어 시각 표기).
export function clock(ms) {
  const d = new Date(ms);
  const h = d.getHours();
  return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${pad(d.getMinutes())}`;
}

export function dayKey(ms) {
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
export function dayLabel(ms) {
  const d = new Date(ms), now = new Date();
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86400000);
  if (diff === 0) return "오늘";
  if (diff === 1) return "어제";
  const md = `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}요일`;
  return d.getFullYear() === now.getFullYear() ? md : `${d.getFullYear()}년 ${md}`;
}

// 날짜가 바뀌는 자리. Slack: 가로선 위 둥근 알약, Discord: 가는 선 가운데 작은 글씨.
export function dateDivider(t, ms, id) {
  const label = dayLabel(ms);
  const line = () => div().flex_1().h(1).bg(t.border);
  if (shared("layout") === "slack") {
    return h_flex().id(id).w_full().mb(10).items_center()
      .child(line())
      .child(div().flex_none().px(14).h(28).flex().items_center().rounded_full().border_1().border_color(t.border)
        .bg(t.background).text_size(13).font_bold().text_color(strong(t)).child(label))
      .child(line());
  }
  return h_flex().id(id).w_full().mb(10).gap(8).items_center()
    .child(line()).child(div().flex_none().text_size(12).font_semibold().text_color(t.dim).child(label)).child(line());
}

// Slack 의 입력 중 표시: 입력창 바로 아래 12px 한 줄, 점 애니메이션 없이 굵은 이름 + "님이 입력 중…".
// 지금 하는 일은 흐리게 뒤에 붙고, 누르면 입력창 위에 상세(명령과 출력)를 편다.
export function slackTyping(t, { active, program, detail, waiting, open, canOpen, onToggle, gen = 0, running = false }) {
  const name = program?.name ?? "에이전트";
  const words = waiting ? "님이 답을 기다리고 있어요" : "님이 입력 중…";
  // The same glow as the thread link's loading text (shimmerText), over the bold name and the words.
  const line = (color, nameColor) => h_flex().gap(4).items_center().whitespace_nowrap()
    .child(div().flex_none().font_bold().text_color(nameColor).child(name))
    .child(div().flex_none().text_color(color).child(words));
  return h_flex().id("typing").w_full().h(20).px(2).gap(4).items_center().text_size(12)
    .text_color(waiting ? t.blocked : t.dim)
    .when(active && canOpen, (el) => el.cursor_pointer().on_click(onToggle).hover((s) => s.text_color(t.foreground)))
    .when(active, (el) => el
      .child(waiting ? line(t.blocked, t.blocked)
        : shimmerBox(line(t.dim, t.muted), () => line(t.muted, strong(t)), textWidth(`${name} ${words}`, 12), gen, "glow-typing", running))
      .when(Boolean(detail) && !waiting, (row) => row.child(div().flex_1().min_w(0).truncate().child(`· ${detail}`)))
      .when(!detail || waiting, (row) => row.child(div().flex_1()))
      .when(canOpen, (row) => row.child(div().flex_none().child(open ? "상세 닫기" : "상세 보기"))));
}

// ---- loading glow ----
// Letters light up as a glow sweeps across them and back (native loops, no timer). GPUI can't fill
// text with a gradient, so a bright copy of the content sits under a moving window that clips it;
// the copy moves the opposite way at the same pace, so it stays exactly over the dim content.
// Two windows (wide and faint, narrow and full) soften the glow's edges. The travel comes from an
// estimate of the text's width: measuring it with on_size_change re-laid the chat out and blanked it.
const SHIMMER_W = 70;
// One sweep, left to right, then again from the left. A loop can't do it: it goes there and back on
// a clock every view shares, and a new element id doesn't restart it. So the glow uses a transition:
// each sweep the chat draws it at the start under a new id (no animation on a first draw), then a
// moment later sets its target to the far end, which the transition runs to. See Chat.shimmerGen.
export const SHIMMER_SWEEP_MS = 1400;
const SHIMMER_RUN_MS = SHIMMER_SWEEP_MS - 100;
const WIDE = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af\u3000-\u9fff\uff00-\uffef]/;

export const textWidth = (text, size = 12) =>
  Array.from(String(text)).reduce((w, ch) => w + (WIDE.test(ch) ? size : size * 0.54), 0);

// dim / bright: the same content in its normal and its lit colors. gen: the sweep's number; a new
// number gives the glow new ids, which starts it again from the left. key: where it is, so two
// glows on screen never share ids (and so never share their motion).
// running: false draws the glow at its start (left, outside the text), true sets it to the far end.
export function shimmerBox(dim, bright, width, gen = 0, key = "glow", running = false) {
  const move = { duration: SHIMMER_RUN_MS, easing: "linear" };
  const glow = (w, opacity, n) => {
    const left = running ? Math.round(width) + w : -w;
    return div().id(`${key}-${n}-${gen}`).absolute().top(0).bottom(0).w(w).overflow_hidden().opacity(opacity)
      .left(left).transition("left", move)
      .child(div().id(`${key}-${n}-${gen}-copy`).absolute().top(0).left(-left).transition("left", move).child(bright()));
  };
  // Takes the rest of its row and clips both copies at the same edge (no "…": an ellipsis on the dim
  // copy alone left the bright copy's letters over it).
  return div().relative().flex_1().min_w(0).overflow_hidden().child(dim)
    .child(glow(SHIMMER_W, 0.45, "wide"))
    .child(glow(Math.round(SHIMMER_W / 2.5), 0.8, "core"));
}

export function shimmerText(t, text, gen = 0, key = "glow-text", running = false, size = 12) {
  return shimmerBox(div().whitespace_nowrap().child(text),
    () => div().whitespace_nowrap().text_color(t.muted).child(text), textWidth(text, size), gen, key, running);
}
