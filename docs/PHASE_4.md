# Etapa 4 — itinerar complet, editare și rezervări

Implementată la 23 septembrie 2026. Arhitectura și autentificarea rămân React/Vite + Express/MySQL. Nu au fost instalate dependențe noi.

## Utilizare

1. Creează/deschide o excursie și intră în Plan Visits.
2. În Trip, completează destinația, datele și tipul călătoriei. Pentru un transfer util, completează Arrival/Departure airport / station / port și orele locale. Zborurile existente din documentele excursiei sunt folosite ca alternativă când se potrivesc primei/ultimei zile.
3. Completează cazarea, ferestrele zilnice și preferințele. Adaugă locurile obligatorii și acceptă sugestiile dorite. Locurile respinse sau excluse nu sunt programate; o contradicție între un loc obligatoriu și o excludere este raportată.
4. În Itinerary & tickets, apasă **Generate itinerary**. Vor apărea Day 1, Day 2 etc., cu vizite, transport, mese, pauze și timp liber.
5. Apasă **View full itinerary**. Fiecare vizită are **Edit / move / replace**. **Back to trips** revine la pagina principală; cardul unei excursii generate deschide itinerarul. Linkul Trip păstrează accesul la dashboard și documente.
6. **Update** redeschide planificarea. Schimbă destinația, cazarea sau preferințele acolo și folosește **Regenerate full itinerary** pentru aplicarea lor. Deschiderea sau reîncărcarea paginii NU regenerează automat un itinerar existent și nu declanșează un apel AI.

## Generare

Backendul citește o imagine consistentă a excursiei, locurilor selectate, cazărilor, transporturilor și ferestrelor zilnice. Nu ține tranzacția MySQL deschisă în timpul cererii OpenAI.

Promptul din `server/itinerary-ai.js` cere o ordine coerentă pe zile, apropiere geografică, plecare/întoarcere la cazarea aplicabilă, timp pentru sosire și plecare, rezervări fixe și evitarea traversărilor inutile ale orașului. Include toate preferințele deja folosite în etapa 3: ritm, grup/copii, interese, excluderi, bugete, cărucior, mobilitate, transport, mers pe jos, mese și marje de timp. Orele de deschidere cunoscute pot orienta o propunere, dar modelul nu trebuie să le declare verificate în timp real.

AI returnează numai ID-uri din lista selectată, ziua, o oră locală preferată opțională și un motiv scurt. JSON Schema și verificările serverului resping ID-uri inventate, duplicate, locuri lipsă, zile în afara excursiei sau schimbarea unei rezervări fixe. Modelul nu furnizează URL-uri de rezervare și nu primește configurația referral.

`server/itinerary-engine.js` construiește programul efectiv:

- câte un grup pentru fiecare zi, inclusiv zile fără vizite;
- locuri obligatorii înaintea celor preferate; fiecare vizită apare cel mult o dată;
- ferestre zilnice și intervale blocate, rezervări fixe și datele excursiei;
- cazarea valabilă în ziua respectivă și transfer între cazări când se schimbă; punctele zilnice personalizate de plecare/întoarcere sunt folosite;
- sosire, formalități și transfer la hotel; transfer spre punctul de plecare și timp estimat pentru îmbarcare când datele există;
- transport între locuri, marje de timp, pauze și o masă când există spațiu;
- ritm relaxat/echilibrat/intens și prioritizarea locurilor apropiate când nu există ordine AI;
- limitele de mers: dacă mersul estimat nu respectă limitele, se folosește o alternativă motorizată. Căruciorul/nevoile de mobilitate determină o alegere conservatoare și pauze mai lungi, fără promisiuni de accesibilitate;
- conflicte explicite pentru locurile care nu încap, excluderi contradictorii, ritm depășit de vizitele obligatorii sau bugetul cunoscut depășit.

Dacă AI nu este configurat, eșuează sau returnează un traseu invalid, generarea locală rămâne disponibilă și interfața explică alternativa folosită. Dacă traseul local păstrează mai multe vizite decât propunerea AI, este ales cel local. Generarea este limitată la 200 de locuri și o perioadă de cel mult un an între date.

Timpii de transport sunt estimări bazate pe coordonate, distanță aproximativă și modul ales; când coordonatele lipsesc se folosesc estimări generale. Nu există rutare live, verificare live a programului, rezervare efectivă sau verificare garantată a accesibilității. Ora de check-in/check-out și logistica exactă trebuie confirmate; transferul la hotel nu confirmă disponibilitatea camerei. Datele/orele introduse în noile câmpuri sunt locale destinației, fără conversie automată din fusul orar de plecare.

## Salvare și editare

Programul complet este salvat în `itinerary_items`, iar versiunea, conflictele și amprenta datelor de intrare sunt păstrate în excursie. Salvarea unui program nou se face într-o singură tranzacție. Dacă planificarea se schimbă în timpul cererii AI, răspunsul nu suprascrie datele noi: endpointul returnează 409 și cere reîncărcarea.

