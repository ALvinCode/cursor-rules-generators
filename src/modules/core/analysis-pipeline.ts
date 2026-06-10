/**
 * 共享分析管道
 *
 * 统一三个入口（MCP server、CLI、test-project 脚本）的项目分析逻辑，
 * 确保它们都能获得相同质量的 `RuleGenerationContext`。
 *
 * 设计目标：
 * - 单一来源：MCP / CLI / 脚本共用同一套分析步骤，避免功能漂移
 * - 进度可观察：通过 `onProgress` 回调将每个阶段的状态推送给调用方
 * - 可裁剪：通过 options 控制重型阶段（路由检测、Context7、一致性检查）
 */

import { ProjectAnalyzer } from './project-analyzer.js';
import { ConfigParser } from './config-parser.js';
import { TechStackDetector } from '../analyzers/tech-stack-detector.js';
import { ModuleDetector } from '../analyzers/module-detector.js';
import { CodeAnalyzer } from '../analyzers/code-analyzer.js';
import { PracticeAnalyzer } from '../analyzers/practice-analyzer.js';
import { CustomPatternDetector } from '../analyzers/custom-pattern-detector.js';
import { FileStructureLearner } from '../analyzers/file-structure-learner.js';
import { DeepDirectoryAnalyzer } from '../analyzers/deep-directory-analyzer.js';
import { RouterDetector } from '../analyzers/router-detector.js';
import {
  rankDependencyUsage,
  type LibraryCatalogEntry,
  type UsageFallback,
} from '../analyzers/dependency-usage-ranker.js';
import { Context7Integration } from '../integrations/context7-integration.js';
import { ConsistencyChecker } from '../validators/consistency-checker.js';
import { FileUtils } from '../../utils/file-utils.js';
import { logger } from '../../utils/logger.js';
import {
  RuleGenerationContext,
  ConsistencyReport,
  Dependency,
} from '../../types.js';

// ─── UI 库检测配置（供 rankDependencyUsage 使用） ────────────

const UI_LIBRARY_CATALOG: LibraryCatalogEntry[] = [
  { name: "Ant Design", patterns: ["antd", "@ant-design/", "antd-mobile"] },
  { name: "Material UI", patterns: ["@mui/", "@material-ui/"] },
  { name: "shadcn/ui (Radix)", patterns: ["@radix-ui/", "shadcn-ui"] },
  { name: "Chakra UI", patterns: ["@chakra-ui/"] },
  { name: "Mantine", patterns: ["@mantine/"] },
  { name: "Arco Design", patterns: ["@arco-design/"] },
  { name: "Element Plus", patterns: ["element-plus"] },
  { name: "Element UI", patterns: ["element-ui"] },
  { name: "Vuetify", patterns: ["vuetify"] },
  { name: "Naive UI", patterns: ["naive-ui"] },
  { name: "PrimeReact", patterns: ["primereact"] },
  { name: "PrimeVue", patterns: ["primevue"] },
  { name: "styled-components", patterns: ["styled-components"] },
  { name: "Emotion", patterns: ["@emotion/"] },
  { name: "Tailwind CSS", patterns: ["tailwindcss"] },
];

const UI_SOURCE_EXT = /\.(ts|tsx|js|jsx|vue|svelte|css|less|scss|sass|styl)$/;
const UI_FALLBACKS: UsageFallback[] = [
  { libraryName: "Tailwind CSS", filePattern: /tailwind\.config\.(js|ts|cjs|mjs)$/ },
];

/**
 * 分析阶段的标识。供调用方在 onProgress 中识别当前进度。
 */
export type AnalysisStage =
  | 'collect-files'
  | 'tech-stack'
  | 'modules'
  | 'code-features'
  | 'project-config'
  | 'practices'
  | 'custom-patterns'
  | 'ui-libraries'
  | 'file-organization'
  | 'deep-directory'
  | 'architecture-pattern'
  | 'routers'
  | 'best-practices'
  | 'consistency';

