# Corectarea priorităților și a validării itinerarului — 24 septembrie 2026

## Cauza verificată în datele existente

Excursia „Bucharest Bound” avea zece locuri provenite din AI, toate cu `selection_source=ai` și `priority=preferred`. Palace of Parliament era `mandatory`, provenit din Google. Sugestiile nu fuseseră salvate greșit drept obligatorii: motorul genera același conflict pentru orice loc selectat rămas neprogramat. Interfața și PDF-ul preluau lista integrală de conflicte din `itinerary_meta`. Itinerarul salvat încă folosea regulile anterioare.

Calculul vechi al sosirii compara minutele cu limita zilei și includea un buffer suplimentar. Astfel, chiar sosirea la 22:22, formalitățile de 60 de minute și transferul estimat de 30 de minute puteau produce avertismentul de miezul nopții. Reprezentarea exclusiv prin ore nu descria corect un transfer care se termină în ziua următoare.

Există și o neconcordanță reală în datele citite: excursia se termină pe **3 octombrie 2026**, iar plecarea este **4 octombrie 2026, 06:22**. Aceasta necesită verificarea utilizatorului. Nu am schimbat datele, prioritățile sau itinerarul excursiei originale.

## Logica nouă

- Rezervările confirmate, orele fixe și logistica sosirii/plecării sunt protejate. Rezervările confirmate din Wallet ocupă timp chiar dacă nu au o selecție separată în Desired places. Când există legătură explicită, nu sunt dublate; data/ora rezervării au prioritate.
- Locurile `mandatory`, locurile introduse manual/prin Google în Desired places și locurile cu bilet/oră fixă au prioritate față de sugestiile AI preferate. O alegere explicită `mandatory` rămâne obligatorie chiar dacă originea este AI. Înregistrările vechi fără origine păstrează semantica priorității salvate.
- Sugestiile AI acceptate `preferred` folosesc timpul rămas. Se iau în calcul proximitatea, interesele, ritmul, durata, transportul, mesele, bufferele și orele disponibile. Dorințele speciale și realismul orelor de deschidere sunt transmise în prompt; intervalele propuse de AI pot restrânge, dar nu extinde, orele utilizatorului.
- Locurile opționale care nu încap sunt păstrate în selecții și în `itinerary_meta.unscheduled_optional`. API-ul returnează `unscheduledOptional`, separat de `conflicts`. Ele nu transformă un itinerar valid în „Needs review”.
- Promptul AI distinge `required`, `priority` și `source`. Nu mai cere includerea tuturor sugestiilor opționale. Schema și validarea resping ID-uri inventate, duplicate și mutarea rezervărilor fixe. Programatorul local verifică rezultatul și asigură alternativa fără AI.
- Evenimentele noi au `start_datetime` și `end_datetime` complete, în ora locală a destinației, pe lângă câmpurile vechi. Sosirea și transferurile pot continua a doua zi; o plecare foarte devreme poate avea transferul în seara precedentă. Duratele și suprapunerile folosesc datele complete.
- Orele zilnice limitează vizitele și activitățile flexibile. Transferurile aeroport–hotel și rezervările fixe pot exista în afara lor. Un interval marcat explicit ca indisponibil rămâne o restricție reală: conflictul se raportează, fără mutarea tacită a rezervării.
- Editările păstrează zilele neafectate. Orele flexibile vechi pot fi compactate într-o zi afectată, dacă altfel o mutare fezabilă ar fi respinsă. O oră nouă cerută pentru o vizită obișnuită nu primește privilegiile unei rezervări confirmate.

Nu există verificare live a traficului, accesibilității sau orelor de deschidere. Duratele de transfer rămân estimări. Datele calendaristice locale nu reprezintă un motor de conversie între fusuri orare sau de calcul al schimbării orei de vară.

## Interfață și avertismente

Itinerary și pasul final au o secțiune discretă, pliabilă: **optional ideas saved for later**. **Review options** deschide Desired places. Utilizatorul poate marca o idee `Mandatory` și regenera, sau poate solicita adăugarea/înlocuirea prin **Change itinerary**, cu previzualizare înainte de aplicare.

Avertismentele rămân pentru probleme reale: un loc dorit care nu încape, suprapuneri, intervale blocate, date/ore invalide, rezervări în afara intervalului dintre sosire și plecare, adrese lipsă, oră de plecare neconfirmată, contradicții cu excluderile, depășirea bugetului sau a ritmului prin vizite obligatorii. O trecere peste miezul nopții nu generează singură un avertisment.

Itinerarele vechi nu sunt regenerate automat. API-ul le marchează `requiresRegeneration`, iar interfața explică de ce este disponibilă o actualizare. Avertismentele istorice rămân asociate programului salvat până când utilizatorul regenerează explicit. Astfel nu sunt șterse editări și nu sunt ascunse probleme fără recalculare.

## PDF

Șablonul PDF nu mai include lista `conflicts`, diagnosticele de capacitate sau mesajele interne despre starea planificării. Păstrează titlul, destinația, datele, cazările, programul, transferurile, mesele și indicațiile de rezervare. Intervalele care continuă a doua zi au marcajul **(+1 day)**. Documentele private rămân excluse.

