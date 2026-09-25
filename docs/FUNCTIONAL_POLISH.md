# TripSync — functional polish, AI control și itinerar

## Cauza verificată și remedierea

În excursia „Bucharest Bound” din capturi existau 11 locuri selectate. Cele 10 sugestii AI acceptate aveau ID intern, durată și prioritate, dar toate aveau `place_id`, `lat` și `lng` nule și `status=unresolved`. Acceptarea nu apela Google. În consecință, programatorul folosea estimarea de 30 de minute pentru fiecare deplasare necunoscută. Reproducerea în memorie, folosind înregistrările reale fără a le modifica, a programat doar patru vizite și a raportat restul ca neîncadrate.

Separat, sosirea la 22:22, formalitățile de 60 de minute și transferul de 30 de minute se terminau la 23:52. Verificarea adăuga încă 15 minute de buffer înainte de a decide că transferul depășește miezul nopții. Avertismentul era fals. Corectarea ulterioară păstrează acum date și ore complete pentru evenimentele care continuă în ziua următoare. Vezi [SCHEDULING_FIXES.md](SCHEDULING_FIXES.md) pentru comportamentul actual.

Nu am reprodus o excepție JavaScript sau o eroare HTTP la citirea acelui itinerar salvat. Logurile conțineau întreruperi istorice ale conexiunii către backend, dar nu o excepție care să dovedească o cădere provocată de acceptare. Problema confirmată a fost calitatea datelor de localizare și starea de planificare cu conflicte. Nu prezentăm conflictele de capacitate reale drept erori tehnice: prea multe vizite pentru timpul disponibil pot necesita în continuare ajustări.

Sugestiile sunt acum rezolvate prin Google înainte de acceptare. Pentru nume ambigue, utilizatorul confirmă candidatul; fără rezultat poate păstra explicit un loc manual. Se păstrează coordonatele, adresa, localitatea, țara, ID-ul Google, durata, categoria și originea AI. Înregistrările vechi nerezolvate au acțiunea **Confirm location**. Editarea exclusivă a duratei păstrează coordonatele; schimbarea numelui/adresei le invalidează.

Testarea cu AI real a identificat și o îngustare excesivă a programului de dimineață pentru „o după-amiază liberă”. Backendul relaxează acum numai orele suplimentare propuse de AI dacă acestea elimină un loc obligatoriu care încape în orele stabilite de utilizator. Nu lărgește automat orele introduse de utilizator.

## Funcționalități

- **Daily planning hours**: denumire și explicație clare, intervale multiple, blocaje cu ore/motiv editabile și eliminare individuală. Vizitele flexibile respectă intervalele. Rezervările cu oră fixă rămân vizibile la ora lor, inclusiv în afara intervalului preferat; suprapunerile reale sunt semnalate.
- **Special wishes**: text de maximum 4.000 de caractere, salvat în MySQL și transmis în toate cele trei prompturi. Se păstrează după reîncărcare.
- **Fotografii Google reale**: până la patru fotografii per loc rezolvat, încărcate când cardul devine vizibil, cu autori și sursă. Galerie mare, Previous/Next, săgețile tastaturii, Escape și gest orizontal pe telefon. Lipsa fotografiilor nu blochează planificarea și nu afișează imagini inventate.
- **Change itinerary**: solicitare separată de preferințele persistente, previzualizare cu Added/Removed/Moved, zile și ore, program complet verificabil, Apply/Cancel. Se reconstruiesc doar zilele afectate. Zilele neafectate își păstrează înregistrările. Adăugarea unui loc nou necesită identificare Google sigură; pentru ambiguități aplicația cere confirmarea în Desired places.
- **Salvare protejată**: previzualizarea nu scrie în baza de date. Apply verifică proprietarul, excursia, versiunea și datele curente și scrie într-o tranzacție. Dacă datele s-au schimbat sau operația eșuează, vechiul itinerar rămâne. Previzualizarea expiră după 20 de minute sau la repornirea backendului; se poate cere una nouă.
- **Tickets & bookings**: diferențiază cerințe neconfirmate, rezervări confirmate și Ticket added/View ticket. Asocierea fișierelor folosește identități explicite/nume exacte, nu presupuneri. Linkurile referral existente au prioritate; sursa HTTPS deja salvată este fallback. Nu sunt inventate linkuri.
- **Butoane**: stil comun piersiciu cu text închis la hover/active, focus vizibil, stări secundare și disabled identificabile. Sunt păstrate stilurile TripSync.

