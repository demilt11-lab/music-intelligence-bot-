// lib/logger.ts
// Central logging shim. All lib/ log calls go through here so the
// underlying transport can be replaced in one place (e.g. pino, Datadog).
export const logger = {
  info:  (msg: string, ...args: unknown[]) => console.log(msg, ...args),
  warn:  (msg: string, ...args: unknown[]) => console.warn(msg, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(msg, ...args),
};
