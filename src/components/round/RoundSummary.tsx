import { GAME_MODE_BY_ID } from '../../data/gameModes.ts';
import { useSession } from '../../context/auth-context.ts';
import { classifyHole, describeHole, formatDiff } from '../../lib/stats.ts';
import type { PlayerRoundResult, RoundResult } from '../../lib/round.ts';
import { TitleBadge } from '../TitleBadge.tsx';
import { UnlockCard } from '../UnlockCard.tsx';
import { t } from '../../i18n/index.ts';

interface RoundSummaryProps {
  result: RoundResult;
  onDone: () => void;
}

const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`);

/** Fargen på et diff-tall: under par = turkis, par = grønn, over = oransje/rød. */
const diffTone = (diff: number) =>
  diff < 0 ? 'text-cyan-300' : diff === 0 ? 'text-emerald-300' : diff <= 5 ? 'text-amber-300' : 'text-red-400';

/** Cellestil i scorekortet etter resultat. */
function cellClass(score: number, par: number): string {
  const r = classifyHole(score, par);
  switch (r) {
    case 'ace':
      return 'bg-amber-400 text-slate-950 rounded-full';
    case 'eagle':
      return 'bg-cyan-400 text-slate-950 rounded-full';
    case 'birdie':
      return 'border-2 border-cyan-400 text-cyan-300 rounded-full';
    case 'par':
      return 'text-slate-200';
    case 'bogey':
      return 'border border-amber-500 text-amber-300 rounded-sm';
    case 'double':
      return 'bg-amber-500/25 border-2 border-amber-500 text-amber-200 rounded-sm';
    default:
      return 'bg-red-500/30 border-2 border-red-500 text-red-200 rounded-sm';
  }
}

interface Ranked extends PlayerRoundResult {
  rank: number;
}

/** Rangerer etter kast (lavest vinner). Like resultater deler plassering. */
function rankPlayers(players: PlayerRoundResult[]): Ranked[] {
  const sorted = [...players].sort((a, b) => a.throws - b.throws);
  return sorted.map((p) => {
    const firstEqual = sorted.findIndex((q) => q.throws === p.throws);
    return { ...p, rank: firstEqual + 1 };
  });
}

export function RoundSummary({ result, onDone }: RoundSummaryProps) {
  const { user } = useSession();
  const mode = GAME_MODE_BY_ID[result.mode];
  const ranked = rankPlayers(result.players);
  const winners = ranked.filter((p) => p.rank === 1);
  const best = ranked[0];
  const registered = result.players.filter((p) => p.outcome);
  const isTie = winners.length > 1;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-950">
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-[env(safe-area-inset-top)]">
        <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-5">
          {/* Vinner */}
          <section className="card card-hi anim-pop space-y-1 text-center" aria-label={t(t('Vinner'))}>
            <div className="text-5xl" aria-hidden>
              🏆
            </div>
            <div className="eyebrow">{isTie ? t('Uavgjort') : t('Vinner')}</div>
            <h2 className="text-2xl font-black text-white">
              {isTie ? winners.map((w) => w.player.name).join(' & ') : best.player.name}
            </h2>
            <p className="font-mono text-sm font-bold text-emerald-300">
              {t('{throws} kast ({diff})', { throws: best.throws, diff: formatDiff(best.diff) })}</p>
            <p className="text-xs text-slate-400">
              {result.course.name} • <span aria-hidden>{mode.icon}</span> {' '}{t('{name} • {holes} hull •', { name: mode.name, holes: result.holes })}{' '}<span className="font-bold text-cyan-400">{t('{km} km', { km: result.km })}</span>
            </p>
            {!result.verified && (
              <p className="pt-1 text-[11px] text-slate-500">
                {t('📍 Fri runde – GPS bekreftet ikke at du stod på en bane, så banen ble ikke lagret.')}</p>
            )}
          </section>

          {/* Scoreboard */}
          <section className="space-y-2" aria-label={t('Scoreboard')}>
            <h3 className="eyebrow">{t('Scoreboard')}</h3>
            {ranked.map((p) => {
              const isYou = p.player.userId === user.id;
              const behind = p.throws - best.throws;
              return (
                <div
                  key={p.player.key}
                  className={`flex items-center justify-between gap-3 rounded-2xl border p-3 ${
                    p.rank === 1
                      ? 'border-emerald-500/60 bg-emerald-950/30'
                      : isYou
                        ? 'border-cyan-500/40 bg-slate-900'
                        : 'border-slate-800 bg-slate-900'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-8 text-center text-xl font-black">{medal(p.rank)}</span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-white">
                        {p.player.name}
                        {isYou && <span className="ml-1.5 text-xs font-bold text-cyan-300">{t('(deg)')}</span>}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {p.rank === 1 ? t('Beste score') : t('{behind} kast bak {leader}', { behind, leader: isTie ? t('ledelsen') : best.player.name })}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right font-mono">
                    <div className={`text-2xl font-black leading-none ${diffTone(p.diff)}`}>
                      {formatDiff(p.diff)}
                    </div>
                    <div className="text-xs text-slate-400">{t('{throws} kast', { throws: p.throws })}</div>
                  </div>
                </div>
              );
            })}
          </section>

          {/* Scorekort */}
          <Scorecard result={result} ranked={ranked} youId={user.id} />

          {/* Live-feed */}
          <LiveFeed result={result} />

          {result.mode === 'putter' && <PutterNote result={result} />}

          {registered.map((p) => (
            <PlayerRewards key={p.player.key} p={p} />
          ))}

          {result.mode !== 'normal' && (
            <p className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs text-slate-400">
              {t('Runden er ført i egen statistikk for')}{' '}<b className="text-slate-200">{mode.name}</b>{t('. Rating og tall for Normal Game er uberørt.')}</p>
          )}
        </div>
      </main>

      <footer className="shrink-0 border-t border-slate-800 bg-slate-900 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-2xl">
          <button type="button" onClick={onDone} className="btn btn-primary w-full text-base">
            {t('Tilbake til oversikt')}</button>
        </div>
      </footer>
    </div>
  );
}