export interface AnalysisProgress {
  stage: AnalysisStage;
  /** 1-based 当前阶段序号（仅用于显示） */
  step: number;
  /** 阶段总数（仅用于显示） */
  total: number;
  /** 给人看的简要消息 */
  message: string;
  /** 阶段完成后可选的明细，例如「发现 N 个模块」 */
  details?: string[];
}

export interface AnalysisPipelineOptions {
  /** 是否运行路由检测（默认 true，CLI 默认行为已对齐 MCP） */
  includeRouterAnalysis?: boolean;
  /** 是否调用 Context7 获取最佳实践（默认 true） */
  includeBestPractices?: boolean;
  /** 是否运行 README / package.json 一致性检查（默认 true） */
  includeConsistencyCheck?: boolean;
  /** 进度回调；MCP 用它驱动 task tracker，CLI 用它写 stdout */
  onProgress?: (progress: AnalysisProgress) => void;
}

export interface AnalysisPipelineResult {
  /** 完整 RuleGenerationContext，可直接交给 RulesGenerator.generate */
  context: RuleGenerationContext;
  /** 一致性检查报告（如果启用）。MCP 可据此触发 updateDescriptions */
  consistencyReport?: ConsistencyReport;
}

/**
 * 阶段顺序：决定 step/total 计算。
 * 路由 / 最佳实践 / 一致性可通过 options 关闭，因此 total 是动态的。
 */
const ALL_STAGES: AnalysisStage[] = [
  'collect-files',
  'tech-stack',
  'modules',
  'code-features',
  'project-config',
  'practices',
  'custom-patterns',
  'ui-libraries',
  'file-organization',
  'deep-directory',
  'architecture-pattern',
  'routers',
  'best-practices',
  'consistency',
];

const OPTIONAL_STAGES: Record<AnalysisStage, keyof AnalysisPipelineOptions | null> = {
  'collect-files': null,
  'tech-stack': null,
  'modules': null,
  'code-features': null,
  'project-config': null,
  'practices': null,
  'custom-patterns': null,
  'ui-libraries': null,
  'file-organization': null,
  'deep-directory': null,
  'architecture-pattern': null,
  'routers': 'includeRouterAnalysis',
  'best-practices': 'includeBestPractices',
  'consistency': 'includeConsistencyCheck',
};

export class AnalysisPipeline {
  private projectAnalyzer = new ProjectAnalyzer();
  private techStackDetector = new TechStackDetector();
  private moduleDetector = new ModuleDetector();
  private codeAnalyzer = new CodeAnalyzer();
  private configParser = new ConfigParser();
  private practiceAnalyzer = new PracticeAnalyzer();
  private customPatternDetector = new CustomPatternDetector();
  private fileStructureLearner = new FileStructureLearner();
  private deepDirectoryAnalyzer = new DeepDirectoryAnalyzer();
  private routerDetector = new RouterDetector();
  private context7Integration = new Context7Integration();
  private consistencyChecker = new ConsistencyChecker();

