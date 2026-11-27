// 채널 머리줄(92px). 채널 = 스페이스(본 체크아웃·worktree).
//   위 줄   # 채널 이름(브랜치) ⌄ · 소개(지금 세션 제목) … 채팅/터미널 · 에이전트 수 · 나누기 · 찾기 · 메뉴
//   아래 줄 이 채널의 세션 탭들(Paseo 의 작업 영역 탭처럼) · + (새 세션) … 오른쪽 끝에 파일 및 링크 · 터미널(오른쪽 패널)
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, panes, agents, run, home, openOverlay } from "herdr";
import { programAvatar } from "./parts.js";
import { icon, strong } from "./parts.js";
import { agentPane, chatShown, selectView } from "./chatview.js";
import { cleanTitle, channelNames, tabTitle } from "./look.js";
import { channelMenuOverlay } from "./sectionmenu.js";
import { newChannelOverlay } from "./newchannel.js";
import { panelState, panelButtonOn, togglePanel } from "./panel.js";

export const HEADER_HEIGHT = 92;


const tilde = (path, homeDir) => (path === homeDir ? "~" : path.startsWith(`${homeDir}/`) ? `~${path.slice(homeDir.length)}` : path);

// 주제: 지금 탭에서 키보드가 있는 창(없으면 첫 창)의 폴더와 브랜치.
function topic(tab) {
  const mine = panes().filter((p) => p.tab === tab.id && p.cwd);
  const pane = mine.find((p) => p.focused) ?? mine[0];
  if (!pane) return "";
  return [tilde(pane.cwd, home()), pane.branch ? `⎇ ${pane.branch}` : null].filter(Boolean).join(" · ");
}

function toolButton(t, id, iconName, tip, on, action) {
  return div().id(id).size(28).flex_none().flex().items_center().justify_center().rounded(6).cursor_pointer().tooltip(tip)
    .text_color(on ? strong(t) : t.muted).when(on, (el) => el.bg(t.raised))
    .hover((s) => s.bg(t.raised).text_color(strong(t)))
    .on_click(action).child(icon(iconName, 18));
}

// 슬랙 채널 탭 하나: 아이콘 + 이름, 고르면 흰 글씨와 아래 2px 막대.
function channelTab(t, id, iconName, label, on, action, { lead = null, onRight = null, onMiddle = null, tip = null } = {}) {
  return v_flex().id(id).h_full().flex_none().max_w(240).justify_end().cursor_pointer().on_click(action)
    .when(Boolean(onRight), (el) => el.on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); onRight(); }))
    .when(Boolean(onMiddle), (el) => el.on_mouse_down("middle", (_e, cx) => { cx.stop_propagation(); onMiddle(); }))
    .when(Boolean(tip), (el) => el.tooltip(tip))
    .child(h_flex().px(4).pb(8).gap(6).items_center().text_size(14).font_semibold()
      .text_color(on ? strong(t) : t.muted).hover((s) => s.text_color(strong(t)))
      .child(lead ?? icon(iconName, 15)).child(div().min_w(0).truncate().child(label)))
    .child(div().h(2).w_full().rounded_t(2).bg(on ? strong(t) : "#00000000"));
}

// 채팅 | 터미널 두 칸 스위치(지금 탭에 에이전트가 있을 때).
function viewSwitch(view, t, chat) {
  const seg = (mode, label, on) => div().id(`view-${mode}`).px(10).h(24).flex().items_center().rounded(4)
    .cursor_pointer().text_size(13).font_bold()
    .bg(on ? t.raised : "#00000000").text_color(on ? strong(t) : t.dim)
    .hover((s) => s.text_color(strong(t)))
    .on_click((_e, cx) => selectView(view, mode, cx)).child(label);
  return h_flex().flex_none().p(2).gap(2).rounded(6).border_1().border_color(t.border)
    .child(seg("chat", "채팅", chat)).child(seg("terminal", "터미널", !chat));
}

// 채널 소개(슬랙의 채널 이름 옆 설명): 이 채널 에이전트의 세션 제목. 키보드가 있는 에이전트를 먼저.
function sessionTitle(tab) {
  const mine = agents().filter((a) => a.tab === tab.id);
  const agent = mine.find((a) => a.focused) ?? mine[0];
  return agent ? cleanTitle(agent.title) : "";
}

