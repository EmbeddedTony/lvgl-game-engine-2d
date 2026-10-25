import { selectRpgOption, openParty } from '../rpg/view';
import { saveState, restoreState } from '../gameplay/save';
import { gameplayBlocking } from '../gameplay/runtime';
import { CheckpointFeedback } from '../gameplay/checkpoint-feedback';
import { skipCutscene } from '../gameplay/runtime';
import { stateSchema } from '../gameplay/save';
import { signal, createSession, chooseDialogue } from '../gameplay/runtime';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { AudioCue, Bus, GameNode, Project, Scene } from '../model';
import { validate } from '../model';
import { begin, advance, setSimulationPosition, type Simulation } from '../simulation';
import { currentStep, sequenceNext, type FlowCursor, type FlowLocation } from '../flow';
import { PreviewAudio } from '../audio';
import { PointerInput } from '../input/pointer-input';
import { spawnPrefab, despawnPrefab } from '../prefabs';

interface PreviewOptions {
  project: RefObject<Project>;
  scene: Scene;
  stage: RefObject<HTMLDivElement | null>;
  selectScene: (id: string) => void;
  clearSelection: () => void;
  onStart: () => void;
  onInvalid: () => void;
  notify: (message: string) => void;
  log: (message: string) => void;
  undo: () => void;
  redo: () => void;
  editorShortcuts: boolean;
}
/** Owns the fast preview's clock, input, transient scene state, audio and async cancellation. */
export function useScenePreview(options: PreviewOptions) {
  const callbacks = useRef(options);
  callbacks.current = options;
  const [playing, setPlaying] = useState(false),
    [paused, setPaused] = useState(false),
    [starting, setStarting] = useState(false);
  const [sim, setSim] = useState<Simulation | null>(null),
    simulation = useRef<Simulation | null>(null);
  const [flowCursor, setFlowCursor] = useState<FlowCursor | null>(null),
    cursor = useRef<FlowCursor | null>(null);
  const checkpoint = useRef<Uint8Array | null>(null);
  // Effects run after the updated preview has committed. A wall-clock dwell also
  // prevents fixed-step catch-up from completing a save before a visible frame.
  useEffect(() => {
    sim?.gameplay?.checkpointFeedback?.markPresented();
  }, [sim]);
  const origin = useRef<string | null>(null),
    generation = useRef(0),
    keys = useRef(new Set<string>()),
    pointers = useRef(new PointerInput()),
    pulses = useRef(new Set<string>()),
    audio = useRef(new PreviewAudio());
  // Starting from Code/Game flow mounts the viewport after run() returns.
  useEffect(() => {
    if (playing) callbacks.current.stage.current?.focus();
  }, [playing]);
  const stop = useCallback(() => {
    if (origin.current) callbacks.current.selectScene(origin.current);
    origin.current = null;
    cursor.current = null;
    simulation.current = null;
    ++generation.current;
    setFlowCursor(null);
    setSim(null);
    setStarting(false);
    setPlaying(false);
    setPaused(false);
    keys.current.clear();
    pointers.current.clear();
    pulses.current.clear();
    audio.current.stop();
    void audio.current.pause(false).catch(() => {});
  }, []);
  const playCue = useCallback((id: string) => {
    const cue = callbacks.current.project.current.audio.find((a) => a.id === id);
    if (cue) audio.current.play(cue);
  }, []);
  const applyLocation = useCallback(
    (location: FlowLocation) => {
      cursor.current = location.cursor;
      setFlowCursor(location.cursor);
      if (location.reload === false) {
        callbacks.current.log('Sequence finished · staying on the last scene.');
        return;
      }
      const next = callbacks.current.project.current.scenes.find((s) => s.id === location.scene);
      if (!next) return;
      audio.current.stop();
      keys.current.clear();
      pointers.current.clear();
      pulses.current.clear();
      callbacks.current.selectScene(next.id);
      callbacks.current.clearSelection();
      simulation.current = begin(
        next,
        callbacks.current.project.current,
        simulation.current?.gameplay,
      );
      setSim(simulation.current);
      if (next.music) playCue(next.music);
      callbacks.current.log(`Scene started · ${next.name}`);
    },
    [playCue],
  );
  const nextPreviewStep = useCallback(() => {
    const next = sequenceNext(callbacks.current.project.current, cursor.current);
    if (next) applyLocation(next);
  }, [applyLocation]);
  const run = async (location?: FlowLocation) => {
    if (starting || playing) return;
    const { project, scene } = callbacks.current;
    const snapshot = project.current;
    if (validate(snapshot).some((i) => i.severity === 'error')) {
      callbacks.current.onInvalid();
      return;
    }
    const token = ++generation.current;
    setStarting(true);
    try {
      await audio.current.ready(snapshot.audio);
    } catch {
      callbacks.current.notify('Audio is unavailable. Running a silent preview.');
    }
    if (token !== generation.current) return;
    const start = location ? snapshot.scenes.find((s) => s.id === location.scene) : scene;
    if (!start) {
      setStarting(false);
      return;
    }
    checkpoint.current = null;
    origin.current = scene.id;
    cursor.current = location?.cursor ?? null;
    setFlowCursor(cursor.current);
    callbacks.current.selectScene(start.id);
    simulation.current = begin(
      start,
      snapshot,
      snapshot.gameplay ? createSession(snapshot) : undefined,
    );
    if (simulation.current.gameplay) {
      simulation.current.gameplay.checkpointFeedback = new CheckpointFeedback();
      const key = `lge.checkpoint.${stateSchema(snapshot)}`;
      simulation.current.gameplay.checkpointStore = {
        read: () => {
          const raw = localStorage.getItem(key);
          return raw ? Uint8Array.from(JSON.parse(raw)) : null;
        },
        write: (data) => localStorage.setItem(key, JSON.stringify(Array.from(data))),
      };
    }
    setSim(simulation.current);
    setPlaying(true);
    setPaused(false);
    setStarting(false);
    callbacks.current.onStart();
    keys.current.clear();
    pointers.current.clear();
    pulses.current.clear();
    if (start.music) playCue(start.music);
    callbacks.current.log('Preview started · WASD / arrow keys to move.');
    callbacks.current.stage.current?.focus();
  };
  const pause = useCallback(
    () =>
      setPaused((value) => {
        void audio.current.pause(!value).catch(() => {});
        keys.current.clear();
        pointers.current.clear();
        pulses.current.clear();
        if (simulation.current) simulation.current.accumulator = 0;
        if (value) callbacks.current.stage.current?.focus();
        return !value;
      }),
    [],
  );
  useEffect(() => {
    if (!playing || paused) return;
    let frame = 0,
      previous = performance.now();
    const step = (now: number) => {
      const state = simulation.current;
      if (!state) return;
      const { project, log } = callbacks.current,
        complete = state.complete;
      pointers.current.releaseHidden(state.nodes);
      for (const key of pointers.current.pulses) pulses.current.add(key);
      pointers.current.pulses.clear();
      const input = new Set([...keys.current, ...pointers.current.keys(), ...pulses.current]);
      if (state.gameplay && [...pulses.current].some((k) => ['e', 'z', 'enter'].includes(k)))
        state.gameplay.previous &= ~32;
      if (state.gameplay?.rpg) {
        for (const k of pulses.current)
          state.gameplay.rpg.previous &= ~(k === 'p'
            ? 64
            : k === ' '
              ? 16
              : ['e', 'z', 'enter'].includes(k)
                ? 32
                : 0);
      }
      if (pulses.current.has(' ')) {
        state.jumpHeld = false;
        state.meleePrevious &= ~16;
      }
      const time = state.time;
      advance(state, project.current, input, now - previous, playCue, log);
      if (state.time !== time) pulses.current.clear();
      if (state.gameplay?.warp) {
        const warp = state.gameplay.warp;
        const next = project.current.scenes.find((s) => s.id === warp.scene);
        if (next) {
          applyLocation({ scene: warp.scene, cursor: null });
          const s = simulation.current!;
          const player = s.nodes.find((n) => n.player);
          if (player) setSimulationPosition(s, player.id, warp.x, warp.y);
        }
      } else if (
        !complete &&
        state.complete &&
        currentStep(project.current, cursor.current)?.advance === 'complete'
      )
        nextPreviewStep();
      previous = now;
      setSim({ ...simulation.current! });
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, paused, playCue, nextPreviewStep, applyLocation]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        event.defaultPrevented ||
        target?.closest(
          'input, textarea, select, [contenteditable="true"], [role="menu"], [role="menubar"]',
        )
      )
        return;
      const key = event.key.toLowerCase();
      if (playing) {
        if (target?.closest('button') && !callbacks.current.stage.current?.contains(target)) return;
        if (
          [
            'arrowup',
            'arrowdown',
            'arrowleft',
            'arrowright',
            'w',
            'a',
            's',
            'd',
            ' ',
            'e',
            'z',
            'enter',
            'p',
          ].includes(key)
        ) {
          event.preventDefault();
          keys.current.add(key);
          if (!event.repeat && ['e', 'z', 'enter', ' ', 'p'].includes(key)) pulses.current.add(key);
        }
        if (key === 'escape') pause();
        return;
      }
      if (callbacks.current.editorShortcuts && (event.metaKey || event.ctrlKey) && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) callbacks.current.redo();
        else callbacks.current.undo();
      }
    };
    const keyup = (event: KeyboardEvent) => {
      keys.current.delete(event.key.toLowerCase());
    };
    const blur = () => {
      keys.current.clear();
      pointers.current.clear();
      pulses.current.clear();
      if (playing) {
        setPaused(true);
        void audio.current.pause(true).catch(() => {});
      }
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
    };
  }, [playing, pause]);
  useEffect(
    () => () => {
      ++generation.current;
      audio.current.stop();
      void audio.current.context?.close().catch(() => {});
    },
    [],
  );
  const startPointer = (id: number, node: GameNode) => {
    if (playing && !paused) pointers.current.start(id, node);
  };
  const movePointer = (id: number, node?: GameNode) => {
    if (playing && !paused) pointers.current.move(id, node);
  };
  const endPointer = (id: number) => pointers.current.end(id);
  const click = (node: GameNode) => {
    if (!playing || paused || node.kind !== 'button') return;
    const state = simulation.current;
    if (state?.gameplay && node.id === 'story_skip') {
      skipCutscene(state.gameplay, state, callbacks.current.project.current);
      return;
    }
    if (state?.gameplay && node.id === 'rpg_open') {
      openParty(state.gameplay, callbacks.current.project.current);
      return;
    }
    if (state?.gameplay && node.id.startsWith('rpg_option_')) {
      selectRpgOption(state.gameplay, callbacks.current.project.current, Number(node.id.slice(11)));
      return;
    }
    if (node.id.startsWith('story_choice_') && state?.gameplay?.dialogue) {
      const d = state.gameplay.dialogue,
        index = Number(node.id.slice('story_choice_'.length));
      if (index >= 0 && index < d.choices.length)
        chooseDialogue(state.gameplay, callbacks.current.project.current, index);
      return;
    }
    if (node.id === 'story_continue' && state?.gameplay?.dialogue) {
      chooseDialogue(
        state.gameplay,
        callbacks.current.project.current,
        state.gameplay.dialogue.selected,
      );
      return;
    }
    if (state?.gameplay?.dialogue) return;
    if (state?.gameplay && gameplayBlocking(state.gameplay, callbacks.current.project.current))
      return;
    if (state?.gameplay) signal(state.gameplay, callbacks.current.project.current, 'click', node);
    if (node.cue) playCue(node.cue);
    callbacks.current.log(`Button clicked · ${node.name} (test C hooks with Native LVGL)`);
    const step = currentStep(callbacks.current.project.current, cursor.current);
    if (step?.advance === 'click' && step.button === node.id) nextPreviewStep();
  };
  const audition = async (cue: AudioCue) => {
    const token = ++generation.current;
    try {
      await audio.current.ready([cue]);
      if (token !== generation.current) return;
      audio.current.play(cue);
      callbacks.current.log(`Audition · ${cue.name}`);
    } catch (error) {
      if (token === generation.current) callbacks.current.notify((error as Error).message);
    }
  };
  const setAudioGains = (gains: Record<Bus, number>) => {
    audio.current.gains = gains;
    audio.current.refresh();
  };
  const mute = (muted: boolean) => {
    audio.current.muted = muted;
    audio.current.refresh();
  };
  const saveCheckpoint = () => {
    const state = simulation.current?.gameplay,
      p = callbacks.current.project.current;
    if (!state || gameplayBlocking(state, p)) {
      callbacks.current.notify('Finish the current interaction before saving.');
      return;
    }
    checkpoint.current = saveState(state, p);
    callbacks.current.notify('Session checkpoint saved in memory.');
  };
  const restoreCheckpoint = () => {
    const state = simulation.current?.gameplay,
      p = callbacks.current.project.current;
    if (
      !state ||
      !checkpoint.current ||
      gameplayBlocking(state, p) ||
      !restoreState(state, p, checkpoint.current)
    ) {
      callbacks.current.notify('No compatible idle-session checkpoint is available.');
      return;
    }
    setSim({ ...simulation.current! });
    callbacks.current.notify('Saved state restored. Room objects refresh on room entry.');
  };
  return {
    testSpawnPrefab: (source: string) => {
      const state = simulation.current;
      if (!state || paused) return;
      const player = state.nodes.find((n) => n.player && n.visible);
      const live = state.nodes.filter(
        (n) => n.spawnable && n.scene === source && state.prefabs.live[n.id],
      ).length;
      const handle = spawnPrefab(
        state,
        callbacks.current.project.current,
        source,
        (player ? player.x + 32 : callbacks.current.project.current.width / 2) + (live % 4) * 32,
        (player ? player.y : callbacks.current.project.current.height / 2) +
          Math.floor(live / 4) * 32,
      );
      setSim({ ...state });
      if (!handle)
        callbacks.current.notify(
          'No free visible slot for this prefab. Despawn a copy or reserve more slots.',
        );
    },
    testDespawnPrefab: (source: string) => {
      const state = simulation.current;
      if (!state || paused) return;
      const root = [...state.nodes]
        .reverse()
        .find((n) => n.spawnable && n.scene === source && state.prefabs.live[n.id]);
      if (root) despawnPrefab(state, { id: root.id, generation: state.prefabs.live[root.id] });
      setSim({ ...state });
    },
    saveCheckpoint,
    restoreCheckpoint,
    playing,
    paused,
    starting,
    sim,
    flowCursor,
    run,
    stop,
    pause,
    nextPreviewStep,
    click,
    startPointer,
    movePointer,
    endPointer,
    audition,
    setAudioGains,
    mute,
  };
}
