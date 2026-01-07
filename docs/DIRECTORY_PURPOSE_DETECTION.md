# 文件夹职能判断逻辑完整说明

本文档详细说明 cursor-rules-generators 如何判断一个文件夹的职能和作用。

## 🎯 核心目标

提升目录职能识别的精准度与业务语义能力，让目录识别更加智能、具体、符合项目业务语义，而不是笼统归类为"工具函数"或"组件"。

## 📦 相关模块

- **DeepDirectoryAnalyzer** (`src/modules/analyzers/deep-directory-analyzer.ts`): 深度目录分析器，协调整个分析流程
- **FileTypeIdentifier** (`src/modules/analyzers/file-type-identifier.ts`): 文件类型识别器
- **DependencyAnalyzer** (`src/modules/analyzers/dependency-analyzer.ts`): 依赖分析器
- **FileContentAnalyzer** (`src/modules/analyzers/file-content-analyzer.ts`): 文件内容分析器

## 判断流程概览（五阶段逻辑）

文件夹职能判断采用**五阶段、多维度**的分析策略，严格按顺序执行：

```
第一阶段：依赖关联判断（最高优先级）
   ↓
第二阶段：文件夹名称的类别语义判断
   ↓
第三阶段：业务语义或不明语义的目录
   ↓
第四阶段：继承父级目录的语义（增强语义）
   ↓
第五阶段：文件内容深度分析（全局适用）
```

## 详细判断逻辑（五阶段）

### 第一阶段：依赖关联判断（最高优先级）

**目的**：判断该目录是否属于某个已安装依赖的配置目录或功能目录。

**判断流程**：

1. **分析目录名是否与依赖名称或其典型目录结构匹配**
   - 检查目录名是否包含依赖的关键词
   - 例如：`i18n` → 国际化（react-i18next）、`redux` → Redux 状态管理

2. **解析内部文件内容进行二次确认**
   - 检查文件内容中是否包含依赖的导入语句
   - 例如：`import { useTranslation } from 'react-i18next'`

3. **生成职能名称**
   - 格式：`{依赖显示名称}相关` 或 `{依赖显示名称}相关子模块（{子模块名}）`
   - 例如：
     - `i18n/locales` → `国际化（i18next）相关`
     - `redux/features/user` → `Redux 状态管理相关子模块（用户）`

**支持的依赖类型**：
- 国际化：i18next, react-i18next, next-i18next
- 状态管理：redux, zustand, mobx, recoil, jotai
- UI 库：@mui/material, antd, @chakra-ui/react
- 样式：tailwindcss
- 认证：next-auth, auth0
- 路由：react-router, @tanstack/react-router
- 表单：react-hook-form, formik
- 数据获取：react-query, swr, apollo-client
- 工具库：lodash, date-fns, dayjs
- 测试：jest, @testing-library/react
- 工程工具：eslint, prettier

### 第二阶段：文件夹名称的类别语义判断

**目的**：识别行业通用的类别词。

**判断流程**：

1. **精确匹配类别词**
   ```typescript
   components / component / cmp → "组件"
   pages / page / views / view → "页面"
   utils / utilities / helpers → "工具函数"
   api / apis / services → "API" 或 "API 服务"
   hooks / hook → "Hooks"
   style / styles / css / scss → "样式"
   store / stores / state → "状态管理"
   types / type / interfaces → "类型定义"
   models / model / entities → "数据模型"
   // ... 更多类别词
   ```

2. **部分匹配**
   - 如果目录名包含类别词，也认为匹配
   - 例如：`my-components` → "组件"

3. **父级语义增强**
   - 如果父级目录也是类别词，需要增强语义
   - 例如：`components/insurance` → "保险相关组件"（而不是简单的"组件"）

### 第三阶段：业务语义或不明语义的目录

**目的**：对非通用类别词的目录进行业务语义分析。

**判断流程**：

1. **文件内容深度分析**
   - 分析文件类型（tsx, ts, json, config）
   - 分析文件语法：组件？页面？hooks？model？
   - 提取业务关键词（insurance、claim、wallet、payment 等）

