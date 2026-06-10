/**
 * 最佳实践提取器
 * 从 awesome-cursorrules 规则文件中提取最佳实践
 */

import { FileUtils } from "../../utils/file-utils.js";
import { logger } from "../../utils/logger.js";
import { resolvePackageResource } from "../../utils/package-paths.js";
import * as path from "path";
import { FrameworkMatch } from './framework-matcher.js';
import { TechStackMatch, MultiCategoryMatch } from './tech-stack-matcher.js';
import { TechStack } from '../../types.js';

export interface ExtractedBestPractice {
  category: string; // 'code-style' | 'architecture' | 'error-handling' | 'performance' | 'security' | 'testing'
  title: string;
  content: string;
  techStack: string[]; // 相关技术栈
  priority: 'high' | 'medium' | 'low';
}

export interface BestPracticeComparison {
  projectUses: boolean; // 项目是否已使用
  inRules: boolean; // 是否已在规则中声明
  shouldAdd: boolean; // 是否应该添加到规则中
  practice: ExtractedBestPractice;
}

/**
 * 从框架规则文件中提取最佳实践
 */
export class BestPracticeExtractor {
  private samplesDir: string;

  constructor() {
    // 样本目录在 npm 包内分发；必须从包根解析（不能用 process.cwd()，
    // 否则全局安装时会指向用户项目目录）。
    this.samplesDir = resolvePackageResource(
      "docs",
      "story",
      "awesome-cursorrules-samples"
    );
  }

  /**
   * 从匹配的框架规则文件中提取最佳实践（兼容旧接口）
   */
  async extractFromFrameworkMatch(
    frameworkMatch: FrameworkMatch | null,
    projectTechStack: TechStack
  ): Promise<ExtractedBestPractice[]> {
    if (!frameworkMatch || !frameworkMatch.sampleFile) {
      logger.debug("未找到匹配的框架规则文件");
      return [];
    }

    const practices: ExtractedBestPractice[] = [];
    const frameworkKey = frameworkMatch.framework;

    // 获取该框架的所有规则文件
    const frameworkFiles = this.getFrameworkFiles(frameworkKey);
    
    logger.info(`从 ${frameworkFiles.length} 个规则文件中提取最佳实践`, {
      framework: frameworkKey
    });

    for (const fileName of frameworkFiles) {
      const content = await this.readSampleFile(fileName);
      if (!content) continue;
      const extracted = this.parseBestPractices(content, projectTechStack);
      practices.push(...extracted);
    }

    // 去重（基于 title 和 category）
    const uniquePractices = this.deduplicatePractices(practices);

    logger.info(`提取了 ${uniquePractices.length} 个最佳实践`, {
      framework: frameworkKey
    });

    return uniquePractices;
  }

  /**
   * 读取样本文件，依次尝试 category 子目录 → root 目录 fallback。
   * 找不到时返回 null 并记录 debug 日志。
   */
  private async readSampleFile(fileName: string, category?: string): Promise<string | null> {
    const candidates: string[] = [];
    if (category && category !== "other") {
      candidates.push(path.join(this.samplesDir, category, fileName));
    }
    candidates.push(path.join(this.samplesDir, fileName));
    // framework-matcher 的文件通常在 frontend/ 子目录
    if (!category || category === "other") {
      candidates.push(path.join(this.samplesDir, "frontend", fileName));
    }

    for (const filePath of candidates) {
      try {
        if (await FileUtils.fileExists(filePath)) {
          return await FileUtils.readFile(filePath);
        }
      } catch {
        // 继续尝试下一个候选路径
      }
    }
    logger.debug(`样本文件未找到: ${fileName}`);
    return null;
  }

  /**
   * 从规则文件内容中解析最佳实践
   */
  private parseBestPractices(
    content: string,
    projectTechStack: TechStack,
    defaultCategory?: string
  ): ExtractedBestPractice[] {
    const practices: ExtractedBestPractice[] = [];

    // 提取主要章节
    const sections = this.extractSections(content);

    for (const section of sections) {
      const category = this.categorizeSection(section.title, defaultCategory);
      const techStack = this.extractTechStack(section.content, projectTechStack);
      
      // 提取该章节中的最佳实践点
      const practicePoints = this.extractPracticePoints(section.content);
      
      for (const point of practicePoints) {
        practices.push({
          category,
          title: point.title || section.title,
          content: point.content,
          techStack,
          priority: this.determinePriority(point.content, category)
        });
      }
    }

    return practices;
  }

