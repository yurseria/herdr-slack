// 채팅/터미널 전환: layouts/slack.json 의 conversation-view 스택에서
// 'main'(터미널)과 slack-chat 페이지 중 무엇을 보일지 정한다.
// 에이전트가 있는 탭으로 오면 처음엔 채팅으로 연다. 사용자가 고른 쪽은 탭마다 기억한다.
import { layout, panes, terminals, spaces, run, notify } from "herdr";
import { openChat, showTerminal, findNode, activePage, pageMeta, presentationPane } from "./presentation.js";
import { withLayout, layoutBusy } from "./layoutlock.js";
import { recordSessions, resumePane } from "./resume.js";

const STACK = "conversation-view";
// 탭으로 옮겨 온 뒤 에이전트가 나타나기를 기다리는 시간(새 채널의 Claude 가 뜨는 동안).
const AGENT_WAIT_MS = 20000;

function isAgent(pane) {
  const term = pane.terminal && terminals().find((x) => x.address === pane.terminal);
  const argv0 = term?.argv?.[0]?.split("/").pop() ?? "";
  const what = `${term?.report?.app ?? ""} ${term?.foreground?.name ?? ""} ${term?.program?.key ?? ""} ${argv0}`.toLowerCase();
  return what.includes("claude") || what.includes("codex") || /\b(agy|antigravity)\b/.test(what);
}

export function activeTab() {
  return spaces().find((s) => s.active)?.tabs?.find((t) => t.active) ?? null;
}

// 탭에서 채팅으로 보일 에이전트 창(키보드가 있는 창 우선).
export function agentPane(tabId) {
  const mine = panes().filter((p) => p.tab === tabId && p.terminal && isAgent(p));
  return mine.find((p) => p.focused) ?? mine[0] ?? null;
}

export function chatShown() {
  const stack = findNode(layout(), STACK);
  return Boolean(stack) && stack.active !== "main";
}

const target = (p) => ({ pane: p.pane, tab: p.tab, terminal: p.terminal });

function go(state, cx, work) {
  if (state.switching) return;
  state.switching = true;
  cx.spawn(async (cx) => {
    try { await withLayout(work); } catch (error) {
      notify({ title: "보기를 바꾸지 못했어요", body: String(error?.message ?? error), level: "error" });
    }
    state.switching = false;
    cx.notify();
  });
}

// 머리줄 버튼: mode 는 "chat" | "terminal".
export function selectView(state, mode, cx) {
  const tab = activeTab();
  const pane = tab && agentPane(tab.id);
  if (!pane) return;
  state.chosen.set(tab.id, mode);
  go(state, cx, () => (mode === "chat" ? openChat(target(pane)) : showTerminal(target(pane))));
}

// 주기적으로 불린다. 탭이 바뀐 순간에만 보기를 고르고, 다른 탭의 채팅이 남아 있으면 터미널로 돌린다.
export function syncView(state, cx) {
  if (state.switching || layoutBusy()) return;
  const tree = layout();
  const stack = findNode(tree, STACK);
  if (!stack) return;
  const tab = activeTab();
  const current = tab?.id ?? null;
  const owner = presentationPane(pageMeta(activePage(tree)) ?? {}, panes());
  recordSessions(state, cx);
  if (state.tab !== current) {
    // Herdr 재시작으로 셸만 남은 탭: 지난 대화를 이어 붙이는 동안 채팅 화면("불러오는 중")을 보인다.
    const reviving = current && !agentPane(current) && resumePane(state, current, cx);
    if (reviving) {
      if (!(owner && owner.pane === reviving.pane)) go(state, cx, () => openChat(target(reviving)));
      return;
    }
    const pane = current && agentPane(current);
    // 새로 연 채널은 에이전트가 자기를 알리기까지 몇 초 걸린다. 그동안은 결정을 미루고 다시 본다.
    if (!pane && current && state.waitTab !== current) { state.waitTab = current; state.waitSince = Date.now(); }
    if (!pane && current && Date.now() - state.waitSince < AGENT_WAIT_MS) {
      if (stack.active !== "main" && (!owner || owner.tab !== current)) run("layout.select", { stack: STACK, child: "main" });
      return;
    }
    state.tab = current;
    if (pane && state.chosen.get(current) !== "terminal") {
      if (!(owner && owner.tab === current)) go(state, cx, () => openChat(target(pane)));
      return;
    }
  }
  if (stack.active !== "main" && (!owner || owner.tab !== current)) {
    run("layout.select", { stack: STACK, child: "main" });
  }
}
