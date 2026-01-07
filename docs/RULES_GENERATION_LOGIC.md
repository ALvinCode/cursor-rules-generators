# Rules 文件生成逻辑和顺序

## 📋 目录

1. 整体生成流程
2. 规则文件生成顺序
3. 规则文件类型和依赖关系
4. 生成条件判断
5. 文件写入流程
6. 模块规则生成

---

## 🔄 整体生成流程

### 阶段 1: 准备阶段（Pre-Generation）

```text
1. 框架匹配（Framework Matching）
   └─> findBestFrameworkMatch() - 找到最相似的框架规则格式
       - 匹配 awesome-cursorrules 中的框架规则
       - 计算相似度（基于技术栈重叠）
       - 返回最佳匹配（similarity > 0.3）
   
2. 多类别技术栈匹配（Multi-Category Tech Stack Matching）
   └─> findBestTechStackMatches() - 支持 11 个类别的规则匹配
       - 类别：frontend, backend, mobile, styling, state, database, 
               testing, hosting, build, language, other
       - 返回所有类别的匹配规则
       - 识别主要匹配（primary match）
   
3. 最佳实践提取和对比（Best Practice Extraction & Comparison）
   ├─> extractFromMultiCategoryMatch() - 从匹配的规则中提取最佳实践
   │   - 解析匹配规则的内容
   │   - 提取框架特定的最佳实践
   ├─> compare() - 对比项目实际使用与最佳实践
   │   - 识别缺失的实践
   │   - 识别模糊的实践
   │   - 生成改进建议
   └─> 识别缺失的技术栈和最佳实践
       - 对比项目技术栈与规则覆盖
       - 可选：网络搜索缺失技术栈的最佳实践
   
4. 规则需求分析（Rule Requirements Analysis）
   └─> analyzeRequirements() - 分析项目需要哪些规则文件
       - 基于依赖检测需要的规则
       - 基于文件结构检测需要的规则
       - 基于配置检测需要的规则
       - 为每个规则提供生成原因说明
```

### 阶段 2: 规则生成阶段（Generation）

```text
按照固定顺序生成规则文件（见下方详细列表）

生成过程：
1. 必需规则（4个）- 无条件生成
   - global-rules.mdc
   - code-style.mdc
   - project-structure.mdc（带 fallback）
   - architecture.mdc

2. 条件规则（7个）- 根据需求分析结果生成
   - custom-tools.mdc
   - error-handling.mdc
   - state-management.mdc
   - ui-ux.mdc
   - frontend-routing.mdc
   - api-routing.mdc
   - testing.mdc

3. 模块规则（N个）- 多模块项目时生成
   - {module}-rules.mdc（每个模块一个）
```

### 阶段 3: 文件写入阶段（Writing）

```text
1. 规则文件写入（Rule File Writing）
   ├─> 验证规则对象完整性
   │   - 检查 fileName 和 content 是否存在
   │   - 检查规则类型和优先级
   ├─> 确认生成位置（Generation Location Confirmation）
   │   - coordinator.confirmGenerationLocation()
   │   - 检查目录是否存在
   │   - 评估是否符合项目结构
   ├─> Markdown 格式化（Markdown Formatting）
   │   - MarkdownFormatter.format()
   │   - 修复常见格式问题
   ├─> markdownlint 验证和修复（Markdownlint Validation）
   │   - MarkdownlintValidator.validateAndFix()
   │   - 验证 Markdown 规范
   │   - 自动修复问题
   └─> 写入文件系统（File System Writing）
       - FileUtils.writeFile()
       - 自动创建目录（如果不存在）
       - 错误处理：单个文件失败不影响其他文件
   
2. instructions.md 生成（Instructions Generation）
   └─> generateInstructions() - 生成工作流指导文件
       - 包含规则使用说明
       - 包含工作流程指导
       - 包含注意事项
       - 单独写入（不在 rules 数组中）
```

---

## 📝 规则文件生成顺序

### 必需规则（Always Generated）

按以下顺序生成，**所有项目都会生成**：

