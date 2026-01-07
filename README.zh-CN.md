# Cursor Rules Generators

[English](./README.md) | 简体中文

一个智能 MCP Server，能够自动分析项目并生成符合项目特点的 Cursor Rules。

## 🌟 核心功能

### 核心能力
- ✅ **智能项目分析**：自动扫描项目文件（最多10层深度），识别技术栈和依赖
- ✅ **技术栈检测**：支持 20+ 种主流技术栈，包括 Node.js、Python、Go、Rust、Java
- ✅ **多模块支持**：自动检测 monorepo、微服务和其他多模块架构
- ✅ **深度目录分析**：使用五阶段分析智能推断目录职能（依赖驱动、语义、业务上下文、继承、内容分析）

### 代码理解
- ✅ **代码特征分析**：识别组件结构、API 路由、状态管理模式
- ✅ **自定义模式检测**：发现自定义 hooks、工具函数和 API 客户端
- ✅ **文件组织学习**：学习项目特定的命名约定和目录结构
- ✅ **路由检测**：双重检测（依赖 + 文件结构）前端和后端路由系统

### 质量与一致性
- ✅ **一致性检查**：对比项目文档与实际实现
- ✅ **最佳实践集成**：整合 Context7 和 awesome-cursorrules 的框架最佳实践
- ✅ **多类别技术栈匹配**：跨 11 个类别匹配规则（前端、后端、移动端、样式、状态、数据库、测试、托管、构建、语言、其他）
- ✅ **规则验证**：使用 markdownlint 和格式检查验证生成的规则

### 规则生成
- ✅ **自动规则生成**：在 `.cursor/rules/` 目录生成 `.mdc` 格式规则文件
- ✅ **模块化规则**：支持全局规则 + 模块特定规则
- ✅ **依赖驱动规则**：基于项目依赖自动生成规则（路由、状态管理等）
- ✅ **规则需求分析**：智能分析需要哪些规则文件并说明原因
- ✅ **生成位置确认**：自动检测规则文件生成位置以匹配项目结构
- ✅ **结构化输出**：提供详细的生成摘要和说明
- ✅ **指南生成**：创建包含工作流指导的综合 `instructions.md`

## 🚀 快速开始

> 💡 **第一次使用？** 查看我们的完整 [从 0 到 1 使用指南](./docs/GETTING_STARTED.md)，带你从零开始全面了解和使用这个工具！

### 第一步：配置 Cursor（无需安装！）

**推荐方式：使用 npx**（自动下载运行，无需手动安装）

找到 Cursor 的 MCP 配置文件：

