/**
 * 最佳实践对比器
 * 对比项目实际情况与提取的最佳实践，找出缺失的规则
 */

import { ExtractedBestPractice, BestPracticeComparison } from './best-practice-extractor.js';
import { RuleGenerationContext } from '../../types.js';
import { logger } from "../../utils/logger.js";
import { PracticeAnalyzer, CodeStylePattern, ErrorHandlingPattern, ComponentPattern } from '../analyzers/practice-analyzer.js';
import { FileUtils } from "../../utils/file-utils.js";

/**
 * 占比阈值配置
 */
const THRESHOLD_CONFIG = {
  'code-style': {
    ignore: 0.30,      // < 30%：不考虑
    confirm: 0.70,     // 30% - 70%：需要用户确认
    default: 0.80      // > 80%：默认采用
  },
  'error-handling': {
    ignore: 0.30,
    confirm: 0.60,     // 错误处理阈值稍低
    default: 0.60
  },
  'architecture': {
    ignore: 0.30,
    confirm: 0.70,
    default: 0.85      // 文件组织方式需要更高阈值
  },
  'component': {
    ignore: 0.30,
    confirm: 0.70,
    default: 0.75      // 组件模式阈值
  },
  'default': {
    ignore: 0.30,
    confirm: 0.70,
    default: 0.70
  }
};

export interface PracticeUsage {
  practice: ExtractedBestPractice;
  projectUses: boolean;
  usagePercentage: number; // 0-1
  needsConfirmation: boolean; // 是否需要用户确认
  shouldAdd: boolean; // 是否应该添加到规则中
}

export interface Suggestion {
  type: 'code-style' | 'architecture' | 'error-handling' | 'performance' | 'security' | 'testing' | 'component' | 'routing' | 'state-management' | 'general';
  priority: 'high' | 'medium' | 'low';
  title: string;
  content: string;
  reason: string; // 为什么提出这个建议
  impact: 'global' | 'module' | 'file'; // 影响范围
}

/**
 * 最佳实践对比器
 */
export class BestPracticeComparator {
  private practiceAnalyzer: PracticeAnalyzer;

  constructor() {
    this.practiceAnalyzer = new PracticeAnalyzer();
  }

  /**
   * 对比项目实际情况与提取的最佳实践
   */
  async compare(
    practices: ExtractedBestPractice[],
    context: RuleGenerationContext
  ): Promise<{
    comparisons: BestPracticeComparison[];
    suggestions: Suggestion[];
    missingPractices: ExtractedBestPractice[];
    ambiguousPractices: ExtractedBestPractice[]; // 需要用户确认的实践
  }> {
    const comparisons: BestPracticeComparison[] = [];
    const suggestions: Suggestion[] = [];
    const missingPractices: ExtractedBestPractice[] = [];
    const ambiguousPractices: ExtractedBestPractice[] = [];

    logger.info(`开始对比 ${practices.length} 个最佳实践与项目实际情况`);

    for (const practice of practices) {
      const comparison = await this.compareSinglePractice(practice, context);
      comparisons.push(comparison);

      // 分类处理
      if (comparison.shouldAdd && !comparison.projectUses) {
        // 项目未使用，但应该添加（来自最佳实践）
        missingPractices.push(practice);
      } else if (comparison.shouldAdd && comparison.needsConfirmation) {
        // 项目部分使用，需要用户确认
        ambiguousPractices.push(practice);
      } else if (!comparison.inRules && comparison.projectUses) {
        // 项目已使用，但未在规则中声明
        missingPractices.push(practice);
      }

      // 生成建议（如果项目未使用但应该使用）
      if (!comparison.projectUses && !comparison.inRules && comparison.shouldAdd) {
        suggestions.push(this.createSuggestion(practice, comparison));
      }
    }

    logger.info(`对比完成`, {
      total: practices.length,
      missing: missingPractices.length,
      ambiguous: ambiguousPractices.length,
      suggestions: suggestions.length
    });

    return {
      comparisons,
      suggestions,
      missingPractices,
      ambiguousPractices
    };
  }