| 序号 | 规则文件 | 生成方法 | 优先级 | 类型 | 依赖 | 约行数 |
|------|---------|---------|--------|------|------|--------|
| 1 | `global-rules.mdc` | `generateGlobalOverviewRule()` | 100 | overview | - | ~280 |
| 2 | `code-style.mdc` | `generateCodeStyleRule()` | 90 | guideline | global-rules | ~200 |
| 3 | `project-structure.mdc` | `generateProjectStructureRule()` | 85 | reference | global-rules | ~300 |
| 4 | `architecture.mdc` | `generateArchitectureRule()` | 90 | guideline | global-rules | ~200 |

**生成顺序说明**：

- `global-rules.mdc` 是基础，其他规则都依赖它
- `code-style.mdc` 和 `architecture.mdc` 是核心规范
- `project-structure.mdc` 是文件组织的基础参考

### 条件规则（Conditionally Generated）

按以下顺序检查并生成，**根据项目特征决定是否生成**：

| 序号 | 规则文件 | 生成条件 | 生成方法 | 优先级 | 类型 | 依赖 | 约行数 |
|------|---------|---------|---------|--------|------|------|--------|
| 5 | `custom-tools.mdc` | `hasCustomTools()` | `generateCustomToolsRule()` | 95 | reference | global-rules, project-structure | ~150 |
| 6 | `error-handling.mdc` | `hasErrorHandling()` | `generateErrorHandlingRule()` | 80 | practice | global-rules, custom-tools | ~180 |
| 7 | `state-management.mdc` | `needsStateManagement` | `generateStateManagementRule()` | 85 | practice | global-rules | ~200 |
| 8 | `ui-ux.mdc` | `needsUIUX` | `generateUIUXRule()` | 75 | guideline | global-rules, code-style | ~250 |
| 9 | `frontend-routing.mdc` | `needsFrontendRouting` | `generateFrontendRoutingRule()` | 85 | practice | global-rules, architecture | ~300 |
| 10 | `api-routing.mdc` | `needsBackendRouting` | `generateBackendRoutingRule()` | 85 | practice | global-rules, architecture | ~300 |
| 11 | `testing.mdc` | `needsTesting` | `generateTestingRule()` | 70 | practice/suggestion | global-rules | ~220 |

**生成条件说明**：

- `custom-tools.mdc`: 检测到自定义 Hooks、工具函数或 API 客户端
- `error-handling.mdc`: 检测到错误处理代码（try-catch 或 Promise.catch）
- `state-management.mdc`: 检测到状态管理库（Redux、Zustand、Pinia 等）
- `ui-ux.mdc`: 前端项目（React、Vue、Angular 等）
- `frontend-routing.mdc`: 检测到前端路由依赖或路由文件
- `api-routing.mdc`: 检测到后端路由依赖或路由文件
- `testing.mdc`: 检测到测试框架或测试文件

### 模块规则（Module Rules）

**生成条件**: `includeModuleRules && modules.length > 1`

| 规则文件 | 生成方法 | 优先级 | 类型 | 依赖 | 位置 |
|---------|---------|--------|------|------|------|
| `{module-name}-rules.mdc` | `generateModuleOverviewRule()` | 50 | overview | global-rules | 模块目录/.cursor/rules/ |

**生成逻辑**：

- 为每个模块（除主模块外）生成独立的规则文件
- 文件位置在模块目录下的 `.cursor/rules/` 目录
- 如果某个模块生成失败，不影响其他模块

### 自定义规则占位（Optional）

- `custom-rules.mdc`：需要自定义规则时可手动维护的文件，建议放在 `.cursor/rules/` 目录，内容留空或缺失不会影响其他规则。

---

## 🔗 规则文件类型和依赖关系

### 规则类型（Type）

| 类型 | 说明 | 用途 |
|------|------|------|
| `overview` | 概述性规则 | 项目整体概述和核心原则（global-rules.mdc） |
| `guideline` | 指导性规则 | 代码风格、架构设计等指导原则 |
| `reference` | 参考性规则 | 项目结构、自定义工具等参考信息 |
| `practice` | 实践性规则 | 错误处理、路由、状态管理等具体实践 |
| `suggestion` | 建议性规则 | 测试等可选建议 |

