# Slack

Herdr dressed as the Slack desktop app. A gradient window frame holds a workspace rail, a sidebar where
each git repository is a section and each checkout or worktree (a Herdr space) is a channel, and a
dark main card. Each channel's agent sessions are tabs under the channel header, and an agent tab opens
as a Slack-style conversation by default. In it, the turn's tool runs fold into a "N개의 댓글" thread, a
reply can take side questions in a thread, the composer has Slack's formatting bar, and a glowing
"Claude Code 님이 입력 중…" line runs while the agent works. Themes are Slack's: pick a preset or set
the four colors and the window gradient yourself. The UI text is Korean.

![Slack](preview.png)

## What you see

Top to bottom, then left to right. The whole window sits on the theme background. By default it is a
gradient from the top-left corner, `#9C0000` to `#070C52`.

- **Top bar** (44px, transparent, drags the window)
  - Room on the left for the macOS window buttons (84px).
  - A sidebar toggle, then ← → (previous and next tab) and a clock (recent items).
  - A wide search field reading "무엇을 찾고 있는지 설명해 주세요" (max 820px, 30px high,
    white at 12% on the gradient).
  - A ? (help) button on the right.
- **Rail** (72px, transparent)
  - The workspace tile at the top: a 40px rounded square (radius 10) with the workspace picture, or
    its initials on `#e8a723`.
  - Then 홈, DM, 내 활동, 파일 and 더 보기. Each is a 36px icon cell with an 11px bold label under it;
    the chosen one has a white 19% cell.
  - At the bottom: + (new channel), a moon (theme) and your profile avatar (36px, radius 8) with a
    presence dot in the theme's presence color.
- **Main card** (6px in from the right and bottom, radius 8, 1px white 12% border), holding:
  - **Sidebar** (300px, 220–480, resizable; black 28% over the gradient)
    - Header (52px): the workspace name (18px bold) with ⌄, a gear and a pen.
    - "대화 찾기..." field.
    - Quick links: 읽지 않은 항목 (with a count badge), 다이렉트 메시지, 디렉터리; then a hairline.
    - Sections, each with a 28px head: your own sections, one section per git repository (its name)
      and "채널" for spaces outside any repository, in the order you dragged them (default: yours,
      repositories, 채널); then + 채널 추가, then "다이렉트 메시지" (this channel's agents with
      presence dots).
    - A repository section's head shows an 18px rounded square with its first letter instead of the
      caret, colored per letter (26 hues stepped 11 apart, three lightness levels). Name prefixes
      listed in `data/slack/tile-prefixes.json` (e.g. `["acme-"]`) are skipped, so `acme-api` shows A.
    - Channel rows (28px, 15px text): "#" and the channel name. The current channel is filled with
      the theme's selected color. Channels with work you haven't seen are bold white. An agent waiting
      for you shows a count badge in the theme's notify color; a working one, a pulsing green dot.
  - **Channel header** (92px, `#1a1d21`, 1px `#35373b` bottom line)
    - Top row: "# channel ⌄" (18px bold), the channel description in 13px `#ababad` (the agent's
      session title, or folder · branch), then a 채팅 | 터미널 switch, an agent count, split (terminal
      view only; the chat is one conversation, nothing to split), search and ⋮.
    - Tab row: each of the channel's sessions as a tab (program icon + session title, white with a 2px
      underline when chosen), then 파일 및 링크, then +.
  - **Conversation** (`#1a1d21`)
    - Messages: 36px rounded-square avatars, a bold name (Claude Code in `#d97757`, with a grey "APP"
      badge), the time ("오후 2:13"), then the text. Messages from one author in a row stack under
      one header. Days are split by a "오늘" / "어제" / "11월 19일 수요일" pill on a line.
    - Under a turn's replies: a thread link. It shows the agent's avatar, "N개의 댓글" in `#1d9bd1`
      bold, and, while the turn runs, what the agent is doing now.
    - Composer (radius 8): a formatting bar (bold, italic, strike, link, numbered and bulleted list,
      quote, code, code block); the box with "#channel에 메시지 보내기"; a bottom bar with + (attach),
      emoji, @, / and a send button.
    - Under the composer, a 12px line: "**Claude Code** 님이 입력 중…".
  - **Files panel** (right, 368px, hidden until toggled): Herdr's files and changes panels.