2. **基于文件内容推断**
   ```typescript
   // 检测页面
   if (export default function XxxPage()) → "页面"
   
   // 检测组件
   if (JSX、函数组件、类组件) → "组件"
   if (使用 UI 库) → "{UI库名}组件"
   
   // 检测 API
   if (axios/fetch/API 调用) → "API 服务"
   
   // 检测工具函数
   if (纯函数、无副作用) → "工具函数"
   
   // 检测数据模型
   if (schema/model/entity) → "数据模型"
   ```

3. **基于业务关键词推断**
   - 如果检测到业务关键词，生成业务语义化的职能名称
   - 例如：
     - `insurance` + 组件 → "保险相关组件"
     - `loan` + API → "贷款相关接口"
     - `report` + 工具函数 → "报表相关工具"

4. **父级语义增强**
   - 如果父级是类别词，组合父级和当前业务词
   - 例如：`components/insurance` → "保险相关组件"

### 第四阶段：继承父级目录的语义（增强语义）

**目的**：当父级目录是类别词时，增强子目录的语义表达。

**规则**：`父级（类别词） + 当前目录（业务词） + 职能强化词`

**示例**：
```typescript
components/insurance → "保险相关组件"
services/payment → "支付相关 API 服务"
utils/format → "格式化相关工具函数"
hooks/auth → "认证相关 Hooks"
```

**判断逻辑**：
1. 检查父级目录是否是类别词（components、services、utils 等）
2. 检查当前目录名是否是业务词（不是类别词）
3. 根据主要文件类型确定职能强化词（组件、API 服务、工具函数等）
4. 组合生成增强的职能名称

### 第五阶段：文件内容深度分析（全局适用）

**目的**：作为最后手段，通过文件内容进行兜底判断。

**分析内容**：
1. **文件语法分析**
   - 是否 `export default function XxxPage()` → 页面
   - 是否包含 JSX → 组件
   - 是否使用 UI 库 → UI 组件
   - 是否大量使用 Hooks → 自定义 Hooks
   - 是否大部分是纯函数 → 工具函数
   - 是否使用 axios/fetch → API
   - 是否包含 schema/model → 数据模型

2. **业务词汇提取**
   - 从变量名、函数名、类型名中提取业务关键词
   - 支持 30+ 个常见业务领域关键词
   - 自动翻译为中文（如：insurance → 保险）

3. **文件内容判定优先级高于文件类型判定**
   - 即使文件扩展名是 `.ts`，如果内容是组件，也会识别为组件

## 详细判断逻辑（技术实现）

### 阶段一：文件类型识别（DeepDirectoryAnalyzer）

首先，系统会识别目录中每个文件的类型，然后基于文件类型分布来判断目录职能。

#### 1.1 文件类型识别（FileTypeIdentifier）

对每个文件，系统会按以下顺序识别其类型：

**优先级 1: 快速识别（基于扩展名和路径）**