### 依赖关系图

```text
global-rules.mdc (优先级: 100, 基础)
    │
    ├─> code-style.mdc (优先级: 90)
    │   └─> ui-ux.mdc (优先级: 75)
    │
    ├─> project-structure.mdc (优先级: 85)
    │   └─> architecture.mdc (优先级: 90)
    │       ├─> frontend-routing.mdc (优先级: 85)
    │       └─> api-routing.mdc (优先级: 85)
    │
    ├─> custom-tools.mdc (优先级: 95)
    │   └─> error-handling.mdc (优先级: 80)
    │
    ├─> state-management.mdc (优先级: 85)
    │
    ├─> testing.mdc (优先级: 70)
    │
    └─> {module}-rules.mdc (优先级: 50, 多模块项目)
```

**依赖说明**：

- `depends` 字段定义了规则文件之间的依赖关系
- 被依赖的规则文件会在依赖它的规则中被引用（使用 `@filename.mdc`）
- 依赖关系主要用于 Cursor 加载规则时的顺序和引用

---

## 🔍 生成条件判断

### 1. hasCustomTools()

```typescript
条件: context.customPatterns &&
      (customPatterns.customHooks.length > 0 ||
       customPatterns.customUtils.length > 0 ||
       customPatterns.apiClient?.exists)
```

### 2. hasErrorHandling()

```typescript
条件: context.projectPractice?.errorHandling &&
      projectPractice.errorHandling.frequency > 0
```

### 3. needsStateManagement

```typescript
条件: requirements.some(r => r.ruleType === "state-management") ||
      this.hasStateManagement(context)

hasStateManagement(): 
  - 检测到 Redux、Zustand、Pinia、Vuex、MobX 等状态管理库
```

### 4. needsUIUX

```typescript
条件: requirements.some(r => r.ruleType === "ui-ux") ||
      this.isFrontendProject(context)

isFrontendProject():
  - 检测到 React、Vue、Angular、Svelte 等前端框架
```

### 5. needsFrontendRouting

```typescript
条件: requirements.some(r => r.ruleType === "frontend-routing")

检测方式:
  - 依赖检测: react-router, next, nuxt, vue-router, remix, sveltekit
  - 文件检测: 检测到路由文件结构
  - 如果只有依赖没有文件，会推断路由框架并创建基础路由信息
```

### 6. needsBackendRouting

```typescript
条件: requirements.some(r => r.ruleType === "backend-routing")

检测方式:
  - 依赖检测: express, fastify, koa, nestjs, django, flask
  - 文件检测: 检测到后端路由文件
  - 如果只有依赖没有文件，会推断路由框架并创建基础路由信息
```

### 7. needsTesting

```typescript
条件: requirements.some(r => r.ruleType === "testing") ||
      this.featureExists(context, "testing")

检测方式:
  - 依赖检测: jest, vitest, mocha, cypress, playwright
  - 文件检测: 检测到测试文件（*.test.*, *.spec.*）
```

---

## 📁 文件写入流程

### 写入顺序

规则文件按照生成顺序写入，**不按优先级排序**。

### 写入位置

#### 全局规则（Global Rules）

```text
项目根目录/
└── .cursor/
    └── rules/
        ├── global-rules.mdc
        ├── code-style.mdc
        ├── project-structure.mdc
        ├── architecture.mdc
        ├── custom-tools.mdc (如果生成)
        ├── error-handling.mdc (如果生成)
        ├── state-management.mdc (如果生成)
        ├── ui-ux.mdc (如果生成)
        ├── frontend-routing.mdc (如果生成)
        ├── api-routing.mdc (如果生成)
        ├── testing.mdc (如果生成)
        └── custom-rules.mdc (如团队需要，可手动添加)
```

#### 模块规则（Module Rules）存放位置

```text
模块目录/
└── .cursor/
    └── rules/
        └── {module-name}-rules.mdc
```

### 写入流程细节

