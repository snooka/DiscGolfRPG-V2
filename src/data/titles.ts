import { RARITY_ORDER } from './achievements.ts';
import type { Rarity } from './achievements.ts';
import { allTotals, parOrBetter, underParHoles } from '../lib/stats.ts';
import type { PlayerStats, Profile } from '../types.ts';
import { t } from '../i18n/index.ts';
import { V2_TITLES } from './v2Content.ts';

// ==========================================
// TITLER – vises under navnet på profilen
// ==========================================

export interface TitleDef {
  id: string;
  name: string;
  icon: string;
  /** Hva som kreves for å låse den opp. */
  desc: string;
  /** Den frekke undertittelen. */
  quip: string;
  rarity: Rarity;
  target: number;
  metric: (stats: PlayerStats) => number;
}

export const DEFAULT_TITLE_ID = 'rookie';

const putts = (s: PlayerStats): number => s.modes.putter.putts;

const spanDays = (s: PlayerStats): number =>
  s.extras.firstPlayAt > 0
    ? Math.floor((s.extras.lastPlayAt - s.extras.firstPlayAt) / 86_400_000)
    : 0;

/** Spandager teller først når man har spilt minst `rounds` runder. */
const steadySpan = (rounds: number) => (s: PlayerStats): number =>
  allTotals(s).rounds >= rounds ? spanDays(s) : 0;

const weatherVariety = (s: PlayerStats): number =>
  [
    s.extras.rainRounds,
    s.extras.heavyRainRounds,
    s.extras.windRounds,
    s.extras.stormRounds,
    s.extras.sunRounds,
    s.extras.hotRounds,
    s.extras.coldRounds,
  ].filter((n) => n > 0).length;

