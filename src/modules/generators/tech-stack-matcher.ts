/**
 * 技术栈匹配器（扩展版）
 * 根据项目使用的技术栈，从 awesome-cursorrules 中找到最匹配的规则格式
 * 支持所有类别：Frontend、Backend、Mobile、CSS、State Management、Database、Testing、Hosting、Build Tools、Language-Specific、Other
 */

import { TechStack } from '../../types.js';
import { logger } from "../../utils/logger.js";
import { resolvePackageResource } from "../../utils/package-paths.js";
import { jaccardSimilarity } from "../../utils/similarity.js";
import { FileUtils } from "../../utils/file-utils.js";

export interface TechStackMatch {
  category: string; // 'frontend' | 'backend' | 'mobile' | 'styling' | 'state' | 'database' | 'testing' | 'hosting' | 'build' | 'language' | 'other'
  ruleName: string;
  similarity: number;
  sampleFile?: string;
  format?: string;
  techStack: string[];
}

export interface MultiCategoryMatch {
  matches: TechStackMatch[];
  primaryMatch: TechStackMatch | null;
  categories: string[];
}

/**
 * 技术栈关键词映射（按类别）
 */
const TECH_KEYWORDS_MAP: Record<string, string[]> = {
  // Frontend Frameworks and Libraries
  frontend: [
    'react', 'vue', 'angular', 'svelte', 'nextjs', 'next.js', 'nuxt', 
    'remix', 'gatsby', 'astro', 'solid', 'qwik', 'preact', 'lit'
  ],
  // Backend and Full-Stack
  backend: [
    'nodejs', 'node.js', 'express', 'fastify', 'koa', 'nestjs', 'hapi',
    'django', 'flask', 'fastapi', 'rails', 'laravel', 'spring', 'asp.net',
    'go', 'rust', 'php', 'java', 'csharp', 'dotnet', 'python'
  ],
  // Mobile Development
  mobile: [
    'react-native', 'expo', 'flutter', 'ionic', 'capacitor', 'cordova',
    'swift', 'kotlin', 'android', 'ios', 'xamarin', 'titanium'
  ],
  // CSS and Styling
  styling: [
    'tailwind', 'css', 'sass', 'scss', 'less', 'stylus', 'styled-components',
    'emotion', 'mui', 'material-ui', 'chakra', 'antd', 'bootstrap'
  ],
  // State Management
  state: [
    'redux', 'mobx', 'zustand', 'jotai', 'recoil', 'pinia', 'vuex',
    'ngrx', 'akita', 'effector', 'valtio'
  ],
  // Database and API
  database: [
    'mongodb', 'postgresql', 'mysql', 'sqlite', 'redis', 'prisma',
    'sequelize', 'typeorm', 'mongoose', 'drizzle', 'supabase', 'firebase',
    'graphql', 'rest', 'grpc', 'trpc'
  ],
  // Testing
  testing: [
    'jest', 'vitest', 'mocha', 'cypress', 'playwright', 'puppeteer',
    'testing-library', 'enzyme', 'karma', 'jasmine', 'ava', 'tape'
  ],
  // Hosting and Deployments
  hosting: [
    'vercel', 'netlify', 'aws', 'azure', 'gcp', 'cloudflare', 'heroku',
    'docker', 'kubernetes', 'terraform', 'ansible', 'ci/cd', 'github-actions'
  ],
  // Build Tools and Development
  build: [
    'webpack', 'vite', 'rollup', 'esbuild', 'swc', 'turbo', 'nx',
    'turborepo', 'pnpm', 'yarn', 'npm', 'bun', 'deno'
  ],
  // Language-Specific
  language: [
    'typescript', 'javascript', 'python', 'java', 'go', 'rust', 'c++',
    'csharp', 'php', 'ruby', 'swift', 'kotlin', 'dart', 'scala', 'clojure'
  ],
  // Other
  other: [
    'blockchain', 'solidity', 'web3', 'ai', 'ml', 'tensorflow', 'pytorch',
    'unity', 'unreal', 'game', 'cli', 'electron', 'tauri', 'pwa'
  ]
};

/**
 * 技术栈相似度（Jaccard）。实现统一在 `src/utils/similarity.ts`。
 */
const calculateSimilarity = jaccardSimilarity;

/**
 * 从规则文件名中提取技术栈
 */