- **macOS/Linux**: `~/Library/Application Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- **Windows**: `%APPDATA%\Cursor\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`

添加以下配置：

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

### 第二步：重启 Cursor

完全退出并重新打开 Cursor，使配置生效。

### 第三步：生成规则

在 Cursor 的 AI 聊天窗口中，直接说：

```
请为当前项目生成 Cursor Rules
```

或者指定项目路径：

```
请为 /Users/zhangsan/projects/my-app 生成 Cursor Rules
```

就这么简单！工具会自动：

1. 扫描项目文件
2. 检测技术栈
3. 分析代码特征
4. 生成合适的规则
5. 保存到 `.cursor/rules/` 目录

## 📖 其他安装方式

### 方式二：全局安装（可选）

如果你希望全局安装：

```bash
npm install -g cursor-rules-generators
```

然后配置：

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

### 方式三：本地安装（可选）

在项目中本地安装：

```bash
npm install cursor-rules-generators
```

然后使用完整路径配置：

```json
{
  "mcpServers": {
    "cursor-rules-generators": {
      "command": "node",
      "args": ["/项目路径/node_modules/cursor-rules-generators/dist/index.js"],
      "disabled": false,
      "alwaysAllow": []
    }
  }
}
```

## 🛠️ 可用工具

### 1. `generate_cursor_rules` - 生成规则

**功能**：完整分析项目并生成 Cursor Rules

**参数**：

- `projectPath` (必需): 项目根目录的绝对路径
- `updateDescription` (可选): 是否自动更新描述文件，默认 `false`
- `includeModuleRules` (可选): 是否生成模块规则，默认 `true`

**使用示例**：

```
请为当前项目生成 Cursor Rules
```

### 2. `analyze_project` - 分析项目

**功能**：仅分析项目，不生成规则文件，返回详细的项目信息

**参数**：

- `projectPath` (必需): 项目根目录的绝对路径

**返回信息**：

- 文件统计（总数、类型分布）
- 技术栈详情（语言、框架、依赖）
- 模块结构（类型、路径、职责）
- 代码特征（组件、API、状态管理等）

**使用示例**：

```
请分析当前项目的结构和技术栈
```

### 3. `check_consistency` - 一致性检查

**功能**：检查项目描述文档与实际代码的一致性

**参数**：

- `projectPath` (必需): 项目根目录的绝对路径

**检查内容**：

- README 中的技术栈描述是否准确
- 重要功能是否有文档说明
- 是否存在过时的技术栈描述
- package.json 中的描述是否完整

**使用示例**：

```
请检查项目文档与代码的一致性
```

### 4. `update_project_description` - 更新描述

**功能**：根据实际代码自动更新项目描述文档

**参数**：

- `projectPath` (必需): 项目根目录的绝对路径
- `descriptionFile` (可选): 要更新的文件，默认 `README.md`

**使用示例**：

```
请根据实际代码更新 README
```

### 5. `validate_rules` - 验证规则

**功能**：验证 Cursor Rules 文件的格式和内容是否正确

**参数**：

- `projectPath` (必需): 项目根目录的绝对路径
- `validateModules` (可选): 是否验证模块目录中的规则文件，默认 `true`

**使用示例**：

```
请验证当前项目的 Cursor Rules 文件
```

### 6. `preview_rules_generation` - 预览生成

**功能**：预览规则生成过程，列出所有任务、分析结果和需要确认的决策点，不实际生成文件

**参数**：

- `projectPath` (必需): 项目根目录的绝对路径

**使用示例**：

```
请预览规则生成过程
```

### 7. `info` - 显示信息

**功能**：显示 MCP 工具信息，包括版本号、日志配置状态、环境变量配置和任何检测到的配置问题

**参数**：无

**使用示例**：

```
显示工具信息
```

## 🔄 完整工作流程

工具遵循 11 个任务的流水线来分析项目并生成规则：

```
任务 1：收集项目文件
   └─> 递归扫描（10层），文件类型统计
   
任务 2：分析技术栈与模块架构
   └─> 检测语言、框架、依赖、模块
   
任务 3：检查项目配置
   └─> 解析 Prettier、ESLint、TypeScript、npm 脚本
   
任务 4：分析项目实践
   └─> 提取错误处理、代码风格、组件模式
   
任务 5：检测自定义工具与模式
   └─> 发现自定义 hooks、工具函数、API 客户端
   
任务 6：学习文件组织
   └─> 分析目录结构、命名约定
   
任务 6.5：深度目录分析（新增）
   └─> 五阶段分析：依赖驱动 → 语义 → 业务 → 继承 → 内容
   
任务 7：识别路由系统
   └─> 双重检测：依赖 + 文件结构
   
任务 8：评估动态路由
   └─> 分析路由生成方式（脚本、命令、文件）
   
任务 9：生成规则与一致性检查
   └─> 整合最佳实践，检查文档-代码一致性
   
任务 10：写入规则文件与说明
   └─> 生成带验证的 .mdc 文件
   
任务 11：返回结构化摘要
   └─> 提供详细的分析和生成报告
