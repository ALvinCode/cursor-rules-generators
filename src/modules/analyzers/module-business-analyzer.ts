import * as path from "path";
import { FileUtils } from "../../utils/file-utils.js";
import { DeepDirectoryAnalysis, Module, RuleGenerationContext } from "../../types.js";
import { logger } from "../../utils/logger.js";

/**
 * 模块业务分析结果
 */
export interface ModuleBusinessAnalysis {
  businessDomain: string; // 业务领域
  mainFeatures: string[]; // 主要功能
  businessPattern?: string; // 业务逻辑模式（如 DDD, Feature-based 等）
  dependentModules: string[]; // 依赖此模块的其他模块
  internalDependencies: string[]; // 模块内部依赖的其他模块
}

/**
 * 模块业务分析器
 * 分析模块的业务信息、业务领域、主要功能等
 */
export class ModuleBusinessAnalyzer {
  /**
   * 分析模块业务信息
   */
  async analyzeModuleBusiness(
    module: Module,
    context: RuleGenerationContext,
    deepAnalysis: DeepDirectoryAnalysis[]
  ): Promise<ModuleBusinessAnalysis> {
    // 从 package.json 提取业务领域
    const businessDomain = await this.extractBusinessDomain(module);

    // 分析主要功能
    const mainFeatures = this.identifyMainFeatures(module, deepAnalysis);

    // 识别业务逻辑模式
    const businessPattern = this.identifyBusinessPattern(module, deepAnalysis);

    // 分析模块依赖关系
    const dependentModules = this.findDependentModules(module, context);
    const internalDependencies = this.findInternalDependencies(module, context);

    return {
      businessDomain,
      mainFeatures,
      businessPattern,
      dependentModules,
      internalDependencies,
    };
  }

  /**
   * 从 package.json 提取业务领域
   */
  private async extractBusinessDomain(module: Module): Promise<string> {
    const packageJsonPath = path.join(module.path, "package.json");

    if (await FileUtils.fileExists(packageJsonPath)) {
      try {
        const content = await FileUtils.readFile(packageJsonPath);
        const data = JSON.parse(content);

        // 优先使用 description
        if (data.description) {
          return data.description;
        }

        // 其次使用 keywords 的第一个
        if (data.keywords && Array.isArray(data.keywords) && data.keywords.length > 0) {
          return data.keywords[0];
        }
      } catch (error) {
        logger.debug(`读取 package.json 失败: ${packageJsonPath}`, error);
      }
    }

    // 从模块名称推断
    return this.inferBusinessDomainFromName(module.name);
  }

  /**
   * 从模块名称推断业务领域
   */
  private inferBusinessDomainFromName(moduleName: string): string {
    const nameLower = moduleName.toLowerCase();

    // 常见业务领域关键词
    const domainKeywords: Record<string, string> = {
      auth: "Authentication",
      user: "User Management",
      payment: "Payment",
      order: "Orders",
      product: "Products",
      cart: "Shopping Cart",
      kyc: "Identity Verification",
      form: "Forms",
      common: "Common",
      shared: "Shared",
      utils: "Utilities",
      components: "Component Library",
    };

    for (const [keyword, domain] of Object.entries(domainKeywords)) {
      if (nameLower.includes(keyword)) {
        return domain;
      }
    }

    return "General";
  }

