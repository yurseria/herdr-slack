// 사이드바(반투명, 그라데이션 위). 레일에서 고른 화면에 따라:
//   home      워크스페이스 이름 · 대화 찾기 · 빠른 메뉴 · 사용자 섹션 · 저장소 섹션(채널 = 스페이스: 본 체크아웃·worktree)
//             · '채널'(저장소 밖 스페이스) · 다이렉트 메시지(= 지금 채널의 에이전트)
//   dms       모든 에이전트를 최근 순으로(슬랙 DM 목록)
//   activity  작업한 세션을 날짜별 최근 순으로, '읽지 않은 항목'으로 빨간 점 있는 것만(슬랙 '내 활동')
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { panes, focused, run, openOverlay, shared, setShared, home } from "herdr";
import { cleanTitle, agentSubtitle, channelNames, groupByRepo } from "./look.js";
import { SCOPE, groupTabs, isCollapsed, toggleCollapsed, orderSections, dropSection } from "./sections.js";
import { channelMenuOverlay, sectionMenuOverlay, workspaceMenuOverlay, repoLook } from "./sectionmenu.js";
import { workspace } from "./workspace.js";
import { slackTheme } from "./theme.js";
import { visibleSpaces, visibleAgents } from "./demo.js";
import { repoPending } from "./repos.js";
import { VIEW_KEY, sidebarView, GLASS, icon, white, programAvatar, withStatusDot, mentionBadge } from "./parts.js";

const HEADER_HEIGHT = 52;
const ROW_HEIGHT = 28;
const CARD_HEIGHT = 56;
import { newChannelOverlay } from "./newchannel.js";
import { activityAt, isUnread, groupByDay, timeLabel, UNREAD_ONLY_KEY } from "./activity.js";
// 사이드바에서 만드는 채널은 새 스페이스(작업 폴더에서 시작).
const NEW_MENU = newChannelOverlay("space");

const agentName = (a) => cleanTitle(a.title) || a.program?.name || "에이전트";
const focusAgent = (a) => run("agent.focus", { terminal: a.address });
const openPicker = () => run("mod.open", { name: "picker" });

function iconButton(t, id, name, tip, action) {
  return div().id(id).size(30).flex_none().flex().items_center().justify_center().rounded(6)
    .text_color(white(t)).cursor_pointer().tooltip(tip).hover((s) => s.bg(GLASS.hover))
    .on_click(action).child(icon(name, 18));
}

function header(t, title, onTitle) {
  return h_flex().id("sidebar-header").h(HEADER_HEIGHT).flex_none().pl(16).pr(8).gap(2).items_center()
    .child(h_flex().id("ws-title").flex_1().min_w(0).gap(4).items_center()
      .when(Boolean(onTitle), (el) => el.cursor_pointer().on_click(onTitle).tooltip("워크스페이스 메뉴 (이름 · 그림 바꾸기)"))
      .child(div().min_w(0).truncate().text_size(18).font_bold().text_color(white(t)).child(title))
      .when(Boolean(onTitle), (el) => el.child(div().text_color(white(t)).child(icon("chevron-down", 16)))))
    .child(iconButton(t, "settings", "settings", "설정", () => run("app.settings")))
    .child(iconButton(t, "compose", "square-pen", "새 채널 (작업 폴더에서 에이전트 시작)", () => openOverlay(NEW_MENU)));
}

function findBox(t, label) {
  return h_flex().id("find").mx(12).mb(6).h(28).flex_none().px(8).gap(8).items_center().rounded(6)
    .bg(GLASS.field).border_1().border_color(GLASS.line).cursor_pointer().hover((s) => s.bg(GLASS.selected))
    .on_click(openPicker)
    .child(div().text_color(white(t)).opacity(0.8).child(icon("search-text", 15)))
    .child(div().flex_1().truncate().text_size(14).text_color(white(t)).opacity(0.75).child(label));
}

