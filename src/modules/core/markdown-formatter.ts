/**
 * Markdown 格式修复工具
 * 修复常见的 markdownlint 错误
 */
export class MarkdownFormatter {
  /**
   * 修复 markdown 文件的格式问题
   * @param content 原始内容
   * @returns 修复后的内容
   */
  static format(content: string): string {
    let formatted = content;

    // 1. MD012: 先修复多个连续空行（保留1个）
    // 必须在修复代码块之前，因为代码块修复可能会改变行结构
    formatted = this.fixMultipleBlankLines(formatted);

    // 2. MD040: 修复没有指定语言的代码块
    formatted = this.fixCodeBlockLanguage(formatted);

    // 3. 再次修复空行（因为代码块修复可能会引入新的空行）
    formatted = this.fixMultipleBlankLines(formatted);

    // 4. MD036: 修复使用强调代替标题的问题（可选，因为有些强调是合理的）
    // 这个规则比较主观，暂时不自动修复

    return formatted;
  }

  /**
   * 修复代码块语言指定问题 (MD040)
   * 为没有语言的代码块添加合适的语言标识
   */
  private static fixCodeBlockLanguage(content: string): string {
    const lines = content.split(/\r?\n/);
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // 检查是否是代码块开始
      if (line.trim().startsWith('```')) {
        const codeBlockStart = line;
        const languageMatch = codeBlockStart.match(/^(\s*)```([a-zA-Z0-9+_-]*)\s*$/);
        
        if (languageMatch) {
          const indent = languageMatch[1];
          const existingLanguage = languageMatch[2];

          // 如果已经有语言，保留原样
          if (existingLanguage) {
            result.push(line);
            i++;
            // 继续到代码块结束
            while (i < lines.length && !lines[i].trim().startsWith('```')) {
              result.push(lines[i]);
              i++;
            }
            if (i < lines.length) {
              result.push(lines[i]); // 结束的 ```
              i++;
            }
            continue;
          }

          // 没有语言，需要添加
          // 收集代码块内容
          const codeLines: string[] = [];
          i++;
          while (i < lines.length && !lines[i].trim().startsWith('```')) {
            codeLines.push(lines[i]);
            i++;
          }
          
          const codeContent = codeLines.join('\n');
          const language = this.inferLanguageFromCode(codeContent);
          
          // 添加带语言的代码块开始
          result.push(`${indent}\`\`\`${language}`);
          result.push(...codeLines);
          
          // 添加代码块结束
          if (i < lines.length) {
            result.push(lines[i]); // 结束的 ```
            i++;
          }
          continue;
        }
      }

      // 普通行，直接添加
      result.push(line);
      i++;
    }

    return result.join('\n');
  }

  /**
   * 根据代码内容推断语言
   */
  private static inferLanguageFromCode(code: string): string {
    const trimmed = code.trim();
    const firstLine = trimmed.split('\n')[0] || '';

    // 空代码块
    if (!trimmed) {
      return 'text';
    }

    // JSON - 检查是否是有效的 JSON 结构
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && 
        (trimmed.endsWith('}') || trimmed.endsWith(']'))) {
      try {
        JSON.parse(trimmed);
        return 'json';
      } catch {
        // 不是有效 JSON，继续判断
      }
    }

    // YAML - 检查 YAML 特征
    if (firstLine.match(/^[\w-]+:\s/) || firstLine === '---' || trimmed.match(/^[\w-]+:\s/m)) {
      return 'yaml';
    }

    // Bash/Shell - 检查 shell 脚本特征
    if (
      firstLine.match(/^#!\/bin\/(bash|sh)/) ||
      trimmed.match(/\$\{?\w+\}?/) ||
      trimmed.match(/npm\s+(run|install|build|test)/) ||
      trimmed.match(/yarn\s+(run|install|build|test)/) ||
      trimmed.match(/pnpm\s+(run|install|build|test)/) ||
      firstLine.match(/^[a-z-]+\s*:/) // 命令格式
    ) {
      return 'bash';
    }

    // TypeScript/JavaScript 特征
    const hasJSKeywords = trimmed.match(/\b(import|export|const|let|var|function|class|interface|type|async|await)\b/);
    const hasPathAlias = trimmed.match(/['"]@/);
    const hasFromImport = trimmed.match(/from\s+['"]/);
    const hasJSX = trimmed.match(/<[A-Z]\w+/) || trimmed.match(/\.(tsx|jsx)/);
    const hasTypeScript = trimmed.match(/:\s*\w+[;,]?$/) || 
                          trimmed.match(/interface\s+\w+/) || 
                          trimmed.match(/type\s+\w+/) ||
                          trimmed.match(/:\s*\{/) ||
                          trimmed.match(/:\s*\[/);

    if (hasJSKeywords || hasPathAlias || hasFromImport || hasJSX) {
      // 判断是 TypeScript 还是 JavaScript
      if (hasTypeScript) {
        if (hasJSX || trimmed.match(/\.tsx/)) {
          return 'tsx';
        }
        return 'typescript';
      }
      if (hasJSX || trimmed.match(/\.jsx/)) {
        return 'jsx';
      }
      return 'javascript';
    }

    // CSS
    if (trimmed.match(/\{[^}]*\}/) && trimmed.match(/[a-z-]+:\s*[^;]+;/)) {
      return 'css';
    }

    // Markdown
    if (trimmed.match(/^#{1,6}\s/m) || trimmed.match(/^\*\s/m) || trimmed.match(/^-\s/m)) {
      return 'markdown';
    }

    // HTML
    if (trimmed.match(/<[a-z][\w-]*[^>]*>/i) || trimmed.match(/<\/[a-z]/i)) {
      return 'html';
    }

    // 默认返回 'text' 以通过 MD040 检查
    return 'text';
  }

  /**
   * 修复多个连续空行问题 (MD012)
   * 将多个连续空行（2个或更多）替换为单个空行
   */
  private static fixMultipleBlankLines(content: string): string {
    if (!content) return content;

    const lines = content.split(/\r?\n/);
    const result: string[] = [];
    let inCodeBlock = false;
    let blankLineCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // 检测代码块开始/结束
      // 匹配行首的 ```（可能有缩进，但通常代码块标记在行首）
      if (trimmed === '```' || trimmed.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        // 重置空行计数
        blankLineCount = 0;
        result.push(line);
        continue;
      }

      // 在代码块内，保留所有内容（包括空行）
      if (inCodeBlock) {
        result.push(line);
        blankLineCount = 0; // 代码块内的空行不计入
        continue;
      }

      // 在代码块外，处理空行
      // 空行包括：完全空的行，或只包含空格/制表符的行
      if (trimmed === '') {
        blankLineCount++;
        // 只保留第一个空行
        if (blankLineCount === 1) {
          result.push('');
        }
        // 如果已经有空行了（blankLineCount > 1），跳过这个空行
      } else {
        // 非空行，重置计数并添加
        blankLineCount = 0;
        result.push(line);
      }
    }

    // 移除文件末尾的多个空行（保留最多1个）
    // 从末尾开始，移除所有连续的空行
    while (result.length > 0 && result[result.length - 1].trim() === '') {
      result.pop();
    }
    
    // 如果文件有内容，在末尾添加一个空行（标准 Markdown 格式）
    if (result.length > 0) {
      result.push('');
    }

    // 如果文件完全为空，返回空字符串
    if (result.length === 0) {
      return '';
    }

    return result.join('\n');
  }
}


