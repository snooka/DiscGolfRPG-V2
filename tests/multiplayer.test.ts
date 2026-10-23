import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MemoryServer } from './helpers/memoryBackend.ts';
import type { MemoryBackend } from './helpers/memoryBackend.ts';
import { createInputFromDoc, diffRound, newRoundDoc, applyOp, toRoundState } from '../src/lib/roundDoc.ts';
import type { RoundDoc } from '../src/lib/roundDoc.ts';
import { RoundSync } from '../src/lib/roundSync.ts';
import {
  adjustPutts,
  adjustScore,
  confirmHole,
  finishRound,
  goToHole,
  recordSpin,
  setHolePar,
  setTeePick,
} from '../src/lib/round.ts';
import { createProfile } from '../src/lib/profile.ts';
import type { RoundConfig } from '../src/lib/round.ts';
import type { Account } from '../src/types.ts';

const course = { id: 'c1', name: 'Kolbeinsvik', location: 'Os', holes: 9, par: 27, image: '🌲', lat: 60, lng: 5 };
const settle = (ms = 15) => new Promise((r) => setTimeout(r, ms));

async function user(server: MemoryServer, name: string): Promise<{ be: MemoryBackend; me: Account }> {
  const be = server.device();
  await be.auth.signUp({ email: `${name.toLowerCase()}@x.no`, password: 'hemmelig1', name });
  const me = await be.auth.getSession();
  assert.ok(me);
  return { be, me };
}

async function befriend(a: { be: MemoryBackend }, b: { be: MemoryBackend; me: Account }) {
  await a.be.friends.request(b.me.id);
  const incoming = (await b.be.friends.list()).find((f) => f.direction === 'incoming');
  assert.ok(incoming);
  await b.be.friends.accept(incoming.id);
}

const configFor = (players: RoundConfig['players'], holeCount = 3, mode: RoundConfig['mode'] = 'normal'): RoundConfig => ({
  mode,
  course,
  holeCount,
  players,
  segments: ['putter', 'midrange'],
  weather: null,
  courseVerified: true,
});

function startSync(be: MemoryBackend, me: Account, doc: RoundDoc, extra: Partial<ConstructorParameters<typeof RoundSync>[0]> = {}) {
  const sync = new RoundSync({
    backend: be,
    userId: me.id,
    doc,
    device: { currentHole: 0, steps: 0, wheelSource: 'generic' },
    flushDelayMs: 0,
    resyncIntervalMs: 0,
    ...extra,
  });
  sync.start();
  return sync;
}

describe('roundDoc: rader ↔ RoundState', () => {
  const doc = newRoundDoc('r1', 'u1', configFor([
    { key: 'a', name: 'Kim', userId: 'u1' },
    { key: 'b', name: 'Truls', userId: 'u2' },
  ]));

  it('tom runde: score = par, ingen rader nødvendig', () => {
    const s = toRoundState(doc, { currentHole: 0, steps: 0, wheelSource: 'generic' }, 'u1');
    assert.deepEqual(s.scores, [[3, 3, 3], [3, 3, 3]]);
    assert.equal(s.courseVerified, true);
    assert.equal(toRoundState(doc, { currentHole: 0, steps: 0, wheelSource: 'generic' }, 'u2').courseVerified, false);
  });

  it('diff gir bare det som er endret, og går rundt til samme tilstand', () => {
    const dev = { currentHole: 0, steps: 0, wheelSource: 'generic' };
    let state = toRoundState(doc, dev, 'u1');
    state = adjustScore(state, 1, +2); // Truls +2 på hull 1
    const ops = diffRound(doc, state);
    assert.equal(ops.length, 1);
    assert.deepEqual(ops[0], { t: 'score', playerKey: 'b', hole: 1, score: 5 });
    const after = ops.reduce(applyOp, doc);
    assert.deepEqual(toRoundState(after, dev, 'u1').scores, state.scores);
  });

  it('endret par lager ikke en rad per spiller', () => {
    const dev = { currentHole: 1, steps: 0, wheelSource: 'generic' };
    const state = setHolePar(toRoundState(doc, dev, 'u1'), 4);
    const ops = diffRound(doc, state);
    assert.deepEqual(ops, [{ t: 'hole', hole: 2, par: 4 }]);
    const after = ops.reduce(applyOp, doc);
    assert.deepEqual(toRoundState(after, dev, 'u1').scores[0], [3, 4, 3]);
  });

  it('putts, tee-valg og hjul sendes som delvise felter', () => {
    const dev = { currentHole: 0, steps: 0, wheelSource: 'generic' };
    let state = toRoundState(doc, dev, 'u1');
    state = adjustPutts(adjustScore(state, 0, 1), 0, 1);
    state = setTeePick(state, 1, 2);
    state = recordSpin(state, 0, 'putter', { id: 'd1', name: 'Aviar', brand: 'Innova', type: 'Putter', speed: 2, glide: 3, turn: 0, fade: 1, plastic: 'DX', color: '#fff' });
    const ops = diffRound(doc, state);
    assert.ok(ops.some((o) => o.t === 'hole' && o.spin === 'putter' && typeof o.spinDisc === 'string' && o.par === undefined));
    assert.ok(ops.some((o) => o.t === 'score' && o.playerKey === 'a' && o.score === 4 && o.putts === 1 && o.teePick === undefined));
    assert.ok(ops.some((o) => o.t === 'score' && o.playerKey === 'b' && o.teePick === 2 && o.score === 3));
    const after = ops.reduce(applyOp, doc);
    const back = toRoundState(after, dev, 'u1');
    assert.equal(back.spinDiscItems[0]?.name, 'Aviar');
    assert.equal(back.spins[0], 'putter');
  });
});

