# Etapa 3 — locuri dorite și sugestii AI

Implementată la 23 septembrie 2026. Arhitectura rămâne React + Vite, Express și MySQL. Nu au fost instalate pachete și nu au fost adăugate dependențe Base44.

## Ce funcționează

- În Desired places, sugestiile Google apar după cel puțin două caractere și o pauză de 300 ms. Sunt acceptate mouse-ul și tastele săgeți/Enter/Escape. Căutările vechi sunt anulate.
- Dacă excursia are coordonate, căutarea favorizează împrejurimile destinației într-o rază de 50 km; nu exclude automat rezultate din afara zonei. Pentru destinații introduse manual, include orașul în căutare.
- Selectarea adaugă locul în listă și golește căutarea pentru următorul. Se păstrează numele, adresa formatată în `address`, localitatea, țara, ID-ul Google, coordonatele și categoria disponibilă. Datele care lipsesc rămân nule.
- Add manually funcționează fără Google sau AI. Funcția existentă Research name or link rămâne disponibilă când AI este configurat. Editarea numelui/adresei unui loc Google elimină metadatele geografice vechi, pentru a nu păstra coordonate greșite.
- Suggestions generează opțiuni la deschiderea pasului și permite regenerarea explicită. Erorile sunt vizibile și permit reîncercarea; nu șterg locurile salvate.
- Fiecare card arată numele, motivul recomandării, categoria, zona, durata aproximativă și momentul zilei, când sunt disponibile.
- Accept salvează un loc cu prioritatea `preferred`; Reject salvează `excluded`. Edit permite schimbarea numelui, adresei și duratei. Poți accepta din nou un loc respins. Stările și editările locurilor salvate rămân după reîncărcare; propunerile încă neacceptate/ne-respinse sunt temporare.
- Locurile acceptate pot fi incluse o singură dată în timpul rămas după vizitele obligatorii. Dacă nu încap, motorul raportează un conflict. Locurile respinse nu intră în itinerar. Cerințele necunoscute pentru bilete sunt marcate pentru verificare, nu declarate gratuite.

## Endpointuri

Toate cele trei endpointuri necesită sesiune locală. Cheile rămân în backend; protecția originii, antetul TripSync și limitele de cereri existente sunt păstrate.

| Endpoint | Schimbare |
| --- | --- |
| `POST /api/ai/planning-suggestions` | Nou. Primește numai `trip_id` util; verifică proprietarul și încarcă datele salvate înainte de apelul AI. Prompturile sau listele furnizate suplimentar de browser nu înlocuiesc contextul serverului. |
| `POST /api/places/autocomplete` | Extins cu `bias: { latitude, longitude }` opțional, validat, pentru căutări apropiate de destinație. |
| `POST /api/places/details` | Extins cu `purpose: "place"`; returnează metadatele unui loc și categoria, fără apel suplimentar Time Zone. Comportamentul implicit pentru destinația excursiei este păstrat. |

Salvarea folosește endpointul existent `PUT /api/trips/:id/planning/places`, în tranzacție, cu verificarea proprietarilor. Sugestiile AI au limita existentă de 10 cereri/minut/utilizator; Google are 60. Generarea așteaptă salvările restante, inclusiv respingerile recente.

## Cum este construit promptul

Implementarea este în `server/planning-suggestions.js`.

