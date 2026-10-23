export interface FriendXp {
  id: string;
  xp: number;
}

/**
 * Hvilke venner klatret jeg forbi på topplisten (rangert etter XP)?
 * En «forbigang» er når vennen hadde mer XP enn meg før, men mindre etterpå.
 * Lik XP teller ikke som forbigang. Ren funksjon.
 */
export function passedFriends(beforeXp: number, afterXp: number, friends: FriendXp[]): string[] {
  if (afterXp <= beforeXp) return [];
  return friends.filter((f) => beforeXp < f.xp && afterXp > f.xp).map((f) => f.id);
}
