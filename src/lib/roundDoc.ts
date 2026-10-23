import type {
  RoundHead,
  RoundHoleRow,
  RoundOp,
  RoundPlayerRow,
  RoundRows,
  RoundScoreRow,
} from '../backend/types.ts';
import type { DiscItem, RoundPlayer, RoundState } from '../types.ts';
import type { CreateRoundInput } from '../backend/types.ts';
import type { RoundConfig } from './round.ts';
import { DEFAULT_PAR } from './round.ts';

// ==========================================
// DELT RUNDE-DOKUMENT (rene funksjoner)
// ==========================================
// Serveren lagrer en runde som rader: én per hull og én per (spiller, hull).
// Appen jobber med `RoundState` (matriser). Her oversettes det begge veier:
//
//   rader  ──toRoundState──▶  RoundState  ──(UI endrer)──▶  RoundState'
//   rader' ◀──applyOp(diffRound)────────────────────────────────┘
//
// Mangler en rad, er verdien standard: score = par, putts = 0, ingen tee-valg.
// Da trenger ikke en ny runde å skrive hundrevis av rader før noen gjør noe.

export interface RoundDoc {
  head: RoundHead;
  players: RoundPlayerRow[];
  holes: Record<number, RoundHoleRow>;
  scores: Record<string, RoundScoreRow>;
}

/** Tilstand som bare gjelder denne enheten (ikke delt med de andre). */
export interface DeviceRoundState {
  currentHole: number;
  steps: number;
  wheelSource: string;
}

export const scoreKey = (playerKey: string, hole: number): string => `${playerKey}:${hole}`;

export const opKey = (op: RoundOp): string =>
  op.t === 'hole' ? `h:${op.hole}` : `s:${scoreKey(op.playerKey, op.hole)}`;

export function docFromRows(rows: RoundRows): RoundDoc {
  const holes: Record<number, RoundHoleRow> = {};
  for (const h of rows.holes) holes[h.hole] = h;
  const scores: Record<string, RoundScoreRow> = {};
  for (const s of rows.scores) scores[scoreKey(s.playerKey, s.hole)] = s;
  return {
    head: rows.head,
    players: [...rows.players].sort((a, b) => a.position - b.position),
    holes,
    scores,
  };
}

const parseDisc = (json: string | null): DiscItem | null => {
  if (!json) return null;
  try {
    const v: unknown = JSON.parse(json);
    if (typeof v === 'object' && v !== null && typeof (v as DiscItem).id === 'string') {
      return v as DiscItem;
    }
  } catch {
    /* ugyldig JSON – ignoreres */
  }
  return null;
};

const parOf = (doc: RoundDoc, hole: number): number => doc.holes[hole]?.par ?? DEFAULT_PAR;

export function toRoundState(
  doc: RoundDoc,
  device: DeviceRoundState,
  myUserId: string
): RoundState {
  const n = doc.head.holeCount;
  const holeNos = Array.from({ length: n }, (_, i) => i + 1);
  const me = doc.players.find((p) => p.userId === myUserId);
  const discs = holeNos.map((h) => parseDisc(doc.holes[h]?.spinDisc ?? null));
  return {
    id: doc.head.id,
    startedAt: doc.head.createdAt,
    mode: doc.head.mode,
    course: doc.head.course,
    layout: holeNos.map((h) => ({ hole: h, par: parOf(doc, h) })),
    players: doc.players.map((p) => ({
      key: p.key,
      name: p.name,
      userId: p.userId,
      ...(p.left ? { left: true } : {}),
    })),
    scores: doc.players.map((p) =>
      holeNos.map((h) => doc.scores[scoreKey(p.key, h)]?.score ?? parOf(doc, h))
    ),
    teePicks: doc.players.map((p) =>
      holeNos.map((h) => doc.scores[scoreKey(p.key, h)]?.teePick ?? null)
    ),
    putts: doc.players.map((p) => holeNos.map((h) => doc.scores[scoreKey(p.key, h)]?.putts ?? 0)),
    spins: holeNos.map((h) => doc.holes[h]?.spin ?? null),
    spinDiscs: discs.map((d) => d?.id ?? null),
    spinDiscItems: discs,
    segments: doc.head.config.segments,
    wheelSource: device.wheelSource,
    courseVerified: me?.verified ?? false,
    confirmed: holeNos.map((h) => doc.holes[h]?.confirmed ?? false),
    currentHole: Math.min(Math.max(device.currentHole, 0), n - 1),
    steps: device.steps,
    weather: doc.head.config.weather,
  };
}

