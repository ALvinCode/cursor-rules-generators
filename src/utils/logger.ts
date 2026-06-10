/**
 * 日志工具类 - 使用 Pino 文件日志
 * 符合 MCP 最佳实践：不使用 stdout/stderr，所有日志写入文件
 */

import pino from 'pino';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

/**
 * 获取默认日志文件路径
 */
function getDefaultLogPath(): string {
  const platform = os.platform();
  
  if (platform === 'darwin') {
    // macOS: ~/Library/Logs/
    return path.join(os.homedir(), 'Library', 'Logs', 'cursor-rules-generators.log');
  } else if (platform === 'win32') {
    // Windows: %APPDATA%\Logs\
    return path.join(os.homedir(), 'AppData', 'Local', 'cursor-rules-generators.log');
  } else {
    // Linux/Unix: ~/.local/log/
    return path.join(os.homedir(), '.local', 'log', 'cursor-rules-generators.log');
  }
}

/**
 * 确保日志文件目录存在
 */
function ensureLogDirectory(logPath: string): void {
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 获取日志文件路径（带回退机制）
 */
function getLogFilePath(): string {
  // 从环境变量读取日志文件路径
  const envLogFile = process.env.CURSOR_RULES_GENERATOR_LOG_FILE;
  
  if (envLogFile) {
    try {
      // 尝试使用用户指定的路径
      ensureLogDirectory(envLogFile);
      // 测试写入权限
      fs.accessSync(path.dirname(envLogFile), fs.constants.W_OK);
      return envLogFile;
    } catch (error) {
      // 如果无法写入，回退到临时目录
      return path.join(os.tmpdir(), 'cursor-rules-generators.log');
    }
  }
  
  // 使用默认路径
  const defaultPath = getDefaultLogPath();
  try {
    ensureLogDirectory(defaultPath);
    return defaultPath;
  } catch (error) {
    // 如果默认路径也失败，使用临时目录
    return path.join(os.tmpdir(), 'cursor-rules-generators.log');
  }
}

/**
 * 解析日志级别
 */
function parseLogLevel(level?: string): string {
  if (!level) return 'info';
  
  const upperLevel = level.toUpperCase();
  const validLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'NONE'];
  
  if (validLevels.includes(upperLevel)) {
    return upperLevel.toLowerCase();
  }
  
  return 'info';
}

/**
 * 创建 Pino 日志实例
 * @returns 返回包含 logger 和 stream 的对象
 */