În editor poți schimba numele/adresa, ziua, durata și ora fixă opțională. Schimbarea numelui/adresei înseamnă înlocuirea locului: se elimină vechiul ID Google, coordonatele, datele de bilet și sursa veche. Astfel, linkul de rezervare anterior nu este atașat noului loc.

Se recalculează numai ziua inițială și cea nouă. Rândurile și ID-urile celorlalte zile rămân neschimbate. Ordinea și orele din zilele afectate se pot ajusta pentru a încadra noua vizită. Dacă schimbarea elimină o altă vizită sau noua vizită nu încape, întreaga editare este anulată; utilizatorul poate schimba durata/fereastra sau regenera întregul plan.

Numele/adresa și noua zi sunt salvate și în PlaceSelection, astfel încât regenerarea ulterioară să le cunoască. O oră lăsată goală permite programarea automată; o oră completată devine fixă. Pentru un bilet cumpărat, utilizatorul trebuie să confirme modificarea orei cu furnizorul.

Itinerarele vechi se citesc fără conversie distructivă. La editarea unei vizite vechi, se reutilizează locul selectat cu nume unic sau se creează o asociere locală atunci când aceasta lipsește. Dacă datele de planificare au fost schimbate separat, editorul cere întâi regenerarea pentru a evita combinarea a două versiuni incompatibile.

## Date și migrare

Migrarea a fost aplicată bazei locale și este repetabilă, fără ștergerea înregistrărilor:

| Tabel | Câmpuri noi/operații |
| --- | --- |
| `trips` | `arrival_location`, `arrival_datetime`, `departure_location`, `departure_datetime`, `itinerary_meta`: TEXT opționale |
| `itinerary_items` | `selection_id`: VARCHAR(64), `lat`, `lng`: DOUBLE, toate opționale |
| `itinerary_items` | `place_id` lărgit la VARCHAR(255) pentru ID-uri Google |

`selection_id` este verificat pe server pentru proprietar și aceeași excursie. `itinerary_meta` este scris de serviciul backend, nu de actualizările generice din browser. Câmpurile noi, notițele private și linkurile de rezervare nu sunt incluse în proiecția publică a excursiei.

## Linkuri referral

Variabilă opțională nouă, deja documentată în `.env.example`:

```dotenv
REFERRAL_LINKS_FILE=.local/referrals.json
```

Acesta este și traseul implicit. Fișierul real este privat; nu îl pune în `src/`, `public/` sau `dist/`. Vite blochează directoarele interne, iar Express publică numai buildul și endpointurile autorizate. Nu există un endpoint public pentru administrarea regulilor.

Exemplul de structură este `server/referrals.example.json`. Pentru a pregăti un fișier nou fără suprascriere:

```powershell
if (-not (Test-Path -LiteralPath .local/referrals.json)) {
  Copy-Item -LiteralPath server/referrals.example.json -Destination .local/referrals.json
}
```

Înlocuiește domeniul și linkurile demonstrative cu cele reale, de exemplu:

```json
{
  "allowed_hosts": ["booking.example.com"],
  "rules": [
    {
      "place_id": "ID_GOOGLE_AL_LOCULUI",
      "url": "https://booking.example.com/produsul-exact?affiliate=CODUL_TAU"
    },
    {
      "name": "Numele exact al locului",
      "destination": "Destinația exactă a excursiei",
      "url_template": "https://booking.example.com/search?q={name}&city={destination}&date={date}&affiliate=CODUL_TAU"
    }
  ]
}
```

`booking.example.com` este doar un exemplu, nu o integrare comercială funcțională. Nu au fost inventate sau activate linkuri comerciale în configurația ta.

Regulile se potrivesc prin `place_id`, alternativ `selection_id`, alternativ combinația exactă nume + destinație. Nu sunt utilizate linkuri generale doar pe categorie. Prima regulă validă care corespunde este aleasă. Șabloanele acceptă `{name}`, `{destination}`, `{place_id}`, `{date}`, `{selection_id}`; valorile sunt codificate pentru URL. Pentru cea mai precisă trimitere la un produs, preferă `place_id` + URL exact.

Sunt acceptate numai HTTPS, fără credențiale în URL și numai domeniile enumerate exact în `allowed_hosts`. O regulă invalidă, un câmp lipsă sau lipsa fișierului omit acțiunea. Butonul apare numai pentru vizite cu bilet necesar sau de verificat, nu pentru bilete deja cumpărate ori vizite declarate gratuite.

Browserul primește numai linkul final și eticheta Book / Buy ticket. Codul public de afiliere poate fi vizibil în URL — acesta este necesar urmăririi referral. Nu pune chei API, parole sau alte secrete într-un URL. Configurația întreagă rămâne pe backend. Modificarea fișierului se aplică la următoarea încărcare a itinerarului; schimbarea traseului în `.env` necesită repornirea backendului.

## Endpointuri

