import * as path from "path";
import { FileUtils } from "../../utils/file-utils.js";
import {
  ConsistencyReport,
  Inconsistency,
  TechStack,
  CodeFeature,
} from '../../types.js';

/**
 * 一致性检查器
 * 比较项目描述文档与实际代码实现的一致性
 */
export class ConsistencyChecker {
  async check(
    projectPath: string,
    files: string[],
    techStack: TechStack,
    codeFeatures: Record<string, CodeFeature>
  ): Promise<ConsistencyReport> {
    const inconsistencies: Inconsistency[] = [];
    const checkedFiles: string[] = [];

    // 检查 README.md
    const readmePath = path.join(projectPath, "README.md");
    if (await FileUtils.fileExists(readmePath)) {
      checkedFiles.push("README.md");
      const readmeInconsistencies = await this.checkReadme(
        readmePath,
        techStack,
        codeFeatures
      );
      inconsistencies.push(...readmeInconsistencies);
    }

    // 检查 package.json 描述
    const packageJsonPath = path.join(projectPath, "package.json");
    if (await FileUtils.fileExists(packageJsonPath)) {
      checkedFiles.push("package.json");
      const packageInconsistencies = await this.checkPackageJson(
        packageJsonPath,
        techStack
      );
      inconsistencies.push(...packageInconsistencies);
    }

    return {
      hasInconsistencies: inconsistencies.length > 0,
      inconsistencies,
      checkedFiles,
    };
  }

  /**
   * 检查 README 与实际实现的一致性
   */
  private async checkReadme(
    readmePath: string,
    techStack: TechStack,
    codeFeatures: Record<string, CodeFeature>
  ): Promise<Inconsistency[]> {
    const inconsistencies: Inconsistency[] = [];
    const content = await FileUtils.readFile(readmePath);
    const contentLower = content.toLowerCase();

    // 检查技术栈是否在 README 中提及
    for (const tech of techStack.primary) {
      if (!contentLower.includes(tech.toLowerCase())) {
        inconsistencies.push({
          type: "missing-doc",
          description: `README 中未提及主要技术栈: ${tech}`,
          actualValue: tech,
          severity: "medium",
          suggestedFix: `在 README 的技术栈部分添加 ${tech}`,
        });
      }
    }

    // 检查主要功能是否有文档
    const importantFeatures = Object.values(codeFeatures).filter(
      (f) => f.frequency > 5
    );

    for (const feature of importantFeatures) {
      const featureKeywords = this.getFeatureKeywords(feature.type);
      const hasMention = featureKeywords.some((kw) =>
        contentLower.includes(kw.toLowerCase())
      );

      if (!hasMention) {
        inconsistencies.push({
          type: "missing-doc",
          description: `README 中未描述重要功能: ${feature.description}`,
          actualValue: feature.description,
          severity: "low",
          suggestedFix: `在 README 的功能描述部分添加 ${feature.description}`,
        });
      }
    }

    // 检查是否有过时的技术栈描述
    const commonTechs = [
      "react",
      "vue",
      "angular",
      "next",
      "nuxt",
      "express",
      "fastify",
      "django",
      "flask",
    ];

    for (const tech of commonTechs) {
      if (contentLower.includes(tech)) {
        const isUsed = techStack.dependencies.some((d) =>
          d.name.toLowerCase().includes(tech)
        );

        if (!isUsed) {
          inconsistencies.push({
            type: "outdated-doc",
            description: `README 提及了 ${tech}，但项目中未使用`,
            actualValue: "未使用",
            documentedValue: tech,
            severity: "medium",
            suggestedFix: `从 README 中移除 ${tech} 的相关描述`,
          });
        }
      }
    }

    return inconsistencies;
  }

