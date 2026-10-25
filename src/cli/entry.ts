import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArguments } from './arguments';
import { readProjectFile, resolveProject, writeProjectFile } from './project-store';
import {
  boardService,
  debugBoard,
  buildProject,
  desktopModules,
  expandCommand,
  exportProject,
  generated,
  nativeService,
  playtest,
  readText,
  parseJson,
  type Context,
} from './services';
import { commands, byName, globals } from '../automation/manifest';
import {
  PROTOCOL_VERSION,
  AutomationError,
  errorData,
  object,
  safeJson,
  type Parameters,
  type ProjectCommand,
} from '../automation/protocol';
import {
  applyCommands,
  checkedProject,
  checkParameters,
  queryProject,
  summary,
} from '../automation/project-commands';
import { uid, validate, type Project } from '../model';
import { useH7Board } from '../boards/stm32h7s78';
import { targetDefaults } from '../targets/model';
import { families, catalogVersion, catalogDate } from '../targets/catalog';
import { analyzeTarget, measureWorkload } from '../targets/analyze';

const defaultCode = `#include "ui.h"
void game_on_event(lge_engine_t *game, lge_event_t event, lge_node_t *node, void *user) {
    (void)game; (void)event; (void)node; (void)user;
}
void game_on_update(lge_engine_t *game, float dt_seconds, void *user) {
    (void)game; (void)dt_seconds; (void)user;
}
`;
const exitCodes: Record<string, number> = {
  INVALID_ARGUMENT: 2,
  UNKNOWN_COMMAND: 2,
  VALIDATION_FAILED: 3,
  CONFLICT: 4,
  NOT_FOUND: 5,
  UNAVAILABLE: 5,
  UNAUTHORIZED: 5,
  CANCELLED: 130,
};
declare const LGE_SCHEMAS: {
  $schema: string;
  description: string;
  types: Record<string, unknown>;
  $defs: Record<string, unknown>;
};
interface Snapshot {
  project: Project;
  revision: string;
  path: string | null;
  dirty: boolean;
  playing?: boolean;
  source?: string;
}
export async function main(argv: string[], ctx: Context): Promise<number> {
  const started = Date.now();
  let command = 'unknown',
    format = 'json',
    logFile: string | undefined;
  const log = (message: string) => {
    if (message) process.stderr.write(message + '\n');
  };
  const meta: Parameters = { engineVersion: ctx.version };
  try {
    const args = parseArguments(argv);
    command = args.command;
    format = (args.options.format as string) ?? 'json';
    logFile = args.options.logFile as string | undefined;
    if (args.paramsFile) {
      const fileParams = object(
        parseJson(await readText(args.paramsFile), 'params-file'),
        'params-file',
      );
      for (const key of Object.keys(fileParams))
        if (Object.hasOwn(args.params, key))
          throw new AutomationError(
            'INVALID_ARGUMENT',
            `Parameter ${key} occurs in both flags and params-file.`,
          );
      Object.assign(args.params, fileParams);
    }
    safeJson(args.params);
    checkParameters(command, args.params);
    const options = args.options,
      p = args.params;
    const transport = desktopModules(ctx)('./automation/session.cjs');
    const sessions = await transport.sessions(ctx.profileRoot);
    let selected: any, snapshot: Snapshot | undefined, file: string | undefined;
    async function load(writing = false): Promise<Snapshot> {
      if (snapshot) return snapshot;
      if (options.offline && options.session)
        throw new AutomationError(
          'INVALID_ARGUMENT',
          '--offline and --session cannot be combined.',
        );
      if (options.projectPath || process.env.LGE_PROJECT_PATH)
        file = await resolveProject(String(options.projectPath ?? process.env.LGE_PROJECT_PATH));
      const matches = options.session
        ? sessions.filter((s: any) => s.id === String(options.session))
        : file
          ? (
              await Promise.all(
                sessions.map(async (s: any) => {
                  const candidate = s.projectPath
                    ? await fs.realpath(s.projectPath).catch(() => path.resolve(s.projectPath))
                    : null;
                  return candidate === file ? s : null;
                }),
              )
            ).filter(Boolean)
          : [];
      if (matches.length > 1)
        throw new AutomationError(
          'CONFLICT',
          'Several editors have this project open. Select --session explicitly.',
        );
      if (options.session && !matches.length)
        throw new AutomationError(
          'UNAVAILABLE',
          'Editor session is not running. Use editor sessions.',
        );
      selected = !options.offline ? matches[0] : undefined;
      if (options.offline && writing && matches.length)
        throw new AutomationError(
          'CONFLICT',
          'This project is open in an editor. Use its live connection for edits.',
        );
      if (selected) {
        snapshot = (await transport.request(selected, 'snapshot')) as Snapshot;
        snapshot.project = checkedProject(JSON.stringify(snapshot.project));
        if (file && (!snapshot.path || (await fs.realpath(snapshot.path)) !== file))
          throw new AutomationError(
            'CONFLICT',
            'The editor switched documents. Select the project again.',
          );
        snapshot.source = 'editor';
      } else {
        file ??= await resolveProject();
        snapshot = await readProjectFile(file);
      }
      if (options.expectedRevision && options.expectedRevision !== snapshot.revision)
        throw new AutomationError('CONFLICT', 'Revision changed. Read status before retrying.', {
          actualRevision: snapshot.revision,
        });
      Object.assign(meta, {
        source: snapshot.source,
        projectPath: snapshot.path,
        revision: snapshot.revision,
        dirty: snapshot.dirty,
        ...(selected ? { session: selected.id } : {}),
      });
      return snapshot;
    }
    let data: unknown;
    if (command === 'version') data = { version: ctx.version, protocolVersion: PROTOCOL_VERSION };
    else if (command === 'commands')
      data = {
        protocolVersion: PROTOCOL_VERSION,
        commands: commands.filter(
          (c) =>
            !p.query ||
            `${c.name} ${c.description}`.toLowerCase().includes(String(p.query).toLowerCase()),
        ),
        globals,
        exitCodes: {
          success: 0,
          usage: 2,
          validation: 3,
          conflict: 4,
          unavailable: 5,
          execution: 6,
          cancelled: 130,
        },
      };
    else if (command === 'help') {
      if (p.command && !byName.has(String(p.command)))
        throw new AutomationError('UNKNOWN_COMMAND', `Unknown command: ${p.command}.`);
      data = p.command
        ? { ...byName.get(String(p.command)), globals }
        : {
            usage: 'lge <command> [subcommand] --project-path <file.lge.json> [options]',
            discover: 'lge commands --json',
            examples: [
              'lge project inspect --project-path MyGame.lge.json',
              'lge node create --project-path MyGame.lge.json --scene main --kind rect --id player --data \'{"player":true,"x":32,"y":64}\'',
              'lge export --project-path MyGame.lge.json --output firmware',
              'lge playtest --project-path MyGame.lge.json --seconds 2 --screenshot game.png',
            ],
            globals,
            note: 'JSON is the default. Mutations in a running editor create an Undo step; --save also saves. Closed projects save atomically with backups. -batchmode and -quit are accepted; all commands are already headless.',
          };
    } else if (command === 'editor.sessions') data = sessions.map(transport.publicSession);
    else if (command === 'doctor')
      data = {
        native: await nativeService(ctx, () => {}).capabilities(),
        board: await boardService(ctx).capabilities(),
        cli: { version: ctx.version, profile: ctx.profileRoot, sdk: ctx.sdkRoot },
      };
    else if (command === 'schema') {
      if (p.type && !Object.hasOwn(LGE_SCHEMAS.types, String(p.type)))
        throw new AutomationError(
          'NOT_FOUND',
          'Unknown authoring type. Use lge schema to list types.',
        );
      data = p.type
        ? {
            $schema: LGE_SCHEMAS.$schema,
            description: LGE_SCHEMAS.description,
            ...(LGE_SCHEMAS.types[String(p.type)] as object),
            $defs: LGE_SCHEMAS.$defs,
          }
        : { types: Object.keys(LGE_SCHEMAS.types).sort() };
    } else if (command === 'targets')
      data = {
        catalogVersion,
        catalogDate,
        profiles: families.filter(
          (f) =>
            !p.query ||
            `${f.id} ${f.vendor} ${f.family} ${f.core}`
              .toLowerCase()
              .includes(String(p.query).toLowerCase()),
        ),
      };
    else if (command === 'board.probes') data = await boardService(ctx).scan();
    else if (command.startsWith('board.')) {
      if (options.dryRun || options.save)
        throw new AutomationError(
          'INVALID_ARGUMENT',
          'Device commands do not support --dry-run or --save. Use board.status for a read-only query.',
        );
      data = await debugBoard(ctx, command, p);
    } else if (
      command === 'status' &&
      !options.projectPath &&
      !process.env.LGE_PROJECT_PATH &&
      !options.session
    )
      data = {
        sessions: sessions.map(transport.publicSession),
        note: 'Select --project-path or --session to inspect a document revision.',
      };
    else if (command === 'project.create') {
      if (options.session || options.save)
        throw new AutomationError(
          'INVALID_ARGUMENT',
          'Project creation writes a new file. Pass --project-path.',
        );
      file = await resolveProject(
        String(options.projectPath ?? process.env.LGE_PROJECT_PATH ?? ''),
        true,
      );
      if (p.family !== undefined && !families.some((f) => f.id === p.family))
        throw new AutomationError('INVALID_ARGUMENT', 'Unknown family. Use lge targets.');
      const project: Project = {
        version: 1,
        id: uid('project'),
        name: p.name as string,
        width: (p.width as number) ?? 320,
        height: (p.height as number) ?? 240,
        colorDepth: 16,
        pixelPerfect: true,
        dimension: '2d',
        target: targetDefaults((p.family as string) ?? 'host-pc'),
        scenes: [
          {
            id: 'main',
            name: 'Main',
            background: '#18212b',
            objective: '',
            completion: '',
            music: '',
            nodes: [],
          },
        ],
        sprites: [],
        tilesets: [],
        audio: [],
        code: defaultCode,
      };
      if (p.board !== undefined) {
        if (p.board !== 'stm32h7s78-dk')
          throw new AutomationError('INVALID_ARGUMENT', 'Unknown board.');
        useH7Board(project);
      }
      const parsed = checkedProject(JSON.stringify(project));
      data = {
        ...summary(parsed),
        ...(options.dryRun
          ? { path: file, dryRun: true }
          : await writeProjectFile(file, parsed, undefined, true)),
      };
    } else if (byName.get(command)?.mutates) {
      const source = await load(true);
      const raw =
        command === 'project.apply' ? (p.commands as ProjectCommand[]) : [{ command, params: p }];
      if (!Array.isArray(raw) || !raw.length || raw.length > 256)
        throw new AutomationError('INVALID_ARGUMENT', 'Use 1–256 commands per transaction.');
      const expanded: ProjectCommand[] = [];
      for (const c of raw) {
        const item = object(c);
        if (
          Object.keys(item).some((k) => !['command', 'params'].includes(k)) ||
          typeof item.command !== 'string'
        )
          throw new AutomationError(
            'INVALID_ARGUMENT',
            'Each operation needs only command and params.',
          );
        checkParameters(item.command, item.params ?? {});
        expanded.push(
          await expandCommand({ command: item.command, params: (item.params ?? {}) as Parameters }),
        );
      }
      let result: any;
      if (selected) {
        result = await transport.request(selected, 'apply', {
          commands: expanded,
          expectedRevision: source.revision,
          dryRun: !!options.dryRun,
        });
        if (options.save && !options.dryRun)
          result.saved = await transport.request(selected, 'save', {
            expectedRevision: result.revision,
          });
      } else {
        const applied = applyCommands(source.project, expanded);
        result = {
          results: applied.results,
          warnings: applied.warnings,
          ...(options.dryRun
            ? { revision: source.revision, dryRun: true }
            : await writeProjectFile(file!, applied.project, source.revision)),
        };
      }
      Object.assign(meta, {
        revision: result.saved?.revision ?? result.revision,
        dirty: selected ? (result.saved?.dirty ?? result.dirty) : false,
      });
      data = result;
    } else {
      if (options.dryRun || options.save)
        throw new AutomationError(
          'INVALID_ARGUMENT',
          '--dry-run and --save apply to project mutations.',
        );
      const source = await load(command === 'project.save');
      if (command === 'status')
        data = { ...summary(source.project), playing: source.playing ?? false };
      else if (command === 'project.save') {
        data = selected
          ? await transport.request(selected, 'save', { expectedRevision: source.revision })
          : { path: source.path, revision: source.revision, dirty: false, saved: true };
        meta.dirty = (data as { dirty: boolean }).dirty;
        meta.revision = (data as { revision: string }).revision;
      } else if (command === 'validate') {
        const issues = validate(source.project);
        if (issues.some((i) => i.severity === 'error'))
          throw new AutomationError('VALIDATION_FAILED', 'Project has validation errors.', {
            issues,
          });
        data = { valid: true, issues };
      } else if (command === 'guidance') {
        const workload = measureWorkload(source.project);
        data = { workload, guidance: analyzeTarget(source.project, workload) };
      } else if (command === 'api.get') {
        const file = (p.file as string) ?? 'ui.h';
        if (!/^(?:ui\.h|game\.h|ui_ids\.h|engine\/lge[A-Za-z0-9_]*\.h)$/.test(file))
          throw new AutomationError('INVALID_ARGUMENT', 'Choose a generated public C header.');
        const text = generated(source.project).entries.find((e) => e.path === file)?.data;
        if (text === undefined)
          throw new AutomationError('NOT_FOUND', `API header not found: ${file}.`);
        data = { file, text };
      } else if (command === 'export') data = await exportProject(ctx, source.project, p);
      else if (command === 'playtest') data = await playtest(ctx, source.project, p, log);
      else if (command === 'build') data = await buildProject(ctx, source.project, p, log);
      else data = queryProject(source.project, command, p);
    }
    const result = {
      protocolVersion: PROTOCOL_VERSION,
      ok: true,
      command,
      data,
      meta: { ...meta, elapsedMs: Date.now() - started },
    };
    if (logFile) await fs.writeFile(path.resolve(logFile), JSON.stringify(result) + '\n');
    process.stdout.write(
      format === 'text' ? JSON.stringify(data, null, 2) + '\n' : JSON.stringify(result) + '\n',
    );
    return 0;
  } catch (e) {
    const error =
      e instanceof AutomationError
        ? errorData(e)
        : typeof (e as any)?.code === 'string'
          ? {
              code: ['ENOENT', 'ENOTDIR'].includes((e as any).code) ? 'NOT_FOUND' : (e as any).code,
              message: (e as Error).message,
              details: (e as any).details,
            }
          : errorData(e);
    const result = {
      protocolVersion: PROTOCOL_VERSION,
      ok: false,
      command,
      error,
      meta: { ...meta, elapsedMs: Date.now() - started },
    };
    if (logFile)
      await fs.writeFile(path.resolve(logFile), JSON.stringify(result) + '\n').catch(() => {});
    process.stdout.write(JSON.stringify(result) + '\n');
    return exitCodes[error.code] ?? 6;
  }
}
