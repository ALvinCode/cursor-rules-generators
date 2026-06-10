/**
 * 平台检测器单元测试
 *
 * 直接构造 PlatformDetectContext，验证核心 5 平台的检测与边界：
 * web / RN 区分、Flutter 宿主壳排除、纯原生识别、纯后端不误报、置信度排序。
 */

import { describe, it, expect } from "vitest";

import { detectPlatforms, flutterAdapter, iosAdapter, androidAdapter, reactNativeAdapter, electronAdapter, tauriAdapter, uniAppAdapter, taroAdapter, wechatMiniprogramAdapter, kmpAdapter, ionicAdapter, nativescriptAdapter } from "../detector.js";
import type { PlatformDetectContext, Platform } from "../types.js";

function ctx(partial: Partial<PlatformDetectContext>): PlatformDetectContext {
  return {
    projectPath: "/tmp/proj",
    files: [],
    dependencyNames: [],
    ...partial,
  };
}

function platformsOf(result: { platform: Platform }[]): Platform[] {
  return result.map((r) => r.platform);
}

describe("detectPlatforms", () => {
  describe("Web", () => {
    it("React（无 react-native）判为 web", () => {
      const result = detectPlatforms(
        ctx({ dependencyNames: ["react", "react-dom"] })
      );
      expect(platformsOf(result)).toContain("web");
      expect(platformsOf(result)).not.toContain("react-native");
    });

    it("Vue 判为 web", () => {
      const result = detectPlatforms(ctx({ dependencyNames: ["vue"] }));
      expect(platformsOf(result)).toEqual(["web"]);
    });

    it("Solid / Qwik / Astro 判为 web", () => {
      for (const dep of ["solid-js", "@builder.io/qwik", "astro"]) {
        const result = detectPlatforms(ctx({ dependencyNames: [dep] }));
        expect(platformsOf(result)).toContain("web");
      }
    });
  });

  describe("React Native", () => {
    it("react-native 依赖判为 react-native，且不误报 web", () => {
      const result = detectPlatforms(
        ctx({ dependencyNames: ["react", "react-native"] })
      );
      expect(platformsOf(result)).toContain("react-native");
      expect(platformsOf(result)).not.toContain("web");
    });

    it("expo 依赖判为 react-native", () => {
      const result = detectPlatforms(
        ctx({ dependencyNames: ["react", "expo"] })
      );
      expect(platformsOf(result)).toContain("react-native");
    });
  });

  describe("Flutter", () => {
    it("pubspec.yaml + .dart 判为 flutter（high）", () => {
      const result = detectPlatforms(
        ctx({ files: ["pubspec.yaml", "lib/main.dart"] })
      );
      const flutter = result.find((r) => r.platform === "flutter");
      expect(flutter).toBeDefined();
      expect(flutter!.confidence).toBe("high");
    });

    it("仅 pubspec.yaml 无 .dart 判为 flutter（medium）", () => {
      const result = detectPlatforms(ctx({ files: ["pubspec.yaml"] }));
      const flutter = result.find((r) => r.platform === "flutter");
      expect(flutter!.confidence).toBe("medium");
    });

    it("Flutter 项目内的 ios/android 宿主壳不被单独识别", () => {
      const result = detectPlatforms(
        ctx({
          files: [
            "pubspec.yaml",
            "lib/main.dart",
            "ios/Podfile",
            "android/app/src/main/AndroidManifest.xml",
          ],
        })
      );
      expect(platformsOf(result)).toEqual(["flutter"]);
    });
  });

  describe("原生 iOS", () => {
    it("Podfile + .swift 判为 ios（high）", () => {
      const result = detectPlatforms(
        ctx({ files: ["Podfile", "App/AppDelegate.swift"] })
      );
      const ios = result.find((r) => r.platform === "ios");
      expect(ios).toBeDefined();
      expect(ios!.confidence).toBe("high");
    });

    it("仅 .swift 文件判为 ios（medium）", () => {
      const result = detectPlatforms(
        ctx({ files: ["Sources/main.swift"] })
      );
      const ios = result.find((r) => r.platform === "ios");
      expect(ios!.confidence).toBe("medium");
    });

    it(".xcodeproj 工程判为 ios", () => {
      const result = detectPlatforms(
        ctx({ files: ["MyApp.xcodeproj/project.pbxproj"] })
      );
      expect(platformsOf(result)).toContain("ios");
    });
  });

  describe("原生 Android", () => {
    it("AndroidManifest.xml 判为 android（high）", () => {
      const result = detectPlatforms(
        ctx({ files: ["app/src/main/AndroidManifest.xml", "build.gradle"] })
      );
      const android = result.find((r) => r.platform === "android");
      expect(android).toBeDefined();
      expect(android!.confidence).toBe("high");
    });

    it("build.gradle + .kt（无 manifest）判为 android（medium）", () => {
      const result = detectPlatforms(
        ctx({ files: ["build.gradle", "src/Main.kt"] })
      );
      const android = result.find((r) => r.platform === "android");
      expect(android!.confidence).toBe("medium");
    });

    it("仅 build.gradle（纯 JVM/Java）不误报 android", () => {
      const result = detectPlatforms(
        ctx({ files: ["build.gradle", "src/Main.java"] })
      );
      expect(platformsOf(result)).not.toContain("android");
    });
  });

  describe("不误报", () => {
    it("纯后端 Node（express，无 web 框架）返回空", () => {
      const result = detectPlatforms(
        ctx({ dependencyNames: ["express", "axios"] })
      );
      expect(result).toEqual([]);
    });

    it("空上下文返回空", () => {
      expect(detectPlatforms(ctx({}))).toEqual([]);
    });
  });

  // ─── contributeRequirements / contributeRuleSections ───────

  describe("Flutter adapter: contributeRequirements", () => {
    it("贡献 code-style 和 architecture 需求", () => {
      const reqs = flutterAdapter.contributeRequirements!(
        ctx({ files: ["pubspec.yaml", "lib/main.dart"] })
      );
      const types = reqs.map((r) => r.ruleType);
      expect(types).toContain("code-style");
      expect(types).toContain("architecture");
    });
  });

  describe("Flutter adapter: contributeRuleSections", () => {
    it("贡献 global-overview / code-style / architecture 内容片段", () => {
      const sections = flutterAdapter.contributeRuleSections!();
      const types = sections.map((s) => s.ruleType);
      expect(types).toContain("global-overview");
      expect(types).toContain("code-style");
      expect(types).toContain("architecture");
      expect(sections.every((s) => s.content.length > 0)).toBe(true);
    });

    it("内容包含 Dart/Flutter 关键约束", () => {
      const sections = flutterAdapter.contributeRuleSections!();
      const global = sections.find((s) => s.ruleType === "global-overview")!;
      expect(global.content).toContain("dart format");
      expect(global.content).toContain("dynamic");
    });
  });

  describe("iOS adapter: contributeRequirements", () => {
    it("贡献 code-style 和 architecture 需求", () => {
      const reqs = iosAdapter.contributeRequirements!(
        ctx({ files: ["Podfile", "App.swift"] })
      );
      const types = reqs.map((r) => r.ruleType);
      expect(types).toContain("code-style");
      expect(types).toContain("architecture");
    });
  });

  describe("iOS adapter: contributeRuleSections", () => {
    it("贡献 global-overview / code-style / architecture 片段", () => {
      const sections = iosAdapter.contributeRuleSections!();
      const types = sections.map((s) => s.ruleType);
      expect(types).toContain("global-overview");
      expect(types).toContain("code-style");
      expect(types).toContain("architecture");
    });

    it("内容包含 Swift 关键约束", () => {
      const sections = iosAdapter.contributeRuleSections!();
      const global = sections.find((s) => s.ruleType === "global-overview")!;
      expect(global.content).toContain("Swift");
      expect(global.content).toContain("force-unwrap");
    });
  });

  describe("Android adapter: contributeRequirements", () => {
    it("贡献 code-style 和 architecture 需求", () => {
      const reqs = androidAdapter.contributeRequirements!(
        ctx({ files: ["AndroidManifest.xml", "Main.kt"] })
      );
      const types = reqs.map((r) => r.ruleType);
      expect(types).toContain("code-style");
      expect(types).toContain("architecture");
    });
  });

  describe("Android adapter: contributeRuleSections", () => {
    it("贡献 global-overview / code-style / architecture 片段", () => {
      const sections = androidAdapter.contributeRuleSections!();
      const types = sections.map((s) => s.ruleType);
      expect(types).toContain("global-overview");
      expect(types).toContain("code-style");
      expect(types).toContain("architecture");
    });

    it("内容包含 Kotlin 关键约束", () => {
      const sections = androidAdapter.contributeRuleSections!();
      const global = sections.find((s) => s.ruleType === "global-overview")!;
      expect(global.content).toContain("Kotlin");
      expect(global.content).toContain("coroutines");
    });
  });

  describe("React Native adapter: contributeRequirements", () => {
    it("贡献 code-style 和 architecture 需求", () => {
      const reqs = reactNativeAdapter.contributeRequirements!(
        ctx({ dependencyNames: ["react-native", "react"] })
      );
      const types = reqs.map((r) => r.ruleType);
      expect(types).toContain("code-style");
      expect(types).toContain("architecture");
    });
  });

  describe("React Native adapter: contributeRuleSections", () => {
    it("贡献 global-overview / code-style / architecture 片段", () => {
      const sections = reactNativeAdapter.contributeRuleSections!();
      const types = sections.map((s) => s.ruleType);
      expect(types).toContain("global-overview");
      expect(types).toContain("code-style");
      expect(types).toContain("architecture");
    });

    it("内容包含 RN 关键约束", () => {
      const sections = reactNativeAdapter.contributeRuleSections!();
      const global = sections.find((s) => s.ruleType === "global-overview")!;
      expect(global.content).toContain("React Native");
      expect(global.content).toContain("StyleSheet.create");
    });

    it("架构片段包含 React Navigation", () => {
      const sections = reactNativeAdapter.contributeRuleSections!();
      const arch = sections.find((s) => s.ruleType === "architecture")!;
      expect(arch.content).toContain("React Navigation");
    });
  });

  // ─── B1: Electron / Tauri ───────────────────────────────────

  describe("Electron", () => {
    it("electron 依赖判为 electron", () => {
      const result = detectPlatforms(ctx({ dependencyNames: ["electron"] }));
      expect(platformsOf(result)).toContain("electron");
    });

    it("无 electron 依赖不判为 electron", () => {
      const result = detectPlatforms(ctx({ dependencyNames: ["react"] }));
      expect(platformsOf(result)).not.toContain("electron");
    });

    it("contributeRuleSections 包含 Electron 约束", () => {
      const sections = electronAdapter.contributeRuleSections!();
      expect(sections.some((s) => s.content.includes("contextBridge"))).toBe(true);
    });
  });

  describe("Tauri", () => {
    it("@tauri-apps/api 依赖判为 tauri", () => {
      const result = detectPlatforms(ctx({ dependencyNames: ["@tauri-apps/api"] }));
      expect(platformsOf(result)).toContain("tauri");
    });

    it("tauri.conf.json 判为 tauri (high)", () => {
      const result = detectPlatforms(ctx({ files: ["tauri.conf.json"] }));
      const tauri = result.find((r) => r.platform === "tauri");
      expect(tauri).toBeDefined();
      expect(tauri!.confidence).toBe("high");
    });

    it("src-tauri/ 目录判为 tauri", () => {
      const result = detectPlatforms(ctx({ files: ["src-tauri/src/main.rs"] }));
      expect(platformsOf(result)).toContain("tauri");
    });

    it("getCapabilities 声明 Rust", () => {
      const caps = tauriAdapter.getCapabilities!();
      expect(caps.languages).toContain("Rust");
      expect(caps.fileExtensions).toContain(".rs");
    });
  });

  // ─── B2: uni-app / Taro / 微信小程序 ────────────────────────

  describe("uni-app", () => {
    it("@dcloudio 依赖判为 uni-app", () => {
      const result = detectPlatforms(ctx({ dependencyNames: ["@dcloudio/uni-app"] }));
      expect(platformsOf(result)).toContain("uni-app");
    });

    it("contributeRuleSections 包含条件编译约束", () => {
      const sections = uniAppAdapter.contributeRuleSections!();
      expect(sections.some((s) => s.content.includes("#ifdef"))).toBe(true);
    });
  });

  describe("Taro", () => {
    it("@tarojs/taro 依赖判为 taro", () => {
      const result = detectPlatforms(ctx({ dependencyNames: ["@tarojs/taro"] }));
      expect(platformsOf(result)).toContain("taro");
    });
  });

  describe("微信小程序", () => {
    it("project.config.json + .wxml 判为 wechat-miniprogram", () => {
      const result = detectPlatforms(ctx({ files: ["project.config.json", "pages/index/index.wxml"] }));
      expect(platformsOf(result)).toContain("wechat-miniprogram");
    });

    it("uni-app 项目不重复判为小程序", () => {
      const result = detectPlatforms(ctx({
        dependencyNames: ["@dcloudio/uni-app"],
        files: ["project.config.json", "pages/index/index.wxml"],
      }));
      expect(platformsOf(result)).not.toContain("wechat-miniprogram");
      expect(platformsOf(result)).toContain("uni-app");
    });

    it("Taro 项目不重复判为小程序", () => {
      const result = detectPlatforms(ctx({
        dependencyNames: ["@tarojs/taro"],
        files: ["project.config.json", "pages/index/index.wxml"],
      }));
      expect(platformsOf(result)).not.toContain("wechat-miniprogram");
      expect(platformsOf(result)).toContain("taro");
    });

    it("contributeRuleSections 包含 wx.* 约束", () => {
      const sections = wechatMiniprogramAdapter.contributeRuleSections!();
      expect(sections.some((s) => s.content.includes("wx.*"))).toBe(true);
    });
  });

  // ─── B3: KMP / Ionic / NativeScript ─────────────────────────

  describe("KMP", () => {
    it("commonMain/ 目录判为 kmp (high)", () => {
      const result = detectPlatforms(ctx({ files: ["shared/src/commonMain/kotlin/Main.kt"] }));
      const kmp = result.find((r) => r.platform === "kmp");
      expect(kmp).toBeDefined();
      expect(kmp!.confidence).toBe("high");
    });

    it("getCapabilities 声明 Kotlin", () => {
      const caps = kmpAdapter.getCapabilities!();
      expect(caps.languages).toContain("Kotlin");
    });

    it("contributeRuleSections 包含 expect/actual", () => {
      const sections = kmpAdapter.contributeRuleSections!();
      expect(sections.some((s) => s.content.includes("expect"))).toBe(true);
    });
  });

  describe("Ionic", () => {
    it("@ionic/react 依赖判为 ionic", () => {
      const result = detectPlatforms(ctx({ dependencyNames: ["@ionic/react"] }));
      expect(platformsOf(result)).toContain("ionic");
    });

    it("无 @ionic 依赖不判为 ionic", () => {
      const result = detectPlatforms(ctx({ dependencyNames: ["react"] }));
      expect(platformsOf(result)).not.toContain("ionic");
    });
  });

  describe("NativeScript", () => {
    it("@nativescript/core 依赖判为 nativescript", () => {
      const result = detectPlatforms(ctx({ dependencyNames: ["@nativescript/core"] }));
      expect(platformsOf(result)).toContain("nativescript");
    });

    it("nativescript.config.ts 判为 nativescript", () => {
      const result = detectPlatforms(ctx({ files: ["nativescript.config.ts"] }));
      expect(platformsOf(result)).toContain("nativescript");
    });
  });

  describe("置信度排序", () => {
    it("high 排在 medium 前", () => {
      const result = detectPlatforms(
        ctx({
          files: ["Podfile", "App.swift", "build.gradle", "Main.kt"],
        })
      );
      expect(result[0].confidence).toBe("high");
      const confidences = result.map((r) => r.confidence);
      const firstMedium = confidences.indexOf("medium");
      const lastHigh = confidences.lastIndexOf("high");
      if (firstMedium !== -1) {
        expect(lastHigh).toBeLessThan(firstMedium);
      }
    });
  });
});
