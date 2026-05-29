# Cursor Rules Generators

[简体中文](./README.zh-CN.md)

Analyze your project and generate tailored `.cursor/rules/*.mdc` files that give Cursor agents accurate, project-specific context.

Three usage modes — pick what fits:

| Mode | Best For | Setup Effort |
|------|----------|-------------|
| **Skill + CLI** (recommended) | Cursor users wanting zero-config agent integration | `npm install -g` + copy skill folder |
| **CLI standalone** | CI/CD, scripting, non-Cursor editors | `npm install -g` |
| **MCP Server** | Advanced users needing MCP protocol integration | JSON config in Cursor settings |

## ✨ Features

- **Smart Project Analysis**: Recursive scan (10 levels), 20+ tech stacks, monorepo support
- **Code Understanding**: Component structures, API routes, state management, custom hooks/utils, routing systems
- **Best Practices Integration**: Framework rules from Context7 and awesome-cursorrules, multi-category matching across 11 categories
- **Agent-Oriented Output**: `.mdc` files with proper frontmatter (`alwaysApply`, `globs`, `description`), version-pinned tech stack, actionable commands, Do/Don't examples
- **Consistency Checking**: Compares documentation with actual implementation

## 🚀 Quick Start

### Mode A: Skill + CLI (Recommended)

**Step 1 — Install the CLI globally**

```bash
npm install -g cursor-rules-generators
```

Verify:

```bash
cursor-rules-gen --version
```

**Step 2 — Install the Cursor Skill**

```bash
cp -r "$(npm root -g)/cursor-rules-generators/skill" ~/.cursor/skills/generate-cursor-rules
```

Or manually download the `skill/` folder from this repository and place it at `~/.cursor/skills/generate-cursor-rules/`.

**Step 3 — Use it**

In Cursor's AI chat, say:

```
Generate cursor rules for this project
```

The agent reads the Skill instructions, runs the CLI, and reviews the output for you.

### Mode B: CLI Standalone

```bash
# Generate rules for the current directory
cursor-rules-gen generate .

# Generate rules for a specific project
cursor-rules-gen generate /path/to/project

# Analyze only (no file writes)
cursor-rules-gen analyze .
```

### Mode C: MCP Server

Add to your Cursor MCP configuration:

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

Restart Cursor, then say:

```
Please generate Cursor Rules for the current project
```

> 💡 For a comprehensive walkthrough, see the [Getting Started Guide](./docs/GETTING_STARTED.md).

## 📋 CLI Reference

```
cursor-rules-gen <command> [path]

Commands:
  generate [path]   Analyze project and write .cursor/rules/*.mdc (default: .)
  analyze  [path]   Analyze project and print summary to stdout (no writes)
  --version         Show version
  --help            Show help
```

## 🛠️ MCP Tools

When running as an MCP Server, the following tools are exposed:

| Tool | Description |
|------|-------------|
| `generate_cursor_rules` | Full analysis + rule generation |
| `analyze_project` | Analysis only, returns structured data |
| `check_consistency` | Compare docs vs actual code |
| `update_project_description` | Update README based on actual code |
| `validate_rules` | Validate `.mdc` format and content |
| `preview_rules_generation` | Dry-run: show what would be generated |
| `info` | Show version, log config, environment |

## 📁 Generated Files

### Always Generated

```
.cursor/
├── instructions.md           # Workflow guidance
└── rules/
    ├── global-rules.mdc      # Persona, tech stack, commands, constraints, rule index
    ├── code-style.mdc        # Naming conventions, formatting, lint settings
    ├── project-structure.mdc  # Directory layout, file placement
    └── architecture.mdc      # Module structure, design patterns, code features
```

### Conditionally Generated

| File | When |
|------|------|
| `custom-tools.mdc` | Custom hooks/utils detected |
| `error-handling.mdc` | Error handling patterns found |
| `state-management.mdc` | Redux/Zustand/Pinia/etc detected |
| `ui-ux.mdc` | Frontend framework detected |
| `frontend-routing.mdc` | Frontend router detected |
| `api-routing.mdc` | Backend router detected |
| `testing.mdc` | Test framework detected |

### What's Inside the Rules

- **Tech Stack** with pinned versions from `package.json`
- **Commands** table: build, dev, test, lint, format, typeCheck
- **Hard Constraints**: NEVER rules, project-specific guardrails
- **Code Features**: Detected patterns with file examples
- **Test Framework**: Name, version, run command, correct mock syntax
- **Architecture**: Module structure, design principles
- **Rule Index**: Cross-references between all rule files

## 🔧 Supported Tech Stacks

**Frontend**: React, Vue, Angular, Svelte, Next.js, Nuxt, SvelteKit
**Backend**: Express, Fastify, NestJS, Koa, Hapi, Django, Flask, FastAPI
**Languages**: JavaScript, TypeScript, Python, Go, Rust, Java, PHP, Ruby
**Package Managers**: npm, yarn, pnpm, pip, cargo, go modules, maven, gradle
**Testing**: Jest, Vitest, Mocha, Cypress, Playwright, Testing Library
**State Management**: Redux, MobX, Zustand, Pinia, Vuex, Recoil, Jotai
**Styling**: Tailwind CSS, styled-components, Emotion, Material-UI, Ant Design, Chakra UI

## 📋 How It Works

```
1. Collect Files        → Recursive scan, file type statistics
2. Detect Tech Stack    → Languages, frameworks, dependencies, package manager
3. Detect Modules       → Monorepo, microservices, multi-module detection
4. Parse Config         → Prettier, ESLint, TypeScript, npm scripts, commands
5. Analyze Code         → Features, practices, patterns, custom hooks/utils
6. Deep Directory Scan  → 5-stage: dependency → semantic → business → inheritance → content
7. Detect Routing       → Dual-detection: dependencies + file structure
8. Match Best Practices → Context7 + awesome-cursorrules, 11-category matching
9. Generate Rules       → .mdc files with proper frontmatter and activation modes
10. Write & Validate    → Write files, markdownlint validation
```

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CURSOR_RULES_GENERATOR_LOG_LEVEL` | `INFO` | Log level: DEBUG, INFO, WARN, ERROR, NONE |
| `CURSOR_RULES_GENERATOR_LOG_FILE` | OS default | Custom log file path |
| `CURSOR_RULES_GENERATOR_DEBUG` | `false` | Enable debug mode |

### Log File Locations

| OS | Path |
|----|------|
| macOS | `~/Library/Logs/cursor-rules-generators.log` |
| Windows | `%USERPROFILE%\AppData\Local\cursor-rules-generators.log` |
| Linux | `~/.local/log/cursor-rules-generators.log` |

### Context7 Integration (Optional)

If Context7 MCP Server is configured, the tool automatically fetches official documentation and best practices. Without it, built-in templates are used.

## ⚠️ Notes

1. First generation takes a few seconds depending on project size
2. Regenerating overwrites existing rule files — commit to git first
3. Place custom rules in separate files to avoid overwriting
4. Context7 is optional; core functionality works without it

## 🤝 Contributing

```bash
git clone https://github.com/ALvinCode/cursor-rules-generators.git
cd cursor-rules-generators
pnpm install
pnpm run watch   # Dev mode with auto-recompile
pnpm test        # Run tests
pnpm run build   # Production build
```

- **Issues**: [GitHub Issues](https://github.com/ALvinCode/cursor-rules-generators/issues)
- **Repository**: [GitHub](https://github.com/ALvinCode/cursor-rules-generators)

## 📄 License

MIT

---

If this tool helps you, please give us a ⭐️!
