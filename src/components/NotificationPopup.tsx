import { useEffect } from 'react';
import { useSession } from '../context/auth-context.ts';
import { sounds } from '../lib/sound.ts';
import type { AppNotification } from '../types.ts';
import { t } from '../i18n/index.ts';

const ICON: Record<AppNotification['kind'], string> = {
  passed: '🏃',
  round_invite: '🥏',
  friend_request: '🤝',
  friend_accepted: '🎉',
};

/**
 * Popup for nye varsler: «X gikk forbi deg» (bare den som ble passert), venneforespørsler
 * og invitasjoner til runder. Varslene kommer fra skyen i sanntid.
 */
export function NotificationPopup({
  onOpenRound,
  onOpenFriends,
}: {
  onOpenRound: (roundId: string) => void;
  onOpenFriends: () => void;
}) {
  const { notifications, markNotificationsRead } = useSession();
  const unread = notifications.filter((n) => !n.read);
  const invite = unread.find((n) => n.kind === 'round_invite' && typeof n.data.roundId === 'string');
  const hasRequest = unread.some((n) => n.kind === 'friend_request');
  const onlyPassed = unread.every((n) => n.kind === 'passed');

  useEffect(() => {
    if (unread.length > 0) sounds.notify();
  }, [unread.length]);

  if (unread.length === 0) return null;

  return (
    <div
      className="anim-fade fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-label={t('Varsel')}
    >
      <div className="anim-pop w-full max-w-sm space-y-3 rounded-3xl border border-amber-400/50 bg-slate-900 p-5 text-center shadow-2xl">
        <div className="text-4xl" aria-hidden>
          🔔
        </div>
        <h2 className="text-lg font-black text-white">
          {onlyPassed
            ? unread.length === 1
              ? t('Du ble gått forbi!')
              : `${unread.length} gikk forbi deg!`
            : unread.length === 1
              ? t('Nytt varsel')
              : `${unread.length} nye varsler`}
        </h2>
        <ul className="space-y-1.5">
          {unread.slice(0, 5).map((n) => (
            <li key={n.id} className="rounded-xl bg-slate-950 px-3 py-2 text-sm text-slate-200">
              <span aria-hidden>{ICON[n.kind]} </span>
              {n.text}
            </li>
          ))}
        </ul>
        {onlyPassed && <p className="text-xs text-slate-500">{t('Ta en runde og ta dem igjen. 😏')}</p>}
        {invite && (
          <button
            type="button"
            className="btn btn-primary w-full"
            onClick={() => {
              markNotificationsRead();
              onOpenRound(String(invite.data.roundId));
            }}
          >
            {t('Bli med i runden ➔')}</button>
        )}
        {!invite && hasRequest && (
          <button
            type="button"
            className="btn btn-primary w-full"
            onClick={() => {
              markNotificationsRead();
              onOpenFriends();
            }}
          >
            {t('Se forespørselen')}</button>
        )}
        <button type="button" className={`btn w-full ${invite || hasRequest ? 'btn-secondary' : 'btn-primary'}`} onClick={markNotificationsRead}>
          {onlyPassed ? t('Skal ta dem igjen!') : 'OK'}
        </button>
      </div>
    </div>
  );
}