function Scorecard({ result, ranked, youId }: { result: RoundResult; ranked: Ranked[]; youId: string }) {
  const nameCol = 'sticky left-0 z-10 w-24 min-w-24 max-w-24 truncate bg-slate-900 px-2 py-1.5 text-left text-xs font-bold';
  return (
    <section className="space-y-2" aria-label={t('Scorekort')}>
      <h3 className="eyebrow">{t('Scorekort')}</h3>
      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
        <table className="w-full border-collapse text-center font-mono text-xs">
          <thead>
            <tr className="text-slate-400">
              <th scope="col" className={nameCol}>
                {t('Hull')}</th>
              {result.pars.map((_, i) => (
                <th key={i} scope="col" className="min-w-8 px-1 py-1.5 font-bold">
                  {i + 1}
                </th>
              ))}
              <th scope="col" className="min-w-10 px-1 py-1.5 font-bold text-slate-200">
                {t('Tot')}</th>
            </tr>
            <tr className="border-t border-slate-800 text-slate-500">
              <th scope="row" className={`${nameCol} text-slate-500`}>
                {t('Par')}</th>
              {result.pars.map((p, i) => (
                <td key={i} className="px-1 py-1">
                  {p}
                </td>
              ))}
              <td className="px-1 py-1">{result.pars.reduce((a, b) => a + b, 0)}</td>
            </tr>
          </thead>
          <tbody>
            {ranked.map((p) => (
              <tr key={p.player.key} className="border-t border-slate-800">
                <th
                  scope="row"
                  className={`${nameCol} ${p.player.userId === youId ? 'text-cyan-300' : 'text-white'}`}
                >
                  {p.player.name}
                </th>
                {p.holeScores.map((score, i) => (
                  <td key={i} className="px-1 py-1.5">
                    <span
                      className={`mx-auto flex h-6 w-6 items-center justify-center text-xs font-black ${cellClass(
                        score,
                        result.pars[i]
                      )}`}
                      title={describeHole(score, result.pars[i])}
                    >
                      {score}
                    </span>
                  </td>
                ))}
                <td className={`px-1 py-1.5 font-black ${diffTone(p.diff)}`}>{p.throws}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">
        {t('Sirkel = birdie/eagle • firkant = bogey eller verre. Sveip sideveis for alle hull.')}</p>
    </section>
  );
}

/** Høydepunkter fra runden, hull for hull (ace/eagle/birdie og trær). */
function LiveFeed({ result }: { result: RoundResult }) {
  const events: { hole: number; name: string; text: string; tone: string }[] = [];
  result.pars.forEach((par, hole) => {
    for (const p of result.players) {
      const score = p.holeScores[hole];
      const r = classifyHole(score, par);
      if (r === 'par' || r === 'bogey') continue;
      const good = r === 'ace' || r === 'eagle' || r === 'birdie';
      events.push({
        hole: hole + 1,
        name: p.player.name,
        text: describeHole(score, par),
        tone: good ? 'text-cyan-300' : 'text-red-300',
      });
    }
  });
  return (
    <section className="space-y-2" aria-label={t('Live-feed')}>
      <h3 className="eyebrow">{t('Høydepunkter fra runden')}</h3>
      {events.length === 0 ? (
        <p className="card text-xs text-slate-400">{t('Ingen store øyeblikk – bare stødig spill. 😴')}</p>
      ) : (
        <ol className="card space-y-1.5 p-3">
          {events.map((e, i) => (
            <li key={i} className="flex items-center gap-2 text-xs">
              <span className="w-12 shrink-0 font-mono text-slate-500">{t('Hull {hole}', { hole: e.hole })}</span>
              <span className="truncate font-bold text-white">{e.name}</span>
              <span className={`ml-auto shrink-0 font-bold ${e.tone}`}>{e.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function PutterNote({ result }: { result: RoundResult }) {
  return (
    <p className="rounded-xl border border-pink-500/40 bg-pink-500/10 p-3 text-xs text-pink-100">
      {t('🎳 Putts fra denne runden er lagt til i puttstatistikken din. Se Stats → Putter for totalen.')}{' '}<span className="sr-only">{t('{holes} hull spilt', { holes: result.holes })}</span>
    </p>
  );
}

function PlayerRewards({ p }: { p: PlayerRoundResult }) {
  const o = p.outcome;
  if (!o) return null;
  const totalXp = o.xpFromRound + o.xpFromAchievements + o.xpFromQuests;
  const leveledUp = o.levelAfter > o.levelBefore;

  return (
    <section className="card space-y-3" aria-label={t('Belønninger for {name}', { name: p.player.name })}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="truncate text-sm font-black text-white">{p.player.name}</h3>
        <span className="font-mono text-sm font-black text-emerald-400">{t('+{totalXp} XP', { totalXp })}</span>
      </div>
      <p className="text-xs text-slate-400">
        {t('{xpFromRound} XP for runden', { xpFromRound: o.xpFromRound })}{' '}{o.xpFromAchievements > 0 && t(' + {xpFromAchievements} XP i achievement-bonus', { xpFromAchievements: o.xpFromAchievements })}
        {o.xpFromQuests > 0 && t(' + {xpFromQuests} XP fra Daily Quests', { xpFromQuests: o.xpFromQuests })}
      </p>

      {leveledUp && (
        <div className="anim-pop rounded-xl border border-emerald-400/60 bg-emerald-500/10 p-3 text-center">
          <div className="text-2xl" aria-hidden>
            ⬆️
          </div>
          <div className="text-sm font-black text-emerald-300">
            {t('Level opp! Level {levelBefore} → {levelAfter}', { levelBefore: o.levelBefore, levelAfter: o.levelAfter })}</div>
        </div>
      )}

      {o.questsCompleted.length > 0 && (
        <div className="space-y-2">
          <div className="eyebrow text-emerald-400">{t('📅 Daily Quests fullført (verifisert av runden)')}</div>
          {o.questsCompleted.map((q) => (
            <div
              key={q.id}
              className="flex items-center gap-3 rounded-xl border border-emerald-500/40 bg-slate-950 p-3"
            >
              <span className="text-2xl" aria-hidden>
                {q.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-black text-emerald-300">{q.title}</div>
                <div className="text-xs text-slate-300">{q.desc}</div>
              </div>
              <span className="shrink-0 font-mono text-xs font-bold text-emerald-400">+{q.reward}</span>
            </div>
          ))}
        </div>
      )}

      {o.unlocks.achievements.length > 0 && (
        <div className="space-y-2">
          <div className="eyebrow text-amber-400">{t('🎖️ Nye achievements')}</div>
          {o.unlocks.achievements.map((a) => (
            <UnlockCard
              key={a.id}
              icon={a.icon}
              title={a.title}
              desc={a.desc}
              rarity={a.rarity}
              tag={a.emblem ? 'nytt emblem' : undefined}
              right={`+${a.xp}`}
            />
          ))}
        </div>
      )}

      {o.unlocks.titles.length > 0 && (
        <div className="space-y-2">
          <div className="eyebrow text-fuchsia-300">{t('👑 Nye titler')}</div>
          <div className="flex flex-wrap gap-2">
            {o.unlocks.titles.map((tm) => (
              <TitleBadge key={tm.id} title={tm} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
