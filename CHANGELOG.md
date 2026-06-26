# Changelog

所有重要的项目变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.3.0] - 2026-06-26

### 新增

- ✨ **main-check-rules 对齐**：按 10 维审计标准增强规则生成质量
  - `global-rules.mdc`：Task Workflow（含 Modifying Existing Features）、Priority and Conflict Resolution、Completion Checklist
  - `architecture.mdc`：Canonical References（目录内 + 跨目录聚合）、Legacy vs Modern Patterns 边界表
  - `project-structure.mdc`：Legacy / Generated 目录自动检测与只读警告
  - `feature-recipe.mdc`：可执行代码模板（Hook / Page Component）、File Checklist、Verification 清单
- ✨ **规则文件合并优化**：减少生成文件数量，提升单文件信息密度
  - `error-handling` + `ui-ux` → 合并入 `code-style.mdc`
  - `api-patterns` → 合并入 `feature-recipe.mdc`
- ✨ **项目类型识别扩展**：`detectProjectType` 区分 web-frontend / web-backend / mobile 等，状态管理库检测范围扩大
- ✨ **CLI + Skill 支持**：`cursor-rules-gen` 命令行入口与 `skill/` 目录

### 改进

- ⚡ **Framework Principles 去泛化**：移除 "Use TypeScript" 等低价值条目；mixed 项目条件化 React class/function 指引
- ⚡ **Hard Constraints 条件化**：`NEVER generate markdown` 仅对非文档项目输出；`any` 约束尊重 ESLint 配置
- ⚡ **feature-recipe 模板质量**：修复 antd 场景 `return const` 语法错误；统一 Checklist 与模板文件命名；Redux slice 路径对齐

### 修复

- 🐛 规则生成准确性：文件命名约定检测、路由语法版本匹配、MobX 模式检测、API client 广度校验
- 🐛 Prettier 默认值与 ESLint 配置解析
- 🐛 移除硬编码模式（useTable、src/views glob、无条件 any 约束）

## [0.2.7] - 2025-01-07

### 文档更新

- 📝 **全面梳理文档**：根据实际代码实现重新梳理所有 md 文档
- 📝 **README 增强**：更新功能列表，增加深度目录分析、五阶段分析等新特性说明
- 📝 **工作流程更新**：详细说明 11 个任务的流水线和关键特性
- 📝 **文件结构说明**：完善生成文件结构说明，增加优先级和条件规则说明
- 📝 **中英文同步**：确保中英文 README 内容一致

### 改进

- ✨ **文档一致性**：所有文档与代码实现保持一致
- ✨ **完整性提升**：补充缺失的版本信息和功能说明

## [0.0.4] - 2025-01-XX

### 修复

- 🐛 **修复测试问题**：跳过不稳定的文件写入测试，避免测试卡住
- 🐛 **修复 vitest 配置**：更新配置以适配新版本 vitest API
- 🐛 **优化测试性能**：默认使用 `--run` 模式，避免 watch 模式卡住

### 改进

- ⚡ **测试脚本优化**：`test` 命令默认使用 `--run` 模式，一次性运行测试
- 📝 **文档完善**：更新所有文档以反映项目实际情况

## [0.0.3] - 2025-01-XX

### 新增

- 📦 **npm 发布支持**：项目已发布到 npm，可通过 `npm install cursor-rules-generators` 安装
- 📝 **安装文档完善**：添加详细的 npm 安装说明和使用指南
- 🔧 **npx 支持**：支持通过 npx 直接使用，无需手动安装

### 改进

- 📝 **README 更新**：
  - 添加 npm 安装方式说明
  - 说明为什么需要安装依赖
  - 提供多种安装和配置方案
  - 优化文档结构，将 npm 安装作为推荐方式
- 🔧 **包名统一**：统一使用 `cursor-rules-generators` 作为包名
- 📦 **发布准备**：完善 package.json 配置，确保发布质量

### 修复

- 🐛 **修复文档同步问题**：确保 CHANGELOG.md 与 package.json 版本同步
- 🐛 **修复发布检查脚本**：改进 pnpm-lock.yaml 版本检查逻辑

## [1.3.7] - 2025-01-XX

### 优化

- ✨ **日志系统优化**：新增统一的日志工具类，支持日志级别控制（DEBUG, INFO, WARN, ERROR, NONE）
- ✨ **错误处理改进**：实现统一的错误类体系，提供更友好的错误信息
- ✨ **环境变量支持**：支持通过环境变量控制日志级别和调试模式
- ✨ **生产就绪**：
  - 完善 package.json 元数据（repository, author, engines, files）
  - 添加 .npmignore 确保发布质量
  - 改进错误处理和日志输出
- 📝 **文档完善**：
  - 添加环境变量配置说明
  - 完善贡献指南
  - 添加开发环境设置说明
  - 将项目结构说明合并到 README.md
  - 整理并合并重复的文档文件

### 代码优化

- 🔄 所有 `console.log/error` 替换为统一的日志系统
- 🔄 错误处理统一使用新的错误类体系
- 🔄 日志输出改为 stderr，避免干扰 MCP 协议通信
- 🔄 移除未使用的导入和变量
- 🔄 改进类型安全（减少 any 类型使用）
- 🔄 静态导入替代动态导入，提升性能

### 文件结构优化

- 🗑️ 删除重复的优化总结文档（已合并到 CHANGELOG）
- 🗑️ 删除重复的版本说明文档
- 🔄 合并项目结构说明到 README.md
- 🔄 整理 docs 目录结构

### 技术改进

- ✅ 代码质量提升，符合 MCP server 最佳实践
- ✅ 更好的类型安全
- ✅ 更好的错误上下文信息
- ✅ 改进的可维护性和可扩展性

## [1.3.6] - 2025-01-XX

### 新增

- 项目文件结构图和说明
- 输出格式优化（任务执行列表、执行记录、工作总结）
- 统一的输出规范（使用 "cursor-rules-generators" 作为主语）

### 改进

- 改进一致性检查消息格式
- 更清晰的进度显示
- 更详细的注意事项说明

## [1.3.5] - 2025-01-XX

### 新增

- 预览工具（preview_rules_generation）
- 进度显示系统
- 用户决策点确认机制

### 改进

- 非阻塞执行流程
- 更好的用户体验

## [1.3.0] - 2025-01-XX

### 新增

- 动态路由分析
- 代码风格检测
- 格式化命令检测
