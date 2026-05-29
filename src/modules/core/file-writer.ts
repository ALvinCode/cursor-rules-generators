import * as path from 'path';

import { CursorRule, FileOrganizationInfo } from '../../types.js';
import { FileUtils } from '../../utils/file-utils.js';
import { logger } from '../../utils/logger.js';
import { GenerationCoordinator, LocationConfirmation } from './generation-coordinator.js';
import { MarkdownFormatter } from './markdown-formatter.js';
import { MarkdownlintValidator } from '../validators/markdownlint-validator.js';

/**
 * 文件写入器
 * 负责将生成的规则写入 .cursor/rules/ 目录
 * v1.7: 增强位置确认机制
 */
export class FileWriter {
  private coordinator: GenerationCoordinator;

  constructor() {
    this.coordinator = new GenerationCoordinator();
  }

  /**
   * 写入规则文件（增强版，带位置确认和 markdownlint 验证）
   */
  async writeRules(
    projectPath: string,
    rules: CursorRule[],
    fileOrganization?: FileOrganizationInfo
  ): Promise<{
    writtenFiles: string[];
    confirmations: LocationConfirmation[];
  }> {
    const writtenFiles: string[] = [];
    const confirmations: LocationConfirmation[] = [];

    // 初始化 markdownlint 配置路径
    MarkdownlintValidator.initializeConfigPath(projectPath);

    // 写入每个规则文件
    for (const rule of rules) {
      try {
        // 验证规则对象完整性
        if (!rule.fileName || !rule.content) {
          logger.error(`规则对象不完整，跳过: ${rule.fileName || "未知文件名"}`, {
            hasFileName: !!rule.fileName,
            hasContent: !!rule.content,
          });
          continue;
        }

      // 确认生成位置
      const confirmation = await this.coordinator.confirmGenerationLocation(
        projectPath,
        rule,
        fileOrganization
      );
      confirmations.push(confirmation);

      // 如果需要确认，记录警告但继续生成（规则文件位置通常是确定的）
      if (confirmation.needsConfirmation) {
        logger.warn(`生成位置需要确认: ${confirmation.targetPath}`, {
          reason: confirmation.reason,
          alternatives: confirmation.suggestedAlternatives,
        });
      }

      // 根据规则的 scope 和 modulePath 确定写入位置
      const baseDir = rule.modulePath || projectPath;
      const rulesDir = path.join(baseDir, ".cursor", "rules");

      // 写入规则文件（FileUtils.writeFile 会自动创建目录）
      const filePath = path.join(rulesDir, rule.fileName);
      
      // 1. 先使用 MarkdownFormatter 进行基本格式化
      let formattedContent = MarkdownFormatter.format(rule.content);
      
      // 2. 使用 markdownlint 验证并修复
      const validationResult = await MarkdownlintValidator.validateAndFix(
        formattedContent,
        filePath
      );
      formattedContent = validationResult.content;

      // 3. 写入文件
      await FileUtils.writeFile(filePath, formattedContent);

      // 4. 再次验证写入后的文件（确保文件系统写入正确）
      const finalValidation = await MarkdownlintValidator.fixFile(filePath);

      // 计算相对于项目根目录的路径用于显示
      const relativePath = path.relative(projectPath, filePath);
      writtenFiles.push(relativePath);

      if (validationResult.valid && finalValidation) {
        logger.debug(`已写入规则文件（符合 markdownlint 规范）: ${relativePath}`);
      } else if (validationResult.errors.length > 0) {
        logger.warn(`规则文件存在 markdownlint 警告: ${relativePath}`, {
          errors: validationResult.errors.map(
            (e) => `${e.rule}: ${e.description} (line ${e.line})`
          ),
        });
        }
      } catch (error) {
        logger.error(`写入规则文件失败: ${rule.fileName || "未知文件"}`, error);
        // 继续处理下一个文件，不中断整个流程
        // 记录错误但继续执行
      }
    }

    return { writtenFiles, confirmations };
  }

  /**
   * 清理旧的规则文件
   * 清理项目根目录和所有模块目录的规则
   */
  async cleanOldRules(
    projectPath: string,
    modulePaths?: string[]
  ): Promise<void> {
    const pathsToClean = [projectPath];

    // 添加所有模块路径
    if (modulePaths && modulePaths.length > 0) {
      pathsToClean.push(...modulePaths);
    }

    for (const basePath of pathsToClean) {
      const rulesDir = path.join(basePath, ".cursor", "rules");

      try {
        const fs = await import("fs/promises");
        const files = await fs.readdir(rulesDir);

        for (const file of files) {
          if (file.endsWith(".mdc") || file.endsWith(".md")) {
            const filePath = path.join(rulesDir, file);
            await fs.unlink(filePath);
            logger.debug(
              `已删除旧规则文件: ${path.relative(projectPath, filePath)}`
            );
          }
        }
      } catch (error) {
        // 目录不存在或其他错误，忽略
      }
    }
  }
}
