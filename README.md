# Disc Golf RPG

Mobilapp (Vite + React 19 + TypeScript) for diskgolf med XP, quests, achievements, titler,
Dual Tee, Disc Roulette, Putter Game – og **ekte flerspiller på tvers av telefoner**.

- Sanntids-scorecard: alle i flighten ser kast oppdatere seg live, og alle kan registrere kast for alle.
- Ekte brukere (e-post + passord), venneforespørsler, varsler og topplister i skyen (Supabase).
- Passord nullstilles med en ekte e-post med lenke.
- Solo-runder (bare deg og gjester) fungerer lokalt uten nett.

## Oppsett (ca. 10 minutter)

### 1. Lag Supabase-prosjekt
1. Gå til <https://supabase.com> og lag et gratis prosjekt.
2. Åpne **SQL Editor**, lim inn hele `supabase/schema.sql` og kjør. Skriptet kan kjøres flere ganger.
   Det lager tabeller, sikkerhetsregler (RLS), funksjoner og slår på sanntid.

### 2. Auth-innstillinger (Authentication → …)
- **Providers → Email**: slå på. «Confirm email» er anbefalt; slå av for enklere testing.
- **URL Configuration**: sett *Site URL* til adressen appen kjører på (f.eks. `https://appen.din.no`
  eller `http://localhost:5173` under utvikling) og legg samme adresse til i *Redirect URLs*.
  **Uten dette virker ikke lenken i «glem passord»-e-posten.**
- **SMTP**: Supabase sin innebygde e-post er sterkt begrenset. Sett opp egen SMTP (Resend, Postmark …) før ekte bruk.
- **Email Templates**: tilpass gjerne bekreftelses- og nullstillingsmailene (norsk tekst).