- **Notifications**: a 360×72 card at the top right of the window, under the channel header.

## How it behaves

**Agent status**

| Status | Sidebar channel | Rail | Conversation |
|---|---|---|---|
| working | pulsing green dot | — | thread link shows the current action with a glow; "님이 입력 중…" glows |
| blocked (needs you) | count badge (notify color) | badge on 내 활동 | the question in a box above the composer; the line reads "님이 답을 기다리고 있어요" in red |
| done, unseen | bold white name | count in 읽지 않은 항목 / 내 활동 | — |
| idle | normal | — | — |

The glow is a lighter copy of the text seen through a window that slides left to right in 1.4s, then
starts again from the left. It moves only while the agent works and the chat is on screen.

**Sidebar and rail**
- Click a channel to go to its space. Double-click to rename it. Right-click for a menu: move to a
  section, new section, rename, back to the branch name, new worktree (repository channels only),
  and the space menu.
- Click a section head to fold it; a folded section still shows the current channel and channels that
  need you. Right-click a section head to rename it, give it an emoji, move it up or down, or delete it
  (its channels go back). A section emoji (or a repository's letter square) takes the caret's place
  and turns into the caret on hover.
- Drag a section head to reorder sections; an accent line shows where it lands and the dragged
  section fades. Releasing in place doesn't fold it; leaving the sidebar cancels.
- Hovering a repository section shows a + at its right: it opens 새 채널 with that repository's
  folder filled in and the first-message box focused.
- Channel names: a name you gave; else the branch without `feat/`, `fix/`… prefixes; else the agent's
  session title; else "새 채널" (numbered when repeated). A new channel appears only once its
  repository is known, so it never jumps sections.
- 홈 shows channels, DM shows every agent (newest first). 내 활동 lists every session by when it last
  moved, newest first, under day headings (오늘, 어제, 11월 22일 일요일); a 읽지 않은 항목 chip filters to
  the unread ones (blocked, or done and unseen). Like Slack's activity list, it widens the sidebar to
  500px (back to the earlier width on leaving), uses the chat's `background`, and draws full-width
  cards (12px top/bottom, 20px right) split by gray `border` lines, with the same gray against the
  chat. Each card has three lines: the agent's name (bold only when unread, 14px) and time, then the
  last message in the conversation (14px; your own prefixed "나: ", markdown stripped, pasted image
  paths as [이미지]), then status · project · #tab in bold 12.5px, 6px lower. A red dot on the first
  line marks unread.
  The 읽지 않은 항목 quick link opens it filtered. 파일 toggles the files panel, 더 보기 opens the palette.
- Workspace tile and sidebar title: rename the workspace or set its picture (right-click, or drop an
  image on the tile). Profile avatar: right-click to set your name and picture; they show on your
  messages.
- The pen, + and 채널 추가 open **새 채널**: choose an agent (installed ones, most used first) or a
  terminal, 작업 폴더 (선택) (type to search folders under home in a dropdown, or pick one), 채널 이름
  (선택) ("비우면 브랜치 이름으로 보여요") and 첫 메시지 (선택).
  - With a folder: a new channel, unless a channel on the same worktree (same `git rev-parse
    --show-toplevel`) exists; then the agent joins that channel as a tab. Channel = worktree.
  - With a name typed, **새 worktree 생성** can be ticked: it runs `git worktree add` with the name as
    the branch (spaces → `-`) in `<worktrees.directory or ~/.herdr/worktrees>/<repo>/<branch>` and
    opens the new channel there. Errors (not a repository, bad branch name, folder exists) show as a
    notification and keep the dialog open.
  - Without a folder: a tab in **#일반** (the home folder's space, created if missing), named after
    the first message.
  - The header's + opens the same dialog for a new tab in this channel.
- The moon opens **테마**. It has 7 presets (크림슨 미드나잇, 오버진, 제이드, 라군, 바바라, 무드 인디고,
  그래파이트) and four colors to set as hex or with the macOS color picker: 시스템 탐색 (window), 선택된
  항목 (current channel, gradient end), 현재 상태 (presence) and 알림 (badges). A checkbox turns the
  window gradient on or off. Changes apply at once; the background is redrawn 0.5s after the last
  change.

**Conversation**
- Entering an agent tab opens the conversation (waiting up to 20s for a new agent to start). 터미널
  shows the terminal; the choice is kept per tab. Middle-click a tab to close it.
- Hovering a message darkens its row and floats an icon toolbar at its top right: copy, plus "스레드에
  댓글 달기" on replies or "수정해서 다시 보내기" on yours, each with a tooltip.
- A thread link or the thread button opens the thread pane on the right (300–900px; drag its left
  edge). Work threads list the turn's tool runs and thinking. Reply threads ask side questions about
  that reply without stopping the agent.
- Escape closes an open thread first, otherwise stops the agent's turn.
- Sending while the agent is asking closes its question (Escape to the terminal), then sends. This
  covers both a menu it opened after a turn and a question or permission request mid-turn.
- While the agent works, the "N개의 댓글" line spans the message width so its current action isn't cut;
  once done it is at most 640px, as in Slack.
- What you're typing survives the chat reloading.
- Enter with the cursor inside the text sends it as one line: the line break the box puts at the
  cursor before the send is dropped. A line break typed with Shift+Enter stays.
- At most two pages of 12 messages are drawn. With pages A B C D (D newest), the bottom shows C D.
  Once the whole view is inside C while scrolling up, B is added and D dropped (B C); then A B. Scrolling
  down into the lower page goes back (A B → B C). Each move takes two frames (add one side, measure,
  drop the other) so what you're reading never jumps. Messages arriving meanwhile wait until you're
  back on the newest page; "↓ Latest" jumps there. Reaching the top of what's parsed reads 4MB more
  of the log by itself ("Loading earlier history…"); there are no load buttons. A window taller than
  two pages adds the pages above (without dropping one) until it is full, so the top is never empty.
- Opening a chat reads the log's last 4MB, doubling until there are two pages of talk (up to 256MB
  for Codex, whose reader shrinks records over 256KB, and 16MB for others). An interrupted turn's
  work link sits under its replies, above the "Interrupted" pill.
