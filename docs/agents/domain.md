# Domain Docs

This repository uses the single-context domain documentation layout.

## Before exploring

- Read `CONTEXT.md` at the repository root when it exists.
- Read relevant decisions under `docs/adr/`.
- If these files do not exist, proceed silently. Create them lazily when domain terms or durable decisions are resolved.

## Layout

```text
/
├── CONTEXT.md
├── docs/adr/
└── app/
```

## Vocabulary

Use terms exactly as defined in `CONTEXT.md` when naming modules, issues, refactors, hypotheses, and tests. If a required concept is missing, reconsider the terminology or record the gap for domain modeling.

## ADR conflicts

Explicitly identify proposals that conflict with an existing ADR rather than silently overriding the decision.