  /**
   * 识别主要功能
   */
  private identifyMainFeatures(
    module: Module,
    deepAnalysis: DeepDirectoryAnalysis[]
  ): string[] {
    const features: string[] = [];

    // 从模块目录中提取功能
    const moduleDirectories = deepAnalysis.filter((analysis) => {
      const analysisPath = analysis.path.replace(/\\/g, "/");
      const modulePath = path.resolve(module.path).replace(/\\/g, "/");
      return analysisPath.startsWith(modulePath);
    });

    // 查找功能相关的目录
    const featureKeywords = [
      "feature",
      "features",
      "domain",
      "domains",
      "service",
      "services",
      "page",
      "pages",
      "component",
      "components",
    ];

    for (const dir of moduleDirectories) {
      const dirName = path.basename(dir.path).toLowerCase();
      const dirPurpose = dir.purpose?.toLowerCase() || "";

      // 检查是否是功能目录
      for (const keyword of featureKeywords) {
        if (dirName.includes(keyword) || dirPurpose.includes(keyword)) {
          const featureName = path.basename(dir.path);
          if (!features.includes(featureName)) {
            features.push(featureName);
          }
        }
      }

      // 从目录用途中提取功能
      // 只判断英文，不判断中文
      const purposeLower = (dir.purpose || '').toLowerCase();
      if (dir.purpose && dir.purpose !== "" && purposeLower !== 'other' && purposeLower !== 'unknown') {
        const purposeWords = dir.purpose.split(/[，,、\s]+/);
        for (const word of purposeWords) {
          if (word.length > 1 && !features.includes(word)) {
            features.push(word);
          }
        }
      }
    }

    // 限制数量并去重
    return [...new Set(features)].slice(0, 10);
  }

  /**
   * 识别业务逻辑模式
   */
  private identifyBusinessPattern(
    module: Module,
    deepAnalysis: DeepDirectoryAnalysis[]
  ): string | undefined {
    const moduleDirectories = deepAnalysis.filter((analysis) => {
      const analysisPath = analysis.path.replace(/\\/g, "/");
      const modulePath = path.resolve(module.path).replace(/\\/g, "/");
      return analysisPath.startsWith(modulePath);
    });

    // 检查是否有 DDD 模式的特征
    const hasDomains = moduleDirectories.some((d) =>
      path.basename(d.path).toLowerCase().includes("domain")
    );
    const hasEntities = moduleDirectories.some((d) =>
      path.basename(d.path).toLowerCase().includes("entity") ||
      path.basename(d.path).toLowerCase().includes("entities")
    );
    const hasValueObjects = moduleDirectories.some((d) =>
      path.basename(d.path).toLowerCase().includes("valueobject") ||
      path.basename(d.path).toLowerCase().includes("vo")
    );

    if (hasDomains && (hasEntities || hasValueObjects)) {
      return "DDD (Domain-Driven Design)";
    }

    // 检查是否有 Feature-based 模式
    const hasFeatures = moduleDirectories.some((d) =>
      path.basename(d.path).toLowerCase().includes("feature") ||
      path.basename(d.path).toLowerCase().includes("features")
    );

    if (hasFeatures) {
      return "Feature-based";
    }

    // 检查是否有 Clean Architecture 模式
    const hasLayers = moduleDirectories.some((d) => {
      const dirName = path.basename(d.path).toLowerCase();
      return (
        dirName.includes("presentation") ||
        dirName.includes("application") ||
        dirName.includes("domain") ||
        dirName.includes("infrastructure")
      );
    });

    if (hasLayers) {
      return "Clean Architecture";
    }

    return undefined;
  }

  /**
   * 查找依赖此模块的其他模块
   */
  private findDependentModules(
    module: Module,
    context: RuleGenerationContext
  ): string[] {
    const dependentModules: string[] = [];

    for (const otherModule of context.modules) {
      if (otherModule.name === module.name) continue;

      // 检查其他模块是否依赖此模块
      if (otherModule.dependencies.includes(module.name)) {
        dependentModules.push(otherModule.name);
      }

      // 检查 package.json 中的依赖
      // 这里可以进一步分析，但暂时只检查 dependencies 数组
    }

    return dependentModules;
  }

  /**
   * 查找模块内部依赖的其他模块
   */
  private findInternalDependencies(
    module: Module,
    context: RuleGenerationContext
  ): string[] {
    const internalDeps: string[] = [];

    // 检查模块依赖的其他内部模块（非 node_modules）
    for (const dep of module.dependencies) {
      // 检查是否是内部模块（在 context.modules 中存在）
      const isInternalModule = context.modules.some(
        (m) => m.name === dep || dep.includes(m.name)
      );

      if (isInternalModule) {
        internalDeps.push(dep);
      }
    }

    return internalDeps;
  }
}