  /**
   * 检查 package.json 描述
   */
  private async checkPackageJson(
    packageJsonPath: string,
    techStack: TechStack
  ): Promise<Inconsistency[]> {
    const inconsistencies: Inconsistency[] = [];
    const content = await FileUtils.readFile(packageJsonPath);
    const data = JSON.parse(content);

    // 检查是否有描述
    if (!data.description || data.description.trim() === "") {
      inconsistencies.push({
        type: "missing-doc",
        description: "package.json 缺少项目描述",
        actualValue: "",
        severity: "low",
        suggestedFix: "在 package.json 中添加有意义的 description 字段",
      });
    }

    // 检查是否有仓库信息
    if (!data.repository) {
      inconsistencies.push({
        type: "missing-doc",
        description: "package.json 缺少仓库信息",
        actualValue: "",
        severity: "low",
        suggestedFix: "在 package.json 中添加 repository 字段",
      });
    }

    return inconsistencies;
  }

  /**
   * 获取功能类型的关键词
   */
  private getFeatureKeywords(featureType: string): string[] {
    const keywords: Record<string, string[]> = {
      "custom-components": ["component", "组件", "ui"],
      "api-routes": ["api", "route", "endpoint", "接口"],
      "state-management": ["state", "状态管理", "redux", "vuex", "pinia"],
      "data-processing": ["util", "helper", "工具", "处理"],
      "styling": ["style", "样式", "css", "theme"],
      "testing": ["test", "测试", "spec"],
      "database": ["database", "数据库", "model", "schema"],
    };

    return keywords[featureType] || [];
  }

  /**
   * 更新描述文档。
   *
   * @param projectPath 项目根目录
   * @param report 一致性报告
   * @param descriptionFile 可选；当指定时仅更新该文件（README.md 或 package.json）。
   *   默认（未指定）更新所有相关文件。
   */
  async updateDescriptions(
    projectPath: string,
    report: ConsistencyReport,
    descriptionFile?: string
  ): Promise<void> {
    // 收集需要更新的内容
    const updates = new Map<string, string[]>();

    for (const inc of report.inconsistencies) {
      if (inc.type === "missing-doc" && inc.suggestedFix) {
        const file = inc.suggestedFix.includes("README") ? "README.md" : "package.json";
        if (!updates.has(file)) {
          updates.set(file, []);
        }
        updates.get(file)!.push(inc.description);
      }
    }

    // 如果指定了 descriptionFile，则把范围缩小到该文件。
    const targetFile = descriptionFile?.trim();
    const shouldUpdate = (file: string): boolean => {
      if (!targetFile) return true;
      return file === targetFile || targetFile.endsWith(file);
    };

    if (updates.has("README.md") && shouldUpdate("README.md")) {
      await this.updateReadme(projectPath, updates.get("README.md")!);
    }

    if (updates.has("package.json") && shouldUpdate("package.json")) {
      await this.updatePackageJson(projectPath, updates.get("package.json")!);
    }
  }

  /**
   * 更新 README
   */
  private async updateReadme(
    projectPath: string,
    updates: string[]
  ): Promise<void> {
    const readmePath = path.join(projectPath, "README.md");
    let content = await FileUtils.readFile(readmePath);

    // 添加一个更新说明部分
    const updateSection = `

## 📝 自动更新说明

以下内容由 Cursor Rules Generators 自动添加：

${updates.map((u) => `- ${u}`).join("\n")}

---

`;

    // 在文件末尾添加更新说明
    content += updateSection;

    await FileUtils.writeFile(readmePath, content);
  }

  /**
   * 更新 package.json
   */
  private async updatePackageJson(
    projectPath: string,
    updates: string[]
  ): Promise<void> {
    const packageJsonPath = path.join(projectPath, "package.json");
    const content = await FileUtils.readFile(packageJsonPath);
    const data = JSON.parse(content);

    // 如果缺少描述，添加一个基础描述
    if (!data.description || data.description.trim() === "") {
      data.description = "A project generated with Cursor Rules Generators";
    }

    // 保存更新后的内容
    await FileUtils.writeFile(
      packageJsonPath,
      JSON.stringify(data, null, 2) + "\n"
    );
  }
}