// 한 줄(빠른 메뉴 · 채널 · DM 공통 틀). 고르면 흰 반투명, 안 본 것은 굵은 흰 글씨.
function row(t, id, { selected, bright, children, onClick, onRight, onDouble, indent = 10 }) {
  return h_flex().id(id).mx(8).h(ROW_HEIGHT).flex_none().pl(indent).pr(10).gap(8).items_center().rounded(6).cursor_pointer()
    .text_size(15).text_color(selected || bright ? white(t) : t.muted)
    .when(bright || selected, (el) => el.font_bold())
    .when(selected, (el) => el.bg(slackTheme().selected))
    .when(!selected, (el) => el.hover((s) => s.bg(GLASS.hover)))
    .when(Boolean(onDouble), (el) => el.on_mouse_down("left", (e) => { if (e.click_count === 2) onDouble(); }))
    .on_click(onClick)
    .when(Boolean(onRight), (el) => el.on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); onRight(); }))
    .children(children);
}

function quickLink(t, id, iconName, label, count, action) {
  return row(t, `quick-${id}`, {
    bright: count > 0, onClick: action,
    children: [div().opacity(0.9).child(icon(iconName, 16)), div().flex_1().truncate().child(label),
      count > 0 ? mentionBadge(t, count) : null].filter(Boolean),
  });
}

