/**
 * 类型定义文件
 */

export interface ProjectFile {
  path: string;
  relativePath: string;
  extension: string;
  size: number;
}

export interface TechStack {
  primary: string[]; // 主要技术栈，如 ['React', 'TypeScript', 'Node.js']
  dependencies: Dependency[];
  packageManagers: string[]; // npm, yarn, pnpm 等
  frameworks: string[];
  languages: string[];
}

export interface Dependency {
  name: string;
  version: string;
  type: "dependency" | "devDependency" | "peerDependency";
  category?: string; // 'framework', 'library', 'tool' 等
}

export interface Module {
  name: string;
  path: string;
  type: "frontend" | "backend" | "shared" | "service" | "package" | "other";
  dependencies: string[];
  description?: string;
  version?: string;
  entryPoint?: string;
  keywords?: string[];
  buildConfig?: string; // vite, webpack, rollup 等
  packageName?: string; // package.json 中的 name 字段（用于代码生成时的包名引用）
}

export interface CodeFeature {
  type: string; // 'data-processing', 'custom-components', 'api-routes' 等
  description: string;
  examples: string[];
  frequency: number; // 出现频率
}

export interface BestPractice {
  source: string; // 来源，如 'React Official Docs'
  category: string; // 'component-structure', 'state-management' 等
  content: string;
  priority: number; // 优先级 1-10
}

export interface Inconsistency {
  type: "missing-doc" | "outdated-doc" | "wrong-tech-stack" | "missing-feature";
  description: string;
  actualValue: string;
  documentedValue?: string;
  severity: "low" | "medium" | "high";
  suggestedFix?: string;
}

export interface ConsistencyReport {
  hasInconsistencies: boolean;
  inconsistencies: Inconsistency[];
  checkedFiles: string[];
}

export interface CursorRule {
  scope: "global" | "module" | "specialized";
  moduleName?: string;
  modulePath?: string;
  content: string;
  fileName: string;
  priority: number;
  type?: string;
  depends?: string[];
  alwaysApply?: boolean;
  globs?: string | string[];
}

export interface InstructionsFile {
  content: string;
  fileName: string; // instructions.md
  filePath: string; // .cursor/instructions.md
}

export interface ProjectPractice {
  errorHandling: any; // ErrorHandlingPattern from practice-analyzer
  codeStyle: any; // CodeStylePattern from practice-analyzer
  componentPattern: any; // ComponentPattern from practice-analyzer
}

export interface ProjectConfiguration {
  prettier?: any; // PrettierConfig from config-parser
  eslint?: any; // ESLintConfig from config-parser
  typescript?: any; // TSConfig from config-parser
  pathAliases: Record<string, string>;
  commands?: {
    build?: string;
    dev?: string;
    start?: string;
    test?: string;
    format?: string;
    lint?: string;
    lintFix?: string;
    typeCheck?: string;
  };
}

export interface CustomPatterns {
  customHooks: any[]; // CustomHook[] from custom-pattern-detector
  customUtils: any[]; // CustomUtil[] from custom-pattern-detector
  apiClient?: any; // APIClientInfo from custom-pattern-detector
}

export interface FileOrganizationInfo {
  structure: any[]; // DirectoryPurpose[] from file-structure-learner
  componentLocation: string[];
  utilsLocation: string[];
  typesLocation?: string[]; // v1.7 新增
  stylesLocation?: string[]; // v1.7 新增
  apiLocation?: string[]; // v1.7 新增
  hooksLocation?: string[]; // v1.7 新增
  namingConvention: any;
}

export interface RouterInfo {
  exists: boolean;
  type: "file-based" | "config-based" | "programmatic" | "mixed";
  framework: string;
  version?: string;
  location: string[];
}

export interface RoutingPattern {
  organization: "centralized" | "distributed" | "feature-based" | "mixed";
  urlNaming: "kebab-case" | "camelCase" | "snake_case" | "mixed";
  fileNaming: string;
  dynamicRoutePattern: string;
  dynamicRouteExamples: string[];
  hasRouteGroups: boolean;
  groupPattern?: string;
  supportsLayouts: boolean;
  layoutPattern?: string;
  hasGuards: boolean;
  guardFiles?: string[];
  usesLazyLoading: boolean;
  hasRouteMeta: boolean;
  navigationMethod?: string;
  isDynamicGenerated: boolean;
  generationScript?: string;
}

