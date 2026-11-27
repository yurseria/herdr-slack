// Slack 레이아웃의 알림. Herdr 는 알림을 늘 오른쪽 아래에 띄우므로, 그 자리에 열리면 곧바로
// 채팅 칸(채널 이름 줄과 탭 줄 아래)의 오른쪽 위에 창으로 다시 열고 원래 것은 닫는다. 창 너비는 위 띠가 남긴
// shared "slack.windowW" 로 알고, 채팅 칸의 오른쪽 끝은 창 오른쪽 여백, (열려 있으면) 파일 패널 폭,
// 그리고 slack-chat 이 남긴 스레드 칸 폭(shared "slack.threadW")을 빼서 잰다. 누르면 할 일(그 에이전트로 가기)을 하고 닫힌다.
import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, openOverlay, run, theme, shared, checking, layout, settings } from "herdr";

const WIDTH = 360;
const HEIGHT = 72;
const MARGIN = 16;
const DEFAULT_MS = 6000;
const PAD_RIGHT = 6;      // 레이아웃 오른쪽 여백(pad-right)

function findNode(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

// 레이아웃 노드의 px 높이(숨었으면 0, 크기가 없으면 fallback).
function heightOf(id, fallback) {
  const node = findNode(layout(), id);
  if (node?.hidden) return 0;
  return Number.isFinite(node?.size?.px) ? node.size.px : fallback;
}

// 레이아웃 노드의 px 폭(숨었거나 폭이 없으면 0).
function widthOf(id) {
  const node = findNode(layout(), id);
  return node && !node.hidden && Number.isFinite(node.size?.px) ? node.size.px : 0;
}

// 채팅 칸의 위쪽 끝 아래(창 위에서 잰 px): 위 띠와 채널 머리줄(이름 줄 + 탭 줄) 아래로 MARGIN 만큼.
function chatTop() {
  const zoom = settings()?.zoom ?? 1;
  return (heightOf("topbar", 44) + heightOf("header", 92) + MARGIN) * zoom;
}

// 채팅 칸의 오른쪽 끝(창 왼쪽에서 잰 px): 창 오른쪽 여백, 파일 패널, 스레드 칸을 뺀 자리.
// 왼쪽 끝(레일+사이드바)보다 왼쪽으로는 가지 않는다.
function chatRight(windowW) {
  const zoom = settings()?.zoom ?? 1;
  const thread = Number(shared("slack.threadW")) || 0;
  const left = (widthOf("rail") + widthOf("sidebar")) * zoom;
  return Math.max(left + WIDTH + MARGIN * zoom, windowW - (PAD_RIGHT + widthOf("panel") + thread) * zoom);
}
const DOT = { error: "blocked", warning: "working", success: "done", info: "accent" };

// 제목 글자: 다크에선 흰색(ansi15), 라이트 테마(밝은 바탕)에선 본문색. ansi15 는 라이트 터미널에서 회색이다.
function strong(t) {
  const hex = String(t.background ?? "").replace(/^#/, "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const light = /^[0-9a-f]{6}/i.test(hex) && 0.299 * r + 0.587 * g + 0.114 * b > 140;
  return light ? t.foreground : t.ansi15 ?? t.foreground;
}

export default class SlackToast extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.placed = Boolean(p.placed);
    if (checking()) return;
    if (!this.placed) {
      const w = shared("slack.windowW") ?? 1200;
      const { overlay, ...rest } = p;
      openOverlay({ mod: "slack-toast", kind: "window", key: "slack-toast", frame: "none", width: WIDTH, height: HEIGHT,
        at: { x: Math.max(MARGIN, Math.round(chatRight(w) - WIDTH - MARGIN * (settings()?.zoom ?? 1))), y: Math.round(chatTop()) }, props: { ...rest, placed: true } });
      closeOverlay(overlay);
      return;
    }
    cx.timer.after(p.timeout ?? DEFAULT_MS, () => closeOverlay(props()?.overlay));
  }

  render() {
    if (!this.placed && !checking()) return div();
    const t = theme();
    const p = props() ?? {};
    const close = () => closeOverlay(p.overlay);
    const stop = (_e, cx) => cx.stop_propagation(); // a press on the toast is a click, not a window drag
    return h_flex().id("slack-toast").size_full().px(14).gap(12).items_center().rounded(10)
      .border_1().border_color(t.border).bg(t.popover).shadow_lg().cursor_pointer()
      .hover((s) => s.bg(t.raised))
      .on_mouse_down("left", stop)
      .on_click(() => { if (p.action?.name) run(p.action.name, p.action.args ?? {}); close(); })
      .child(p.icon ? image(p.icon).size(28).flex_none().rounded(6)
        : div().size(10).rounded_full().flex_none().bg(t[DOT[p.level] ?? "accent"]))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(div().truncate().text_size(14).font_bold().text_color(strong(t)).child(p.title ?? ""))
        .when(Boolean(p.body), (el) => el.child(div().truncate().text_size(13).text_color(t.muted).child(String(p.body).split("\n", 1)[0]))))
      .child(div().id("slack-toast-close").size(24).flex_none().flex().items_center().justify_center().rounded(6)
        .text_size(16).text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); close(); }).child("×"));
  }
}