describe('sanntid mellom to enheter', () => {
  it('Truls fører kast for Kim – Kim ser det med en gang, og omvendt', async () => {
    const server = new MemoryServer();
    const truls = await user(server, 'Truls');
    const kim = await user(server, 'Kim');
    await befriend(truls, kim);

    const doc = newRoundDoc('11111111-1111-4111-8111-111111111111', truls.me.id, configFor([
      { key: `u_${truls.me.id}`, name: 'Truls', userId: truls.me.id },
      { key: `u_${kim.me.id}`, name: 'Kim', userId: kim.me.id },
      { key: 'g1', name: 'Gjest', userId: null },
    ]));
    await truls.be.rounds.create(createInputFromDoc(doc, true));

    // Kim ble varslet og ser runden
    const notes = await kim.be.notifications.list();
    assert.ok(notes.some((n) => n.kind === 'round_invite' && n.data.roundId === doc.head.id));
    const mine = await kim.be.rounds.listMine();
    assert.equal(mine.length, 1);

    const kimRows = await kim.be.rounds.load(doc.head.id);
    assert.ok(kimRows);
    const { docFromRows } = await import('../src/lib/roundDoc.ts');

    const a = startSync(truls.be, truls.me, doc);
    const b = startSync(kim.be, kim.me, docFromRows(kimRows));
    await settle();

    // Truls: +1 for Kim på hull 1, +2 for gjesten
    a.update((r) => adjustScore(adjustScore(r, 1, +1), 2, +2));
    await settle();
    let kimState = b.getState();
    assert.equal(kimState.scores[1][0], 4, 'Kim ser sin egen score satt av Truls');
    assert.equal(kimState.scores[2][0], 5, 'Kim ser gjestens score');
    assert.equal(a.getSnapshot().status, 'live');

    // Kim endrer Trulss score på hull 1 (hvem som helst kan føre for hvem som helst)
    b.update((r) => adjustScore(r, 0, -1));
    await settle();
    assert.equal(a.getState().scores[0][0], 2);

    // Navigasjon er lokal: Kim blar til hull 3, Truls blir stående
    b.update((r) => goToHole(r, 2));
    await settle();
    assert.equal(b.getState().currentHole, 2);
    assert.equal(a.getState().currentHole, 0);
    a.stop();
    b.stop();
  });

  it('to som endrer ulike felt på samme hull overskriver ikke hverandre', async () => {
    const server = new MemoryServer();
    const t = await user(server, 'Truls');
    const k = await user(server, 'Kim');
    await befriend(t, k);
    const doc = newRoundDoc('22222222-2222-4222-8222-222222222222', t.me.id, configFor([
      { key: 'a', name: 'Truls', userId: t.me.id },
      { key: 'b', name: 'Kim', userId: k.me.id },
    ], 3, 'roulette'));
    await t.be.rounds.create(createInputFromDoc(doc, true));
    const { docFromRows } = await import('../src/lib/roundDoc.ts');
    const a = startSync(t.be, t.me, doc);
    const b = startSync(k.be, k.me, docFromRows((await k.be.rounds.load(doc.head.id))!));
    await settle();

    // Samtidig: Truls spinner hjulet på hull 1, Kim endrer par på hull 1
    a.update((r) => recordSpin(r, 0, 'driver'));
    b.update((r) => setHolePar(r, 5));
    await settle(40);
    for (const s of [a, b]) {
      const st = s.getState();
      assert.equal(st.spins[0], 'driver');
      assert.equal(st.layout[0].par, 5);
    }
    a.stop();
    b.stop();
  });

  it('offline: endringer køes og sendes når nettet er tilbake', async () => {
    const server = new MemoryServer();
    const t = await user(server, 'Truls');
    const k = await user(server, 'Kim');
    await befriend(t, k);
    const doc = newRoundDoc('33333333-3333-4333-8333-333333333333', t.me.id, configFor([
      { key: 'a', name: 'Truls', userId: t.me.id },
      { key: 'b', name: 'Kim', userId: k.me.id },
    ]));
    await t.be.rounds.create(createInputFromDoc(doc, true));
    const { docFromRows } = await import('../src/lib/roundDoc.ts');
    const a = startSync(t.be, t.me, doc);
    const b = startSync(k.be, k.me, docFromRows((await k.be.rounds.load(doc.head.id))!));
    await settle();

    server.offline = true;
    a.update((r) => adjustScore(r, 0, +3));
    await settle(30);
    assert.equal(a.getSnapshot().status, 'offline');
    assert.equal(a.getState().scores[0][0], 6, 'lokalt vises endringen likevel');
    assert.equal(b.getState().scores[0][0], 3, 'Kim ser den ikke ennå');

    server.offline = false;
    await a.flush();
    await settle();
    assert.equal(a.getSnapshot().status, 'live');
    assert.equal(b.getState().scores[0][0], 6);
    a.stop();
    b.stop();
  });

  it('en ny enhet (gjenopprettet runde) får med usendte endringer', async () => {
    const server = new MemoryServer();
    const t = await user(server, 'Truls');
    const doc = newRoundDoc('44444444-4444-4444-8444-444444444444', t.me.id, configFor([
      { key: 'a', name: 'Truls', userId: t.me.id },
      { key: 'g', name: 'Gjest', userId: null },
    ]));
    await t.be.rounds.create(createInputFromDoc(doc, true));
    let saved: Parameters<NonNullable<ConstructorParameters<typeof RoundSync>[0]['persist']>>[0] | null = null;
    server.offline = true;
    const a = startSync(t.be, t.me, doc, { persist: (s) => (saved = s) });
    a.update((r) => adjustScore(r, 1, +1));
    await settle(20);
    a.stop();
    assert.ok(saved);
    const s = saved as NonNullable<typeof saved>;
    assert.equal(s.unsent.length, 1);

    server.offline = false;
    const again = startSync(t.be, t.me, s.doc, { unsent: s.unsent });
    await settle(30);
    assert.equal(again.getSnapshot().status, 'live');
    const rows = await t.be.rounds.load(doc.head.id);
    assert.equal(rows?.scores.find((x) => x.playerKey === 'g')?.score, 4);
    again.stop();
  });
});

