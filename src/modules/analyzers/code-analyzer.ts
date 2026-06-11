import * as path from "path";
import { FileUtils } from "../../utils/file-utils.js";
import { CodeFeature, TechStack } from '../../types.js';

/**
 * 代码分析器
 * 分析项目代码特征，识别高频开发模式
 */
export class CodeAnalyzer {
  async analyzeFeatures(
    projectPath: string,
    files: string[],
    techStack: TechStack
  ): Promise<Record<string, CodeFeature>> {
    const features: Record<string, CodeFeature> = {};

    // 分析自定义组件
    const componentFeature = await this.analyzeComponents(files, techStack);
    if (componentFeature) {
      features["custom-components"] = componentFeature;
    }

    // 分析 API 路由
    const apiFeature = await this.analyzeApiRoutes(files, techStack);
    if (apiFeature) {
      features["api-routes"] = apiFeature;
    }

    // 分析状态管理
    const stateFeature = await this.analyzeStateManagement(files, techStack);
    if (stateFeature) {
      features["state-management"] = stateFeature;
    }

    // 分析数据处理
    const dataFeature = await this.analyzeDataProcessing(files);
    if (dataFeature) {
      features["data-processing"] = dataFeature;
    }

    // 分析样式方案
    const styleFeature = await this.analyzeStyling(files, techStack);
    if (styleFeature) {
      features["styling"] = styleFeature;
    }

    // 分析测试
    const testFeature = await this.analyzeTesting(files, techStack);
    if (testFeature) {
      features["testing"] = testFeature;
    }

    // 分析数据库使用
    const dbFeature = await this.analyzeDatabaseUsage(files, techStack);
    if (dbFeature) {
      features["database"] = dbFeature;
    }

    return features;
  }

  /**
   * 分析组件结构
   */
  private async analyzeComponents(
    files: string[],
    techStack: TechStack
  ): Promise<CodeFeature | null> {
    const componentFiles = files.filter((f) => {
      const name = path.basename(f);
      return (
        (f.includes("/components/") ||
          f.includes("/Components/") ||
          name.match(/^[A-Z][a-zA-Z]+\.(tsx?|jsx?|vue|svelte)$/)) &&
        !f.includes("node_modules")
      );
    });

    if (componentFiles.length === 0) {
      return null;
    }

    const examples = componentFiles.slice(0, 3).map((f) => path.basename(f));

    return {
      type: "custom-components",
      description: "Uses custom component structure",
      examples,
      frequency: componentFiles.length,
    };
  }

  /**
   * 分析 API 路由
   */
  private async analyzeApiRoutes(
    files: string[],
    techStack: TechStack
  ): Promise<CodeFeature | null> {
    const apiFiles = files.filter(
      (f) =>
        (f.includes("/api/") ||
          f.includes("/routes/") ||
          f.includes("/controllers/")) &&
        !f.includes("node_modules")
    );

    if (apiFiles.length === 0) {
      return null;
    }

    const examples = apiFiles.slice(0, 3).map((f) => {
      const rel = f.split("/api/").pop() || f.split("/routes/").pop() || f;
      return rel;
    });

    return {
      type: "api-routes",
      description: "项目包含 API 路由定义",
      examples,
      frequency: apiFiles.length,
    };
  }

  /**
   * 分析状态管理
   */
  private async analyzeStateManagement(
    files: string[],
    techStack: TechStack
  ): Promise<CodeFeature | null> {
    const stateLibs = techStack.dependencies.filter((d) =>
      ["redux", "mobx", "zustand", "pinia", "vuex", "recoil", "jotai"].includes(
        d.name
      )
    );

    if (stateLibs.length === 0) {
      return null;
    }

    const stateFiles = files.filter(
      (f) =>
        (f.includes("/store") ||
          f.includes("/state") ||
          f.includes("/redux") ||
          f.includes("/stores")) &&
        !f.includes("node_modules")
    );

    return {
      type: "state-management",
      description: `Uses ${stateLibs.map((l) => l.name).join(", ")} for state management`,
      examples: stateFiles.slice(0, 3).map((f) => path.basename(f)),
      frequency: stateFiles.length,
    };
  }

