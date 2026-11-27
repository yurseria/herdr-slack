// 왼쪽 레일(72px, 그라데이션 위 투명): 워크스페이스 타일 하나, 홈 · DM · 내 활동 · 파일 · 더 보기,
// 아래에 + · 모양 설정 · 내 아바타. 채널이 스페이스가 되었으므로 워크스페이스는 창 전체 하나다.
import { div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, openOverlay, shared, setShared } from "herdr";
import { initials } from "./look.js";
import { VIEW_KEY, sidebarView, icon, mentionBadge, glass, strong } from "./parts.js";
import { isImagePath, setWorkspaceImage, profile } from "./spaceimage.js";
import { workspace } from "./workspace.js";
import { workspaceMenuOverlay } from "./sectionmenu.js";
import { profileMenuOverlay, profileName } from "./profilemenu.js";
import { newChannelOverlay } from "./newchannel.js";
import { visibleAgents } from "./demo.js";
import { themeOverlay } from "./themepanel.js";
import { panelButtonOn, togglePanel } from "./panel.js";
import { slackTheme } from "./theme.js";

const WIDTH = 72;
const TILE = 40;
const NAV = 36;
const TEXT_SIZE = { 1: 18, 2: 15, 3: 13 };

// 워크스페이스 타일: 누르면 홈, 오른쪽 클릭은 이름·그림 메뉴, 그림 파일을 끌어 놓으면 그림으로.
function workspaceTile(view, t) {
  const ws = workspace();
  const text = initials(ws.name);
  const face = ws.image
    ? image(ws.image).size(TILE).flex_none().rounded(10)
    : div().size(TILE).flex_none().rounded(10).flex().items_center().justify_center()
      .bg("#e8a723").text_color(t.accent_foreground).text_size(TEXT_SIZE[Array.from(text).length] ?? 13).font_bold().child(text);
  return h_flex().id("workspace-tile").w(WIDTH).h(TILE + 8).flex_none().justify_center().items_center()
    .tooltip(`${ws.name} · 오른쪽 클릭: 이름·그림 바꾸기`)
    .child(div().id("workspace-face").cursor_pointer()
      .on_click((_e, cx) => { setShared(VIEW_KEY, "home"); cx.notify(); })
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay(workspaceMenuOverlay()); })
      .on_drop((e, cx) => {
        const file = (e.paths ?? []).find(isImagePath);
        if (file) cx.spawn(async () => { await setWorkspaceImage(file).catch(() => {}); });
      })
      .child(face));
}

// 레일 메뉴 하나: 36px 아이콘 칸(고르면 밝은 바탕) + 아래 11px 굵은 이름.
function navButton(t, id, iconName, label, on, badge, action) {
  return v_flex().id(`nav-${id}`).w(WIDTH).flex_none().items_center().gap(3).cursor_pointer()
    .on_click(action)
    .child(div().relative().size(NAV).flex().items_center().justify_center().rounded(10)
      .bg(on ? glass(t).selected : "#00000000").text_color(strong(t))
      .hover((s) => s.bg(on ? glass(t).selected : glass(t).hover))
      .child(icon(iconName, 20))
      .when(badge > 0, (el) => el.child(div().absolute().right(-7).top(-6).child(mentionBadge(t, badge)))))
    .child(div().text_size(11).font_bold().text_color(strong(t)).child(label));
}

function roundButton(t, id, iconName, tip, action) {
  return div().id(id).size(NAV).flex_none().flex().items_center().justify_center().rounded_full()
    .bg(glass(t).field).text_color(strong(t)).cursor_pointer().tooltip(tip).hover((s) => s.bg(glass(t).selected))
    .on_click(action).child(icon(iconName, 19));
}

// 내 프로필: 사진(없으면 이름 첫 글자). 누르면 설정, 오른쪽 클릭은 이름·사진 메뉴.
function me(t) {
  const name = profileName();
  const picture = profile().image;
  return div().id("me").relative().size(NAV).flex_none().tooltip(`${name} · 오른쪽 클릭: 이름·사진 바꾸기`).cursor_pointer()
    .on_click(() => run("app.settings"))
    .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay(profileMenuOverlay()); })
    .child(picture ? image(picture).size(NAV).rounded(8)
      : div().size(NAV).rounded(8).flex().items_center().justify_center().bg("#5b5fc7")
        .text_size(15).font_bold().text_color(t.accent_foreground).child(Array.from(name)[0]?.toUpperCase() ?? "?"))
    .child(div().absolute().right(-3).bottom(-3).size(13).rounded_full().bg(glass(t).ring)
      .flex().items_center().justify_center().child(div().size(9).rounded_full().bg(slackTheme().presence)));
}

export function renderRail(view, t) {
  const all = visibleAgents();
  const current = sidebarView(shared);
  const attention = all.filter((a) => a.status === "blocked" || a.status === "done").length;
  const go = (name) => (_e, cx) => { setShared(VIEW_KEY, name); cx.notify(); };
  return v_flex().id("rail").size_full().pt(4).pb(14).items_center()
    .child(workspaceTile(view, t))
    .child(v_flex().flex_none().pt(16).gap(16).items_center()
      .child(navButton(t, "home", "house", "홈", current === "home", 0, go("home")))
      .child(navButton(t, "dms", "messages", "DM", current === "dms", 0, go("dms")))
      .child(navButton(t, "activity", "bell", "내 활동", current === "activity", attention, go("activity")))
      .child(navButton(t, "files", "files", "파일", panelButtonOn("files"), 0, () => togglePanel("files")))
      .child(navButton(t, "more", "more", "더 보기", false, 0, () => run("app.palette"))))
    .child(div().flex_1())
    .child(v_flex().flex_none().gap(14).items_center()
      .child(roundButton(t, "add-channel", "plus", "새 채널 (작업 폴더에서 에이전트 시작)", () => openOverlay(newChannelOverlay("space"))))
      .child(roundButton(t, "look", "moon", "테마", () => openOverlay(themeOverlay())))
      .child(me(t)));
}
