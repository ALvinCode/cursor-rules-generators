# Cursor Rules Generators

An intelligent MCP Server that automatically analyzes your project and generates Cursor Rules tailored to your project's characteristics.

## ✨ Features

### Core Capabilities
- ✅ **Smart Project Analysis**: Automatically scans project files (up to 10 levels deep) and identifies tech stack and dependencies
- ✅ **Tech Stack Detection**: Supports 20+ mainstream tech stacks including Node.js, Python, Go, Rust, Java
- ✅ **Multi-Module Support**: Automatically detects monorepo, microservices, and other multi-module architectures
- ✅ **Deep Directory Analysis**: Intelligently infers directory purposes using 5-stage analysis (dependency-driven, semantic, business context, inheritance, content analysis)

### Code Understanding
- ✅ **Code Feature Analysis**: Identifies component structures, API routes, state management patterns
- ✅ **Custom Pattern Detection**: Discovers custom hooks, utility functions, and API clients
- ✅ **File Organization Learning**: Learns project-specific naming conventions and directory structures
- ✅ **Router Detection**: Dual-detection (dependencies + file structure) for frontend and backend routing systems

### Quality & Consistency
- ✅ **Consistency Checking**: Compares project documentation with actual implementation
- ✅ **Best Practices Integration**: Integrates framework best practices from Context7 and awesome-cursorrules
- ✅ **Multi-Category Tech Stack Matching**: Matches rules across 11 categories (frontend, backend, mobile, styling, state, database, testing, hosting, build, language, other)
- ✅ **Rule Validation**: Validates generated rules with markdownlint and format checking

### Rule Generation
- ✅ **Automatic Rule Generation**: Generates `.mdc` format rule files in `.cursor/rules/` directory
- ✅ **Modular Rules**: Supports global rules + module-specific rules
- ✅ **Dependency-Driven Rules**: Automatically generates rules based on project dependencies (routing, state management, etc.)
- ✅ **Rule Requirements Analysis**: Intelligently analyzes which rule files are needed and explains why
- ✅ **Generation Location Confirmation**: Automatically detects rule file generation locations to match project structure
- ✅ **Structured Output**: Provides detailed generation summaries and explanations
- ✅ **Instructions Generation**: Creates comprehensive `instructions.md` with workflow guidance

## 🚀 Quick Start

> 💡 **New to this tool?** Check out our comprehensive [Getting Started Guide](./docs/GETTING_STARTED.md) for a complete walkthrough from zero to hero!

### Step 1: Configure Cursor (No Installation Required!)

**Recommended: Use npx** (automatically downloads and runs, no manual installation needed)

Find your Cursor MCP configuration file:

