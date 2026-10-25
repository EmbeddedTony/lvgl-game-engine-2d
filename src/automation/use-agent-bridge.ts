import { useEffect, useRef } from 'react';
import type { Project } from '../model';
import { desktop } from '../desktop';
import { applyCommands } from './project-commands';
import { AutomationError, errorData, object } from './protocol';

export function useAgentBridge(options: {
  project: React.RefObject<Project>;
  savedProject: React.RefObject<Project | null>;
  commit: (p: Project) => void;
  save: () => Promise<boolean>;
  playing: boolean;
  path: string | null;
  hydrated: boolean;
}) {
  const current = useRef(options);
  current.current = options;
  const version = useRef({
    source: options.project.current,
    counter: 0,
    epoch: crypto.randomUUID(),
  });
  useEffect(() => {
    if (!desktop?.onAgentRequest || !desktop.agentResponse) return;
    const revision = () => {
      if (version.current.source !== current.current.project.current) {
        version.current.source = current.current.project.current;
        version.current.counter++;
      }
      return `${version.current.epoch}:${version.current.counter}`;
    };
    let queue = Promise.resolve();
    return desktop.onAgentRequest((req) => {
      queue = queue
        .catch(() => {})
        .then(async () => {
          try {
            const state = current.current;
            const dirty = () => state.project.current !== state.savedProject.current;
            if (!state.hydrated)
              throw new AutomationError('UNAVAILABLE', 'Editor is still loading its project.');
            const params = object(req.params ?? {}),
              rev = revision();
            if (params.expectedRevision !== undefined && params.expectedRevision !== rev)
              throw new AutomationError(
                'CONFLICT',
                'Editor revision changed. Read status and retry.',
                { actualRevision: rev },
              );
            let data: unknown;
            if (req.method === 'snapshot')
              data = {
                project: state.project.current,
                revision: rev,
                path: state.path,
                dirty: dirty(),
                playing: state.playing,
              };
            else if (req.method === 'apply') {
              if (state.playing)
                throw new AutomationError(
                  'CONFLICT',
                  'Stop editor playback before changing the project.',
                );
              const result = applyCommands(
                state.project.current,
                params.commands as Parameters<typeof applyCommands>[1],
              );
              if (!params.dryRun) state.commit(result.project);
              data = {
                results: result.results,
                warnings: result.warnings,
                revision: revision(),
                dirty: dirty(),
                dryRun: !!params.dryRun,
              };
            } else if (req.method === 'save') {
              if (!state.path)
                throw new AutomationError(
                  'CONFLICT',
                  'Use Save As in the editor once before saving this document from the CLI.',
                );
              if (!(await state.save()))
                throw new AutomationError('EXECUTION_FAILED', 'Editor could not save the project.');
              data = { path: state.path, revision: revision(), savedRevision: rev, dirty: dirty() };
            } else throw new AutomationError('INVALID_ARGUMENT', 'Unknown editor method.');
            await desktop!.agentResponse!({ id: req.id, ok: true, data });
          } catch (e) {
            await desktop!.agentResponse!({ id: req.id, ok: false, error: errorData(e) });
          }
        });
    });
  }, []);
}
