import type { DiscType, GameMode } from '../types.ts';
import { t } from '../i18n/index.ts';

// ==========================================
// SPILLMODI
// ==========================================

export interface GameModeDef {
  id: GameMode;
  name: string;
  icon: string;
  tagline: string;
  rules: string[];
  /** Tailwind-fargeklasser for kortet */
  accent: string;
  /** Tell mot vanlig rating (beste runde osv.)? */
  countsForRating: boolean;
}

export const GAME_MODES: GameModeDef[] = [
  {
    id: 'normal',
    name: 'Normal Game',
    icon: '🥏',
    get tagline() { return t('Standard runde'); },
    get rules() {
      return [
        t('Vanlig diskgolf – du velger selv hvilken disk du kaster.'),
        t('Teller mot rating (beste runde) og vanlig XP.'),
      ];
    },
    accent: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300',
    countsForRating: true,
  },
  {
    id: 'dual_tee',
    name: 'Dual Tee',
    icon: '👯',
    get tagline() { return t('To tee-kast, velg det beste'); },
    get rules() {
      return [
        t('Kast 2 kast fra tee på hvert hull.'),
        t('Velg den best plasserte disken og spill resten av hullet derfra.'),
        t('Egen statistikk – påvirker ikke ratingen i Normal Game.'),
      ];
    },
    accent: 'border-cyan-500/60 bg-cyan-500/10 text-cyan-300',
    countsForRating: false,
  },
  {
    id: 'roulette',
    name: 'Disc Roulette',
    icon: '🎡',
    get tagline() { return t('Hjulet bestemmer disken'); },
    get rules() {
      return [
        t('Før hvert hull spinner du hjulet.'),
        t('Hele gruppen må kaste hullet med disktypen hjulet lander på.'),
        t('Egen statistikk – påvirker ikke ratingen i Normal Game.'),
      ];
    },
    accent: 'border-amber-500/60 bg-amber-500/10 text-amber-300',
    countsForRating: false,
  },
  {
    id: 'putter',
    name: 'Putter Game',
    icon: '🎳',
    get tagline() { return t('Bare putter – og alle puttene telles'); },
    get rules() {
      return [
        t('Alle kast på hele runden kastes med putter.'),
        t('Du registrerer antall putts på hvert hull – totalen føres i egen puttstatistikk.'),
        t('Egen statistikk – påvirker ikke ratingen i Normal Game.'),
      ];
    },
    accent: 'border-pink-500/60 bg-pink-500/10 text-pink-300',
    countsForRating: false,
  },
];

export const GAME_MODE_BY_ID: Record<GameMode, GameModeDef> = {
  normal: GAME_MODES[0],
  dual_tee: GAME_MODES[1],
  roulette: GAME_MODES[2],
  putter: GAME_MODES[3],
};

export const ALL_MODES: GameMode[] = ['normal', 'dual_tee', 'roulette', 'putter'];

// ==========================================
// DUAL TEE
// ==========================================

/**
 * Teller det ekstra tee-kastet på scoren?
 *  - false (standard): spilleren kaster to tee-kast, men bare det valgte
 *    kastet teller. Det andre er «gratis» (som en scramble/mulligan).
 *  - true: begge tee-kastene teller. Da skriver man inn det faktiske
 *    antallet kast, og antall kastede disker er lik scoren.
 */
export const DUAL_TEE_EXTRA_THROW_COUNTS = false;

// ==========================================
// DISC ROULETTE
// ==========================================

export const DISC_TYPES: DiscType[] = [
  'Putter',
  'Midrange',
  'Fairway Driver',
  'Distance Driver',
];

export interface RouletteSegment {
  id: string;
  label: string;
  icon: string;
  /** Fargen på hjulets felt */
  color: string;
  /** Hvis satt: kan matches mot disker i bagen */
  discType?: DiscType;
  rule: string;
}

export const ROULETTE_SEGMENTS: RouletteSegment[] = [
  {
    id: 'putter',
    get label() { return t('Putter'); },
    icon: '🎯',
    color: '#f59e0b',
    discType: 'Putter',
    get rule() { return t('Alle kast på hullet må kastes med en putter.'); },
  },
  {
    id: 'midrange',
    get label() { return t('Midrange'); },
    icon: '🧭',
    color: '#06b6d4',
    discType: 'Midrange',
    get rule() { return t('Alle kast på hullet må kastes med en midrange.'); },
  },
  {
    id: 'fairway',
    get label() { return t('Fairway Driver'); },
    icon: '🚀',
    color: '#10b981',
    discType: 'Fairway Driver',
    get rule() { return t('Alle kast på hullet må kastes med en fairway driver.'); },
  },
  {
    id: 'distance',
    get label() { return t('Distance Driver'); },
    icon: '💥',
    color: '#ef4444',
    discType: 'Distance Driver',
    get rule() { return t('Alle kast på hullet må kastes med en distance driver.'); },
  },
  {
    id: 'forehand',
    get label() { return t('Forehand'); },
    icon: '🤾',
    color: '#a855f7',
    get rule() { return t('Alle kast må være forehand (sidearm) – valgfri disk.'); },
  },
  {
    id: 'free',
    get label() { return t('Fri disk'); },
    icon: '🎲',
    color: '#64748b',
    get rule() { return t('Bonushull! Fritt valg av disk og kast.'); },
  },
];

export const ROULETTE_SEGMENT_BY_ID: Record<string, RouletteSegment> =
  Object.fromEntries(ROULETTE_SEGMENTS.map((s) => [s.id, s]));

/** Standardhjulet: de fire disktypene. Bonusfelt kan slås på i oppsettet. */
export const DEFAULT_SEGMENT_IDS: string[] = [
  'putter',
  'midrange',
  'fairway',
  'distance',
];

export const MIN_SEGMENTS = 2;
