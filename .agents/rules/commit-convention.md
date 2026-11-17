# Commit convention

This file is the only copy of the commit rules. Other instruction files may point here. Do not paste these rules into `CLAUDE.md`, `AGENTS.md`, or `.cursor/rules`.

## When

- Create a commit only when the user asks.
- Push only when the user asks.
- Do not update git config.
- Do not skip hooks, force-push, or hard-reset unless the user explicitly asks.
- Do not force-push `main` or `master`.
- Do not amend unless the user explicitly asks, the commit is still unpushed, and it was created in the current conversation.
- Do not commit secrets (`.env`, credentials, tokens).

## Message

- One line: `rN: why this change`
- `N` is one greater than the highest `rN` already in `git log`. Look it up every time.
- The text after the colon says why.

```
r29: keep the portrait run on the 9:16 crop
```

## How

On PowerShell, do not use `&&` and do not use a bash heredoc. Pass the message as a here-string.

Before committing, inspect `git status`, `git diff`, and `git log` so the number and the message match the change. Stage only the files that belong in the commit. Run `git status` after the commit.

```powershell
git commit -m @'
r29: keep the portrait run on the 9:16 crop
'@
```
