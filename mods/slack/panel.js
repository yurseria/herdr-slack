// 오른쪽 패널(layouts/slack.json 의 panel): 위에 탭 줄(panel-tabs), 아래 panel-body 스택.
// 파일 및 링크 / 터미널은 머리줄 버튼이 고르고, 탭 줄은 파일 및 링크일 때만 [미리보기] [파일] 로 보인다.
//   미리보기  chat-preview 모드(채팅의 파일 링크, 파일 트리에서 연 파일)
//   파일      slack-files 모드(파일 트리, 바뀐 파일만 보기)
//   터미널    채널(스페이스)마다 셸 하나. hc run 으로 탭 없이 띄우고 panel-term-<채널> 블록에 보인다.
// 터미널 탭에서는 패널을 TERM_PX 로 넓히고, 다른 탭으로 가면 넓히기 전 폭으로 돌린다.
// 채팅의 스레드 칸과는 한 번에 하나만 보인다(스레드 쪽은 slack-chat 이 맡는다).
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { layout, spaces, panes, focused, terminals, shared, setShared, hc, notify, openOverlay, closeOverlay, settings } from "herdr";
import { herdr } from "./backstage.js";
import { icon, strong } from "./parts.js";
import { withLayout, layoutBusy } from "./layoutlock.js";

export const PANEL = "panel";
const STACK = "panel-body";
const TABS = "panel-tabs";
const PREVIEW = "chat-preview";
const FILES = "files";
const TERM_PREFIX = "panel-term-";
const TERM_PX = 560;
const TERM_FONT = 12;                  // 패널 터미널만 작은 글자(다른 터미널은 Herdr 기본 14)
const WIDTH_KEY = "slack.panelW";      // 터미널 탭으로 넓히기 전 폭(넓혀 있는 동안만 값이 있다)
const TERMS_KEY = "slack.panelTerms";  // { 스페이스 id: 터미널 주소 }
const BIG_KEY = "slack.bigPreview";    // 크게 보기 창의 overlay id

