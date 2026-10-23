import { useEffect, useRef, useState } from 'react';
import { AchievementsTab } from './components/AchievementsTab.tsx';
import { AuthScreen } from './components/AuthScreen.tsx';
import { BottomNav } from './components/BottomNav.tsx';
import type { Tab } from './components/BottomNav.tsx';
import { CoursesTab } from './components/CoursesTab.tsx';
import { FriendsTab } from './components/FriendsTab.tsx';
import type { StartGameOptions } from './components/FriendsTab.tsx';
import { Header } from './components/Header.tsx';
import { ProfileTab } from './components/ProfileTab.tsx';
import { RoundScreen } from './components/round/RoundScreen.tsx';
import { NotificationPopup } from './components/NotificationPopup.tsx';
import { SetupRoundSheet } from './components/SetupRoundSheet.tsx';
import { ConfigMissingScreen, LoadErrorScreen, LoadingScreen } from './components/StatusScreens.tsx';
import { StatsTab } from './components/stats/StatsTab.tsx';
import { AuthProvider } from './context/AuthProvider.tsx';
import { useLocation } from './context/location-context.ts';
import { LocationProvider } from './context/LocationProvider.tsx';
import { I18nProvider } from './i18n/I18nProvider.tsx';
import { useI18n } from './i18n/i18n-context.ts';
import { useAuth, useSession } from './context/auth-context.ts';
import { UiProvider } from './context/UiProvider.tsx';
import { useUi } from './context/ui-context.ts';
import { GAME_MODE_BY_ID } from './data/gameModes.ts';
import { isCloudConfigured } from './backend/index.ts';
import { useRounds } from './hooks/useRounds.ts';
import { requestMotionPermission, useStepCounter } from './hooks/useStepCounter.ts';
import type { RoundConfig } from './lib/round.ts';
import { t } from './i18n/index.ts';

export default function App() {
  return (
    <I18nProvider>
      <AppWithLanguage />
    </I18nProvider>
  );
}

function AppWithLanguage() {
  // Språkbytte: dette treet tegnes på nytt med ny tekst. Selve appen (AppShell) monteres i tillegg
  // på nytt (key), slik at ingenting viser gammel tekst fra useMemo/useState. Innlogging, profil og
  // pågående runde ligger i leverandørene og lagringen og beholdes.
  useI18n();
  if (!isCloudConfigured()) return <ConfigMissingScreen />;
  return (
    <UiProvider>
      <LocationProvider>
        <AuthProvider>
          <Root />
        </AuthProvider>
      </LocationProvider>
    </UiProvider>
  );
}

function Root() {
  const { lang } = useI18n();
  const { status, user, loadError, retryLoad, logout } = useAuth();
  if (status === 'loading') return <LoadingScreen />;
  if (status === 'error') return <LoadErrorScreen message={loadError ?? ''} onRetry={retryLoad} onLogout={logout} />;
  // key: all tilstand nullstilles når en annen bruker logger inn
  return status === 'ready' && user ? <AppShell key={`${user.id}:${lang}`} /> : <AuthScreen />;
}