- **macOS/Linux**: `~/Library/Application Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- **Windows**: `%APPDATA%\Cursor\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`

Add this configuration:

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

### Step 2: Restart Cursor

Completely quit and restart Cursor to apply the configuration.

### Step 3: Generate Rules

In Cursor's AI chat window, simply say:

```
Please generate Cursor Rules for the current project
```

Or specify a project path:

```
Please generate Cursor Rules for /Users/myname/projects/my-app
```

That's it! The tool will automatically:

1. Scan your project files
2. Detect your tech stack
3. Analyze code features
4. Generate appropriate rules
5. Save them to `.cursor/rules/` directory

## 📖 Alternative Installation Methods

### Option 2: Global Installation

If you prefer to install globally:

```bash
npm install -g cursor-rules-generators
```

Then configure:

```json
{
  "mcpServers": {
    "cursor-rules-generators": {
      "command": "cursor-rules-generators",
      "disabled": false,
      "alwaysAllow": []
    }
  }
}
```

### Option 3: Local Installation

For local installation in a project:

```bash
npm install cursor-rules-generators
```

Then configure with the full path:

```json
{
  "mcpServers": {
    "cursor-rules-generators": {
      "command": "node",
      "args": ["/project/path/node_modules/cursor-rules-generators/dist/index.js"],
      "disabled": false,
      "alwaysAllow": []
    }
  }
}
```

## 🛠️ Available Tools

### 1. `generate_cursor_rules`

Analyzes the project and generates complete Cursor Rules.

**Parameters:**

- `projectPath` (required): Absolute path to project root directory
- `updateDescription` (optional): Whether to automatically update description files, default `false`
- `includeModuleRules` (optional): Whether to generate module-specific rules, default `true`

**Example:**

```
Please generate Cursor Rules for /Users/myname/projects/my-app
```

### 2. `analyze_project`

Analyzes the project only, without generating rules. Returns detailed project information.

**Parameters:**

- `projectPath` (required): Absolute path to project root directory

**Example:**

```
Please analyze the project structure and tech stack
```

### 3. `check_consistency`

Checks consistency between project documentation and actual code.

**Parameters:**

- `projectPath` (required): Absolute path to project root directory

**Example:**

```
Please check if the project documentation matches the actual code
```

### 4. `update_project_description`

Updates project description documents based on actual code.

**Parameters:**

- `projectPath` (required): Absolute path to project root directory
- `descriptionFile` (optional): File to update, default `README.md`

**Example:**

```
Please update the README based on the actual code
```

### 5. `validate_rules`

Validates the format and content of Cursor Rules files.

**Parameters:**

- `projectPath` (required): Absolute path to project root directory
- `validateModules` (optional): Whether to validate rule files in module directories, default `true`

**Example:**

```
Please validate the Cursor Rules files in the current project
```

### 6. `preview_rules_generation`

Previews the rule generation process, listing all tasks, analysis results, and decision points without actually generating files.

**Parameters:**

- `projectPath` (required): Absolute path to project root directory

**Example:**

```
Please preview what rules would be generated
```

### 7. `info`

Displays MCP tool information, including version, log configuration status, environment variables, and any detected configuration issues.

**Parameters:** None

**Example:**

```
Show tool information
```

## 📋 How It Works

The tool follows an 11-task pipeline to analyze your project and generate rules:

```
Task 1: Collect Project Files
   └─> Recursive scan (10 levels), file type statistics
   
Task 2: Analyze Tech Stack & Module Architecture
   └─> Detect languages, frameworks, dependencies, modules
   
Task 3: Check Project Configuration
   └─> Parse Prettier, ESLint, TypeScript, npm scripts
   
Task 4: Analyze Project Practices
   └─> Extract error handling, code style, component patterns
   
Task 5: Detect Custom Tools & Patterns
   └─> Discover custom hooks, utilities, API clients
   
Task 6: Learn File Organization
   └─> Analyze directory structure, naming conventions
   
Task 6.5: Deep Directory Analysis (NEW)
   └─> 5-stage analysis: dependency-driven → semantic → business → inheritance → content
   
Task 7: Identify Routing Systems
   └─> Dual-detection: dependencies + file structure
   
Task 8: Evaluate Dynamic Routing
   └─> Analyze routing generation methods (scripts, commands, files)
   
Task 9: Generate Rules & Check Consistency
   └─> Integrate best practices, check doc-code consistency
   
Task 10: Write Rule Files & Instructions
   └─> Generate .mdc files with validation
   
Task 11: Return Structured Summary
   └─> Provide detailed analysis and generation report