export function renderHeader(view, t) {
  const space = spaces().find((s) => s.active);
  const tab = space?.tabs.find((x) => x.active);
  const allAgents = agents();
  const allPanes = panes();
  const tabs = (space?.tabs ?? []).filter((x) => !x.settled || x.active);
  const place = tab ? topic(tab) : "";
  // 세션 제목이 있으면 그것을, 없으면 폴더 · 브랜치를 소개로 보인다. 폴더 · 브랜치는 툴팁에 늘 남긴다.
  const channelName = space ? channelNames(spaces(), allAgents).get(space.id) : null;
  // 세션 제목이 채널 이름이 된 채널은 소개가 같은 말을 되풀이하지 않도록 폴더 · 브랜치를 보인다.
  const title = tab ? sessionTitle(tab) : "";
  const about = (title && title !== channelName ? title : "") || place;
  const agent = Boolean(tab && agentPane(tab.id));
  const chat = agent && chatShown();
  const panel = panelState();
  return v_flex().id("header").size_full().bg(t.background).border_b(1).border_color(t.border)
    .child(h_flex().h(52).flex_none().pl(16).pr(14).gap(10).items_center()
      .child(h_flex().id("channel-title").flex_none().max_w(360).px(6).py(3).gap(4).items_center().rounded(6).cursor_pointer()
        .hover((s) => s.bg(t.raised))
        .when(Boolean(space), (el) => el.on_click(() => openOverlay(channelMenuOverlay(space.id, null))).tooltip("채널 메뉴"))
        .child(div().text_color(strong(t)).child(icon("hash", 18)))
        .child(div().min_w(0).truncate().text_size(18).font_bold().text_color(strong(t))
          .child(channelName ?? "채널 없음"))
        .child(div().text_color(t.muted).child(icon("chevron-down", 14))))
      .child(div().id("channel-topic").flex_1().min_w(0).truncate().text_size(13).text_color(t.dim)
        .when(Boolean(place), (el) => el.tooltip(place)).child(about))
      .child(h_flex().flex_none().gap(6).items_center()
        .when(agent, (el) => el.child(viewSwitch(view, t, chat)))
        .child(h_flex().id("members").flex_none().h(28).px(6).gap(4).items_center().rounded(6).cursor_pointer()
          .text_color(t.muted).hover((s) => s.bg(t.raised).text_color(strong(t))).tooltip("이 채널의 에이전트")
          .on_click(() => run("mod.open", { name: "picker" }))
          .child(icon("users", 17)).child(div().text_size(14).child(String(agents().filter((a) => a.space === space?.id).length))))
        // 채팅 화면은 한 대화를 크게 보여 주는 페이지라 나눌 것이 없다(누르면 뒤에 숨은 터미널 탭만 나뉜다).
        .when(!chat, (el) => el.child(toolButton(t, "split", "split", "오른쪽으로 나누기 (⌘D)", false, () => run("pane.split", { direction: "right" }))))
        .child(toolButton(t, "find", "search", "찾기 (⌘P)", false, () => run("mod.open", { name: "picker" })))
        .child(toolButton(t, "more", "more-vertical", "채널 메뉴", false, () => space && openOverlay(channelMenuOverlay(space.id, null))))))
    .child(h_flex().flex_1().min_h(0).w_full().pr(16).gap(18)
      .child(h_flex().id("session-tabs").flex_1().min_w(0).h_full().pl(20).gap(18).items_end().overflow_x_scroll()
        .children(tabs.map((x) => {
          const tabAgents = allAgents.filter((a) => a.tab === x.id);
          const tabPanes = allPanes.filter((p) => p.tab === x.id);
          const program = tabAgents[0]?.program ?? tabPanes[0]?.program ?? null;
          const title = tabTitle(x, tabAgents, tabPanes);
          return channelTab(t, `tab-${x.id}`, "terminal", title, x.active, () => run("tab.select", { id: x.id }), {
            lead: program ? programAvatar(t, program, 16) : null,
            tip: `${title} · 휠 클릭: 탭 닫기`,
            // 휠 클릭으로 닫기(브라우저 탭처럼). 채널의 마지막 탭이면 Herdr 가 스페이스를 닫을지 먼저 묻는다.
            onMiddle: () => run("tab.close", { id: x.id }),
            onRight: () => openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: x.id, space: space.id } } }),
          });
        }))
        // 탭들과 같은 틀(글자 줄 pb 8 + 아래 2px 막대 자리)이라 + 가 탭 글자와 같은 높이에 선다.
        .child(v_flex().id("tab-add").h_full().flex_none().justify_end().cursor_pointer().text_color(t.muted)
          .hover((s) => s.text_color(strong(t))).tooltip("새 세션 (이 채널에 탭 추가)")
          .on_click(() => openOverlay(newChannelOverlay("tab")))
          .child(h_flex().px(4).pb(8).gap(6).items_center().text_size(14).font_semibold()
            .child(icon("plus", 15)).child(div().w(0).child("\u200b"))) // 보이지 않는 글자로 탭 글자와 같은 줄 높이를 만든다
          .child(div().h(2))))
      // 오른쪽 패널 버튼은 탭이 많아져도 밀리지 않게 탭 줄 오른쪽 끝에 둔다.
      .child(h_flex().flex_none().h_full().gap(18).items_end()
        .child(channelTab(t, "tab-files", "files", "파일 및 링크", panelButtonOn("files", panel), () => togglePanel("files")))
        .child(channelTab(t, "tab-terminal", "terminal", "터미널", panelButtonOn("terminal", panel), () => togglePanel("terminal")))));
}