function AppShell() {
  const { profile, people, profileSync } = useSession();
  const { confirm } = useUi();
  const rounds = useRounds();
  const { round, live, result, roundOpen, setRoundOpen, others } = rounds;

  const [tab, setTab] = useState<Tab>('profile');
  // Når en side åpnes fra en annen (f.eks. «Se alle» på profilen) vises en Tilbake-knapp
  const [backTo, setBackTo] = useState<Tab | null>(null);
  const [achInitial, setAchInitial] = useState<'achievements' | 'emblems'>('achievements');

  const goTab = (tm: Tab) => {
    setBackTo(null);
    setAchInitial('achievements');
    setTab(tm);
  };
  const goFromProfile = (tm: Tab) => {
    setBackTo('profile');
    setAchInitial(tm === 'achievements' ? 'emblems' : 'achievements');
    setTab(tm);
  };
  const goHome = () => {
    setSetupOpen(false);
    goTab('profile');
    mainRef.current?.scrollTo({ top: 0 });
  };
  const goBack = backTo ? () => goTab(backTo) : undefined;

  // Oppsett av ny runde
  const [setupOpen, setSetupOpen] = useState(false);
  const [preset, setPreset] = useState<StartGameOptions>({});

  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();

  // Skritteller (kjører også når runden er minimert)
  const stepsRef = useStepCounter(round !== null, rounds.initialSteps, rounds.setSteps);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  const openSetup = (options: StartGameOptions = {}) => {
    if (round) {
      setRoundOpen(true); // allerede en runde i gang – fortsett den
      return;
    }
    setPreset(options);
    setSetupOpen(true);
  };

  const startRound = async (config: RoundConfig) => {
    await requestMotionPermission();
    stepsRef.current = 0;
    try {
      await rounds.start(config);
      setSetupOpen(false);
    } catch {
      /* feilmelding er vist; oppsettet blir stående slik at man kan prøve igjen */
    }
  };

  const abandonRound = async () => {
    const shared = live?.shared ?? false;
    const host = live?.isHost ?? true;
    const ok = await confirm(
      shared && !host
        ? {
            title: t('Forlate runden?'),
            message: t('De andre fortsetter runden uten deg, og runden blir ikke lagt til på din profil.'),
            confirmLabel: t('Ja, forlat runden'),
            cancelLabel: t('Bli i runden'),
            danger: true,
          }
        : {
            title: t('Avbryte runden?'),
            message: shared
              ? t('Runden avbrytes for ALLE spillerne, og ingen får den lagt til i statistikken.')
              : t('Runden og alle scorene du har lagt inn blir slettet og lagres ikke i statistikken.'),
            confirmLabel: t('Ja, avbryt runden'),
            cancelLabel: t('Fortsett å spille'),
            danger: true,
          }
    );
    if (!ok) return;
    await rounds.leave();
  };

  const showRoundScreen = result !== null || (round !== null && roundOpen);
  const roundMode = round ? GAME_MODE_BY_ID[round.mode] : null;

  return (
    <div className="flex h-full w-full max-w-full flex-col overflow-x-hidden">
      <Header xp={profile.xp} roundActive={round !== null} onStart={() => openSetup()} onHome={goHome} />

      {profileSync === 'error' && (
        <div role="alert" className="shrink-0 bg-amber-900/60 px-4 py-2 text-center text-xs font-bold text-amber-100">
          {t('Får ikke lagret profilen din til skyen akkurat nå. Vi prøver igjen automatisk.')}</div>
      )}


      <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-2xl px-4 py-4">
          {tab === 'profile' && <ProfileTab onNavigate={goFromProfile} />}
          {tab === 'courses' && <CoursesTab userPosition={location.point} />}
          {tab === 'stats' && <StatsTab onBack={goBack} />}
          {tab === 'achievements' && <AchievementsTab key={achInitial} initialView={achInitial} onBack={goBack} />}
          {(tab === 'friends' || tab === 'leaderboard') && (
            <FriendsTab
              key={tab}
              initialView={tab === 'leaderboard' ? 'leaderboard' : 'friends'}
              onStartGame={openSetup}
            />
          )}
        </div>
      </main>

      {others.length > 0 && (
        <div className="shrink-0 space-y-1 border-t border-cyan-500/40 bg-cyan-950 px-4 py-2">
          {others.slice(0, 3).map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => void rounds.open(h.id)}
              className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 text-left"
            >
              <span className="min-w-0 text-sm font-bold text-cyan-100">
                <span aria-hidden>🥏</span> {people[h.hostId]?.name ?? t('En venn')} {' '}{t('har en runde med deg')}{' '}<span className="block truncate text-xs font-normal text-cyan-300">{h.course.name}</span>
              </span>
              <span className="shrink-0 text-sm font-black text-cyan-300">{t('Bli med ➔')}</span>
            </button>
          ))}
        </div>
      )}

      {round && !roundOpen && roundMode && (
        <button
          type="button"
          onClick={() => setRoundOpen(true)}
          className="shrink-0 border-t border-emerald-500/40 bg-emerald-950 px-4 py-3 text-left"
        >
          <span className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
            <span className="min-w-0 text-sm font-bold text-emerald-100">
              <span aria-hidden>{roundMode.icon}</span> {' '}{t('Pågående runde – {name}', { name: round.course.name })}<span className="block text-xs font-normal text-emerald-300">
                {t('{name} • Hull {n} av {length}', { name: roundMode.name, n: round.currentHole + 1, length: round.layout.length })}{live?.shared && t(' • live med vennene dine')}
              </span>
            </span>
            <span className="shrink-0 text-sm font-black text-emerald-300">{t('Fortsett ➔')}</span>
          </span>
        </button>
      )}

      <BottomNav active={tab} onChange={goTab} />

      <NotificationPopup
        onOpenRound={(id) => void rounds.open(id)}
        onOpenFriends={() => goTab('friends')}
      />

      {setupOpen && (
        <SetupRoundSheet
          presetGroupId={preset.groupId ?? null}
          presetFriendId={preset.friendId ?? null}
          onClose={() => setSetupOpen(false)}
          onStart={startRound}
        />
      )}

      {showRoundScreen && (
        <RoundScreen
          round={round}
          result={result}
          live={live}
          touch={rounds.touch}
          onChange={rounds.update}
          onMinimize={() => setRoundOpen(false)}
          onAbandon={() => void abandonRound()}
          onFinish={(r) => void rounds.finish(r)}
          onDone={() => {
            rounds.clearResult();
            goTab('stats');
          }}
        />
      )}
    </div>
  );
}
