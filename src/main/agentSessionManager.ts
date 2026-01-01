import type { WebContents } from 'electron';
import { AgentSession, type AgentSessionTransport, type AgentSessionEventChannel, type AgentSessionConfirmationRequest } from '../agent/session.js';
import type { ChatStore } from '../agent/chatStore.js';
import type { OpenAIResponseItem } from '../types/chat.js';

type BufferedEvent = {
  channel: AgentSessionEventChannel;
  payload: any;
  timestamp: number;
  runId?: string;
};

type SessionSubscriber = {
  wc: WebContents;
  windowId: number;
  contentsId: number;
};

type PendingConfirmation = {
  request: (AgentSessionConfirmationRequest & { sessionId: string });
  createdAt: number;
  resolve: (allow: boolean) => void;
  reject: (error: unknown) => void;
};

type ActiveRunState = {
  agent: AgentSession;
  buffer: BufferedEvent[];
  status: 'running' | 'completed' | 'error';
  startedAt: number;
  runId: string;
  completedAt?: number;
  model: string;
  autoMode: boolean;
  error?: unknown;
};

type SessionRuntime = {
  sessionId: string;
  workingDir: string;
  model: string;
  autoMode: boolean;
  currentRun: ActiveRunState | null;
  subscribers: Map<number, SessionSubscriber>;
  pendingConfirmations: Map<string, PendingConfirmation>;
};

const DEFAULT_MAX_BUFFER_EVENTS = 500;

const REPLAYABLE_CHANNELS: Set<AgentSessionEventChannel> = new Set([
  'ai:agent:monitor',
  'ai:chatStream:chunk',
  'ai:chatStream:error',
  'ai:chatStream:done',
  'ai:tool:start',
  'ai:tool:args',
  'ai:tool:exec',
  'ai:tool:result',
  'ai:reasoning:summary_done',
]);

class SessionTransport implements AgentSessionTransport {
  private readonly runtime: SessionRuntime;
  private readonly manager: AgentSessionManager;

  constructor(runtime: SessionRuntime, manager: AgentSessionManager) {
    this.runtime = runtime;
    this.manager = manager;
  }

  emit(channel: AgentSessionEventChannel, payload?: any): void {
    this.manager.handleEmit(this.runtime, channel, payload);
  }

  requestConfirmation(request: AgentSessionConfirmationRequest): Promise<boolean> {
    return this.manager.handleConfirmationRequest(this.runtime, request);
  }
}

export type SessionRunRequest = {
  sessionId: string;
  workingDir: string;
  additionalWorkingDir?: string;
  model: string;
  autoMode: boolean;
  client: any;
  toolsSchema: any[];
  toolHandlers: Record<string, (args: any) => Promise<any>>;
  newItems?: OpenAIResponseItem[];
  title?: string;
  preamble?: string;
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh';
  runId?: string;
};

export type SessionStatus = {
  sessionId: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  startedAt?: number;
  completedAt?: number;
  model?: string;
  autoMode?: boolean;
  workingDir: string;
};

export class AgentSessionManager {
  private readonly chatStore: ChatStore;
  private readonly maxBufferEvents: number;
  private readonly runtimes = new Map<string, SessionRuntime>();
  private readonly windowSessionIds = new Map<number, Set<string>>();

  constructor(chatStore: ChatStore, opts?: { maxBufferEvents?: number }) {
    this.chatStore = chatStore;
    this.maxBufferEvents = Math.max(50, opts?.maxBufferEvents ?? DEFAULT_MAX_BUFFER_EVENTS);
  }

  attach(sessionId: string, wc: WebContents, windowId: number): void {
    const runtime = this.ensureRuntime(sessionId);
    runtime.subscribers.set(wc.id, { wc, windowId, contentsId: wc.id });
    let windowSet = this.windowSessionIds.get(windowId);
    if (!windowSet) {
      windowSet = new Set();
      this.windowSessionIds.set(windowId, windowSet);
    }
    windowSet.add(sessionId);
    if (!wc.isDestroyed()) {
      wc.once('destroyed', () => {
        this.handleWebContentsDestroyed(wc.id);
      });
    }
    this.replayBufferedEvents(runtime, wc);
    this.resendPendingConfirmations(runtime, wc);
  }