```

**关键特性：**
- **降级机制**：关键规则始终生成（必要时使用简化版本）
- **错误隔离**：模块/文件失败不影响其他部分
- **预览模式**：在生成文件前查看计划
- **结构化输出**：详细摘要用于 PR 审查和文档

## 📁 生成的文件结构

### 必需规则（始终生成）

```
你的项目/
├── .cursor/
│   ├── instructions.md           # 工作流指导
│   └── rules/
│       ├── global-rules.mdc      # 项目概述与核心原则（优先级：100）
│       ├── code-style.mdc        # 代码风格指南（优先级：90）
│       ├── project-structure.mdc # 文件组织参考（优先级：85）
│       └── architecture.mdc      # 架构模式（优先级：90）
```

### 条件规则（基于项目特征生成）

```
├── .cursor/rules/
│   ├── custom-tools.mdc          # 检测到自定义 hooks/工具时（优先级：95）
│   ├── error-handling.mdc        # 发现错误处理模式时（优先级：80）
│   ├── state-management.mdc      # 检测到 Redux/Zustand 等时（优先级：85）
│   ├── ui-ux.mdc                 # 检测到 React/Vue/Angular 时（优先级：75）
│   ├── frontend-routing.mdc      # 检测到前端路由时（优先级：85）
│   ├── api-routing.mdc           # 检测到后端路由时（优先级：85）
│   └── testing.mdc               # 检测到测试框架时（优先级：70）
```

### 多模块项目

```
你的 monorepo/
├── .cursor/
│   ├── instructions.md           # 全局工作流指导
│   └── rules/
│       └── global-rules.mdc      # 整个项目的全局规则
├── frontend/
│   ├── .cursor/
│   │   └── rules/
│   │       └── frontend-rules.mdc   # 前端特定规则（优先级：50）
│   └── src/
├── backend/
│   ├── .cursor/
│   │   └── rules/
│   │       └── backend-rules.mdc    # 后端特定规则（优先级：50）
│   └── src/
└── shared/
    ├── .cursor/
    │   └── rules/
    │       └── shared-rules.mdc     # 共享模块规则（优先级：50）
    └── src/
```

**智能特性**：

- ✅ **基于优先级加载**：Cursor 按优先级加载规则（100 → 50）
- ✅ **依赖感知**：规则使用 `@filename.mdc` 相互引用
- ✅ **范围特定**：全局规则影响整个项目，模块规则仅影响该模块
- ✅ **降级保护**：关键规则始终生成（必要时使用简化版本）
- ✅ **验证**：所有规则在写入前使用 markdownlint 验证

## 🎯 支持的技术栈

### 前端框架

- React, Vue, Angular, Svelte
- Next.js, Nuxt, SvelteKit

### 后端框架

- Express, Fastify, NestJS, Koa, Hapi
- Django, Flask, FastAPI

### 编程语言

- JavaScript, TypeScript
- Python, Go, Rust, Java
- PHP, Ruby

### 状态管理

- Redux / Redux Toolkit
- MobX, Zustand
- Pinia, Vuex
- Recoil, Jotai

### UI 库

- Material-UI (@mui)
- Ant Design
- Chakra UI
- Tailwind CSS
- styled-components
- Emotion

### 测试框架

- Jest, Vitest
- Mocha, Chai
- Cypress, Playwright
- Testing Library

## 🔧 高级配置

### Context7 集成

如果您配置了 Context7 MCP Server，本工具会自动获取最新的官方文档和最佳实践。

**配置方法**：

1. 安装并配置 [Context7 MCP Server](https://context7.ai/)
2. 在 Cursor 的 MCP 配置中添加 Context7
3. 重启 Cursor

**注意**：Context7 是可选的，未配置不影响基本功能。

### 环境变量配置

#### 日志级别

控制日志详细程度：

```bash
# 设置日志级别（DEBUG, INFO, WARN, ERROR, NONE）
export CURSOR_RULES_GENERATOR_LOG_LEVEL=DEBUG
```

或在 Cursor 配置中设置：

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

#### 自定义日志文件位置

```bash
export CURSOR_RULES_GENERATOR_LOG_FILE=/path/to/your/logfile.log
```

#### 调试模式

```bash
# 启用调试模式（自动将日志级别设为 DEBUG）
export CURSOR_RULES_GENERATOR_DEBUG=true
```

**日志级别说明**：

- `DEBUG`: 输出所有日志，包括详细的调试信息
- `INFO`: 输出信息性日志（默认）
- `WARN`: 仅输出警告和错误
- `ERROR`: 仅输出错误
- `NONE`: 不输出任何日志

### 查看日志

日志会写入文件（不使用 stdout/stderr），以避免干扰 MCP 协议通信。

**默认日志位置**：

- **macOS**: `~/Library/Logs/cursor-rules-generators.log`
- **Windows**: `%USERPROFILE%\AppData\Local\cursor-rules-generators.log`
- **Linux/Unix**: `~/.local/log/cursor-rules-generators.log`

**查看日志**：

```bash
# macOS/Linux
tail -f ~/Library/Logs/cursor-rules-generators.log

