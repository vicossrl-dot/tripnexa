# Remedieri planificare — 23 septembrie 2026

Aplicația a fost verificată în Chrome pe adresa reală `http://127.0.0.1:5173`, cu backendul de pe 3001 și cheile existente. Nu au fost instalate pachete și nu au fost modificate cheile din `.env`.

## Cauzele găsite

- Procesul vechi al aplicației nu putea efectua apelurile externe. Endpointurile sale Google și OpenAI returnau 502, deși aceleași chei funcționau în apeluri directe dintr-un proces cu acces la rețea. După oprirea arborelui de procese TripSync și repornirea lui cu acces la rețea, aceleași endpointuri au returnat 200. Nu era o eroare de CORS, un endpoint Google depreciat sau o cheie lipsă. Nu a fost necesară modificarea conturilor Google/OpenAI.
- `useCapabilities` păstra permanent primul rezultat de configurare, inclusiv eșecul inițial. Acum reîncearcă la revenirea în fereastră și la 30 de secunde; problemele de conectare sunt afișate separat de lipsa configurării.
- Google era conectat doar la crearea excursiei și Desired places. Destinația din planificator, hotelul și punctele de sosire/plecare erau câmpuri text simple.
- Erorile furnizorilor erau înlocuite cu mesaje generice. Acum backendul jurnalizează serviciul, codul HTTP, codul erorii și identificatorul cererii, când există. Nu jurnalizează chei, antete, documente, prompturi sau răspunsuri private.
- Importul hotelului trimitea doar un prompt AI despre URL și salva imediat rezultatul. Nu exista extragere HTML pe server, import PDF/imagine sau previzualizare cu confirmare.
- Încărcarea accepta numai imagini; nu exista asocierea unui bilet privat cu sosirea sau plecarea.
- Câmpurile native de dată/oră nu apelau `showPicker()` la clic în interiorul câmpului.

## Funcționalitate livrată

Google Autocomplete funcționează la crearea excursiei, în destinația planificatorului, numele și adresa hotelului, sosire, plecare și Desired places. Datele selectate sunt salvate structurat. Căutarea folosește coordonatele destinației sau, dacă lipsesc, numele destinației. Aeroporturile, stațiile, terminalele de feribot și hotelurile folosesc filtre de tip. Rezultatele sunt sugestii geografice, nu o restricție absolută la oraș: utilizatorul alege rezultatul corect. Tastarea manuală rămâne disponibilă și invalidează coordonatele/ID-ul unei selecții modificate.

Clicul oriunde într-un Input de tip date, time sau datetime-local deschide selectorul nativ. Tastatura și editarea manuală rămân disponibile. Pe fundal închis, pictogramele native folosesc tema închisă. Browserul care nu implementează showPicker păstrează comportamentul său nativ.

Biletele PDF, JPG, PNG, GIF și WebP se încarcă privat, maximum 10 MB. Referințele sunt verificate pe server pentru proprietar, inclusiv în salvările în lot. Linkurile sunt disponibile în planificator, pagina excursiei și itinerar. PDF-urile se descarcă; imaginile se pot vedea într-o filă nouă. Partajarea publică nu include fișierele. Înlocuirea unei referințe nu șterge automat fișierul vechi.

Importul hotelului încearcă mai întâi HTML/JSON-LD/metadate publice. Protecțiile includ validarea URL-ului, blocarea adreselor interne, fixarea adreselor DNS validate, reverificarea redirectărilor, limită de dimensiune și timp. Dacă pagina nu oferă date utile, AI poate căuta informații publice despre hotelul exact. Parametrii și fragmentul URL nu sunt trimiși în căutarea AI. Pentru PDF/imagini, backendul trimite conținutul privat către OpenAI numai la apăsarea **Extract reservation details**; nu publică documentul. Sunt folosite Responses API, `store: false` și JSON structurat validat.