  /**
   * 对比单个最佳实践
   */
  private async compareSinglePractice(
    practice: ExtractedBestPractice,
    context: RuleGenerationContext
  ): Promise<BestPracticeComparison & { needsConfirmation: boolean; usagePercentage: number }> {
    // 检查项目是否使用该实践
    const usage = await this.checkProjectUsage(practice, context);
    
    const inRules = this.checkInRules(practice, context);
    
    // 判断是否应该添加
    const shouldAdd = this.shouldAddPractice(practice, usage);
    
    // 判断是否需要用户确认
    const needsConfirmation = this.needsConfirmation(usage, practice.category);

    return {
      projectUses: usage.projectUses,
      inRules,
      shouldAdd,
      practice,
      needsConfirmation: usage.needsConfirmation,
      usagePercentage: usage.usagePercentage
    };
  }

  /**
   * 检查项目是否使用该实践
   */
  private async checkProjectUsage(
    practice: ExtractedBestPractice,
    context: RuleGenerationContext
  ): Promise<PracticeUsage> {
    const category = practice.category;
    let projectUses = false;
    let usagePercentage = 0;
    let needsConfirmation = false;

    // 根据类别使用不同的检查方法
    switch (category) {
      case 'code-style':
        const codeStyleUsage = await this.checkCodeStyleUsage(practice, context);
        projectUses = codeStyleUsage.projectUses;
        usagePercentage = codeStyleUsage.percentage;
        needsConfirmation = codeStyleUsage.needsConfirmation;
        break;

      case 'error-handling':
        const errorUsage = await this.checkErrorHandlingUsage(practice, context);
        projectUses = errorUsage.projectUses;
        usagePercentage = errorUsage.percentage;
        needsConfirmation = errorUsage.needsConfirmation;
        break;

      case 'component':
        const componentUsage = await this.checkComponentUsage(practice, context);
        projectUses = componentUsage.projectUses;
        usagePercentage = componentUsage.percentage;
        needsConfirmation = componentUsage.needsConfirmation;
        break;

      case 'architecture':
        const archUsage = await this.checkArchitectureUsage(practice, context);
        projectUses = archUsage.projectUses;
        usagePercentage = archUsage.percentage;
        needsConfirmation = archUsage.needsConfirmation;
        break;

      default:
        // 通用检查：搜索关键词
        const genericUsage = await this.checkGenericUsage(practice, context);
        projectUses = genericUsage.projectUses;
        usagePercentage = genericUsage.percentage;
        needsConfirmation = genericUsage.needsConfirmation;
    }

    return {
      practice,
      projectUses,
      usagePercentage,
      needsConfirmation,
      shouldAdd: this.shouldAddPractice(practice, { projectUses, usagePercentage, needsConfirmation })
    };
  }

  /**
   * 检查代码风格使用情况
   */
  private async checkCodeStyleUsage(
    practice: ExtractedBestPractice,
    context: RuleGenerationContext
  ): Promise<{ projectUses: boolean; percentage: number; needsConfirmation: boolean }> {
    if (!context.projectPractice?.codeStyle) {
      return { projectUses: false, percentage: 0, needsConfirmation: false };
    }

    const codeStyle = context.projectPractice.codeStyle as CodeStylePattern;
    const practiceLower = practice.content.toLowerCase();
    let percentage = 0;
    let needsConfirmation = false;

    // 检查变量声明
    if (practiceLower.includes('const') || practiceLower.includes('let')) {
      if (codeStyle.variableDeclaration === 'const-let') {
        percentage = 1.0;
      } else if (codeStyle.variableDeclaration === 'mixed') {
        percentage = 0.5;
        needsConfirmation = true;
      }
    }

    // 检查函数风格
    if (practiceLower.includes('arrow function') || practiceLower.includes('=>')) {
      if (codeStyle.functionStyle === 'arrow') {
        percentage = 1.0;
      } else if (codeStyle.functionStyle === 'mixed') {
        percentage = 0.5;
        needsConfirmation = true;
      }
    }

    // 检查引号
    if (practiceLower.includes('single quote') || practiceLower.includes("'")) {
      if (codeStyle.stringQuote === 'single') {
        percentage = 1.0;
      } else if (codeStyle.stringQuote === 'mixed') {
        percentage = 0.5;
        needsConfirmation = true;
      }
    }

    const threshold = THRESHOLD_CONFIG['code-style'];
    const projectUses = percentage >= threshold.default;
    if (!projectUses && percentage >= threshold.confirm) {
      needsConfirmation = true;
    }

    return { projectUses, percentage, needsConfirmation };
  }