1. Backendul citește într-o tranzacție excursia, locurile, cazările, transporturile de tip flight și ferestrele zilnice. Tranzacția se încheie înainte de apelul extern.
2. Trimite un context JSON cu destinație/țară/coordonate, date și durată, fus orar, tipul călătoriei și grupului, adulți/copii, camere, bugete/monedă, sosire/plecare, adresele și coordonatele cazărilor, check-in/check-out, locurile deja selectate și rezervările lor orare, ferestrele disponibile și intervalele blocate.
3. Include toate preferințele actuale: interese, excluderi, ritm, transport local, limite de mers zilnic și pe segment, cărucior, mobilitate, mese și marje de timp. Valorile `0` și `false` sunt păstrate. Nu trimite parole, sesiuni, tokenuri de partajare, fișiere private, numere de confirmare sau notițele documentelor.
4. Instrucțiunile cer maximum zece opțiuni reale și specifice, apropiate geografic de cazare/locurile dorite. Excluderile au prioritate față de interese. Modelul trebuie să respecte timpul disponibil, ritmul și mobilitatea, să evite locurile existente inclusiv sub alte denumiri și să prefere mai puține rezultate în loc de recomandări generice.
5. Se folosește modelul deja configurat, Responses API cu `store: false` și JSON Schema strict. Toate câmpurile structurii sunt cerute; informația opțională necunoscută este `null` sau text gol. AJV validează din nou răspunsul pe server. Un răspuns incomplet sau refuzat produce un mesaj de eroare, nu o listă inventată de rezervă.
6. Serverul filtrează suplimentar rezultatul: nume normalizate fără diferențe de majuscule/diacritice/punctuație, sufixe de localitate și aliasurile returnate de AI; apoi elimină duplicatele dintre sugestii. În editor, două ID-uri Google identice indică același loc; două ID-uri diferite pot reprezenta locații distincte cu același nume.
7. Cele patru excluderi din interfață — No museums, No shopping, No difficult trails, No water activities — au filtre suplimentare pe categorie și termeni din nume. Excluderile nominale sunt verificate și textual. Locurile respinse sunt incluse în context și filtrate ca locuri deja existente.

Generarea nu folosește navigare web live. Respectarea semantică a cerințelor libere și recunoașterea tuturor traducerilor posibile depind și de model; filtrele de text nu pot demonstra identitatea universală a locurilor. Programul, accesibilitatea, disponibilitatea biletelor și timpii reali de transport nu sunt verificați live. Duratele și încadrarea în itinerar sunt estimări, iar interfața spune acest lucru.

## Configurare și migrare

Nu există variabile de mediu noi. Sunt reutilizate cele existente, exclusiv în `.env`:

```dotenv
GOOGLE_MAPS_API_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=
```

Nu înlocui valorile OpenAI care funcționează deja. Nu folosi prefixul `VITE_`. Google necesită Places API (New) și facturare activă; Time Zone API rămâne necesar pentru rezolvarea fusului orar pe ecranul inițial. Cheia Google trebuie restricționată la API-urile folosite și, în producție, la IP-ul backendului. Vezi și [PHASE_1.md](PHASE_1.md), inclusiv limitele privind stocarea conținutului Google și politicile necesare publicării.

Migrarea a fost aplicată bazei locale. Este repetabilă și nu șterge înregistrări:

- `place_selections`: opt coloane opționale — `city`, `country`, `lat`, `lng`, `category`, `area`, `best_time_of_day`, `selection_source`.
- `place_selections.place_id` și `trip_items.place_id`: lărgite de la VARCHAR(64) la VARCHAR(255), pentru ID-uri Google lungi.
- Excursiile și locurile vechi continuă să funcționeze fără câmpurile noi.

Pe altă copie a proiectului, sau pentru repornire:

```powershell
cd C:\travel
npm.cmd run db:start
npm.cmd run db:migrate
npm.cmd run dev
```

Dacă aplicația este deja pornită, nu porni o a doua instanță. După schimbarea `.env`, oprește procesul aplicației cu Ctrl+C și pornește-l din nou.

## Testare manuală

