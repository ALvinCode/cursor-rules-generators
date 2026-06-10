import * as path from 'path';

import {
  CursorRule,
  FileOrganizationInfo,
  RuleGenerationContext,
  GenerationSummary,
  GenerationExplanation,
} from '../../types.js';
import { FileUtils } from '../../utils/file-utils.js';
import { logger } from '../../utils/logger.js';
import { CodeGenerationRequirementsChecker, CodeGenerationRequirementsCheck } from './code-generation-requirements.js';

// 重新导出，保持既有从本模块导入这两类型的代码不变。
export type { GenerationSummary, GenerationExplanation };

/**
 * 生成位置确认结果
 */
export interface LocationConfirmation {
  needsConfirmation: boolean;
  targetPath: string;
  reason?: string;
  suggestedAlternatives?: string[];
  certainty: "certain" | "likely" | "uncertain";
}

/**
 * 生成协调器
 * 负责生成位置确认、上下文约束评估和生成说明
 */
export class GenerationCoordinator {
  private requirementsChecker: CodeGenerationRequirementsChecker;

  constructor() {
    this.requirementsChecker = new CodeGenerationRequirementsChecker();
  }
  /**
   * 确认生成位置
   * 检查目标位置是否明确，是否需要用户确认
   */
  async confirmGenerationLocation(
    projectPath: string,
    rule: CursorRule,
    fileOrganization?: FileOrganizationInfo
  ): Promise<LocationConfirmation> {
    const baseDir = rule.modulePath || projectPath;
    const rulesDir = path.join(baseDir, ".cursor", "rules");
    const targetPath = path.join(rulesDir, rule.fileName);

    // 检查目录是否存在
    const dirExists = await FileUtils.fileExists(rulesDir);

    // 检查文件是否已存在
    const fileExists = await FileUtils.fileExists(targetPath);

    // 对于规则文件，.cursor/rules 目录应该总是可以创建的
    if (!dirExists) {
      // 目录不存在，但可以创建（.cursor/rules 是标准位置）
      return {
        needsConfirmation: false,
        targetPath,
        certainty: "certain",
      };
    }

    // 检查是否符合项目结构规划
    if (fileOrganization) {
      const structureMatch = this.evaluateStructureMatch(
        rule,
        fileOrganization,
        projectPath
      );

      if (!structureMatch.matches && structureMatch.mismatches.length > 0) {
        const highSeverityMismatches = structureMatch.mismatches.filter(
          (m) => m.severity === "high"
        );

        if (highSeverityMismatches.length > 0) {
          const firstMismatch = highSeverityMismatches[0];
          return {
            needsConfirmation: true,
            targetPath,
            reason: `检测到结构不匹配：${firstMismatch.reason || "未知原因"}`,
            suggestedAlternatives: this.suggestAlternativeLocations(
              rule,
              fileOrganization,
              projectPath
            ),
            certainty: "uncertain",
          };
        }
      }
    }

    return {
      needsConfirmation: false,
      targetPath,
      certainty: "certain",
    };
  }

  /**
   * 评估结构匹配
   */
  private evaluateStructureMatch(
    rule: CursorRule,
    fileOrganization: FileOrganizationInfo,
    projectPath: string
  ): {
    matches: boolean;
    mismatches: Array<{
      type: string;
      reason: string;
      severity: "high" | "medium" | "low";
    }>;
  } {
    const mismatches: Array<{
      type: string;
      reason: string;
      severity: "high" | "medium" | "low";
    }> = [];

    // 规则文件总是放在 .cursor/rules，这是标准位置，不需要检查
    // 这里主要检查规则内容是否与项目结构匹配

    return {
      matches: mismatches.length === 0,
      mismatches,
    };
  }

  /**
   * 建议替代位置
   */
  private suggestAlternativeLocations(
    rule: CursorRule,
    fileOrganization: FileOrganizationInfo,
    projectPath: string
  ): string[] {
    const alternatives: string[] = [];
    const baseDir = rule.modulePath || projectPath;
    const defaultRulesDir = path.join(baseDir, ".cursor", "rules");
    alternatives.push(path.relative(projectPath, defaultRulesDir));

    return alternatives;
  }

  /**
   * 生成文件生成说明
   */
  generateExplanation(
    rule: CursorRule,
    projectPath: string,
    triggerCondition: string
  ): GenerationExplanation {
    const baseDir = rule.modulePath || projectPath;
    const rulesDir = path.join(baseDir, ".cursor", "rules");
    const filePath = path.join(rulesDir, rule.fileName);
    const relativePath = path.relative(projectPath, filePath);

    // 确定规则类型
    let type = "rule-definition";
    if (rule.type === "overview") type = "overview-rule";
    else if (rule.type === "guideline") type = "guideline-rule";
    else if (rule.type === "practice") type = "practice-rule";
    else if (rule.type === "reference") type = "reference-rule";

    // 确定源规则
    const sourceRule = rule.fileName.replace(".mdc", "");

    // 生成使用指导
    let usageGuidance = "";
    if (rule.scope === "global") {
      usageGuidance = `这是全局规则文件，可在任何地方通过 \`@${relativePath}\` 引用。`;
    } else if (rule.scope === "module") {
      usageGuidance = `这是模块特定规则，在 ${
        rule.moduleName || "模块"
      } 中通过 \`@${relativePath}\` 引用。`;
    } else {
      usageGuidance = `这是专题规则文件，通过 \`@${relativePath}\` 引用。`;
    }

    if (rule.depends && rule.depends.length > 0) {
      usageGuidance += ` 依赖规则：${rule.depends
        .map((d) => `@.cursor/rules/${d}.mdc`)
        .join(", ")}。`;
    }

    return {
      filePath: relativePath,
      type,
      sourceRule,
      triggerCondition,
      usageGuidance,
    };
  }