describe('fullføring og statistikk for hver spiller', () => {
  it('kan ikke fullføres før alle hull er lagret; alle får runden på egen profil', async () => {
    const server = new MemoryServer();
    const t = await user(server, 'Truls');
    const k = await user(server, 'Kim');
    await befriend(t, k);
    const doc = newRoundDoc('55555555-5555-4555-8555-555555555555', t.me.id, configFor([
      { key: 'a', name: 'Truls', userId: t.me.id },
      { key: 'b', name: 'Kim', userId: k.me.id },
    ], 2));
    await t.be.rounds.create(createInputFromDoc(doc, true));
    const { docFromRows } = await import('../src/lib/roundDoc.ts');

    const heads: string[] = [];
    const a = startSync(t.be, t.me, doc);
    const b = startSync(k.be, k.me, docFromRows((await k.be.rounds.load(doc.head.id))!), {
      onHeadStatus: (s) => heads.push(s),
    });
    await settle();

    a.update((r) => confirmHole(adjustScore(r, 0, -1), 0)); // hull 1 lagret
    await settle();
    await assert.rejects(() => t.be.rounds.finish(doc.head.id), /Alle hull/);

    // Kim lagrer hull 2 (og fører for Truls)
    b.update((r) => confirmHole(adjustScore(goToHole(r, 1), 0, 1), 1));
    await settle();
    await a.flush();
    await t.be.rounds.finish(doc.head.id);
    await settle();
    assert.deepEqual(heads, ['finished']);

    await b.resync();
    const final = b.getState();
    // Hver enhet regner bare ut sin egen profil
    const kimProfile = createProfile(k.me.id);
    const { result, updatedProfiles } = finishRound(final, { [k.me.id]: kimProfile });
    assert.deepEqual(Object.keys(updatedProfiles), [k.me.id]);
    const trulsRow = result.players.find((p) => p.player.name === 'Truls');
    assert.equal(trulsRow?.outcome, null);
    assert.equal(trulsRow?.throws, 2 + 4);
    assert.equal(updatedProfiles[k.me.id].history[0].id, doc.head.id);

    // Låst for videre skriving
    await assert.rejects(() => t.be.rounds.writeOps(doc.head.id, t.me.id, [{ t: 'score', playerKey: 'a', hole: 1, score: 9 }]), /avsluttet/);
    a.stop();
    b.stop();
  });

  it('verten kan avbryte, andre kan ikke; utenforstående ser ikke runden', async () => {
    const server = new MemoryServer();
    const t = await user(server, 'Truls');
    const k = await user(server, 'Kim');
    const o = await user(server, 'Ola');
    await befriend(t, k);
    const doc = newRoundDoc('66666666-6666-4666-8666-666666666666', t.me.id, configFor([
      { key: 'a', name: 'Truls', userId: t.me.id },
      { key: 'b', name: 'Kim', userId: k.me.id },
    ]));
    await t.be.rounds.create(createInputFromDoc(doc, false));
    assert.equal(await o.be.rounds.load(doc.head.id), null);
    assert.equal((await o.be.rounds.listMine()).length, 0);
    await assert.rejects(() => o.be.rounds.writeOps(doc.head.id, o.me.id, [{ t: 'score', playerKey: 'a', hole: 1, score: 9 }]));
    await assert.rejects(() => k.be.rounds.abandon(doc.head.id), /Bare verten/);
    await t.be.rounds.abandon(doc.head.id);
    assert.equal((await k.be.rounds.listMine())[0].status, 'abandoned');
  });

  it('kan ikke legge til ikke-venner i en runde', async () => {
    const server = new MemoryServer();
    const t = await user(server, 'Truls');
    const o = await user(server, 'Ola');
    const doc = newRoundDoc('77777777-7777-4777-8777-777777777777', t.me.id, configFor([
      { key: 'a', name: 'Truls', userId: t.me.id },
      { key: 'b', name: 'Ola', userId: o.me.id },
    ]));
    await assert.rejects(() => t.be.rounds.create(createInputFromDoc(doc, true)), /bare legge til venner/);
  });
});