```typescript
// 测试文件
if (fileName.includes(".test.") || fileName.includes(".spec.") || 
    path.includes("/__tests__/") || path.includes("/tests/"))
  → 类型: "test"

// 样式文件
if (extension in [".css", ".scss", ".sass", ".less", ".styl"])
  → 类型: "style"

// 配置文件
if (fileName.startsWith(".") || fileName === "config.ts" || 
    fileName.includes("config.") || dirPath.includes("/config"))
  → 类型: "config"

// 类型定义文件（TypeScript）
if (extension === ".ts" && 
    (fileName.includes("types") || fileName.includes("interface") || 
     fileName.includes("type") || dirPath.includes("/types")))
  → 类型: "type"

// 枚举文件
if (extension === ".ts" && 
    (fileName.toLowerCase().includes("enum") || 
     nameWithoutExt.match(/^[A-Z][a-zA-Z]*Enum$/)))
  → 类型: "enum"

// 常量文件
if (extension === ".ts" && 
    (fileName.toLowerCase().includes("constant") || 
     fileName.toLowerCase().includes("const") || 
     nameWithoutExt.toUpperCase() === nameWithoutExt))
  → 类型: "constant"

// React/Vue 组件文件
if (extension in [".tsx", ".jsx", ".vue", ".svelte"]) {
  if (dirPath.includes("/pages/") || dirPath.includes("/app/") || 
      dirPath.includes("/views/") || fileName === "page.tsx" || 
      fileName.includes("Page"))
    → 类型: "page"
  else if (fileName === "layout.tsx" || fileName.includes("Layout") || 
           dirPath.includes("/layouts/"))
    → 类型: "layout"
  else
    → 类型: "component"
}

// Hook 文件（React）
if (extension === ".ts" && 
    (fileName.startsWith("use") || dirPath.includes("/hooks/")))
  → 类型: "hook"

// 路由文件
if (fileName.includes("route") || fileName.includes("router") || 
    dirPath.includes("/routes/") || dirPath.includes("/routers/"))
  → 类型: "route"

// 中间件文件
if (fileName.includes("middleware") || 
    dirPath.includes("/middleware/") || dirPath.includes("/middlewares/"))
  → 类型: "middleware"

// 控制器文件
if (fileName.includes("controller") || 
    dirPath.includes("/controllers/") || dirPath.includes("/controller/"))
  → 类型: "controller"

// 模型文件
if (fileName.includes("model") || dirPath.includes("/models/") || 
    dirPath.includes("/model/") || dirPath.includes("/entities/"))
  → 类型: "model"

// 仓库文件
if (fileName.includes("repository") || fileName.includes("repo") || 
    dirPath.includes("/repositories/") || dirPath.includes("/repository/"))
  → 类型: "repository"

// 服务/API 文件
if (fileName.includes("service") || fileName.includes("api") || 
    dirPath.includes("/services/") || dirPath.includes("/api/") || 
    dirPath.includes("/apis/"))
  → 类型: "service"

// 工具函数文件
if (dirPath.includes("/utils/") || dirPath.includes("/utilities/") || 
    dirPath.includes("/helpers/") || dirPath.includes("/lib/"))
  → 类型: "utility"
```

**优先级 2: 命名模式识别**

```typescript
// PascalCase 命名（通常是组件或类型）
if (nameWithoutExt.match(/^[A-Z][a-zA-Z0-9]+$/)) {
  if (extension in [".tsx", ".jsx", ".vue"])
    → 类型: "component"
  else if (extension in [".ts", ".js"])
    → 类型: "type" (中等置信度)
}

// camelCase 命名（通常是工具函数、Hook）
if (nameWithoutExt.match(/^[a-z][a-zA-Z0-9]+$/)) {
  if (nameWithoutExt.startsWith("use"))
    → 类型: "hook"
  else if (extension in [".ts", ".js"])
    → 类型: "utility" (中等置信度)
}

// kebab-case 命名
if (nameWithoutExt.match(/^[a-z][a-z0-9-]+$/)) {
  if (extension in [".tsx", ".jsx"])
    → 类型: "component" (中等置信度)
  else
    → 类型: "utility" (中等置信度)
}
```

**优先级 3: 目录结构识别**

```typescript
const dirName = path.basename(dirPath).toLowerCase();

if (dirName.includes("component")) → 类型: "component"
if (dirName.includes("page") || dirName.includes("view")) → 类型: "page"
if (dirName.includes("hook")) → 类型: "hook"
if (dirName.includes("util") || dirName.includes("helper")) → 类型: "utility"
if (dirName.includes("service") || dirName.includes("api")) → 类型: "service"
if (dirName.includes("type") || dirName.includes("interface")) → 类型: "type"
if (dirName.includes("model") || dirName.includes("entity")) → 类型: "model"
if (dirName.includes("controller")) → 类型: "controller"
if (dirName.includes("repository") || dirName.includes("repo")) → 类型: "repository"
if (dirName.includes("route") || dirName.includes("router")) → 类型: "route"
if (dirName.includes("middleware")) → 类型: "middleware"
if (dirName.includes("layout")) → 类型: "layout"
```

**如果以上都无法确定，标记为需要 AST 分析**