  /**
   * 生成完整的生成摘要
   */
  generateSummary(
    rules: CursorRule[],
    projectPath: string,
    fileOrganization?: FileOrganizationInfo,
    confirmations?: LocationConfirmation[]
  ): GenerationSummary {
    const filesGenerated = rules.map((rule) => {
      const explanation = this.generateExplanation(
        rule,
        projectPath,
        this.determineTriggerCondition(rule)
      );

      return {
        path: explanation.filePath,
        type: explanation.type,
        sourceRule: explanation.sourceRule,
        explanation,
      };
    });

    // 评估上下文
    const detectedStructure: string[] = [];
    if (fileOrganization) {
      if (fileOrganization.componentLocation.length > 0) {
        detectedStructure.push(
          `src/components (或 ${fileOrganization.componentLocation[0]})`
        );
      }
      if (fileOrganization.utilsLocation.length > 0) {
        detectedStructure.push(
          `src/utils (或 ${fileOrganization.utilsLocation[0]})`
        );
      }
      if (
        fileOrganization.typesLocation &&
        fileOrganization.typesLocation.length > 0
      ) {
        detectedStructure.push(
          `src/types (或 ${fileOrganization.typesLocation[0]})`
        );
      }
    } else {
      detectedStructure.push("未检测到特定目录结构");
    }

    const appliedStructureRule = "规则文件 → .cursor/rules/";

    // 检查是否需要确认
    const needsConfirmation =
      confirmations?.some((c) => c.needsConfirmation) || false;
    const confirmationsNeeded = confirmations
      ?.filter((c) => c.needsConfirmation)
      .map((c) => ({
        topic: `生成位置确认：${path.basename(c.targetPath)}`,
        currentPath: c.targetPath,
        reason: c.reason || "位置不明确",
        alternatives: c.suggestedAlternatives,
      }));

    // 生成用户指导
    const userGuidance: string[] = [];
    for (const rule of rules) {
      const explanation = this.generateExplanation(
        rule,
        projectPath,
        this.determineTriggerCondition(rule)
      );
      userGuidance.push(explanation.usageGuidance);
    }

    // 生成备注
    const notes: string[] = [];
    if (fileOrganization && fileOrganization.structure.length === 0) {
      notes.push("检测到项目结构较简单，生成的规则基于通用最佳实践。");
    }
    if (confirmationsNeeded && confirmationsNeeded.length > 0) {
      notes.push(
        `有 ${confirmationsNeeded.length} 个位置需要确认，请查看 confirmationsNeeded 字段。`
      );
    }

    return {
      status: needsConfirmation ? "needs-confirmation" : "success",
      filesGenerated,
      contextEvaluation: {
        detectedStructure,
        appliedStructureRule,
      },
      userGuidance,
      notes,
      confirmationsNeeded,
    };
  }

  /**
   * 确定触发条件
   */
  private determineTriggerCondition(rule: CursorRule): string {
    if (rule.fileName.includes("global-rules")) {
      return "检测到项目根目录，生成全局规则";
    }
    if (rule.fileName.includes("code-style")) {
      return "检测到代码风格配置文件（Prettier/ESLint）";
    }
    if (rule.fileName.includes("architecture")) {
      return "分析项目文件组织结构";
    }
    if (rule.fileName.includes("custom-tools")) {
      return "检测到自定义 Hooks 或工具函数";
    }
    if (rule.fileName.includes("error-handling")) {
      return "检测到错误处理模式";
    }
    if (rule.fileName.includes("routing")) {
      return "检测到路由系统";
    }
    if (rule.scope === "module") {
      return `检测到模块：${rule.moduleName || "未知"}`;
    }
    return "根据项目特征自动生成";
  }

  /**
   * 检查代码生成所需的信息（v1.7 新增）
   * 在生成代码前，明确需要哪些信息才能生成可直接使用的代码
   */
  async checkCodeGenerationRequirements(
    context: RuleGenerationContext,
    taskDescription?: string
  ) {
    return await this.requirementsChecker.checkRequirements(
      context,
      taskDescription
    );
  }

  /**
   * 格式化代码生成需求检查结果
   */
  formatCodeGenerationRequirements(check: CodeGenerationRequirementsCheck): string {
    return this.requirementsChecker.formatRequirementsCheck(check);
  }
}