export interface RouteExample {
  filePath: string;
  url: string;
  type: "static" | "dynamic" | "nested" | "api";
  method?: string;
  hasGuard?: boolean;
}

export interface RuleGenerationContext {
  projectPath: string;
  techStack: TechStack;
  modules: Module[];
  codeFeatures: Record<string, CodeFeature>;
  bestPractices: BestPractice[];
  includeModuleRules: boolean;
  // v1.2 新增字段
  projectPractice?: ProjectPractice;
  projectConfig?: ProjectConfiguration;
  customPatterns?: CustomPatterns;
  fileOrganization?: FileOrganizationInfo;
  // v1.3.x 新增字段
  frontendRouter?: {
    info: RouterInfo;
    pattern: RoutingPattern;
    examples: RouteExample[];
    dynamicAnalysis?: any;
  };
  backendRouter?: {
    info: RouterInfo;
    pattern: RoutingPattern;
    examples: RouteExample[];
  };
  // v1.8 新增字段：深度目录分析
  deepAnalysis?: DeepDirectoryAnalysis[];
  architecturePattern?: ArchitecturePattern;
  // v1.8.1 新增：保存文件列表，用于重新分析
  files?: string[];
}

/**
 * 生成摘要相关类型（v1.7 新增）
 */
export interface GenerationSummary {
  status: "success" | "needs-confirmation" | "error";
  filesGenerated: Array<{
    path: string;
    type: string;
    sourceRule: string;
    explanation?: {
      filePath: string;
      type: string;
      sourceRule: string;
      triggerCondition: string;
      usageGuidance: string;
    };
  }>;
  contextEvaluation: {
    detectedStructure: string[];
    appliedStructureRule: string;
    mismatches?: Array<{
      type: string;
      detected: string | null;
      expected: string;
      severity: "high" | "medium" | "low";
    }>;
  };
  userGuidance: string[];
  notes: string[];
  confirmationsNeeded?: Array<{
    topic: string;
    currentPath: string;
    reason: string;
    alternatives?: string[];
  }>;
}

/**
 * 深度目录分析相关类型（v1.8 新增）
 */

/**
 * 文件类型分类
 */
export type FileTypeCategory =
  | "page" // 页面文件
  | "component" // 组件文件
  | "hook" // Hook 文件
  | "utility" // 工具函数
  | "service" // 服务/API
  | "type" // 类型定义
  | "enum" // 枚举
  | "constant" // 常量
  | "config" // 配置文件
  | "test" // 测试文件
  | "style" // 样式文件
  | "layout" // 布局文件
  | "middleware" // 中间件
  | "model" // 数据模型
  | "repository" // 数据仓库
  | "controller" // 控制器
  | "route" // 路由文件
  | "other"; // 其他

/**
 * 文件类型信息
 */
export interface FileTypeInfo {
  category: FileTypeCategory;
  confidence: "high" | "medium" | "low"; // 置信度
  indicators: string[]; // 判断依据（文件名、路径、扩展名等）
  requiresAST?: boolean; // 是否需要 AST 分析
}

/**
 * 目录深度分析结果
 */
export interface DeepDirectoryAnalysis {
  path: string;
  purpose: string; // 目录用途
  category: string; // 目录分类
  fileTypeDistribution: Record<FileTypeCategory, number>; // 文件类型分布
  primaryFileTypes: FileTypeCategory[]; // 主要文件类型
  namingPattern: "PascalCase" | "camelCase" | "kebab-case" | "snake_case" | "mixed";
  architecturePattern?: string; // 架构模式（如 "feature-based", "clean-architecture" 等）
  hasIndexFiles: boolean; // 是否使用 index 文件
  coLocationPattern?: {
    // co-location 模式
    styles: boolean; // 是否有样式文件
    tests: boolean; // 是否有测试文件
    types: boolean; // 是否有类型文件
  };
  parentDirectory?: string; // 父目录
  childDirectories: string[]; // 子目录列表
  fileCount: number; // 文件数量
  depth: number; // 目录深度
  module?: string; // 所属模块
  version?: string; // 版本标识（如 v1, v2, legacy, new）
}