### 3. Nøkler
Kopier `.env.example` til `.env` og fyll inn fra *Project Settings → API*:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=<anon / publishable key>
```

> Bruk **aldri** `service_role`-nøkkelen i appen. Sikkerheten ligger i RLS-reglene i `schema.sql`,
> og anon-nøkkelen er laget for å ligge i nettleseren.

### 4. Kjør
Krever Node 22+.

```
npm install      # ikke npm ci – lockfilen er utdatert
npm run dev      # utvikling
npm run build    # produksjonsbygg i dist/
npm test         # enhetstester
```

Mangler `.env`, viser appen en oppsettsskjerm i stedet for å krasje.

## Hvordan flerspiller fungerer
- Verten velger venner når runden startes. De får et varsel og en «Bli med»-knapp.
- Hver endring (kast, par, lagret hull) sendes som en liten operasjon og kringkastes via Supabase Realtime.
  Samtidige endringer på ulike felt flettes; appen køer endringer offline og synker når nettet er tilbake.
- Runden kan bare fullføres når alle hull er lagret (sjekkes også i databasen).
- Hver spiller får XP, quests og achievements på *sin egen* profil. Varsel om at du «ble passert» går bare til venner.
- Gamle lokale profiler importeres automatisk første gang du logger inn med samme e-post.

## Filer
- `supabase/schema.sql` – database, RLS, RPC-er, triggere, sanntid
- `src/backend/` – `Backend`-grensesnitt + Supabase-adapter
- `src/lib/roundDoc.ts`, `roundSync.ts` – delt rundemodell og synkmotor
- `tests/helpers/memoryBackend.ts` – minnebasert backend som speiler reglene i SQL, brukt i tester


## Vær, posisjon og achievements
- **Vær:** `src/lib/weather.ts` henter fra Yr / MET (`locationforecast/2.0/complete`, som har vindkast). Værkortet ligger øverst på startskjermen. Været sjekkes når runden starter og på nytt når den lagres (de to slås sammen), og kun GPS-verifiserte runder gir vær-achievements.
- **Nye merker:** *Solskinnspilt* (3 solrunder), *Regnværshelten* (3 regnrunder) og *Stormkast* (vindkast over 8 m/s, endres i `GUST_LIMIT`).
- **Posisjon (Google Play-regler):** appen forklarer først hvorfor den trenger posisjon (`LocationRationaleSheet`) og ber ikke systemet om tillatelse før brukeren trykker «Tillat». Nekter man, fungerer alt: man velger sted manuelt (liste + stedssøk) og velger bane selv. Posisjon brukes kun mens appen er åpen, ingen bakgrunnsposisjon. All kode ligger i `src/context/LocationProvider.tsx`.
- **Android-tillatelser:** `npm run cap:sync` og `npm run apk` kjører `scripts/android-permissions.mjs`, som legger INTERNET + grov/nøyaktig posisjon i `AndroidManifest.xml`.

## Datasikkerhet ved oppdateringer
- All progresjon (stats, nivå, XP, bag, runder, achievements, titler) ligger i Supabase. Lokalt lagres kun innstillinger for enheten (valgt sted/samtykke) og en kopi av en pågående runde.
- Achievements lagres i tillegg som egne rader (`user_achievements`, kan ikke slettes av appen) og slås sammen med profilen ved innlogging.
- Profildata får automatisk sikkerhetskopi (`profile_backups`, maks én per 6 timer, siste 20). Gjenoppretting: se kommentaren nederst i `supabase/schema.sql`.
- Appen starter aldri med en tom profil hvis innlasting feiler (nett, tilgang). Du får en «prøv igjen»-skjerm i stedet, slik at en ekte profil aldri overskrives.
- Eldre profiler leses alltid med `normalizeProfile`: nye felt får standardverdi, ingenting forsvinner når appen oppdateres.
- **Etter oppdatering av appen:** kjør hele `supabase/schema.sql` på nytt i SQL Editor (trygt å gjenta) når `schema.sql` er endret.

## Google Play og PWA
1. **Personvernerklæring:** fyll inn navn og e-post i `public/personvern.html`, og publiser den (f.eks. på nettsiden du hoster PWA-en på). Play Console krever en offentlig URL.
2. **Data safety-skjema i Play Console:** e-post (konto), brukernavn, spillaktivitet, omtrentlig posisjon (valgfri, ikke lagret på server, delt med MET for vær). Data krypteres under overføring, og brukeren kan slette kontoen i appen.
3. **Tailwind** bygges inn (`npm run css`, kjøres automatisk før `dev` og `build`), så appen fungerer uten CDN. Kjør `npm run css:watch` ved siden av `npm run dev` hvis du legger til nye klasser.
4. **PWA/iPhone:** hostes på https (Netlify, Vercel, Cloudflare Pages …). På iPhone: Safari → Del → «Legg til på Hjem-skjerm». `public/sw.js` cacher appskallet og aldri data. Merk at iOS ber om posisjon på nytt ved hver oppstart av en PWA, og at varsler/bakgrunn er begrenset på iOS.
5. **Supabase Auth → URL Configuration:** legg til nettadressen til PWA-en i Redirect URLs (brukes bare av bekreftelses-e-posten for nye kontoer).

## Rating, nivåer og venneprofiler
- **Rating:** `src/lib/rating.ts`. Bygger på de 10 siste Normal Game-rundene. Par hele veien = **1000**, og hvert kast i snitt per hull over/under par flytter 300 poeng (ett kast over par på 18 hull ≈ −17). Holdes mellom 400 og 1400. Det er en PDGA-*inspirert* rating, ikke offisiell PDGA.
- **Nivåer:** Amatør (under 850), Intermediate (850+), Advanced (950+) og Open / Pro (1040+). Juster grensene i `RATING_TIERS` (og tilsvarende i `calc_rating` hvis du vil flytte formelen).
- **Rating i skyen:** Når en runde fullføres, legges den i `player_rounds`, og en databasetrigger regner ut `profiles.rating` automatisk. Appen kan ikke skrive rating selv.
- **Tabeller:** `player_rounds` (fullførte runder), `user_discs` (diskbag, én rad per disk), `profile_public` (statistikk venner kan se). Alle kan leses av eieren og godtatte venner. Bare eieren kan skrive. Ikke-venner ser kun rating, nivå, XP og tittel.
- **Venneprofil:** Trykk på et navn i Venner eller Toppliste. Toppliste kan sorteres på XP eller rating.
- Kjør hele `supabase/schema.sql` på nytt i SQL Editor etter oppdatering (trygt å gjenta). Eksisterende spillere får rating og delt profil første gang de åpner appen etter oppdateringen.


## Glemt passord (6-sifret kode)

Ingen lenker, dyp lenke eller omdirigering: brukeren skriver inn e-posten, får en **6-sifret engangskode** på e-post, og skriver
koden og et nytt passord rett i appen (`AuthScreen`, visningen `reset`). Koden verifiseres med `verifyOtp({ type: 'recovery' })`,
deretter settes passordet med `updateUser` (`resetPasswordWithCode` i `src/backend/supabase.ts`) og brukeren logges inn.
Vanlig innlogging med e-post og passord er uendret (også for testbrukeren til Google Play).

**Viktig om Supabase sin innebygde e-post:** uten egen SMTP leverer Supabase bare til adresser som er medlem av Supabase-teamet ditt
(«Email address not authorized» for alle andre) og maks ca. 2 e-poster i timen, uten leveringsgaranti. Da kommer verken kode eller
bekreftelses-e-post frem til vanlige spillere, uansett metode. Sett derfor opp gratis SMTP hos en tjeneste som Resend eller Brevo
(Authentication → SMTP Settings, ca. 10 minutter, ingen egen server) før du lanserer.

**Må gjøres i Supabase (ellers får brukeren en lenke i stedet for en kode):**
1. **Authentication → Email Templates → Reset Password:** bytt innholdet slik at mailen viser koden, f.eks.

   ```html
   <h2>Nytt passord</h2>
   <p>Skriv inn denne koden i appen:</p>
   <p style="font-size:28px;letter-spacing:6px"><b>{{ .Token }}</b></p>
   <p>Koden gjelder en kort stund. Ignorer mailen hvis du ikke ba om den.</p>
   ```
   (`{{ .ConfirmationURL }}` skal **ikke** brukes.)
2. Koden er 6 sifre som standard og gjelder 1 time (Authentication → Providers → Email: *OTP length* / *OTP expiry*).
   Supabase tillater én ny kode per e-post per minutt; appen viser da «For mange forsøk».
3. Bekreftelsen for nye kontoer bruker fortsatt en lenke (Site URL, ingen dyp lenke). Slå av «Confirm email» eller
   forhåndsbekreft testbrukeren i Supabase hvis Google Play-testeren skal logge rett inn.

**Data:** flyten rører bare passordet til auth-brukeren. Profil, XP/level, achievements, bag, runder og venner ligger i egne
tabeller knyttet til samme bruker-id og berøres ikke (dekket av tester i `tests/multiplayer.test.ts`).

## Språk (norsk / English)

Norsk er standard. Velgeren (Norsk | English) ligger på innloggingssiden og nederst på Profil, og valget huskes
på enheten. Norsk tekst står som kilde i koden: `t('Hull {n} av {total}', { n, total })`. Den engelske
oversettelsen ligger i `src/i18n/en.ts`, nøklet på den norske teksten. Mangler en nøkkel vises den norske teksten.

- **Ny tekst:** skriv den på norsk i `t('…')` og legg inn engelsk i `src/i18n/en.ts`. `npm test` feiler hvis en
  tekst mangler, er ubrukt, eller variablene `{navn}` ikke er like i begge språk.
- **Data-filer** (achievements, titler, nivåer, spillmodi) bruker `get`-egenskaper, slik at teksten regnes ut ved visning.
- **Feilmeldinger fra databasen** (`raise exception` i schema.sql) oversettes også via `en.ts`.
- Ved språkbytte monteres appen (AppShell) på nytt; innlogging, profil og pågående runde beholdes.
- Brukernavn, banenavn og andre egennavn oversettes ikke. Standardnavnet «Spiller» for nye profiler lagres på norsk.


## Versjonsnummer (Android)

`npm run cap:sync` og `npm run apk` setter `versionName` (fra `version`) og `versionCode` (fra `androidVersionCode`) i `android/app/build.gradle`.
Øk `androidVersionCode` i `package.json` for hver ny bygg (nå 14). Android installerer bare over en eksisterende app hvis tallet er høyere.

## Android: ren bygging

`capacitor.config.ts` bruker `androidScheme: 'http'` og `cleartext: true`. Appen kjører da på `http://localhost` inne i WebView (ikke `https://localhost`).
Merk: byttet av scheme gir en ny lagringsopplevelse i WebView, så brukere må logge inn én gang på nytt. Data ligger i Supabase.

Ikoner: legg kilden i `resources/icon.png` (1024×1024) og `resources/splash.png` (2732×2732), kjør `npm run icons` etter `npx cap add android`.

## V2 – design

- Palett: bunn `#030712`, neon-cyan/elektrisk blå aksenter. Fargene ligger som `@theme` i `src/tailwind.css` (emerald-* og slate-* er omdefinert), glass-kort/knapper i `src/index.css`.
- Logo: `public/brand/logo.png` (gjennomsiktig) brukes av `FancyDiscLogo`. Ikoner og splash er laget fra samme logo (`public/icons`, `resources/`). Kjør `npm run icons` etter `npx cap add android`.
- Nytt innhold: `src/data/v2Content.ts` (30 titler + 30 achievements).
