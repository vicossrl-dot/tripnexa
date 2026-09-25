# Implementarea TripSync Admin — în curs

## Revenue — Tours & Tickets, 25 septembrie 2026

Conectate Tours & Tickets, Referral Links (mapări globale exacte) și Affiliate Analytics. Patru adaptoare link-only: GetYourGuide, Viator, Tiqets și Klook; configurare versionată SUPER_ADMIN, mapări și validări ADMIN, allowlist HTTPS, audit, disclosure și statistici de clicuri fără venituri inventate. Secretelor existente li se adaugă sloturi criptate opționale pentru viitoare API-uri GYG/Viator/Tiqets; simpla salvare nu conectează API-ul. Migrarea este aplicată local, furnizorii reali sunt dezactivați și neconfigurați. Secțiunea Referral Links nu mai este placeholder; Maintenance, Jobs, Support și Data Inspector rămân în lucru. [Configurare și verificări](AFFILIATE_TICKETS.md).

Actualizare verificări, 25 septembrie 2026: blocajul Chrome la `Page.enable` a fost depășit prin rularea testului local în afara sandboxului. Login/MFA și paginile dashboard, users, trips, audit, logs, health, AI și settings, plus diagnostic și repair preview, au trecut. Capturile sunt în `.local/final-local/admin-*.png`. Această regresie nu implementează secțiunile placeholder de mai jos. Raportul user-side și verificările actualizate: [FINAL_PREPRODUCTION_AUDIT.md](FINAL_PREPRODUCTION_AUDIT.md).

Specificația este implementată incremental, fără a modifica autorizația owner-scoped a API-urilor normale. Auditul inițial rămâne în `ADMIN_AUDIT.md`.

## Etapa 1 — fundație

Implementat: USER/ADMIN/SUPER_ADMIN persistente; ACTIVE/SUSPENDED/DISABLED/PENDING_DELETION; middleware server-side; audit append-only în API; bootstrap operator cu confirmare; MFA TOTP cu QR local, protecție la replay și recovery codes hash-uite; criptare AES-256-GCM cu context; schelet `/admin` și link numai pentru roluri privilegiate. Niciun cont existent nu a fost promovat.

Migrarea aditivă este aplicată local. Sunt adăugate câmpuri la users/sessions și tabelele admin_locks, audit_events, admin_mfa. API-ul de profil folosește un DTO explicit; nu expune câmpurile sesiunilor/MFA.

Fișiere: `server/admin/{migrate,crypto,audit,permissions,mfa,router}.js`, `scripts/admin-promote.mjs`, `server/{migrate,auth,schema,app}.js`, `src/api/admin.js`, `src/components/admin/{AdminLayout,AdminMfa}.jsx`, `src/pages/{Admin,Home}.jsx`, `src/App.jsx`, `src/styles/admin.css`, testele admin, testul de serializare, manifest/lockfile și `.env.example`.