- Before a new Claude session's log says otherwise, the mode and model come from
  `~/.claude/settings.json`: `permissions.defaultMode`, and `model` with a context suffix
  (`opus[1m]` shows "Opus 5.5 1M", effort from `modelSettings` or `effortLevel`).
- A new author's first row keeps the 18px gap even when it is only a thread link (a turn in progress).
- Long conversations first show a quick preview from the Flockbook sidecar (about 0.1s), then the
  full view once the log is parsed.
- A new Codex terminal with no log yet waits for its first message instead of asking to run /status.

## Built from

**Layout** `layouts/slack.json`
- Root `column`:
  - `theme: "graphite"` plus `colors` for every theme color and ansi0–15 (`background #1a1d21`,
    `foreground #d1d2d3`, `selected #1164a3`, `accent #1d9bd1`, `solid #007a5a`, …).
  - `ui_font: "Lato"`, `terminal_padding: [10, 16]`, `titlebar: "none"`, `traffic_lights: [18, 16]`,
    `toast: "slack-toast"`, `preview: "layouts/slack.svg"`.
  - `background`: a color or an image that `mods/slack/theme.js` writes into this file.
- Tree:
  - `topbar` block 44 (window_drag)
  - `body` row (not resizable)
    - `rail` block 72
    - `workspace` row (resizable, radius 8, border 1 `#ffffff1f`)
      - `sidebar` column 300 (220–480): `channels` block
      - `work` column
        - `header` block 92
        - `work-body` row
          - `conversation-view` stack: `main` (`{tab: "active"}`), and `conversation-page` (the
            template page, a column with the `conversation-chat` block: `slack-chat`,
            `props {presentation: true}`)
          - `panel` column 368 (hidden): `panel-body` stack of `files` / `changes`
    - `pad-right` 6
  - `pad-bottom` 6
- Blocks of mod `slack` take `props.view`: `topbar` | `rail` | `channels` | `header`.

