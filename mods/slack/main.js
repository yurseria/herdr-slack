// 슬랙 풍 레이아웃(layouts/slack.json)의 블록들. props.view 로 어느 부분인지 정한다.
//   topbar   맨 위 띠 = ← → (이전·다음 채널) + 검색창
//   rail     왼쪽 레일 = 워크스페이스 타일, 홈 · DM · 내 활동 · 파일 · 더 보기, + , 내 아바타
//   channels 사이드바 = 저장소 섹션 · 채널(= 스페이스: 본 체크아웃·worktree) · 다이렉트 메시지
//   header   채널 머리줄 = # 채널(브랜치) · 소개(세션 제목) + 이 채널의 세션 탭들
// 본문 채팅은 slack-chat 모드가 레이아웃 이름(slack)을 보고 슬랙 모양으로 그린다.
import { View } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, props, checking, appHome } from "herdr";
import * as fs from "fs/promises";
import { renderTopbar } from "./topbar.js";
import { renderRail } from "./rail.js";
import { renderChannels } from "./channels.js";
import { renderHeader, HEADER_HEIGHT } from "./header.js";
import { syncView } from "./chatview.js";
import { renderSpaceMenu } from "./spacemenu.js";
import { renderProfileMenu, renderProfileName, initProfileName } from "./profilemenu.js";
import { renderChannelMenu, renderSectionMenu, renderWorkspaceMenu, renderNameDialog, initNameDialog } from "./sectionmenu.js";
import { watchRepos } from "./repos.js";
import { renderNewChannel, initNewChannel } from "./newchannel.js";
import { renderThemePanel, initThemePanel } from "./themepanel.js";
import { applyBackground } from "./theme.js";
import { loadDemo } from "./demo.js";
import { loadTilePrefixes } from "./repos.js";
import { handleImageRequest } from "./spaceimage.js";
import { trackActivity, fillFromLogs } from "./activity.js";

const VIEWS = { topbar: renderTopbar, rail: renderRail, channels: renderChannels, header: renderHeader };
// herdr-app check 는 props 를 못 넘겨서 모든 부분을 나란히 그린다(크기는 레이아웃과 같게).
const CHECK_SIZES = { topbar: [600, 40], rail: [70, 600], channels: [260, 600], dms: [260, 600], activity: [260, 600], header: [600, HEADER_HEIGHT] };
const CHECK_VIEWS = { ...VIEWS, dms: (view, t) => renderChannels(view, t, "dms"), activity: (view, t) => renderChannels(view, t, "activity") };
// 오버레이로만 여는 부분(점검 화면에는 그리지 않는다).
const POPUPS = { "space-menu": renderSpaceMenu, "profile-menu": renderProfileMenu, "profile-name": renderProfileName,
  "channel-menu": renderChannelMenu, "section-menu": renderSectionMenu, "name-dialog": renderNameDialog, "new-channel": renderNewChannel, "workspace-menu": renderWorkspaceMenu, "theme": renderThemePanel };
const SYNC_MS = 300;

async function exists(path) {
  try {
    return await fs.exists(path);
  } catch {
    return false;
  }
}

export default class Slack extends View {
  init(_props, cx) {
    this.view = props()?.view ?? null;
    this.hasProjectOpen = false;
    // 메시지/터미널 보기는 머리줄 블록 하나가 맡는다(탭이 바뀌면 고른다).
    this.chosen = new Map();
    this.tab = undefined;
    this.switching = false;
    this.imageRequestAt = null;
    this.imageBusy = false;
    if (checking()) return;
    if (this.view === "profile-name") initProfileName(this);
    if (this.view === "name-dialog") initNameDialog(this);
    if (this.view === "new-channel") initNewChannel(this, cx);
    if (this.view === "theme") initThemePanel(this, cx);
    if (this.view === "rail") {
      cx.spawn(async (cx) => {
        this.hasProjectOpen = await exists(`${appHome()}/mods/project-open/main.js`);
        cx.notify();
      });
      cx.timer.every(SYNC_MS, (cx) => handleImageRequest(this, cx));
      // '내 활동'의 시각: 에이전트가 바뀐 때를 적어 둔다.
      trackActivity();
      cx.timer.every(2000, (cx) => { trackActivity(); cx.spawn(async () => { await fillFromLogs(); }); });
      cx.spawn(async () => { await loadDemo(); });
      // The window background follows the saved theme (it may have been chosen elsewhere or before a restart).
      cx.spawn(async () => { await applyBackground(); });
    }
    if (this.view === "header") cx.timer.every(SYNC_MS, (cx) => syncView(this, cx));
    // 사이드바가 채널(스페이스)을 저장소별로 묶으려면 폴더마다 git 저장소를 알아야 한다.
    if (this.view === "channels") {
      watchRepos(this, cx);
      cx.spawn(async (cx) => { this.tilePrefixes = await loadTilePrefixes(); cx.notify(); });
    }
  }

  render() {
    const t = theme();
    if (!checking() && POPUPS[this.view]) return POPUPS[this.view](this, t);
    if (checking() || !VIEWS[this.view]) {
      return h_flex().size_full().children(Object.entries(CHECK_VIEWS).map(([name, draw]) =>
        h_flex().w(CHECK_SIZES[name][0]).h(CHECK_SIZES[name][1]).flex_none().child(draw(this, t))));
    }
    return VIEWS[this.view](this, t);
  }
}
