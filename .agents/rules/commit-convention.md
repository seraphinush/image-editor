# Commit Convention

Single source of truth. Point other agent files here; do not duplicate.

## Guardrails
- Commit or push only when explicitly asked.
- Never force-push (`main`/`master` strictly prohibited), hard-reset, modify git config, or bypass hooks.
- Amend only if explicitly requested, unpushed, and created in this session.
- Never commit secrets (`.env`, credentials, tokens).
- Stage only relevant files. Check `git status`, `git diff`, and `git log` before committing, and verify with `git status` after.

## Format
- Single line: `rN: <reason>`
- `N`: Inspect `git log` every time; set `N = highest existing rN + 1`.
- Explain the reason for the change after the colon.

```text
r29: keep the portrait run on the 9:16 crop
```

## PowerShell Execution
No `&&` or bash heredocs. Use here-strings:

```powershell
git commit -m @'
r29: keep the portrait run on the 9:16 crop
'@
```
