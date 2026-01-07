# 文档与项目结构索引

> 本目录用于统一维护架构说明、使用手册和运维记录，方便团队快速定位需要的信息。

## 1. 文档分组

| 分组 | 说明 | 文件 |
|------|------|------|
| **Architecture** | 系统架构、规则生成策略、历史重构记录 | `RULES_GENERATION_LOGIC.md`, `PROJECT_REFACTORING.md`, `DIRECTORY_PURPOSE_DETECTION.md` |
| **Guides** | 对外分享、团队协作指南、风险防范 | `TECH_SHARING.md`, `TEST_PROMPTS.md`, `guides/PREVENT_AI_MODIFICATION.md` |

> 💡 **建议**：新增文档时先判断属于哪一类，保持结构清晰，便于知识沉淀。

## 1.1 文档说明

### 🚀 入门文档

- **GETTING_STARTED.md**: 📖 **从 0 到 1 完全指南**（推荐新用户先读这个！）
  - 什么是 Cursor Rules Generators
  - 为什么需要它
  - 快速开始（5 分钟）
  - 深入理解
  - 实战演练
  - 进阶使用
  - 常见问题
  - 最佳实践

### Architecture（架构文档）

- **RULES_GENERATION_LOGIC.md**: 详细说明规则文件生成的完整逻辑、顺序、依赖关系和条件判断
- **DIRECTORY_PURPOSE_DETECTION.md**: 深度目录分析的五阶段判断逻辑，包括依赖关联、语义判断、业务语义、继承和内容分析
- **PROJECT_REFACTORING.md**: 2025-11-20 项目重构记录，包括删除的文件、新增的工具和目录结构优化

### Guides（指南文档）

- **TECH_SHARING.md**: 技术分享文档，介绍项目核心理念、系统架构和最佳实践
- **TEST_PROMPTS.md**: 测试 prompt 示例，用于验证生成的规则效果
- **guides/PREVENT_AI_MODIFICATION.md**: 防止 AI 修改 MCP Server 输出的方案设计

### Summary（总结文档）

- **DOCUMENTATION_SUMMARY.md**: 2025-01-07 文档梳理总结，记录所有文档的更新内容和验证结果

## 2. 源码目录速览

```text
src/
├── modules/
│   ├── core/            # 核心业务逻辑 (7个文件)
│   │   ├── project-analyzer.ts          # 项目文件收集与统计
│   │   ├── rules-generator.ts           # 规则生成引擎
│   │   ├── generation-coordinator.ts    # 生成协调器
│   │   ├── config-parser.ts             # 配置文件解析
│   │   ├── file-writer.ts               # 文件写入与验证
│   │   ├── markdown-formatter.ts        # Markdown 格式化
│   │   └── code-generation-requirements.ts  # 代码生成需求
│   │
│   ├── analyzers/       # 分析器 (13个文件)
│   │   ├── code-analyzer.ts             # 代码特征分析
│   │   ├── deep-directory-analyzer.ts   # 深度目录分析（五阶段）
│   │   ├── dependency-analyzer.ts       # 依赖分析
│   │   ├── file-content-analyzer.ts     # 文件内容分析
│   │   ├── file-type-identifier.ts      # 文件类型识别
│   │   ├── file-structure-learner.ts    # 文件结构学习
│   │   ├── module-detector.ts           # 模块检测
│   │   ├── module-structure-analyzer.ts # 模块结构分析
│   │   ├── module-business-analyzer.ts  # 模块业务分析
│   │   ├── practice-analyzer.ts         # 实践规范分析
│   │   ├── router-detector.ts           # 路由检测
│   │   ├── tech-stack-detector.ts       # 技术栈检测
│   │   └── custom-pattern-detector.ts   # 自定义模式检测
│   │
│   ├── generators/      # 生成器和匹配器 (6个文件)
│   │   ├── framework-matcher.ts         # 框架匹配
│   │   ├── tech-stack-matcher.ts        # 技术栈匹配（11类别）
│   │   ├── best-practice-extractor.ts   # 最佳实践提取
│   │   ├── best-practice-comparator.ts  # 最佳实践对比
│   │   ├── rule-requirements-analyzer.ts # 规则需求分析
│   │   └── suggestion-collector.ts      # 建议收集器
│   │
│   ├── validators/      # 验证器 (3个文件)
│   │   ├── consistency-checker.ts       # 一致性检查
│   │   ├── rule-validator.ts            # 规则验证
│   │   └── markdownlint-validator.ts    # Markdown lint 验证
│   │
│   └── integrations/    # 外部集成 (2个文件)
│       ├── context7-integration.ts      # Context7 集成
│       └── best-practice-web-searcher.ts # 最佳实践网络搜索
│
├── utils/              # 基础工具
│   ├── file-utils.ts   # 文件操作工具
│   ├── logger.ts       # 日志工具
│   └── errors.ts       # 错误处理
│
├── types.ts            # 类型定义
└── index.ts            # MCP Server 入口
```

## 3. 推荐维护流程

1. **新增功能** → 在 Architecture 区域补充设计或规则说明。
2. **对外分享** → 更新 Guides 文档，保持对外口径一致。
3. **排查问题** → 在 `PROBLEM_ANALYSIS.md` 记录风险、决定是否转为 Issue。
4. **移除/替换文档** → 先更新此索引，确保文档引用链不断。

---

如需更细粒度的索引，可在各分组下创建子目录（例如 `docs/architecture/`、`docs/guides/`，当前版本保持扁平结构以减少迁移成本）。EOF