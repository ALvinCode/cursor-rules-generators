import * as path from 'path';
import { readFile, writeFile } from 'fs/promises';
import { logger } from '../../utils/logger.js';

/**
 * Markdownlint 验证和修复工具
 * 使用 markdownlint 和 markdownlint-cli2 进行验证和自动修复
 */
export class MarkdownlintValidator {
  private static configPath: string | null = null;

  /**
   * 初始化配置路径
   */
  static initializeConfigPath(projectRoot: string): void {
    // 查找 .markdownlint.json 或 .markdownlint.yaml 配置文件
    const possibleConfigs = [
      path.join(projectRoot, '.markdownlint.json'),
      path.join(projectRoot, '.markdownlint.yaml'),
      path.join(projectRoot, '.markdownlint.yml'),
    ];

    // 尝试找到配置文件
    for (const configPath of possibleConfigs) {
      try {
        const fs = require('fs');
        if (fs.existsSync(configPath)) {
          this.configPath = configPath;
          logger.debug(`找到 markdownlint 配置文件: ${configPath}`);
          return;
        }
      } catch {
        // 忽略错误
      }
    }

    // 如果没有找到，使用默认配置（项目根目录的 .markdownlint.json）
    this.configPath = path.join(projectRoot, '.markdownlint.json');
    logger.debug(`使用默认 markdownlint 配置路径: ${this.configPath}`);
  }

  /**
   * 验证 markdown 内容
   * @param content markdown 内容
   * @param filePath 文件路径（用于错误报告）
   * @returns 验证结果和错误列表
   */
  static async validateContent(
    content: string,
    filePath?: string
  ): Promise<{
    valid: boolean;
    errors: Array<{
      line: number;
      column: number;
      rule: string;
      description: string;
    }>;
    skipped?: boolean;
  }> {
    let markdownlint: typeof import('markdownlint/promise');
    try {
      markdownlint = await import('markdownlint/promise');
    } catch (error) {
      logger.warn(
        `markdownlint module unavailable; skipping validation: ${error instanceof Error ? error.message : String(error)}`
      );
      return { valid: true, errors: [], skipped: true };
    }

    try {
      const options: Parameters<typeof markdownlint.lint>[0] = {
        strings: {
          [filePath || 'content.md']: content,
        },
      };

      // 如果有配置文件，加载配置
      if (this.configPath) {
        try {
          const fs = await import('fs/promises');
          const configContent = await fs.readFile(this.configPath, 'utf-8');
          if (this.configPath.endsWith('.json')) {
            options.config = JSON.parse(configContent);
          } else {
            const yaml = await import('yaml');
            options.config = yaml.parse(configContent);
          }
        } catch (error) {
          logger.warn(`无法加载 markdownlint 配置: ${error}`);
          options.config = {};
        }
      }

      const results = await markdownlint.lint(options);
      const fileResults = results[filePath || 'content.md'] || [];

      const errors = fileResults.map((error) => ({
        line: error.lineNumber,
        column: (error as { columnNumber?: number }).columnNumber || 1,
        rule: Array.isArray(error.ruleNames) ? error.ruleNames[0] || 'unknown' : 'unknown',
        description: error.ruleDescription || (Array.isArray(error.ruleNames) ? error.ruleNames.join('/') : 'Unknown error'),
      }));

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      logger.error(
        `Markdownlint validation execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return { valid: false, errors: [], skipped: true };
    }
  }

  /**
   * 使用 markdownlint-cli2 修复文件
   * @param filePath 文件路径
   * @returns 是否成功修复
   */
  static async fixFile(filePath: string): Promise<boolean> {
    try {
      // 读取文件内容
      const content = await readFile(filePath, 'utf-8');

      // 先验证
      const validation = await this.validateContent(content, filePath);

      // markdownlint 模块不可用或执行失败时跳过修复，避免误写盘
      if (validation.skipped) {
        logger.debug(`markdownlint 验证已跳过，不执行修复: ${filePath}`);
        return true;
      }

      if (validation.valid) {
        logger.debug(`文件已符合 markdownlint 规范: ${filePath}`);
        return true;
      }

      // 尝试使用 markdownlint-cli2 修复
      // 注意：markdownlint-cli2 主要通过命令行使用，我们需要手动修复
      // 或者使用 markdownlint 的修复功能（如果可用）
      
      // 由于 markdownlint 本身不提供自动修复功能，
      // 我们使用 MarkdownFormatter 进行基本修复
      const { MarkdownFormatter } = await import('../core/markdown-formatter.js');
      const fixedContent = MarkdownFormatter.format(content);

      // 再次验证修复后的内容
      const revalidation = await this.validateContent(fixedContent, filePath);
      
      if (revalidation.valid || revalidation.errors.length < validation.errors.length) {
        // 如果修复成功或错误减少，写入修复后的内容
        await writeFile(filePath, fixedContent, 'utf-8');
        logger.debug(`已修复 markdownlint 错误: ${filePath}`, {
          originalErrors: validation.errors.length,
          remainingErrors: revalidation.errors.length,
        });
        return revalidation.valid;
      }

      // 如果还有错误，记录警告
      if (revalidation.errors.length > 0) {
        logger.warn(`文件仍有 markdownlint 错误: ${filePath}`, {
          errors: revalidation.errors.map(e => `${e.rule}: ${e.description} (line ${e.line})`),
        });
      }

      return false;
    } catch (error) {
      logger.error(`修复 markdownlint 错误失败: ${filePath}`, { error });
      return false;
    }
  }

  /**
   * 验证并修复 markdown 内容
   * @param content 原始内容
   * @param filePath 文件路径（可选，用于错误报告）
   * @returns 修复后的内容和验证结果
   */
  static async validateAndFix(
    content: string,
    filePath?: string
  ): Promise<{
    content: string;
    valid: boolean;
    errors: Array<{
      line: number;
      column: number;
      rule: string;
      description: string;
    }>;
  }> {
    // 先使用 MarkdownFormatter 进行基本修复
    const { MarkdownFormatter } = await import('../core/markdown-formatter.js');
    let fixedContent = MarkdownFormatter.format(content);

    // 验证修复后的内容
    const validation = await this.validateContent(fixedContent, filePath);

    // 如果还有错误，尝试进一步修复
    if (!validation.valid && validation.errors.length > 0) {
      // 记录无法自动修复的错误
      const autoFixableRules = ['MD012', 'MD040', 'MD022', 'MD031', 'MD032'];
      const remainingErrors = validation.errors.filter(
        (e) => !autoFixableRules.includes(e.rule)
      );

      if (remainingErrors.length > 0) {
        logger.warn(`部分 markdownlint 错误无法自动修复`, {
          file: filePath,
          errors: remainingErrors.map(
            (e) => `${e.rule}: ${e.description} (line ${e.line})`
          ),
        });
      }
    }

    return {
      content: fixedContent,
      valid: validation.valid,
      errors: validation.errors,
    };
  }
}

