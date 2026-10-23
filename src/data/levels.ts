import { t } from '../i18n/index.ts';
// ==========================================
// NIVÅ-RANGERINGER (vises ved siden av «Lvl»)
// ==========================================

export interface LevelTier {
  level: number;
  title: string;
  icon: string;
  desc: string;
}

/** Hvert trinn gjelder fra og med oppgitt level. */
export const LEVEL_TIERS: LevelTier[] = [
  {
    level: 1,
    get title() { return t('Tornekrattets Herre'); },
    icon: '🌿',
    get desc() { return t('Var innom og besøkte gamla i busken.'); },
  },
  {
    level: 3,
    get title() { return t('Tre-Magneten'); },
    icon: '🌲',
    get desc() { return t('Furua ringte. Den savner deg allerede.'); },
  },
  {
    level: 6,
    get title() { return t('Myr-Snikeren'); },
    icon: '🥾',
    get desc() { return t('Hopper fra tue til tue og lyver om at beina er tørre.'); },
  },
  {
    level: 10,
    get title() { return t('Fairway-los'); },
    icon: '🧭',
    get desc() { return t('Treffer faktisk åpningen. Av og til. Når ingen ser på.'); },
  },
  {
    level: 15,
    get title() { return t('Par-Maskinen'); },
    icon: '⚙️',
    get desc() { return t('La ned par igjen. Kjedelig. Effektivt. Slik vi liker det.'); },
  },
  {
    level: 18,
    get title() { return t('Putter-Poeten'); },
    icon: '🎯',
    get desc() { return t('Skriver dikt med kjettingen. Rimer på «plopp».'); },
  },
  {
    level: 22,
    get title() { return t('Kjetting-Rangler'); },
    icon: '⛓️',
    get desc() { return t('Lyden av kjetting får naboen til å tro det er julaften.'); },
  },
  {
    level: 26,
    get title() { return t('Stor-Kasteren'); },
    icon: '🚀',
    get desc() { return t('Avstand er ikke lenger et problem. Retning derimot.'); },
  },
  {
    level: 30,
    get title() { return t('Kyst-Generalen'); },
    icon: '🌊',
    get desc() { return t('Spiller i 14 m/s sidevind og synes det er «litt stille».'); },
  },
  {
    level: 35,
    get title() { return t('Ace-Drømmeren'); },
    icon: '🌟',
    get desc() { return t('Har drømt om hull-i-ett siden barnehagen. Får fortsatt ikke sove.'); },
  },
  {
    level: 40,
    get title() { return t('Hyzer-Trollmannen'); },
    icon: '🧙‍♂️',
    get desc() { return t('Disken svinger rundt treet fordi den ikke tør å skuffe ham.'); },
  },
  {
    level: 45,
    get title() { return t('Disk-Guden'); },
    icon: '🔱',
    get desc() { return t('Slipper disken, og universet bøyer seg pent av veien.'); },
  },
  {
    level: 50,
    get title() { return t('Legendarisk Kjede-Knuser'); },
    icon: '⚡',
    get desc() { return t('Sluttbossen. Selv Trond på stien tar av seg capsen.'); },
  },
];