O cerere Change itinerary nu se salvează în Special wishes. Modificările sunt salvate în itinerarul curent; o regenerare completă ulterioară folosește din nou selecțiile și preferințele de planificare. Eliminarea unei vizite prin această previzualizare nu șterge locul din Desired places. Rezervările protejate nu pot fi eliminate sau mutate prin AI.

## PDF

Butonul **Download PDF**, lângă Share în Itinerary, solicită PDF-ul de la backend. Chrome headless deja instalat redă un șablon HTML separat, alb, A4, cu text selectabil, margini, accent piersiciu, subsol TripSync și numere de pagină. Zilele încep pe pagini noi; cardurile nu sunt tăiate, iar pauzele și bufferele sunt compacte.

Documentul include destinația, datele, numărul călătorilor, transportul, cazările, toate zilele și programul, transferurile, mesele și indicații de rezervare. În corectarea ulterioară au fost eliminate conflictele și diagnosticele interne din PDF. Nu include fișiere Wallet, nume de fișiere, copii de pașapoarte, bilete PDF sau URL-urile private ale încărcărilor.

Randarea folosește date escapate, JavaScript dezactivat și cereri de rețea blocate. Chrome rulează fără fereastră și cu profil temporar separat. Nu s-au instalat biblioteci PDF. Exporturile sunt autentificate, limitate ca frecvență și maximum două rulează simultan.

## Prompturile backend

1. **Suggestions** primește destinația, datele/durata, transportul, cazările, sosirea/plecarea, locurile existente, interesele/excluderile, ritmul, mersul pe jos, mobilitatea/căruciorul, mesele, bufferele, orele/blocajele și Special wishes. Cere numai locuri reale, potrivite logistic, fără duplicate, într-un număr justificat de timpul rămas.
2. **Itinerary** cere ID-uri existente, distribuție geografică practică, ore orientative și eventual intervale preferate mai restrânse pentru dorințele utilizatorului. JSON-ul este validat; motorul local construiește și verifică vizitele, transferurile, mesele, pauzele, cazările și rezervările. AI nu decide direct rândurile SQL.
3. **Change itinerary** primește și itinerarul curent, rezervările protejate și cererea punctuală. Ordinea este: datele călătoriei → zboruri/sosire/plecare → rezervări confirmate → cazare/accesibilitate → cererea curentă → preferințe. Propune numai modificările necesare. Backendul validează din nou și produce previzualizarea din rezultatul efectiv calculat.

Orele de deschidere, accesibilitatea, traficul și disponibilitatea biletelor nu sunt verificate live. Estimările și conflictele sunt afișate explicit. AI poate propune o schimbare imposibilă; aceasta este respinsă cu un mesaj util, fără pierderea itinerarului.

