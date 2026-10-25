import { byName, globals, type Param } from '../automation/manifest';
import { AutomationError, object, safeJson, type Parameters } from '../automation/protocol';
export interface Arguments {
  command: string;
  params: Parameters;
  options: Parameters;
  paramsFile?: string;
}
const camel = (key: string) => key.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const aliases: Record<string, string> = {
  project: 'projectPath',
  projectPath: 'projectPath',
  projectpath: 'projectPath',
  logFile: 'logFile',
};
function value(raw: string, spec: Param, key: string): unknown {
  if (spec.type === 'string') return raw;
  if (spec.type === 'number') {
    if (!raw.trim() || !Number.isFinite(Number(raw)))
      throw new AutomationError('INVALID_ARGUMENT', `${key} needs a finite number.`);
    return Number(raw);
  }
  try {
    const v = JSON.parse(raw);
    if (
      spec.type === 'boolean'
        ? typeof v !== 'boolean'
        : spec.type === 'array'
          ? !Array.isArray(v)
          : !v || typeof v !== 'object' || Array.isArray(v)
    )
      throw Error();
    safeJson(v);
    return v;
  } catch {
    throw new AutomationError('INVALID_ARGUMENT', `${key} needs JSON ${spec.type}.`);
  }
}
export function parseArguments(argv: string[]): Arguments {
  const tokens: {
      key: string;
      raw?: string;
    }[] = [],
    words: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('-') || arg === '-') {
      words.push(arg);
      continue;
    }
    if (arg === '--version' || arg === '-version') {
      words.push('version');
      continue;
    }
    if (arg === '--help' || arg === '-h' || arg === '-help') {
      tokens.push({ key: 'help' });
      continue;
    }
    const equal = arg.indexOf('='),
      key =
        aliases[camel(arg.slice(0, equal < 0 ? undefined : equal).replace(/^-+/, ''))] ??
        camel(arg.slice(0, equal < 0 ? undefined : equal).replace(/^-+/, ''));
    let raw = equal < 0 ? undefined : arg.slice(equal + 1);
    // Boolean switches never consume a following command word.
    const boolean = [
      'offline',
      'dryRun',
      'save',
      'json',
      'batchmode',
      'quit',
      'resolved',
      'replaceModified',
      'merge',
      'debugSwd',
      'inputMonitor',
      'recenter',
    ].includes(key);
    if (
      raw === undefined &&
      !boolean &&
      argv[i + 1] !== undefined &&
      !/^--?[A-Za-z]/.test(argv[i + 1])
    )
      raw = argv[++i];
    tokens.push({ key, raw });
  }
  let command = words.join('.');
  if (words[0] === 'command') command = words.slice(1).join('.');
  if (words[0] === 'run') command = tokens.find((t) => t.key === 'command')?.raw ?? '';
  const help = tokens.some((t) => t.key === 'help');
  if (help) command = 'help';
  if (!command) command = 'help';
  if (command !== 'version' && !byName.has(command))
    throw new AutomationError('UNKNOWN_COMMAND', `Unknown command: ${command}. Use lge commands.`);
  const params: Parameters = {},
    options: Parameters = {};
  let paramsFile: string | undefined;
  for (const t of tokens) {
    if (
      ['help', 'batchmode', 'quit'].includes(t.key) ||
      (words[0] === 'run' && t.key === 'command')
    )
      continue;
    if (t.key === 'json') {
      options.format = 'json';
      continue;
    }
    if (t.key === 'paramsFile') {
      if (paramsFile) throw new AutomationError('INVALID_ARGUMENT', 'Duplicate --params-file.');
      if (!t.raw) throw new AutomationError('INVALID_ARGUMENT', '--params-file needs a path or -.');
      paramsFile = t.raw;
      continue;
    }
    if (t.key === 'params') {
      if (!t.raw) throw new AutomationError('INVALID_ARGUMENT', '--params needs a JSON object.');
      try {
        const incoming = object(JSON.parse(t.raw));
        safeJson(incoming);
        for (const key of Object.keys(incoming))
          if (Object.hasOwn(params, key))
            throw new AutomationError('INVALID_ARGUMENT', `Duplicate parameter: ${key}.`);
        Object.assign(params, incoming);
      } catch {
        throw new AutomationError('INVALID_ARGUMENT', '--params needs a JSON object.');
      }
      continue;
    }
    const global = Object.hasOwn(globals, t.key) ? globals[t.key] : undefined,
      local = byName.get(command)?.params,
      spec = global ?? (local && Object.hasOwn(local, t.key) ? local[t.key] : undefined);
    if (!spec)
      throw new AutomationError(
        'INVALID_ARGUMENT',
        `Unknown option --${t.key} for ${command}. Use lge help --command ${command}.`,
      );
    const target = global ? options : params;
    if (Object.hasOwn(target, t.key))
      throw new AutomationError('INVALID_ARGUMENT', `Duplicate parameter: ${t.key}.`);
    if (t.raw === undefined && spec.type !== 'boolean')
      throw new AutomationError('INVALID_ARGUMENT', `--${t.key} needs a value.`);
    target[t.key] = t.raw === undefined ? true : value(t.raw, spec, t.key);
  }
  if (help && words.length) params.command = words.join('.');
  safeJson(params);
  if (options.format !== undefined && !['json', 'text'].includes(String(options.format)))
    throw new AutomationError('INVALID_ARGUMENT', '--format must be json or text.');
  return { command, params, options, paramsFile };
}
