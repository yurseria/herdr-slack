# Slack for Herdr

A [Herdr](https://herdr.dev) layout that looks and works like the Slack desktop app: git repositories as
sidebar sections, checkouts and worktrees as channels, agent sessions as channel tabs, and a Slack-style
conversation with threads, a formatting composer, themes and a loading glow while the agent works.
The UI text is Korean.

![Slack](preview.png)

## Install

Ask the agent running in your Herdr: *"add the layout from github.com/yurseria/herdr-slack"*. Or by hand:

```sh
git clone https://github.com/yurseria/herdr-slack
cd herdr-slack
cp -R mods/* ~/.config/herdr-app/mods/
cp layouts/slack.json layouts/slack.svg ~/.config/herdr-app/layouts/
mkdir -p ~/.config/herdr-app/themes && cp themes/*.json ~/.config/herdr-app/themes/
herdr-app do layout.switch '{"name":"slack"}'
```

Needs `python3`, `git` and Claude Code or Codex. Built and tested on macOS.
See [RECIPE.md](RECIPE.md) for everything it does and how it is built.

## Credits and licenses

- Own code: MIT, see [LICENSE](LICENSE).
- `mods/slack-chat` and `mods/slack-chat-file` are based on
  [Herdr Chat Plus](https://github.com/AIPIXZ/herdr-chat-plus) and
  [Herdr Chat](https://github.com/naruse/herdr-chat): MIT, see `mods/slack-chat/LICENSE` and `NOTICE.md`.
- `mods/chat-preview` is Herdr Chat Plus's preview with a back button added: MIT, see
  `mods/chat-preview/LICENSE` and `NOTICE.md`. Installing it replaces a Chat Plus `chat-preview`.
- `mods/slack-files` is a copy of Herdr's shipped `files` mod, changed for the right panel.
- `mods/slack-chat/bin/flockbook-modfeed` is the sidecar of
  [Flockbook](https://github.com/minchenlee/flockbook), included unchanged: MIT, see
  `mods/slack-chat/bin/LICENSE-flockbook`.
- Lato font: SIL Open Font License, see `mods/slack/fonts/OFL.txt`.