```

**Key Features:**
- **Fallback Mechanisms**: Critical rules always generate (with simplified versions if needed)
- **Error Isolation**: Module/file failures don't affect others
- **Preview Mode**: See the plan before generating files
- **Structured Output**: Detailed summaries for PR review and documentation

## 🔧 Supported Tech Stacks

### Frontend Frameworks

- React, Vue, Angular, Svelte
- Next.js, Nuxt, SvelteKit

### Backend Frameworks

- Express, Fastify, NestJS, Koa, Hapi
- Django, Flask, FastAPI

### Languages

- JavaScript, TypeScript
- Python, Go, Rust, Java
- PHP, Ruby

### Tools

- npm / yarn / pnpm
- pip / pipenv
- cargo
- go modules
- maven / gradle

## 📁 Generated File Structure

### Required Rules (Always Generated)

```
your-project/
├── .cursor/
│   ├── instructions.md           # Workflow guidance
│   └── rules/
│       ├── global-rules.mdc      # Project overview & core principles (Priority: 100)
│       ├── code-style.mdc        # Code style guidelines (Priority: 90)
│       ├── project-structure.mdc # File organization reference (Priority: 85)
│       └── architecture.mdc      # Architecture patterns (Priority: 90)
```

### Conditional Rules (Generated Based on Project Features)

```
├── .cursor/rules/
│   ├── custom-tools.mdc          # If custom hooks/utils detected (Priority: 95)
│   ├── error-handling.mdc        # If error handling patterns found (Priority: 80)
│   ├── state-management.mdc      # If Redux/Zustand/etc detected (Priority: 85)
│   ├── ui-ux.mdc                 # If React/Vue/Angular detected (Priority: 75)
│   ├── frontend-routing.mdc      # If frontend router detected (Priority: 85)
│   ├── api-routing.mdc           # If backend router detected (Priority: 85)
│   └── testing.mdc               # If test framework detected (Priority: 70)
```

### Multi-Module Project

```
your-monorepo/
├── .cursor/
│   ├── instructions.md           # Global workflow guidance
│   └── rules/
│       └── global-rules.mdc      # Global rules for entire project
├── frontend/
│   ├── .cursor/
│   │   └── rules/
│   │       └── frontend-rules.mdc   # Frontend-specific rules (Priority: 50)
│   └── src/
├── backend/
│   ├── .cursor/
│   │   └── rules/
│   │       └── backend-rules.mdc    # Backend-specific rules (Priority: 50)
│   └── src/
└── shared/
    ├── .cursor/
    │   └── rules/
    │       └── shared-rules.mdc     # Shared module rules (Priority: 50)
    └── src/
