# 让 AI 更懂你的项目 —— Cursor Rules Generators 实战分享（2025）

> **核心理念**：通过 MCP Server 将“项目分析 → 规则生成 → 结果落地”整成一条可观测、可复用的流水线，让 Cursor 真正理解你的工程背景，而不是停留在示例代码层面。

---

## 1. 我们要解决的真实问题

1. **规则难以维护**：项目演进频繁，手写 `.cursor/rules` 往往滞后于实际代码。
2. **信息纬度不足**：仅靠技术栈标签，AI 很难判断文件位置、命名规范、组件结构等细节。
3. **多模块场景复杂**：Monorepo / BFF / 微服务需要差异化的规则与目录映射。
4. **最佳实践碎片化**：没有统一方式把官方文档、社区范式、安全约束整合进规则。

Cursor Rules Generators 针对这些痛点，把“分析 + 生成 + 校验”变成一个可重复运行的流程，真正做到“让 AI 用你熟悉的方式写代码”。

---

## 2. 系统架构一览

```text
┌──────────────────────────────────────────────────────────┐
│ Cursor (MCP Client)                                      │
│   └─ 调用 MCP 工具（generate / analyze / preview ...）    │
└──────────────────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────┐
│ Cursor Rules Generators (MCP Server)                      │
│                                                          │
│ 1. ProjectAnalyzer           → 文件收集 / 统计            │
│ 2. TechStackDetector         → 语言 & 框架检测            │
│ 3. ModuleDetector            → Monorepo / 前后端 / 服务   │
│ 4. Analyzers                 → 代码特征 / 路由 / 目录语义 │
│ 5. Context7Integration       → 框架最佳实践               │
│ 6. RuleRequirementsAnalyzer  → 需要哪些规则 & 原因        │
│ 7. RulesGenerator            → 逐个生成 .mdc 规则         │
│ 8. FileWriter                → 写入 .cursor/rules/ + 校验 │
│ 9. Instructions Generator    → 生成 instructions.md       │
└──────────────────────────────────────────────────────────┘
```

---

## 3. 端到端流水线（11 个任务）

1. **收集项目文件**：深度 10 层递归扫描，按扩展名聚合统计。
2. **分析技术栈与模块**：解析 package/requirements/go.mod，识别前后端、微服务模块。
3. **解析项目配置**：自动发现 Prettier、ESLint、TSConfig、NPM Script 等实用信息。
4. **提取项目实践**：观察变量/函数风格、组件导出方式、错误处理习惯。
5. **检测自定义资产**：收集 Hooks、工具函数、API Client 并在规则中引用。
6. **学习文件组织**：根据真实目录生成命名约定、存放位置、目录语义。
7. **深度目录分析**（新增）：五阶段分析（依赖驱动 → 语义 → 业务 → 继承 → 内容），智能推断目录职能。
8. **路由识别**：依赖 + 文件双重检测，支持 Next.js App Router / React Router / NestJS / Express 等。
9. **动态路由分析**：脚本、命令、生成文件多角度判定是否需要人工确认。
10. **规则生成 & 一致性检查**：整合 Context7 最佳实践 + 项目特征，必要时更新 README。
11. **写入规则文件**：Markdown formatter + markdownlint 双重校验，失败不中断其他文件。
12. **生成 instructions.md**：把所有步骤和注意事项串成工作流，让团队统一使用方式。

> **详细的规则生成顺序与依赖关系**，请参考 `docs/RULES_GENERATION_LOGIC.md`。
> 
> **深度目录分析的五阶段逻辑**，请参考 `docs/DIRECTORY_PURPOSE_DETECTION.md`。

---

## 4. 规则输出策略

