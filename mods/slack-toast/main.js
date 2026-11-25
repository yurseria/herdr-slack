// Slack 레이아웃의 알림. Herdr 는 알림을 늘 오른쪽 아래에 띄우므로, 그 자리에 열리면 곧바로
// 채팅 칸의 오른쪽 위(채널 머리줄 아래)에 창으로 다시 열고 원래 것은 닫는다. 창 너비는 위 띠가 남긴
// shared "slack.windowW" 로 알고, 오른쪽 파일 패널(layout 의 "panel")이 열려 있으면 그 폭만큼 왼쪽으로
// 비켜서 패널의 탭을 가리지 않는다. 누르면 할 일(그 에이전트로 가기)을 하고 닫힌다.
import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, openOverlay, run, theme, shared, checking, layout, settings } from "herdr";

const WIDTH = 360;
const HEIGHT = 72;
const MARGIN = 16;
const TOP = 104;          // 위 띠(44) + 채널 머리줄 윗줄(52) 아래
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

// 채팅 칸의 오른쪽 끝(창 왼쪽에서 잰 px): 창 오른쪽 여백과, 열려 있으면 파일 패널 폭을 뺀다.
function chatRight(windowW) {
  const panel = findNode(layout(), "panel");
  const zoom = settings()?.zoom ?? 1;
  const panelW = panel && !panel.hidden && Number.isFinite(panel.size?.px) ? panel.size.px * zoom : 0;
  return windowW - PAD_RIGHT * zoom - panelW;
}
const DOT = { error: "blocked", warning: "working", success: "done", info: "accent" };

export default class SlackToast extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.placed = Boolean(p.placed);
    if (checking()) return;
    if (!this.placed) {
      const w = shared("slack.windowW") ?? 1200;
      const { overlay, ...rest } = p;
      openOverlay({ mod: "slack-toast", kind: "window", key: "slack-toast", frame: "none", width: WIDTH, height: HEIGHT,
        at: { x: Math.max(MARGIN, chatRight(w) - WIDTH - MARGIN), y: TOP }, props: { ...rest, placed: true } });
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
        .child(div().truncate().text_size(14).font_bold().text_color(t.ansi15 ?? t.foreground).child(p.title ?? ""))
        .when(Boolean(p.body), (el) => el.child(div().truncate().text_size(13).text_color(t.muted).child(String(p.body).split("\n", 1)[0]))))
      .child(div().id("slack-toast-close").size(24).flex_none().flex().items_center().justify_center().rounded(6)
        .text_size(16).text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); close(); }).child("×"));
  }
}
