import { FileUtils } from "../../utils/file-utils.js";
import { logger } from "../../utils/logger.js";

/**
 * 项目分析器
 * 负责收集项目文件和基础信息
 */
export class ProjectAnalyzer {
  /**
   * 收集项目中所有有用的文件
   */
  async collectFiles(projectPath: string): Promise<string[]> {
    logger.debug(`开始扫描项目: ${projectPath}`);
    const files = await FileUtils.collectFiles(projectPath, 10);
    logger.debug(`扫描完成，共发现 ${files.length} 个有用文件`);
    return files;
  }
}

