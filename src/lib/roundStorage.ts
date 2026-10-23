import type { PersistedRound } from './roundSync.ts';
import { readJson, STORAGE_KEYS, writeJson, writeString } from './storage.ts';

// En lokal kopi av pågående runde lagres på enheten, slik at den overlever at
// nettleseren lukkes, og slik at endringer gjort uten dekning ikke går tapt
// (de sendes til skyen neste gang det er nett). Skyen er fortsatt fasiten for
// runder med flere spillere.

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

export function isValidPersisted(v: unknown): v is PersistedRound {
  if (!isObject(v) || !isObject(v.doc) || !isObject(v.device)) return false;
  const { head, players, holes, scores } = v.doc;
  if (!isObject(head) || typeof head.id !== 'string' || typeof head.holeCount !== 'number') return false;
  if (!['normal', 'dual_tee', 'roulette', 'putter'].includes(String(head.mode))) return false;
  if (!isObject(head.config) || !Array.isArray(head.config.segments)) return false;
  if (!Array.isArray(players) || players.length === 0) return false;
  if (!isObject(holes) || !isObject(scores)) return false;
  return (
    typeof v.device.currentHole === 'number' &&
    typeof v.device.steps === 'number' &&
    typeof v.device.wheelSource === 'string' &&
    Array.isArray(v.unsent)
  );
}

export function loadPersisted(userId: string, roundId: string): PersistedRound | null {
  const raw = readJson<unknown>(STORAGE_KEYS.round(userId, roundId), null);
  return isValidPersisted(raw) ? raw : null;
}

export function savePersisted(userId: string, roundId: string, state: PersistedRound | null): boolean {
  const key = STORAGE_KEYS.round(userId, roundId);
  return state === null ? writeString(key, null) : writeJson(key, state);
}

const readIds = (key: string): string[] => {
  const raw = readJson<unknown>(key, []);
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
};

export const localRoundIds = (userId: string): string[] => readIds(STORAGE_KEYS.roundIds(userId));

export function addLocalRoundId(userId: string, roundId: string): void {
  const ids = localRoundIds(userId);
  if (!ids.includes(roundId)) writeJson(STORAGE_KEYS.roundIds(userId), [...ids, roundId].slice(-20));
}

export function removeLocalRound(userId: string, roundId: string): void {
  writeJson(
    STORAGE_KEYS.roundIds(userId),
    localRoundIds(userId).filter((id) => id !== roundId)
  );
  savePersisted(userId, roundId, null);
}

export const dismissedRounds = (userId: string): string[] => readIds(STORAGE_KEYS.dismissed(userId));

export function dismissRound(userId: string, roundId: string): void {
  const ids = dismissedRounds(userId);
  if (!ids.includes(roundId)) writeJson(STORAGE_KEYS.dismissed(userId), [...ids, roundId].slice(-50));
}