**Mods**
- `mods/slack`:
  - `main.js` dispatches views and popups (`space-menu`, `profile-menu`, `profile-name`,
    `channel-menu`, `section-menu`, `workspace-menu`, `name-dialog`, `new-channel`, `theme`).
  - `topbar.js` records the window width in shared `slack.windowW`.
  - `rail.js`, `channels.js`, `header.js`.
  - `look.js`: names, `channelNames`, `groupByRepo`, `tabTitle`.
  - `repos.js`: `git rev-parse --git-common-dir` per space folder, every 0.3s for new folders and 15s
    otherwise.
  - `sections.js` (custom sections; section order in shared `slack.sectionOrder`), `sectionmenu.js`,
    `workspace.js`, `profilemenu.js`, `spaceimage.js`.
  - `activity.js`: 내 활동. The rail records when each agent's `seq` rises (shared
    `slack.activityAt`); sessions with no time yet take the tab's `changed_at`, else the last row time
    the Flockbook sidecar reads from their log. Filter in shared `slack.activityUnread`. The last
    message per agent is read the same way when its `seq` changes, into shared `slack.activityLast`,
    using its own sidecar cache (`data/slack/flockbook-activity-cache.json`).
  - `newchannel.js`: folder search runs `find ~ -maxdepth 5`, pruning hidden folders (except
    `.config`), `node_modules`, `Library`, `*.app`, `*.photoslibrary` and build folders.
  - `theme.js`, `themepanel.js`, `gradient.py`.
  - `chatview.js`, `presentation.js`, `backstage.js`, `identity.js`: switching chat ↔ terminal.
  - `demo.js`: demo mode for screenshots. With `data/slack/demo.json`
    (`{"folder": "<home>/herdr-demo", "workspace": "Acme", "profile": "Jamie"}`), only spaces under
    that folder and their agents show, and the workspace and profile show those names without
    pictures. `preview.png` was taken this way.
  - Lucide icons as svg; Lato fonts in `fonts/` (SIL OFL).
- `mods/slack-chat`: the conversation, from Herdr Chat Plus (MIT, see its `LICENSE` and `NOTICE.md`).
  The Slack parts: `look.js` (message rows, date pills, typing line, glow), `threads.js`,
  `flockfeed.js` and `bin/flockbook-modfeed` (Flockbook's sidecar, MIT), `enter.js` (Flockbook's
  `withoutEnter`: drops the line break Enter puts at the cursor before a send), and changes in `main.js`,
  `parse.js` (message times) and `session.js` (new Codex logs).
- `mods/slack-chat-file`: the editor and image dialog behind `/memory`, `/config` and file previews
  (from Chat Plus).
- `mods/slack-toast`: reopens each notification as a `kind: "window"` overlay at the top right of the
  chat column, 104px down: left of the Files panel when it is open (layout node `panel`), so the
  panel's tabs stay visible.
- Shipped mods used: `files`, `changes`, `menu`, `picker`, `worktree`; `project-open` if installed.
- `herdr` functions: `spaces`, `agents`, `panes`, `terminals`, `layout`, `shared`/`setShared`, `run`,
  `openOverlay`/`closeOverlay`, `exec`, `knownAgents`, `pickFolder`, `notify`, `window`, `home`,
  `appHome`, `setAgentOrder`.
- Commands: `space.select`, `space.new`, `space.rename`, `tab.select`, `tab.new`, `tab.rename`,
  `tab.close`, `tab.prev`/`next`, `agent.focus`, `layout.select`, `layout.toggle`, `pane.split`,
  `mod.open`, `app.settings`, `app.palette`, `app.help`.
