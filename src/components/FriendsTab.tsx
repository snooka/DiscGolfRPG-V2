import { Check, Pencil, Plus, Search, Swords, Trash2, UserPlus, UsersRound, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DEFAULT_TITLE_ID, TITLE_BY_ID } from '../data/titles.ts';
import { useSession } from '../context/auth-context.ts';
import { useUi } from '../context/ui-context.ts';
import { getLevelInfo } from '../lib/progress.ts';
import type { Group, PublicProfile } from '../types.ts';
import { GroupSheet } from './GroupSheet.tsx';
import { PlayerProfileSheet } from './PlayerProfileSheet.tsx';
import { RatingTierBadge } from './RatingTierBadge.tsx';
import { TitleBadge } from './TitleBadge.tsx';
import { SegmentedControl } from './ui/SegmentedControl.tsx';
import { t } from '../i18n/index.ts';

export type View = 'friends' | 'groups' | 'leaderboard';

export interface StartGameOptions {
  groupId?: string;
  friendId?: string;
}

interface FriendsTabProps {
  onStartGame: (options: StartGameOptions) => void;
  initialView?: View;
}

export function FriendsTab({ onStartGame, initialView = 'friends' }: FriendsTabProps) {
  const [view, setView] = useState<View>(initialView);
  /** Spilleren hvis profil er åpen */
  const [profileId, setProfileId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <h2 className="flex items-center gap-2 text-base font-black text-white">
        <UsersRound className="h-5 w-5 text-emerald-400" aria-hidden />
        {t('Venner & grupper')}</h2>
      <SegmentedControl
        label={t('Visning')}
        value={view}
        onChange={setView}
        options={[
          { value: 'friends', label: t('Venner') },
          { value: 'groups', label: t('Grupper') },
          { value: 'leaderboard', label: t('Toppliste') },
        ]}
      />
      {view === 'friends' && <FriendsView onStartGame={onStartGame} onOpenProfile={setProfileId} />}
      {view === 'groups' && <GroupsView onStartGame={onStartGame} />}
      {view === 'leaderboard' && <LeaderboardView onOpenProfile={setProfileId} />}
      <PlayerProfileSheet userId={profileId} onClose={() => setProfileId(null)} />
    </div>
  );
}

// ---------- Små hjelpere ----------

function PlayerLine({
  person,
  extra,
  onOpen,
}: {
  person: PublicProfile;
  extra?: string;
  /** Gjør navnet klikkbart og åpner profilen */
  onOpen?: () => void;
}) {
  const level = getLevelInfo(person.xp);
  const title = TITLE_BY_ID[person.titleId ?? DEFAULT_TITLE_ID] ?? TITLE_BY_ID[DEFAULT_TITLE_ID];
  return (
    <div className="min-w-0">
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="block max-w-full truncate text-left text-sm font-bold text-white underline decoration-slate-600 underline-offset-2 hover:text-emerald-300 hover:decoration-emerald-400"
          aria-label={t('Åpne profilen til {name}', { name: person.name })}
        >
          {person.name}
        </button>
      ) : (
        <div className="truncate text-sm font-bold text-white">{person.name}</div>
      )}
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <TitleBadge title={title} size="sm" />
        <RatingTierBadge rating={person.rating} compact />
        <span className="font-mono text-[11px] text-emerald-400">
          {t('Lvl {level} • {xp} XP', { level: level.level, xp: person.xp })}</span>
        {extra && <span className="text-[11px] text-slate-400">{extra}</span>}
      </div>
    </div>
  );
}

// ---------- Venner ----------