  detach(sessionId: string, contentsId: number): void {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) return;
    const subscriber = runtime.subscribers.get(contentsId);
    runtime.subscribers.delete(contentsId);
    if (subscriber) {
      const winSet = this.windowSessionIds.get(subscriber.windowId);
      if (winSet) {
        winSet.delete(sessionId);
        if (!winSet.size) this.windowSessionIds.delete(subscriber.windowId);
      }
    }
  }

  detachWindow(windowId: number): void {
    const sessionIds = this.windowSessionIds.get(windowId);
    if (!sessionIds) return;
    for (const sessionId of sessionIds) {
      const runtime = this.runtimes.get(sessionId);
      if (!runtime) continue;
      for (const [contentsId, subscriber] of runtime.subscribers.entries()) {
        if (subscriber.windowId === windowId) {
          runtime.subscribers.delete(contentsId);
        }
      }
    }
    this.windowSessionIds.delete(windowId);
  }

  getStatus(sessionId: string): SessionStatus {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) {
      return {
        sessionId,
        status: 'idle',
        workingDir: '',
      };
    }
    const run = runtime.currentRun;
    if (!run) {
      return {
        sessionId,
        status: 'idle',
        workingDir: runtime.workingDir,
        model: runtime.model,
        autoMode: runtime.autoMode,
      };
    }
    return {
      sessionId,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      workingDir: runtime.workingDir,
      model: run.model,
      autoMode: run.autoMode,
    };
  }

  listStatuses(): SessionStatus[] {
    return Array.from(this.runtimes.values()).map(runtime => this.getStatus(runtime.sessionId));
  }

  async run(request: SessionRunRequest): Promise<void> {
    const runtime = this.ensureRuntime(request.sessionId, {
      workingDir: request.workingDir,
      model: request.model,
      autoMode: request.autoMode,
    });

    console.log('[AgentSessionManager]', 'run.request', {
      sessionId: request.sessionId,
      model: request.model,
      autoMode: request.autoMode,
      hasRuntime: Boolean(runtime),
      activeStatus: runtime.currentRun?.status ?? 'idle',
    });

    if (runtime.currentRun && runtime.currentRun.status === 'running') {
      console.warn('[AgentSessionManager]', 'run.queue_block', {
        sessionId: request.sessionId,
        model: request.model,
        activeRunId: runtime.currentRun.runId,
        activeStartedAt: runtime.currentRun.startedAt,
      });
      throw new Error(`Session ${request.sessionId} already has an active run.`);
    }

    const runId = (() => {
      const raw = typeof request.runId === 'string' ? request.runId.trim() : '';
      if (raw) return raw;
      return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    })();

    const transport = new SessionTransport(runtime, this);
    const agent = new AgentSession({
      transport,
      client: request.client,
      toolsSchemaOAI: request.toolsSchema,
      toolHandlers: request.toolHandlers,
      model: request.model,
      workingDir: request.workingDir,
      additionalWorkingDir: request.additionalWorkingDir,
      autoMode: request.autoMode,
      chatStore: this.chatStore,
    });

    const startedAt = Date.now();
    runtime.currentRun = {
      agent,
      buffer: [],
      status: 'running',
      startedAt,
      runId,
      model: request.model,
      autoMode: request.autoMode,
    };

    console.log('[AgentSessionManager]', 'run.start', {
      sessionId: request.sessionId,
      runId,
      model: request.model,
      autoMode: request.autoMode,
    });

    try {
      await this.chatStore.updateRuntime(request.workingDir, request.sessionId, {
        status: 'running',
        startedAt,
        updatedAt: startedAt,
      });
    } catch (error) {
      console.warn('Failed to persist runtime start', error);
    }

    try {
      await agent.run(
        { sessionId: request.sessionId, newItems: request.newItems, title: request.title },
        { preamble: request.preamble, reasoningEffort: request.reasoningEffort }
      );
      if (runtime.currentRun) {
        runtime.currentRun.status = runtime.currentRun.status === 'error' ? runtime.currentRun.status : 'completed';
        runtime.currentRun.completedAt = Date.now();
      }
      const completedAt = runtime.currentRun?.completedAt ?? Date.now();

      console.log('[AgentSessionManager]', 'run.completed', {
        sessionId: request.sessionId,
        runId,
        status: runtime.currentRun?.status ?? 'completed',
        durationMs: completedAt - startedAt,
      });

      try {
        await this.chatStore.updateRuntime(request.workingDir, request.sessionId, {
          status: runtime.currentRun?.status ?? 'completed',
          startedAt,
          completedAt,
          updatedAt: completedAt,
        });
      } catch (error) {
        console.warn('Failed to persist runtime completion', error);
      }
    } catch (error) {
      if (runtime.currentRun) {
        runtime.currentRun.status = 'error';
        runtime.currentRun.completedAt = Date.now();
        runtime.currentRun.error = error;
      }
      const completedAt = runtime.currentRun?.completedAt ?? Date.now();

      console.error('[AgentSessionManager]', 'run.error', {
        sessionId: request.sessionId,
        runId,
        message: error instanceof Error ? error.message : String(error ?? 'unknown error'),
        durationMs: completedAt - startedAt,
      });

      try {
        await this.chatStore.updateRuntime(request.workingDir, request.sessionId, {
          status: 'error',
          startedAt,
          completedAt,
          updatedAt: completedAt,
        });
      } catch (persistError) {
        console.warn('Failed to persist runtime error', persistError);
      }
      throw error;
    }
  }

  stop(sessionId: string): void {
    const runtime = this.runtimes.get(sessionId);
    const run = runtime?.currentRun;
    if (!run) return;

    if (run.status === 'running') {
      run.status = 'error';
      run.completedAt = Date.now();
      const snapshot = {
        status: 'error' as const,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        updatedAt: run.completedAt,
      };
      void this.chatStore.updateRuntime(runtime.workingDir, sessionId, snapshot).catch((error) => {
        console.warn('[AgentSessionManager]', 'stop.persist_failed', error);
      });
      this.broadcast(runtime, {
        channel: 'ai:chatStream:error',
        payload: { message: 'Run stopped by user.' },
        timestamp: run.completedAt,
        runId: run.runId,
      });
    }

    try {
      run.agent.stop();
    } catch {}
  }

  cancelTool(sessionId: string, callId: string): void {
    const runtime = this.runtimes.get(sessionId);
    const run = runtime?.currentRun;
    if (!run || !callId) return;
    try {
      const cancels = (run.agent as any)?.cancels as Map<string, AbortController> | undefined;
      const ac = cancels?.get(callId);
      if (ac && !ac.signal.aborted) {
        ac.abort();
      }
    } catch {}
  }

  handleConfirmationResponse(sessionId: string, confirmationId: string, allow: boolean): void {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) return;
    const pending = runtime.pendingConfirmations.get(confirmationId);
    if (!pending) return;
    runtime.pendingConfirmations.delete(confirmationId);
    try {
      pending.resolve(!!allow);
    } catch {}
    this.broadcastConfirmationResolution(runtime, confirmationId, allow);
  }

  handleWebContentsDestroyed(contentsId: number): void {
    for (const runtime of this.runtimes.values()) {
      const subscriber = runtime.subscribers.get(contentsId);
      if (subscriber) {
        this.detach(runtime.sessionId, contentsId);
        break;
      }
    }
  }

  private ensureRuntime(sessionId: string, defaults?: { workingDir: string; model: string; autoMode: boolean }): SessionRuntime {
    let runtime = this.runtimes.get(sessionId);
    if (!runtime) {
      runtime = {
        sessionId,
        workingDir: defaults?.workingDir ?? '',
        model: defaults?.model ?? '',
        autoMode: defaults?.autoMode ?? true,
        currentRun: null,
        subscribers: new Map(),
        pendingConfirmations: new Map(),
      };
      this.runtimes.set(sessionId, runtime);
      return runtime;
    }
    if (defaults) {
      runtime.workingDir = defaults.workingDir;
      runtime.model = defaults.model;
      runtime.autoMode = defaults.autoMode;
    }
    return runtime;
  }

  handleEmit(runtime: SessionRuntime, channel: AgentSessionEventChannel, payload: any): void {
    const run = runtime.currentRun;
    const timestamp = Date.now();
    const runId = run?.runId;
    if (run) {

      if (REPLAYABLE_CHANNELS.has(channel)) {
        run.buffer.push({ channel, payload, timestamp, runId });
        if (run.buffer.length > this.maxBufferEvents) {
          run.buffer.splice(0, run.buffer.length - this.maxBufferEvents);
        }
      }

      if (channel === 'ai:chatStream:done') {
        run.status = run.status === 'error' ? run.status : 'completed';
        run.completedAt = timestamp;
        console.log('[AgentSessionManager]', 'run.emit.done', {
          sessionId: runtime.sessionId,
          runId,
          status: run.status,
          completedAt: run.completedAt,
        });
      } else if (channel === 'ai:chatStream:error') {
        run.status = 'error';
        run.completedAt = timestamp;
        run.error = payload;
        console.warn('[AgentSessionManager]', 'run.emit.error', {
          sessionId: runtime.sessionId,
          runId,
          error: payload,
          completedAt: run.completedAt,
        });
      }
    }

    this.broadcast(runtime, { channel, payload, timestamp, runId });
  }

  async handleConfirmationRequest(runtime: SessionRuntime, request: AgentSessionConfirmationRequest): Promise<boolean> {
    const confirmationId = request.id && request.id.trim()
      ? request.id.trim()
      : `confirm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    const extended: AgentSessionConfirmationRequest & { sessionId: string; id: string } = {
      ...request,
      id: confirmationId,
      sessionId: runtime.sessionId,
    };

    const promise = new Promise<boolean>((resolve, reject) => {
      runtime.pendingConfirmations.set(confirmationId, {
        request: extended,
        createdAt: Date.now(),
        resolve,
        reject,
      });
    });

    this.sendConfirmation(runtime, extended);
    return promise;
  }

  private sendConfirmation(runtime: SessionRuntime, request: AgentSessionConfirmationRequest & { sessionId: string; id: string }): void {
    if (!runtime.subscribers.size) {
      return;
    }
    for (const subscriber of runtime.subscribers.values()) {
      try {
        subscriber.wc.send('ai:confirm:request', {
          id: request.id,
          callId: request.id,
          name: request.name,
          arguments: request.arguments,
          preview: request.preview,
          sessionId: request.sessionId,
          workingDir: request.workingDir,
          autoMode: request.autoMode,
        });
      } catch {}
    }
  }

  private resendPendingConfirmations(runtime: SessionRuntime, wc: WebContents): void {
    if (!runtime.pendingConfirmations.size) return;
    for (const pending of runtime.pendingConfirmations.values()) {
      try {
        wc.send('ai:confirm:request', {
          id: pending.request.id,
          callId: pending.request.id,
          name: pending.request.name,
          arguments: pending.request.arguments,
          preview: pending.request.preview,
          sessionId: pending.request.sessionId,
          workingDir: pending.request.workingDir,
          autoMode: pending.request.autoMode,
        });
      } catch {}
    }
  }

  private broadcastConfirmationResolution(runtime: SessionRuntime, confirmationId: string, allow: boolean): void {
    if (!runtime.subscribers.size) return;
    for (const subscriber of runtime.subscribers.values()) {
      try {
        subscriber.wc.send('ai:confirm:resolved', { id: confirmationId, allow, sessionId: runtime.sessionId });
      } catch {}
    }
  }

  private makeEnvelope(runtime: SessionRuntime, payload: any, runId?: string): { sessionId: string; payload: any; runId?: string } {
    const envelope: { sessionId: string; payload: any; runId?: string } = { sessionId: runtime.sessionId, payload };
    if (runId) envelope.runId = runId;
    return envelope;
  }

  private broadcast(runtime: SessionRuntime, event: BufferedEvent): void {
    if (!runtime.subscribers.size) return;
    for (const [contentsId, subscriber] of runtime.subscribers) {
      try {
        const envelope = this.makeEnvelope(runtime, event.payload, event.runId ?? runtime.currentRun?.runId);
        subscriber.wc.send(event.channel, envelope);
      } catch (error) {
        runtime.subscribers.delete(contentsId);
        const winSet = this.windowSessionIds.get(subscriber.windowId);
        if (winSet) {
          winSet.delete(runtime.sessionId);
          if (!winSet.size) this.windowSessionIds.delete(subscriber.windowId);
        }
      }
    }
  }

  private replayBufferedEvents(runtime: SessionRuntime, wc: WebContents): void {
    const run = runtime.currentRun;
    if (!run || !run.buffer.length) return;
    for (const event of run.buffer) {
      try {
        const envelope = this.makeEnvelope(runtime, event.payload, event.runId ?? run.runId);
        wc.send(event.channel, envelope);
      } catch {}
    }
  }
}
