import * as path from "path";
import { FileUtils } from "../../utils/file-utils.js";
import { Module } from '../../types.js';
import { logger } from "../../utils/logger.js";

/**
 * 模块检测器
 * 识别项目中的多模块/子系统结构
 */
export class ModuleDetector {
  async detectModules(projectPath: string, files: string[]): Promise<Module[]> {
    const modules: Module[] = [];

    // 检测 monorepo 结构
    const monorepoModules = await this.detectMonorepo(projectPath, files);
    modules.push(...monorepoModules);

    // 检测前后端分离结构
    const appModules = await this.detectAppStructure(projectPath, files);
    modules.push(...appModules);

    // 检测微服务结构
    const serviceModules = await this.detectMicroservices(projectPath, files);
    modules.push(...serviceModules);

    // 如果没有检测到模块，整个项目作为单一模块
    if (modules.length === 0) {
      // 尝试从根目录的 package.json 获取信息
      const rootPackageJson = path.join(projectPath, "package.json");
      let version: string | undefined;
      let entryPoint: string | undefined;
      let keywords: string[] | undefined;
      let buildConfig: string | undefined;

      if (await FileUtils.fileExists(rootPackageJson)) {
        const content = await FileUtils.readFile(rootPackageJson);
        const data = JSON.parse(content);
        version = data.version;
        entryPoint = data.main || data.module;
        keywords = data.keywords;
        buildConfig = await this.detectBuildConfig(projectPath);
      }

      modules.push({
        name: "main",
        path: projectPath,
        type: "other",
        dependencies: [],
        description: "主项目模块",
        version,
        entryPoint,
        keywords,
        buildConfig,
      });
    }

    return modules;
  }

  /**
   * 检测 Monorepo 结构（如 packages/, apps/ 等）
   */
  private async detectMonorepo(
    projectPath: string,
    files: string[]
  ): Promise<Module[]> {
    const modules: Module[] = [];

    // 检查是否有 lerna.json 或 pnpm-workspace.yaml
    const hasLerna = await FileUtils.fileExists(
      path.join(projectPath, "lerna.json")
    );
    const hasPnpmWorkspace = await FileUtils.fileExists(
      path.join(projectPath, "pnpm-workspace.yaml")
    );
    const hasYarnWorkspace = await FileUtils.fileExists(
      path.join(projectPath, "package.json")
    );

    if (!hasLerna && !hasPnpmWorkspace && !hasYarnWorkspace) {
      return modules;
    }

    // 常见的 monorepo 目录
    const workspaceDirs = ["packages", "apps", "libs", "modules", "services"];

    for (const dir of workspaceDirs) {
      const dirPath = path.join(projectPath, dir);
      if (await FileUtils.fileExists(dirPath)) {
        const subModules = await this.scanWorkspaceDir(dirPath);
        modules.push(...subModules);
      }
    }

    return modules;
  }