Nou: `ADMIN_SECRETS_MASTER_KEY` (64 caractere hex aleatoare, doar server). Nu a fost generată sau salvată o cheie permanentă. Fără cheie, funcțiile normale continuă cu env-ul existent, dar înrolarea MFA administrativă este blocată sigur. Codul folosește [OTPAuth](https://github.com/hectorm/otpauth) pentru TOTP și [node-qrcode](https://github.com/soldair/node-qrcode) pentru QR local.

Comenzi operator, după configurarea sigură a cheii: `npm.cmd run db:migrate`, apoi `npm.cmd run admin:promote -- adresa-contului-verificat`. Promovarea cere confirmare interactivă exactă și revocă sesiunile contului. Se continuă cu login normal și `/admin` pentru MFA.

Verificarea etapei: typecheck, ESLint, 55 teste unitare/HTTP, 12 teste MySQL și build trec. Panoul complet nu este încă declarat finalizat. Urmează paginile operaționale, configurația, furnizorii, politicile și mentenanța.

## Etapa 2 — operațiuni de bază

Dashboard cu KPI-uri și grafice, Users cu filtre/paginare și detalii, suspendare/reactivare/revocare/reset prin e-mail, schimbări de rol cu protejarea ultimului super-admin, Trips cu diagnostic redactat și reparație locală preview/apply, Health/Logs/Audit și analytics derivat. Ultimul super-admin este protejat sub lock tranzacțional. API-urile normale rămân owner-scoped chiar pentru SUPER_ADMIN.

Adăugate: `server/admin/{query,telemetry,users,operations,trips}.js`, `src/components/admin/{AdminCommon,AdminOperations}.jsx`; actualizate routerul, migrarea admin, middleware-ul aplicației, pagina Admin, CSS și testul MySQL admin. Tabele noi: app_logs, analytics_events, provider_events, email_events; uploads primește size_bytes nullable. În această etapă contoarele provider/PDF sunt infrastructură de tracking, conectată în etapa următoare; nu reconstruim istoric fictiv. Nu există variabile env noi în etapa 2. Migrarea locală este aplicată.

Typecheck, ESLint, 55 teste unitare/HTTP, 12 teste MySQL și build trec, inclusiv HTTP direct pentru USER respins, ADMIN limitat, suspendare și protejarea ultimului SUPER_ADMIN. Nu sunt necesare comenzi suplimentare locale pentru schema etapei. Urmează configurarea și integrarea politicilor în operațiile reale.

## Continuare — configurație și inventarul fișierelor

Codul existent include acum setări versionate, feature flags, cote, credențiale criptate și pagini pentru furnizori/SMTP/branding. Acestea depășesc starea descrisă în etapa 2; implementarea completă a tuturor setărilor nu este încă certificată.

Conectat `/admin/files`: inventar paginat, filtre MIME/Wallet, dimensiuni, stare fizică și totaluri de stocare. Inventarul nu returnează numele fizice sau conținutul fișierelor. Accesul excepțional necesită cerere motivată, MFA recent și aprobarea unui alt SUPER_ADMIN; grantul expiră, poate fi revocat și fiecare descărcare este auditată. Unicul super-admin nu își poate aproba propria cerere.

Corectate: cererile neautentificate sunt respinse înaintea încărcării politicilor globale; tokenurile publice evident invalide sunt respinse înaintea consultării DB; eliminarea unei credențiale cu versiune veche returnează conflict; rezervările concurente de cote folosesc un lock exclusiv pentru a evita deadlock-ul produs de `INSERT IGNORE` urmat de upgrade de lock.

Migrarea aditivă a fost aplicată local. Nu au fost schimbate credențialele furnizorilor sau politicile conturilor reale. Verificări: build, typecheck, ESLint, 55 teste unitare/HTTP și 15 teste MySQL trec. Noile teste verifică politicile prin HTTP, conflictele de versiune, cotele concurente și izolarea granturilor de fișiere. Testul complet de browser a întâmpinat un timeout Chrome la `Page.enable`; acesta nu confirmă fluxurile UI.

Rămân de implementat/verificat secțiunile încă placeholder (Referral Links, Maintenance, Jobs, Support, Data Inspector), integrarea completă a setărilor în toate fluxurile și verificarea vizuală a noilor pagini admin.

## Continuare — domenii și autentificare socială

Implementate `/admin/domains` și `/admin/authentication`: origini publice/aplicație cu prioritate Admin → env → fallback local, URL-uri derivate, validare fără acces la hosturi arbitrare, control de versiune și audit al valorilor vechi/noi. Modificările sensibile cer SUPER_ADMIN și autentificare/MFA recente. Google/Apple au credențiale write-only criptate, callback-uri copiable, linkuri oficiale și verificări de configurare separate explicit de loginul real. Schimbarea domeniului invalidează fluxurile începute și cere actualizarea consolelor furnizorilor.

Connected Accounts în profil, identificatori stabili provider/subject, legare cu confirmare și protecția ultimei metode utilizabile. Autentificarea socială creează aceleași sesiuni; nu acordă roluri privilegiate și nu înlocuiește MFA. System Health și detaliile utilizatorilor arată starea domeniilor/metodelor. URL-urile e-mail/reset/share provin din configurația centrală.

Migrarea aditivă este aplicată local. Valorile de producție intenționate nu au fost activate; conturile și credențialele reale nu au fost schimbate. Typecheck, lint, 71 teste unitare/HTTP, 37 teste MySQL, build și regresiile Chrome trec. Capturile noi sunt în `.local/social-verification/`. Google și Apple nu au credențiale OAuth configurate; testele lor folosesc identități fictive semnate, iar loginul real rămâne de verificat. Detalii: `SOCIAL_AUTH.md` și `DOMAIN_CONFIGURATION.md`.

Referral Links/Tours & Tickets au fost între timp implementate conform `AFFILIATE_TICKETS.md`. Maintenance, Jobs, Support și Data Inspector nu sunt declarate finalizate de această etapă.