  async run(
    projectPath: string,
    options: AnalysisPipelineOptions = {}
  ): Promise<AnalysisPipelineResult> {
    const enabledStages = ALL_STAGES.filter((stage) => {
      const flag = OPTIONAL_STAGES[stage];
      if (flag === null) return true;
      const value = options[flag];
      return value === undefined ? true : Boolean(value);
    });

    const total = enabledStages.length;
    let stepIndex = 0;
    const emit = (
      stage: AnalysisStage,
      message: string,
      details?: string[]
    ) => {
      if (!enabledStages.includes(stage)) return;
      stepIndex += 1;
      options.onProgress?.({ stage, step: stepIndex, total, message, details });
    };

    logger.info(`分析管道开始：${projectPath}`, { stages: enabledStages });

    // 启用 FileUtils 读缓存：同一次 run() 中多个 analyzer 读同一文件时只走一次磁盘
    FileUtils.enableCache();
    try {
    // 1) 收集文件
    const files = await this.projectAnalyzer.collectFiles(projectPath);
    emit('collect-files', '收集项目文件', [`已收集 ${files.length} 个文件`]);

    // 2) 技术栈
    const techStack = await this.techStackDetector.detect(projectPath, files);
    emit('tech-stack', '识别技术栈', [
      `主要技术栈：${techStack.primary.join('，') || '未检测到'}`,
    ]);

    // 3) 模块
    const modules = await this.moduleDetector.detectModules(projectPath, files);
    emit('modules', '检测模块结构', [
      `识别 ${modules.length} 个模块${
        modules.length ? `：${modules.map((m) => m.name).join('，')}` : ''
      }`,
    ]);

    // 4) 代码特征
    const codeFeatures = await this.codeAnalyzer.analyzeFeatures(
      projectPath,
      files,
      techStack
    );
    emit('code-features', '分析代码特征', [
      `提取 ${Object.keys(codeFeatures).length} 项特征`,
    ]);

    // 5) 项目配置
    const projectConfig = await this.configParser.parseProjectConfig(projectPath);
    const configBits: string[] = [];
    if (projectConfig?.prettier) configBits.push('Prettier');
    if (projectConfig?.eslint) configBits.push('ESLint');
    if (projectConfig?.typescript) configBits.push('TypeScript');
    emit('project-config', '解析项目配置', [
      configBits.length
        ? `检测到：${configBits.join('、')}`
        : '未检测到显式配置',
    ]);

    // 6) 实践分析
    const errorHandling = await this.practiceAnalyzer.analyzeErrorHandling(
      projectPath,
      files
    );
    const codeStyle = await this.practiceAnalyzer.analyzeCodeStyle(
      projectPath,
      files
    );
    const componentPattern =
      await this.practiceAnalyzer.analyzeComponentPatterns(projectPath, files);
    const projectPractice = { errorHandling, codeStyle, componentPattern };
    emit('practices', '提取项目实践', [
      `错误处理：${errorHandling.type || '未检测'}`,
      `代码风格：${codeStyle.variableDeclaration} / ${codeStyle.stringQuote}`,
    ]);

    // 7) 自定义模式
    const customHooks = await this.customPatternDetector.detectCustomHooks(
      projectPath,
      files
    );
    const customUtils = await this.customPatternDetector.detectCustomUtils(
      projectPath,
      files
    );
    const apiClient = await this.customPatternDetector.detectAPIClient(
      projectPath,
      files
    );
    const customPatterns = { customHooks, customUtils, apiClient };
    emit('custom-patterns', '识别自定义模式', [
      `发现 ${customHooks.length} 个 Hooks、${customUtils.length} 个工具函数`,
    ]);

    // 7.5) UI 库真实使用分析（安装 + 代码扫描 + 使用程度裁定）
    const uiLibraries = await rankDependencyUsage(
      UI_LIBRARY_CATALOG,
      projectPath,
      files,
      techStack.dependencies.map((d) => d.name),
      {
        sourceExtensions: UI_SOURCE_EXT,
        fallbacks: UI_FALLBACKS,
      },
    );
    emit('ui-libraries', '分析 UI 库使用', [
      uiLibraries.active.length
        ? `真实使用：${uiLibraries.active.map((l) => l.name).join('，')}`
        : uiLibraries.installed.length
          ? '已安装 UI 库但未检测到真实使用'
          : '未检测到 UI 库',
    ]);

    // 8) 文件组织
    const fileOrganization = await this.fileStructureLearner.learnStructure(
      projectPath,
      files
    );
    emit('file-organization', '学习文件组织', [
      `识别 ${fileOrganization.structure.length} 个目录节点`,
    ]);

    // 9) 深度目录分析
    const dependenciesForAnalysis: Dependency[] = techStack.dependencies.map(
      (d) => ({
        name: d.name,
        version: d.version,
        type: d.type || 'dependency',
        category: d.category,
      })
    );
    const deepAnalysis =
      await this.deepDirectoryAnalyzer.analyzeProjectStructure(
        projectPath,
        files,
        modules,
        dependenciesForAnalysis
      );
    emit('deep-directory', '深度目录分析', [
      `分析 ${deepAnalysis.length} 个目录`,
    ]);

    // 10) 架构模式
    const architecturePattern =
      await this.deepDirectoryAnalyzer.identifyArchitecturePattern(
        deepAnalysis,
        projectPath,
        files
      );
    emit('architecture-pattern', '识别架构模式', [
      architecturePattern.type !== 'unknown'
        ? `架构：${architecturePattern.type}（置信度 ${architecturePattern.confidence}）`
        : '未识别到主导架构模式',
    ]);

    // 11) 路由
    let frontendRouter: RuleGenerationContext['frontendRouter'];
    let backendRouter: RuleGenerationContext['backendRouter'];
    if (options.includeRouterAnalysis !== false) {
      const routerDeps = techStack.dependencies.map((d) => ({
        name: d.name,
        version: d.version,
      }));
      const frontendInfo = await this.routerDetector.detectFrontendRouter(
        projectPath,
        files,
        routerDeps
      );
      const backendInfo = await this.routerDetector.detectBackendRouter(
        projectPath,
        files,
        routerDeps
      );

      const routeDetails: string[] = [];
      if (frontendInfo) {
        const pattern = await this.routerDetector.analyzeRoutingPattern(
          projectPath,
          files,
          frontendInfo
        );
        const examples = await this.routerDetector.extractRouteExamples(
          projectPath,
          files,
          frontendInfo,
          pattern
        );
        const dynamicAnalysis =
          await this.routerDetector.analyzeDynamicRouting(
            projectPath,
            files,
            frontendInfo
          );
        if (dynamicAnalysis.isDynamic) {
          pattern.isDynamicGenerated = true;
          pattern.generationScript = dynamicAnalysis.recommendation.method;
        }
        frontendRouter = {
          info: frontendInfo,
          pattern,
          examples,
          dynamicAnalysis,
        };
        routeDetails.push(
          `前端路由：${frontendInfo.framework}（${frontendInfo.type}）`
        );
      }

      if (backendInfo) {
        const pattern = await this.routerDetector.analyzeRoutingPattern(
          projectPath,
          files,
          backendInfo
        );
        const examples = await this.routerDetector.extractRouteExamples(
          projectPath,
          files,
          backendInfo,
          pattern
        );
        backendRouter = { info: backendInfo, pattern, examples };
        routeDetails.push(
          `后端路由：${backendInfo.framework}（${backendInfo.type}）`
        );
      }

      if (!frontendInfo && !backendInfo) {
        routeDetails.push('未检测到路由框架');
      }
      emit('routers', '识别路由系统', routeDetails);
    }

    // 12) 最佳实践
    const bestPractices = options.includeBestPractices !== false
      ? await this.context7Integration.getBestPractices(techStack.dependencies)
      : [];
    if (options.includeBestPractices !== false) {
      emit('best-practices', '汇总最佳实践', [
        `获取 ${bestPractices.length} 条最佳实践`,
      ]);
    }

    // 13) 一致性检查
    let consistencyReport: ConsistencyReport | undefined;
    if (options.includeConsistencyCheck !== false) {
      consistencyReport = await this.consistencyChecker.check(
        projectPath,
        files,
        techStack,
        codeFeatures
      );
      emit('consistency', '一致性检查', [
        consistencyReport.hasInconsistencies
          ? `发现 ${consistencyReport.inconsistencies.length} 处不一致`
          : '未发现描述与实现不一致',
      ]);
    }

    const context: RuleGenerationContext = {
      projectPath,
      techStack,
      modules,
      codeFeatures,
      bestPractices,
      includeModuleRules: modules.length > 1,
      projectPractice,
      projectConfig,
      customPatterns,
      fileOrganization,
      deepAnalysis,
      architecturePattern,
      frontendRouter,
      backendRouter,
      files,
      uiLibraries,
    };

    return { context, consistencyReport };
    } finally {
      FileUtils.clearCache();
    }
  }

  /**
   * 内部组件访问器：供 MCP 等需要细粒度控制的调用方使用，避免重复实例化。
   */
  get components() {
    return {
      consistencyChecker: this.consistencyChecker,
      context7: this.context7Integration,
      routerDetector: this.routerDetector,
    };
  }
}
