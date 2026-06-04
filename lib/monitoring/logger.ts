type LogLevel = "debug" | "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

interface LogEntry {
  ts: string;          // ISO timestamp
  level: LogLevel;
  msg: string;
  service: "music-intelligence-api";
  env: string;         // process.env.NODE_ENV
  buildSha?: string;   // process.env.BUILD_SHA
  [key: string]: unknown;
}

class Logger {
  private level: LogLevel;

  constructor() {
    this.level = (process.env.LOG_LEVEL as LogLevel) || "info";
  }

  private shouldLog(level: LogLevel): boolean {
    const order: LogLevel[] = ["debug", "info", "warn", "error"];
    return order.indexOf(level) >= order.indexOf(this.level);
  }

  private write(level: LogLevel, msg: string, ctx?: LogContext): void {
    if (!this.shouldLog(level)) return;
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      msg,
      service: "music-intelligence-api",
      env: process.env.NODE_ENV || "development",
      ...(process.env.BUILD_SHA && { buildSha: process.env.BUILD_SHA }),
      ...ctx,
    };
    const line = JSON.stringify(entry);
    if (level === "error") {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  debug(msg: string, ctx?: LogContext): void { this.write("debug", msg, ctx); }
  info(msg: string, ctx?: LogContext): void  { this.write("info", msg, ctx); }
  warn(msg: string, ctx?: LogContext): void  { this.write("warn", msg, ctx); }
  error(msg: string, ctx?: LogContext): void { this.write("error", msg, ctx); }

  child(ctx: LogContext): Logger {
    const child = new Logger();
    const parentWrite = child.write.bind(child);
    child["write"] = (level: LogLevel, msg: string, extraCtx?: LogContext) => {
      parentWrite(level, msg, { ...ctx, ...extraCtx });
    };
    return child;
  }
}

export const logger = new Logger();
export default logger;