  /**
   * 检查错误处理使用情况
   */
  private async checkErrorHandlingUsage(
    practice: ExtractedBestPractice,
    context: RuleGenerationContext
  ): Promise<{ projectUses: boolean; percentage: number; needsConfirmation: boolean }> {
    if (!context.projectPractice?.errorHandling) {
      return { projectUses: false, percentage: 0, needsConfirmation: false };
    }

    const errorHandling = context.projectPractice.errorHandling as ErrorHandlingPattern;
    const practiceLower = practice.content.toLowerCase();
    let percentage = 0;

    // 检查错误处理类型
    if (practiceLower.includes('try-catch') || practiceLower.includes('try catch')) {
      if (errorHandling.type === 'try-catch') {
        percentage = 1.0;
      } else if (errorHandling.type === 'promise-catch') {
        percentage = 0.3; // 部分相关
      }
    }

    if (practiceLower.includes('promise.catch') || practiceLower.includes('.catch()')) {
      if (errorHandling.type === 'promise-catch') {
        percentage = 1.0;
      } else if (errorHandling.type === 'try-catch') {
        percentage = 0.3;
      }
    }

    // 检查自定义错误类型
    if (practiceLower.includes('custom error') || practiceLower.includes('error class')) {
      if (errorHandling.customErrorTypes.length > 0) {
        percentage = 1.0;
      }
    }

    const threshold = THRESHOLD_CONFIG['error-handling'];
    const projectUses = percentage >= threshold.default;
    const needsConfirmation = percentage >= threshold.confirm && percentage < threshold.default;

    return { projectUses, percentage, needsConfirmation };
  }

  /**
   * 检查组件使用情况
   */
  private async checkComponentUsage(
    practice: ExtractedBestPractice,
    context: RuleGenerationContext
  ): Promise<{ projectUses: boolean; percentage: number; needsConfirmation: boolean }> {
    if (!context.projectPractice?.componentPattern) {
      return { projectUses: false, percentage: 0, needsConfirmation: false };
    }

    const component = context.projectPractice.componentPattern as ComponentPattern;
    const practiceLower = practice.content.toLowerCase();
    let percentage = 0;

    // 检查组件类型
    if (practiceLower.includes('functional component') || practiceLower.includes('function component')) {
      if (component.type === 'functional') {
        percentage = 1.0;
      } else if (component.type === 'mixed') {
        percentage = 0.5;
      }
    }

    // 检查状态管理
    for (const stateMgmt of component.stateManagement) {
      if (practiceLower.includes(stateMgmt.toLowerCase())) {
        percentage = Math.max(percentage, 0.8);
      }
    }

    const threshold = THRESHOLD_CONFIG['component'];
    const projectUses = percentage >= threshold.default;
    const needsConfirmation = percentage >= threshold.confirm && percentage < threshold.default;

    return { projectUses, percentage, needsConfirmation };
  }

  /**
   * 检查架构使用情况
   */
  private async checkArchitectureUsage(
    practice: ExtractedBestPractice,
    context: RuleGenerationContext
  ): Promise<{ projectUses: boolean; percentage: number; needsConfirmation: boolean }> {
    // 通过文件结构分析
    const practiceLower = practice.content.toLowerCase();
    let percentage = 0;

    // 检查文件组织方式（需要分析文件结构）
    if (practiceLower.includes('feature-based') || practiceLower.includes('feature based')) {
      // 检查是否有按功能组织的目录结构
      const fileOrg = context.fileOrganization;
      if (fileOrg?.structure) {
        const hasFeatureBased = fileOrg.structure.some(
          (s) => s.purpose === 'feature' || s.purpose === 'module'
        );
        if (hasFeatureBased) {
          percentage = 0.7;
        }
      }
    }

    const threshold = THRESHOLD_CONFIG['architecture'];
    const projectUses = percentage >= threshold.default;
    const needsConfirmation = percentage >= threshold.confirm && percentage < threshold.default;

    return { projectUses, percentage, needsConfirmation };
  }