function findNode(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

const termId = (space) => TERM_PREFIX + String(space).replace(/[^\w-]/g, "_");
const activeSpace = () => spaces().find((s) => s.active) ?? null;
const alive = (address) => Boolean(address) && terminals().some((x) => x.address === address);

// 패널이 보이는지, 어느 탭인지(preview | files | terminal).
export function panelState(tree = layout()) {
  const panel = findNode(tree, PANEL);
  const active = findNode(tree, STACK)?.active ?? null;
  const tab = !active ? null : active === PREVIEW ? "preview" : active.startsWith(TERM_PREFIX) ? "terminal" : "files";
  return { shown: Boolean(panel) && !panel.hidden, tab, active, width: panel?.size?.px ?? null };
}

// 이 채널의 셸 주소. 없거나 끝났으면 채널 폴더에서 새로 띄운다(Herdr 탭에는 나오지 않는다).
async function ensureTerminal(space) {
  const saved = shared(TERMS_KEY) ?? {};
  if (alive(saved[space.id])) return saved[space.id];
  const args = ["run", "--bg", "--json", "--no-parent", "--keep", "--label", `slack.panel=${String(space.id).split("/").pop()}`];
  if (space.folder) args.push("--cwd", space.folder);
  if (space.machine) args.push("--on", space.machine);
  const r = await hc(args);
  let address = null;
  try { address = JSON.parse(r.stdout).address; } catch {}
  if (!address) throw new Error(r.stderr?.trim() || "셸을 띄우지 못했어요");
  setShared(TERMS_KEY, { ...(shared(TERMS_KEY) ?? {}), [space.id]: address });
  return address;
}

// 터미널 탭에서 나오면 넓히기 전 폭으로 돌린다.
async function restoreWidth() {
  const saved = shared(WIDTH_KEY);
  if (saved == null) return;
  setShared(WIDTH_KEY, null);
  if (panelState().width !== saved) await herdr("layout.resize", { id: PANEL, px: saved });
}

// 다른 탭으로 갈 때 키보드를 채팅 쪽 창으로 돌려준다(패널 터미널이 잡고 있으면 미리보기가 어느 채팅 것인지 모른다).
async function refocusPane() {
  if (focused()?.pane) return;
  const tab = activeSpace()?.tabs?.find((x) => x.active);
  const pane = panes().find((p) => p.tab === tab?.id && p.focused) ?? panes().find((p) => p.tab === tab?.id);
  if (pane) await herdr("pane.focus", { pane: pane.pane }).catch(() => {});
}

// 터미널 탭: 이 채널의 셸 블록을 고르고(없으면 레이아웃에 넣고) 패널을 넓힌다.
export async function openTerminalTab(space = activeSpace(), focus = true) {
  if (!space) return;
  const address = await ensureTerminal(space);
  // 셸을 띄우는 동안 채팅 보기가 바뀌었을 수 있으니, 잠근 뒤에 레이아웃을 새로 읽어 고친다.
  await withLayout(async () => {
    const tree = layout();
    const id = termId(space.id);
    const st = panelState(tree);
    const widen = shared(WIDTH_KEY) == null;
    if (widen && st.width) setShared(WIDTH_KEY, st.width);
    const node = findNode(tree, id);
    if (node?.content?.terminal !== address || node?.font_size !== TERM_FONT) {
      const next = JSON.parse(JSON.stringify(tree));
      const stack = findNode(next, STACK);
      stack.children = stack.children.filter((c) => !c.id.startsWith(TERM_PREFIX) || (c.id !== id && alive(c.content?.terminal)));
      stack.children.push({ id, type: "block", font_size: TERM_FONT, content: { terminal: address } });
      stack.active = id;
      const panel = findNode(next, PANEL);
      panel.hidden = false;
      const tabs = findNode(next, TABS);
      if (tabs) tabs.hidden = true;
      if (widen && (st.width ?? 0) < TERM_PX) panel.size = { px: TERM_PX };
      await herdr("layout.set", { layout: next });
    } else {
      await herdr("layout.select", { stack: STACK, child: id });
      await herdr("layout.hide", { id: TABS });
      if (widen && (st.width ?? 0) < TERM_PX) await herdr("layout.resize", { id: PANEL, px: TERM_PX });
      await herdr("layout.show", { id: PANEL });
    }
  });
  if (focus) await herdr("pane.focus", { terminal: address }).catch(() => {});
}

export async function selectPanelTab(tab) {
  if (tab === "terminal") return openTerminalTab();
  await withLayout(async () => {
    await herdr("layout.select", { stack: STACK, child: tab === "preview" ? PREVIEW : FILES });
    await herdr("layout.show", { id: TABS });
    await herdr("layout.show", { id: PANEL });
    await restoreWidth();
  });
  await refocusPane();
}

export const hidePanel = () => herdr("layout.hide", { id: PANEL });

// 머리줄·레일 버튼. "files" 는 파일 및 링크(미리보기나 파일 탭), "terminal" 은 터미널 탭. 이미 보이면 닫는다.
export function panelButtonOn(kind, st = panelState()) {
  return st.shown && (kind === "terminal" ? st.tab === "terminal" : st.tab !== "terminal");
}

export function togglePanel(kind) {
  const st = panelState();
  run(async () => {
    if (panelButtonOn(kind, st)) return hidePanel();
    if (kind === "terminal") return openTerminalTab();
    return selectPanelTab(st.tab === "preview" ? "preview" : "files");
  });
}

function run(work) {
  work().catch((error) => notify({ title: "패널을 바꾸지 못했어요", body: String(error?.message ?? error), level: "error" }));
}

// 머리줄 블록이 300ms 마다 부른다(탭 줄 블록은 터미널일 때 숨으므로 늘 보이는 머리줄이 맡는다).
// 터미널이면 채널이 바뀔 때 그 채널 셸로 바꾸고, 아니면 넓혔던 폭을 돌린다. 탭 줄은 터미널일 때만 숨긴다.
export function syncPanel(view, cx) {
  if (view.panelBusy || view.switching || layoutBusy()) return;
  const st = panelState();
  let work = null;
  const tabs = findNode(layout(), TABS);
  if (tabs && Boolean(tabs.hidden) !== (st.tab === "terminal")) work = () => withLayout(() => herdr(st.tab === "terminal" ? "layout.hide" : "layout.show", { id: TABS }));
  else if (st.tab !== "terminal" && shared(WIDTH_KEY) != null) work = () => withLayout(restoreWidth);
  else if (st.shown && st.tab === "terminal") {
    const space = activeSpace();
    const address = (shared(TERMS_KEY) ?? {})[space?.id];
    const want = space && termId(space.id);
    if (space && (st.active !== want || !alive(address)) && view.panelFailed !== space.id)
      work = () => openTerminalTab(space, false).catch((error) => {
        view.panelFailed = space.id;
        throw error;
      });
  }
  if (!work) return;
  view.panelBusy = true;
  cx.spawn(async (cx) => {
    try { await work(); } catch (error) {
      notify({ title: "패널 터미널을 열지 못했어요", body: String(error?.message ?? error), level: "error" });
    }
    view.panelBusy = false;
    cx.notify();
  });
}

// 미리보기를 채팅 칸만 한 창으로 띄운다. 같은 미리보기(chat-preview)를 위에 제목 띠를 단 레이아웃으로 연다.
function openBigPreview() {
  const old = shared(BIG_KEY);
  if (old) closeOverlay(old);
  const zoom = settings()?.zoom ?? 1;
  const w = shared("slack.windowW") ?? 1400;
  const width = Math.round(Math.max(600, Math.min(1100, w / zoom - 520)));
  const id = openOverlay({ kind: "window", key: "slack-big-preview", width, height: 720, frame: "none",
    layout: { type: "column", children: [
      { type: "block", size: { px: 36 }, content: { mod: "slack", props: { view: "preview-bar" } } },
      { type: "block", content: { mod: "chat-preview" } },
    ] } });
  setShared(BIG_KEY, id ?? null);
}

export function renderPreviewBar(_view, t) {
  const close = () => { const id = shared(BIG_KEY); if (id) closeOverlay(id); setShared(BIG_KEY, null); };
  return h_flex().id("big-preview-bar").size_full().px(12).gap(8).items_center().rounded_t(10).bg(t.popover)
    .border_1().border_color(t.border)
    .child(icon("eye", 14)).child(div().flex_1().text_size(13).font_semibold().text_color(strong(t)).child("미리보기"))
    .child(div().id("big-preview-close").size(24).flex().items_center().justify_center().rounded(6).cursor_pointer()
      .text_size(16).text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(close).child("×"));
}

function panelTab(t, id, iconName, label, on, action) {
  return h_flex().id(id).h_full().flex_none().cursor_pointer().on_click(() => run(action))
    .child(v_flex().h_full().justify_end()
      .child(h_flex().px(2).pb(7).gap(6).items_center().text_size(13).font_semibold()
        .text_color(on ? strong(t) : t.muted).hover((s) => s.text_color(strong(t)))
        .child(icon(iconName, 14)).child(div().child(label)))
      .child(div().h(2).w_full().rounded_t(2).bg(on ? strong(t) : "#00000000")));
}

function smallButton(t, id, content, tip, action) {
  return div().id(id).h(26).px(6).flex_none().flex().items_center().justify_center().gap(4).rounded(6).cursor_pointer()
    .text_size(12).text_color(t.muted).tooltip(tip).hover((s) => s.bg(t.raised).text_color(strong(t)))
    .on_click(action).child(content);
}

export function renderPanelTabs(_view, t) {
  const st = panelState();
  return h_flex().id("panel-tabs").size_full().pl(10).pr(4).gap(16).items_end()
    .child(panelTab(t, "panel-tab-preview", "eye", "미리보기", st.tab === "preview", () => selectPanelTab("preview")))
    .child(panelTab(t, "panel-tab-files", "files", "파일", st.tab === "files", () => selectPanelTab("files")))
    .child(div().flex_1())
    .child(h_flex().h_full().pb(4).gap(2).items_center()
      .when(st.tab === "preview", (el) => el.child(smallButton(t, "panel-big", icon("maximize", 14), "크게 보기", openBigPreview)))
      .child(smallButton(t, "panel-close", div().text_size(16).child("×"), "패널 닫기", () => run(hidePanel))));
}
