#!/usr/bin/env node
/**
 * CLI entry point for cursor-rules-generators.
 * Usage:
 *   cursor-rules-gen generate [path]   — Analyze a project and write .cursor/rules/*.mdc
 *   cursor-rules-gen analyze  [path]   — Analyze only, print summary to stdout
 *   cursor-rules-gen --help
 */

import * as path from "path";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { ProjectAnalyzer } from "./modules/core/project-analyzer.js";
import { TechStackDetector } from "./modules/analyzers/tech-stack-detector.js";
import { ModuleDetector } from "./modules/analyzers/module-detector.js";
import { CodeAnalyzer } from "./modules/analyzers/code-analyzer.js";
import { DeepDirectoryAnalyzer } from "./modules/analyzers/deep-directory-analyzer.js";
import { PracticeAnalyzer } from "./modules/analyzers/practice-analyzer.js";
import { CustomPatternDetector } from "./modules/analyzers/custom-pattern-detector.js";
import { RulesGenerator } from "./modules/core/rules-generator.js";
import { FileWriter } from "./modules/core/file-writer.js";
import { ConfigParser } from "./modules/core/config-parser.js";
import { logger } from "./utils/logger.js";
import { RuleGenerationContext } from "./types.js";

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

async function buildContext(resolvedPath: string): Promise<RuleGenerationContext> {
  const projectAnalyzer = new ProjectAnalyzer();
  const techStackDetector = new TechStackDetector();
  const moduleDetector = new ModuleDetector();
  const codeAnalyzer = new CodeAnalyzer();
  const practiceAnalyzer = new PracticeAnalyzer();
  const customPatternDetector = new CustomPatternDetector();
  const deepAnalyzer = new DeepDirectoryAnalyzer();
  const configParser = new ConfigParser();

  console.log("📋 [1/7] Collecting project files...");
  const files = await projectAnalyzer.collectFiles(resolvedPath);
  console.log(`   ${files.length} files collected`);

  console.log("🔍 [2/7] Detecting tech stack...");
  const techStack = await techStackDetector.detect(resolvedPath, files);
  console.log(`   Primary: ${techStack.primary.join(", ") || "none detected"}`);

  console.log("📦 [3/7] Detecting modules...");
  const modules = await moduleDetector.detectModules(resolvedPath, files);
  console.log(`   ${modules.length} module(s): ${modules.map(m => m.name).join(", ")}`);

  console.log("💻 [4/7] Analyzing code features...");
  const codeFeatures = await codeAnalyzer.analyzeFeatures(resolvedPath, files, techStack);
  console.log(`   ${Object.keys(codeFeatures).length} feature(s) found`);

  console.log("🔍 [5/7] Analyzing practices & patterns...");
  const errorHandling = await practiceAnalyzer.analyzeErrorHandling(resolvedPath, files);
  const codeStyle = await practiceAnalyzer.analyzeCodeStyle(resolvedPath, files);
  const componentPattern = await practiceAnalyzer.analyzeComponentPatterns(resolvedPath, files);
  const projectPractice = { errorHandling, codeStyle, componentPattern };

  const customHooks = await customPatternDetector.detectCustomHooks(resolvedPath, files);
  const customUtils = await customPatternDetector.detectCustomUtils(resolvedPath, files);
  const apiClient = await customPatternDetector.detectAPIClient(resolvedPath, files);
  const customPatterns = { customHooks, customUtils, apiClient };

  console.log("🔧 [6/7] Parsing project config...");
  const projectConfig = await configParser.parseProjectConfig(resolvedPath);

  console.log("📂 [7/7] Deep directory analysis...");
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
  console.log(`   ${deepAnalysis.length} directories analyzed`);

  return {
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
  } as RuleGenerationContext;
}

async function cmdGenerate(projectPath: string) {
  const resolvedPath = path.resolve(projectPath);
  console.log(`\n🚀 Generating Cursor Rules for: ${resolvedPath}\n`);

  const fileWriter = new FileWriter();
  const rulesGenerator = new RulesGenerator();

  const context = await buildContext(resolvedPath);

  // Clean old rules
  const modulePaths = context.modules.map(m => m.path);
  await fileWriter.cleanOldRules(resolvedPath, modulePaths);

  // Generate
  console.log("\n📝 Generating rules...");
  const rules = await rulesGenerator.generate(context, {});
  console.log(`   ${rules.length} rule file(s) generated`);

  const instructions = await rulesGenerator.generateInstructions(context);

  // Write
  console.log("\n💾 Writing files...");
  const writeResult = await fileWriter.writeRules(resolvedPath, rules);
  await fileWriter.writeInstructions(instructions);

  const allFiles = [...writeResult.writtenFiles, ".cursor/instructions.md"];
  console.log("");
  allFiles.forEach(f => console.log(`   ✅ ${f}`));

  console.log(`\n✨ Done! ${allFiles.length} files written to ${path.join(resolvedPath, ".cursor")}\n`);
}

async function cmdAnalyze(projectPath: string) {
  const resolvedPath = path.resolve(projectPath);
  console.log(`\n🔍 Analyzing project: ${resolvedPath}\n`);

  const context = await buildContext(resolvedPath);

  console.log("\n═══════════════════════════════════════");
  console.log("  Project Analysis Summary");
  console.log("═══════════════════════════════════════\n");

  console.log(`Tech Stack:     ${context.techStack.primary.join(", ")}`);
  console.log(`Languages:      ${context.techStack.languages.join(", ")}`);
  console.log(`Frameworks:     ${context.techStack.frameworks.join(", ") || "none"}`);
  console.log(`Pkg Managers:   ${context.techStack.packageManagers.join(", ")}`);
  console.log(`Modules:        ${context.modules.map(m => m.name).join(", ")}`);
  console.log(`Code Features:  ${Object.keys(context.codeFeatures).join(", ") || "none"}`);

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

  console.log(`\nDependencies:   ${context.techStack.dependencies.length} total`);
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
    console.error("\n❌ Failed:", error instanceof Error ? error.message : error);
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
  } catch { /* ignore */ }

  process.exit(0);
}

main().catch(async (error) => {
  console.error("Unhandled error:", error);
  try {
    await Promise.race([
      logger.flush(),
      new Promise<void>((resolve) => setTimeout(resolve, 200)),
    ]);
  } catch { /* ignore */ }
  process.exit(1);
});