#### 1.2 文件类型分布分析

识别完所有文件类型后，计算文件类型分布：

```typescript
// 统计每种类型的文件数量
fileTypeDistribution = {
  component: 10,
  utility: 5,
  type: 3,
  ...
}

// 获取主要文件类型（占比 > 20%）
primaryFileTypes = ["component", "utility"]  // 按占比排序
```

### 文件类型识别（作为基础数据）

在五阶段判断之前，系统会先识别所有文件的类型，作为基础数据：

### 五阶段判断流程（inferDirectoryPurposeEnhanced）

#### 阶段一：依赖关联判断

```typescript
if (primaryTypes.length > 0) {
  const primaryType = primaryTypes[0];  // 占比最高的文件类型

  switch (primaryType) {
    case "component":
      if (dirName.includes("page") || dirPath.includes("/pages/"))
        → 职能: "页面组件"
      else
        → 职能: "组件"
    
    case "page":
      → 职能: "页面"
    
    case "hook":
      → 职能: "Hooks"
    
    case "utility":
      → 职能: "工具函数"
    
    case "service":
      → 职能: "API 服务"
    
    case "type":
      → 职能: "类型定义"
    
    case "model":
      → 职能: "数据模型"
    
    case "controller":
      → 职能: "控制器"
    
    case "repository":
      → 职能: "数据仓库"
    
    case "route":
      → 职能: "路由"
    
    case "middleware":
      → 职能: "中间件"
    
    case "layout":
      → 职能: "布局"
  }
    }
    ```

#### 阶段二：类别语义判断

如果文件类型无法确定，使用目录名匹配：

```typescript
const dirName = path.basename(dirPath).toLowerCase();

// 精确匹配关键词
if (dirName.includes("component")) → "组件"
if (dirName.includes("page") || dirName.includes("view")) → "页面"
if (dirName.includes("hook")) → "Hooks"
if (dirName.includes("util") || dirName.includes("helper")) → "工具"
if (dirName.includes("type") || dirName.includes("interface")) → "类型"
if (dirName.includes("style") || dirName.includes("css")) → "样式"
if (dirName.includes("api") || dirName.includes("service")) → "API"
if (dirName.includes("model") || dirName.includes("entity")) → "模型"
if (dirName.includes("controller")) → "控制器"
if (dirName.includes("repository") || dirName.includes("repo")) → "仓库"
if (dirName.includes("route") || dirName.includes("router")) → "路由"
if (dirName.includes("middleware")) → "中间件"
if (dirName.includes("layout")) → "布局"
if (dirName.includes("feature")) → "功能模块"
if (dirName.includes("shared") || dirName.includes("common")) → "共享"
if (dirName.includes("config")) → "配置"
if (dirName.includes("test") || dirName.includes("__tests__")) → "测试"
```

#### 阶段三：业务语义判断

```typescript
const dirParts = dirPath.split(path.sep).filter(Boolean);

if (dirParts.length >= 2) {
  const parentDir = dirParts[dirParts.length - 2]?.toLowerCase();
  
  if (parentDir === "features" || parentDir === "modules")
    → 职能: "功能模块"
}
```

#### 阶段四：父级语义继承增强

#### 阶段五：文件内容深度分析（兜底）

### 目录分类推断（inferDirectoryCategory）

基于目录职能和文件类型，确定目录分类：

```typescript
if (purpose.includes("组件") || primaryTypes.includes("component"))
  → 分类: "component"

if (purpose.includes("页面") || primaryTypes.includes("page"))
  → 分类: "page"

if (purpose.includes("Hook") || primaryTypes.includes("hook"))
  → 分类: "hook"

if (purpose.includes("工具") || primaryTypes.includes("utility"))
  → 分类: "utility"

if (purpose.includes("服务") || primaryTypes.includes("service"))
  → 分类: "service"

if (purpose.includes("类型") || primaryTypes.includes("type"))
  → 分类: "type"

if (purpose.includes("模型") || primaryTypes.includes("model"))
  → 分类: "model"

if (purpose.includes("路由") || primaryTypes.includes("route"))
  → 分类: "route"

if (purpose.includes("功能"))
  → 分类: "feature"

if (purpose.includes("共享"))
  → 分类: "shared"

else
  → 分类: "other"
```

