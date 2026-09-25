# TripSync — verificare locală înainte de producție

Actualizat: 25 septembrie 2026. Nu s-a făcut deploy și nu au fost modificate DNS-ul, infrastructura de producție sau cheile configurate. Testele care scriu date folosesc exclusiv `tripsync_test` și conturi fictive; verificarea bazei aplicației este read-only.

## Implementat

- Trip Health în Overview: probleme concrete, checklist, maximum trei acțiuni următoare și locuri opționale păstrate separat.
- Repair cu preview explicit, apply tranzacțional și Undo condiționat de absența modificărilor ulterioare. Deschiderea unei excursii nu regenerează planul.
- Before You Go bazat pe rezervări, fișiere, itinerar și informații de călătorie existente; se extinde aproape de plecare, în intervalul de 14 zile.
- Integrare server-side Google Routes și program săptămânal Google Places în planificare; fallback local etichetat.
- Security & privacy: schimbarea parolei, lista sesiunilor, revocarea celorlalte sesiuni, export JSON și cerere de ștergere.
- Corecturi mobile pentru taburile profilului, stări de încărcare/eroare, protecție împotriva retrimiterii OTP, mesaje de eroare ale furnizorilor și încărcarea separată a modulului Admin.
- Corectat un efect secundar al sortării itinerarului care invalida Undo la citire. Fișierele Wallet fără rol în planificare nu mai marchează itinerarul ca învechit.

## Readiness — calcul exact

Nu există scor procentual. Se verifică destinația, datele valide, cel puțin un adult, adresele cazărilor deja adăugate, informațiile de sosire/plecare când călătoria le necesită, adresa și coordonatele locurilor obligatorii, existența și actualitatea itinerarului, plus conflictele motorului.

`BLOCKED` înseamnă o problemă blocantă precum destinație/date invalide ori suprapuneri de călătorie; `NEEDS ATTENTION` înseamnă alte informații necesare sau conflicte; `UPDATE AVAILABLE` indică numai un plan învechit ori o versiune mai nouă de calcul; `READY` înseamnă că nu există probleme dintre acestea. Tipul călătoriei, cazarea absentă și documentele sunt opționale. Locurile opționale neprogramate nu scad readiness. READY nu confirmă validitatea biletelor sau disponibilitatea reală a rezervărilor.

## Repair și securitate

Endpointuri autentificate:

- `GET /api/trips/:id/health`
- `POST /api/trips/:id/repair/preview`
- `POST /api/trips/:id/repair/apply`
- `POST /api/trips/:id/repair/undo`

Fiecare operație citește excursia după ID și proprietarul sesiunii. Rolul administrativ nu ocolește ownership-ul acestor API-uri. Preview nu scrie planul și produce un token legat de proprietar, excursie și revizie, valabil zece minute. Apply ia lock pe excursie și respinge reviziile schimbate; tokenul nu poate aplica de două ori aceeași actualizare. Rezervările blocate nu pot fi mutate de repair.

Istoricul din `itinerary_repair_history` păstrează starea anterioară. Undo restaurează planul numai dacă revizia și intrările de planificare încă se potrivesc și crește monoton versiunea. Datele, preferințele, Desired Places, Special Wishes și fișierele Wallet rămân păstrate. Tokenurile preview sunt în memoria procesului: un restart necesită un preview nou.

## Rutare și program de vizitare

Google Routes `computeRoutes` furnizează durate și distanțe pentru mers pe jos, transport public sau condus. Activare: setarea administrativă `google_routes_enabled`, cu valoare inițială din `GOOGLE_ROUTES_ENABLED=true`. Cheia rămâne pe server. Testul real a activat rutarea numai în procesul său; setările conturilor reale nu au fost modificate.