| 类别 | 说明 | 代表文件 |
|------|------|----------|
| **全局规则** | 所有项目必出，涵盖概述、风格、结构、架构 | `global-rules.mdc`、`code-style.mdc`、`project-structure.mdc`、`architecture.mdc` |
| **条件规则** | 根据依赖/特征自动触发 | `custom-tools.mdc`、`error-handling.mdc`、`state-management.mdc`、`ui-ux.mdc`、`frontend-routing.mdc`、`api-routing.mdc`、`testing.mdc` |
| **模块规则** | Monorepo / 微服务 / 前后端分离时为每个模块生成 | `{module}/.cursor/rules/{module}-rules.mdc` |
| **指南** | 提供团队自己的补充规范 | `.cursor/instructions.md` |

- **RuleRequirementsAnalyzer** 会解释“为什么要生成”某个规则，并在输出中列出触发原因（依赖、文件结构或配置）。
- **FileWriter** 会在写入前校验 `fileName` & `content`，写入失败时记录日志但不中断整体任务。

---

## 5. 可靠性与可维护性设计

1. **Fallback 机制**：`project-structure.mdc` 生成失败时会降级为简化版，保证文件始终存在。
2. **模块级错误隔离**：单个模块规则生成失败不会影响其他模块。
3. **文件级错误隔离**：写入某个规则出错（权限/磁盘问题）时，其余文件照常写入。
4. **预览模式**：`preview_rules_generation` 在真正写文件前展示 11 个任务的执行计划和不确定项。
5. **一致性检查与自动更新**：`check_consistency` + `update_project_description` 保证 README 不再“口是心非”。
6. **结构化输出**：每次生成都会输出分析摘要、依赖列表、决策点，便于 PR 审核与知识沉淀。

---

## 6. 常见使用场景

| 场景 | 指令示例 | 说明 |
|------|----------|------|
| 初次接手项目 | `generate_cursor_rules` | 一键生成全套规则和 instructions |
| 想先看看会做什么 | `preview_rules_generation` | 输出 11 个任务的计划、耗时和待确认事项 |
| 只想了解项目结构 | `analyze_project` | 返回技术栈、模块、代码特征等 JSON 报告 |
| 文档滞后 | `check_consistency` → `update_project_description` | 找出 README 与真实实现的差异并一键更新 |
| 规则被手改 | `validate_rules` | 检查 `.cursor/rules/` 内 Markdown/Lint/元数据是否符合规范 |

---

## 7. 最佳实践 & 团队协作建议

1. **把规则生成纳入 CI**：在 PR 中运行 `preview_rules_generation`，审查影响再决定是否落盘。
2. **为不同模块建立守护人**：模块规则生成后，由对应的负责人在 `custom-rules.mdc` 或模块特定规则里补充业务约束。
3. **定期更新 Context7 Token**：确保最佳实践引用的是最新官方文档，尤其是 Next.js、NestJS 等更新频繁的框架。
4. **清理无用文档**：保持 `docs/` 目录只有“当前实现需要的设计产物”。（本次已移除过时的质量保障说明与旧示例文件。）
5. **同步 instructions.md**：把 `.cursor/instructions.md` 作为团队的“AI 使用手册”，要求新人先读后用。

---

## 8. 相关资源

### 核心文档
- `README.md` / `README.zh-CN.md`：功能介绍与安装配置
- `CHANGELOG.md`：版本变更记录

### 架构文档
- `docs/RULES_GENERATION_LOGIC.md`：完整的规则生成顺序、依赖、条件触发说明
- `docs/DIRECTORY_PURPOSE_DETECTION.md`：深度目录分析的五阶段判断逻辑
- `docs/PROJECT_REFACTORING.md`：2025 年 11 月的结构优化纪要

### 指南文档
- `docs/TEST_PROMPTS.md`：测试 prompt 示例，用于验证规则生成效果
- `docs/guides/PREVENT_AI_MODIFICATION.md`：如何防止 AI 错误修改关键文件（设计方案）

### 脚本文档
- `scripts/README.md`：开发工具和发布脚本说明

---

让 Cursor Rules Generators 帮你把"项目上下文"变成"可维护的资产"，让 AI 真正成为团队的合作伙伴。