```text
for (const rule of rules) {
  1. 验证规则对象完整性
     └─> 检查 fileName 和 content 是否存在
     
  2. 确认生成位置
     └─> coordinator.confirmGenerationLocation()
         └─> 检查目录是否存在
         └─> 评估是否符合项目结构
         
  3. Markdown 格式化
     └─> MarkdownFormatter.format()
         └─> 修复格式问题
         
  4. markdownlint 验证和修复
     └─> MarkdownlintValidator.validateAndFix()
         └─> 验证 Markdown 规范
         └─> 自动修复问题
         
  5. 写入文件系统
     └─> FileUtils.writeFile()
         └─> 自动创建目录（如果不存在）
         
  6. 再次验证
     └─> MarkdownlintValidator.fixFile()
         └─> 确保文件系统写入正确
}
```

**错误处理**：

- 单个文件写入失败不会中断整个流程
- 错误会被记录到日志，继续处理下一个文件

---

## 🏗️ 模块规则生成

### 生成条件

```typescript
if (context.includeModuleRules && context.modules.length > 1) {
  // 为每个模块生成规则
}
```

### 模块检测逻辑

1. **Monorepo 检测**
   - 检测 `packages/`, `apps/`, `workspaces/` 等目录
   - 每个子目录作为一个模块

2. **前后端分离检测**
   - 检测 `frontend/`, `backend/`, `client/`, `server/` 等目录

3. **微服务检测**
   - 检测多个独立的服务目录

4. **默认模块**
   - 如果没有检测到多模块结构，整个项目作为单一模块（`main`）

### 模块规则内容

每个模块规则包含：

- 模块概述和描述
- 模块特定的技术栈
- 模块目录结构（基于 deepAnalysis）
- 模块业务分析（如果可用）
- 模块特定的开发规范

---

## 📊 完整生成流程图

```text
开始
  │
  ├─> [准备阶段]
  │   ├─> 框架匹配
  │   │   └─> findBestFrameworkMatch()
  │   ├─> 多类别技术栈匹配
  │   │   └─> findBestTechStackMatches()
  │   ├─> 最佳实践提取和对比
  │   │   ├─> extractFromMultiCategoryMatch()
  │   │   ├─> compare()
  │   │   └─> 识别缺失的技术栈
  │   └─> 规则需求分析
  │       └─> analyzeRequirements()
  │
  ├─> [必需规则生成] (按顺序，无条件)
  │   ├─> 1. global-rules.mdc ✓
  │   │   └─> generateGlobalOverviewRule()
  │   ├─> 2. code-style.mdc ✓
  │   │   └─> generateCodeStyleRule()
  │   ├─> 3. project-structure.mdc ✓ (带错误处理)
  │   │   ├─> generateProjectStructureRule() [try]
  │   │   └─> generateFallbackProjectStructureRule() [catch]
  │   └─> 4. architecture.mdc ✓
  │       └─> generateArchitectureRule()
  │
  ├─> [条件规则生成] (按顺序，有条件判断)
  │   ├─> 5. custom-tools.mdc? (if hasCustomTools)
  │   │   └─> generateCustomToolsRule()
  │   ├─> 6. error-handling.mdc? (if hasErrorHandling)
  │   │   └─> generateErrorHandlingRule()
  │   ├─> 7. state-management.mdc? (if needsStateManagement)
  │   │   └─> generateStateManagementRule()
  │   ├─> 8. ui-ux.mdc? (if needsUIUX)
  │   │   └─> generateUIUXRule()
  │   ├─> 9. frontend-routing.mdc? (if needsFrontendRouting)
  │   │   ├─> 如果无路由信息，推断并创建基础路由信息
  │   │   └─> generateFrontendRoutingRule()
  │   ├─> 10. api-routing.mdc? (if needsBackendRouting)
  │   │   ├─> 如果无路由信息，推断并创建基础路由信息
  │   │   └─> generateBackendRoutingRule()
  │   └─> 11. testing.mdc? (if needsTesting)
  │       └─> generateTestingRule()
  │
  ├─> [模块规则生成] (条件: includeModuleRules && modules.length > 1)
  │   └─> 12. {module}-rules.mdc (for each module)
  │       ├─> generateModuleOverviewRule() [try]
  │       └─> 错误处理: 单个模块失败不影响其他模块
  │
  ├─> [返回规则数组]
  │   └─> return rules[]
  │
  ├─> [文件写入阶段]
  │   └─> fileWriter.writeRules()
  │       └─> for each rule:
  │           ├─> 验证规则对象完整性
  │           ├─> 确认生成位置
  │           ├─> Markdown 格式化
  │           ├─> markdownlint 验证和修复
  │           ├─> 写入文件系统
  │           └─> 错误处理: 单个文件失败不影响其他文件
  │
  └─> [instructions.md 生成]
      ├─> generateInstructions()
      └─> fileWriter.writeInstructions()
```