describe('brukere, venner og varsler', () => {
  it('registrering: unikt navn, bekreftelse på e-post, riktig passord', async () => {
    const server = new MemoryServer();
    const be = server.device({ requireConfirmation: true });
    const res = await be.auth.signUp({ email: 'Kim@X.no', password: 'hemmelig1', name: 'Kim' });
    assert.equal(res.needsConfirmation, true);
    await assert.rejects(() => be.auth.signIn('kim@x.no', 'hemmelig1'), /ikke bekreftet/);
    await assert.rejects(() => be.auth.signUp({ email: 'annen@x.no', password: 'hemmelig1', name: 'kim' }), /allerede tatt/);
    await assert.rejects(() => be.auth.signUp({ email: 'kim@x.no', password: 'hemmelig1', name: 'Kim2' }), /allerede registrert/);
    be.followMailLink(server.state.mails[0].token);
    assert.equal((await be.auth.getSession())?.name, 'Kim');
    await be.auth.signOut();
    await assert.rejects(() => be.auth.signIn('kim@x.no', 'feil'), /Feil e-post eller passord/);
    await be.auth.signIn('kim@x.no', 'hemmelig1');
  });

  it('nullstilling av passord med 6-sifret kode', async () => {
    const server = new MemoryServer();
    const be = server.device();
    await be.auth.signUp({ email: 'kim@x.no', password: 'hemmelig1', name: 'Kim' });
    const uid = (await be.auth.getSession())?.id;
    await be.auth.signOut();
    await be.auth.requestPasswordReset('ukjent@x.no'); // avslører ikke noe
    assert.equal(server.state.mails.length, 0);
    await be.auth.requestPasswordReset('kim@x.no');
    const mail = server.state.mails[0];
    assert.equal(mail.kind, 'reset');
    assert.match(mail.token, /^\d{6}$/);
    await assert.rejects(() => be.auth.resetPasswordWithCode('kim@x.no', '000000', 'nytt-passord'), /Koden er feil/);
    await assert.rejects(() => be.auth.resetPasswordWithCode('kim@x.no', mail.token, '123'), /svakt/);
    const events: string[] = [];
    be.auth.onAuthChange((e) => events.push(e));
    await be.auth.resetPasswordWithCode('kim@x.no', mail.token, 'nytt-passord');
    assert.deepEqual(events, ['signed_in']);
    assert.equal((await be.auth.getSession())?.id, uid); // samme bruker, dermed samme data
    // koden er brukt opp
    await assert.rejects(() => be.auth.resetPasswordWithCode('kim@x.no', mail.token, 'enda-nyere'), /Koden er feil/);
    await be.auth.signOut();
    await assert.rejects(() => be.auth.signIn('kim@x.no', 'hemmelig1'));
    await be.auth.signIn('kim@x.no', 'nytt-passord');
  });

  it('nullstilling rører ikke profil, XP eller venner', async () => {
    const server = new MemoryServer();
    const be = server.device();
    await be.auth.signUp({ email: 'kim@x.no', password: 'hemmelig1', name: 'Kim' });
    const uid = (await be.auth.getSession())!.id;
    await be.profiles.saveMine(uid, { marker: 'mine-data' }, { xp: 4321, titleId: 'rookie' });
    const before = JSON.stringify({ d: server.state.profileData[uid], p: server.state.pub[uid], f: server.state.friendships });
    await be.auth.signOut();
    await be.auth.requestPasswordReset('kim@x.no');
    await be.auth.resetPasswordWithCode('kim@x.no', server.state.mails[0].token, 'nytt-passord');
    const after = JSON.stringify({ d: server.state.profileData[uid], p: server.state.pub[uid], f: server.state.friendships });
    assert.equal(after, before);
    assert.deepEqual(await be.profiles.loadMine(uid), { marker: 'mine-data' });
  });

  it('venneforespørsel → godtatt, med varsler til riktig person', async () => {
    const server = new MemoryServer();
    const k = await user(server, 'Kim');
    const t = await user(server, 'Truls');
    const got: string[] = [];
    t.be.realtime.subscribeSocial(t.me.id, {
      onFriendsChanged: () => got.push('friends'),
      onNotification: (n) => got.push(n.kind),
      onMyRoundsChanged: () => undefined,
      onDirectoryChanged: () => undefined,
    });
    assert.equal(await k.be.friends.request(t.me.id), 'requested');
    assert.equal(await k.be.friends.request(t.me.id), 'already');
    await settle();
    assert.deepEqual(got.sort(), ['friend_request', 'friends']);
    const f = (await t.be.friends.list())[0];
    assert.equal(f.direction, 'incoming');
    assert.equal(f.other.name, 'Kim');
    await t.be.friends.accept(f.id);
    assert.equal((await k.be.friends.list())[0].status, 'accepted');
    assert.ok((await k.be.notifications.list()).some((n) => n.kind === 'friend_accepted'));
  });

  it('«gikk forbi deg»-varsel kan bare sendes til egne venner', async () => {
    const server = new MemoryServer();
    const k = await user(server, 'Kim');
    const t = await user(server, 'Truls');
    const o = await user(server, 'Ola');
    await befriend(k, t);
    await k.be.notifications.sendPassed(t.me.id, k.me.id, 'Kim gikk forbi deg');
    await assert.rejects(() => k.be.notifications.sendPassed(o.me.id, k.me.id, 'x'));
    await assert.rejects(() => k.be.notifications.sendPassed(t.me.id, o.me.id, 'x'));
    assert.equal((await t.be.notifications.list()).filter((n) => n.kind === 'passed').length, 1);
    assert.equal((await o.be.notifications.list()).filter((n) => n.kind === 'passed').length, 0);
  });
});