# 查看最后 100 行
tail -n 100 ~/Library/Logs/cursor-rules-generators.log

# Windows
Get-Content $env:USERPROFILE\AppData\Local\cursor-rules-generators.log -Tail 100
```

或使用 `info` 工具查看日志文件路径：

```
显示工具信息
```

## 🔍 排除的目录

以下目录会被自动排除：

- `node_modules`, `.git`
- `dist`, `build`, `out`
- `.next`, `.nuxt`
- `coverage`, `.cache`
- `.vscode`, `.idea`
- `__pycache__`, `.pytest_cache`
- `venv`, `env`
- `target`, `bin`, `obj`

## ❓ 常见问题

### 1. 为什么检测不到某个框架？

**可能原因**：

- 框架依赖未在 package.json 中声明
- 使用了非标准的项目结构
- 框架名称不在支持列表中

**解决方法**：

- 确保依赖正确安装
- 手动编辑生成的规则文件
- 提交 Issue 请求支持新框架

### 2. 生成的规则不符合项目实际情况？

**可能原因**：

- 项目使用了非常规的架构
- 某些代码特征未被识别

**解决方法**：

- 使用 `analyze_project` 查看分析结果
- 手动创建自定义规则文件补充
- 提供反馈帮助改进检测算法

### 3. 如何处理一致性检查的提示？

**建议流程**：

1. 先运行 `check_consistency` 查看具体问题
2. 评估是否真的需要更新文档
3. 如果需要更新，运行 `update_project_description`
4. 或者手动编辑文档使其准确

### 4. 规则文件可以提交到版本控制吗？

**建议**：

- ✅ 提交自定义规则文件
- ❌ 不要提交自动生成的文件
- 在 `.gitignore` 中添加：

  ```
  .cursor/rules/*-rules.mdc
  !.cursor/rules/99-custom-rules.mdc
  ```

### 5. 如何查看日志文件？

使用 `info` 工具可以查看日志文件路径和状态：

```
显示工具信息
```

或者直接查看默认位置的日志文件（见上方"查看日志"部分）。

## ⚠️ 注意事项

1. **首次生成**：首次生成可能需要几秒钟，取决于项目大小
2. **大型项目**：超大型项目（10000+ 文件）可能需要更长时间
3. **覆盖规则**：再次生成会覆盖现有的规则文件
4. **手动编辑**：建议将自定义规则放在独立文件中，避免被覆盖
5. **Context7**：Context7 集成是可选的，未配置不影响基本功能
6. **日志输出**：日志会写入文件，不会干扰 MCP 协议通信

## 🤝 贡献指南

我们欢迎所有形式的贡献！

### 报告问题

- 使用 [GitHub Issues](https://github.com/ALvinCode/cursor-rules-generators/issues) 报告问题
- 提供详细的复现步骤
- 附上项目的 package.json（脱敏后）

### 提交代码

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启 Pull Request

### 开发环境设置

```bash
# 克隆仓库
git clone https://github.com/ALvinCode/cursor-rules-generators.git
cd cursor-rules-generators

# 安装依赖
pnpm install

# 开发模式（自动重新编译）
pnpm run watch

# 运行测试
pnpm test
```

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🙏 致谢

- Cursor 团队提供的 MCP 框架
- Context7 提供的文档集成方案
- 所有贡献者和使用者

## 📮 联系方式

- **Issues**: [GitHub Issues](https://github.com/ALvinCode/cursor-rules-generators/issues)
- **仓库**: [GitHub Repository](https://github.com/ALvinCode/cursor-rules-generators)

---

如果这个工具对您有帮助，请给我们一个 ⭐️！