```

**Smart Features:**

- ✅ **Priority-Based Loading**: Cursor loads rules by priority (100 → 50)
- ✅ **Dependency-Aware**: Rules reference each other using `@filename.mdc`
- ✅ **Scope-Specific**: Global rules affect entire project, module rules affect only that module
- ✅ **Fallback Protection**: Critical rules always generate (with simplified versions if needed)
- ✅ **Validation**: All rules validated with markdownlint before writing

## 📝 What Gets Generated

### Global Rules (Always)

| Rule File | Content | Lines |
|-----------|---------|-------|
| `global-rules.mdc` | Project overview, tech stack, core principles | ~280 |
| `code-style.mdc` | Naming conventions, formatting, code patterns | ~200 |
| `project-structure.mdc` | Directory structure, file organization, naming rules | ~300 |
| `architecture.mdc` | Architecture patterns, design principles | ~200 |

### Conditional Rules (Based on Features)

| Rule File | Generated When | Lines |
|-----------|----------------|-------|
| `custom-tools.mdc` | Custom hooks/utilities detected | ~150 |
| `error-handling.mdc` | Error handling patterns found | ~180 |
| `state-management.mdc` | State management library detected | ~200 |
| `ui-ux.mdc` | Frontend framework detected | ~250 |
| `frontend-routing.mdc` | Frontend router detected | ~300 |
| `api-routing.mdc` | Backend router detected | ~300 |
| `testing.mdc` | Test framework detected | ~220 |

### Instructions File

| File | Content | Purpose |
|------|---------|---------|
| `instructions.md` | Workflow guidance, rule usage, best practices | Unified team AI usage manual |

### Rule Content Includes

- **Tech Stack Analysis**: Detected languages, frameworks, dependencies
- **Directory Structure**: Complete project structure with purpose annotations
- **Code Patterns**: Actual patterns extracted from your codebase
- **Best Practices**: Framework-specific best practices from Context7 and awesome-cursorrules
- **Custom Assets**: Your custom hooks, utilities, API clients
- **Routing Information**: Router configuration and examples
- **File Organization**: Where to put components, utils, pages, etc.
- **Naming Conventions**: Learned from your existing files
- **Important Notes**: Common pitfalls and project-specific reminders

## 🤝 Context7 Integration

If you have Context7 MCP Server configured in your environment, this tool will automatically fetch official documentation and best practices for your dependencies.

If Context7 is not configured, the tool will use built-in best practice templates.

**Configuring Context7 (Optional):**

Refer to [Context7 MCP Server documentation](https://context7.ai/) for setup instructions.

## 🔍 Excluded Directories

The following directories are automatically excluded:

- `node_modules`, `.git`
- `dist`, `build`, `out`
- `.next`, `.nuxt`
- `coverage`, `.cache`
- `.vscode`, `.idea`
- `__pycache__`, `.pytest_cache`
- `venv`, `env`
- `target`, `bin`, `obj`

## ⚙️ Environment Variables

### Log Level

Control log verbosity:

```bash
# Set log level (DEBUG, INFO, WARN, ERROR, NONE)
export CURSOR_RULES_GENERATOR_LOG_LEVEL=DEBUG
```

Or in Cursor configuration:

```json
{
  "mcpServers": {
    "cursor-rules-generators": {
      "command": "npx",
      "args": ["-y", "cursor-rules-generators"],
      "env": {
        "CURSOR_RULES_GENERATOR_LOG_LEVEL": "INFO"
      }
    }
  }
}
```

### Custom Log File Location

```bash
export CURSOR_RULES_GENERATOR_LOG_FILE=/path/to/your/logfile.log
```

### Debug Mode

```bash
# Enable debug mode (automatically sets log level to DEBUG)
export CURSOR_RULES_GENERATOR_DEBUG=true
```

**Log Levels:**

- `DEBUG`: All logs including detailed debugging information
- `INFO`: Informational logs (default)
- `WARN`: Warnings and errors only
- `ERROR`: Errors only
- `NONE`: No logs

### Viewing Logs

Logs are written to files (not stdout/stderr) to avoid interfering with MCP protocol communication.

**Default log locations:**

- **macOS**: `~/Library/Logs/cursor-rules-generators.log`
- **Windows**: `%USERPROFILE%\AppData\Local\cursor-rules-generators.log`
- **Linux/Unix**: `~/.local/log/cursor-rules-generators.log`

**View logs:**

```bash
# macOS/Linux
tail -f ~/Library/Logs/cursor-rules-generators.log

# Windows
Get-Content $env:USERPROFILE\AppData\Local\cursor-rules-generators.log -Tail 100
```

Or use the `info` tool to see the log file path:

```
Show tool information
```

## ⚠️ Important Notes

1. **First Generation**: First generation may take a few seconds depending on project size
2. **Large Projects**: Very large projects (10,000+ files) may take longer
3. **Rule Overwriting**: Regenerating will overwrite existing rule files
4. **Manual Editing**: Consider placing custom rules in separate files to avoid overwriting
5. **Context7**: Context7 integration is optional; basic functionality works without it
6. **Logs**: Logs are written to files, not displayed in the console

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please feel free to submit Issues and Pull Requests.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/ALvinCode/cursor-rules-generators.git
cd cursor-rules-generators

# Install dependencies
pnpm install

# Development mode (auto-recompile)
pnpm run watch

# Build
pnpm run build

# Test
pnpm test
```

## 📮 Feedback & Support

- **GitHub Issues**: [Report Issues](https://github.com/ALvinCode/cursor-rules-generators/issues)
- **Repository**: [GitHub Repository](https://github.com/ALvinCode/cursor-rules-generators)

---

If this tool helps you, please give us a ⭐️!
