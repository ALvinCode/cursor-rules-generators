#!/usr/bin/env node
/**
 * CLI entry point for cursor-rules-generators.
 *
 * Wraps the shared {@link AnalysisPipeline} so the CLI delivers the same
 * analysis depth as the MCP server (router detection, Context7 best
 * practices, consistency checking, etc.).
 *
 * Usage:
 *   cursor-rules-gen generate [path]   — Analyze a project and write .cursor/rules/*.mdc
 *   cursor-rules-gen analyze  [path]   — Analyze only, print summary to stdout
 *   cursor-rules-gen --help
 */

import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

import { AnalysisPipeline, AnalysisProgress } from "./modules/core/analysis-pipeline.js";
import { RulesGenerator } from "./modules/core/rules-generator.js";
import { FileWriter } from "./modules/core/file-writer.js";
import { logger } from "./utils/logger.js";

function getVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    let packageJsonPath = join(__dirname, "..", "package.json");
    try {
      readFileSync(packageJsonPath, "utf-8");
    } catch {
      packageJsonPath = join(__dirname, "..", "..", "package.json");
    }
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
}

function printHelp() {
  const version = getVersion();
  console.log(`cursor-rules-gen v${version}

Usage:
  cursor-rules-gen generate [path]   Analyze project and generate .cursor/rules
  cursor-rules-gen analyze  [path]   Analyze project and print summary (no file writes)
  cursor-rules-gen --version         Show version
  cursor-rules-gen --help            Show this help

Arguments:
  path   Project root directory (defaults to current directory)

Examples:
  cursor-rules-gen generate
  cursor-rules-gen generate /path/to/project
  cursor-rules-gen analyze .
`);
}

function makeProgressLogger(): (p: AnalysisProgress) => void {
  return (p) => {
    const prefix = `[${p.step}/${p.total}]`;
    console.log(`${prefix} ${p.message}`);
    if (p.details) {
      for (const detail of p.details) {
        console.log(`   ${detail}`);
      }
    }
  };
}

async function cmdGenerate(projectPath: string) {
  const resolvedPath = resolve(projectPath);
  console.log(`\nGenerating Cursor Rules for: ${resolvedPath}\n`);

  const pipeline = new AnalysisPipeline();
  const { context } = await pipeline.run(resolvedPath, {
    onProgress: makeProgressLogger(),
  });

  const fileWriter = new FileWriter();
  const rulesGenerator = new RulesGenerator();

  const modulePaths = context.modules.map((m) => m.path);
  await fileWriter.cleanOldRules(resolvedPath, modulePaths);

  console.log("\nGenerating rules...");
  const rules = await rulesGenerator.generate(context, {});
  console.log(`   ${rules.length} rule file(s) generated`);

  console.log("\nWriting files...");
  const writeResult = await fileWriter.writeRules(
    resolvedPath,
    rules,
    context.fileOrganization
  );

  const allFiles = [...writeResult.writtenFiles];
  console.log("");
  allFiles.forEach((f) => console.log(`   ${f}`));

  console.log(
    `\nDone. ${allFiles.length} files written to ${join(
      resolvedPath,
      ".cursor"
    )}\n`
  );
}

async function cmdAnalyze(projectPath: string) {
  const resolvedPath = resolve(projectPath);
  console.log(`\nAnalyzing project: ${resolvedPath}\n`);

  const pipeline = new AnalysisPipeline();
  const { context, consistencyReport } = await pipeline.run(resolvedPath, {
    onProgress: makeProgressLogger(),
  });

  console.log("\n═══════════════════════════════════════");
  console.log("  Project Analysis Summary");
  console.log("═══════════════════════════════════════\n");

  console.log(`Tech Stack:     ${context.techStack.primary.join(", ")}`);
  console.log(`Languages:      ${context.techStack.languages.join(", ")}`);
  console.log(
    `Frameworks:     ${context.techStack.frameworks.join(", ") || "none"}`
  );
  console.log(
    `Pkg Managers:   ${context.techStack.packageManagers.join(", ")}`
  );
  console.log(`Modules:        ${context.modules.map((m) => m.name).join(", ")}`);
  console.log(
    `Code Features:  ${Object.keys(context.codeFeatures).join(", ") || "none"}`
  );

  if (context.frontendRouter) {
    console.log(
      `Frontend Router: ${context.frontendRouter.info.framework} (${context.frontendRouter.info.type})`
    );
  }
  if (context.backendRouter) {
    console.log(
      `Backend Router: ${context.backendRouter.info.framework} (${context.backendRouter.info.type})`
    );
  }
  if (context.architecturePattern && context.architecturePattern.type !== "unknown") {
    console.log(
      `Architecture:   ${context.architecturePattern.type} (confidence ${context.architecturePattern.confidence})`
    );
  }

  if (context.projectConfig?.commands) {
    const cmds = context.projectConfig.commands;
    console.log("\nCommands:");
    if (cmds.build) console.log(`  build:      ${cmds.build}`);
    if (cmds.dev) console.log(`  dev:        ${cmds.dev}`);
    if (cmds.test) console.log(`  test:       ${cmds.test}`);
    if (cmds.lint) console.log(`  lint:       ${cmds.lint}`);
    if (cmds.format) console.log(`  format:     ${cmds.format}`);
    if (cmds.typeCheck) console.log(`  typeCheck:  ${cmds.typeCheck}`);
  }

  console.log(`\nBest Practices: ${context.bestPractices.length} retrieved`);
  console.log(`Dependencies:   ${context.techStack.dependencies.length} total`);

  if (consistencyReport?.hasInconsistencies) {
    console.log(
      `\nConsistency:    ${consistencyReport.inconsistencies.length} issue(s) detected`
    );
  } else if (consistencyReport) {
    console.log(`\nConsistency:    OK`);
  }
  console.log("");
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    console.log(getVersion());
    process.exit(0);
  }

  const command = args[0];
  const projectPath = args[1] || ".";

  try {
    switch (command) {
      case "generate":
        await cmdGenerate(projectPath);
        break;
      case "analyze":
        await cmdAnalyze(projectPath);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error("\nFailed:", error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }

  try {
    await Promise.race([
      logger.flush(),
      new Promise<void>((resolve) => setTimeout(resolve, 200)),
    ]);
  } catch {
    /* ignore */
  }

  process.exit(0);
}

main().catch(async (error) => {
  console.error("Unhandled error:", error);
  try {
    await Promise.race([
      logger.flush(),
      new Promise<void>((resolve) => setTimeout(resolve, 200)),
    ]);
  } catch {
    /* ignore */
  }
  process.exit(1);
});
