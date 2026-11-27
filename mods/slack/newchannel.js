// '새 채널' 창: 에이전트(또는 터미널)를 고르고, 작업 폴더와 이름을 정해 연다.
//   scope "space"  사이드바에서: 새 채널 = 새 스페이스(그 폴더가 git 저장소면 저장소 섹션에 들어간다)
//   scope "tab"    머리줄 + 에서: 지금 채널(스페이스) 안의 새 세션 탭
// 작업 폴더는 지금 채널의 폴더가 기본이고, 직접 적거나 '폴더 고르기…'로 바꿀 수 있다.
// git 저장소 링크를 적으면 작업 폴더 아래 <저장소 이름> 폴더로 clone 하고, 그 폴더에서 연다.
// 이 레이아웃에서는 에이전트 채널이 열리면 메시지(채팅) 보기로 연다(chatview.js).
import { div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Popup, ScrollHandle } from "gpui-base";
import { props, spaces, panes, home, appHome, knownAgents, pickFolder, run, exec, readTextFile, closeOverlay, notify, shared, setShared } from "herdr";
import * as fs from "fs/promises";
import { strong, icon } from "./parts.js";
import { nameFromMessage } from "./look.js";
import { workspace, setWorkspace } from "./workspace.js";

// 작업 폴더 검색: 창을 열 때 홈 아래 폴더를 5단계까지 한 번 모은다(0.1초 안팎).
// 숨김 폴더(~/.config 는 남김), node_modules, Library, 앱·사진 보관함 같은 패키지, 빌드 결과는 뺀다.
const DIR_DEPTH = "5";
const PRUNE = [".*", "node_modules", "Library", "Applications", "*.app", "*.photoslibrary", "dist", "build", "target", "venv", "__pycache__"];
const MATCHES = 50;      // 후보 최대 개수(목록은 스크롤)
const VISIBLE_ROWS = 6;  // 스크롤 없이 보이는 줄 수
const ROW = 42;

function findArgs(homeDir) {
  const prune = PRUNE.flatMap((name, i) => [...(i ? ["-o"] : []), "-name", name, ...(name === ".*" ? ["!", "-name", ".config"] : [])]);
  return [homeDir, "-maxdepth", DIR_DEPTH, "(", ...prune, ")", "-prune", "-o", "-type", "d", "-print"];
}

