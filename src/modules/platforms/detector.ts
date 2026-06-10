/**
 * 平台检测编排 + 核心平台适配器（阶段 0）
 *
 * 本文件实现核心 5 个平台（web / iOS / Android / Flutter / React Native）的 `detect`，
 * 并提供 `detectPlatforms` 编排函数。检测以「清单文件优先、依赖次之、扩展名兜底」为原则。
 *
 * 阶段 0 仅做检测，不消费结果（不影响任何规则生成内容）。
 * 额外生态（Electron/Tauri/uni-app/Taro/小程序/KMP/Ionic/NativeScript）的 adapter
 * 将在后续各自阶段加入。
 */

import * as path from "path";

import { logger } from "../../utils/logger.js";
import {
  Platform,
  PlatformAdapter,
  PlatformCapabilities,
  PlatformDetectContext,
  PlatformDetection,
  PlatformRuleRequirement,
  PlatformRuleSection,
} from "./types.js";

// ─── 工具函数 ────────────────────────────────────────────────

function basenameIs(files: string[], name: string): boolean {
  return files.some((f) => path.basename(f) === name);
}

function hasExtension(files: string[], ext: string): boolean {
  return files.some((f) => f.endsWith(ext));
}

/** 路径中包含某个目录式后缀（如 `.xcodeproj` 目录或其内文件） */
function pathContains(files: string[], fragment: string): boolean {
  return files.some((f) => f.endsWith(fragment) || f.includes(`${fragment}/`));
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

/**
 * 是否为「跨平台框架的原生宿主壳」。
 *
 * Flutter / React Native 项目通常自带 `ios/`、`android/` 子目录作为编译宿主，
 * 这些壳不应被单独识别为原生 iOS / Android 平台 —— 应由 Flutter / RN 平台代表。
 */
function isCrossPlatformHost(ctx: PlatformDetectContext): boolean {
  return (
    basenameIs(ctx.files, "pubspec.yaml") ||
    ctx.dependencyNames.includes("react-native")
  );
}

// ─── 核心平台适配器 ──────────────────────────────────────────

/** Web：存在明确的 web 框架依赖（React 需排除 RN 场景） */
export const webAdapter: PlatformAdapter = {
  platform: "web",
  detect(ctx) {
    const WEB_FRAMEWORKS = [
      "vue",
      "@vue/core",
      "@angular/core",
      "svelte",
      "solid-js",
      "@builder.io/qwik",
      "astro",
      "next",
      "nuxt",
      "preact",
      "gatsby",
      "@remix-run/react",
    ];
    const hasRN = ctx.dependencyNames.includes("react-native");
    const webHits = ctx.dependencyNames.filter((n) =>
      WEB_FRAMEWORKS.some((w) => n === w || n.startsWith(`${w}/`))
    );
    // react 仅在非 RN 场景下视为 web 信号（RN 项目也依赖 react）
    const reactAsWeb = !hasRN && ctx.dependencyNames.includes("react");

    if (webHits.length === 0 && !reactAsWeb) return null;

    const evidence = [...webHits];
    if (reactAsWeb) evidence.push("react");
    return { platform: "web", confidence: "high", evidence: dedupe(evidence) };
  },
};

/** React Native：react-native 或 expo 依赖 */
export const reactNativeAdapter: PlatformAdapter = {
  platform: "react-native",
  detect(ctx) {
    const hasReactNative = ctx.dependencyNames.includes("react-native");
    const hasExpo = ctx.dependencyNames.some(
      (n) => n === "expo" || n.startsWith("expo-") || n.startsWith("@expo/")
    );
    if (!hasReactNative && !hasExpo) return null;

    const evidence: string[] = [];
    if (hasReactNative) evidence.push("react-native");
    if (hasExpo) evidence.push("expo");
    return { platform: "react-native", confidence: "high", evidence };
  },
  contributeRequirements(): PlatformRuleRequirement[] {
    return [
      {
        ruleType: "code-style",
        ruleFileName: "code-style.mdc",
        priority: 90,
        reason: "React Native 代码风格约定",
        confidence: "high",
      },
      {
        ruleType: "architecture",
        ruleFileName: "architecture.mdc",
        priority: 90,
        reason: "React Native 分层架构约定",
        confidence: "high",
      },
    ];
  },
  contributeRuleSections(): PlatformRuleSection[] {
    return [
      {
        ruleType: "global-overview",
        content: `## React Native Constraints

- Use functional components with Hooks; class components only for error boundaries.
- NEVER access platform APIs directly — use React Native's built-in modules or community native modules.
- Use \`StyleSheet.create\` for styles; avoid inline style objects for performance.
- Test on both iOS and Android simulators before committing UI changes.
- Prefer Expo modules when available; eject to bare workflow only when Expo cannot meet requirements.
- NEVER import from \`react-native-web\` or browser-only packages in shared code.`,
      },
      {
        ruleType: "code-style",
        content: `## React Native Style

- Components: \`UpperCamelCase\`; hooks: \`useCamelCase\`; utility functions: \`lowerCamelCase\`.
- Co-locate component, styles, and tests: \`ComponentName/index.tsx\`, \`styles.ts\`, \`__tests__/\`.
- Platform-specific files use \`.ios.tsx\` / \`.android.tsx\` suffixes; shared logic in plain \`.tsx\`.
- Prefer \`FlatList\` / \`FlashList\` over \`ScrollView\` for long lists (virtualization).
- Keep bridge crossings minimal — batch native calls and avoid synchronous native module methods.`,
      },
      {
        ruleType: "architecture",
        content: `## React Native Architecture

- Separate layers: screens (\`src/screens/\`), components (\`src/components/\`), services (\`src/services/\`), state (\`src/store/\` or \`src/hooks/\`).
- Navigation via React Navigation (or Expo Router); define all routes in a centralized navigator tree.
- State management: use React context + hooks for local state; Redux / Zustand / Jotai for global state.
- API layer abstracts network calls behind typed service functions; no direct \`fetch\` in components.
- Native modules and platform-specific code live in \`src/native/\` or dedicated packages; never scatter platform imports across feature code.`,
      },
    ];
  },
};

/** Flutter：pubspec.yaml 清单（含 .dart 文件提升置信度） */
export const flutterAdapter: PlatformAdapter = {
  platform: "flutter",
  detect(ctx) {
    const hasPubspec = basenameIs(ctx.files, "pubspec.yaml");
    if (!hasPubspec) return null;

    const hasDart = hasExtension(ctx.files, ".dart");
    const evidence = ["pubspec.yaml"];
    if (hasDart) evidence.push(".dart");
    return {
      platform: "flutter",
      confidence: hasDart ? "high" : "medium",
      evidence,
    };
  },
  getCapabilities(): PlatformCapabilities {
    return { languages: ["Dart"], fileExtensions: [".dart"] };
  },
  contributeRequirements(): PlatformRuleRequirement[] {
    return [
      {
        ruleType: "code-style",
        ruleFileName: "code-style.mdc",
        priority: 90,
        reason: "Dart/Flutter 代码风格约定",
        confidence: "high",
      },
      {
        ruleType: "architecture",
        ruleFileName: "architecture.mdc",
        priority: 90,
        reason: "Flutter 分层架构约定",
        confidence: "high",
      },
    ];
  },
  contributeRuleSections(): PlatformRuleSection[] {
    return [
      {
        ruleType: "global-overview",
        content: `## Flutter / Dart Constraints

- Use \`dart format\` for formatting; never commit unformatted Dart code.
- Prefer \`const\` constructors for immutable widgets.
- Use \`StatelessWidget\` by default; only use \`StatefulWidget\` when local mutable state is necessary.
- Manage dependencies via \`pubspec.yaml\`; run \`flutter pub get\` after changes.
- NEVER use \`dynamic\` type — use strong typing and generics.`,
      },
      {
        ruleType: "code-style",
        content: `## Flutter / Dart Style

- Follow [Effective Dart](https://dart.dev/effective-dart) naming: \`UpperCamelCase\` for types, \`lowerCamelCase\` for members, \`lowercase_with_underscores\` for files.
- Use trailing commas in argument/parameter lists for better diffs.
- Prefer \`final\` over \`var\` for local variables that are not reassigned.
- Widget build methods should return a single widget tree — extract sub-trees into named methods or separate widgets when nesting exceeds 3–4 levels.
- Use \`part\` / \`part of\` only with code generators (Freezed, Riverpod); prefer import/export otherwise.`,
      },
      {
        ruleType: "architecture",
        content: `## Flutter Architecture

- Separate UI (\`lib/ui/\` or \`lib/presentation/\`), domain (\`lib/domain/\`), and data (\`lib/data/\`) layers.
- Use a state management solution consistently (Riverpod / Bloc / Provider); do not mix paradigms.
- Keep business logic out of widgets — place it in controllers, notifiers, or cubits.
- Prefer composition over inheritance for widgets.
- Platform channels and native interop live in \`lib/platform/\` or dedicated plugin packages.`,
      },
    ];
  },
};

/** iOS：Podfile / SPM / Xcode 工程 / Swift 源文件（排除跨平台宿主壳） */
export const iosAdapter: PlatformAdapter = {
  platform: "ios",
  detect(ctx) {
    if (isCrossPlatformHost(ctx)) return null;

    const manifests: string[] = [];
    if (basenameIs(ctx.files, "Podfile")) manifests.push("Podfile");
    if (basenameIs(ctx.files, "Package.swift")) manifests.push("Package.swift");
    if (pathContains(ctx.files, ".xcodeproj")) manifests.push(".xcodeproj");
    if (pathContains(ctx.files, ".xcworkspace")) manifests.push(".xcworkspace");
    const hasSwift = hasExtension(ctx.files, ".swift");

    if (manifests.length === 0 && !hasSwift) return null;

    const evidence = [...manifests];
    if (hasSwift) evidence.push(".swift");
    return {
      platform: "ios",
      confidence: manifests.length > 0 ? "high" : "medium",
      evidence: dedupe(evidence),
    };
  },
  getCapabilities(): PlatformCapabilities {
    return { languages: ["Swift"], fileExtensions: [".swift"] };
  },
  contributeRequirements(): PlatformRuleRequirement[] {
    return [
      {
        ruleType: "code-style",
        ruleFileName: "code-style.mdc",
        priority: 90,
        reason: "Swift 代码风格约定",
        confidence: "high",
      },
      {
        ruleType: "architecture",
        ruleFileName: "architecture.mdc",
        priority: 90,
        reason: "iOS 分层架构约定",
        confidence: "high",
      },
    ];
  },
  contributeRuleSections(): PlatformRuleSection[] {
    return [
      {
        ruleType: "global-overview",
        content: `## iOS / Swift Constraints

- Use Swift Package Manager (SPM) as the primary dependency manager; CocoaPods only when SPM is unavailable.
- Target the latest stable iOS SDK; guard older-version API with \`#available\`.
- NEVER force-unwrap optionals (\`!\`) — use \`guard let\`, \`if let\`, or nil-coalescing (\`??\`).
- Use \`async/await\` (Swift Concurrency) for asynchronous work; avoid raw GCD unless interfacing with legacy code.
- Run \`swiftlint\` (or \`swift-format\`) before committing.`,
      },
      {
        ruleType: "code-style",
        content: `## Swift Style

- Follow [Swift API Design Guidelines](https://www.swift.org/documentation/api-design-guidelines/): clarity at the call site over brevity.
- Types and protocols: \`UpperCamelCase\`; properties, methods, variables: \`lowerCamelCase\`.
- Prefer value types (\`struct\`, \`enum\`) over reference types (\`class\`) unless identity semantics are needed.
- Use \`let\` by default; only use \`var\` when mutation is required.
- Keep functions short (≤ 40 lines); extract helpers for complex logic.
- Use Swift's native error handling (\`throws\` / \`do-catch\`) instead of result-code patterns.`,
      },
      {
        ruleType: "architecture",
        content: `## iOS Architecture

- Adopt a clear architectural pattern (MVVM / TCA / VIPER) and apply it consistently across all features.
- Separate layers: UI (SwiftUI Views / UIKit ViewControllers), ViewModel / Presenter, Domain (use cases), Data (repositories + networking).
- Dependency injection via protocols; avoid singletons for testability.
- Navigation logic lives outside views — use a Coordinator or Router pattern.
- Resources (strings, colors, images) use Asset Catalogs and generated accessors; no hardcoded literals.`,
      },
    ];
  },
};

/** Android：AndroidManifest.xml / Gradle + Kotlin（排除跨平台宿主壳与纯 JVM 项目） */
export const androidAdapter: PlatformAdapter = {
  platform: "android",
  detect(ctx) {
    if (isCrossPlatformHost(ctx)) return null;

    const hasAndroidManifest = basenameIs(ctx.files, "AndroidManifest.xml");
    const hasGradle = ctx.files.some((f) => {
      const b = path.basename(f);
      return (
        b === "build.gradle" ||
        b === "build.gradle.kts" ||
        b === "settings.gradle" ||
        b === "settings.gradle.kts"
      );
    });
    const hasKotlin = hasExtension(ctx.files, ".kt");

    // 仅有 Gradle 而无 AndroidManifest / Kotlin 可能是纯 JVM(Java) 项目，不判为 Android。
    if (!hasAndroidManifest && !(hasGradle && hasKotlin)) return null;

    const evidence: string[] = [];
    if (hasAndroidManifest) evidence.push("AndroidManifest.xml");
    if (hasGradle) evidence.push("build.gradle");
    if (hasKotlin) evidence.push(".kt");
    return {
      platform: "android",
      confidence: hasAndroidManifest ? "high" : "medium",
      evidence,
    };
  },
  getCapabilities(): PlatformCapabilities {
    return { languages: ["Kotlin"], fileExtensions: [".kt"] };
  },
  contributeRequirements(): PlatformRuleRequirement[] {
    return [
      {
        ruleType: "code-style",
        ruleFileName: "code-style.mdc",
        priority: 90,
        reason: "Kotlin/Android 代码风格约定",
        confidence: "high",
      },
      {
        ruleType: "architecture",
        ruleFileName: "architecture.mdc",
        priority: 90,
        reason: "Android 分层架构约定",
        confidence: "high",
      },
    ];
  },
  contributeRuleSections(): PlatformRuleSection[] {
    return [
      {
        ruleType: "global-overview",
        content: `## Android / Kotlin Constraints

- Use Kotlin as the primary language; Java only for legacy interop.
- Target the project's \`minSdk\`; guard newer APIs with \`@RequiresApi\` or version checks.
- NEVER block the main thread — use \`kotlinx.coroutines\` for async work.
- Manage dependencies via Gradle version catalogs (\`libs.versions.toml\`); avoid hardcoded version strings.
- Run \`ktlint\` (or \`detekt\`) before committing.`,
      },
      {
        ruleType: "code-style",
        content: `## Kotlin Style

- Follow [Kotlin Coding Conventions](https://kotlinlang.org/docs/coding-conventions.html).
- Classes and interfaces: \`UpperCamelCase\`; functions and properties: \`lowerCamelCase\`; constants: \`UPPER_SNAKE_CASE\`.
- Prefer \`val\` over \`var\`; use \`data class\` for plain data holders.
- Use Kotlin idioms: \`let\`, \`apply\`, \`also\`, scope functions — but avoid nesting more than 2 levels.
- Prefer expression bodies for single-expression functions.
- Use sealed classes/interfaces for exhaustive when-expressions.`,
      },
      {
        ruleType: "architecture",
        content: `## Android Architecture

- Follow Android recommended architecture: UI layer → Domain layer (optional) → Data layer.
- ViewModels expose UI state via \`StateFlow\` / \`SharedFlow\`; Views observe and render.
- Use Hilt (or Koin) for dependency injection; avoid manual service locators.
- Repository pattern for data access; single source of truth in local database (Room) with network sync.
- Navigation via Navigation Component or type-safe navigation; no manual Fragment transactions.
- Keep Android framework dependencies (Context, Activity) out of ViewModels and domain logic.`,
      },
    ];
  },
};

/** Electron：electron 依赖 */
export const electronAdapter: PlatformAdapter = {
  platform: "electron",
  detect(ctx) {
    const has = ctx.dependencyNames.includes("electron");
    if (!has) return null;
    return { platform: "electron", confidence: "high", evidence: ["electron"] };
  },
  contributeRuleSections(): PlatformRuleSection[] {
    return [
      {
        ruleType: "global-overview",
        content: `## Electron Constraints

- Separate main process and renderer process code; never import Node.js modules in the renderer without contextBridge.
- Use \`contextBridge.exposeInMainWorld\` for IPC — never enable \`nodeIntegration\` in renderer.
- Minimize main-process blocking; offload heavy work to worker threads or child processes.
- Package with electron-builder or electron-forge; keep native dependencies compatible with target OS.`,
      },
      {
        ruleType: "architecture",
        content: `## Electron Architecture

- Main process: app lifecycle, window management, IPC handlers, system tray, menus.
- Preload scripts: secure bridge between main and renderer via \`contextBridge\`.
- Renderer process: UI (React/Vue/Svelte); communicates with main only through exposed IPC API.
- Store persistent data via electron-store or SQLite; avoid writing directly to \`userData\` path without abstraction.`,
      },
    ];
  },
};

/** Tauri：@tauri-apps 依赖 + tauri.conf.json */
export const tauriAdapter: PlatformAdapter = {
  platform: "tauri",
  detect(ctx) {
    const hasDep = ctx.dependencyNames.some(
      (n) => n === "@tauri-apps/api" || n === "@tauri-apps/cli" || n.startsWith("@tauri-apps/")
    );
    const hasConf = basenameIs(ctx.files, "tauri.conf.json");
    const hasSrcTauri = ctx.files.some((f) => f.includes("src-tauri/"));
    if (!hasDep && !hasConf && !hasSrcTauri) return null;

    const evidence: string[] = [];
    if (hasDep) evidence.push("@tauri-apps/*");
    if (hasConf) evidence.push("tauri.conf.json");
    if (hasSrcTauri) evidence.push("src-tauri/");
    return { platform: "tauri", confidence: hasConf || hasSrcTauri ? "high" : "medium", evidence };
  },
  getCapabilities(): PlatformCapabilities {
    return { languages: ["Rust"], fileExtensions: [".rs"] };
  },
  contributeRuleSections(): PlatformRuleSection[] {
    return [
      {
        ruleType: "global-overview",
        content: `## Tauri Constraints

- Frontend (JS/TS) communicates with backend (Rust) via Tauri \`invoke\` commands — never shell out from the frontend.
- Rust backend lives in \`src-tauri/\`; keep it focused on system APIs, file I/O, and heavy computation.
- Use Tauri's permission system (\`allowlist\`) to restrict API surface exposed to the webview.
- Build with \`tauri build\`; test both dev (\`tauri dev\`) and production builds before release.`,
      },
      {
        ruleType: "architecture",
        content: `## Tauri Architecture

- Frontend: web framework (React/Vue/Svelte) in \`src/\`; communicates via \`@tauri-apps/api\`.
- Backend: Rust in \`src-tauri/src/\`; expose commands with \`#[tauri::command]\`.
- Shared types: define command payloads in TypeScript interfaces and mirror in Rust structs.
- State: use Tauri managed state (\`tauri::State\`) for cross-command shared data; avoid global mutable statics.`,
      },
    ];
  },
};

/** uni-app：@dcloudio/uni-* 依赖 + pages.json */
export const uniAppAdapter: PlatformAdapter = {
  platform: "uni-app",
  detect(ctx) {
    const hasDep = ctx.dependencyNames.some((n) => n.startsWith("@dcloudio/"));
    if (!hasDep) return null;

    const evidence: string[] = ["@dcloudio/*"];
    const hasPages = basenameIs(ctx.files, "pages.json") && basenameIs(ctx.files, "manifest.json");
    if (hasPages) evidence.push("pages.json");
    return { platform: "uni-app", confidence: "high", evidence };
  },
  contributeRuleSections(): PlatformRuleSection[] {
    return [
      {
        ruleType: "global-overview",
        content: `## uni-app Constraints

- Write pages in Vue SFC; use conditional compilation (\`#ifdef\`) for platform-specific code.
- Route configuration lives in \`pages.json\` — never use vue-router directly.
- Use uni.* API for cross-platform capabilities (storage, network, navigation); avoid wx.* or browser-only APIs.
- Test on at least two target platforms (H5 + WeChat Mini Program) before merging.`,
      },
      {
        ruleType: "architecture",
        content: `## uni-app Architecture

- Pages in \`pages/\`; reusable components in \`components/\`; static assets in \`static/\`.
- State management via Pinia (uni-app Vue 3) or Vuex; keep stores in \`store/\`.
- API abstraction layer in \`api/\` — encapsulate \`uni.request\` behind typed service functions.
- Platform-specific code isolated via conditional compilation blocks, not runtime checks.`,
      },
    ];
  },
};

/** Taro：@tarojs/taro 依赖 */
export const taroAdapter: PlatformAdapter = {
  platform: "taro",
  detect(ctx) {
    const hasDep = ctx.dependencyNames.some(
      (n) => n === "@tarojs/taro" || n === "@tarojs/cli" || n.startsWith("@tarojs/")
    );
    if (!hasDep) return null;
    return { platform: "taro", confidence: "high", evidence: ["@tarojs/*"] };
  },
  contributeRuleSections(): PlatformRuleSection[] {
    return [
      {
        ruleType: "global-overview",
        content: `## Taro Constraints

- Use Taro API (\`Taro.navigateTo\`, \`Taro.request\`, etc.) for cross-platform capabilities.
- Components must use Taro's cross-platform component set; avoid direct use of platform-native components.
- Configure multi-platform builds in \`config/\`; use environment variables for platform-specific behavior.
- Test on target mini-program simulators (WeChat / Alipay / ByteDance) and H5 before merging.`,
      },
      {
        ruleType: "architecture",
        content: `## Taro Architecture

- Pages in \`src/pages/\`; shared components in \`src/components/\`.
- State management via Redux / MobX / Zustand (depending on Taro framework choice: React / Vue).
- API layer wraps \`Taro.request\` with interceptors for auth, error handling, and retry.
- Platform-specific overrides via \`src/platforms/\` or Taro's conditional compilation.`,
      },
    ];
  },
};

/** 微信小程序：project.config.json + .wxml 文件（排除 uni-app / Taro 宿主） */
export const wechatMiniprogramAdapter: PlatformAdapter = {
  platform: "wechat-miniprogram",
  detect(ctx) {
    // uni-app / Taro 编译产物也含小程序文件，不应重复判定
    const isFrameworkHost = ctx.dependencyNames.some(
      (n) => n.startsWith("@dcloudio/") || n.startsWith("@tarojs/")
    );
    if (isFrameworkHost) return null;

    const hasProjectConfig = basenameIs(ctx.files, "project.config.json");
    const hasWxml = hasExtension(ctx.files, ".wxml");
    const hasAppJson = basenameIs(ctx.files, "app.json") && hasWxml;
    if (!hasProjectConfig && !hasAppJson) return null;

    const evidence: string[] = [];
    if (hasProjectConfig) evidence.push("project.config.json");
    if (hasWxml) evidence.push(".wxml");
    return { platform: "wechat-miniprogram", confidence: "high", evidence };
  },
  contributeRuleSections(): PlatformRuleSection[] {
    return [
      {
        ruleType: "global-overview",
        content: `## 微信小程序 Constraints

- Use wx.* API exclusively; no DOM / BOM / Node.js APIs.
- Page structure: .wxml (template), .wxss (style), .js/.ts (logic), .json (config) per page.
- Total package size ≤ 2MB (main package); use subpackages for larger apps.
- Follow [WeChat Mini Program Design Guidelines](https://developers.weixin.qq.com/miniprogram/design/) for UX.`,
      },
      {
        ruleType: "architecture",
        content: `## 微信小程序 Architecture

- Pages in \`pages/\`; reusable components in \`components/\`; common utilities in \`utils/\`.
- App-level state in \`app.js\` globalData or a lightweight store; prefer per-page data for isolation.
- Network requests wrapped in \`utils/request.js\` with unified error handling and token refresh.
- Use behaviors (mixins) for cross-component logic sharing.`,
      },
    ];
  },
};

/** KMP (Kotlin Multiplatform)：commonMain 源集 + KMP gradle 插件 */
export const kmpAdapter: PlatformAdapter = {
  platform: "kmp",
  detect(ctx) {
    const hasCommonMain = ctx.files.some((f) => f.includes("commonMain/"));
    const hasKmpGradle = ctx.files.some((f) => {
      const b = path.basename(f);
      return b === "build.gradle.kts" || b === "build.gradle";
    }) && ctx.files.some((f) => f.includes("shared/") || f.includes("composeApp/"));
    if (!hasCommonMain && !hasKmpGradle) return null;

    const evidence: string[] = [];
    if (hasCommonMain) evidence.push("commonMain/");
    if (hasKmpGradle) evidence.push("KMP gradle");
    return { platform: "kmp", confidence: hasCommonMain ? "high" : "medium", evidence };
  },
  getCapabilities(): PlatformCapabilities {
    return { languages: ["Kotlin"], fileExtensions: [".kt"] };
  },
  contributeRuleSections(): PlatformRuleSection[] {
    return [
      {
        ruleType: "global-overview",
        content: `## Kotlin Multiplatform Constraints

- Shared business logic lives in \`commonMain\`; platform-specific implementations in \`iosMain\`, \`androidMain\`, \`jvmMain\`, etc.
- Use \`expect\`/\`actual\` declarations for platform-specific APIs; keep the \`expect\` surface minimal.
- Prefer Kotlin-first multiplatform libraries (Ktor, kotlinx.serialization, SQLDelight) over platform-native ones in shared code.
- Shared code must not import any platform-specific SDK directly.`,
      },
      {
        ruleType: "architecture",
        content: `## KMP Architecture

- \`shared/\` (or \`composeApp/\`): commonMain for shared domain + data, platform source sets for expect/actual.
- Platform apps (\`androidApp/\`, \`iosApp/\`) consume shared module as a dependency; keep them thin (UI + DI wiring).
- Use Compose Multiplatform for shared UI when targeting Android + Desktop + iOS.
- Testing: shared tests in \`commonTest/\`; platform-specific tests in respective test source sets.`,
      },
    ];
  },
};

/** Ionic：@ionic/* 依赖 */
export const ionicAdapter: PlatformAdapter = {
  platform: "ionic",
  detect(ctx) {
    const has = ctx.dependencyNames.some(
      (n) => n === "@ionic/angular" || n === "@ionic/react" || n === "@ionic/vue" || n === "@ionic/core"
    );
    if (!has) return null;

    const evidence = ctx.dependencyNames.filter((n) => n.startsWith("@ionic/"));
    return { platform: "ionic", confidence: "high", evidence };
  },
  contributeRuleSections(): PlatformRuleSection[] {
    return [
      {
        ruleType: "global-overview",
        content: `## Ionic Constraints

- Use Ionic components (\`ion-*\`) for UI; avoid mixing native HTML elements for core navigation and layout.
- Native device features via Capacitor plugins (\`@capacitor/*\`); avoid Cordova plugins unless no Capacitor alternative exists.
- Test in both browser (ionic serve) and on-device (capacitor run) before merging UI changes.
- Follow platform-specific design guidelines (Material for Android, Human Interface for iOS) via Ionic's adaptive styling.`,
      },
      {
        ruleType: "architecture",
        content: `## Ionic Architecture

- Pages/routes follow the framework pattern (Angular modules, React routes, or Vue routes).
- Capacitor plugin calls wrapped in service layer; components never call Capacitor directly.
- Shared state management consistent with the chosen framework (NgRx / Redux / Pinia).
- Build pipeline: \`ionic build\` → \`npx cap sync\` → platform-specific build (Xcode / Android Studio).`,
      },
    ];
  },
};

/** NativeScript：@nativescript/core 依赖 */
export const nativescriptAdapter: PlatformAdapter = {
  platform: "nativescript",
  detect(ctx) {
    const has = ctx.dependencyNames.some(
      (n) => n === "@nativescript/core" || n === "nativescript" || n.startsWith("@nativescript/")
    );
    const hasConf = basenameIs(ctx.files, "nativescript.config.ts") || basenameIs(ctx.files, "nativescript.config.js");
    if (!has && !hasConf) return null;

    const evidence: string[] = [];
    if (has) evidence.push("@nativescript/*");
    if (hasConf) evidence.push("nativescript.config.*");
    return { platform: "nativescript", confidence: "high", evidence };
  },
  contributeRuleSections(): PlatformRuleSection[] {
    return [
      {
        ruleType: "global-overview",
        content: `## NativeScript Constraints

- Use NativeScript's cross-platform UI components; access native APIs via direct JavaScript-to-native bridge.
- Layouts use NativeScript XML or framework-specific templates (Angular/Vue/Svelte); no HTML/CSS — use NativeScript CSS subset.
- Test on both iOS and Android emulators; platform-specific behavior must be guarded and tested.
- Prefer NativeScript plugins from the marketplace; create custom plugins only when no community solution exists.`,
      },
      {
        ruleType: "architecture",
        content: `## NativeScript Architecture

- App entry in \`app/\` or \`src/\`; follow the framework's standard structure (Angular modules / Vue SFCs).
- Shared services in \`services/\`; platform-specific code guarded by \`isIOS\` / \`isAndroid\` checks.
- Navigation via NativeScript's Frame/Page model or framework router integration.
- Native API access wrapped in TypeScript service classes for testability and abstraction.`,
      },
    ];
  },
};

/**
 * 核心平台适配器注册表。
 */
export const CORE_PLATFORM_ADAPTERS: PlatformAdapter[] = [
  flutterAdapter,
  reactNativeAdapter,
  webAdapter,
  iosAdapter,
  androidAdapter,
  electronAdapter,
  tauriAdapter,
  uniAppAdapter,
  taroAdapter,
  wechatMiniprogramAdapter,
  kmpAdapter,
  ionicAdapter,
  nativescriptAdapter,
];

/**
 * 编排所有注册的平台适配器，返回命中的平台检测结果。
 *
 * 结果按置信度排序（high → medium → low）。单个 adapter 抛错不影响整体检测。
 */
export function detectPlatforms(
  ctx: PlatformDetectContext,
  adapters: PlatformAdapter[] = CORE_PLATFORM_ADAPTERS
): PlatformDetection[] {
  const confidenceOrder: Record<PlatformDetection["confidence"], number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  const results: PlatformDetection[] = [];
  for (const adapter of adapters) {
    try {
      const detection = adapter.detect(ctx);
      if (detection) results.push(detection);
    } catch (error) {
      logger.debug(`平台检测失败：${adapter.platform}`, { error });
    }
  }

  return results.sort(
    (a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence]
  );
}

/** 便捷导出：所有平台标识（供测试 / 后续阶段引用） */
export const ALL_PLATFORMS: readonly Platform[] = [
  "web",
  "ios",
  "android",
  "flutter",
  "react-native",
  "electron",
  "tauri",
  "uni-app",
  "taro",
  "wechat-miniprogram",
  "kmp",
  "ionic",
  "nativescript",
];