## 判断示例

### 示例 1: `src/components/Button/`

```
文件列表:
- Button.tsx (component)
- Button.module.css (style)
- Button.test.tsx (test)
- index.ts (utility)

文件类型分布:
- component: 1
- style: 1
- test: 1
- utility: 1

主要文件类型: ["component"] (占比 25%)

判断过程:
1. 主要文件类型是 "component"
2. 目录名是 "Button"，不包含 "page"
3. → 职能: "组件"
4. → 分类: "component"
```

### 示例 2: `src/pages/Home/`

```
文件列表:
- page.tsx (page)
- Home.tsx (component)
- styles.module.css (style)

文件类型分布:
- page: 1
- component: 1
- style: 1

主要文件类型: ["page"] (占比 33%)

判断过程:
1. 主要文件类型是 "page"
2. → 职能: "页面"
3. → 分类: "page"
```

### 示例 3: `src/utils/`

```
文件列表:
- formatDate.ts (utility)
- validateEmail.ts (utility)
- constants.ts (constant)

文件类型分布:
- utility: 2
- constant: 1

主要文件类型: ["utility"] (占比 67%)

判断过程:
1. 主要文件类型是 "utility"
2. → 职能: "工具函数"
3. → 分类: "utility"
```

### 示例 4: `src/features/auth/`

```
文件列表:
- AuthForm.tsx (component)
- useAuth.ts (hook)
- authService.ts (service)

文件类型分布:
- component: 1
- hook: 1
- service: 1

主要文件类型: [] (没有单一类型占比 > 20%)

判断过程:
1. 文件类型无法确定主要类型
2. 目录名 "auth" 不匹配关键词
3. 父目录是 "features"
4. → 职能: "功能模块"
5. → 分类: "feature"
```

## 特殊情况处理

### 1. 空目录
如果目录中没有文件，返回 `null`，不进行分析。

### 2. 混合类型目录
如果目录包含多种文件类型，且没有单一类型占比超过 20%，则：
- 优先使用目录名匹配
- 如果目录名也无法匹配，使用路径层级分析
- 最后返回 "其他"

### 3. 需要 AST 分析的情况
如果基本信息（文件名、路径、扩展名）无法确定文件类型，会标记 `requiresAST: true`，但当前实现中，AST 分析是按需进行的，不会在初始分析时执行。

## 判断准确性

判断的准确性取决于：

1. **文件命名规范性** - 规范的命名能提高识别准确率
2. **目录结构清晰度** - 清晰的目录结构有助于判断
3. **文件类型分布** - 单一类型的目录更容易准确判断
4. **项目架构模式** - 遵循常见架构模式的项目更容易识别

## 输出特征

最终输出的目录职能必须符合以下特征：

### ✅ 具体
- ❌ "组件"
- ✔️ "保险相关组件 / 表单相关组件 / 支付相关组件"

### ✅ 带业务语义
- 基于目录名+文件内容推断的业务词汇
- 例如：insurance → 保险、payment → 支付、loan → 贷款

### ✅ 合理表达层级信息
- 父级目录类别需影响子级目录解释
- 例如：`components/insurance` → "保险相关组件"（而不是简单的"组件"）

### ✅ 不允许所有不确定情况都落入"工具函数"
- 除非目录内容证明确实是 utils
- 优先使用业务语义或目录名

## 改进建议

如果需要进一步提高判断准确性，可以考虑：

1. **增强 AST 分析** - 对无法确定的文件进行更深入的 AST 分析
2. **扩展业务关键词库** - 添加更多行业特定的业务词汇
3. **配置文件支持** - 允许用户手动指定目录职能
4. **上下文分析** - 分析文件间的依赖关系来推断职能
5. **模式匹配增强** - 识别更多项目架构模式和命名约定
6. **机器学习** - 基于大量项目数据训练模型（长期目标）