// 검색어(공백으로 여러 낱말)가 모두 경로에 들어 있는 폴더. 마지막 이름이 검색어로 시작하면 먼저, 짧은 경로가 먼저.
export function matchDirs(dirs, query) {
  const words = String(query ?? "").toLowerCase().split(/[\s/]+/).filter(Boolean);
  if (!words.length) return [];
  const scored = [];
  for (const path of dirs) {
    const low = path.toLowerCase();
    if (!words.every((w) => low.includes(w))) continue;
    const base = low.slice(low.lastIndexOf("/") + 1);
    const last = words[words.length - 1];
    scored.push([base.startsWith(last) ? 0 : base.includes(last) ? 1 : 2, path.length, path]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, MATCHES).map((x) => x[2]);
}

const TERMINAL = { key: "terminal", name: "터미널", run: null };

// folder: 작업 폴더를 미리 채워 연다(프로젝트 섹션의 + 버튼).
export const newChannelOverlay = (scope = "tab", folder = null) => ({ mod: "slack", kind: "dialog", width: 520, height: 580, props: { view: "new-channel", scope, ...(folder ? { folder } : {}) } });

const tilde = (path) => {
  const h = home();
  return path === h ? "~" : path?.startsWith(`${h}/`) ? `~${path.slice(h.length)}` : path;
};
const expand = (path) => (path === "~" ? home() : path.startsWith("~/") ? `${home()}${path.slice(1)}` : path);

// 지금 채널에서 키보드가 있는 창의 폴더(없으면 홈).
function currentFolder() {
  const space = spaces().find((s) => s.active);
  const tab = space?.tabs.find((t) => t.active);
  const mine = panes().filter((p) => p.tab === tab?.id && p.cwd);
  return (mine.find((p) => p.focused) ?? mine[0])?.cwd ?? home();
}

// #일반: 작업 폴더 없이 만든 세션을 모으는 채널(홈 폴더의 스페이스). 고른 스페이스 id 를 기억한다.
const GENERAL_KEY = "slack.general";
const GENERAL_NAME = "일반";
function generalSpace() {
  const list = spaces().filter((s) => !s.machine);
  const saved = list.find((s) => s.id === shared(GENERAL_KEY));
  if (saved) return saved;
  // 처음: 이름이 '일반'인 스페이스, 없으면 홈 폴더의 스페이스를 #일반으로 쓴다.
  const found = list.find((s) => s.named && s.name === GENERAL_NAME) ?? list.find((s) => s.folder === home());
  if (found) {
    // 워크스페이스 이름을 아직 이 스페이스 이름에서 읽고 있으면, 이름을 바꾸기 전에 따로 저장해 둔다.
    if (!shared("slack.workspace")) setWorkspace(workspace());
    setShared(GENERAL_KEY, found.id);
    if (!(found.named && found.name === GENERAL_NAME)) run("space.rename", { id: found.id, name: GENERAL_NAME });
  }
  return found ?? null;
}

// ---- 새 worktree (기본 worktree 모드와 같은 자리·이름 규칙) ----
// <settings.worktrees.directory 또는 ~/.herdr/worktrees>/<저장소>/<브랜치(기호는 -)>
async function worktreeHome() {
  const raw = await readTextFile(`${appHome()}/settings.json`).catch(() => null);
  let dir = "~/.herdr/worktrees";
  try { dir = JSON.parse(raw ?? "{}")?.worktrees?.directory || dir; } catch {}
  return (dir === "~" || dir.startsWith("~/") ? `${home()}${dir.slice(1)}` : dir).replace(/\/+$/, "");
}
const branchSlug = (branch) => branch.normalize("NFC").replace(/[^\p{L}\p{M}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "") || "branch";
// 채널 이름 → 브랜치 이름(띄어쓰기는 -).
export const branchFromName = (name) => name.trim().replace(/\s+/g, "-");

async function git(cwd, args, timeout = 30000) {
  const r = await exec("git", args, { cwd, timeout }).catch((e) => ({ code: 1, stderr: String(e?.message ?? e) }));
  return { ok: r.code === 0, out: (r.stdout ?? "").trim(), err: (r.stderr || r.stdout || "").trim() };
}

// folder 의 저장소에 branch worktree 를 만들고 그 경로를 돌려준다. 실패하면 Error.
async function addWorktree(folder, branch) {
  const top = await git(folder, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) throw new Error("작업 폴더가 git 저장소가 아니에요");
  const common = await git(folder, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const mainRepo = common.ok ? common.out.replace(/\/\.git\/?$/, "") : top.out;
  const repoName = mainRepo.split("/").pop();
  if (!(await git(folder, ["check-ref-format", "--branch", branch])).ok) throw new Error(`브랜치 이름으로 쓸 수 없어요: ${branch}`);
  const path = `${await worktreeHome()}/${repoName}/${branchSlug(branch)}`;
  if (await fs.exists(path).catch(() => false)) throw new Error(`이미 있는 폴더예요: ${tilde(path)}`);
  const exists = (await git(top.out, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`])).ok;
  const r = await git(top.out, exists ? ["worktree", "add", path, branch] : ["worktree", "add", "-b", branch, path, "HEAD"], 600000);
  if (!r.ok) throw new Error(r.err || "git worktree add 실패");
  return path;
}

// ---- git 저장소 링크 → clone ----
// https://, ssh://, git@host:owner/repo, 그리고 host.com/owner/repo 처럼 앞을 뺀 링크(https 로 본다).
export function cloneUrl(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  // 웹에서 연 파일·브랜치 화면 링크(/tree/…, /blob/…, GitLab 의 /-/…)는 저장소 링크로 줄인다.
  const trim = (u) => u.replace(/[?#].*$/, "").replace(/\/(?:-\/)?(?:tree|blob|commits?|pulls?|issues|merge_requests)(?:\/.*)?$/, "").replace(/\/-\/.*$/, "").replace(/\/+$/, "");
  if (/^(https?|ssh|git):\/\//i.test(raw) || /^[\w.-]+@[\w.-]+:\S+/.test(raw)) return trim(raw);
  if (/^[\w-]+(\.[\w-]+)+\/[\w.-]+\/[\w.-]+/.test(raw)) return trim(`https://${raw}`);
  return null;
}
// 링크의 마지막 이름에서 .git 을 뗀 것(cloneUrl 을 거친 링크).
export function repoNameOf(url) {
  const name = (url.replace(/\/+$/, "").split(/[/:]/).pop() ?? "").replace(/\.git$/, "");
  return /^[\w.-]+$/.test(name) && name !== "." && name !== ".." ? name : null;
}
const sameRemote = (a, b) => {
  const norm = (u) => u.trim().replace(/\.git$/, "").replace(/\/+$/, "").replace(/^[\w.-]+@([\w.-]+):/, "$1/").replace(/^\w+:\/\/([^@/]+@)?/, "").toLowerCase();
  return norm(a) === norm(b);
};

// clone 할 자리와 그 자리의 상태: "new"(새로 받음), "reuse"(같은 저장소가 이미 있음), "taken"(다른 것이 있음).
async function clonePlan(parent, url) {
  const name = repoNameOf(url);
  if (!name) return { error: `저장소 이름을 알 수 없는 링크예요: ${url}` };
  const path = `${parent.replace(/\/+$/, "")}/${name}`;
  if (!(await fs.exists(path).catch(() => false))) return { path, state: "new" };
  const origin = await git(path, ["remote", "get-url", "origin"], 5000);
  return { path, state: origin.ok && sameRemote(origin.out, url) ? "reuse" : "taken" };
}

// parent 아래 <저장소 이름> 으로 clone 하고 그 경로를 돌려준다. 이미 같은 저장소가 있으면 그 폴더를 그대로 쓴다.
async function cloneInto(parent, url) {
  const name = repoNameOf(url);
  if (!name) throw new Error(`저장소 이름을 알 수 없는 링크예요: ${url}`);
  const path = `${parent.replace(/\/+$/, "")}/${name}`;
  if (await fs.exists(path).catch(() => false)) {
    const origin = await git(path, ["remote", "get-url", "origin"], 5000);
    if (origin.ok && sameRemote(origin.out, url)) return path;
    throw new Error(`이미 있는 폴더예요: ${tilde(path)}`);
  }
  // 비밀번호를 물으면 창 없이 멈추므로 묻지 않고 실패하게 한다(ssh 키·자격 증명 도우미는 그대로 쓴다).
  const r = await exec("env", ["GIT_TERMINAL_PROMPT=0", "GIT_SSH_COMMAND=ssh -o BatchMode=yes", "git", "clone", "--", url, path], { cwd: parent, timeout: 600000 })
    .catch((e) => ({ code: 1, stderr: String(e?.message ?? e) }));
  if (r.code !== 0) throw new Error((r.stderr || r.stdout || "git clone 실패").trim().split("\n").slice(-3).join("\n"));
  return path;
}

// 폴더가 속한 worktree 의 루트(git 이 아니면 폴더 그대로).
async function worktreeRoot(folder) {
  const r = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: folder, timeout: 5000 }).catch(() => null);
  return r && r.code === 0 && r.stdout.trim() ? r.stdout.trim() : folder.replace(/\/+$/, "");
}

// 같은 worktree 에 있는 이 컴퓨터의 채널(스페이스). 폴더가 그 루트 안에 있는 채널만 git 에 다시 묻는다
// (루트 안에 다른 worktree 가 들어 있을 수 있어서 접두어만으로는 정하지 않는다).
async function channelOfWorktree(folder) {
  const root = await worktreeRoot(folder);
  for (const s of spaces()) {
    if (s.machine || !s.folder) continue;
    if (s.folder !== root && !s.folder.startsWith(`${root}/`)) continue;
    if ((await worktreeRoot(s.folder)) === root) return s;
  }
  return null;
}

export function initNewChannel(view, cx) {
  view.agents = null; // 불러오는 중
  view.choice = null;
  // 비워 두면 지금 채널의 폴더에서 시작한다(placeholder 가 그 폴더를 알려 준다).
  view.defaultFolder = currentFolder();
  const given = props()?.folder ?? null;
  view.folderInput = InputState.new({ ...(given ? { value: tilde(given) } : {}), placeholder: props()?.scope === "space"
    ? "폴더 검색 또는 경로 입력 · 비우면 #일반 채널에 탭으로 추가"
    : `폴더 검색 또는 경로 입력 · 비우면 ${tilde(view.defaultFolder)}` });
  view.repoInput = InputState.new({ placeholder: "비우면 clone 하지 않아요 · 작업 폴더 아래 <저장소 이름> 으로 받아요" });
  view.repoInput.on("submit", (_e, cx2) => view.create(cx2));
  view.nameInput = InputState.new({ placeholder: props()?.scope === "space" ? "비우면 브랜치 이름으로 보여요" : "비우면 세션 제목으로 보여요" });
  view.makeWorktree = false;
  // 이름을 적어야 '새 worktree 생성'을 고를 수 있다(이름이 곧 브랜치).
  view.nameInput.on("change", (_e, cx2) => { if (!view.nameInput.value().trim()) view.makeWorktree = false; cx2.notify(); });
  view.dirs = [];
  view.dirScroll = ScrollHandle.new();
  view.dirOpen = false;
  view.dirSel = 0;
  view.folderInput.on("change", (_e, cx2) => {
    if (view.settingFolder) return;
    view.dirOpen = true;
    view.dirSel = 0;
    view.dirScroll.scroll_to_item(0);
    cx2.notify();
  });
  // Enter: 후보가 열려 있으면 고른 후보로 채우고, 아니면 채널을 만든다.
  view.folderInput.on("submit", (_e, cx2) => {
    const list = view.dirMatches();
    if (view.dirOpen && list.length) view.chooseDir(list[Math.min(view.dirSel, list.length - 1)], cx2);
    else view.create(cx2);
  });
  view.dirMatches = () => matchDirs(view.dirs, view.folderInput.value());
  view.chooseDir = (path, cx2) => {
    view.settingFolder = true;
    view.folderInput.set_value(tilde(path));
    view.settingFolder = false;
    view.dirOpen = false;
    view.folderInput.focus();
    cx2.notify();
  };
  view.nameInput.on("submit", (_e, cx2) => view.create(cx2));
  // 첫 메시지: 에이전트에게 바로 보내고, 이름을 비우면 이 문장(첫 줄, 40자)이 채널·탭 이름이 된다.
  view.taskInput = InputState.new({ placeholder: "에이전트에게 바로 보낼 말" });
  view.taskInput.on("submit", (_e, cx2) => view.create(cx2));
  // 폴더를 미리 채워 열었으면 바로 첫 메시지를 쓰게 한다.
  if (given) view.taskInput.focus(); else view.folderInput.focus();
  // cx 는 부른 쪽(클릭·Enter)의 것을 받는다(init 의 cx 를 붙잡아 두지 않는다).
  // git 링크가 있으면 먼저 받을 자리를 확인창으로 보여 주고(view.confirm), 확인하면 다시 불러 진행한다.
  // 확인창이 떠 있는 동안 입력칸에서 Enter 를 누르면 확인으로 본다.
  view.create = (cx, confirmed = Boolean(view.confirm)) => {
    if (view.creating) return;
    const typed = view.folderInput.value().trim();
    const repoText = view.repoInput.value().trim();
    const url = cloneUrl(repoText);
    if (repoText && !url) { notify({ title: "git 저장소 링크가 아니에요", body: repoText, level: "error" }); return; }
    // clone 은 받을 자리를 정해야 한다: 사이드바의 새 채널에서 폴더를 비우면 #일반(홈)으로 가므로 막는다.
    if (url && props()?.scope === "space" && !typed) { notify({ title: "clone 할 작업 폴더를 정해 주세요", body: "작업 폴더 아래 <저장소 이름> 폴더로 받아요", level: "error" }); return; }
    // 사이드바의 새 채널에서 작업 폴더를 비우면 새 채널 대신 #일반 채널에 탭으로 넣는다.
    const toGeneral = props()?.scope === "space" && !typed;
    let folder = typed ? expand(typed) : toGeneral ? home() : view.defaultFolder;
    if (url && !confirmed) {
      cx.spawn(async (cx2) => {
        if (!(await fs.exists(folder).catch(() => false))) { notify({ title: "작업 폴더가 없어요", body: folder, level: "error" }); return; }
        const plan = await clonePlan(folder, url);
        if (plan.error) notify({ title: "clone 하지 못했어요", body: plan.error, level: "error" });
        else if (plan.state === "taken") notify({ title: "clone 하지 못했어요", body: `이미 있는 폴더예요: ${tilde(plan.path)}`, level: "error" });
        else { view.confirm = { ...plan, url }; cx2.notify(); }
      });
      return;
    }
    view.confirm = null;
    const task = view.taskInput.value().trim();
    const typedName = view.nameInput.value().trim();
    // 새 채널은 이름을 비우면 이름 없이 둔다(브랜치 이름을 따른다). 탭(#일반에 넣는 탭 포함)은 첫 메시지로 이름을 짓는다.
    const name = typedName || (props()?.scope === "space" && typed ? "" : nameFromMessage(task));
    const worktree = props()?.scope === "space" && view.makeWorktree && Boolean(typedName);
    const agent = view.choice ?? TERMINAL;
    const space = spaces().find((s) => s.active);
    view.creating = true;
    view.cloning = Boolean(url);
    cx.notify();
    cx.spawn(async (cx2) => {
      const ok = await fs.exists(folder).catch(() => false);
      if (!ok) {
        notify({ title: "작업 폴더가 없어요", body: folder, level: "error" });
        view.creating = false;
        cx2.notify();
        return;
      }
      if (url) {
        try {
          folder = await cloneInto(folder, url);
        } catch (error) {
          notify({ title: "clone 하지 못했어요", body: String(error?.message ?? error), level: "error" });
          view.creating = false;
          view.cloning = false;
          cx2.notify();
          return;
        }
        view.cloning = false;
        cx2.notify();
      }
      const argv = agent.run ? { argv: agent.run, ...(task ? { task } : {}) } : {};
      if (worktree) {
        // 새 worktree: 이름(= 브랜치)으로 만들고 그 폴더를 작업 폴더로 하는 새 채널. 이름은 붙이지 않는다(브랜치를 따른다).
        try {
          const path = await addWorktree(typed || url ? folder : view.defaultFolder, branchFromName(typedName));
          run("space.new", { folder: path, ...argv });
          closeOverlay(props()?.overlay);
        } catch (error) {
          notify({ title: "worktree 를 만들지 못했어요", body: String(error?.message ?? error), level: "error" });
          view.creating = false;
          cx2.notify();
        }
        return;
      }
      const general = toGeneral ? generalSpace() : null;
      if (toGeneral && general) {
        run("tab.new", { space: general.id, folder, ...argv, ...(name ? { name } : {}) });
        run("space.select", { id: general.id });
      } else if (toGeneral) {
        // #일반이 아직 없으면 홈 폴더에 '일반'이라는 이름으로 만든다(다음부터는 이름으로 찾아 기억한다).
        run("space.new", { folder, name: GENERAL_NAME, ...argv, ...(name ? { tab: name } : {}) });
      } else if (props()?.scope === "space") {
        // 채널 = worktree: 같은 worktree 의 채널이 이미 있으면 새 채널 대신 그 채널에 탭으로 넣는다.
        const same = await channelOfWorktree(folder);
        if (same) {
          run("tab.new", { space: same.id, folder, ...argv, ...(name ? { name } : {}) });
          run("space.select", { id: same.id });
        } else run("space.new", { folder, ...argv, ...(name ? { name } : {}) });
      }
      else run("tab.new", { ...(space ? { space: space.id } : {}), folder, ...argv, ...(name ? { name } : {}) });
      closeOverlay(props()?.overlay);
    });
  };
  view.pickFolder = (cx2) => cx2.spawn(async (cx3) => {
    const picked = await pickFolder({ prompt: "이 폴더에서 시작" });
    if (picked) view.folderInput.set_value(tilde(picked));
    cx3.notify();
  });
  cx.spawn(async () => {
    const r = await exec("find", findArgs(home())).catch(() => ({ stdout: "" }));
    view.dirs = String(r?.stdout ?? "").split("\n").filter(Boolean);
  });
  cx.spawn(async (cx2) => {
    const list = await knownAgents().catch(() => []);
    view.agents = list.filter((a) => a.installed);
    view.choice = view.agents[0] ?? TERMINAL;
    cx2.notify();
  });
}

function programIcon(t, program) {
  const box = div().size(22).flex_none().rounded(5).flex().items_center().justify_center().bg(program?.tile ?? t.raised);
  // 프로그램 색 칸 위면 흰 글자, 칸이 없어 회색(raised) 위면 카드 글자색.
  const ink = program?.tile ? t.accent_foreground : strong(t);
  if (!program?.icon) return box.child(svg("mods/slack/terminal.svg").size(14).text_color(ink));
  return box.child(program.tint ? svg(program.icon).size(14).text_color(program.color ?? ink) : image(program.icon).size(14));
}

// 작업 폴더 칸 아래에 뜨는 후보 목록. Popup 은 창의 다른 내용보다 위 레이어에 그리고
// 창 가장자리 안에 자리 잡는다(absolute 로 그리면 뒤 형제에 가리고 창에 잘린다).
const DROPDOWN_WIDTH = 372;
function folderField(view, t, field) {
  const list = view.dirOpen ? view.dirMatches() : [];
  return Popup.new("dir-popup", field).anchor("top_left")
    .when(list.length > 0, (el) => el.content(dirDropdown(view, t, list)));
}

function dirDropdown(view, t, list) {
  return v_flex().id("dir-dropdown").w(DROPDOWN_WIDTH).max_h(VISIBLE_ROWS * (ROW + 1) + 8).mt(4).p(4).gap(1).rounded(8)
    .overflow_y_scroll().track_scroll(view.dirScroll)
    .border_1().border_color(t.input).bg(t.popover).shadow_lg()
    .children(list.map((path, i) => {
      // 고른 줄(키보드 ↑↓)은 툴팁이 없으니 경로를 자르지 않고 여러 줄로 펼친다.
      const on = i === view.dirSel;
      const line = (el) => (on ? el.whitespace_normal() : el.truncate());
      return h_flex().id(`dir-${i}`).min_h(ROW).flex_none().px(8).py(on ? 5 : 0).gap(10).items_center().rounded(6).cursor_pointer()
        .tooltip(path)
        .when(on, (el) => el.bg(t.raised))
        .hover((s) => s.bg(t.raised))
        .on_click((_e, cx) => view.chooseDir(path, cx))
        .child(div().text_color(t.dim).child(icon("folder", 18)))
        .child(v_flex().flex_1().min_w(0)
          .child(line(div().text_size(14).text_color(strong(t))).child(tilde(path)))
          .child(line(div().text_size(12).text_color(t.dim)).child(path)));
    }));
}

// '새 worktree 생성': 채널 이름을 적었을 때만 고를 수 있다.
function worktreeCheck(view, t) {
  const name = view.nameInput.value().trim();
  const on = view.makeWorktree && Boolean(name);
  return h_flex().id("nc-worktree").pt(8).gap(8).items_center().flex_none()
    .when(!name, (el) => el.opacity(0.45))
    .when(Boolean(name), (el) => el.cursor_pointer().on_click((_e, cx) => { view.makeWorktree = !view.makeWorktree; cx.notify(); }))
    .child(div().size(16).flex_none().rounded(4).flex().items_center().justify_center()
      .border_1().border_color(on ? t.accent : t.input).bg(on ? t.accent : "#00000000")
      .text_size(11).text_color(t.accent_foreground).child(on ? "✓" : ""))
    .child(div().text_size(13).text_color(t.foreground).child("새 worktree 생성"))
    .when(on, (el) => el.child(div().min_w(0).truncate().text_size(12).text_color(t.dim).child(`브랜치 ${branchFromName(name)}`)));
}

// git 링크로 만들 때 뜨는 확인창: 어디에 받는지 보여 주고, 확인하면 clone 하고 채널을 연다.
function cloneConfirm(view, t, button) {
  const c = view.confirm;
  const reuse = c.state === "reuse";
  return div().id("nc-confirm-layer").absolute().top(0).left(0).size_full().flex().items_center().justify_center().bg("#00000080")
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(v_flex().id("nc-confirm").w(440).p(20).gap(10).rounded(10).border_1().border_color(t.border).bg(t.popover).shadow_lg()
      .child(div().text_size(17).font_bold().text_color(strong(t)).child(reuse ? "이미 받아 둔 저장소가 있어요" : "이 경로에 저장소를 받아요"))
      .child(div().p(10).rounded(6).bg(t.background).border_1().border_color(t.input)
        .text_size(14).font_bold().text_color(strong(t)).whitespace_normal().child(tilde(c.path)))
      .child(div().text_size(13).text_color(t.muted).whitespace_normal()
        .child(reuse ? "clone 하지 않고 이 폴더에서 채널을 열어요." : `${c.url} 을 clone 하고 이 폴더에서 채널을 열어요.`))
      .child(h_flex().pt(6).gap(8).justify_end()
        .child(button("nc-confirm-no", "돌아가기", false, (_e, cx) => { view.confirm = null; cx.notify(); }))
        .child(button("nc-confirm-yes", reuse ? "이 폴더로 열기" : "clone 하고 만들기", true, (_e, cx) => view.create(cx, true)))));
}

export function renderNewChannel(view, t) {
  const p = props() ?? {};
  const close = () => closeOverlay(p.overlay);
  const label = (text) => div().pt(8).pb(4).text_size(13).font_bold().text_color(strong(t)).child(text);
  const chip = (a) => {
    const on = (view.choice?.key ?? null) === a.key;
    return h_flex().id(`agent-${a.key}`).h(34).px(10).gap(8).items_center().rounded(6).cursor_pointer()
      .border_1().border_color(on ? t.accent : t.input).bg(on ? "#1d9bd122" : t.background)
      .text_size(14).font_medium().text_color(on ? strong(t) : t.muted).hover((s) => s.border_color(t.accent))
      .on_click((_e, cx) => { view.choice = a; cx.notify(); })
      .child(programIcon(t, a.key === "terminal" ? null : a)).child(div().child(a.name));
  };
  const button = (id, text, primary, action) => h_flex().id(id).h(34).px(14).items_center().rounded(6)
    .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
    .text_color(primary ? t.solid_foreground : t.foreground).text_size(14).font_bold().cursor_pointer()
    .hover((s) => s.opacity(0.88)).on_click(action).child(text);
  // flex_none: 창보다 내용이 길어져도 입력칸이 눌려 낮아지지 않게.
  const field = (input) => Input.new(input).h(36).flex_none().px(10).rounded(6).border_1().border_color(t.input).bg(t.background)
    .text_size(14).text_color(t.foreground);
  return v_flex().id("new-channel").relative().size_full().p(20).gap(4).bg(t.popover)
    .on_key_down((e, cx) => {
      const n = view.dirOpen ? view.dirMatches().length : 0;
      if (e.key === "escape") { if (view.confirm) view.confirm = null; else if (n) view.dirOpen = false; else close(); cx.stop_propagation(); cx.notify(); }
      else if (n && (e.key === "down" || e.key === "up")) {
        view.dirSel = (view.dirSel + (e.key === "down" ? 1 : n - 1)) % n;
        view.dirScroll.scroll_to_item(view.dirSel);
        cx.stop_propagation();
        cx.notify();
      }
    })
    .child(div().pb(4).text_size(20).font_bold().text_color(strong(t)).child(p.scope === "space" ? "새 채널" : "새 세션 (이 채널에 탭 추가)"))
    .child(label("에이전트"))
    .child(h_flex().gap(8).flex_wrap()
      .when(view.agents === null, (el) => el.child(div().h(34).flex().items_center().text_size(13).text_color(t.dim).child("설치된 에이전트를 찾는 중…")))
      .children((view.agents ?? []).map(chip))
      .child(chip(TERMINAL)))
    .child(label("작업 폴더 (선택)"))
    .child(h_flex().flex_none().gap(8).items_center()
      .child(div().flex_1().min_w(0).child(folderField(view, t, field(view.folderInput))))
      .child(button("pick-folder", "폴더 고르기…", false, (_e, cx) => view.pickFolder(cx)).h(36)))
    .child(label("git 저장소 링크 (선택)"))
    .child(field(view.repoInput))
    .child(label(p.scope === "space" ? "채널 이름 (선택)" : "탭 이름 (선택)"))
    .child(field(view.nameInput))
    .when(p.scope === "space", (el) => el.child(worktreeCheck(view, t)))
    .child(label("첫 메시지 (선택)"))
    .child(field(view.taskInput))
    .child(div().flex_1())
    .child(h_flex().gap(8).justify_end()
      .child(button("nc-cancel", "취소", false, close))
      .child(button("nc-create", view.cloning ? "clone 하는 중…" : view.creating ? "여는 중…" : "만들기", true, (_e, cx) => view.create(cx))))
    .when(Boolean(view.confirm), (el) => el.child(cloneConfirm(view, t, button)));
}
