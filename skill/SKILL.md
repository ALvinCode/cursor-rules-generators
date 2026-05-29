---
name: generate-cursor-rules
description: >-
  Analyze a project's tech stack, architecture, code patterns, and conventions,
  then generate tailored .cursor/rules/*.mdc files. Use when the user says
  "generate cursor rules", "create project rules", "初始化规则", "生成 rules",
  or wants to set up AI-aware project context for Cursor agents.
---

# Generate Cursor Rules

Scan a project and produce `.cursor/rules/*.mdc` files that give Cursor agents
accurate, project-specific context (tech stack, commands, architecture, code
style, testing, error handling, etc.).

## Prerequisites

The CLI tool `cursor-rules-gen` must be installed globally:

```bash
npm install -g cursor-rules-generators
```

Verify installation:

```bash
cursor-rules-gen --version
```

If the command is not found, install it first before proceeding.

## Workflow

### Step 1 — Determine the target project path

- If the user specifies a path, use it.
- Otherwise default to the current workspace root.

### Step 2 — Generate rules

Run the CLI in the project root:

```bash
cursor-rules-gen generate <project-path>
```

This performs a full analysis (tech stack, modules, code features, practices,
directory structure) and writes:

| Output | Description |
|--------|-------------|
| `.cursor/rules/global-rules.mdc` | Always-on: persona, tech stack, commands, constraints, rule index |
| `.cursor/rules/code-style.mdc` | Naming conventions, formatting, lint settings |
| `.cursor/rules/project-structure.mdc` | Directory layout, file placement rules |
| `.cursor/rules/architecture.mdc` | Module structure, design patterns, code features |
| `.cursor/rules/custom-tools.mdc` | Project-specific hooks, utils, API clients |
| `.cursor/rules/error-handling.mdc` | Error handling patterns |
| `.cursor/rules/testing.mdc` | Test framework, commands, mock conventions |
| `.cursor/instructions.md` | Legacy instructions file |

Additional rules (state-management, routing, ui-ux) are generated when the
project uses relevant frameworks.

### Step 3 — Review the generated rules

After generation, read the key output files and verify:

1. **`global-rules.mdc`** — Check that Tech Stack, Commands, and Hard
   Constraints match the project.
2. **`testing.mdc`** — Confirm the test framework and run command are correct.
3. **`architecture.mdc`** — Review detected code features.

If any information is incorrect or missing, edit the `.mdc` files directly.
They are standard Markdown with YAML frontmatter.

### Step 4 — Report to the user

Summarize what was generated:
- Number of rule files written
- Key content highlights (tech stack, commands, test framework)
- Any suggestions for manual additions (e.g., team conventions, deployment
  patterns)

## Analyze-Only Mode

To inspect a project without writing files:

```bash
cursor-rules-gen analyze <project-path>
```

This prints a summary of detected tech stack, commands, modules, and features
to stdout.

## Customization Guide

For details on how to customize generated rules, see
[reference.md](reference.md).