/** Bruker en endring på dokumentet (uten å mutere). Manglende felt i op-en røres ikke. */
export function applyOp(doc: RoundDoc, op: RoundOp): RoundDoc {
  if (op.t === 'hole') {
    const cur: RoundHoleRow = doc.holes[op.hole] ?? {
      hole: op.hole,
      par: DEFAULT_PAR,
      confirmed: false,
      spin: null,
      spinDisc: null,
    };
    const next: RoundHoleRow = {
      ...cur,
      ...(op.par !== undefined ? { par: op.par } : {}),
      ...(op.confirmed !== undefined ? { confirmed: op.confirmed } : {}),
      ...(op.spin !== undefined ? { spin: op.spin } : {}),
      ...(op.spinDisc !== undefined ? { spinDisc: op.spinDisc } : {}),
    };
    return { ...doc, holes: { ...doc.holes, [op.hole]: next } };
  }
  const key = scoreKey(op.playerKey, op.hole);
  const cur: RoundScoreRow = doc.scores[key] ?? {
    playerKey: op.playerKey,
    hole: op.hole,
    score: parOf(doc, op.hole),
    putts: 0,
    teePick: null,
  };
  const next: RoundScoreRow = {
    ...cur,
    ...(op.score !== undefined ? { score: op.score } : {}),
    ...(op.putts !== undefined ? { putts: op.putts } : {}),
    ...(op.teePick !== undefined ? { teePick: op.teePick } : {}),
  };
  return { ...doc, scores: { ...doc.scores, [key]: next } };
}

/**
 * En endring som kom fra en annen enhet. Felter jeg selv har endret og som ennå
 * ikke er bekreftet av serveren (`pending`) beholdes – min siste endring vinner.
 */
export function applyRemoteOp(doc: RoundDoc, remote: RoundOp, pending: RoundOp | undefined): RoundDoc {
  if (!pending) return applyOp(doc, remote);
  if (remote.t === 'hole' && pending.t === 'hole') {
    const keep = { ...remote };
    if (pending.par !== undefined) delete keep.par;
    if (pending.confirmed !== undefined) delete keep.confirmed;
    if (pending.spin !== undefined) delete keep.spin;
    if (pending.spinDisc !== undefined) delete keep.spinDisc;
    return applyOp(doc, keep);
  }
  if (remote.t === 'score' && pending.t === 'score') {
    const keep = { ...remote };
    if (pending.score !== undefined) delete keep.score;
    if (pending.putts !== undefined) delete keep.putts;
    if (pending.teePick !== undefined) delete keep.teePick;
    return applyOp(doc, keep);
  }
  return applyOp(doc, remote);
}

/** Slår to endringer på samme celle sammen (den siste vinner per felt). */
export function mergeOps(a: RoundOp, b: RoundOp): RoundOp {
  if (a.t === 'hole' && b.t === 'hole') {
    return { ...a, ...b, t: 'hole' };
  }
  if (a.t === 'score' && b.t === 'score') {
    return { ...a, ...b, t: 'score' };
  }
  return b;
}

/**
 * Hvilke endringer må til for at `doc` skal gi `next`? Brukes slik at all
 * eksisterende rundelogikk (adjustScore, confirmHole …) kan fortsette å
 * jobbe på RoundState, mens bare det som faktisk er endret sendes til skyen.
 */