/**
 * 文件依赖关系
 */
export interface FileDependency {
  from: string; // 源文件路径
  to: string; // 目标文件路径
  type: "import" | "export" | "require" | "dynamic"; // 依赖类型
  isExternal: boolean; // 是否为外部依赖
  isCircular?: boolean; // 是否为循环依赖
}

/**
 * 依赖图
 */
export interface DependencyGraph {
  nodes: Array<{
    path: string;
    type: FileTypeCategory;
    module?: string;
  }>;
  edges: FileDependency[];
  modules: Map<string, string[]>; // 模块 -> 文件列表
  circularDependencies: string[][]; // 循环依赖链
}

/**
 * 架构模式识别结果
 */
export interface ArchitecturePattern {
  type:
    | "mvc"
    | "clean-architecture"
    | "feature-based"
    | "domain-driven"
    | "layered"
    | "modular-monolith"
    | "microservices"
    | "monorepo"
    | "mixed"
    | "unknown";
  confidence: "high" | "medium" | "low";
  indicators: string[]; // 识别依据
  layerStructure?: {
    // 层级结构（如 Clean Architecture）
    presentation?: string[];
    application?: string[];
    domain?: string[];
    infrastructure?: string[];
  };
  featureStructure?: {
    // 功能结构（如 Feature-based）
    features: string[];
    shared?: string[];
  };
}

/**
 * 代码生成需求解析结果
 */
export interface CodeGenerationRequirement {
  codeType: FileTypeCategory; // 代码类型
  fileType: string; // 文件类型（.tsx, .ts, .vue 等）
  module?: string; // 所属模块
  version?: string; // 版本标识
  shouldSplit: boolean; // 是否需要拆分
  splitStrategy?: {
    // 拆分策略
    byFeature: boolean; // 按功能拆分
    byType: boolean; // 按类型拆分
    coLocation: boolean; // co-location 模式
  };
  complexity: "simple" | "medium" | "complex"; // 复杂度
}

/**
 * 文件位置决策结果
 */
export interface FileLocationDecision {
  recommendedPath: string; // 推荐路径
  confidence: "high" | "medium" | "low";
  alternatives: Array<{
    path: string;
    reason: string;
    confidence: "high" | "medium" | "low";
  }>;
  reasoning: string[]; // 决策理由
  constraints: {
    // 约束条件
    mustBeInModule?: string;
    mustBeInVersion?: string;
    mustFollowPattern?: string;
    cannotBeIn?: string[];
  };
}

/**
 * 文件拆分策略
 */
export interface FileSplittingStrategy {
  shouldSplit: boolean; // 是否应该拆分
  splitPattern: "single-file" | "multi-file" | "co-location" | "feature-split";
  fileStructure: {
    // 文件结构
    main: string; // 主文件
    styles?: string; // 样式文件
    types?: string; // 类型文件
    tests?: string; // 测试文件
    hooks?: string[]; // Hook 文件
    utils?: string[]; // 工具文件
  };
  reasoning: string; // 拆分理由
}

/**
 * 增强的文件组织信息（v1.8）
 */
export interface EnhancedFileOrganization extends FileOrganizationInfo {
  deepAnalysis: DeepDirectoryAnalysis[]; // 深度目录分析
  dependencyGraph?: DependencyGraph; // 依赖图
  architecturePattern?: ArchitecturePattern; // 架构模式
  fileSplittingStrategy?: FileSplittingStrategy; // 文件拆分策略
  versionIsolation?: {
    // 版本隔离
    hasVersioning: boolean;
    versions: string[];
    pattern: "directory" | "prefix" | "suffix" | "none";
  };
  moduleHierarchy?: {
    // 模块层级（支持多国家线等）
    levels: Array<{
      level: number;
      name: string;
      type: "country" | "region" | "module" | "feature" | "other";
      directories: string[];
    }>;
  };
}