- `GET /api/trips/:id/itinerary`: program salvat, zile, versiune, conflicte, stare de actualizare și linkuri finale de rezervare.
- `POST /api/trips/:id/itinerary`: generare; `use_ai: true` activează propunerea AI. Pentru înlocuirea unui program existent este necesar `expected_version` curent.
- `POST /api/trips/:id/itinerary/edit`: `item_id`, `expected_version`, `name`, `address`, `date`, `duration_min`, `start_time` opțional.

Proprietarii, sesiunile, protecția originii și SQL parametrizat sunt păstrate. Generarea are o limită de zece cereri/minut/utilizator.

## Testare completă

1. Creează o excursie de trei zile; completează destinația, tipul train sau plane, cazarea, sosirea și plecarea.
2. Alege un ritm relaxat, limite de mers și durata mesei. Adaugă trei locuri, unul cu zi/oră fixă; acceptă și o sugestie AI.
3. Generează în pasul final. Verifică Day 1–3, ora rezervării fixe, sosirea și transferurile, mesele/pauzele și orice conflict raportat. Locurile excluse nu trebuie programate.
4. Deschide itinerarul, apoi Back to trips. Apasă cardul excursiei: programul trebuie să reapară fără regenerare.
5. Editează o vizită: schimbă ziua și durata. Reîncarcă pagina și verifică salvarea; zilele neafectate trebuie să fie identice.
6. Înlocuiește numele și adresa unei vizite. Vechiul link de rezervare nu trebuie să rămână atașat. Încearcă și o mutare imposibilă: trebuie să apară un mesaj, fără pierderea programului salvat.
7. Configurează o regulă referral reală pentru o vizită cu bilet necesar. Reîncarcă și verifică ținta butonului Book / Buy ticket. Elimină regula: butonul dispare. Nu efectua o cumpărare doar pentru testare.
8. Schimbă destinația/preferințele din Update. Programul existent rămâne vizibil cu avertizarea că datele s-au schimbat. Apasă Regenerate full itinerary pentru înlocuire.
9. Deschide aceeași excursie în două ferestre și editează în prima. O editare din a doua versiune veche trebuie refuzată cu cererea de reîncărcare.

## Verificări efectuate

- Typecheck, ESLint, 24 teste și build: trec.
- Integrare MySQL: 4 teste, inclusiv scenarii de generare/editare, acces între conturi, anularea unei editări imposibile, versiune veche, modificare concurentă în timpul AI, păstrarea zilelor neafectate și editarea unui itinerar vechi.
- Chrome: fluxurile anterioare plus generare, grupare pe zile, referral demonstrativ, închidere, cardul de pe Home, redeschidere, înlocuire/mutare și reîncărcare. Testate cu furnizori simulați și fără AI/Google. Fără erori JavaScript sau cereri Base44.
- Un apel OpenAI real, numai cu date fictive: trei vizite în Roma, repartizate pe trei zile; rezervarea fixă la Colosseum a rămas la ora 11:00; programarea locală nu a raportat conflicte.
- Linkurile comerciale reale nu au fost furnizate/testate. Nu au fost cumpărate bilete. Avertismentele existente ale buildului despre bundle și două clase Tailwind rămân.

Comenzi pentru altă copie a proiectului:

```powershell
npm.cmd run db:start
npm.cmd run db:migrate
npm.cmd run dev
```

Nu porni o a doua instanță dacă aplicația rulează deja. Pentru verificări:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
$env:MYSQL_TEST_DATABASE = 'tripsync_test'
npm.cmd run test:integration
node scripts/smoke-browser.mjs --full --mock-providers
node scripts/smoke-browser.mjs --full
```

## Fișiere schimbate

| Grup | Fișiere |
| --- | --- |
| Generare și salvare | noi: `server/itinerary-ai.js`, `server/itinerary-engine.js`, `server/itinerary-service.js`; modificate: `server/ai.js`, `server/trips.js` |
| Referral | noi: `server/referrals.js`, `server/referrals.example.json`; modificate: `server/config.js`, `.env.example` |
| Date și validare | `server/schema/Trip.json`, `server/schema/ItineraryItem.json`, `server/schema.js`, `server/migrate.js`, `server/entities.js` |
| Interfață | `src/api/client.js`, `src/components/planning/StepTrip.jsx`, `src/components/planning/StepFinalize.jsx`, `src/pages/Itinerary.jsx`, `src/components/itinerary/VisitCard.jsx`, nou: `src/components/itinerary/EditVisitDialog.jsx`, `src/pages/Home.jsx`, `src/components/home/TripBagCard.jsx` |
| Linkuri de navigare | `src/lib/planningEngine.js`: traducerea modurilor locale walk/car/taxi în modurile acceptate de Google Maps |
| Teste | nou: `server/tests/itinerary.test.js`; modificate: `server/tests/integration.mjs`, `scripts/smoke-browser.mjs` |
| Documentație | nou: `docs/PHASE_4.md`; modificate: `docs/MIGRATION_STATUS.md`, `README.md` |

Documentație oficială: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) și [Google Maps URLs](https://developers.google.com/maps/documentation/urls/guide).