  /**
   * 提取文档章节
   */
  private extractSections(content: string): Array<{ title: string; content: string }> {
    const sections: Array<{ title: string; content: string }> = [];
    
    // 匹配 Markdown 标题（# ## ###）
    const headingRegex = /^(#{1,3})\s+(.+)$/gm;
    let lastIndex = 0;
    let lastTitle = "Introduction";
    let lastLevel = 0;

    let match;
    while ((match = headingRegex.exec(content)) !== null) {
      const level = match[1].length;
      const title = match[2].trim();
      const startIndex = match.index;

      // 如果遇到同级或更高级的标题，保存前一个章节
      if (level <= lastLevel && lastIndex < startIndex) {
        const sectionContent = content.substring(lastIndex, startIndex).trim();
        if (sectionContent) {
          sections.push({
            title: lastTitle,
            content: sectionContent
          });
        }
      }

      lastIndex = startIndex + match[0].length;
      lastTitle = title;
      lastLevel = level;
    }

    // 添加最后一个章节
    if (lastIndex < content.length) {
      const sectionContent = content.substring(lastIndex).trim();
      if (sectionContent) {
        sections.push({
          title: lastTitle,
          content: sectionContent
        });
      }
    }

    return sections;
  }

  /**
   * 提取实践点（列表项、代码块说明等）
   */
  private extractPracticePoints(content: string): Array<{ title?: string; content: string }> {
    const points: Array<{ title?: string; content: string }> = [];

    // 提取列表项（- * 或数字列表）
    const listItemRegex = /^[\s]*[-*]\s+(.+)$/gm;
    let match;
    while ((match = listItemRegex.exec(content)) !== null) {
      const item = match[1].trim();
      if (item.length > 10) { // 过滤太短的项
        points.push({ content: item });
      }
    }

    // 提取代码块前的说明
    const codeBlockRegex = /```[\s\S]*?```/g;
    const codeBlocks = content.match(codeBlockRegex) || [];
    for (const block of codeBlocks) {
      const beforeBlock = content.substring(0, content.indexOf(block));
      const lastLine = beforeBlock.split('\n').filter(l => l.trim()).pop();
      if (lastLine && !lastLine.match(/^[\s]*[-*]/)) {
        points.push({ title: lastLine.trim(), content: block });
      }
    }

    // 如果没有提取到任何点，使用整个内容
    if (points.length === 0 && content.trim().length > 20) {
      points.push({ content: content.trim() });
    }

    return points;
  }

  /**
   * 对章节进行分类
   */
  private categorizeSection(title: string, defaultCategory?: string): string {
    const titleLower = title.toLowerCase();
    
    if (titleLower.includes('style') || titleLower.includes('format') || titleLower.includes('convention')) {
      return 'code-style';
    }
    if (titleLower.includes('architecture') || titleLower.includes('structure') || titleLower.includes('organization')) {
      return 'architecture';
    }
    if (titleLower.includes('error') || titleLower.includes('exception') || titleLower.includes('handling')) {
      return 'error-handling';
    }
    if (titleLower.includes('performance') || titleLower.includes('optimization') || titleLower.includes('speed')) {
      return 'performance';
    }
    if (titleLower.includes('security') || titleLower.includes('auth') || titleLower.includes('secure')) {
      return 'security';
    }
    if (titleLower.includes('test') || titleLower.includes('testing')) {
      return 'testing';
    }
    if (titleLower.includes('component') || titleLower.includes('ui') || titleLower.includes('react') || titleLower.includes('vue')) {
      return 'component';
    }
    if (titleLower.includes('routing') || titleLower.includes('route')) {
      return 'routing';
    }
    if (titleLower.includes('state') || titleLower.includes('store') || titleLower.includes('redux') || titleLower.includes('zustand')) {
      return 'state-management';
    }

    return defaultCategory ?? 'general';
  }

  /**
   * 从内容中提取相关技术栈
   */
  private extractTechStack(
    content: string,
    projectTechStack: TechStack
  ): string[] {
    const techStack: string[] = [];
    const allTech = [...new Set([
      ...projectTechStack.primary,
      ...projectTechStack.frameworks,
      ...projectTechStack.languages,
    ])];

    for (const tech of allTech) {
      if (content.toLowerCase().includes(tech.toLowerCase())) {
        techStack.push(tech);
      }
    }

    return techStack;
  }

  /**
   * 确定优先级
   */
  private determinePriority(content: string, category: string): 'high' | 'medium' | 'low' {
    const contentLower = content.toLowerCase();
    
    // 高优先级关键词
    if (
      contentLower.includes('must') ||
      contentLower.includes('required') ||
      contentLower.includes('always') ||
      contentLower.includes('never') ||
      contentLower.includes('critical') ||
      contentLower.includes('essential')
    ) {
      return 'high';
    }

    // 低优先级关键词
    if (
      contentLower.includes('optional') ||
      contentLower.includes('consider') ||
      contentLower.includes('suggest') ||
      contentLower.includes('recommend')
    ) {
      return 'low';
    }

    // 根据类别判断
    if (['security', 'error-handling'].includes(category)) {
      return 'high';
    }
    if (['performance', 'testing'].includes(category)) {
      return 'medium';
    }

    return 'medium';
  }

  /**
   * 获取框架的所有规则文件
   */
  private getFrameworkFiles(frameworkKey: string): string[] {
    // 根据 framework-matcher.ts 中的映射获取文件列表
    const frameworkMap: Record<string, string[]> = {
      'react-typescript': [
        'react-components-creation-cursorrules-prompt-file.cursorrules',
        'cursor-ai-react-typescript-shadcn-ui-cursorrules-p.cursorrules'
      ],
      'nextjs-typescript': [
        'nextjs-typescript-cursorrules-prompt-file.cursorrules',
        'nextjs-react-typescript-cursorrules-prompt-file.cursorrules',
        'nextjs-typescript-tailwind-cursorrules-prompt-file.cursorrules'
      ],
      'nextjs-app-router': [
        'nextjs-app-router-cursorrules-prompt-file.cursorrules',
        'cursorrules-cursor-ai-nextjs-14-tailwind-seo-setup.cursorrules'
      ],
      'nextjs-15-react-19': [
        'nextjs15-react19-vercelai-tailwind-cursorrules-prompt-file.cursorrules'
      ],
      'vue-typescript': [
        'vue3-composition-api-cursorrules-prompt-file.cursorrules'
      ],
      'angular-typescript': [
        'angular-typescript-cursorrules-prompt-file.cursorrules',
        'angular-novo-elements-cursorrules-prompt-file.cursorrules'
      ],
      'sveltekit-typescript': [
        'sveltekit-typescript-guide-cursorrules-prompt-file.cursorrules',
        'sveltekit-tailwindcss-typescript-cursorrules-promp.cursorrules'
      ],
      'typescript-react': [
        'typescript-react-cursorrules-prompt-file.cursorrules',
        'typescript-nextjs-react-cursorrules-prompt-file.cursorrules'
      ]
    };

    return frameworkMap[frameworkKey] || [];
  }

  /**
   * 去重最佳实践
   */
  private deduplicatePractices(
    practices: ExtractedBestPractice[]
  ): ExtractedBestPractice[] {
    const seen = new Map<string, ExtractedBestPractice>();

    for (const practice of practices) {
      const key = `${practice.category}:${practice.title}`;
      if (!seen.has(key)) {
        seen.set(key, practice);
      } else {
        // 如果已存在，合并内容（保留更详细的）
        const existing = seen.get(key)!;
        if (practice.content.length > existing.content.length) {
          seen.set(key, practice);
        }
      }
    }

    return Array.from(seen.values());
  }

  /**
   * 从多类别技术栈匹配中提取最佳实践（新接口）
   */
  async extractFromMultiCategoryMatch(
    multiMatch: MultiCategoryMatch,
    projectTechStack: TechStack
  ): Promise<ExtractedBestPractice[]> {
    if (!multiMatch || multiMatch.matches.length === 0) {
      logger.debug("未找到匹配的技术栈规则");
      return [];
    }

    const practices: ExtractedBestPractice[] = [];
    const processedFiles = new Set<string>();

    logger.info(`从 ${multiMatch.matches.length} 个匹配规则中提取最佳实践`, {
      categories: multiMatch.categories,
      primaryMatch: multiMatch.primaryMatch?.ruleName
    });

    for (const match of multiMatch.matches) {
      if (match.similarity < 0.2) continue;

      const sampleFile = match.sampleFile || "";
      if (processedFiles.has(sampleFile)) continue;

      const content = await this.readSampleFile(sampleFile, match.category);
      if (!content) continue;

      const extracted = this.parseBestPractices(content, projectTechStack, match.category);
      practices.push(...extracted);
      processedFiles.add(sampleFile);

      logger.debug(`从规则文件提取最佳实践`, {
        file: sampleFile,
        category: match.category,
        practices: extracted.length,
      });
    }

    // 去重（基于 title 和 category）
    const uniquePractices = this.deduplicatePractices(practices);
    
    logger.info(`提取完成`, {
      total: practices.length,
      unique: uniquePractices.length,
      categories: Array.from(new Set(uniquePractices.map(p => p.category)))
    });

    return uniquePractices;
  }
}

