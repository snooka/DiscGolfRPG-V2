import type { GameMode, Profile, RoundHistoryEntry } from '../types.ts';
import { t } from '../i18n/index.ts';

/** Daglige oppdrag (Daily Quests). Fremdrift utledes fra rundehistorikken i dag. */
export interface QuestDef {
  id: string;
  icon: string;
  title: string;
  desc: string;
  target: number;
  /** Bonus-XP når belønningen hentes. */
  reward: number;
  measure: (todays: RoundHistoryEntry[]) => number;
}

const countMode = (mode: GameMode) => (e: RoundHistoryEntry[]) =>
  e.filter((r) => r.mode === mode).length;

export const QUEST_POOL: QuestDef[] = [
  { id: 'q_round', icon: '🥏', get title() { return t('Dagens runde'); }, get desc() { return t('Fullfør en runde i en valgfri spillmodus.'); }, target: 1, reward: 40, measure: (e) => e.length },
  { id: 'q_normal', icon: '🎯', get title() { return t('Klassikeren'); }, get desc() { return t('Fullfør en Normal Game-runde.'); }, target: 1, reward: 50, measure: countMode('normal') },
  { id: 'q_dual', icon: '👯', get title() { return t('To skudd'); }, get desc() { return t('Fullfør en Dual Tee-runde.'); }, target: 1, reward: 80, measure: countMode('dual_tee') },
  { id: 'q_roulette', icon: '🎡', get title() { return t('Snurr hjulet'); }, get desc() { return t('Fullfør en Disc Roulette-runde.'); }, target: 1, reward: 80, measure: countMode('roulette') },
  { id: 'q_birdie', icon: '🐦', get title() { return t('Birdie-jakt'); }, get desc() { return t('Sett minst én birdie (eller bedre) i dag.'); }, target: 1, reward: 60, measure: (e) => e.reduce((a, r) => a + r.birdies, 0) },
  { id: 'q_birdie3', icon: '🦅', get title() { return t('Birdie-trippel'); }, get desc() { return t('Sett tre birdier (eller bedre) i dag.'); }, target: 3, reward: 120, measure: (e) => e.reduce((a, r) => a + r.birdies, 0) },
  { id: 'q_holes', icon: '⛳', get title() { return t('Maraton'); }, get desc() { return t('Spill 18 hull i dag.'); }, target: 18, reward: 90, measure: (e) => e.reduce((a, r) => a + r.holes, 0) },
  { id: 'q_putter', icon: '🎳', get title() { return t('Putter-dagen'); }, get desc() { return t('Fullfør en Putter Game-runde.'); }, target: 1, reward: 80, measure: countMode('putter') },
  { id: 'q_putts', icon: '🕳️', get title() { return t('Kjedelyd'); }, get desc() { return t('Registrer 20 putts i Putter Game i dag.'); }, target: 20, reward: 90, measure: (e) => e.reduce((a, r) => a + r.putts, 0) },
  { id: 'q_par', icon: '🛡️', get title() { return t('Stødig'); }, get desc() { return t('Fullfør en runde på par eller bedre.'); }, target: 1, reward: 100, measure: (e) => e.filter((r) => r.diff <= 0).length },
];

export const QUESTS_PER_DAY = 3;

/** Lokal dato som nøkkel, f.eks. «2026-10-20». */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let tm = Math.imul(a ^ (a >>> 15), 1 | a);
    tm = (tm + Math.imul(tm ^ (tm >>> 7), 61 | tm)) ^ tm;
    return ((tm ^ (tm >>> 14)) >>> 0) / 4294967296;
  };
}

/** Samme tre oppdrag hele dagen (deterministisk på dato). */
export function questsForDay(key: string): QuestDef[] {
  const rnd = mulberry32(seedFrom(key));
  const pool = [...QUEST_POOL];
  const picked: QuestDef[] = [];
  while (picked.length < QUESTS_PER_DAY && pool.length > 0) {
    picked.push(...pool.splice(Math.floor(rnd() * pool.length), 1));
  }
  return picked;
}

export interface QuestStatus {
  quest: QuestDef;
  progress: number;
  done: boolean;
  claimed: boolean;
}

export function questStatuses(profile: Profile, now: number = Date.now()): QuestStatus[] {
  const key = dayKey(now);
  const todays = profile.history.filter((r) => dayKey(r.at) === key);
  const claimed = profile.questClaims[key] ?? [];
  return questsForDay(key).map((quest) => {
    const progress = Math.min(quest.target, quest.measure(todays));
    return { quest, progress, done: progress >= quest.target, claimed: claimed.includes(quest.id) };
  });
}

/**
 * Verifiserer dagens oppdrag mot rundehistorikken og belønner nye fullførte
 * oppdrag automatisk. Fremdriften kommer kun fra fullførte runder (resultatet
 * fra scorekortet), så XP kan ikke hentes ut manuelt.
 */
export function awardQuests(
  profile: Profile,
  now: number = Date.now()
): { profile: Profile; completed: QuestDef[] } {
  const key = dayKey(now);
  const fresh = questStatuses(profile, now).filter((s) => s.done && !s.claimed);
  if (fresh.length === 0) return { profile, completed: [] };
  const reward = fresh.reduce((a, s) => a + s.quest.reward, 0);
  return {
    profile: {
      ...profile,
      xp: profile.xp + reward,
      // Bare dagens nøkkel beholdes
      questClaims: {
        [key]: [...(profile.questClaims[key] ?? []), ...fresh.map((s) => s.quest.id)],
      },
    },
    completed: fresh.map((s) => s.quest),
  };
}