- Programs it runs: `git`, `find`, `sips` (crops pictures), `osascript` (file and color pickers),
  `python3` (gradient image; Chat Plus's log readers), `hc`, `ps`, and the Flockbook sidecar.

## Watch out

- **What it runs and reads**:
  - Programs: `git` in each space folder, `find` over your home folder (new-channel dialog only),
    `python3`, `sips`, `osascript`, `hc`, `ps`, and `mods/slack-chat/bin/flockbook-modfeed`.
  - Files it reads: agent logs under `~/.claude` and `~/.codex`.
  - Files it reads: `data/slack/tile-prefixes.json` (optional, yours; not part of the layout).
  - Files it writes: `layouts/slack.json` (the theme background), `backgrounds/slack-*.png`,
    `data/slack/` (pictures) and `data/slack-chat/` (sidecar cache).
  - 새 worktree 생성 runs `git worktree add` in the chosen repository.
  - No network access, apart from what Chat Plus does for Claude and Codex.
- `layout.set` sent from a mod did not change the root background, so `theme.js` rewrites
  `layouts/slack.json` instead.
- A `loop` animation runs on a clock every view shares and goes there and back; a new element id does
  not restart it. The one-way glow therefore uses `transition("left")`: draw at the start under a new
  id, then set the far end 50ms later, every 1.4s.
- Don't measure text with `on_size_change` inside the chat: it re-lays the chat out and blanked it.
  The glow estimates text width from its characters (Hangul 12px, Latin 6.5px at 12px).
- An ellipsis (`truncate`) on a parent carries into the glow's clipped copy and draws "…" mid-text.
  Clip with `overflow_hidden` and `whitespace_nowrap` instead.
- Images need `.rounded()` on the `image` element itself; a parent's `overflow_hidden` clips only to
  a rectangle.
- Popups close their own tasks when they close, so picture picking is handed to the rail through
  shared `slack.spaceImageRequest`.
- Chat Plus creates its (empty) transcript as soon as it starts reading. "Nothing parsed yet" means
  empty entries, not a missing transcript.
- The layout name `slack` is checked in `slack-chat/presentation.js`. A clone needs that changed too.
- The Flockbook sidecar is a macOS binary (Intel and Apple Silicon). Elsewhere the quick preview is
  skipped. Remote machines' chats never use it.
- The window gradient is a radial PNG from the top-left corner, because layout gradients take two
  colors and one direction.
- Some controls in Slack have no counterpart and are left out: huddles, canvases, pins, reactions.
- Herdr gives no time for an agent's last activity, hence `activity.js`'s own record.
- The sidecar answers relative to its cache file, so two callers must not share one: sharing let the
  activity list's reads cut the chat's first preview down to a few rows.
- The chat's log reader waits on a folder watch with a 15-second fallback timer. Create that wait
  inside the reading task, with the task's own `cx.timer`: a timer taken from the caller's `cx` is
  dead once that callback returns, so a watch that stopped answering could leave the chat short of
  the log's end.
- The log reader continues from its last byte offset and only takes whole lines. A record with no
  newline in 6MB used to keep the offset where it was forever, so nothing after it ever showed
  (Codex writes image-generation output as one 8MB line). It now finds that record's end and steps
  over it; only a record with no newline before the end of the file (still being written) waits.
- Section dragging is built from `on_mouse_down`/`on_mouse_move`/`on_mouse_up`; GPUI drag-and-drop
  for elements isn't exposed. `on_size_change` only fires on a change, so each paging step also
  moves on after 400ms.
- Tested on macOS at 2× only.

## Done when

- `herdr-app check` passes for `mods/slack`, `mods/slack-chat`, `mods/slack-chat-file` and
  `mods/slack-toast`.
- After `layout.switch {name: "slack"}`:
  - The window shows the gradient frame, the rail with the workspace tile, and the sidebar with
    "채널" holding your spaces.
  - A space whose folder is a git worktree is listed under its repository's section, named after its
    branch without `feat/`.
- An agent tab opens as a conversation with Slack-style messages, and 터미널 switches to the
  terminal.
- While Claude works:
  - A "N개의 댓글" link appears under its reply, with the current action glowing left to right.
  - Clicking the link opens the thread pane with the turn's tool runs.
- The moon → 라군 turns the window to the Lagoon gradient and the current channel to `#2C7BB6`.
- The pen with an empty folder and a first message adds a tab to #일반 named after the message.
- A finished agent's notification appears at the top right.
- Dragging a repository section above your own sections keeps that order after a restart.
- 내 활동 shows yesterday's sessions under 어제 with their times; 읽지 않은 항목 leaves only red-dot
  sessions.
- 새 채널 with a name and 새 worktree 생성 ticked creates the worktree and a channel named after its
  branch.
