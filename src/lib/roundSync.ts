import type { Backend, RoundOp, RoundPlayerRow, RoundRows } from '../backend/types.ts';
import type { RoundState } from '../types.ts';
import {
  applyOp,
  applyPlayer,
  applyRemoteOp,
  diffRound,
  docFromRows,
  mergeOps,
  opKey,
  toRoundState,
} from './roundDoc.ts';
import type { DeviceRoundState, RoundDoc } from './roundDoc.ts';

// ==========================================
// SANNTIDS-SYNK AV EN RUNDE
// ==========================================
// Én instans per åpen runde på denne enheten.
//  • Lokale endringer vises umiddelbart (optimistisk), samles opp i ~150 ms og
//    sendes til skyen som delvise oppdateringer. Feiler det, prøves det på nytt.
//  • Endringer fra andre enheter kommer via realtime og flettes inn. Felter jeg
//    selv har endret og som ikke er bekreftet ennå beholdes (min siste vinner).
//  • Ved (re)kobling, når appen kommer tilbake i forgrunnen, og med jevne
//    mellomrom hentes hele runden på nytt – realtime kan miste meldinger
//    (f.eks. når telefonen sover).
//  • Lokale runder (kun meg og gjester) har ingen backend og synkes ikke.

export type SyncStatus = 'local' | 'live' | 'saving' | 'offline';

export interface SyncSnapshot {
  doc: RoundDoc;
  device: DeviceRoundState;
  status: SyncStatus;
  /** Økes for hver endring – gjør at React ser at noe har skjedd */
  version: number;
}

export interface PersistedRound {
  doc: RoundDoc;
  device: DeviceRoundState;
  unsent: RoundOp[];
}

export interface RoundSyncOptions {
  backend: Backend | null;
  userId: string;
  doc: RoundDoc;
  device: DeviceRoundState;
  /** Operasjoner som ikke rakk å bli sendt før appen ble lukket */
  unsent?: RoundOp[];
  /** Kalles ved hver endring som bør lagres lokalt (for å overleve reload/offline) */
  persist?: (state: PersistedRound) => void;
  /** Kalles når en annen enhet endret en celle (til visuell markering) */
  onRemoteTouch?: (touch: { playerKey: string | null; hole: number }) => void;
  /** Kalles når rundens status endres (fullført/avbrutt av en annen) */
  onHeadStatus?: (status: RoundDoc['head']['status']) => void;
  flushDelayMs?: number;
  /** 0 = ingen periodisk henting (tester) */
  resyncIntervalMs?: number;
}

