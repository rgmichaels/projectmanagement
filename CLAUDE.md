# Project management POC

A free, self-hosted, Jira-style project management POC: issues, a kanban board with swimlanes, drag-and-drop between statuses.

## Dev team (subagents in `.claude/agents/`)

Each role uses the cheapest model that can do the job:

| Role | Agent | Model | Job |
|---|---|---|---|
| Product manager | `product-manager` | Sonnet | Rough idea → spec in `docs/specs/` |
| Developer | `developer` | Opus | Implements one spec, with tests |
| QA | `qa` | Haiku | Re-runs tests, checks acceptance criteria, gives GO/NO-GO in `docs/qa/` |

Pipeline: product-manager → (owner reviews the spec) → developer → qa → owner commits.
If QA says NO-GO, send the report back to developer. The orchestrating session routes work through the team instead of implementing features directly.

## Decisions from the owner

- **Project statuses** come from the owner's earlier NYSBOE design: `Planning` (default for a new project) → `In Progress` → `Completed`. That design retires projects by status instead of deleting them; whether to add a retired/cancelled status is an open question.
- Nothing else from the NYSBOE design applies: no Salesforce data model, roles or Chatter. Everything else follows Jira conventions.
