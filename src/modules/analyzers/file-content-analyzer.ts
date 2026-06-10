import * as path from "path";
import { FileUtils } from "../../utils/file-utils.js";
import { logger } from "../../utils/logger.js";
import { FileTypeCategory } from '../../types.js';

interface FileContentAnalysisResult {
  isPage: boolean;
  isComponent: boolean;
  isAPI: boolean;
  isUtility: boolean;
  isModel: boolean;
  isHook: boolean;
  isPureFunction: boolean;
  uiLibrary?: string;
  businessKeywords: string[];
}

/**
 * 文件内容深度分析器
 * 通过分析文件内容（语法、函数、变量等）来推断目录职能
 */
export class FileContentAnalyzer {
  /**
   * 分析目录内文件内容，推断目录职能
   */
  async analyzeDirectoryContent(
    dirPath: string,
    files: string[],
    projectPath: string
  ): Promise<{
    purpose: string;
    confidence: "high" | "medium" | "low";
    indicators: string[];
    businessKeywords: string[];
  }> {
    const indicators: string[] = [];
    const businessKeywords: string[] = [];
    let purpose = "";
    let confidence: "high" | "medium" | "low" = "low";

    // 特殊路径处理：public/assets 或 static 目录
    const normalizedPath = dirPath.toLowerCase();
    if (
      normalizedPath.includes("/public/assets") ||
      normalizedPath.includes("/public/static") ||
      normalizedPath.includes("/static/") ||
      (normalizedPath.includes("/assets/") && normalizedPath.includes("/public/"))
    ) {
      return {
        purpose: "资源文件",
        confidence: "high",
        indicators: ["检测到资源文件目录（public/assets 或 static）"],
        businessKeywords: [],
      };
    }

    // 分析文件内容
    const contentAnalysis = await this.analyzeFiles(files, projectPath);

    // 1. 检查是否是页面
    if (contentAnalysis.isPage) {
      purpose = this.inferPagePurpose(dirPath, contentAnalysis.businessKeywords);
      confidence = "high";
      indicators.push("检测到页面组件（export default function XxxPage）");
      return { purpose, confidence, indicators, businessKeywords: contentAnalysis.businessKeywords };
    }

    // 2. 检查是否是组件
    if (contentAnalysis.isComponent) {
      purpose = this.inferComponentPurpose(dirPath, contentAnalysis);
      confidence = "high";
      indicators.push("检测到 React 组件（JSX、函数组件）");
      if (contentAnalysis.uiLibrary) {
        indicators.push(`使用 UI 库: ${contentAnalysis.uiLibrary}`);
      }
      return { purpose, confidence, indicators, businessKeywords: contentAnalysis.businessKeywords };
    }

    // 3. 检查是否是 API/Service
    if (contentAnalysis.isAPI) {
      purpose = this.inferAPIPurpose(dirPath, contentAnalysis.businessKeywords);
      confidence = "high";
      indicators.push("检测到 API 调用（axios/fetch）");
      return { purpose, confidence, indicators, businessKeywords: contentAnalysis.businessKeywords };
    }

    // 4. 检查是否是工具函数
    if (contentAnalysis.isUtility) {
      purpose = this.inferUtilityPurpose(dirPath, contentAnalysis.businessKeywords);
      confidence = contentAnalysis.isPureFunction ? "high" : "medium";
      indicators.push("检测到工具函数（纯函数、无副作用）");
      return { purpose, confidence, indicators, businessKeywords: contentAnalysis.businessKeywords };
    }

    // 5. 检查是否是数据模型
    if (contentAnalysis.isModel) {
      purpose = this.inferModelPurpose(dirPath, contentAnalysis.businessKeywords);
      confidence = "high";
      indicators.push("检测到数据模型（schema、model、entity）");
      return { purpose, confidence, indicators, businessKeywords: contentAnalysis.businessKeywords };
    }

    // 6. 检查是否是 Hook
    if (contentAnalysis.isHook) {
      purpose = this.inferHookPurpose(dirPath, contentAnalysis.businessKeywords);
      confidence = "high";
      indicators.push("检测到自定义 Hook（useXxx 函数）");
      return { purpose, confidence, indicators, businessKeywords: contentAnalysis.businessKeywords };
    }

    // 7. 基于业务关键词推断
    if (contentAnalysis.businessKeywords.length > 0) {
      purpose = this.inferBusinessPurpose(dirPath, contentAnalysis.businessKeywords, contentAnalysis);
      confidence = "medium";
      indicators.push(`检测到业务关键词: ${contentAnalysis.businessKeywords.join(", ")}`);
      return { purpose, confidence, indicators, businessKeywords: contentAnalysis.businessKeywords };
    }

    return {
      purpose: "",
      confidence: "low",
      indicators: ["无法从文件内容确定目录职能"],
      businessKeywords: [],
    };
  }