1. Deschide o excursie și Plan Visits. Completează destinația, datele, cazarea și preferințele; așteaptă Saved.
2. În Desired places, scrie `Colosseum, Rome`. Cu Google configurat trebuie să apară lista. Selectează rezultatul și verifică numele/adresa. Repetă cu `Trevi Fountain, Rome`: ambele trebuie să rămână în listă după reîncărcare.
3. Selectează din nou Colosseum: apare mesajul că locul există deja, fără un al doilea rând. Verifică și Add manually, care funcționează fără Google.
4. În Preferences, selectează Nature, No museums și un ritm relaxat; completează mersul, transportul și mobilitatea. Intră în Suggestions. Apar cardurile AI sau un mesaj concret de eroare, cu posibilitatea reîncercării.
5. Verifică să nu fie recomandate locurile deja introduse sau muzee. Acceptă o sugestie, respinge alta și modifică durata celei acceptate. Așteaptă Saved, reîncarcă pagina și verifică Accepted/Rejected și durata.
6. Apasă Generate suggestions: locurile acceptate, respinse și dorite nu trebuie să fie repropuse în lista nouă. Cardurile deja salvate rămân vizibile, intenționat.
7. Deschide Itinerary & tickets: sugestia acceptată intră dacă timpul permite; cea respinsă nu apare. Un loc care nu încape produce un conflict, fără să modifice planul obligatoriu pentru a-l forța.

## Verificări efectuate

- `npm.cmd run typecheck`: trece.
- `npm.cmd run lint`: trece.
- `npm.cmd test`: 20 teste trec.
- `npm.cmd run build`: trece; avertismentele existente despre mărimea bundle-ului și două clase Tailwind rămân.
- Integrare pe `tripsync_test`: 3 teste trec, inclusiv proprietari, metadate, context AI salvat, acceptare/editare/respingere, import și funcțiile anterioare.
- Chrome cu furnizori simulați: completare Google, două locuri, prevenirea duplicatelor, excluderea muzeelor, eroare AI + reîncercare, acceptare/editare/respingere, regenerare și reîncărcare. Trece și fluxul anterior: cont, excursie, documente, toate cele șase etape, itinerar, profil, To-Do și partajare anonimă. Fără erori JavaScript sau cereri Base44.
- Un apel real OpenAI, cu o excursie fictivă în Roma: 8 sugestii valide, fără Colosseum/Trevi deja selectate sau categoriile excluse. Nu au fost trimise datele reale ale utilizatorilor pentru această verificare.
- Google real: cheia existentă a returnat cinci rezultate pentru Colosseum, Rome. Place Details a returnat Colosseum, adresa din Roma, țara, ID-ul, coordonatele și categoria `historical_landmark`. Nu s-au scris aceste date fictive de test în excursiile utilizatorului. Time Zone nu a fost reverificat prin acest test.
- Chrome fără furnizori configurați în procesul testului: adăugarea manuală, prevenirea duplicatelor și întregul flux existent trec.

Comenzile de integrare și browser folosesc exclusiv baza separată de test:

```powershell
$env:MYSQL_TEST_DATABASE = 'tripsync_test'
npm.cmd run test:integration
node scripts/smoke-browser.mjs --full --mock-providers
node scripts/smoke-browser.mjs --full
```

Varianta `--mock-providers` nu apelează furnizorii reali și nu consumă credit API. Varianta `--full` dezactivează AI/Google numai în procesul testului, pentru a verifica alternativa manuală.

## Fișiere schimbate

| Grup | Fișiere |
| --- | --- |
| Backend și date | `server/ai.js`, **nou:** `server/planning-suggestions.js`, `server/places.js`, `server/schema.js`, `server/schema/PlaceSelection.json`, `server/migrate.js` |
| Client și interfață | `src/api/client.js`, `src/components/home/DestinationAutocomplete.jsx`, `src/components/planning/StepPlaces.jsx`, `src/components/planning/StepSuggestions.jsx`, `src/components/planning/StepFinalize.jsx`, `src/pages/PlanVisits.jsx` |
| Planificare și duplicate | **nou:** `src/lib/place-matching.js`, `src/lib/planningEngine.js` |
| Teste | **nou:** `server/tests/planning-suggestions.test.js`, `server/tests/http.test.js`, `server/tests/integration.mjs`, `scripts/smoke-browser.mjs` |
| Documentație | **nou:** `docs/PHASE_3.md`, `docs/MIGRATION_STATUS.md`, `README.md` |

Documentație oficială consultată: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Google Autocomplete New](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete), [Google Place Details New](https://developers.google.com/maps/documentation/places/web-service/place-details).