---

## 🔑 关键设计决策

### 1. 为什么 global-rules.mdc 最先生成？

- 它是所有其他规则的基础
- 包含项目概述和核心原则
- 其他规则文件会引用它（使用 `@global-rules.mdc`）

### 2. 为什么 project-structure.mdc 是必需的？

- 文件位置是代码生成的关键
- 即使深度分析失败，也会生成简化版本
- 确保 AI 总是有参考来确定文件位置

### 3. 为什么使用需求分析器？

- 避免生成不必要的规则文件
- 基于实际依赖和文件结构智能判断
- 即使没有文件，只要有依赖也会生成（如路由规则）

### 4. 为什么模块规则最后生成？

- 模块规则可能依赖全局规则的内容
- 需要完整的项目分析数据
- 如果生成失败，不影响全局规则

### 5. 错误处理策略

- **必需规则**: 使用 fallback 方法，确保总是生成
- **条件规则**: 单个规则失败不影响其他规则
- **模块规则**: 单个模块失败不影响其他模块
- **文件写入**: 单个文件失败不影响其他文件

---

## 📈 生成顺序总结

### 严格顺序（按代码执行顺序）

1. **global-rules.mdc** (必需) - 基础规则
2. **code-style.mdc** (必需) - 代码风格
3. **project-structure.mdc** (必需，带错误处理) - 项目结构
4. **architecture.mdc** (必需) - 架构规范
5. **custom-tools.mdc** (条件) - 自定义工具
6. **error-handling.mdc** (条件) - 错误处理
7. **state-management.mdc** (条件) - 状态管理
8. **ui-ux.mdc** (条件) - UI/UX 规范
9. **frontend-routing.mdc** (条件) - 前端路由
10. **api-routing.mdc** (条件) - 后端路由
11. **testing.mdc** (条件) - 测试规范
12. **{module}-rules.mdc** (条件，循环生成) - 模块规则
**注意**: `instructions.md` 在规则文件写入后单独生成，不在 rules 数组中。

### 优先级顺序（按 priority 字段）

1. global-rules.mdc (100)
2. custom-tools.mdc (95)
3. code-style.mdc, architecture.mdc (90)
4. project-structure.mdc, state-management.mdc, frontend-routing.mdc, api-routing.mdc (85)
5. error-handling.mdc (80)
6. ui-ux.mdc (75)
7. testing.mdc (70)
8. {module}-rules.mdc (50)

**注意**: 写入顺序按生成顺序，不按优先级。优先级主要用于 Cursor 加载规则时的顺序。

---

## 🎯 实际使用建议

### 对于开发者

1. **首次生成**: 运行 `generate_cursor_rules`，会生成所有适用的规则文件
2. **查看规则**: 从 `global-rules.mdc` 开始，了解项目概述
3. **开发时**: 根据任务类型查看对应的规则文件
4. **自定义规则**: 如需补充团队规范，可在 `.cursor/rules/` 下手动维护 `custom-rules.mdc`

### 对于 AI Agent

1. **加载顺序**: 按优先级从高到低加载规则文件
2. **引用关系**: 使用 `@filename.mdc` 引用其他规则文件
3. **文件位置**: 总是先查看 `@project-structure.mdc` 确定文件位置
4. **代码风格**: 参考 `@code-style.mdc` 遵循项目规范

