#!/usr/bin/env node
/**
 * 简化版测试脚本
 * 用于测试 cursor-rules-generators 在真实项目中的表现
 */

import * as path from "path";
import { ProjectAnalyzer } from "../src/modules/core/project-analyzer.js";
import { TechStackDetector } from "../src/modules/analyzers/tech-stack-detector.js";
import { ModuleDetector } from "../src/modules/analyzers/module-detector.js";
import { CodeAnalyzer } from "../src/modules/analyzers/code-analyzer.js";
import { DeepDirectoryAnalyzer } from "../src/modules/analyzers/deep-directory-analyzer.js";
import { PracticeAnalyzer } from "../src/modules/analyzers/practice-analyzer.js";
import { CustomPatternDetector } from "../src/modules/analyzers/custom-pattern-detector.js";
import { RulesGenerator } from "../src/modules/core/rules-generator.js";
import { FileWriter } from "../src/modules/core/file-writer.js";
import { ConfigParser } from "../src/modules/core/config-parser.js";
import { logger } from "../src/utils/logger.js";

/**
 * 主函数
 */
async function main() {
  // 获取项目路径
  const projectPath = process.argv[2] || process.env.TEST_PROJECT_PATH;

  if (!projectPath) {
    console.error("❌ 错误: 请提供测试项目路径");
    console.error("用法: npm run test:project <项目路径>");
    console.error("或设置环境变量: TEST_PROJECT_PATH=<项目路径> npm run test:project");
    process.exit(1);
  }

  const resolvedPath = path.resolve(projectPath);
  console.log(`📁 测试项目路径: ${resolvedPath}\n`);

    try {
      // 初始化分析器
      const projectAnalyzer = new ProjectAnalyzer();
      const techStackDetector = new TechStackDetector();
      const moduleDetector = new ModuleDetector();
      const codeAnalyzer = new CodeAnalyzer();
      const practiceAnalyzer = new PracticeAnalyzer();
      const customPatternDetector = new CustomPatternDetector();
      const deepAnalyzer = new DeepDirectoryAnalyzer();
      const rulesGenerator = new RulesGenerator();
      const fileWriter = new FileWriter();

      // 1. 收集文件
    console.log("📋 步骤 1/7: 收集项目文件...");
    const files = await projectAnalyzer.collectFiles(resolvedPath);
    console.log(`✅ 已收集 ${files.length} 个文件\n`);

    // 2. 分析技术栈
    console.log("🔍 步骤 2/7: 分析技术栈...");
    const techStack = await techStackDetector.detect(resolvedPath, files);
    console.log(`✅ 主要技术栈: ${techStack.primary.join(", ") || "未检测到"}\n`);

      // 3. 检测模块
    console.log("📦 步骤 3/7: 检测模块结构...");
    const modules = await moduleDetector.detectModules(resolvedPath, files);
    console.log(`✅ 检测到 ${modules.length} 个模块: ${modules.map(m => m.name).join(", ")}\n`);

    // 清理旧的规则文件（在检测模块后进行，以便清理所有模块的规则）
    console.log("🧹 步骤 4/7: 清理旧的规则文件...");
    const modulePaths = modules.map(m => m.path);
    await fileWriter.cleanOldRules(resolvedPath, modulePaths);
    console.log(`✅ 已清理旧的规则文件\n`);

      // 5. 分析代码特征
    console.log("💻 步骤 5/7: 分析代码特征...");
    const codeFeatures = await codeAnalyzer.analyzeFeatures(resolvedPath, files, techStack);
    console.log(`✅ 分析完成，发现 ${Object.keys(codeFeatures).length} 个代码特征\n`);

    // 分析项目实践
    console.log("🔍 分析项目实践...");
    const errorHandling = await practiceAnalyzer.analyzeErrorHandling(resolvedPath, files);
    const codeStyle = await practiceAnalyzer.analyzeCodeStyle(resolvedPath, files);
    const componentPattern = await practiceAnalyzer.analyzeComponentPatterns(resolvedPath, files);
    const projectPractice = { errorHandling, codeStyle, componentPattern };
    console.log(`✅ 已分析项目实践规范\n`);

    // 检测自定义模式
    console.log("🔍 检测自定义工具与模式...");
    const customHooks = await customPatternDetector.detectCustomHooks(resolvedPath, files);
    const customUtils = await customPatternDetector.detectCustomUtils(resolvedPath, files);
    const apiClient = await customPatternDetector.detectAPIClient(resolvedPath, files);
    const customPatterns = { customHooks, customUtils, apiClient };
    console.log(`✅ 发现 ${customHooks.length} 个 Hooks, ${customUtils.length} 个工具函数\n`);

    // 解析项目配置（commands, prettier, eslint 等）
    console.log("🔧 解析项目配置...");
    const configParser = new ConfigParser();
    const projectConfig = await configParser.parseProjectConfig(resolvedPath);
    console.log(`✅ 项目配置已解析\n`);

    // 6. 深度目录分析
    console.log("📂 步骤 6/7: 深度目录分析...");
    const dependencies = techStack.dependencies.map((d) => ({
      name: d.name,
      version: d.version,
      type: d.type || ("dependency" as const),
      category: d.category,
    }));
    await deepAnalyzer.setDependencies(dependencies);
      const deepAnalysis = await deepAnalyzer.analyzeProjectStructure(
      resolvedPath,
        files,
      modules,
      dependencies
    );
    console.log(`✅ 分析了 ${deepAnalysis.length} 个目录\n`);

      // 7. 生成规则
    console.log("📝 步骤 7/7: 生成 Cursor Rules...");
    
    // 构建规则生成上下文
    const ruleContext = {
      projectPath: resolvedPath,
      techStack,
      modules,
      codeFeatures,
      bestPractices: [],
      includeModuleRules: modules.length > 1,
      fileOrganization: undefined,
      deepAnalysis,
      architecturePattern: undefined,
      files,
      projectPractice,
      customPatterns,
      projectConfig,
    };

    const rules = await rulesGenerator.generate(ruleContext, {});
    console.log(`✅ 生成了 ${rules.length} 个规则文件\n`);

    // 生成 instructions.md
    console.log("📝 生成 instructions.md...");
    const instructions = await rulesGenerator.generateInstructions(ruleContext);
    console.log("✅ instructions.md 内容已生成\n");

    // 8. 写入文件
    console.log("💾 写入规则文件...");
    const writeResult = await fileWriter.writeRules(resolvedPath, rules);
    console.log(`✅ 已写入 ${writeResult.writtenFiles.length} 个规则文件\n`);

    // 写入 instructions.md
    await fileWriter.writeInstructions(instructions);
    console.log("✅ 已写入 .cursor/instructions.md\n");

    const allWrittenFiles = [...writeResult.writtenFiles, ".cursor/instructions.md"];
    allWrittenFiles.forEach((file: string) => {
      console.log(`   - ${file}`);
    });

    console.log("\n✨ 测试完成！");
    console.log(`\n📁 规则文件位置: ${path.join(resolvedPath, ".cursor", "rules")}\n`);
    
    // 确保所有日志都写入文件（设置超时避免卡住）
    try {
      await Promise.race([
        logger.flush(),
        new Promise<void>((resolve) => setTimeout(() => resolve(), 200))
      ]);
    } catch (err) {
      // 忽略 flush 错误，继续退出
    }
    
    // 立即退出进程
    process.exit(0);
  } catch (error) {
    console.error("\n❌ 测试失败:", error);
    if (error instanceof Error) {
      console.error("错误详情:", error.message);
      console.error("堆栈:", error.stack);
    }
    
    // 确保日志写入后再退出（设置超时避免卡住）
    try {
      await Promise.race([
        logger.flush(),
        new Promise<void>((resolve) => setTimeout(() => resolve(), 200))
      ]);
    } catch (err) {
      // 忽略 flush 错误
    }
    
    process.exit(1);
  }
}

// 运行主函数
main().catch(async (error) => {
  console.error("未处理的错误:", error);
  try {
    await Promise.race([
      logger.flush(),
      new Promise<void>((resolve) => setTimeout(() => resolve(), 200))
    ]);
  } catch (err) {
    // 忽略 flush 错误
  }
  process.exit(1);
});