// 섹션 머리: 누르면 접기/펴기(접힌 ▸), 오른쪽 클릭은 섹션 메뉴(onMenu 가 있을 때).
// 이모지가 있으면 화살표 자리에 이모지를 두고, 마우스를 올린 동안만 화살표를 보인다(슬랙처럼).
// draggable 이면 머리를 눌러 끌어서 섹션 순서를 바꾼다(놓는 일은 sectionBlock · homeList 가 한다).
// 프로젝트(저장소) 섹션의 기본 표시: 워크스페이스·프로필 기본 그림처럼 색 네모에 첫 글자.
// 이름 머리(data/slack/tile-prefixes.json)는 건너뛰고, 색은 글자마다 하나로 정한다(같은 글자는 늘 같은 색).
// 알파벳 26자에 색 하나씩: 색상환을 26칸으로 나누고, 이웃 글자(A·B)가 비슷해지지 않게 11칸씩 건너뛰며 배정한다.
// 26칸이면 이웃 칸끼리 색이 비슷하므로(A·H 가 이웃) 밝기도 세 단계로 번갈아 준다. 흰 글자가 보이는 범위 안에서.
function hslHex(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return `#${[f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
}
const TILE_COLORS = Array.from({ length: 26 }, (_, i) => hslHex(((i * 11) % 26) * (360 / 26), 0.62, [0.4, 0.52, 0.32][i % 3]));
const tileColor = (letter) => {
  const c = letter.codePointAt(0);
  return TILE_COLORS[(c >= 65 && c <= 90 ? c - 65 : c) % TILE_COLORS.length];
};
function nameTile(t, name, prefixes = []) {
  let text = String(name).trim();
  const prefix = prefixes.find((p) => text.toLowerCase().startsWith(p.toLowerCase()) && text.length > p.length);
  if (prefix) text = text.slice(prefix.length);
  const letter = Array.from(text)[0]?.toUpperCase() ?? "?";
  return div().size(18).flex_none().rounded(4).flex().items_center().justify_center()
    .bg(tileColor(letter)).text_size(11).font_bold().text_color(white(t)).child(letter);
}

// onAdd 가 있으면 마우스를 올린 동안 오른쪽에 + 버튼(누르면 onAdd).
function section(view, t, spaceId, id, label, { onMenu = null, emoji = null, tile = false, draggable = false, onAdd = null } = {}) {
  const collapsed = spaceId ? isCollapsed(spaceId, id) : false;
  const hovered = view?.hoverSection === id;
  const caret = icon(collapsed ? "chevron-right" : "chevron-down", 14);
  return h_flex().id(`sec-${id}`).h(ROW_HEIGHT).mt(14).mx(8).px(8).gap(10).items_center().flex_none().rounded(6)
    .text_size(15).text_color(t.muted).cursor_pointer().hover((s) => s.bg(GLASS.hover))
    .when((Boolean(emoji) || tile || Boolean(onAdd)) && Boolean(view), (el) => el.on_hover((on, cx) => {
      const next = on ? id : view.hoverSection === id ? null : view.hoverSection;
      if (next !== view.hoverSection) { view.hoverSection = next; cx.notify(); }
    }))
    .when(draggable, (el) => el.on_mouse_down("left", (e) => { view.secDrag = { id, y: e.position.y, active: false, target: null }; }))
    // 끌다가 제자리에 놓아도 클릭이 되므로, 끌기였으면 접지 않는다.
    .when(Boolean(spaceId), (el) => el.on_click(() => {
      if (view?.secDrag?.active || Date.now() - (view?.secDragEndedAt ?? 0) < 300) return;
      toggleCollapsed(spaceId, id);
    }))
    .when(Boolean(onMenu), (el) => el.on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); onMenu(); }))
    .child(div().w(18).flex_none().flex().items_center().justify_center()
      .child(hovered ? caret : emoji ? div().text_size(15).child(emoji) : tile ? nameTile(t, label, view?.tilePrefixes) : caret))
    .child(div().flex_1().truncate().child(label))
    .when(Boolean(onAdd) && hovered, (el) => el.child(div().id(`sec-add-${id}`).size(22).flex_none().flex().items_center().justify_center()
      .rounded(5).text_color(white(t)).tooltip("이 프로젝트에서 새 채널").hover((s) => s.bg(GLASS.selected))
      // 누름을 여기서 멈춰야 섹션이 접히거나 끌리지 않는다.
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); onAdd(); })
      .child(icon("plus", 15))));
}

const DRAG_START_PX = 4;

// 섹션 하나(머리 + 채널들)를 끌어 놓을 자리로 감싼다. 끄는 동안 마우스가 위 절반이면 앞, 아래 절반이면 뒤에
// 놓을 자리로 보고 그 가장자리에 선을 긋는다.
function sectionBlock(view, t, id, nodes) {
  const drag = view.secDrag;
  const target = drag?.active ? drag.target : null;
  // 선은 겹쳐 그려서 끄는 동안 목록이 흔들리지 않게 한다.
  const line = (edge) => div().absolute().left(16).right(16).h(2).rounded(1).bg(t.accent).when(edge === "top", (el) => el.top(4)).when(edge === "bottom", (el) => el.bottom(-8));
  const before = target?.id === id && !target.after && drag.id !== id;
  const after = target?.id === id && target.after && drag.id !== id;
  return v_flex().id(`blk-${id}`).relative().flex_none()
    .when(Boolean(drag?.active) && drag.id === id, (el) => el.opacity(0.45))
    .on_mouse_move((e, cx) => {
      const d = view.secDrag;
      if (!d) return;
      if (!d.active) {
        if (Math.abs(e.position.y - d.y) < DRAG_START_PX) return;
        d.active = true;
      }
      const after = e.local_position.y > e.bounds.height / 2;
      if (d.target?.id === id && d.target.after === after) return;
      d.target = { id, after };
      cx.notify();
    })
    .children(nodes)
    .when(before, (el) => el.child(line("top")))
    .when(after, (el) => el.child(line("bottom")));
}

// 채널(= 스페이스) 표시: 입력 필요한 에이전트 수, 작업 중인지, 끝났는데 안 본 것.
function spaceBadge(space, all) {
  const mine = all.filter((a) => a.space === space.id);
  return { blocked: mine.filter((a) => a.status === "blocked").length, working: mine.some((a) => a.status === "working"), unread: space.status === "done" };
}

// 접힌 섹션에도 남기는 채널: 지금 채널, 입력이 필요하거나 안 본 것(슬랙처럼).
function stillShown(space, all) {
  const badge = spaceBadge(space, all);
  return space.active || badge.unread || badge.blocked > 0;
}

const tilde = (path) => (path === home() ? "~" : path?.startsWith(`${home()}/`) ? `~${path.slice(home().length)}` : path);

function channelRow(t, space, all, repoName, names) {
  const badge = spaceBadge(space, all);
  const tip = [tilde(space.folder), space.branch ? `⎇ ${space.branch}` : null].filter(Boolean).join(" · ");
  return row(t, `ch-${space.id}`, {
    selected: space.active, indent: 18,
    bright: badge.unread || badge.blocked > 0,
    onClick: () => { setShared(VIEW_KEY, "home"); run("space.select", { id: space.id }); },
    onDouble: () => run("space.rename", { id: space.id }),
    onRight: () => openOverlay(channelMenuOverlay(space.id, repoName)),
    children: [
      div().opacity(0.85).child(icon("hash", 16)),
      div().flex_1().min_w(0).truncate().when(Boolean(tip), (el) => el.tooltip(tip)).child(names.get(space.id) ?? space.name),
      badge.blocked > 0 ? mentionBadge(t, badge.blocked)
        : badge.working ? div().size(8).rounded_full().bg(t.working).loop("opacity", { from: 0.45, to: 1, period: 1400 })
          : null,
    ].filter(Boolean),
  });
}

function dmRow(t, a) {
  return row(t, `dm-${a.address}`, {
    selected: false, indent: 18,
    bright: a.focused || a.status === "blocked" || a.status === "done",
    onClick: () => focusAgent(a),
    children: [
      withStatusDot(t, programAvatar(t, a.program, 20), 20, a.status, GLASS.ring),
      div().flex_1().min_w(0).truncate().child(agentName(a)),
      a.status === "blocked" ? mentionBadge(t, 1) : null,
    ].filter(Boolean),
  });
}

function addRow(t, id, label, action) {
  return h_flex().id(id).mx(8).h(ROW_HEIGHT).flex_none().pl(16).pr(10).gap(8).items_center().rounded(6).cursor_pointer()
    .text_size(15).text_color(t.muted).hover((s) => s.bg(GLASS.hover)).on_click(action)
    .child(div().size(20).flex_none().rounded(5).bg(GLASS.field).flex().items_center().justify_center().child(icon("plus", 14)))
    .child(div().child(label));
}

function homeList(view, t, space) {
  const all = visibleAgents();
  // 저장소를 아직 모르는 새 채널은 '채널'에 먼저 그렸다가 저장소 섹션으로 옮겨지지 않도록 확인될 때까지 뺀다.
  const list = visibleSpaces().filter((s) => !repoPending(view, s));
  const mine = all.filter((a) => a.space === space.id);
  const repoOf = view.repoOf ?? {};
  // 사용자 섹션에 넣은 채널을 뺀 나머지를 저장소로 묶는다.
  const groups = groupTabs(SCOPE, list);
  const byRepo = groupByRepo(groups.rest, repoOf);
  const repoName = (s) => repoOf[s.folder]?.name ?? null;
  const names = channelNames(visibleSpaces(), all);
  const shownIn = (sectionId, items) => (isCollapsed(SCOPE, sectionId) ? items.filter((s) => stillShown(s, all)) : items);
  const attention = all.filter((a) => a.status === "blocked" || a.status === "done").length;
  const go = (name) => (_e, cx) => { setShared(VIEW_KEY, name); cx.notify(); };
  const repoBlock = (r) => {
    const look = repoLook(r.root);
    const main = r.items.find((s) => s.folder === r.root) ?? r.items[0];
    return { id: r.id, nodes: [
      section(view, t, SCOPE, r.id, look.name || r.name, { onMenu: () => openOverlay(sectionMenuOverlay(r.id, main?.id ?? null)), emoji: look.emoji, tile: true, draggable: true,
        onAdd: () => openOverlay(newChannelOverlay("space", r.root)) }),
      ...shownIn(r.id, r.items).map((s) => channelRow(t, s, all, r.name, names)),
    ] };
  };
  const customBlock = (sec) => ({ id: sec.id, nodes: [
    section(view, t, SCOPE, sec.id, sec.name, { onMenu: () => openOverlay(sectionMenuOverlay(sec.id)), emoji: sec.emoji, draggable: true }),
    ...shownIn(sec.id, sec.items).map((s) => channelRow(t, s, all, repoName(s), names)),
    ...(sec.items.length === 0 && !isCollapsed(SCOPE, sec.id)
      ? [div().id(`empty-${sec.id}`).mx(26).py(4).flex_none().text_size(13).text_color(t.dim).child("채널을 오른쪽 클릭해 이 섹션으로 옮기세요")] : []),
  ] });
  const blocks = [
    ...groups.custom.map(customBlock),
    ...byRepo.repos.map(repoBlock),
    ...(byRepo.loose.length > 0 || byRepo.repos.length === 0 ? [{ id: "channels", nodes: [
      section(view, t, SCOPE, "channels", "채널", { onMenu: () => openOverlay(sectionMenuOverlay("channels")), draggable: true }),
      ...shownIn("channels", byRepo.loose).map((s) => channelRow(t, s, all, null, names)),
    ] }] : []),
  ];
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const order = orderSections(blocks.map((b) => b.id));
  // 놓기: 목록 안에서 버튼을 떼면 정한 자리로 옮기고, 목록 밖으로 나가면 끌기를 그만둔다.
  const endDrag = (cx, commit) => {
    const d = view.secDrag;
    if (!d) return;
    if (commit && d.active && d.target) dropSection(order, d.id, d.target.id, d.target.after);
    view.secDrag = null;
    if (d.active) { view.secDragEndedAt = Date.now(); cx.notify(); }
  };
  return v_flex().size_full()
    .child(header(t, workspace().name, () => openOverlay(workspaceMenuOverlay())))
    .child(findBox(t, "대화 찾기..."))
    .child(v_flex().id("sidebar-list").flex_1().min_h(0).pb(16).overflow_y_scroll()
      .on_mouse_up("left", (_e, cx) => endDrag(cx, true))
      .on_hover((on, cx) => { if (!on) endDrag(cx, false); })
      .child(quickLink(t, "unread", "inbox", "읽지 않은 항목", attention, (_e, cx) => { setShared(UNREAD_ONLY_KEY, true); go("activity")(_e, cx); }))
      .child(quickLink(t, "dms", "message-square", "다이렉트 메시지", 0, go("dms")))
      .child(quickLink(t, "directory", "book-user", "디렉터리", 0, openPicker))
      .child(div().mx(16).my(10).h(1).flex_none().bg(GLASS.line))
      .children(order.map((id) => sectionBlock(view, t, id, byId.get(id).nodes)))
      .child(addRow(t, "add-channel", "채널 추가", () => openOverlay(NEW_MENU)))
      .child(section(view, t, SCOPE, "dms", "다이렉트 메시지"))
      .when(!isCollapsed(SCOPE, "dms"), (el) => el.children(mine.map((a) => dmRow(t, a)))
        .when(mine.length === 0, (e2) => e2.child(div().mx(26).py(4).text_size(13).text_color(t.dim).child("이 채널엔 에이전트가 없어요")))));
}

// 카드 한 줄: 아바타, 이름, 아랫줄에 상태 · 워크스페이스 · #채널.
function agentCard(t, a, now, since) {
  const sub = `${agentSubtitle(a.status, since, now)} · ${a.space_name} · #${a.tab_name}`;
  return h_flex().id(`card-${a.address}`).mx(8).h(CARD_HEIGHT).flex_none().px(10).gap(10).items_center().rounded(8).cursor_pointer()
    .when(a.focused, (el) => el.bg(GLASS.selected))
    .when(!a.focused, (el) => el.hover((s) => s.bg(GLASS.hover)))
    .on_click(() => focusAgent(a))
    .child(withStatusDot(t, programAvatar(t, a.program, 36), 36, a.status, GLASS.ring))
    .child(v_flex().flex_1().min_w(0).gap(2)
      .child(div().truncate().text_size(15).font_bold().text_color(white(t)).child(agentName(a)))
      .child(div().truncate().text_size(13).text_color(a.status === "blocked" ? "#ff8fb1" : t.muted).child(sub)));
}

