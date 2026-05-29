# Cursor Rules Generators

[English](./README.md) | 简体中文

分析你的项目，自动生成量身定制的 `.cursor/rules/*.mdc` 规则文件，为 Cursor Agent 提供准确的项目上下文。

三种使用方式，按需选择：

| 模式 | 适合场景 | 配置成本 |
|------|---------|---------|
| **Skill + CLI**（推荐） | Cursor 用户，零配置 Agent 集成 | `npm install -g` + 复制 skill 文件夹 |
| **CLI 独立使用** | CI/CD、脚本化、非 Cursor 编辑器 | `npm install -g` |
| **MCP Server** | 需要 MCP 协议集成的高级用户 | Cursor 设置中添加 JSON 配置 |

## ✨ 核心功能

- **智能项目分析**：递归扫描（10 层深度），支持 20+ 种技术栈，Monorepo 支持
- **代码理解**：组件结构、API 路由、状态管理、自定义 Hooks/工具函数、路由系统
- **最佳实践集成**：整合 Context7 和 awesome-cursorrules 的框架规则，跨 11 个类别匹配
- **Agent 导向输出**：`.mdc` 文件使用标准 frontmatter（`alwaysApply`、`globs`、`description`），版本钉定的技术栈，可执行命令，Do/Don't 示例
- **一致性检查**：对比项目文档与实际实现

## 🚀 快速开始

### 模式 A：Skill + CLI（推荐）

**第一步 — 全局安装 CLI**

```bash
npm install -g cursor-rules-generators
```

验证安装：

```bash
cursor-rules-gen --version
```

**第二步 — 安装 Cursor Skill**

```bash
cp -r "$(npm root -g)/cursor-rules-generators/skill" ~/.cursor/skills/generate-cursor-rules
```

或者从本仓库手动下载 `skill/` 文件夹，放到 `~/.cursor/skills/generate-cursor-rules/`。

**第三步 — 使用**

在 Cursor 的 AI 聊天窗口中说：

```
帮我生成 cursor rules
```

Agent 会自动读取 Skill 指令，运行 CLI 分析项目，审查输出并反馈结果。

### 模式 B：CLI 独立使用

```bash
# 在当前目录生成规则
cursor-rules-gen generate .

# 指定项目路径
cursor-rules-gen generate /path/to/project

# 仅分析不写入文件
cursor-rules-gen analyze .
```

### 模式 C：MCP Server

在 Cursor MCP 配置中添加：

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

重启 Cursor，然后说：

```
请为当前项目生成 Cursor Rules
```

> 💡 完整的使用指南请查看 [从 0 到 1 使用指南](./docs/GETTING_STARTED.md)。

## 📋 CLI 参考

```
cursor-rules-gen <command> [path]

命令：
  generate [path]   分析项目并生成 .cursor/rules/*.mdc（默认当前目录）
  analyze  [path]   分析项目并输出摘要到终端（不写入文件）
  --version         显示版本号
  --help            显示帮助
```

## 🛠️ MCP 工具

作为 MCP Server 运行时，提供以下工具：

| 工具 | 功能 |
|------|------|
| `generate_cursor_rules` | 完整分析 + 规则生成 |
| `analyze_project` | 仅分析，返回结构化数据 |
| `check_consistency` | 对比文档与实际代码 |
| `update_project_description` | 根据实际代码更新 README |
| `validate_rules` | 验证 `.mdc` 格式和内容 |
| `preview_rules_generation` | 预览模式：显示将要生成的内容 |
| `info` | 显示版本、日志配置、环境信息 |

## 📁 生成的文件

### 始终生成

```
.cursor/
├── instructions.md           # 工作流指导
└── rules/
    ├── global-rules.mdc      # Persona、技术栈、命令、约束、规则索引
    ├── code-style.mdc        # 命名规范、格式化、Lint 设置
    ├── project-structure.mdc  # 目录结构、文件放置规则
    └── architecture.mdc      # 模块结构、设计模式、代码特征
```

### 按需生成