  /**
   * 分析数据处理
   */
  private async analyzeDataProcessing(
    files: string[]
  ): Promise<CodeFeature | null> {
    const dataFiles = files.filter(
      (f) =>
        (f.includes("/utils/") ||
          f.includes("/helpers/") ||
          f.includes("/lib/")) &&
        !f.includes("node_modules")
    );

    if (dataFiles.length === 0) {
      return null;
    }

    return {
      type: "data-processing",
      description: "项目包含工具函数和数据处理逻辑",
      examples: dataFiles.slice(0, 3).map((f) => path.basename(f)),
      frequency: dataFiles.length,
    };
  }

  /**
   * 分析样式方案
   */
  private async analyzeStyling(
    files: string[],
    techStack: TechStack
  ): Promise<CodeFeature | null> {
    const styleLibs = techStack.dependencies.filter((d) =>
      [
        "tailwindcss",
        "@emotion/react",
        "styled-components",
        "@mui/material",
        "antd",
        "sass",
        "less",
      ].some((lib) => d.name.includes(lib))
    );

    if (styleLibs.length === 0) {
      // 检查 CSS 文件
      const cssFiles = files.filter(
        (f) =>
          (f.endsWith(".css") ||
            f.endsWith(".scss") ||
            f.endsWith(".sass") ||
            f.endsWith(".less")) &&
          !f.includes("node_modules")
      );

      if (cssFiles.length > 0) {
        return {
          type: "styling",
          description: "使用传统 CSS/SCSS 样式",
          examples: cssFiles.slice(0, 3).map((f) => path.basename(f)),
          frequency: cssFiles.length,
        };
      }

      return null;
    }

    return {
      type: "styling",
      description: `Uses ${styleLibs.map((l) => l.name).join(", ")} for styling`,
      examples: styleLibs.map((l) => l.name),
      frequency: styleLibs.length,
    };
  }

  /**
   * 分析测试
   */
  private async analyzeTesting(
    files: string[],
    techStack: TechStack
  ): Promise<CodeFeature | null> {
    const testFiles = files.filter(
      (f) =>
        (f.includes(".test.") ||
          f.includes(".spec.") ||
          f.includes("/__tests__/")) &&
        !f.includes("node_modules")
    );

    if (testFiles.length === 0) {
      return null;
    }

    const testLibs = techStack.dependencies.filter((d) =>
      ["jest", "vitest", "mocha", "chai", "cypress", "playwright", "@testing-library"].some(
        (lib) => d.name.includes(lib)
      )
    );

    return {
      type: "testing",
      description: `包含测试文件，使用 ${testLibs.map((l) => l.name).join(", ") || "标准测试框架"}`,
      examples: testFiles.slice(0, 3).map((f) => path.basename(f)),
      frequency: testFiles.length,
    };
  }

  /**
   * 分析数据库使用
   */
  private async analyzeDatabaseUsage(
    files: string[],
    techStack: TechStack
  ): Promise<CodeFeature | null> {
    const dbLibs = techStack.dependencies.filter((d) =>
      [
        "prisma",
        "mongoose",
        "typeorm",
        "sequelize",
        "knex",
        "pg",
        "mysql",
        "mongodb",
        "redis",
      ].some((lib) => d.name.includes(lib))
    );

    if (dbLibs.length === 0) {
      return null;
    }

    const dbFiles = files.filter(
      (f) =>
        (f.includes("/models/") ||
          f.includes("/schema") ||
          f.includes("/entities/") ||
          f.includes("prisma")) &&
        !f.includes("node_modules")
    );

    return {
      type: "database",
      description: `Uses ${dbLibs.map((l) => l.name).join(", ")} for database operations`,
      examples: dbFiles.slice(0, 3).map((f) => path.basename(f)),
      frequency: dbFiles.length,
    };
  }
}