Rezultatele sunt reutilizate în aceeași operație; implementarea curentă limitează operația la 40 de cereri de rutare, patru cereri concurente și trei runde de recalculare. Erorile, lipsa cheii sau dezactivarea folosesc estimările locale. UI distinge „Google Maps estimate” de „Estimated”. Rutarea verificată nu reprezintă o garanție a orarului de transport la data viitoare a excursiei. Referință: [Google Routes](https://developers.google.com/maps/documentation/routes/compute_route_directions).

Google Places oferă `regularOpeningHours` și `businessStatus`. Vizitele flexibile sunt încadrate în ferestrele cunoscute, inclusiv peste miezul nopții. Locurile închise nu primesc vizite flexibile; rezervările fixe sunt păstrate și semnalate pentru verificare. Când programul lipsește, motorul permite planificarea cu indicația că programul trebuie verificat. Programul săptămânal nu certifică excepțiile de sărbători. Referință: [Places REST](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places).

Versiunea motorului este 3. Planurile vechi pot afișa UPDATE AVAILABLE; actualizarea rămâne explicită.

## Cont și confidențialitate

Schimbarea parolei verifică parola curentă și revocă sesiunile și tokenurile de autentificare. Revocarea celorlalte sesiuni păstrează sesiunea curentă. Lista dispozitivelor nu expune tokenuri.

Exportul necesită parola și conține numai datele proprietarului, fără secrete de autentificare sau token de partajare. Include metadatele fișierelor, nu binarele; limita este de 5.000 de înregistrări per colecție.

Ștergerea necesită parola și confirmarea `DELETE MY ACCOUNT`. Creează o cerere pending în `privacy_requests`; contul nu este șters imediat. Conturile privilegiate trebuie mai întâi retrogradate de un operator autorizat. Procesarea efectivă a cererii rămâne manuală și nu este implementată ca job automat în acest pas.

## Rezultate de verificare

| Verificare | Rezultat |
| --- | --- |
| Typecheck | PASS |
| ESLint | PASS |
| Unitare și HTTP fără MySQL | 61 PASS |
| Integrare MySQL, inclusiv HTTP/security | 20 PASS |
| Build Vite | PASS; avertisment pentru dimensiunea bundle-ului principal |
| Chrome smoke complet | PASS, inclusiv autosave/reload, editări și share |
| Parcurs Chrome desktop/mobil cu furnizori simulați | PASS; raport fără failures |
| Admin login/MFA/pagini/diagnostic/repair preview | PASS pentru paginile enumerate mai jos |
| Integritate DB aplicație | 0 probleme în cele zece verificări; 8 fișiere fizice verificate |

Testele de securitate includ acces între proprietari, preview fără mutații, conflicte de revizie, Undo nereutilizabil, păstrarea fișierelor, partajare anonimă fără documente private, revocarea sesiunilor și exportul/deletion autentificate.

Chrome a verificat Overview, Plan, Suggestions, Itinerary, Wallet și Profile la 1440px și 390px; dialogurile de health, repair și change itinerary; documentul QR privat, partajarea anonimă și persistența după logout/login. Nu au fost detectate excepții JavaScript necontrolate sau overflow orizontal al paginii. Au fost inspectate vizual capturi desktop/mobil și prima pagină a PDF-ului de șapte pagini; nu se pretinde o inspecție manuală completă a fiecărei pagini PDF sau un audit complet de accesibilitate.

Admin: dashboard, users, trips, audit, logs, health, AI și settings au fost deschise după MFA; diagnostic și preview de repair au fost apelate. Aceasta nu certifică secțiunile încă placeholder: Referral Links, Maintenance, Jobs, Support și Data Inspector.

## Furnizori reali — separați de fixtures

| Furnizor | Rezultat observat |
| --- | --- |
| OpenAI | Nume și sugestii funcționale. Generarea și modificarea AI au trecut reluarea restrânsă cu două obiective pe cinci zile. |
| Google Places | Autocomplete, detalii, fotografii, restaurante și program real funcționale. |
| Google Routes | Apeluri reale reușite; primul scenariu a înregistrat 49, înaintea plafonului curent de 40/operație. |
| SMTP | Neconfigurat; a fost verificată cutia locală de dezvoltare. |
| PDF | Export Chrome funcțional, fișier deschis în viewer. |

Scenariul real complex cu zece locuri a generat nouă vizite, un loc opțional și zero conflicte folosind fallback local. Modificarea sa în limbaj natural a depășit timeout-ul browserului de 180 secunde. Raportul inițial păstrează acest eșec; reluarea restrânsă a trecut, dar nu echivalează cu trecerea neîntreruptă a scenariului complex. Nu declarăm acest caz rezolvat complet.

Conturile create de scripturile finale sunt curățate după test. Contul fictiv rămas după întreruperea primului test real a fost eliminat explicit din `tripsync_test`, după verificarea ID-ului, a sufixului e-mailului și a absenței uploadurilor.

## Artefacte și reproducere

- `.local/final-local/report.json`: parcurs complet cu fixtures, fără eșecuri.
- `.local/final-verification/report.json`: primul parcurs real, inclusiv timeout.
- `.local/final-verification/followup.json`: reluarea reală restrânsă, fără eșecuri.
- `.local/final-verification/integrity.json`: verificările read-only.
- `.local/final-local/*.png`: capturi finale desktop, mobile și Admin.
- `.local/final-verification/followup-browser/real-*.png`: capturi din testul real.
- `.local/final-local/itinerary.pdf` și `pdf-review/pdf-opened.png`: export și inspecție PDF.

Comenzi locale:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
$env:MYSQL_TEST_DATABASE='tripsync_test'
npm.cmd run test:integration
npm.cmd run build
node scripts/smoke-browser.mjs --full
node scripts/final-verification.mjs --local
node scripts/check-integrity.mjs
```

`final-verification.mjs --live` și `verify-provider-followup.mjs --live` efectuează apeluri externe cu costuri normale; această sesiune a avut autorizare explicită pentru date fictive din Roma. Scriptul followup folosește două locuri publice fixe și nu depinde de conturile rămase în DB. Restricțiile mediului au necesitat lansarea Chrome în afara sandboxului pentru a evita blocarea la Page.enable.

## Verdict și pași rămași

**NOT READY** pentru certificarea completă cerută. Rezultatele locale de mai sus sunt pozitive, dar rămân pași concreți:

1. Configurarea SMTP și verificarea livrării reale pentru înregistrare, retrimitere și resetarea parolei. Cutia de dezvoltare nu verifică livrarea.
2. Investigarea latenței și reluarea integrală a modificării AI din scenariul complex. Succesul reluării restrânse nu închide acest caz.
3. Stabilirea și verificarea unui flux operațional pentru procesarea cererilor pending de ștergere; butonul utilizatorului înregistrează cererea, fără a executa ștergerea.

Limitări suplimentare: bundle principal mare, program regulat fără toate excepțiile calendaristice, fallback estimativ și export fără binare. Optimizări suplimentare ale bundle-ului și PWA/offline sunt amânate. Nu există în acest raport dovada verificării backup/restore sau a infrastructurii viitoare de producție. Adminul complet rămâne o lucrare separată, conform `ADMIN_IMPLEMENTATION.md`.

## Actualizare — autentificare socială și domenii portabile

Implementate Admin Domains & URLs, Authentication Providers, Connected Accounts, Google OIDC cu PKCE S256 și Apple authorization-code/form_post cu client-secret ES256. Auditul, versiunile, conturile suspendate, confirmarea coliziunilor de e-mail și MFA administrativă sunt verificate. Nu sunt păstrate access/refresh tokens; cheile rămân criptate pe server.

URL efectiv aplicație: `http://localhost:5173` din env `APP_URL`; website public: aceeași origine, fallback de dezvoltare. Nu există override de producție. Prioritate: Admin → PUBLIC_* env → APP_URL pentru aplicație → fallback exclusiv de dezvoltare. URL-urile de verificare, resetare și partajare sunt dinamice. Testul alpha→beta și revenirea la env trec; căutarea în runtime nu găsește domenii TripNexa hardcodate.

Verificări finale ale acestei etape: **typecheck PASS, lint PASS, 71 unitare/HTTP PASS, 37 MySQL PASS, build PASS**. Regresia Chrome completă cu furnizori simulați, `final-verification --local`, `verify-affiliates` și `verify-social` trec. Acoperă wizard/autosave/reload, Home, itinerar/modificare, Trip Health/Repair/Undo, restaurante, Wallet, PDF, sharing, Admin/MFA și metodele de autentificare. Verificările specifice securității și portabilității sunt în `social-auth.test.js` și `social-integration.mjs`.

Capturi: `.local/social-verification/01-login-mobile.png`, `03-connected-mobile.png`, `04-admin-domains.png`, `05-admin-authentication.png`, `06-health.png`, `07-login-error.png`, `08-login-both-mobile.png`. Capturile cu butoane active folosesc configurări fictive; nu demonstrează configurarea unor conturi OAuth reale.

**Google:** implementare verificată cu fixtures; Client ID și Client Secret reale neconfigurate; login real NOT TESTED. **Apple:** implementare și callback POST verificate cu fixtures; Services ID, Team ID, Key ID și cheia privată reale neconfigurate; login real așteaptă configurarea HTTPS și Apple Developer. Furnizorii reali rămân dezactivați.

Blocajele anterioare de producție rămân deschise: SMTP real, scenariul AI complex, procesarea operațională a ștergerilor și infrastructura/backup. Pentru social auth se adaugă configurarea domeniilor HTTPS și a credențialelor/consolelor externe, urmată de login real Google/Apple. Nu s-a făcut deploy și nu s-a modificat DNS-ul. Ghiduri: `DOMAIN_CONFIGURATION.md` și `SOCIAL_AUTH.md`.