| 文件 | 生成条件 |
|------|---------|
| `custom-tools.mdc` | 检测到自定义 Hooks/工具函数 |
| `error-handling.mdc` | 发现错误处理模式 |
| `state-management.mdc` | 检测到 Redux/Zustand/Pinia 等 |
| `ui-ux.mdc` | 检测到前端框架 |
| `frontend-routing.mdc` | 检测到前端路由 |
| `api-routing.mdc` | 检测到后端路由 |
| `testing.mdc` | 检测到测试框架 |

### 规则内容包含

- **技术栈**：从 `package.json` 提取的版本钉定信息
- **命令表**：build、dev、test、lint、format、typeCheck
- **硬约束**：NEVER 规则、项目级别的防护栏
- **代码特征**：检测到的模式及文件示例
- **测试框架**：名称、版本、运行命令、正确的 Mock 语法
- **架构**：模块结构、设计原则
- **规则索引**：所有规则文件之间的交叉引用

## 🔧 支持的技术栈

**前端**：React, Vue, Angular, Svelte, Next.js, Nuxt, SvelteKit
**后端**：Express, Fastify, NestJS, Koa, Hapi, Django, Flask, FastAPI
**语言**：JavaScript, TypeScript, Python, Go, Rust, Java, PHP, Ruby
**包管理器**：npm, yarn, pnpm, pip, cargo, go modules, maven, gradle
**测试**：Jest, Vitest, Mocha, Cypress, Playwright, Testing Library
**状态管理**：Redux, MobX, Zustand, Pinia, Vuex, Recoil, Jotai
**样式**：Tailwind CSS, styled-components, Emotion, Material-UI, Ant Design, Chakra UI

## 📋 工作流程

```
1. 收集文件        → 递归扫描，文件类型统计
2. 检测技术栈      → 语言、框架、依赖、包管理器
3. 检测模块        → Monorepo、微服务、多模块检测
4. 解析配置        → Prettier、ESLint、TypeScript、npm scripts、命令
5. 分析代码        → 特征、实践、模式、自定义 Hooks/工具函数
6. 深度目录扫描    → 5 阶段：依赖驱动 → 语义 → 业务 → 继承 → 内容
7. 检测路由        → 双重检测：依赖 + 文件结构
8. 匹配最佳实践    → Context7 + awesome-cursorrules，11 类别匹配
9. 生成规则        → .mdc 文件，标准 frontmatter，正确的激活模式
10. 写入与验证     → 写入文件，markdownlint 验证
```

## ⚙️ 配置

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CURSOR_RULES_GENERATOR_LOG_LEVEL` | `INFO` | 日志级别：DEBUG, INFO, WARN, ERROR, NONE |
| `CURSOR_RULES_GENERATOR_LOG_FILE` | 系统默认 | 自定义日志文件路径 |
| `CURSOR_RULES_GENERATOR_DEBUG` | `false` | 启用调试模式 |

### 日志文件位置

| 系统 | 路径 |
|------|------|
| macOS | `~/Library/Logs/cursor-rules-generators.log` |
| Windows | `%USERPROFILE%\AppData\Local\cursor-rules-generators.log` |
| Linux | `~/.local/log/cursor-rules-generators.log` |

### Context7 集成（可选）

如果配置了 Context7 MCP Server，工具会自动获取最新的官方文档和最佳实践。未配置时使用内置模板。

## ⚠️ 注意事项

1. 首次生成需要几秒钟，取决于项目大小
2. 重新生成会覆盖现有规则文件——建议先提交到 Git
3. 自定义规则放在独立文件中，避免被覆盖
4. Context7 是可选的，核心功能不受影响

## 🤝 贡献

```bash
git clone https://github.com/ALvinCode/cursor-rules-generators.git
cd cursor-rules-generators
pnpm install
pnpm run watch   # 开发模式，自动重编译
pnpm test        # 运行测试
pnpm run build   # 生产构建
```

- **Issues**：[GitHub Issues](https://github.com/ALvinCode/cursor-rules-generators/issues)
- **仓库**：[GitHub](https://github.com/ALvinCode/cursor-rules-generators)

## 📄 许可证

MIT

---

如果这个工具对你有帮助，请给我们一个 ⭐️！
