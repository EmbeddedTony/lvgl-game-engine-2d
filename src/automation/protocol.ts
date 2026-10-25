/** Versioned, JSON-only automation boundary shared by the CLI and editor. */
export const PROTOCOL_VERSION = 1;
export class AutomationError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AutomationError';
  }
}
export type Parameters = Record<string, unknown>;
export interface ProjectCommand {
  command: string;
  params: Parameters;
}
export interface AgentRequest {
  id: string;
  method: 'snapshot' | 'apply' | 'save';
  params?: { commands?: ProjectCommand[]; expectedRevision?: string; dryRun?: boolean };
}
export interface AgentReply {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string; details?: unknown };
}
export function errorData(error: unknown) {
  return error instanceof AutomationError
    ? { code: error.code, message: error.message, details: error.details }
    : { code: 'EXECUTION_FAILED', message: error instanceof Error ? error.message : String(error) };
}
export function object(value: unknown, name = 'value'): Parameters {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AutomationError('INVALID_ARGUMENT', `${name} must be a JSON object.`);
  return value as Parameters;
}
export function textParam(p: Parameters, key: string): string {
  if (typeof p[key] !== 'string' || !(p[key] as string).length)
    throw new AutomationError('INVALID_ARGUMENT', `${key} must be a non-empty string.`);
  return p[key] as string;
}
/** Also rejects prototype keys nested inside arbitrary component/resource payloads. */
export function safeJson(value: unknown, depth = 0): void {
  if (depth > 96) throw new AutomationError('INVALID_ARGUMENT', 'JSON nesting exceeds 96 levels.');
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new AutomationError('INVALID_ARGUMENT', 'Numbers must be finite.');
  if (value && typeof value === 'object')
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key))
        throw new AutomationError('INVALID_ARGUMENT', `Reserved JSON key: ${key}.`);
      safeJson(child, depth + 1);
    }
}