function agentList(t, title, list, empty) {
  const since = new Map(visibleSpaces().flatMap((s) => s.tabs.map((tab) => [tab.id, tab.working_since])));
  const now = Date.now();
  return v_flex().size_full()
    .child(header(t, title, null))
    .child(findBox(t, "대화 찾기..."))
    .child(v_flex().id("agent-list").flex_1().min_h(0).pt(4).pb(16).overflow_y_scroll()
      .when(list.length === 0, (el) => el.child(div().px(18).py(8).text_size(13).text_color(t.muted).child(empty)))
      .children(list.map((a) => agentCard(t, a, now, since.get(a.tab) ?? null))));
}

// '내 활동': 세션을 마지막으로 움직인 시각 역순, 날짜별 머리. 위의 '읽지 않은 항목'으로 빨간 점 있는 것만.
function activityCard(t, a, at, now, since) {
  const sub = `${agentSubtitle(a.status, since, now)} · ${a.space_name} · #${a.tab_name}`;
  return h_flex().id(`act-${a.address}`).mx(8).h(CARD_HEIGHT).flex_none().px(10).gap(10).items_center().rounded(8).cursor_pointer()
    .when(a.focused, (el) => el.bg(GLASS.selected))
    .when(!a.focused, (el) => el.hover((s) => s.bg(GLASS.hover)))
    .on_click(() => focusAgent(a))
    .child(withStatusDot(t, programAvatar(t, a.program, 36), 36, a.status, GLASS.ring))
    .child(v_flex().flex_1().min_w(0).gap(2)
      .child(h_flex().gap(8).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(15).font_bold().text_color(white(t)).child(agentName(a)))
        .child(div().flex_none().text_size(12).text_color(t.muted).child(timeLabel(at))))
      .child(h_flex().gap(6).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(a.status === "blocked" ? "#ff8fb1" : t.muted).child(sub))
        .when(isUnread(a), (el) => el.child(div().size(8).flex_none().rounded_full().bg(slackTheme().notify)))));
}

