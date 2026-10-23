import { LEVEL_TIERS } from '../data/levels.ts';
import type { LevelTier } from '../data/levels.ts';
import type { GameMode } from '../types.ts';

// ==========================================
// NIVÅ OG XP
// ==========================================

export const MAX_LEVEL = 50;

/** Total XP som kreves for å nå et gitt level. Level 1 starter på 0 XP. */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(500 * Math.pow(1.18, level - 2));
}

export interface LevelInfo {
  level: number;
  tier: LevelTier;
  /** XP der inneværende level startet */
  currentFloor: number;
  /** XP som kreves for neste level (lik currentFloor på maks-level) */
  nextFloor: number;
  /** 0–1 */
  progress: number;
  isMax: boolean;
}

export function getLevelInfo(xp: number): LevelInfo {
  const safeXp = Math.max(0, Math.floor(xp));
  let level = 1;
  while (level < MAX_LEVEL && safeXp >= xpForLevel(level + 1)) level += 1;

  const isMax = level >= MAX_LEVEL;
  const currentFloor = xpForLevel(level);
  const nextFloor = isMax ? currentFloor : xpForLevel(level + 1);
  const progress = isMax
    ? 1
    : (safeXp - currentFloor) / Math.max(1, nextFloor - currentFloor);

  let tier = LEVEL_TIERS[0];
  for (const tm of LEVEL_TIERS) if (level >= tm.level) tier = tm;

  return { level, tier, currentFloor, nextFloor, progress, isMax };
}

/**
 * XP per runde. Alle modi gir XP til samme level-system, men hver modus
 * har sin egen formel her og XP-en loggføres separat per modus
 * (ModeStats.xpEarned). Endre tallene her for å justere balansen.
 */
export const MODE_XP: Record<GameMode, { base: number; perHole: number }> = {
  normal: { base: 100, perHole: 15 },
  dual_tee: { base: 100, perHole: 15 },
  roulette: { base: 100, perHole: 20 },
  putter: { base: 100, perHole: 18 },
};

export function xpForRound(mode: GameMode, holes: number): number {
  const rule = MODE_XP[mode];
  return rule.base + rule.perHole * holes;
}