---

## 📚 相关文件

- `src/modules/core/rules-generator.ts` - 规则生成核心逻辑
- `src/modules/core/file-writer.ts` - 文件写入逻辑
- `src/modules/generators/rule-requirements-analyzer.ts` - 需求分析
- `src/modules/core/generation-coordinator.ts` - 生成协调器

---

## 🚀 快速参考表

### 规则文件生成顺序（执行顺序）

| 顺序 | 文件名 | 必需/条件 | 生成方法 | 优先级 | 类型 |
|------|--------|----------|---------|--------|------|
| 1 | `global-rules.mdc` | ✅ 必需 | `generateGlobalOverviewRule()` | 100 | overview |
| 2 | `code-style.mdc` | ✅ 必需 | `generateCodeStyleRule()` | 90 | guideline |
| 3 | `project-structure.mdc` | ✅ 必需 | `generateProjectStructureRule()` | 85 | reference |
| 4 | `architecture.mdc` | ✅ 必需 | `generateArchitectureRule()` | 90 | guideline |
| 5 | `custom-tools.mdc` | ⚠️ 条件 | `generateCustomToolsRule()` | 95 | reference |
| 6 | `error-handling.mdc` | ⚠️ 条件 | `generateErrorHandlingRule()` | 80 | practice |
| 7 | `state-management.mdc` | ⚠️ 条件 | `generateStateManagementRule()` | 85 | practice |
| 8 | `ui-ux.mdc` | ⚠️ 条件 | `generateUIUXRule()` | 75 | guideline |
| 9 | `frontend-routing.mdc` | ⚠️ 条件 | `generateFrontendRoutingRule()` | 85 | practice |
| 10 | `api-routing.mdc` | ⚠️ 条件 | `generateBackendRoutingRule()` | 85 | practice |
| 11 | `testing.mdc` | ⚠️ 条件 | `generateTestingRule()` | 70 | practice |
| 12 | `{module}-rules.mdc` | ⚠️ 条件 | `generateModuleOverviewRule()` | 50 | overview |
| - | `instructions.md` | ✅ 必需 | `generateInstructions()` | - | - |

### 条件判断快速参考

| 规则文件 | 判断条件 | 检测方式 |
|---------|---------|---------|
| `custom-tools.mdc` | `hasCustomTools()` | 检测自定义 Hooks、工具函数、API 客户端 |
| `error-handling.mdc` | `hasErrorHandling()` | 检测 try-catch 或 Promise.catch |
| `state-management.mdc` | `needsStateManagement` | 检测 Redux、Zustand、Pinia 等 |
| `ui-ux.mdc` | `needsUIUX` | 检测 React、Vue、Angular 等前端框架 |
| `frontend-routing.mdc` | `needsFrontendRouting` | 检测路由依赖或路由文件 |
| `api-routing.mdc` | `needsBackendRouting` | 检测后端路由依赖或路由文件 |
| `testing.mdc` | `needsTesting` | 检测测试框架或测试文件 |
| `{module}-rules.mdc` | `includeModuleRules && modules.length > 1` | 多模块项目 |

### 依赖关系快速参考

```text
global-rules.mdc (基础)
  ├─> code-style.mdc
  │   └─> ui-ux.mdc
  ├─> project-structure.mdc
  │   └─> architecture.mdc
  │       ├─> frontend-routing.mdc
  │       └─> api-routing.mdc
  ├─> custom-tools.mdc
  │   └─> error-handling.mdc
  ├─> state-management.mdc
  ├─> testing.mdc
  └─> {module}-rules.mdc
```

---

## 💡 关键要点

1. **生成顺序是固定的**：按照代码中的顺序执行，不按优先级排序
2. **优先级用于加载顺序**：Cursor 加载规则时按优先级从高到低
3. **依赖关系是引用关系**：使用 `@filename.mdc` 在规则文件中引用其他规则
4. **错误处理是分层的**：每个层级都有错误处理，确保部分失败不影响整体
5. **instructions.md 单独生成**：不在 rules 数组中，在文件写入后单独生成