  /**
   * 通用检查（搜索关键词）
   */
  private async checkGenericUsage(
    practice: ExtractedBestPractice,
    context: RuleGenerationContext
  ): Promise<{ projectUses: boolean; percentage: number; needsConfirmation: boolean }> {
    // 在项目文件中搜索关键词
    const keywords = this.extractKeywords(practice.content);
    let matchCount = 0;
    let totalFiles = 0;

    // 需要从项目路径收集文件
    const projectFiles = await FileUtils.collectFiles(context.projectPath);
    const codeFiles = projectFiles.filter(f => 
      /\.(ts|tsx|js|jsx|py)$/.test(f)
    ).slice(0, 50); // 限制检查文件数量

    for (const file of codeFiles) {
      try {
        const content = await FileUtils.readFile(file);
        const contentLower = content.toLowerCase();
        
        for (const keyword of keywords) {
          if (contentLower.includes(keyword.toLowerCase())) {
            matchCount++;
            break; // 每个文件只计数一次
          }
        }
        totalFiles++;
      } catch (error) {
        // 忽略读取错误
      }
    }

    const percentage = totalFiles > 0 ? matchCount / totalFiles : 0;
    const threshold = THRESHOLD_CONFIG[practice.category as keyof typeof THRESHOLD_CONFIG] || THRESHOLD_CONFIG.default;
    
    const projectUses = percentage >= threshold.default;
    const needsConfirmation = percentage >= threshold.confirm && percentage < threshold.default;

    return { projectUses, percentage, needsConfirmation };
  }

  /**
   * 提取关键词
   */
  private extractKeywords(content: string): string[] {
    // 提取技术栈名称、API 名称等
    const keywords: string[] = [];
    
    // 提取技术栈（React, Vue, Next.js 等）
    const techStackRegex = /\b(React|Vue|Angular|Next\.js|TypeScript|JavaScript|Node\.js|Express|Tailwind|CSS|HTML)\b/gi;
    const techMatches = content.match(techStackRegex);
    if (techMatches) {
      keywords.push(...techMatches.map(m => m.toLowerCase()));
    }

    // 提取 API 名称（useState, useEffect 等）
    const apiRegex = /\b(use[A-Z]\w+|create[A-Z]\w+|get[A-Z]\w+)\b/g;
    const apiMatches = content.match(apiRegex);
    if (apiMatches) {
      keywords.push(...apiMatches);
    }

    // 提取常见模式（try-catch, async-await 等）
    if (content.includes('try-catch') || content.includes('try catch')) {
      keywords.push('try', 'catch');
    }
    if (content.includes('async-await') || content.includes('async await')) {
      keywords.push('async', 'await');
    }

    return Array.from(new Set(keywords)); // 去重
  }

  /**
   * 检查实践是否已在已有规则文件中声明。
   *
   * 当前总返回 false：规则在比较阶段尚未生成，无法反向检查。
   * 后续若引入增量生成（只补缺失规则），可在此对接已有 .mdc 内容。
   */
  private checkInRules(
    _practice: ExtractedBestPractice,
    _context: RuleGenerationContext
  ): boolean {
    return false;
  }

  /**
   * 判断是否应该添加该实践
   */
  private shouldAddPractice(
    practice: ExtractedBestPractice,
    usage: { projectUses: boolean; usagePercentage: number; needsConfirmation: boolean }
  ): boolean {
    // 如果项目已使用，应该添加
    if (usage.projectUses) {
      return true;
    }

    // 如果优先级高，即使项目未使用也应该建议
    if (practice.priority === 'high') {
      return true;
    }

    // 如果使用率在确认范围内，也应该添加（但需要用户确认）
    if (usage.needsConfirmation) {
      return true;
    }

    return false;
  }

  /**
   * 判断是否需要用户确认
   */
  private needsConfirmation(
    usage: { usagePercentage: number },
    category: string
  ): boolean {
    const threshold = THRESHOLD_CONFIG[category as keyof typeof THRESHOLD_CONFIG] || THRESHOLD_CONFIG.default;
    return usage.usagePercentage >= threshold.confirm && usage.usagePercentage < threshold.default;
  }

  /**
   * 创建建议
   */
  private createSuggestion(
    practice: ExtractedBestPractice,
    comparison: BestPracticeComparison & { needsConfirmation: boolean; usagePercentage: number }
  ): Suggestion {
    return {
      type: practice.category as Suggestion['type'],
      priority: practice.priority,
      title: practice.title,
      content: practice.content,
      reason: comparison.projectUses
        ? '项目已使用此实践，但未在规则中声明'
        : '来自匹配框架的最佳实践，建议采用',
      impact: this.determineImpact(practice)
    };
  }

  /**
   * 确定影响范围
   */
  private determineImpact(practice: ExtractedBestPractice): 'global' | 'module' | 'file' {
    const contentLower = practice.content.toLowerCase();
    
    if (contentLower.includes('project') || contentLower.includes('global') || contentLower.includes('architecture')) {
      return 'global';
    }
    if (contentLower.includes('module') || contentLower.includes('component') || contentLower.includes('feature')) {
      return 'module';
    }
    return 'file';
  }
}