Rezultatul apare într-o previzualizare editabilă. **Confirm hotel details** salvează și marchează `confirmed_by_user`; **Discard preview** păstrează datele existente. Un eșec nu marchează rezervarea verificată. O pagină publică nu poate furniza datele sau numărul rezervării personale; aceste câmpuri rămân goale. AI nu garantează că informațiile sunt corecte.

Suggestions folosește modelul existent și contextul salvat: destinație, date, transport, cazare, grup, bugete, interese, excluderi, ritm, mers pe jos, mobilitate/cărucior, pauze, mese și ferestre zilnice. Au fost incluse explicit și sosirea/plecarea. Promptul interzice locurile deja selectate, acceptate sau respinse; filtrele serverului elimină duplicatele și categoriile excluse după validarea JSON. Acceptarea, respingerea și editarea rămân persistente. Documentele private și numerele de confirmare nu sunt incluse în acest context de sugestii.

## Endpointuri

| Endpoint | Schimbare |
| --- | --- |
| `POST /api/places/autocomplete` | Filtru `kind`, context `destination`, diagnostic util |
| `POST /api/places/details` | Reutilizat pentru toate câmpurile; detalii structurate |
| `POST /api/uploads/document` | Nou: PDF și imaginile deja acceptate, autentificare obligatorie |
| `GET /api/uploads/:id` | Acces privat existent reutilizat; PDF ca attachment |
| `POST /api/ai/stay-extraction` | Nou: `{trip_id, url}` sau `{trip_id, file_url}`; întoarce previzualizare, sursă și avertismente |
| `POST /api/ai/planning-suggestions` | Context extins și diagnostic OpenAI real |
| API-urile existente Trip/TripItem/planning | Persistă noile câmpuri și verifică proprietarul fișierelor |

## MySQL și compatibilitate

Migrarea aditivă a fost deja aplicată local. Adaugă 14 coloane opționale în `trips`: pentru fiecare prefix `arrival` și `departure`, câmpurile `_place_id`, `_address`, `_city`, `_country`, `_lat`, `_lng`, `_ticket_url`. Numele rămâne în câmpul existent `_location`.

În `trip_items` adaugă `city`, `country`, `reservation_file_url`. ID-urile Google folosesc maximum 255 de caractere. Modurile de sosire/plecare acceptă acum și `ship`/`bus` în validarea aplicației. Nu există ștergeri de tabele sau rescrierea datelor vechi. Migrarea poate fi rulată repetat. Biletele și coloanele noi goale nu invalidează itinerariile deja salvate.

## Configurare externă

Nu trebuie schimbat nimic pentru cheile testate pe acest calculator. Modelul existent `OPENAI_MODEL=gpt-5.6-terra` a răspuns efectiv la Responses API cu JSON structurat, web search, PDF și imagine. Cheia este încărcată exclusiv de backend. Timeoutul AI rămâne 120 de secunde; Google are 8 secunde per cerere.

Pentru un alt mediu, în fișierul rădăcină `.env`:

```dotenv
GOOGLE_MAPS_API_KEY=cheia_ta_privata_google
OPENAI_API_KEY=cheia_ta_privata_openai
OPENAI_MODEL=gpt-5.6-terra
```

Valorile cheilor de mai sus sunt substituenți; **nu le copia peste cheile funcționale**. Nu există variabile noi obligatorii și nu se folosește nicio cheie `VITE_*`.

