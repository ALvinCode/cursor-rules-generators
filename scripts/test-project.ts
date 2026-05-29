#!/usr/bin/env node
/**
 * 测试脚本
 * 使用与 CLI 相同的 AnalysisPipeline，确保与 MCP / CLI 输出完全一致。
 */

import * as path from "path";
import { AnalysisPipeline, AnalysisProgress } from "../src/modules/core/analysis-pipeline.js";
import { RulesGenerator } from "../src/modules/core/rules-generator.js";
import { FileWriter } from "../src/modules/core/file-writer.js";
import { logger } from "../src/utils/logger.js";

function makeProgressLogger(): (p: AnalysisProgress) => void {
  const icons: Record<string, string> = {
    'collect-files':       '📋',
    'tech-stack':          '🔍',
    'modules':             '📦',
    'code-features':       '💻',
    'project-config':      '🔧',
    'practices':           '🔍',
    'custom-patterns':     '🔍',
    'file-organization':   '📂',
    'deep-directory':      '📂',
    'architecture-pattern':'🏗️',
    'routers':             '🛣️',
    'best-practices':      '📚',
    'consistency':         '✅',
  };

  return (p: AnalysisProgress) => {
    const icon = icons[p.stage] ?? '🔄';
    const detail = p.details?.length ? p.details[0] : '';
    console.log(`${icon} [${p.step}/${p.total}] ${p.message}${detail ? `\n   ${detail}` : ''}`);
  };
}

async function main() {
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
    const pipeline = new AnalysisPipeline();
    const { context } = await pipeline.run(resolvedPath, {
      onProgress: makeProgressLogger(),
    });

    // 清理旧规则
    const fileWriter = new FileWriter();
    const modulePaths = context.modules.map((m) => m.path);
    await fileWriter.cleanOldRules(resolvedPath, modulePaths);

    // 生成规则
    console.log("\n📝 生成 Cursor Rules...");
    const rulesGenerator = new RulesGenerator();
    const rules = await rulesGenerator.generate(context, {});
    console.log(`✅ 生成了 ${rules.length} 个规则文件\n`);

    // 写入文件
    console.log("💾 写入规则文件...");
    const writeResult = await fileWriter.writeRules(
      resolvedPath,
      rules,
      context.fileOrganization
    );
    console.log(`✅ 已写入 ${writeResult.writtenFiles.length} 个规则文件\n`);

    writeResult.writtenFiles.forEach((f) => {
      console.log(`   - ${f}`);
    });

    console.log("\n✨ 测试完成！");
    console.log(`\n📁 规则文件位置: ${path.join(resolvedPath, ".cursor", "rules")}\n`);

    try {
      await Promise.race([
        logger.flush(),
        new Promise<void>((resolve) => setTimeout(() => resolve(), 200)),
      ]);
    } catch {
      // 忽略 flush 错误
    }

    process.exit(0);
  } catch (error) {
    console.error("\n❌ 测试失败:", error);
    if (error instanceof Error) {
      console.error("错误详情:", error.message);
      console.error("堆栈:", error.stack);
    }

    try {
      await Promise.race([
        logger.flush(),
        new Promise<void>((resolve) => setTimeout(() => resolve(), 200)),
      ]);
    } catch {
      // 忽略 flush 错误
    }

    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error("未处理的错误:", error);
  try {
    await Promise.race([
      logger.flush(),
      new Promise<void>((resolve) => setTimeout(() => resolve(), 200)),
    ]);
  } catch {
    // 忽略 flush 错误
  }
  process.exit(1);
});