export function diffRound(doc: RoundDoc, next: RoundState): RoundOp[] {
  const ops: RoundOp[] = [];
  let working = doc;
  const push = (op: RoundOp) => {
    ops.push(op);
    working = applyOp(working, op);
  };

  // 1) Hull: par, lagret, hjulutfall
  next.layout.forEach((layoutHole, i) => {
    const hole = i + 1;
    const cur = working.holes[hole];
    const op: Extract<RoundOp, { t: 'hole' }> = { t: 'hole', hole };
    let changed = false;
    if (layoutHole.par !== (cur?.par ?? DEFAULT_PAR)) {
      op.par = layoutHole.par;
      changed = true;
    }
    if (next.confirmed[i] !== (cur?.confirmed ?? false)) {
      op.confirmed = next.confirmed[i];
      changed = true;
    }
    if (next.spins[i] !== (cur?.spin ?? null)) {
      op.spin = next.spins[i];
      changed = true;
    }
    const nextDisc = next.spinDiscItems[i];
    const curDisc = parseDisc(cur?.spinDisc ?? null);
    if ((nextDisc?.id ?? null) !== (curDisc?.id ?? null)) {
      op.spinDisc = nextDisc ? JSON.stringify(nextDisc) : null;
      changed = true;
    }
    if (changed) push(op);
  });

  // 2) Score, putts og tee-valg. Sammenlignes med det dokumentet allerede gir
  //    (inkl. standardverdier), så en endret par ikke lager en rad per spiller.
  next.players.forEach((player, p) => {
    next.layout.forEach((_, i) => {
      const hole = i + 1;
      const row = working.scores[scoreKey(player.key, hole)];
      const curScore = row?.score ?? parOf(working, hole);
      const curPutts = row?.putts ?? 0;
      const curTee = row?.teePick ?? null;
      const op: Extract<RoundOp, { t: 'score' }> = { t: 'score', playerKey: player.key, hole };
      let changed = false;
      if (next.scores[p][i] !== curScore) {
        op.score = next.scores[p][i];
        changed = true;
      }
      if (next.putts[p][i] !== curPutts) {
        op.putts = next.putts[p][i];
        changed = true;
      }
      if ((next.teePicks[p][i] ?? null) !== curTee) {
        op.teePick = next.teePicks[p][i] ?? null;
        changed = true;
      }
      if (!changed) return;
      // Ny rad: serveren krever score, så den sendes alltid med
      if (!row && op.score === undefined) op.score = next.scores[p][i];
      push(op);
    });
  });

  return ops;
}

/** Oppdaterer en spillers rad i dokumentet (f.eks. verified/left fra en annen enhet). */
export function applyPlayer(doc: RoundDoc, row: RoundPlayerRow): RoundDoc {
  const exists = doc.players.some((p) => p.key === row.key);
  const players = exists
    ? doc.players.map((p) => (p.key === row.key ? row : p))
    : [...doc.players, row].sort((a, b) => a.position - b.position);
  return { ...doc, players };
}

/** Bygger dokumentet for en ny runde (verten er alltid første spiller). */
export function newRoundDoc(
  id: string,
  hostId: string,
  config: RoundConfig,
  now = Date.now()
): RoundDoc {
  return {
    head: {
      id,
      hostId,
      mode: config.mode,
      course: config.course,
      holeCount: config.holeCount,
      config: {
        segments: config.segments,
        weather: config.weather,
        courseKnown: config.courseVerified,
      },
      status: 'active',
      createdAt: now,
      finishedAt: null,
    },
    players: config.players.map((p: RoundPlayer, i) => ({
      key: p.key,
      name: p.name,
      userId: p.userId,
      position: i,
      verified: p.userId === hostId && config.courseVerified,
      left: false,
    })),
    holes: {},
    scores: {},
  };
}

/** Argumentene som sendes til skyen for å opprette runden. */
export function createInputFromDoc(doc: RoundDoc, hostVerified: boolean): CreateRoundInput {
  return {
    id: doc.head.id,
    mode: doc.head.mode,
    course: doc.head.course,
    holeCount: doc.head.holeCount,
    config: doc.head.config,
    players: doc.players.map((p) => ({ key: p.key, name: p.name, userId: p.userId })),
    hostVerified,
  };
}