  /**
   * 分析文件内容
   */
  private async analyzeFiles(
    files: string[],
    projectPath: string
  ): Promise<{
    isPage: boolean;
    isComponent: boolean;
    isAPI: boolean;
    isUtility: boolean;
    isModel: boolean;
    isHook: boolean;
    isPureFunction: boolean;
    uiLibrary?: string;
    businessKeywords: string[];
  }> {
    const result = {
      isPage: false,
      isComponent: false,
      isAPI: false,
      isUtility: false,
      isModel: false,
      isHook: false,
      isPureFunction: false,
      uiLibrary: undefined as string | undefined,
      businessKeywords: [] as string[],
    };

    // 只分析代码文件（限制数量以提高性能）
    const codeFiles = files
      .filter((f) => [".ts", ".tsx", ".js", ".jsx"].includes(path.extname(f)))
      .slice(0, 10);

    for (const file of codeFiles) {
      try {
        const content = await FileUtils.readFile(file);
        const analysis = this.analyzeFileContent(content);

        // 合并结果
        if (analysis.isPage) result.isPage = true;
        if (analysis.isComponent) result.isComponent = true;
        if (analysis.isAPI) result.isAPI = true;
        if (analysis.isUtility) result.isUtility = true;
        if (analysis.isModel) result.isModel = true;
        if (analysis.isHook) result.isHook = true;
        if (analysis.isPureFunction) result.isPureFunction = true;
        if (analysis.uiLibrary) result.uiLibrary = analysis.uiLibrary;
        result.businessKeywords.push(...analysis.businessKeywords);
      } catch (error) {
        logger.debug(`分析文件失败: ${file}`, error);
      }
    }

    // 去重业务关键词
    result.businessKeywords = Array.from(new Set(result.businessKeywords));

    return result;
  }