export class RoundSync {
  private doc: RoundDoc;
  private device: DeviceRoundState;
  private pending = new Map<string, RoundOp>();
  private inflight = new Map<string, RoundOp>();
  private status: SyncStatus;
  private version = 0;
  private snapshot: SyncSnapshot;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private flushing: Promise<void> | null = null;
  private retries = 0;
  private unsubscribe: (() => void) | null = null;
  private stopped = false;
  private visibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') void this.resync();
  };

  private readonly opts: RoundSyncOptions;

  constructor(opts: RoundSyncOptions) {
    this.opts = opts;
    this.doc = opts.doc;
    this.device = opts.device;
    this.status = opts.backend ? 'live' : 'local';
    for (const op of opts.unsent ?? []) {
      const k = opKey(op);
      const old = this.pending.get(k);
      this.pending.set(k, old ? mergeOps(old, op) : op);
      this.doc = applyOp(this.doc, op);
    }
    if (this.pending.size > 0) this.status = 'saving';
    this.snapshot = this.makeSnapshot();
  }

  // ---------- React-grensesnitt (useSyncExternalStore) ----------

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  getSnapshot = (): SyncSnapshot => this.snapshot;

  get roundId(): string {
    return this.doc.head.id;
  }

  get remote(): boolean {
    return this.opts.backend !== null;
  }

  /** Rundetilstanden slik UI-et bruker den. */
  getState(): RoundState {
    return toRoundState(this.doc, this.device, this.opts.userId);
  }

  getDoc(): RoundDoc {
    return this.doc;
  }

  private makeSnapshot(): SyncSnapshot {
    return { doc: this.doc, device: this.device, status: this.status, version: this.version };
  }

  private emit(persist = true): void {
    this.version += 1;
    this.snapshot = this.makeSnapshot();
    if (persist) {
      this.opts.persist?.({
        doc: this.doc,
        device: this.device,
        unsent: [...this.inflight.values(), ...this.pending.values()],
      });
    }
    for (const l of this.listeners) l();
  }

  private setStatus(status: SyncStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emit(false);
  }

  // ---------- Lokale endringer ----------

  /** UI-et endrer runden. Deler som er delt sendes til skyen, resten blir på enheten. */
  update(updater: (round: RoundState) => RoundState): void {
    if (this.stopped) return;
    const prev = this.getState();
    const next = updater(prev);
    if (next === prev) return;

    const ops = diffRound(this.doc, next);
    const deviceChanged =
      next.currentHole !== this.device.currentHole ||
      next.steps !== this.device.steps ||
      next.wheelSource !== this.device.wheelSource;
    if (ops.length === 0 && !deviceChanged) return;

    if (deviceChanged) {
      this.device = {
        currentHole: next.currentHole,
        steps: next.steps,
        wheelSource: next.wheelSource,
      };
    }
    for (const op of ops) {
      this.doc = applyOp(this.doc, op);
      const k = opKey(op);
      const old = this.pending.get(k);
      this.pending.set(k, old ? mergeOps(old, op) : op);
    }
    if (ops.length > 0 && this.opts.backend) {
      this.setStatusQuiet('saving');
      this.scheduleFlush();
    }
    this.emit();
  }

  /** Endrer bare enhets-tilstand (skritt) uten å lage en ny rundeversjon i skyen. */
  setSteps(steps: number): void {
    if (steps === this.device.steps) return;
    this.device = { ...this.device, steps };
    this.emit();
  }

  private setStatusQuiet(status: SyncStatus): void {
    this.status = status;
  }

  private scheduleFlush(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush().catch(() => undefined);
    }, this.opts.flushDelayMs ?? 150);
  }

  /** Sender alt som venter. Kaster hvis det ikke lyktes (endringene beholdes og prøves igjen). */
  flush(): Promise<void> {
    const backend = this.opts.backend;
    if (!backend) {
      this.pending.clear();
      return Promise.resolve();
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.flushing) {
      // Venter på pågående sending og sender det som har kommet til siden
      return this.flushing.then(() => this.flush());
    }
    if (this.pending.size === 0) {
      if (this.inflight.size === 0) this.setStatus('live');
      return Promise.resolve();
    }
    const batch = [...this.pending.entries()];
    this.pending = new Map();
    for (const [k, op] of batch) this.inflight.set(k, op);

    const run = async () => {
      try {
        await backend.rounds.writeOps(
          this.doc.head.id,
          this.opts.userId,
          batch.map(([, op]) => op)
        );
        for (const [k, op] of batch) {
          if (this.inflight.get(k) === op) this.inflight.delete(k);
        }
        this.retries = 0;
        if (this.pending.size === 0 && this.inflight.size === 0) this.setStatus('live');
        else this.setStatus('saving');
        this.opts.persist?.({
          doc: this.doc,
          device: this.device,
          unsent: [...this.inflight.values(), ...this.pending.values()],
        });
      } catch (e) {
        // Legg tilbake og prøv igjen senere
        for (const [k, op] of batch) {
          const later = this.pending.get(k);
          this.pending.set(k, later ? mergeOps(op, later) : op);
          this.inflight.delete(k);
        }
        this.retries += 1;
        this.setStatus('offline');
        this.scheduleRetry();
        throw e;
      } finally {
        this.flushing = null;
      }
    };
    this.flushing = run();
    return this.flushing;
  }

  private scheduleRetry(): void {
    if (this.retryTimer || this.stopped) return;
    const delay = Math.min(15_000, 1500 * 2 ** Math.min(this.retries, 4));
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush().catch(() => undefined);
    }, delay);
  }

  // ---------- Fjernendringer ----------

  private unackedFor(key: string): RoundOp | undefined {
    const a = this.inflight.get(key);
    const b = this.pending.get(key);
    if (a && b) return mergeOps(a, b);
    return b ?? a;
  }

  private onRemoteOp = (op: RoundOp): void => {
    if (this.stopped) return;
    const before = this.doc;
    this.doc = applyRemoteOp(this.doc, op, this.unackedFor(opKey(op)));
    if (this.doc === before) return;
    this.opts.onRemoteTouch?.({ playerKey: op.t === 'score' ? op.playerKey : null, hole: op.hole });
    this.emit();
  };

  private onRemotePlayer = (row: RoundPlayerRow): void => {
    if (this.stopped) return;
    this.doc = applyPlayer(this.doc, row);
    this.emit();
  };

  /** Henter hele runden på nytt og fletter den med det jeg har endret selv. */
  async resync(): Promise<void> {
    const backend = this.opts.backend;
    if (!backend || this.stopped) return;
    let rows: RoundRows | null;
    try {
      rows = await backend.rounds.load(this.doc.head.id);
    } catch {
      return; // ingen nett – prøver igjen senere
    }
    if (!rows || this.stopped) return;
    let doc = docFromRows(rows);
    // Mine ubekreftede endringer legges oppå
    for (const op of this.inflight.values()) doc = applyOp(doc, op);
    for (const op of this.pending.values()) doc = applyOp(doc, op);
    const headChanged = doc.head.status !== this.doc.head.status;
    if (JSON.stringify(doc) === JSON.stringify(this.doc)) return;
    this.doc = doc;
    this.emit();
    if (headChanged) this.opts.onHeadStatus?.(doc.head.status);
  }

  /** Setter egen status (GPS-verifisert / forlatt) og sender til skyen. */
  async updateMe(patch: { verified?: boolean; left?: boolean }): Promise<void> {
    const me = this.doc.players.find((p) => p.userId === this.opts.userId);
    if (!me) return;
    this.doc = applyPlayer(this.doc, {
      ...me,
      ...(patch.verified !== undefined ? { verified: patch.verified } : {}),
      ...(patch.left !== undefined ? { left: patch.left } : {}),
    });
    this.emit();
    if (this.opts.backend) await this.opts.backend.rounds.updateMe(this.doc.head.id, patch);
  }

  /** Markerer runden som ferdig/avbrutt lokalt (etter at skyen har bekreftet). */
  setStatusLocal(status: RoundDoc['head']['status']): void {
    this.doc = { ...this.doc, head: { ...this.doc.head, status } };
    this.emit();
  }

  // ---------- Livssyklus ----------

  start(): void {
    const backend = this.opts.backend;
    if (!backend) return;
    this.unsubscribe = backend.realtime.subscribeRound(this.doc.head.id, {
      onOp: this.onRemoteOp,
      onPlayer: this.onRemotePlayer,
      onHead: (head) => {
        if (this.stopped) return;
        const changed = head.status !== this.doc.head.status;
        this.doc = { ...this.doc, head };
        this.emit();
        if (changed) this.opts.onHeadStatus?.(head.status);
      },
      onConnected: () => void this.resync(),
    });
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibility);
    }
    const every = this.opts.resyncIntervalMs ?? 20_000;
    if (every > 0) this.poll = setInterval(() => void this.resync(), every);
    if (this.pending.size > 0) this.scheduleFlush();
    void this.resync();
  }

  stop(): void {
    this.stopped = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.timer) clearTimeout(this.timer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.poll) clearInterval(this.poll);
    this.timer = this.retryTimer = this.poll = null;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibility);
    }
    this.listeners.clear();
  }
}
