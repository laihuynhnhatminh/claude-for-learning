# Use claude to learn

Heavily based on this video: [How I Use AI to Learn Things](https://www.youtube.com/watch?v=kzcI5F4tGiU).
Please go watch the video or you can access this github [How I Use AI to Learn Things](https://github.com/amosblomqvist/learn) for more details of the original pi implementation.

## What's in it

Everything Claude Code–specific lives under `.claude/`, so this repo is itself a usable Claude Code project — open it and the system is active, no setup step required.

- `.claude/skills/teach/` — the philosophy and the process
- `.claude/skills/visualize/` — adds a correct, minimal diagram to a lesson when an idea is clearer as a picture
- `.claude/agents/` — `researcher`, `svg-maker`, `mermaid-maker`: the subagents the system delegates to (via Claude Code's `Agent` tool)
- `.claude/commands/md-log.md`, `.claude/commands/md-unlog.md` — `/md-log <file>` / `/md-unlog`: link (or unlink) a markdown file to mirror the session into
- `.claude/hooks/md-log.mjs` + `.claude/settings.json` — a `Stop` hook that does the actual mirroring, turn by turn, once a file is linked
- `learning/<topic>/finding.md` — one file per topic, written by the `teach` skill itself (not a hook — deciding what was actually learned takes judgment). Distinct from `/md-log`: this is a distilled, per-topic verdict (what was covered, the Q&A evidence, an honest solid/shaky/not-yet per concept), not a raw transcript. See "Recording" in `.claude/skills/teach/SKILL.md`. Gitignored by default (see `.gitignore`) since it's your generated data, not config.
- `assets/` — README image

### What changed from the pi version

pi's custom extensions don't have a direct Claude Code equivalent, so each was ported to the closest native primitive rather than reimplemented as-is:

- **`ask-user-question` and `quiz`** → both now use Claude Code's built-in `AskUserQuestion` tool. There's no dedicated graded-quiz UI in Claude Code, so `teach/SKILL.md` now defines "quiz" as a *mode* of `AskUserQuestion`: the agent shuffles options itself, always adds an "I don't know" choice, and grades the answer in its own next reply (✓/✗, correct answer, explanation) instead of an instant-feedback popup handling it structurally. See the "Tooling" section near the top of `.claude/skills/teach/SKILL.md`.
- **`visual-tools`** (the custom `write_*`/`edit_*`/`render_*` tools) → gone entirely. `svg-maker` and `mermaid-maker` now just use `Write`/`Edit`/`Bash`/`Read` directly: write the source, render it with a shell command (`npx @mermaid-js/mermaid-cli` or `rsvg-convert`/`magick`), and `Read` the resulting PNG to visually verify it — `Read` displays images natively, so the "render, look at it, iterate" loop needs no custom tooling.
- **`md-log`** → reimplemented as a `Stop` hook (`.claude/hooks/md-log.mjs`) that parses the session's JSONL transcript directly, since Claude Code doesn't expose a live session-event API to scripts the way pi did. `/md-log` and `/md-unlog` just flip a small state file; the hook does the actual mirroring after every turn.

## Install

Just clone this repo and run `claude` from it. You can also copy `.claude/` into your own project and add the `teach` skill to your system.

Then run `claude` from `your-project/`. (Or just clone this repo and use it as your project directly — it already works standalone.)

## Requirements

- [Claude Code](https://claude.com/claude-code)
- Node.js, for the `md-log` hook script (`.claude/hooks/md-log.mjs`) and for `mermaid-maker`'s rendering (`npx @mermaid-js/mermaid-cli`, fetched on first use if not already installed).
- For `svg-maker`'s rendering: `rsvg-convert` (preferred) or ImageMagick's `magick` — at least one needs to be on `PATH`.

## Notes

You can run the system without the `researcher`/`svg-maker`/`mermaid-maker` subagents. The main session still teaches — you just lose verified web research and generated diagrams.

The teaching skill is written for one learner (me). Edit the skill to fit how you learn best.