function extractTechStackFromFileName(fileName: string): string[] {
  const techStack: string[] = [];
  const lower = fileName.toLowerCase();
  
  // 遍历所有类别的关键词
  for (const [category, keywords] of Object.entries(TECH_KEYWORDS_MAP)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        // 标准化技术栈名称
        const normalized = normalizeTechName(keyword);
        if (!techStack.includes(normalized)) {
          techStack.push(normalized);
        }
      }
    }
  }
  
  return techStack;
}

/**
 * 标准化技术栈名称
 */
function normalizeTechName(name: string): string {
  const nameMap: Record<string, string> = {
    'nextjs': 'Next.js',
    'next.js': 'Next.js',
    'nodejs': 'Node.js',
    'node.js': 'Node.js',
    'react-native': 'React Native',
    'asp.net': 'ASP.NET',
    'material-ui': 'Material-UI',
    'styled-components': 'Styled Components',
    'testing-library': 'Testing Library',
    'github-actions': 'GitHub Actions',
    'ci/cd': 'CI/CD'
  };
  
  return nameMap[name.toLowerCase()] || name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * 加载规则索引
 */
async function loadRuleIndex(): Promise<any[]> {
  // 规则索引文件随 npm 包分发，必须从包根解析。
  const indexPath = resolvePackageResource(
    'docs',
    'story',
    'awesome-cursorrules-samples',
    'index.json'
  );

  try {
    const indexContent = await FileUtils.readFile(indexPath);
    const index = JSON.parse(indexContent);
    return index.rules || [];
  } catch (error) {
    logger.debug('无法加载规则索引，使用空数组', { error });
    return [];
  }
}

/**
 * 匹配所有类别的技术栈规则
 */
export async function findBestTechStackMatches(
  techStack: TechStack
): Promise<MultiCategoryMatch> {
  const projectStack = [
    ...techStack.primary,
    ...techStack.frameworks,
    ...techStack.languages
  ];

  logger.debug('开始多类别技术栈匹配', { projectStack });

  // 加载规则索引
  const rules = await loadRuleIndex();
  
  if (rules.length === 0) {
    logger.warn('未找到规则索引，返回空匹配');
    return {
      matches: [],
      primaryMatch: null,
      categories: []
    };
  }

  const matches: TechStackMatch[] = [];
  const categoryMatches: Record<string, TechStackMatch[]> = {};

  // 对每个规则计算相似度
  for (const rule of rules) {
    const ruleTechStack = extractTechStackFromFileName(rule.name);
    const similarity = calculateSimilarity(projectStack, ruleTechStack);
    
    if (similarity > 0.1) { // 最低相似度阈值
      const category = rule.category || 'other';
      const match: TechStackMatch = {
        category,
        ruleName: rule.name,
        similarity,
        sampleFile: rule.name.replace(/\//g, '-') + '.cursorrules',
        format: 'persona-first', // 默认格式，可以从文件内容检测
        techStack: ruleTechStack
      };
      
      matches.push(match);
      
      if (!categoryMatches[category]) {
        categoryMatches[category] = [];
      }
      categoryMatches[category].push(match);
    }
  }

  // 按相似度排序
  matches.sort((a, b) => b.similarity - a.similarity);
  
  // 每个类别选择最佳匹配
  for (const category of Object.keys(categoryMatches)) {
    categoryMatches[category].sort((a, b) => b.similarity - a.similarity);
  }

  // 找到主要匹配（最高相似度）
  const primaryMatch = matches.length > 0 ? matches[0] : null;

  // 获取所有涉及的类别
  const categories = Array.from(new Set(matches.map(m => m.category)));

  logger.info('多类别技术栈匹配完成', {
    totalMatches: matches.length,
    categories: categories.length,
    primaryMatch: primaryMatch?.ruleName,
    primarySimilarity: primaryMatch ? Math.round(primaryMatch.similarity * 100) + '%' : 'N/A'
  });

  return {
    matches,
    primaryMatch,
    categories
  };
}

/**
 * 获取特定类别的最佳匹配
 */
export function getBestMatchForCategory(
  multiMatch: MultiCategoryMatch,
  category: string
): TechStackMatch | null {
  const categoryMatches = multiMatch.matches.filter(m => m.category === category);
  return categoryMatches.length > 0 ? categoryMatches[0] : null;
}


