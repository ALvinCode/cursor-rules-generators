# Customization Reference

## Frontmatter Fields

Each `.mdc` file starts with YAML frontmatter controlling when the rule
activates:

```yaml
---
description: When and why this rule loads (agent uses this for matching)
alwaysApply: true          # Always loaded into context
globs: "**/*.test.ts"      # Loaded only for matching files
---
```

| Field | Type | Effect |
|-------|------|--------|
| `description` | string | Agent reads this to decide relevance |
| `alwaysApply` | boolean | Always injected into context |
| `globs` | string | File-pattern trigger |

Only `global-rules.mdc` should use `alwaysApply: true`. Other rules should
use `globs` or rely on `description` for intelligent matching.

## Adding Custom Rules

Create new `.mdc` files in `.cursor/rules/`:

```yaml
---
description: Database migration conventions and safety checklist
globs: "**/migrations/**"
---

# Database Migrations

- Always create reversible migrations
- Test migration on a copy of production data first
- ...
```

## Editing Generated Rules

All generated files are safe to edit. The generator will clean old files before
regenerating, so keep a backup or commit to git before re-running.

## Regenerating Rules

After significant project changes (new frameworks, restructured directories),
re-run:

```bash
cursor-rules-gen generate .
```

This cleans the previous `.cursor/rules/` and writes fresh rules.

## Rule Activation Modes

| Mode | Best For | Example |
|------|----------|---------|
| `alwaysApply: true` | Global constraints, tech stack | `global-rules.mdc` |
| `globs: "**/*.test.*"` | File-type-specific rules | `testing.mdc` |
| `description` only | On-demand architectural guidance | `architecture.mdc` |

## MCP Server Mode (Advanced)

The tool also ships as an MCP server for integration with any MCP-compatible
client. Configure in Cursor settings:

```json
{
  "mcpServers": {
    "cursor-rules-generators": {
      "command": "npx",
      "args": ["-y", "cursor-rules-generators"]
    }
  }
}
```

This exposes `generate_cursor_rules`, `analyze_project`,
`check_consistency`, and `update_project_description` as MCP tools.
