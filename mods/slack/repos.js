// 스페이스 폴더가 어느 git 저장소에 속하는지. worktree 도 본 저장소로 모인다(--git-common-dir).
// 사이드바 copy 가 0.3초마다 아직 모르는 폴더를 묻고, 아는 폴더는 15초마다 다시 묻는다.
// 결과: view.repoOf = { [folder]: { root, name } | null }, view.repoCheckedAt = { [folder]: ms }.
import { spaces, exec, appHome } from "herdr";
import * as fs from "fs/promises";

const REFRESH_MS = 15000;
// 새 채널이 생기면 곧바로 저장소를 알아내도록 자주 본다(할 일이 없으면 아무것도 하지 않는다).
const POLL_MS = 300;

// 아직 한 번도 물어보지 않은 폴더(새로 만든 채널). 사이드바는 이 채널을 잠깐 그리지 않는다.
export const repoPending = (view, space) => Boolean(space.folder) && view.repoCheckedAt?.[space.folder] == null;

async function repoOf(folder, machine) {
  const r = await exec("git", ["-C", folder, "rev-parse", "--path-format=absolute", "--git-common-dir"],
    { on: machine ?? undefined, timeout: 5000 }).catch(() => null);
  const dir = r && r.code === 0 ? r.stdout.trim() : "";
  if (!dir) return null;
  const root = dir.endsWith("/.git") ? dir.slice(0, -5) : dir;
  return { root, name: root.split("/").filter(Boolean).pop() ?? root };
}

export function watchRepos(view, cx) {
  view.repoOf = {};
  view.repoCheckedAt = {};
  const refresh = (cx2) => {
    const now = Date.now();
    const todo = spaces().filter((s) => s.folder && !(now - (view.repoCheckedAt[s.folder] ?? 0) < REFRESH_MS));
    if (!todo.length || view.repoBusy) return;
    view.repoBusy = true;
    cx2.spawn(async (cx3) => {
      let changed = false;
      for (const s of todo) {
        const next = await repoOf(s.folder, s.machine);
        view.repoCheckedAt[s.folder] = Date.now();
        if (JSON.stringify(next) !== JSON.stringify(view.repoOf[s.folder] ?? null)) { view.repoOf[s.folder] = next; changed = true; }
      }
      view.repoBusy = false;
      if (changed) cx3.notify();
    });
  };
  refresh(cx);
  cx.timer.every(POLL_MS, (cx2) => refresh(cx2));
}

// 프로젝트 섹션 네모에서 건너뛸 이름 머리(이 컴퓨터만의 설정, 레이아웃에는 들어 있지 않다).
//   data/slack/tile-prefixes.json  ["acme-", …]   예: "acme-api" → A
export async function loadTilePrefixes() {
  try {
    const list = JSON.parse(await fs.readFile(`${appHome()}/data/slack/tile-prefixes.json`, "utf8"));
    return Array.isArray(list) ? list.filter((x) => typeof x === "string" && x) : [];
  } catch { return []; }
}