În Google Cloud: activează **Places API (New)** și **Time Zone API**, cu billing activ pentru proiect. API restrictions trebuie să permită aceste două API-uri. Pentru cheia folosită de backend, nu utiliza restricții HTTP referrer (website). Pe un server cu adresă de ieșire stabilă, folosește restricții la IP-ul public de ieșire al backendului. Adresa privată `127.0.0.1` nu este IP-ul de ieșire văzut de Google. Maps JavaScript API nu este necesar pentru aceste câmpuri. [Documentația Google Autocomplete](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete) și [tipurile acceptate](https://developers.google.com/maps/documentation/places/web-service/place-types).

Contul OpenAI trebuie să aibă acces la model și credit/quota disponibilă. Pentru un alt model, verifică suportul pentru Responses API, Structured Outputs, web search și intrări PDF/imagine. [PDF inputs](https://developers.openai.com/api/docs/guides/file-inputs), [image inputs](https://developers.openai.com/api/docs/guides/images-vision).

Nu există configurare locală care să garanteze eliminarea blocării Booking. Pentru URL-ul cerut, răspunsul direct a fost HTTP 202, pagină de verificare. Alternativa AI a găsit **ARCELON HOTEL - From 2023**, Carrer de Mallorca 661, Barcelona, și a cerut confirmarea. Rezervarea privată rămâne de importat din PDF/imagine sau completat manual.

Variabile detectate în `.env` (doar nume):

```text
NODE_ENV
HOST
PORT
APP_URL
MYSQL_HOST
MYSQL_PORT
MYSQL_DATABASE
MYSQL_USER
MYSQL_PASSWORD
MYSQL_ROOT_PASSWORD
UPLOAD_DIR
OPENAI_API_KEY
OPENAI_MODEL
OPENAI_IMAGE_MODEL
GOOGLE_MAPS_API_KEY
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASSWORD
SMTP_FROM
TRUST_PROXY
```

## Verificări efectuate

- Typecheck, ESLint, 30 teste unitare/HTTP/import și build Vite: trec. Rămân avertismentele existente despre două clase Tailwind și dimensiunea bundle-ului.
- Integrare pe MySQL real, baza separată `tripsync_test`: 5 teste, inclusiv izolarea biletelor, reutilizarea neautorizată a unui fișier și absența lui din partajarea publică.
- Chrome cu furnizori simulați: regresia fazelor anterioare, autentificare, planificare, eroare/reîncercare AI, acceptare/respingere/editare, itinerar, mutare/înlocuire, referral, redeschidere și partajare publică.
- Chrome pe aplicația reală, fără simularea Google/OpenAI: Tokyo, Barcelona, aeroportul BCN, Hotel Barcelona Universal, Sagrada Família, Park Güell; salvarea datelor și respingerea duplicatelor.
- Google Time Zone real: selecția Barcelona a salvat `Europe/Madrid`.
- Selectoarele pentru sosire, plecare, check-in, check-out, cele două datetime și cele două ore ale hotelului: clic stânga, mijloc, text și pictogramă. Testul a apelat selectorul nativ real din evenimente de mouse Chrome, nu o funcție simulată; capturile arată calendarul deschis.
- URL-ul Booking cerut: blocare directă identificată, alternativa AI a produs o previzualizare explicit neverificată; discard a păstrat cazarea.
- PDF și imagine de rezervare **fictive**, create pentru test: OpenAI a extras hotelul, adresa, datele/orele și `TEST-ONLY-4821`. Înainte de confirmare, hotelul din MySQL a rămas neschimbat; după confirmare, noile date au fost persistate.
- Suggestions real: opțiuni Barcelona fără Sagrada Família/Park Güell deja selectate, fără duplicate și fără categoriile museum/shopping excluse; acceptarea a funcționat.
- Bilet accesibil după reload și din itinerar; acces anonim 401; proiecția publică nu conține linkurile private. Fără excepții JavaScript sau apeluri browser către Base44, Google Places ori OpenAI în fluxul complet testat.

Dovezi locale: `.local/live-planning/report.json`, `ui-report.json` și capturile PNG din același director. Conturile și înregistrările temporare ale verificării live au fost eliminate la final; nu au fost folosite sau șterse excursiile utilizatorului. Fișierele de rezervare fictive rămân în directorul de test pentru reproducere.

## Ce să faci manual

Aplicația este pornită. Deschide `http://127.0.0.1:5173` și reîncarcă pagina cu **Ctrl+F5**. Nu trebuie să înlocuiești cheile sau să rulezi din nou migrarea pe acest calculator.

1. Creează o excursie. Tastează Tokyo sau Barcelona și selectează o sugestie.
2. Deschide Plan Visits. Modifică destinația, alege modul Plane, caută Barcelona airport în sosire și plecare. Salvează un PDF/imagine prin câmpurile de bilet.
3. Apasă în stânga, centru, pe text și pe pictogramă în câmpurile dată/oră; verifică și tastarea manuală.
4. În Stay selectează că ai ales/rezervat cazarea. Caută hotelul sau adresa prin Google. Pentru URL apasă Read. Pentru un fișier: încarcă-l, apoi apasă Extract reservation details. Verifică toate datele; folosește Confirm hotel details sau Discard preview.
5. În Desired places adaugă Sagrada și Park Güell. Încearcă să adaugi din nou același obiectiv: trebuie să fie refuzat ca duplicat.
6. În Preferences selectează interese/excluderi. În Suggestions verifică lista, acceptă, respinge sau editează. Generate suggestions folosește preferințele și respingerile salvate.
7. Reîncarcă pagina și deschide itinerarul/excursia: biletele și rezervarea trebuie să fie disponibile. Un vizitator al linkului public nu trebuie să le vadă.

Pentru pornire ulterioară, dintr-un terminal obișnuit cu acces la internet:

```powershell
cd C:\travel
npm.cmd run db:start
npm.cmd run db:migrate
npm.cmd run dev
```

După schimbarea `.env`, repornește backendul. Nu porni a doua instanță peste porturile deja ocupate. Nu este necesar să rulezi terminalul ca administrator; procesul Node are nevoie de acces la internet pentru furnizori.

Pentru reproducerea verificărilor:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
$env:MYSQL_TEST_DATABASE='tripsync_test'
npm.cmd run test:integration
node scripts/smoke-browser.mjs --full --mock-providers
node scripts/verify-live-planning.mjs --live
# Numai Google și interfața, fără apeluri OpenAI:
node scripts/verify-live-planning.mjs --live --ui-only
```

Comenzile `--live` presupun aplicația pornită pe 5173, folosesc cheile reale și pot consuma quota/credit. Creează propriul cont temporar în baza aplicației și îl elimină la final. Nu sunt executate automat de `npm test`.

## Fișiere schimbate

Frontend:

- `src/api/client.js`
- `src/hooks/use-capabilities.js`
- `src/components/ui/input.jsx`
- `src/components/home/DestinationAutocomplete.jsx`
- `src/components/planning/StepTrip.jsx`
- `src/components/planning/StepStay.jsx`
- `src/components/planning/StepPlaces.jsx`
- `src/components/planning/PrivateFileField.jsx` (nou)
- `src/components/trip/PrivateTravelFiles.jsx` (nou)
- `src/pages/PlanVisits.jsx`
- `src/pages/Dashboard.jsx`
- `src/pages/Itinerary.jsx`

Backend și model:

- `server/places.js`
- `server/ai.js`
- `server/provider-errors.js` (nou)
- `server/hotel-page.js` (nou)
- `server/stay-extraction.js` (nou)
- `server/uploads.js`
- `server/entities.js`
- `server/trips.js`
- `server/schema.js`
- `server/schema/Trip.json`
- `server/schema/TripItem.json`
- `server/migrate.js`
- `server/planning-suggestions.js`
- `server/itinerary-service.js`

Verificări și documentație:

- `server/tests/reservations.test.js` (nou)
- `server/tests/integration.mjs`
- `scripts/verify-live-planning.mjs` (nou)
- `.env.example` (doar comentarii de configurare)
- `docs/PLANNING_FIXES.md` (acest raport)
- `docs/MIGRATION_STATUS.md`

Buildul a regenerat `dist/`. Dovezile de test și logurile procesului repornit sunt în `.local/`, director privat, nepublicat de Vite. Nu există dependențe Base44 noi.
