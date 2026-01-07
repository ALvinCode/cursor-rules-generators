# Cursor Rules Generators MCP Server

> 自动分析项目并生成符合项目特点的 Cursor Rules

## 📖 目录

1. [MCP Server 功能](#1-mcp-server-功能)
2. [生成原理](#2-生成原理)
3. [快速开始](#3-快速开始)
4. [使用方式](#4-使用方式)
5. [实战案例](#5-实战案例)
6. [进阶配置](#6-进阶配置)
7. [常见问题](#7-常见问题)
8. [最佳实践](#8-最佳实践)

---

## 1. MCP Server 功能

### 1.1 核心功能

**Cursor Rules Generators** 是一个 MCP (Model Context Protocol) Server，提供 **7 个工具**来自动化管理项目的 Cursor Rules：

```
输入：项目路径
  ↓
自动分析：文件结构、技术栈、代码风格、自定义工具、目录职能
  ↓
输出：完整的 Cursor Rules（.cursor/rules/*.mdc + instructions.md）
```

### 1.2 提供的工具

| 工具 | 功能 | 用途 |
|------|------|------|
| `generate_cursor_rules` | 生成规则 | 完整分析项目并生成所有规则文件 |
| `analyze_project` | 分析项目 | 仅分析项目结构和技术栈，不生成文件 |
| `check_consistency` | 一致性检查 | 检查文档与代码的一致性 |
| `update_project_description` | 更新描述 | 根据实际代码更新项目文档 |
| `validate_rules` | 验证规则 | 验证规则文件的格式和内容 |
| `preview_rules_generation` | 预览生成 | 预览生成计划，不实际生成文件 |
| `info` | 显示信息 | 显示工具版本和配置状态 |

### 1.3 生成的规则文件

#### 必需规则（Always Generated）

| 文件 | 内容 | 优先级 | 行数 |
|------|------|--------|------|
| `global-rules.mdc` | 项目概述、技术栈、核心原则 | 100 | ~280 |
| `code-style.mdc` | 代码风格、命名规范 | 90 | ~200 |
| `project-structure.mdc` | 目录结构、文件组织 | 85 | ~300 |
| `architecture.mdc` | 架构模式、设计原则 | 90 | ~200 |

#### 条件规则（Based on Project Features）

| 文件 | 生成条件 | 优先级 | 行数 |
|------|---------|--------|------|
| `custom-tools.mdc` | 检测到自定义 hooks/工具 | 95 | ~150 |
| `error-handling.mdc` | 发现错误处理模式 | 80 | ~180 |
| `state-management.mdc` | 检测到状态管理库 | 85 | ~200 |
| `ui-ux.mdc` | 检测到前端框架 | 75 | ~250 |
| `frontend-routing.mdc` | 检测到前端路由 | 85 | ~300 |
| `api-routing.mdc` | 检测到后端路由 | 85 | ~300 |
| `testing.mdc` | 检测到测试框架 | 70 | ~220 |

---

## 2. 生成原理

### 2.1 11 任务流水线

```
[任务 1] 收集项目文件
   └─> 递归扫描（10层深度），统计文件类型
   
[任务 2] 分析技术栈与模块架构
   └─> 识别语言、框架、依赖、模块结构
   
[任务 3] 检查项目配置
   └─> 解析 Prettier、ESLint、TypeScript、npm 脚本
   
[任务 4] 分析项目实践规范
   └─> 提取错误处理、代码风格、组件模式
   
[任务 5] 检测自定义工具与模式
   └─> 发现自定义 hooks、工具函数、API 客户端
   
[任务 6] 学习文件组织结构
   └─> 分析目录结构、命名约定
   
[任务 6.5] 深度目录分析 ⭐ 核心特性
   └─> 五阶段分析：依赖驱动 → 语义 → 业务 → 继承 → 内容
   
[任务 7] 识别路由系统
   └─> 双重检测：依赖 + 文件结构
   
[任务 8] 评估动态路由生成方式
   └─> 分析路由生成方式（脚本、命令、文件）
   
[任务 9] 生成规则与一致性检查
   └─> 整合最佳实践，检查文档-代码一致性
   
[任务 10] 写入规则文件与使用说明
   └─> 生成带验证的 .mdc 文件 + instructions.md
   
[任务 11] 返回结构化摘要
   └─> 提供详细的分析和生成报告
```

### 2.2 五阶段目录分析（核心创新）

这是 Cursor Rules Generators 的核心特性，让它能准确理解每个目录的作用：

#### 阶段 1：依赖关联判断（最高优先级）

检查目录是否与已安装的依赖相关。

**示例：**

```
src/i18n/locales/  → "国际化（i18next）相关"
src/redux/features/ → "Redux 状态管理相关子模块"
```

**支持的依赖类型：**

- 国际化：i18next, react-i18next, next-i18next
- 状态管理：redux, zustand, mobx, recoil, jotai
- UI 库：@mui/material, antd, @chakra-ui/react
- 路由：react-router, @tanstack/react-router
- 表单：react-hook-form, formik
- 数据获取：react-query, swr, apollo-client
- 测试：jest, @testing-library/react

#### 阶段 2：类别语义判断

识别行业通用的类别词。

**示例：**

```
src/components/ → "组件"
src/utils/      → "工具函数"
src/hooks/      → "Hooks"
src/pages/      → "页面"
src/api/        → "API 服务"
```

#### 阶段 3：业务语义判断

分析目录名和文件内容，提取业务关键词。

**示例：**

```
src/features/payment/  → "支付相关功能模块"
src/services/loan/     → "贷款相关 API 服务"
src/components/insurance/ → "保险相关组件"
```

#### 阶段 4：父级语义继承

组合父级类别和当前业务词。

**示例：**

```
components/insurance/ → "保险相关组件"
services/payment/     → "支付相关 API 服务"
utils/format/         → "格式化相关工具函数"
```

#### 阶段 5：文件内容深度分析

作为兜底，分析文件内容推断职能。

**示例：**

```
检测到 JSX → "组件"
检测到 axios/fetch → "API 服务"
检测到 export function use* → "Hooks"
检测到 schema/model → "数据模型"
```

### 2.3 规则生成策略

#### 框架匹配与最佳实践集成

```
1. 框架匹配
   └─> 从 awesome-cursorrules 中找到最相似的框架规则
   └─> 计算相似度（基于技术栈重叠）
   
2. 多类别技术栈匹配
   └─> 支持 11 个类别：frontend, backend, mobile, styling, 
       state, database, testing, hosting, build, language, other
   
3. 最佳实践提取
   └─> 从匹配的规则中提取框架特定的最佳实践
   └─> 对比项目实际使用与最佳实践
   └─> 生成改进建议
   
4. 规则需求分析
   └─> 基于依赖、文件结构、配置决定需要哪些规则
   └─> 为每个规则提供生成原因说明
```

#### 生成顺序与依赖关系

```
global-rules.mdc (基础，优先级 100)
  ├─> code-style.mdc (优先级 90)
  │   └─> ui-ux.mdc (优先级 75)
  ├─> project-structure.mdc (优先级 85)
  │   └─> architecture.mdc (优先级 90)
  │       ├─> frontend-routing.mdc (优先级 85)
  │       └─> api-routing.mdc (优先级 85)
  ├─> custom-tools.mdc (优先级 95)
  │   └─> error-handling.mdc (优先级 80)
  ├─> state-management.mdc (优先级 85)
  └─> testing.mdc (优先级 70)
```

#### 质量保证机制

- **降级保护**：关键规则生成失败时使用简化版本
- **错误隔离**：单个模块/文件失败不影响其他部分
- **格式验证**：使用 markdownlint 验证所有生成的规则
- **一致性检查**：对比文档与代码，提示不一致之处

---

## 3. 快速开始

### 3.1 配置 Cursor

找到 Cursor 的 MCP 配置文件：

**macOS/Linux:**

```bash
~/Library/Application Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json
```

**Windows:**

```bash
%APPDATA%\Cursor\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json
```

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

> 💡 **提示**：使用 `npx` 方式无需手动安装，会自动下载最新版本。

### 3.2 重启 Cursor

完全退出 Cursor（不是关闭窗口），然后重新打开。

### 3.3 生成规则

在 Cursor 的 AI 聊天窗口中输入：

```
请为当前项目生成 Cursor Rules
```

### 3.4 查看结果

生成完成后，你会在项目中看到：

```
your-project/
├── .cursor/
│   ├── instructions.md           # 📖 使用指南（先读这个！）
│   └── rules/
│       ├── global-rules.mdc      # 项目概述
│       ├── code-style.mdc        # 代码风格
│       ├── project-structure.mdc # 文件组织
│       ├── architecture.mdc      # 架构规范
│       └── ...                   # 其他条件规则
```

---

## 4. 使用方式

### 4.1 工具 1：generate_cursor_rules

**功能**：完整分析项目并生成规则

**参数**：

- `projectPath` (必需): 项目根目录路径
- `updateDescription` (可选): 是否自动更新描述文件，默认 `false`
- `includeModuleRules` (可选): 是否生成模块规则，默认 `true`

**使用示例**：

```
请为当前项目生成 Cursor Rules
请为 /path/to/project 生成 Cursor Rules，并自动更新文档
```

**输出内容**：

- 11 个任务的执行记录
- 项目分析结果（技术栈、模块、代码特征）
- 生成的规则文件列表
- 规则需求分析
- 结构化生成摘要

### 4.2 工具 2：analyze_project

**功能**：仅分析项目，不生成规则

**参数**：

- `projectPath` (必需): 项目根目录路径

**返回信息**：

- 文件统计（总数、类型分布）
- 技术栈详情（语言、框架、依赖）
- 模块结构（类型、路径、职责）
- 代码特征（组件、API、状态管理等）

**使用示例**：

```
请分析当前项目的结构和技术栈
```

### 4.3 工具 3：check_consistency

**功能**：检查文档与代码的一致性

**参数**：

- `projectPath` (必需): 项目根目录路径

**检查内容**：

- README 中的技术栈描述是否准确
- 重要功能是否有文档说明
- 是否存在过时的技术栈描述

**使用示例**：

```
请检查项目文档与代码的一致性
```

### 4.4 工具 4：update_project_description

**功能**：根据实际代码更新文档

**参数**：

- `projectPath` (必需): 项目根目录路径
- `descriptionFile` (可选): 要更新的文件，默认 `README.md`

**使用示例**：

```
请根据实际代码更新 README
```

### 4.5 工具 5：validate_rules

**功能**：验证规则文件的格式和内容

**参数**：

- `projectPath` (必需): 项目根目录路径
- `validateModules` (可选): 是否验证模块规则，默认 `true`

**使用示例**：

```
请验证当前项目的 Cursor Rules 文件
```

### 4.6 工具 6：preview_rules_generation

**功能**：预览规则生成过程，不实际生成文件

**参数**：

- `projectPath` (必需): 项目根目录路径

**输出内容**：

- 11 个任务的执行计划
- 分析结果统计
- 需要确认的决策点
- 将要生成的文件列表

**使用示例**：

```
请预览规则生成过程
```

### 4.7 工具 7：info

**功能**：显示工具信息和配置状态

**参数**：无

**输出内容**：

- 版本号
- 日志配置状态
- 环境变量配置
- 配置问题检测

**使用示例**：

```
显示工具信息
```

---

## 5. 实战案例

### 5.1 案例 1：单体 Next.js 项目

**项目特征：**

- Next.js 14 + TypeScript + Tailwind CSS
- 使用 App Router
- 有自定义 hooks 和工具函数

**操作步骤：**

1. **生成规则**

```
请为当前项目生成 Cursor Rules
```

1. **生成结果**

```
✅ 生成了 8 个规则文件：
  - global-rules.mdc
  - code-style.mdc
  - project-structure.mdc
  - architecture.mdc
  - custom-tools.mdc
  - ui-ux.mdc
  - frontend-routing.mdc
  - testing.mdc
```

1. **使用效果**

让 AI 生成一个页面：

```
请创建一个用户列表页面，包含搜索和分页功能
```

AI 会自动：

- ✅ 使用正确的路径别名（`@/components`）
- ✅ 遵循代码风格（命名导出、箭头函数）
- ✅ 使用项目中的自定义工具
- ✅ 遵循文件组织规范

### 5.2 案例 2：Monorepo 项目

**项目结构：**

```
my-monorepo/
├── frontend/          # Next.js 前端
├── backend/           # NestJS 后端
├── shared/            # 共享代码
└── mobile/            # React Native
```

**操作步骤：**

1. **生成规则**

```
请为当前 monorepo 项目生成 Cursor Rules
```

1. **生成结果**

```
my-monorepo/
├── .cursor/
│   ├── instructions.md
│   └── rules/
│       └── global-rules.mdc      # 全局规则
├── frontend/
│   └── .cursor/rules/
│       └── frontend-rules.mdc    # 前端特定规则
├── backend/
│   └── .cursor/rules/
│       └── backend-rules.mdc     # 后端特定规则
├── shared/
│   └── .cursor/rules/
│       └── shared-rules.mdc      # 共享代码规则
└── mobile/
    └── .cursor/rules/
        └── mobile-rules.mdc      # 移动端规则
```

1. **智能加载**

Cursor 会根据当前文件位置自动加载相应的规则：

- 在 `frontend/` 中工作 → 加载全局规则 + 前端规则
- 在 `backend/` 中工作 → 加载全局规则 + 后端规则

### 5.3 案例 3：预览生成计划

**适用场景：**

- 首次使用，想先看看会生成什么
- 大型项目，想确认分析结果

**操作步骤：**

1. **运行预览**

```
请预览规则生成过程
```

1. **查看预览结果**

系统会显示：

- 📊 11 个任务的执行计划
- 📈 分析结果统计
- ⚠️ 需要确认的决策点
- 📁 将要生成的文件列表

1. **正式生成**

确认无误后：

```
请正式生成 Cursor Rules
```

### 5.4 案例 4：检查文档一致性

**适用场景：**

- README 已经很久没更新
- 怀疑文档与代码不一致

**操作步骤：**

1. **运行一致性检查**

```
请检查项目文档与代码的一致性
```

1. **查看检查结果**

```json
{
  "hasInconsistencies": true,
  "inconsistencies": [
    {
      "type": "wrong-tech-stack",
      "description": "README 提到使用 Redux，但实际使用 Zustand",
      "severity": "high"
    }
  ]
}
```

1. **更新文档**

```
请根据实际代码更新 README
```

---

## 6. 进阶配置

### 6.1 环境变量

#### 日志级别

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

**可选值**：

- `DEBUG`: 所有日志（包括调试信息）
- `INFO`: 信息性日志（默认）
- `WARN`: 仅警告和错误
- `ERROR`: 仅错误
- `NONE`: 不输出日志

#### 自定义日志文件位置

```json
{
  "env": {
    "CURSOR_RULES_GENERATOR_LOG_FILE": "/path/to/your/logfile.log"
  }
}
```

#### 调试模式

```json
{
  "env": {
    "CURSOR_RULES_GENERATOR_DEBUG": "true"
  }
}
```

### 6.2 查看日志

**默认日志位置：**

- **macOS**: `~/Library/Logs/cursor-rules-generators.log`
- **Windows**: `%USERPROFILE%\AppData\Local\cursor-rules-generators.log`
- **Linux**: `~/.local/log/cursor-rules-generators.log`

**查看日志：**

```bash
# macOS/Linux
tail -f ~/Library/Logs/cursor-rules-generators.log

# Windows (PowerShell)
Get-Content $env:USERPROFILE\AppData\Local\cursor-rules-generators.log -Tail 100 -Wait
```

### 6.3 Context7 集成（可选）

如果你配置了 Context7 MCP Server，Cursor Rules Generators 会自动获取最新的框架最佳实践。

**配置方法：**

1. 安装并配置 [Context7 MCP Server](https://context7.ai/)
2. 在 Cursor 的 MCP 配置中添加 Context7
3. 重启 Cursor

**注意**：Context7 是可选的，未配置不影响基本功能。

---

## 7. 常见问题

### 7.1 配置相关

#### Q: 如何确认配置是否成功？

**A:** 重启 Cursor 后，在 AI 聊天窗口输入：

```
显示工具信息
```

如果看到版本号和配置信息，说明配置成功。

#### Q: 配置后 Cursor 无法启动怎么办？

**A:** 检查配置文件的 JSON 格式是否正确：

1. 确保所有引号都是英文引号
2. 确保没有多余的逗号
3. 确保大括号和中括号配对

### 7.2 使用相关

#### Q: 生成的规则不符合项目实际情况？

**A:** 解决方案：

1. **查看分析结果**

```
请分析当前项目的结构和技术栈
```

1. **手动编辑规则文件**
   - 生成的规则文件可以直接编辑
   - 建议将自定义规则放在 `99-custom-rules.mdc`

2. **提供反馈**
   - 在 GitHub 提 Issue 帮助改进检测算法

#### Q: 规则文件可以提交到版本控制吗？

**A:** 建议：

- ✅ **提交**自定义规则文件
- ❌ **不提交**自动生成的文件

在 `.gitignore` 中添加：

```gitignore
# Cursor Rules（自动生成）
.cursor/rules/*-rules.mdc
.cursor/instructions.md

# 保留自定义规则
!.cursor/rules/99-custom-rules.mdc
```

### 7.3 性能相关

#### Q: 首次生成很慢怎么办？

**A:** 首次生成可能需要几秒到几十秒，取决于：

- 项目大小（文件数量）
- 技术栈复杂度
- 网络速度（如果需要获取最佳实践）

**优化建议**：

- 使用 `preview_rules_generation` 先预览
- 对于超大型项目（10000+ 文件），考虑分模块生成

#### Q: 如何查看日志排查问题？

**A:** 参考 [6.2 查看日志](#62-查看日志) 章节。

---

## 8. 最佳实践

### 8.1 团队协作

#### 统一规则生成流程

在团队中建立规范：

```markdown
## Cursor Rules 使用规范

1. **首次生成**：项目负责人运行 `generate_cursor_rules`
2. **定期更新**：每次重大架构调整后重新生成
3. **自定义规则**：团队特定规范写在 `99-custom-rules.mdc`
4. **版本控制**：自定义规则提交到 Git，自动生成的规则不提交
```

#### 为不同模块指定负责人

```markdown
## 模块规则负责人

- `frontend/`: @frontend-team
- `backend/`: @backend-team
- `shared/`: @platform-team
```

### 8.2 规则维护

#### 定期更新

建议频率：

- 🔄 **每月**：检查一次一致性
- 🔄 **每季度**：重新生成一次规则
- 🔄 **重大变更后**：立即重新生成

#### 渐进式采用

不要一次性使用所有规则，而是：

1. **第一周**：只使用 `global-rules.mdc` 和 `code-style.mdc`
2. **第二周**：添加 `project-structure.mdc`
3. **第三周**：添加其他条件规则
4. **持续优化**：根据实际使用效果调整

#### 补充自定义规则

创建 `.cursor/rules/99-custom-rules.mdc`：

```markdown
# 团队自定义规则

## 业务规范

### 金融计算
- 所有金额计算必须使用 Decimal.js
- 禁止使用浮点数进行金额运算

### 安全要求
- 所有用户输入必须进行 XSS 过滤
- 敏感信息不得记录到日志

## 命名约定

### API 接口
- RESTful API 使用小写 + 连字符：`/api/user-profile`
- GraphQL 使用驼峰命名：`userProfile`

### 数据库
- 表名使用复数：`users`, `orders`
- 字段名使用下划线：`created_at`, `user_id`
```

### 8.3 与 AI 协作

#### 明确引用规则

```
请参考 @project-structure.mdc 创建一个新的用户管理页面
```

#### 组合使用规则

```
请遵循 @code-style.mdc 的命名规范，使用 @custom-tools.mdc 中的工具函数
```

#### 逐步引导 AI

```
1. 先查看 @project-structure.mdc，确定文件应该放在哪里
2. 然后参考 @ui-ux.mdc，了解组件设计规范
3. 最后使用 @custom-tools.mdc 中的工具函数实现功能
```

### 8.4 持续改进

#### 收集反馈

定期收集团队反馈：

- 哪些规则最有用？
- 哪些规则需要调整？
- 是否有新的规范需要添加？

#### 监控效果

观察指标：

- AI 生成代码的准确率
- 需要手动修改的比例
- 代码审查中的问题数量

#### 版本演进

记录规则的演进历史：

```markdown
## 规则变更历史

### v2.0 (2025-01-15)
- 新增：金融计算规范
- 更新：API 命名约定
- 移除：过时的 Redux 规范

### v1.0 (2025-01-01)
- 初始版本
```

---

## 📚 相关文档

### 核心文档

- [README.md](../README.md) - 项目介绍
- [README.zh-CN.md](../README.zh-CN.md) - 中文介绍
- [CHANGELOG.md](../CHANGELOG.md) - 版本变更

### 架构文档

- [RULES_GENERATION_LOGIC.md](./RULES_GENERATION_LOGIC.md) - 规则生成逻辑详解
- [DIRECTORY_PURPOSE_DETECTION.md](./DIRECTORY_PURPOSE_DETECTION.md) - 目录职能判断逻辑
- [PROJECT_REFACTORING.md](./PROJECT_REFACTORING.md) - 项目重构记录

### 指南文档

- [TECH_SHARING.md](./TECH_SHARING.md) - 技术分享
- [TEST_PROMPTS.md](./TEST_PROMPTS.md) - 测试 prompt 示例
- [guides/PREVENT_AI_MODIFICATION.md](./guides/PREVENT_AI_MODIFICATION.md) - 防止 AI 修改输出

### 脚本文档

- [scripts/README.md](../scripts/README.md) - 开发工具和发布脚本

---

## 🤝 获取帮助

如果遇到问题：

1. 查看 [常见问题](#7-常见问题) 章节
2. 查看日志文件排查问题
3. 在 [GitHub](https://github.com/ALvinCode/cursor-rules-generators/issues) 提 Issue
4. 查看 [npm 包页面](https://www.npmjs.com/package/cursor-rules-generators)

---

**让 AI 真正成为你的编程伙伴！** 🚀