function createPinoLogger(): { logger: pino.Logger; stream: fs.WriteStream } {
  const logLevel = parseLogLevel(process.env.CURSOR_RULES_GENERATOR_LOG_LEVEL);
  const logFilePath = getLogFilePath();
  
  // 确保日志文件存在（如果不存在则创建空文件）
  if (!fs.existsSync(logFilePath)) {
    fs.writeFileSync(logFilePath, '', { flag: 'a' });
  }
  
  // 创建文件流
  const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
  
  // 配置 Pino
  const pinoConfig: pino.LoggerOptions = {
    level: logLevel === 'none' ? 'silent' : logLevel,
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  
  // MCP 最佳实践：所有日志必须写入文件，不使用 stdout/stderr
  // 这避免了干扰 MCP 协议通信（stdio 用于 JSON-RPC）
  // 如果用户需要查看日志，可以通过文件查看或设置 CURSOR_RULES_GENERATOR_LOG_FILE 环境变量
  const logger = pino(pinoConfig, logStream);
  return { logger, stream: logStream };
}

/**
 * 日志工具类
 * 符合 MCP 最佳实践：所有日志写入文件，不使用 stdout/stderr
 */
class Logger {
  private static instance: Logger;
  private pinoLogger: pino.Logger;
  private logStream: fs.WriteStream;
  private logLevel: LogLevel;

  private constructor() {
    const { logger, stream } = createPinoLogger();
    this.pinoLogger = logger;
    this.logStream = stream;
    
    // 从环境变量读取日志级别
    const envLogLevel = process.env.CURSOR_RULES_GENERATOR_LOG_LEVEL?.toUpperCase();
    this.logLevel = this.parseLogLevel(envLogLevel) ?? LogLevel.INFO;
    
    // 如果启用了调试模式，设置日志级别为 DEBUG
    if (process.env.CURSOR_RULES_GENERATOR_DEBUG === 'true') {
      this.logLevel = LogLevel.DEBUG;
      this.pinoLogger.level = 'debug';
    }
  }

  /**
   * 获取单例实例
   */
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * 重置单例实例（主要用于测试）
   */
  static async reset(): Promise<void> {
    if (Logger.instance) {
      // 刷新并关闭旧的日志流
      if (Logger.instance.pinoLogger.flush) {
        await Logger.instance.pinoLogger.flush();
      }
      // 关闭文件流
      if (Logger.instance.logStream && !Logger.instance.logStream.destroyed) {
        Logger.instance.logStream.end();
      }
    }
    Logger.instance = new Logger();
  }

  /**
   * 解析日志级别
   */
  private parseLogLevel(level?: string): LogLevel | null {
    switch (level) {
      case 'DEBUG':
        return LogLevel.DEBUG;
      case 'INFO':
        return LogLevel.INFO;
      case 'WARN':
        return LogLevel.WARN;
      case 'ERROR':
        return LogLevel.ERROR;
      case 'NONE':
        return LogLevel.NONE;
      default:
        return null;
    }
  }

  /**
   * 刷新日志（确保所有日志都写入文件）
   * 注意：Pino 的 flush 是异步的，返回 Promise
   */
  async flush(): Promise<void> {
    // Pino 会自动刷新，但我们可以显式调用
    if (this.pinoLogger.flush) {
      await this.pinoLogger.flush();
    }
    // 确保文件流也刷新
    if (this.logStream && !this.logStream.destroyed) {
      return new Promise<void>((resolve) => {
        // 设置超时，避免永远等待
        const timeout = setTimeout(() => resolve(), 100);
        const cleanup = () => {
          clearTimeout(timeout);
          resolve();
        };
        
        if (this.logStream.writable) {
          this.logStream.write('', cleanup);
        } else {
          cleanup();
        }
      });
    }
  }

  /**
   * Debug 日志
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.logLevel <= LogLevel.DEBUG) {
      if (args.length > 0) {
        this.pinoLogger.debug({ args }, message);
      } else {
        this.pinoLogger.debug(message);
      }
    }
  }

  /**
   * Info 日志
   */
  info(message: string, ...args: unknown[]): void {
    if (this.logLevel <= LogLevel.INFO) {
      if (args.length > 0) {
        this.pinoLogger.info({ args }, message);
      } else {
        this.pinoLogger.info(message);
      }
    }
  }

  /**
   * Warn 日志
   */
  warn(message: string, ...args: unknown[]): void {
    if (this.logLevel <= LogLevel.WARN) {
      if (args.length > 0) {
        this.pinoLogger.warn({ args }, message);
      } else {
        this.pinoLogger.warn(message);
      }
    }
  }

  /**
   * Error 日志
   */
  error(message: string, error?: Error | unknown, ...args: unknown[]): void {
    if (this.logLevel <= LogLevel.ERROR) {
      if (error instanceof Error) {
        this.pinoLogger.error({ err: error, args }, message);
      } else if (error) {
        this.pinoLogger.error({ error: String(error), args }, message);
      } else if (args.length > 0) {
        this.pinoLogger.error({ args }, message);
      } else {
        this.pinoLogger.error(message);
      }
    }
  }

  /**
   * 设置日志级别（运行时动态调整）
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
    const levelMap: Record<LogLevel, string> = {
      [LogLevel.DEBUG]: 'debug',
      [LogLevel.INFO]: 'info',
      [LogLevel.WARN]: 'warn',
      [LogLevel.ERROR]: 'error',
      [LogLevel.NONE]: 'silent',
    };
    this.pinoLogger.level = levelMap[level];
  }

  /**
   * 获取当前日志级别
   */
  getLogLevel(): LogLevel {
    return this.logLevel;
  }
}

/**
 * 导出便捷的日志实例（getter，总是返回最新的单例实例）
 * 注意：这是一个单例，在模块加载时创建
 * 如果需要在运行时更改配置，请使用 Logger.reset() 重置实例
 */
export const logger = new Proxy({} as Logger, {
  get(_target, prop) {
    return (Logger.getInstance() as unknown as Record<string | symbol, unknown>)[prop];
  }
});

/**
 * 导出 Logger 类以便测试时重置实例
 */
export { Logger };

/**
 * 在进程退出前刷新日志
 */
process.on('beforeExit', async () => {
  await logger.flush();
});

process.on('exit', () => {
  // exit 事件中不能使用异步操作，使用同步方式
    Logger.getInstance()['pinoLogger'].flush();
});