  /**
   * 扫描工作区目录
   */
  private async scanWorkspaceDir(dirPath: string): Promise<Module[]> {
    const modules: Module[] = [];
    const fs = await import("fs/promises");

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const modulePath = path.join(dirPath, entry.name);
          const packageJsonPath = path.join(modulePath, "package.json");

          if (await FileUtils.fileExists(packageJsonPath)) {
            const content = await FileUtils.readFile(packageJsonPath);
            const data = JSON.parse(content);

            // 提取入口文件
            const entryPoint = data.main || data.module || data.exports?.["."]?.import || data.exports?.["."]?.require || data.index;
            
            // 识别构建配置
            const buildConfig = await this.detectBuildConfig(modulePath);

            modules.push({
              name: entry.name,
              path: modulePath,
              type: this.inferModuleType(entry.name, data),
              dependencies: Object.keys(data.dependencies || {}),
              description: data.description,
              version: data.version,
              entryPoint: entryPoint,
              keywords: data.keywords || [],
              buildConfig: buildConfig,
              packageName: data.name, // package.json 中的 name 字段
            });
          }
        }
      }
    } catch (error) {
      logger.debug(`扫描工作区失败 ${dirPath}`, error);
    }

    return modules;
  }

  /**
   * 检测前后端分离结构
   */
  private async detectAppStructure(
    projectPath: string,
    files: string[]
  ): Promise<Module[]> {
    const modules: Module[] = [];

    // 常见的前后端目录名
    const frontendDirs = ["frontend", "client", "web", "ui", "app"];
    const backendDirs = ["backend", "server", "api"];

    for (const dir of frontendDirs) {
      const dirPath = path.join(projectPath, dir);
      if (await FileUtils.fileExists(dirPath)) {
        const moduleInfo = await this.extractModuleInfo(dirPath, "frontend", "前端模块");
        modules.push(moduleInfo);
      }
    }

    for (const dir of backendDirs) {
      const dirPath = path.join(projectPath, dir);
      if (await FileUtils.fileExists(dirPath)) {
        const moduleInfo = await this.extractModuleInfo(dirPath, "backend", "后端模块");
        modules.push(moduleInfo);
      }
    }

    // 检测 shared/common 模块
    const sharedDirs = ["shared", "common", "core", "utils"];
    for (const dir of sharedDirs) {
      const dirPath = path.join(projectPath, dir);
      if (await FileUtils.fileExists(dirPath)) {
        const moduleInfo = await this.extractModuleInfo(dirPath, "shared", "共享模块");
        modules.push(moduleInfo);
      }
    }

    return modules;
  }

  /**
   * 检测微服务结构
   */
  private async detectMicroservices(
    projectPath: string,
    files: string[]
  ): Promise<Module[]> {
    const modules: Module[] = [];

    // 检测是否有 docker-compose.yml，这通常表明是微服务架构
    const dockerComposePath = path.join(projectPath, "docker-compose.yml");
    if (!(await FileUtils.fileExists(dockerComposePath))) {
      return modules;
    }

    // 查找包含 Dockerfile 的目录
    const serviceFiles = files.filter((f) => f.includes("Dockerfile"));
    const serviceDirs = new Set(
      serviceFiles.map((f) => path.dirname(f)).filter((d) => d !== projectPath)
    );

    for (const serviceDir of serviceDirs) {
      const moduleInfo = await this.extractModuleInfo(serviceDir, "service", `微服务: ${path.basename(serviceDir)}`);
      modules.push(moduleInfo);
    }

    return modules;
  }

  /**
   * 提取模块信息（从 package.json 或使用默认值）
   */
  private async extractModuleInfo(
    modulePath: string,
    type: "frontend" | "backend" | "shared" | "service" | "package" | "other",
    defaultDescription: string
  ): Promise<Module> {
    const packageJsonPath = path.join(modulePath, "package.json");
    const name = path.basename(modulePath);

    if (await FileUtils.fileExists(packageJsonPath)) {
      const content = await FileUtils.readFile(packageJsonPath);
      const data = JSON.parse(content);
      const entryPoint = data.main || data.module || data.exports?.["."]?.import || data.exports?.["."]?.require;
      const buildConfig = await this.detectBuildConfig(modulePath);

      return {
        name: data.name || name,
        path: modulePath,
        type: this.inferModuleType(name, data),
        dependencies: Object.keys(data.dependencies || {}),
        description: data.description || defaultDescription,
        version: data.version,
        entryPoint: entryPoint,
        keywords: data.keywords || [],
        buildConfig: buildConfig,
        packageName: data.name, // package.json 中的 name 字段
      };
    }

    // 没有 package.json，使用默认值
    return {
      name,
      path: modulePath,
      type,
      dependencies: [],
      description: defaultDescription,
      buildConfig: await this.detectBuildConfig(modulePath),
    };
  }

  /**
   * 检测构建配置
   */
  private async detectBuildConfig(modulePath: string): Promise<string | undefined> {
    const buildConfigFiles = [
      { file: "vite.config.ts", config: "vite" },
      { file: "vite.config.js", config: "vite" },
      { file: "webpack.config.js", config: "webpack" },
      { file: "webpack.config.ts", config: "webpack" },
      { file: "rollup.config.js", config: "rollup" },
      { file: "rollup.config.ts", config: "rollup" },
      { file: "tsconfig.json", config: "typescript" },
    ];

    for (const { file, config } of buildConfigFiles) {
      const configPath = path.join(modulePath, file);
      if (await FileUtils.fileExists(configPath)) {
        return config;
      }
    }

    return undefined;
  }

  /**
   * 推断模块类型
   */
  private inferModuleType(
    name: string,
    packageData: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
  ): "frontend" | "backend" | "shared" | "service" | "package" | "other" {
    const nameLower = name.toLowerCase();

    // 前端相关
    if (
      nameLower.includes("frontend") ||
      nameLower.includes("client") ||
      nameLower.includes("web") ||
      nameLower.includes("ui")
    ) {
      return "frontend";
    }

    // 后端相关
    if (
      nameLower.includes("backend") ||
      nameLower.includes("server") ||
      nameLower.includes("api")
    ) {
      return "backend";
    }

    // 共享模块
    if (
      nameLower.includes("shared") ||
      nameLower.includes("common") ||
      nameLower.includes("core") ||
      nameLower.includes("utils")
    ) {
      return "shared";
    }

    // 服务
    if (nameLower.includes("service")) {
      return "service";
    }

    // 检查依赖
    const deps = packageData.dependencies || {};
    if (deps.react || deps.vue || deps.angular || deps["@angular/core"]) {
      return "frontend";
    }

    if (deps.express || deps.fastify || deps["@nestjs/core"] || deps.koa) {
      return "backend";
    }

    return "package";
  }
}