function FriendsView({ onStartGame, onOpenProfile }: FriendsTabProps & { onOpenProfile: (id: string) => void }) {
  const {
    user,
    people,
    friends,
    friendships,
    incoming,
    outgoing,
    sendFriendRequest,
    acceptFriend,
    removeFriend,
    updateProfile,
  } = useSession();
  const { toast, confirm } = useUi();
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (q.length < 2) return [];
    const taken = new Set([
      user.id,
      ...friends.map((f) => f.id),
      ...incoming.map((f) => f.other.id),
      ...outgoing.map((f) => f.other.id),
    ]);
    return Object.values(people)
      .filter((p) => !taken.has(p.id) && p.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'nb'))
      .slice(0, 20);
  }, [q, people, user.id, friends, incoming, outgoing]);

  const add = async (p: PublicProfile) => {
    const res = await sendFriendRequest(p.id);
    if (!res.ok) toast(res.error, { tone: 'danger' });
    else if (res.result === 'accepted') toast(t('Du og {name} er nå venner 🤝', { name: p.name }));
    else toast(t('Forespørsel sendt til {name} 📨', { name: p.name }));
  };

  const accept = async (id: string, name: string) => {
    const res = await acceptFriend(id);
    toast(res.ok ? t('Du og {name} er nå venner 🤝', { name }) : res.error, res.ok ? undefined : { tone: 'danger' });
  };

  const decline = async (id: string, name: string, kind: 'decline' | 'cancel') => {
    const res = await removeFriend(id);
    if (!res.ok) toast(res.error, { tone: 'danger' });
    else toast(kind === 'decline' ? t('Forespørselen fra {name} er avslått', { name }) : t('Forespørselen er trukket tilbake'), { tone: 'info' });
  };

  const remove = async (p: PublicProfile) => {
    const ok = await confirm({
      title: t('Fjerne {name}?', { name: p.name }),
      message:
        t('Dere er ikke lenger venner, og vennen fjernes fra gruppene dine. Profilen til vennen slettes ikke. Du kan sende en ny forespørsel senere.'),
      confirmLabel: t('Fjern'),
      danger: true,
    });
    if (!ok) return;
    const fr = friendships.find((f) => f.other.id === p.id);
    if (!fr) return;
    const res = await removeFriend(fr.id);
    if (!res.ok) {
      toast(res.error, { tone: 'danger' });
      return;
    }
    updateProfile((pr) => ({
      ...pr,
      groups: pr.groups.map((g) => ({ ...g, memberIds: g.memberIds.filter((id) => id !== p.id) })),
    }));
    toast(t('{name} er fjernet', { name: p.name }), { tone: 'info' });
  };

  return (
    <div className="space-y-4">
      {incoming.length > 0 && (
        <section className="card card-hi space-y-2" aria-label={t('Venneforespørsler')}>
          <h3 className="eyebrow text-emerald-400">{t('Venneforespørsler ({length})', { length: incoming.length })}</h3>
          {incoming.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3"
            >
              <PlayerLine person={f.other} />
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void accept(f.id, f.other.name)}
                >
                  <Check className="h-4 w-4" aria-hidden />
                  {t('Godta')}</button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-icon hover:text-red-400"
                  aria-label={t('Avslå {name}', { name: f.other.name })}
                  onClick={() => void decline(f.id, f.other.name, 'decline')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="card space-y-3" aria-label={t('Finn spillere')}>
        <label htmlFor="friend-search" className="field-label">
          {t('Finn spillere')}</label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500"
            aria-hidden
          />
          <input
            id="friend-search"
            type="search"
            className="field pl-9"
            placeholder={t('Søk på spillernavn')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </div>
        {q.length >= 2 && results.length === 0 && (
          <p className="text-xs text-slate-500">
            {t('Fant ingen nye spillere med det navnet. Be vennen din opprette en profil i appen – da dukker hen opp her.')}</p>
        )}
        {results.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3"
          >
            <PlayerLine person={p} />
            <button type="button" className="btn btn-primary btn-sm shrink-0" onClick={() => void add(p)}>
              <UserPlus className="h-4 w-4" aria-hidden />
              {t('Legg til')}</button>
          </div>
        ))}
        {q.length < 2 && (
          <p className="text-xs text-slate-500">
            {t('Alle som har en profil i appen kan finnes her. Vennen må godta forespørselen din.')}</p>
        )}
      </section>

      {outgoing.length > 0 && (
        <section className="space-y-2" aria-label={t('Sendte forespørsler')}>
          <h3 className="eyebrow">{t('Venter på svar ({length})', { length: outgoing.length })}</h3>
          {outgoing.map((f) => (
            <div key={f.id} className="card flex items-center justify-between gap-2 p-3">
              <PlayerLine person={f.other} />
              <button
                type="button"
                className="btn btn-secondary btn-sm shrink-0"
                onClick={() => void decline(f.id, f.other.name, 'cancel')}
              >
                {t('Trekk tilbake')}</button>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-2" aria-label={t('Venneliste')}>
        <h3 className="eyebrow">{t('Venneliste ({length})', { length: friends.length })}</h3>
        {friends.length === 0 ? (
          <div className="card text-center text-sm text-slate-400">
            {t('Ingen venner ennå. Søk opp en spiller over for å sende en forespørsel.')}</div>
        ) : (
          friends.map((p) => (
            <div key={p.id} className="card flex items-center justify-between gap-2 p-3">
              <PlayerLine person={p} onOpen={() => onOpenProfile(p.id)} />
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onStartGame({ friendId: p.id })}
                >
                  <Swords className="h-4 w-4" aria-hidden />
                  {t('Spill')}</button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-icon hover:text-red-400"
                  aria-label={t('Fjern {name}', { name: p.name })}
                  onClick={() => void remove(p)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

// ---------- Grupper ----------

function GroupsView({ onStartGame }: FriendsTabProps) {
  const { profile, people, friends, updateProfile } = useSession();
  const { toast, confirm } = useUi();
  const [editing, setEditing] = useState<Group | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const open = (group: Group | null) => {
    setEditing(group);
    setSheetOpen(true);
  };

  const save = (group: Group) => {
    const exists = profile.groups.some((g) => g.id === group.id);
    updateProfile((p) => ({
      ...p,
      groups: exists
        ? p.groups.map((g) => (g.id === group.id ? group : g))
        : [...p.groups, group],
    }));
    setSheetOpen(false);
    toast(exists ? t('Gruppen er oppdatert') : t('Gruppen «{name}» er opprettet', { name: group.name }));
  };

  const remove = async (group: Group) => {
    const ok = await confirm({
      title: t('Slette «{name}»?', { name: group.name }),
      message: t('Er du sikker på at du vil slette denne gruppen? Vennene dine påvirkes ikke.'),
      confirmLabel: t('Ja, slett'),
      cancelLabel: t('Behold'),
      danger: true,
    });
    if (!ok) return;
    updateProfile((p) => ({ ...p, groups: p.groups.filter((g) => g.id !== group.id) }));
    toast(t('«{name}» er slettet', { name: group.name }), {
      tone: 'info',
      action: {
        label: t('Angre'),
        onClick: () =>
          updateProfile((p) =>
            p.groups.some((g) => g.id === group.id) ? p : { ...p, groups: [...p.groups, group] }
          ),
      },
    });
  };

  return (
    <div className="space-y-3">
      <button type="button" className="btn btn-primary w-full" onClick={() => open(null)}>
        <Plus className="h-4 w-4" aria-hidden />
        {t('Ny gruppe')}</button>

      {profile.groups.length === 0 ? (
        <div className="card text-center text-sm text-slate-400">
          {t('Lag en gruppe med faste spillepartnere, så kan du starte en runde med alle med ett trykk.')}</div>
      ) : (
        profile.groups.map((g) => {
          const names = [
            ...g.memberIds.map((id) => people[id]?.name).filter((n): n is string => !!n),
            ...g.guests.map((n) => `${n} (gjest)`),
          ];
          return (
            <div key={g.id} className="card space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-black text-white">👥 {g.name}</h3>
                  <p className="text-xs text-slate-400">
                    {names.length > 0 ? names.join(', ') : t('Ingen medlemmer')}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-icon"
                    aria-label={t('Rediger {name}', { name: g.name })}
                    onClick={() => open(g)}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-icon hover:text-red-400"
                    aria-label={t('Slett {name}', { name: g.name })}
                    onClick={() => void remove(g)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm w-full"
                onClick={() => onStartGame({ groupId: g.id })}
              >
                <Swords className="h-4 w-4" aria-hidden />
                {t('Start runde med gruppen')}</button>
            </div>
          );
        })
      )}

      {sheetOpen && (
        <GroupSheet
          key={editing?.id ?? 'new'}
          initial={editing}
          friends={friends}
          onSave={save}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}

// ---------- Toppliste ----------

function LeaderboardView({ onOpenProfile }: { onOpenProfile: (id: string) => void }) {
  const { user, people, friends } = useSession();
  const [by, setBy] = useState<'xp' | 'rating'>('xp');
  const friendIds = new Set(friends.map((f) => f.id));
  const rows = Object.values(people).sort((a, b) =>
    by === 'rating'
      ? (b.rating ?? -1) - (a.rating ?? -1) || b.xp - a.xp || a.name.localeCompare(b.name, 'nb')
      : b.xp - a.xp || a.name.localeCompare(b.name, 'nb')
  );

  return (
    <section className="space-y-2" aria-label={t('Toppliste')}>
      <SegmentedControl
        label={t('Sorter toppliste')}
        value={by}
        onChange={setBy}
        options={[
          { value: 'xp', label: t('Etter XP') },
          { value: 'rating', label: t('Etter rating') },
        ]}
      />
      <p className="text-xs text-slate-500">
        {by === 'xp' ? t('Rangert etter total XP') : t('Rangert etter rating (Normal Game)')} {' '}{t('blant alle spillere. Trykk på et navn for å åpne profilen. Oppdateres live.')}</p>
      {rows.map((p, i) => {
        const me = p.id === user.id;
        const title = TITLE_BY_ID[p.titleId ?? DEFAULT_TITLE_ID] ?? TITLE_BY_ID[DEFAULT_TITLE_ID];
        return (
          <button
            type="button"
            key={p.id}
            onClick={() => onOpenProfile(p.id)}
            aria-label={t('Åpne profilen til {name}', { name: p.name })}
            className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition-colors hover:border-emerald-500/60 ${
              me ? 'border-emerald-500/50 bg-emerald-950/30' : 'border-slate-800 bg-slate-950'
            }`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="w-7 shrink-0 text-center text-sm font-black text-slate-300">
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold text-white">{p.name}</span>
                  {me && <span className="text-[11px] font-bold text-emerald-400">{t('(deg)')}</span>}
                  {friendIds.has(p.id) && <span className="text-[11px] font-bold text-cyan-400">{t('venn')}</span>}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <TitleBadge title={title} size="sm" />
                  <RatingTierBadge rating={p.rating} compact />
                  <span className="text-[11px] text-slate-400">{t('Lvl {level}', { level: getLevelInfo(p.xp).level })}</span>
                </div>
              </div>
            </div>
            <span className="shrink-0 font-mono text-sm font-black text-emerald-400">
              {by === 'xp' ? `${p.xp} XP` : (p.rating ?? '–')}
            </span>
          </button>
        );
      })}
    </section>
  );
}