Am deschis PDF-ul efectiv descărcat din interfață în Chrome și am inspectat toate cele patru pagini. Nu conține avertismente tehnice. Capturile sunt în `.local/scheduling-pdf-inspection/`; calea PDF-ului este în `.local/scheduling-verification/report.json`.

## Baza de date, API și compatibilitate

Migrare aditivă, deja aplicată bazei locale: două coloane opționale `TEXT NULL` în `itinerary_items`: `start_datetime`, `end_datetime`. Nu se șterg coloane, tabele sau înregistrări. Câmpurile `date`, `start_time`, `end_time` sunt păstrate; citirea acceptă datele vechi. Actualizările orelor prin API-ul existent sincronizează și noile câmpuri.

Nu există endpointuri noi în această corectare. Sunt actualizate răspunsurile GET/POST `/api/trips/:id/itinerary`, persistarea editărilor și previzualizărilor, PDF-ul, actualizarea `ItineraryItem` și proiecția publică a orelor. Configurația privată, verificarea proprietarului, versiunile și tranzacțiile sunt păstrate.

**Nu sunt necesare variabile de mediu sau pachete noi.** `CHROME_PATH` rămâne opțional, introdus în etapa anterioară.

## Fișiere schimbate în această corectare

- Backend: `server/itinerary-engine.js`, `server/itinerary-service.js`, `server/itinerary-ai.js`, `server/itinerary-changes.js`, `server/itinerary-pdf.js`, `server/entities.js`, `server/trips.js`.
- Module noi: `server/itinerary-time.js`, `server/itinerary-logistics.js`.
- Schema/migrare: `server/schema/ItineraryItem.json`, `server/migrate.js`.
- Frontend: `src/pages/Itinerary.jsx`, `src/components/planning/StepFinalize.jsx`, `src/components/itinerary/VisitCard.jsx`, `TransportCard.jsx`, `ItineraryDay.jsx`, `ChangeItineraryDialog.jsx`, `src/lib/trip-presentation.js`.
- Componente/utilitare noi: `src/components/itinerary/OptionalPlaces.jsx`, `src/lib/itinerary-time-label.js`.
- Teste: `server/tests/functional-polish.test.js`, noul `server/tests/scheduling-priorities.test.js`, noul `scripts/verify-scheduling.mjs`.
- Documentație: acest fișier, `docs/FUNCTIONAL_POLISH.md`, `docs/MIGRATION_STATUS.md`, `README.md`.
- `dist/` a fost regenerat prin build; rapoartele și capturile locale sunt în `.local/`.

## Verificări

- Typecheck și ESLint: trec.
- 47 de teste automate: trec, inclusiv opt teste noi pentru priorități, transfer nocturn, plecare după miezul nopții, rezervări și PDF fără diagnostice.
- 10 teste de integrare MySQL: trec; includ izolarea utilizatorilor, editări, concurență, previzualizare/aplicare și Travel Wallet.
- Build Vite: trece. Rămân avertismentele existente despre dimensiunea bundle-ului și două clase Tailwind ambigue.
- Chrome real, aplicație locală și MySQL: excursie fictivă de trei zile în București, două locuri dorite și 16 sugestii acceptate. Patru vizite programate, inclusiv ambele locuri dorite; 14 opțiuni păstrate separat; zero conflicte. Transferul salvat este 1 octombrie 23:22 → 2 octombrie 00:27. Au trecut reîncărcarea, citirea metadatelor MySQL, Review options, afișarea desktop/mobil și descărcarea PDF, fără excepții JavaScript sau cereri Base44. Această rulare a folosit alternativa locală de generare; nu o prezentăm ca verificare nouă a unui răspuns AI real.
- PDF descărcat: toate cele patru pagini inspectate vizual în Chrome.
- Regresia Chrome completă cu furnizori simulați: trece pentru autentificare, creare excursie, cele șase etape, autocomplete, reîncercare AI, acceptare/editare/respingere, generare, referral, mutare/înlocuire, revenire pe Home și partajare anonimă.

## Ce trebuie să faci

Pe calculatorul actual migrarea este deja aplicată. Reîncarcă aplicația. Pentru „Bucharest Bound”, verifică întâi dacă excursia trebuie să se termine pe 4 octombrie sau dacă data plecării este greșită. Apoi deschide **Update Plan → Itinerary & tickets → Regenerate itinerary**. Regenerarea înlocuiește programul folosind datele curente; simpla deschidere îl păstrează.

Verifică locurile dorite, secțiunea opțiunilor, transferul nocturn și **View full itinerary → Download PDF**. Pentru sugestiile vechi fără adresă/ID Google, folosește confirmarea locației înainte de regenerare.

Pe altă instanță a proiectului:

```powershell
cd C:\travel
npm.cmd run db:migrate
npm.cmd run dev
```

Pentru repetarea verificărilor:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
$env:MYSQL_TEST_DATABASE = 'tripsync_test'
npm.cmd run test:integration
npm.cmd run build
node scripts/smoke-browser.mjs --full --mock-providers
```

Cu aplicația locală pornită, `node scripts/verify-scheduling.mjs` testează scenariul nocturn folosind un cont fictiv, eliminat la final. Butonul de generare poate apela AI-ul configurat pe backend. Nu modifică excursiile existente.
