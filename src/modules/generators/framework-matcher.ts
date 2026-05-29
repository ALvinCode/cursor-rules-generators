/**
 * 框架匹配器
 * 根据项目使用的技术栈，从 awesome-cursorrules 中找到最匹配的规则格式
 */

import { TechStack } from '../../types.js';
import { logger } from "../../utils/logger.js";
import { jaccardSimilarity } from "../../utils/similarity.js";

export interface FrameworkMatch {
  framework: string;
  similarity: number;
  sampleFile?: string;
  format?: string;
}

/**
 * awesome-cursorrules 中的框架规则映射
 * 基于提取的 30 个规则文件分析
 */
interface FrameworkRuleEntry {
  files: string[];
  format: 'persona-first' | 'title-first' | 'mixed' | 'code-comment';
  techStack: string[];
  requiredTech?: string[];
}

const FRAMEWORK_RULES_MAP: Record<string, FrameworkRuleEntry> = {
  'react-typescript': {
    files: [
      'react-components-creation-cursorrules-prompt-file',
      'cursor-ai-react-typescript-shadcn-ui-cursorrules-p'
    ],
    format: 'persona-first',
    techStack: ['React', 'TypeScript', 'Shadcn', 'Tailwind'],
    requiredTech: ['React']
  },
  'nextjs-typescript': {
    files: [
      'nextjs-typescript-cursorrules-prompt-file',
      'nextjs-react-typescript-cursorrules-prompt-file',
      'nextjs-typescript-tailwind-cursorrules-prompt-file'
    ],
    format: 'persona-first',
    techStack: ['Next.js', 'TypeScript', 'React', 'Tailwind'],
    requiredTech: ['Next.js']
  },
  'nextjs-app-router': {
    files: [
      'nextjs-app-router-cursorrules-prompt-file',
      'cursorrules-cursor-ai-nextjs-14-tailwind-seo-setup'
    ],
    format: 'title-first',
    techStack: ['Next.js', 'React', 'TypeScript', 'Tailwind'],
    requiredTech: ['Next.js']
  },
  'nextjs-15-react-19': {
    files: [
      'nextjs15-react19-vercelai-tailwind-cursorrules-prompt-file'
    ],
    format: 'persona-first',
    techStack: ['Next.js', 'React', 'TypeScript', 'Tailwind', 'Vercel'],
    requiredTech: ['Next.js']
  },
  'vue-typescript': {
    files: [
      'vue3-composition-api-cursorrules-prompt-file'
    ],
    format: 'persona-first',
    techStack: ['Vue', 'TypeScript'],
    requiredTech: ['Vue']
  },
  'angular-typescript': {
    files: [
      'angular-typescript-cursorrules-prompt-file',
      'angular-novo-elements-cursorrules-prompt-file'
    ],
    format: 'persona-first',
    techStack: ['Angular', 'TypeScript'],
    requiredTech: ['Angular']
  },
  'sveltekit-typescript': {
    files: [
      'sveltekit-typescript-guide-cursorrules-prompt-file',
      'sveltekit-tailwindcss-typescript-cursorrules-promp'
    ],
    format: 'persona-first',
    techStack: ['Svelte', 'TypeScript', 'Tailwind'],
    requiredTech: ['Svelte']
  },
  'typescript-react': {
    files: [
      'typescript-react-cursorrules-prompt-file',
      'typescript-nextjs-react-cursorrules-prompt-file'
    ],
    format: 'persona-first',
    techStack: ['TypeScript', 'React', 'Next.js'],
    requiredTech: ['React']
  }
};

/**
 * 技术栈相似度（Jaccard）。
 *
 * 实现统一在 `src/utils/similarity.ts`，本处仅作为内部别名以保持
 * 既有可读性。
 */
const calculateSimilarity = jaccardSimilarity;

/**
 * 匹配最相似的框架规则
 * 前置条件：候选框架的 requiredTech 必须全部出现在项目技术栈中，
 * 防止纯后端项目（如 Node.js + TypeScript）误匹配到前端框架模板。
 */
export function findBestFrameworkMatch(techStack: TechStack): FrameworkMatch | null {
  const projectStack = [
    ...techStack.primary,
    ...techStack.frameworks,
    ...techStack.languages
  ];
  const projectLower = new Set(projectStack.map(s => s.toLowerCase()));

  logger.debug('开始框架匹配', { projectStack });

  let bestMatch: FrameworkMatch | null = null;
  let bestSimilarity = 0;

  for (const [key, rule] of Object.entries(FRAMEWORK_RULES_MAP)) {
    if (rule.requiredTech) {
      const missing = rule.requiredTech.filter(t => !projectLower.has(t.toLowerCase()));
      if (missing.length > 0) {
        logger.debug(`跳过 ${key}：缺少必需技术 ${missing.join(', ')}`);
        continue;
      }
    }

    const similarity = calculateSimilarity(projectStack, rule.techStack);
    
    logger.debug(`匹配 ${key}`, { similarity, ruleStack: rule.techStack });

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = {
        framework: key,
        similarity,
        sampleFile: rule.files[0],
        format: rule.format
      };
    }
  }

  if (bestMatch && bestMatch.similarity > 0.4) {
    logger.info('找到匹配的框架规则', {
      framework: bestMatch.framework,
      similarity: Math.round(bestMatch.similarity * 100) + '%',
      format: bestMatch.format
    });
    return bestMatch;
  }

  logger.warn('未找到匹配的框架规则', { projectStack });
  return null;
}