export const TITLES: TitleDef[] = [
  {
    id: 'rookie',
    get name() { return t('Rekrutt'); },
    icon: '🌱',
    get desc() { return t('Alle starter et sted.'); },
    get quip() { return t('Alle har en første gang. Dette er din. Ikke ta det personlig.'); },
    rarity: 'common',
    target: 1,
    metric: () => 1,
  },
  {
    id: 'parking_pro',
    get name() { return t('Parkeringsplass-Proffen'); },
    icon: '🅿️',
    get desc() { return t('Fullfør 3 runder.'); },
    get quip() { return t('Bruker mer tid på parkeringsplassen enn på banen.'); },
    rarity: 'common',
    target: 3,
    metric: (s) => allTotals(s).rounds,
  },
  {
    id: 'thermos',
    get name() { return t('Termos-Tobias'); },
    icon: '☕',
    get desc() { return t('Fullfør 5 runder.'); },
    get quip() { return t('Alltid kaffe på termos. Sjelden kontroll på disken.'); },
    rarity: 'common',
    target: 5,
    metric: (s) => allTotals(s).rounds,
  },
  {
    id: 'regular',
    get name() { return t('Fast på Banen'); },
    icon: '🥾',
    get desc() { return t('Fullfør 10 runder.'); },
    get quip() { return t('Kjenner stien bedre enn sin egen svigermor.'); },
    rarity: 'common',
    target: 10,
    metric: (s) => allTotals(s).rounds,
  },
  {
    id: 'tree_hugger',
    get name() { return t('Tre-Klemmeren'); },
    icon: '🌲',
    get desc() { return t('Ha 3 hull på dobbel bogey eller verre i én runde.'); },
    get quip() { return t('Trærne er egentlig bare store venner som tar imot kast.'); },
    rarity: 'common',
    target: 1,
    metric: (s) => s.extras.treeRounds,
  },
  {
    id: 'bogey_grandma',
    get name() { return t('Bogey-Bestemor'); },
    icon: '👵',
    get desc() { return t('Få 10 bogeys.'); },
    get quip() { return t('Strikker en bogey i ny og ne. Veldig koselig.'); },
    rarity: 'common',
    target: 10,
    metric: (s) => allTotals(s).counts.bogey,
  },
  {
    id: 'triple_trouble',
    get name() { return t('Triple-Trond'); },
    icon: '🙈',
    get desc() { return t('Ta en triple bogey eller verre.'); },
    get quip() { return t('«Det var vinden.» Det var ikke vinden.'); },
    rarity: 'common',
    target: 1,
    metric: (s) => allTotals(s).counts.triple,
  },
  {
    id: 'sunny_stian',
    get name() { return t('Solskinns-Stian'); },
    icon: '☀️',
    get desc() { return t('Spill en solrunde på banen.'); },
    get quip() { return t('Solkrem, solbriller og null selvkritikk.'); },
    rarity: 'common',
    target: 1,
    metric: (s) => s.extras.sunRounds,
  },
  {
    id: 'weekender',
    get name() { return t('Helgekriger'); },
    icon: '📅',
    get desc() { return t('Spill på 5 ulike dager.'); },
    get quip() { return t('Skal bare ta én runde. Sa han i går også.'); },
    rarity: 'common',
    target: 5,
    metric: (s) => s.extras.playDays,
  },
  {
    id: 'plopp',
    get name() { return t('Plopp-Pjokken'); },
    icon: '🕳️',
    get desc() { return t('Sett din første putt i Putter Game.'); },
    get quip() { return t('Lyden han hører i drømmene. Plopp.'); },
    rarity: 'common',
    target: 1,
    metric: putts,
  },
  {
    id: 'iron_thrower',
    get name() { return t('Jernarmen'); },
    icon: '🦾',
    get desc() { return t('Kast 1000 disker totalt.'); },
    get quip() { return t('Skulderen har blitt et rettslig anliggende.'); },
    rarity: 'rare',
    target: 1000,
    metric: (s) => allTotals(s).discsThrown,
  },
  {
    id: 'birdie_hunter',
    get name() { return t('Birdie-Jeger'); },
    icon: '🐦',
    get desc() { return t('Sett 10 hull under par.'); },
    get quip() { return t('Stille, presis og dødelig. Som en kattunge med pil og bue.'); },
    rarity: 'rare',
    target: 10,
    metric: (s) => underParHoles(allTotals(s).counts),
  },
  {
    id: 'par_machine',
    get name() { return t('Par-Maskinen'); },
    icon: '⚙️',
    get desc() { return t('Spill 50 hull på par eller bedre.'); },
    get quip() { return t('Gjør det kjedelige så bra at det nesten blir imponerende.'); },
    rarity: 'rare',
    target: 50,
    metric: (s) => parOrBetter(allTotals(s).counts),
  },
  {
    id: 'rain_roy',
    get name() { return t('Regnkappe-Roy'); },
    icon: '☔',
    get desc() { return t('Spill tre runder i regn.'); },
    get quip() { return t('Har ikke vært tørr siden 2019, og trives med det.'); },
    rarity: 'rare',
    target: 3,
    metric: (s) => s.extras.rainRounds,
  },
  {
    id: 'wind_vidar',
    get name() { return t('Vind-Vidar'); },
    icon: '💨',
    get desc() { return t('Spill tre runder med vind på 8 m/s eller mer.'); },
    get quip() { return t('Disken tok en annen avgjørelse enn han.'); },
    rarity: 'rare',
    target: 3,
    metric: (s) => s.extras.windRounds,
  },
  {
    id: 'hot_henry',
    get name() { return t('Svette-Henry'); },
    icon: '🥵',
    get desc() { return t('Spill tre runder ved 22 °C eller mer.'); },
    get quip() { return t('Lukter bålplass. Kjenner ingen skam.'); },
    rarity: 'rare',
    target: 3,
    metric: (s) => s.extras.hotRounds,
  },
  {
    id: 'putter_sausage',
    get name() { return t('Putter-Pølsa'); },
    icon: '🌭',
    get desc() { return t('Sett 200 putts i Putter Game.'); },
    get quip() { return t('Selve definisjonen på å mase på kjettingen.'); },
    rarity: 'rare',
    target: 200,
    metric: putts,
  },
  {
    id: 'twin_tower',
    get name() { return t('Tvillingtårnet'); },
    icon: '👯',
    get desc() { return t('Fullfør 5 runder Dual Tee.'); },
    get quip() { return t('Kaster alt dobbelt. Angrer det samme.'); },
    rarity: 'rare',
    target: 5,
    metric: (s) => s.modes.dual_tee.rounds,
  },
  {
    id: 'gambler',
    get name() { return t('Gambleren'); },
    icon: '🎰',
    get desc() { return t('Fullfør 3 runder Disc Roulette.'); },
    get quip() { return t('«Bare én spinn til.» Sa han i 40 minutter.'); },
    rarity: 'rare',
    target: 3,
    metric: (s) => s.modes.roulette.rounds,
  },
  {
    id: 'habit',
    get name() { return t('Vane-Vegard'); },
    icon: '🔁',
    get desc() { return t('Spill på 15 ulike dager.'); },
    get quip() { return t('Spør ikke hva han gjør på mandager. Det er diskgolf.'); },
    rarity: 'rare',
    target: 15,
    metric: (s) => s.extras.playDays,
  },
  {
    id: 'birdie_baron',
    get name() { return t('Birdie-Baron'); },
    icon: '👑',
    get desc() { return t('Sett 50 hull under par.'); },
    get quip() { return t('Eier egne fugler. Betaler ingen skatt på dem.'); },
    rarity: 'epic',
    target: 50,
    metric: (s) => underParHoles(allTotals(s).counts),
  },
  {
    id: 'eagle_eye',
    get name() { return t('Ørneøye'); },
    icon: '🦅',
    get desc() { return t('Sett et eagle eller bedre.'); },
    get quip() { return t('Har sett ørner. Aldri sett en lande på ham. Til nå.'); },
    rarity: 'epic',
    target: 1,
    metric: (s) => allTotals(s).counts.eagle + allTotals(s).counts.ace,
  },
  {
    id: 'course_crusher',
    get name() { return t('Banesprengeren'); },
    icon: '💣',
    get desc() { return t('Spill en Normal Game-runde 5 under par eller bedre.'); },
    get quip() { return t('Banen har bedt om å få slippe. Han sa nei.'); },
    rarity: 'epic',
    target: 5,
    metric: (s) => Math.max(0, -(s.modes.normal.bestRoundDiff ?? 0)),
  },
  {
    id: 'tee_master',
    get name() { return t('Tee-Mesteren'); },
    icon: '🎯',
    get desc() { return t('Sett 10 hull under par i Dual Tee.'); },
    get quip() { return t('To kast, null skam. Det andre er alltid det beste.'); },
    rarity: 'epic',
    target: 10,
    metric: (s) => underParHoles(s.modes.dual_tee.counts),
  },
  {
    id: 'wheel_master',
    get name() { return t('Hjulmesteren'); },
    icon: '🎡',
    get desc() { return t('Sett 10 hull under par i Disc Roulette.'); },
    get quip() { return t('Hjulet har gitt opp å plage ham.'); },
    rarity: 'epic',
    target: 10,
    metric: (s) => underParHoles(s.modes.roulette.counts),
  },
  {
    id: 'storm_chaser',
    get name() { return t('Stormjegeren'); },
    icon: '🌩️',
    get desc() { return t('Fullfør én runde i regn og én i kuling.'); },
    get quip() { return t('Når alle andre går hjem, hører han på værmeldingen. Med glede.'); },
    rarity: 'epic',
    target: 2,
    metric: (s) => Math.min(1, s.extras.rainRounds) + Math.min(1, s.extras.windRounds),
  },
  {
    id: 'ruske_ridder',
    get name() { return t('Ruskevær-Ridderen'); },
    icon: '⛈️',
    get desc() { return t('Spill en runde i kraftig regn.'); },
    get quip() { return t('Har aldri vurdert å bli hjemme. Heller ikke i orkan.'); },
    rarity: 'epic',
    target: 1,
    metric: (s) => s.extras.heavyRainRounds,
  },
  {
    id: 'frost_frode',
    get name() { return t('Frost-Frode'); },
    icon: '🧊',
    get desc() { return t('Spill en runde ved 0 °C eller kaldere.'); },
    get quip() { return t('Fingrene har meldt flytting. Kjettingen klirrer av kulde.'); },
    rarity: 'epic',
    target: 1,
    metric: (s) => s.extras.coldRounds,
  },
  {
    id: 'putter_pope',
    get name() { return t('Putte-Paven'); },
    icon: '🙏',
    get desc() { return t('Sett 1000 putts i Putter Game.'); },
    get quip() { return t('Velsigner hvert eneste hull. Spesielt de han bommer på.'); },
    rarity: 'epic',
    target: 1000,
    metric: putts,
  },
  {
    id: 'old_hand',
    get name() { return t('Gammel Traver'); },
    icon: '🧓',
    get desc() { return t('Spill på 30 ulike dager.'); },
    get quip() { return t('Har vært her siden kjeden var en snor.'); },
    rarity: 'epic',
    target: 30,
    metric: (s) => s.extras.playDays,
  },
  {
    id: 'forest_regular',
    get name() { return t('Skogens Faste Inventar'); },
    icon: '🌳',
    get desc() { return t('Spill jevnlig i 90 dager (minst 20 runder).'); },
    get quip() { return t('Trærne har begynt å hilse. Han hilser tilbake.'); },
    rarity: 'epic',
    target: 90,
    metric: steadySpan(20),
  },
  {
    id: 'ace_hunter',
    get name() { return t('Ace-Legenden'); },
    icon: '🌟',
    get desc() { return t('Sett en ace.'); },
    get quip() { return t('Ett kast. Ett hull. Én historie han aldri slutter å fortelle.'); },
    rarity: 'legendary',
    target: 1,
    metric: (s) => allTotals(s).counts.ace,
  },
  {
    id: 'roulette_king',
    get name() { return t('Roulette-Kongen'); },
    icon: '🃏',
    get desc() { return t('Sett 20 hull under par i Disc Roulette.'); },
    get quip() { return t('Bukter og begynner. Hjulet bukker tilbake.'); },
    rarity: 'legendary',
    target: 20,
    metric: (s) => underParHoles(s.modes.roulette.counts),
  },
  {
    id: 'putter_god',
    get name() { return t('Putte-Guden'); },
    icon: '🔱',
    get desc() { return t('Sett 2500 putts i Putter Game.'); },
    get quip() { return t('Kjettingen klirrer hans navn. Naboen har meldt ham.'); },
    rarity: 'legendary',
    target: 2500,
    metric: putts,
  },
  {
    id: 'weather_hero',
    get name() { return t('Været-Overlever'); },
    icon: '🌈',
    get desc() { return t('Spill i 7 ulike værtyper.'); },
    get quip() { return t('Har spilt i alt. Unntatt hjemme.'); },
    rarity: 'legendary',
    target: 7,
    metric: weatherVariety,
  },
  {
    id: 'hundred_days',
    get name() { return t('Hundredagers-Helten'); },
    icon: '🏔️',
    get desc() { return t('Spill på 100 ulike dager.'); },
    get quip() { return t('Familien lurer på hvem han er. Han lurer også.'); },
    rarity: 'legendary',
    target: 100,
    metric: (s) => s.extras.playDays,
  },
  {
    id: 'forest_troll',
    get name() { return t('Gammel Skogstroll'); },
    icon: '🧌',
    get desc() { return t('Spill jevnlig i 120 dager (minst 40 runder).'); },
    get quip() { return t('Snakker til trærne. De svarer. Han liker det.'); },
    rarity: 'legendary',
    target: 120,
    metric: steadySpan(40),
  },
  {
    id: 'half_year',
    get name() { return t('Halvårs-Legenden'); },
    icon: '🦸',
    get desc() { return t('Spill jevnlig i 180 dager (minst 60 runder).'); },
    get quip() { return t('Et halvt år med diskgolf. Fortsatt ingen skade på egoet.'); },
    rarity: 'legendary',
    target: 180,
    metric: steadySpan(60),
  },
  {
    id: 'birdie_god',
    get name() { return t('Fugle-Guden'); },
    icon: '🦜',
    get desc() { return t('Sett 100 hull under par.'); },
    get quip() { return t('Fuglene har bedt om beskyttelse. Han gir ingen.'); },
    rarity: 'legendary',
    target: 100,
    metric: (s) => underParHoles(allTotals(s).counts),
  },
  {
    id: 'metermaster',
    get name() { return t('Metermesteren'); },
    icon: '📏',
    get desc() { return t('Gå totalt 35 km på diskgolfbaner.'); },
    get quip() { return t('Har målt banen med føttene. Alle 35 000 meterne.'); },
    rarity: 'epic',
    target: 35,
    metric: (s) => s.totalKm,
  },
  {
    id: 'chain_crusher',
    get name() { return t('Kjettingknuseren'); },
    icon: '⛓️',
    get desc() { return t('Ta 100 ein-putts i Putter Game.'); },
    get quip() { return t('Kjettingen ber om nåde. Disken svarer med et dunk.'); },
    rarity: 'epic',
    target: 100,
    metric: (s) => s.modes.putter.onePutts,
  },
  {
    id: 'forest_guardian',
    get name() { return t('Skauens Vokter'); },
    icon: '🛡️',
    get desc() { return t('Spill 10 runder på samme bane.'); },
    get quip() { return t('Kjenner hver rot og hver stein. Skogen hilser tilbake.'); },
    rarity: 'rare',
    target: 10,
    metric: (s) => Math.max(0, ...Object.values(s.courses).map((c) => c.rounds)),
  },
  ...V2_TITLES,
];

export const TITLE_BY_ID: Record<string, TitleDef> = Object.fromEntries(
  TITLES.map((tm) => [tm.id, tm])
);

/**
 * Tittelen som vises under navnet. Valgt tittel hvis den er låst opp,
 * ellers den sjeldneste opplåste tittelen (nyeste vinner ved lik sjeldenhet).
 */
export function getDisplayTitle(
  profile: Pick<Profile, 'titles' | 'equippedTitle'>
): TitleDef {
  const equipped = profile.equippedTitle
    ? TITLE_BY_ID[profile.equippedTitle]
    : undefined;
  if (equipped && (equipped.id === DEFAULT_TITLE_ID || profile.titles[equipped.id])) {
    return equipped;
  }
  let best = TITLE_BY_ID[DEFAULT_TITLE_ID];
  for (const tm of TITLES) {
    if (!profile.titles[tm.id]) continue;
    if (RARITY_ORDER[tm.rarity] >= RARITY_ORDER[best.rarity]) best = tm;
  }
  return best;
}