  /**
   * 分析单个文件内容
   */
  private analyzeFileContent(content: string): FileContentAnalysisResult {
    const result = {
      isPage: false,
      isComponent: false,
      isAPI: false,
      isUtility: false,
      isModel: false,
      isHook: false,
      isPureFunction: false,
      uiLibrary: undefined as string | undefined,
      businessKeywords: [] as string[],
    };

    // 检查是否是页面
    if (
      content.match(/export\s+default\s+function\s+\w+Page\s*\(/i) ||
      content.match(/export\s+default\s+function\s+Page\s*\(/i) ||
      content.includes("getServerSideProps") ||
      content.includes("getStaticProps") ||
      content.includes("getStaticPaths")
    ) {
      result.isPage = true;
    }

    // 检查是否是组件
    if (
      content.includes("return (") && content.includes("<") ||
      content.match(/export\s+(?:default\s+)?(?:const|function)\s+\w+\s*=\s*\(/s) ||
      content.includes("extends React.Component") ||
      content.includes("extends Component")
    ) {
      result.isComponent = true;
    }

    // 检查 UI 库
    if (content.includes("@mui/material") || content.includes("from '@mui")) {
      result.uiLibrary = "Material-UI";
    } else if (content.includes("from 'antd'") || content.includes('from "antd"')) {
      result.uiLibrary = "Ant Design";
    } else if (content.includes("@chakra-ui")) {
      result.uiLibrary = "Chakra UI";
    }

    // 检查是否是 API
    if (
      content.match(/fetch\s*\(/) ||
      content.match(/axios\.(get|post|put|delete)/) ||
      content.match(/\.get\s*\(/) ||
      content.match(/\.post\s*\(/) ||
      content.match(/api\./) ||
      content.match(/http\./) ||
      content.match(/['"]\/api\//) ||
      content.match(/['"]https?:\/\//)
    ) {
      result.isAPI = true;
    }

    // 检查是否是工具函数
    const functionExports = (content.match(/export\s+(?:const|function)\s+\w+/g) || []).length;
    const hasReact = content.includes("react");
    const hasAPI = content.includes("fetch") || content.includes("axios");
    const hasState = content.includes("useState") || content.includes("useEffect");

    if (functionExports >= 3 && !hasReact && !hasAPI && !hasState) {
      result.isUtility = true;
      result.isPureFunction = true;
    }

    // 检查是否是数据模型
    if (
      content.match(/export\s+(?:interface|type|class)\s+\w+Model/i) ||
      content.match(/schema\s*[:=]/) ||
      content.match(/model\s*[:=]/) ||
      content.match(/entity\s*[:=]/) ||
      content.includes("prisma") ||
      content.includes("mongoose")
    ) {
      result.isModel = true;
    }

    // 检查是否是 Hook
    if (
      content.match(/export\s+(?:const|function)\s+use[A-Z]\w+\s*=/)
    ) {
      result.isHook = true;
    }

    // 提取业务关键词
    result.businessKeywords = this.extractBusinessKeywords(content);

    return result;
  }

  /**
   * 提取业务关键词
   */
  private extractBusinessKeywords(content: string): string[] {
    const keywords: string[] = [];

    // 常见业务领域关键词
    const businessDomains = [
      "user", "auth", "login", "register", "profile",
      "payment", "pay", "wallet", "balance", "transaction",
      "order", "cart", "product", "inventory",
      "insurance", "claim", "policy", "premium",
      "loan", "credit", "repayment", "installment",
      "report", "dashboard", "analytics", "statistics",
      "notification", "message", "email", "sms",
      "document", "file", "upload", "download",
      "setting", "config", "preference",
    ];

    const contentLower = content.toLowerCase();

    // 排除常见的误匹配模式
    const excludePatterns = [
      /useState/gi,  // 避免匹配 useState 中的 "user"
      /useEffect/gi,
      /useCallback/gi,
      /useMemo/gi,
      /useRef/gi,
      /useContext/gi,
      /useReducer/gi,
      /useSelector/gi,
      /useDispatch/gi,
      /userAgent/gi,  // 避免匹配 userAgent
      /username/gi,    // username 是技术术语，不是业务关键词
      /password/gi,
      /token/gi,
      /session/gi,
      /cookie/gi,
    ];

    // 检查内容是否包含排除模式
    const hasExcludePattern = excludePatterns.some((pattern) =>
      pattern.test(content)
    );

    // 如果包含排除模式，降低匹配精度
    for (const domain of businessDomains) {
      // 更精确的匹配模式
      const patterns = [
        // 变量/函数/类型声明：const user =, function user(), interface User
        new RegExp(`(?:const|let|var|function|interface|type|class|enum)\\s+${domain}\\w*`, "gi"),
        // 对象属性：user.name, user.id
        new RegExp(`\\b${domain}\\.\\w+`, "gi"),
        // 字符串字面量：'/api/user', "/user"
        new RegExp(`['"]/[^'"]*${domain}[^'"]*['"]`, "gi"),
        // 导入路径：from './user', import user from
        new RegExp(`(?:from|import).*['"]\\.?/?[^'"]*${domain}[^'"]*['"]`, "gi"),
      ];

      // 如果包含排除模式，只使用更严格的模式
      const useStrictPatterns = hasExcludePattern && domain === "user";

      for (const pattern of patterns) {
        if (pattern.test(content)) {
          // 对于 "user" 关键词，需要额外检查不是 React Hook
          if (domain === "user" && useStrictPatterns) {
            // 检查是否是 React Hook 相关
            if (
              contentLower.includes("usestate") ||
              contentLower.includes("useeffect") ||
              contentLower.includes("usecontext")
            ) {
              continue;
            }
          }
          keywords.push(domain);
          break;
        }
      }
    }

    return Array.from(new Set(keywords));
  }

  /**
   * 推断页面职能
   */
  private inferPagePurpose(
    dirPath: string,
    businessKeywords: string[]
  ): string {
    const dirName = path.basename(dirPath);
    
    if (businessKeywords.length > 0) {
      const keyword = this.translateKeyword(businessKeywords[0]);
      return `${keyword} 页面`;
    }

    if (dirName !== "pages" && dirName !== "page") {
      return `${dirName} 页面`;
    }

    return "页面";
  }

  /**
   * 推断组件职能
   */
  private inferComponentPurpose(
    dirPath: string,
    analysis: FileContentAnalysisResult
  ): string {
    const dirName = path.basename(dirPath);
    const parts: string[] = [];

    // 添加业务关键词
    if (analysis.businessKeywords.length > 0) {
      const keyword = this.translateKeyword(analysis.businessKeywords[0]);
      parts.push(keyword);
    } else if (dirName !== "components" && dirName !== "component") {
      parts.push(dirName);
    }

    // 添加组件类型
    if (analysis.uiLibrary) {
      parts.push(`${analysis.uiLibrary} 组件`);
    } else {
      parts.push("组件");
    }

    return parts.join(" ");
  }

  /**
   * 推断 API 职能
   */
  private inferAPIPurpose(
    dirPath: string,
    businessKeywords: string[]
  ): string {
    const dirName = path.basename(dirPath);
    
    if (businessKeywords.length > 0) {
      const keyword = this.translateKeyword(businessKeywords[0]);
      return `${keyword} 接口`;
    }

    if (dirName !== "api" && dirName !== "apis" && dirName !== "services") {
      return `${dirName} API 服务`;
    }

    return "API 服务";
  }

  /**
   * 推断工具函数职能
   */
  private inferUtilityPurpose(
    dirPath: string,
    businessKeywords: string[]
  ): string {
    const dirName = path.basename(dirPath);
    
    if (businessKeywords.length > 0) {
      const keyword = this.translateKeyword(businessKeywords[0]);
      return `${keyword} 工具`;
    }

    if (dirName !== "utils" && dirName !== "utilities" && dirName !== "helpers") {
      return `${dirName} 工具函数`;
    }

    return "工具函数";
  }

  /**
   * 推断数据模型职能
   */
  private inferModelPurpose(
    dirPath: string,
    businessKeywords: string[]
  ): string {
    const dirName = path.basename(dirPath);
    
    if (businessKeywords.length > 0) {
      const keyword = this.translateKeyword(businessKeywords[0]);
      return `${keyword} 数据模型`;
    }

    if (dirName !== "models" && dirName !== "model" && dirName !== "entities") {
      return `${dirName} 数据模型`;
    }

    return "数据模型";
  }

  /**
   * 推断 Hook 职能
   */
  private inferHookPurpose(
    dirPath: string,
    businessKeywords: string[]
  ): string {
    const dirName = path.basename(dirPath);
    
    if (businessKeywords.length > 0) {
      const keyword = this.translateKeyword(businessKeywords[0]);
      return `${keyword} Hooks`;
    }

    if (dirName !== "hooks" && dirName !== "hook") {
      return `${dirName} Hooks`;
    }

    return "Hooks";
  }

  /**
   * 推断业务职能
   */
  private inferBusinessPurpose(
    dirPath: string,
    businessKeywords: string[],
    analysis: FileContentAnalysisResult
  ): string {
    const dirName = path.basename(dirPath);
    const keyword = this.translateKeyword(businessKeywords[0]);

    if (analysis.isComponent) {
      return `${keyword} 组件`;
    } else if (analysis.isAPI) {
      return `${keyword} 接口`;
    } else if (analysis.isUtility) {
      return `${keyword} 工具`;
    } else if (analysis.isModel) {
      return `${keyword} 数据模型`;
    } else {
      return keyword;
    }
  }

  /**
   * 翻译关键词（英文 -> 中文）
   */
  private translateKeyword(keyword: string): string {
    const translations: Record<string, string> = {
      user: "用户",
      auth: "认证",
      login: "登录",
      register: "注册",
      profile: "个人资料",
      payment: "支付",
      pay: "支付",
      wallet: "钱包",
      balance: "余额",
      transaction: "交易",
      order: "订单",
      cart: "购物车",
      product: "产品",
      inventory: "库存",
      insurance: "保险",
      claim: "理赔",
      policy: "保单",
      premium: "保费",
      loan: "贷款",
      credit: "信用",
      repayment: "还款",
      installment: "分期",
      report: "报表",
      dashboard: "仪表盘",
      analytics: "分析",
      statistics: "统计",
      notification: "通知",
      message: "消息",
      email: "邮件",
      sms: "短信",
      document: "文档",
      file: "文件",
      upload: "上传",
      download: "下载",
      setting: "设置",
      config: "配置",
      preference: "偏好",
    };

    return translations[keyword.toLowerCase()] || keyword;
  }
}