Implementarea păstrează Responses API cu `store: false`, schema JSON strictă și validare locală, conform [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## Google și configurare

Fotografiile au funcționat cu cheia deja configurată, prin Places API (New): Text Search, Place Details și Place Photos. Nu este necesară o cheie publică `VITE_...`. `GOOGLE_MAPS_API_KEY`, `OPENAI_API_KEY` și `OPENAI_MODEL` rămân exclusiv în `.env`/backend.

Referințele fotografiilor și imaginile nu sunt salvate în baza de date sau într-un cache permanent. Cererile folosesc răspunsuri `no-store` și tokenuri de afișare temporare semnate, legate de utilizator. ID-ul Google deja cunoscut este reutilizat pentru a evita căutarea repetată. Acest comportament urmează [Place Photos](https://developers.google.com/maps/documentation/places/web-service/place-photos) și [politicile Places](https://developers.google.com/maps/documentation/places/web-service/policies).

Variabilă nouă **opțională** în `.env.example`: `CHROME_PATH`. Pe acest calculator nu trebuie completată: locația implicită este `C:/Program Files/Google/Chrome/Application/chrome.exe`. Pe alt server indică executabilul Chrome disponibil acolo. Configurarea cheilor pentru un alt mediu necesită Places API (New) activat și restricții API/IP potrivite backendului.

Migrare: `trips.special_wishes TEXT NULL`, aditivă și repetabilă. A fost aplicată local; datele vechi rămân compatibile. Nu există tabel suplimentar pentru fotografii sau previzualizări.

## Endpointuri

| Metodă și endpoint | Rol |
|---|---|
| POST `/api/places/resolve` | Căutare structurată, rezultat exact sau candidați pentru confirmare |
| GET `/api/places/:id/photos` | Metadate și URL-uri semnate pentru afișare |
| GET `/api/places/photo/:token` | Imagine Google prin backend, fără expunerea cheii |
| POST `/api/trips/:id/itinerary/preview` | Propunere AI validată, fără scriere |
| POST `/api/trips/:id/itinerary/apply` | Aplicarea tranzacțională a tokenului de previzualizare |
| GET `/api/trips/:id/itinerary/pdf` | Descărcare PDF A4 |
| POST `/api/ai/planning-suggestions` | Context/prompt îmbunătățite |
| POST `/api/trips/:id/itinerary` | Programare îmbunătățită, dorințe și rezervări protejate |
| PATCH `/api/entities/Trip/:id` | Acceptă și validează Special wishes |

## Fișiere schimbate

Frontend:

- `src/api/client.js`
- `src/components/planning/StepPreferences.jsx`
- `src/components/planning/StepSuggestions.jsx`
- `src/components/planning/PlacePhotos.jsx` — nou
- `src/components/planning/StepFinalize.jsx`
- `src/components/itinerary/ChangeItineraryDialog.jsx` — nou
- `src/components/itinerary/BookingStatus.jsx` — nou
- `src/components/itinerary/ItineraryDay.jsx`
- `src/components/itinerary/VisitCard.jsx`
- `src/components/trip/TripUI.jsx`
- `src/components/ui/button.jsx`
- `src/pages/Itinerary.jsx`
- `src/index.css`

Backend/configurare:

- `server/app.js`, `server/places.js`, `server/place-enrichment.js` (nou)
- `server/planning-suggestions.js`, `server/itinerary-ai.js`
- `server/itinerary-engine.js`, `server/itinerary-service.js`
- `server/itinerary-changes.js`, `server/itinerary-pdf.js` — noi
- `server/trips.js`, `server/referrals.js`
- `server/schema/Trip.json`, `server/schema.js`, `server/migrate.js`
- `.env.example`, `package.json` — numai comanda de test; fără dependențe noi

Teste/documentație:

- `server/tests/functional-polish.test.js`, `server/tests/polish-integration.mjs` — noi
- `scripts/verify-functional-polish.mjs` — nou, scenariu Chrome cu furnizori reali
- `scripts/smoke-browser.mjs` — denumire nouă și fixture de rezolvare Google
- `docs/FUNCTIONAL_POLISH.md`, `docs/MIGRATION_STATUS.md`, `README.md`

`dist/` este regenerat prin build. Rapoartele, capturile și PDF-urile de test sunt în `.local/functional-polish/` și `.local/pdf-inspection/`. Conturile și excursiile fictive de test sunt eliminate după rulare; excursiile existente nu sunt regenerate automat.

## Testare pentru utilizator

1. Deschide o excursie de minimum trei zile. În Preferences setează orele zilnice și „Keep one afternoon free and avoid early mornings.” în Special wishes. Reîncarcă și verifică păstrarea textului.
2. Deschide Suggestions, generează sugestii, confirmă locațiile ambigue și acceptă cel puțin trei. Deschide o fotografie, schimbă imaginea și închide cu Escape.
3. În Itinerary & tickets apasă Generate/Regenerate itinerary, apoi View full itinerary. Verifică zilele, orele, locurile, sosirea/plecarea și eventualele conflicte reale.
4. În Change itinerary introdu „Move one activity from Day 2 to Day 3 and leave Day 2 afternoon free.” Verifică orele propuse. Cancel păstrează planul; Apply îl salvează. Reîncarcă și verifică rezultatul.
5. Apasă Download PDF și deschide documentul. Verifică toate zilele și lipsa fișierelor private.
6. Pentru un loc cu bilet încărcat în Wallet, verifică Ticket added/View ticket. Linkurile de cumpărare apar numai când există o sursă reală configurată/salvată.

Nu sunt necesare comenzi sau chei noi pe calculatorul actual. Pentru repetarea verificărilor:

```powershell
cd C:\travel
npm.cmd run db:migrate
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
$env:MYSQL_TEST_DATABASE = 'tripsync_test'
npm.cmd run test:integration
npm.cmd run build
node scripts/smoke-browser.mjs --full --mock-providers
```

Cu aplicația locală pornită, `node scripts/verify-functional-polish.mjs` rulează testul real și utilizează Google/OpenAI din configurarea backendului.
