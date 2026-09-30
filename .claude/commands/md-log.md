---
description: Mirror this session to a markdown file, live, for reading in Obsidian (backfills existing history)
argument-hint: <filepath>
allowed-tools: Bash
---

Link the session log to the file the user gave: `$ARGUMENTS`.

Resolve it relative to the project root if it isn't already absolute, then run:

```
node .claude/hooks/md-log.mjs --link "$ARGUMENTS"
```

- The file must already exist — this links into an existing note, it never creates one. If the command reports the file is missing, tell the user to create it (or fix the path) rather than creating it yourself.
- On success, tell the user the log is linked. The full backfill of everything said so far in this session, plus every turn from here on, appends automatically after each of your replies — you don't need to do anything else.