function activityList(t) {
  const unreadOnly = Boolean(shared(UNREAD_ONLY_KEY));
  const all = visibleAgents();
  const unread = all.filter(isUnread).length;
  const list = (unreadOnly ? all.filter(isUnread) : all).map((a) => ({ agent: a, at: activityAt(a) }));
  const groups = groupByDay(list);
  const since = new Map(visibleSpaces().flatMap((s) => s.tabs.map((tab) => [tab.id, tab.working_since])));
  const now = Date.now();
  const toggle = h_flex().id("act-unread").mx(12).mb(6).h(28).flex_none().px(10).gap(6).items_center().rounded(14).cursor_pointer()
    .border_1().border_color(unreadOnly ? white(t) : GLASS.line).bg(unreadOnly ? GLASS.selected : GLASS.field)
    .hover((s) => s.bg(GLASS.selected)).text_size(13).text_color(white(t)).when(unreadOnly, (el) => el.font_bold())
    .on_click(() => setShared(UNREAD_ONLY_KEY, !unreadOnly))
    .child(icon("inbox", 14)).child(div().child("읽지 않은 항목"))
    .when(unread > 0, (el) => el.child(mentionBadge(t, unread)));
  return v_flex().size_full()
    .child(header(t, "내 활동", null))
    .child(h_flex().flex_none().child(toggle).child(div().flex_1()))
    .child(v_flex().id("activity-list").flex_1().min_h(0).pb(16).overflow_y_scroll()
      .when(list.length === 0, (el) => el.child(div().px(18).py(8).text_size(13).text_color(t.muted)
        .child(unreadOnly ? "읽지 않은 항목이 없어요." : "아직 작업한 세션이 없어요.")))
      .children(groups.flatMap((g) => [
        div().id(`day-${g.label}`).px(18).pt(12).pb(4).flex_none().text_size(13).font_bold().text_color(t.muted).child(g.label),
        ...g.items.map(({ agent, at }) => activityCard(t, agent, at, now, since.get(agent.tab) ?? null)),
      ])));
}

export function renderChannels(view, t, forced = null) {
  const mode = forced ?? sidebarView(shared);
  const shell = (child) => v_flex().id("sidebar").size_full().bg(GLASS.sidebar).child(child);
  if (mode === "dms") {
    return shell(agentList(t, "다이렉트 메시지", [...visibleAgents()].sort((a, b) => b.seq - a.seq),
      "아직 에이전트가 없어요. 오른쪽 위 연필을 눌러 Claude 를 시작해 보세요."));
  }
  if (mode === "activity") return shell(activityList(t));
  const space = visibleSpaces().find((s) => s.active) ?? visibleSpaces().find((s) => s.id === focused()?.space);
  if (!space) return shell(div().p(16).text_size(13).text_color(t.muted).child("워크스페이스가 없어요. 왼쪽 + 로 프로젝트를 여세요."));
  return shell(homeList(view, t, space));
}
