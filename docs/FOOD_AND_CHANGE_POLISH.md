# Change Itinerary și Food & Dining — 24 septembrie 2026

## Ce s-a implementat

Dialogul **Change itinerary** citește lista `unscheduledSelected` de pe backend. Lista folosește selecțiile și itinerarul salvat, completate cu motivele din `itinerary_meta.unscheduled_optional`; nu este dedusă de frontend. Sunt afișate **Must-see** și **Preferred**, într-o secțiune pliabilă cu înălțime limitată. Dacă lista este goală, secțiunea dispare.

**Add to request** adaugă o instrucțiune după textul existent, fără suprascriere sau duplicarea aceleiași instrucțiuni. **Try to include all** adaugă locurile în ordinea priorității. Limita de 4.000 de caractere este păstrată; când cererea nu încape, textul existent rămâne și utilizatorul primește un mesaj. Nicio acțiune nu regenerează direct: se păstrează Preview → Apply/Cancel.

Promptul pentru schimbări primește și lista neprogramată, ID-urile, originea și prioritatea. Protejează datele excursiei, sosirea/plecarea, rezervările, cazările, blocajele și accesibilitatea; apoi locurile dorite obligatorii. Cererea curentă și Special wishes influențează schimbarea, iar sugestiile opționale pot fi înlocuite prin acțiuni explicite vizibile în previzualizare. Backendul continuă să verifice excluderile, fezabilitatea și rezervările. Un avertisment vechi pentru un loc obligatoriu este eliminat când acel loc este efectiv reintrodus.

## Preferințe și baza de date

În **Update Plan → Preferences → Food & Dining** există:

- **Cuisine preferences**: selecție multiplă cu cele 11 categorii cerute și Any cuisine. Lipsa selecției înseamnă orice bucătărie.
- **Dining budget**: Budget-friendly, Moderate, Premium sau Any, separat de bucătărie.
- **Dietary needs**: text opțional, maximum 1.000 de caractere.

Migrare aditivă, deja aplicată local și bazei de test:

| Tabel | Coloană | Reprezentare |
|---|---|---|
| trips | food_preferences | TEXT NULL cu listă JSON validată |
| trips | dining_budget | TEXT NULL, valori validate |
| trips | dietary_notes | TEXT NULL |
| itinerary_items | meal_choice | TEXT NULL cu alegerea validată pe backend |

Structura urmează convenția existentă a proiectului pentru JSON în câmpuri text. Nu s-au eliminat date și nu s-au adăugat pachete. Câmpurile nule nu invalidează hash-ul de planificare al excursiilor vechi. Actualizarea generică a unei entități nu poate injecta `meal_choice`; alegerea trece prin endpointul dedicat și rezultatele Google validate.

## Auditul preferințelor

Suggestions, generarea/regenerarea itinerarului și Change itinerary primesc: interese, excluderi, ritm, transport, mers pe jos, durata mesei, cărucior, mobilitate, ore zilnice, blocaje, Special wishes și cele trei câmpuri alimentare noi.

Motorul local aplică numeric orele, blocajele, ritmul, durata meselor, bufferele și limitele de mers; ține cont de geografie, interese și excluderile structurate. Căruciorul și mobilitatea influențează alegerea transportului și pauzele. Interpretarea dorințelor scrise liber aparține AI-ului, inclusiv intervalele preferate propuse de acesta. Alternativa locală nu promite că interpretează orice propoziție din Special wishes. Preferințele culinare sunt aplicate direct de căutarea meselor chiar dacă itinerarul a fost generat local.

## Cum se găsesc restaurantele

**View meal options** există pentru mesele din itinerarul privat și din pasul final al planificării. Nu se fac căutări de restaurante la încărcarea paginii.

Backendul determină locul mesei din datele salvate: poziția cunoscută a mesei când aceasta corespunde unui loc/cazări existente, activitatea imediat anterioară, apoi cea următoare, cazarea valabilă în ziua respectivă și, numai în lipsa lor, coordonatele destinației. Astfel, o masă după întoarcerea la hotel nu folosește din greșeală coordonatele unei vizite anterioare. Fără coordonate utilizabile, aplicația cere confirmarea locației în loc să inventeze rezultate.

Se folosește **Google Places API (New), Text Search** prin backend, cu câmpuri explicite, filtru restaurant, căutare orientată pe bucătăriile alese și niveluri de preț. Mai multe bucătării sunt grupate în maximum trei cereri per căutare. Rezultatele sunt deduplicate după ID și limitate la cinci.

Rezultatele îndepărtate sunt eliminate: maximum 1.500 m în linie dreaptă față de punctul mesei, redus la 1.000 m când există cărucior/nevoi de mobilitate. Clasarea combină compatibilitatea culinară, distanța, ocolul estimat între activitățile vecine și calitatea recenziilor. Ratingul este ponderat cu 100 de recenzii de referință la 4,0: astfel, 5,0 din trei recenzii nu câștigă automat în fața a 4,8 din mii de recenzii.

Dietary needs intră în căutare; când Google indică explicit lipsa opțiunilor vegetariene, rezultatul este eliminat pentru o cerere vegetariană/vegană. Acest lucru nu certifică meniul, lipsa alergenilor sau accesibilitatea. Aplicația afișează această limită și nu inventează afirmații despre preparate. Nu se folosește OpenAI pentru identitatea sau ratingul restaurantelor.

Numele, adresa, coordonatele, categoria, ratingul, numărul recenziilor și nivelul de preț provin din Google când sunt disponibile. Linkurile folosesc URI-ul Google sau ID-ul exact al restaurantului. Fotografiile reutilizează integrarea existentă, cu o imagine mică per card și atribuire; nu sunt salvate local.

Rezultatele sunt păstrate temporar în memoria backendului, maximum 10 minute și 200 de contexte. Cheia include utilizatorul, excursia, masa, orele, zona și preferințele relevante. Alegerea unui restaurant nu forțează o nouă căutare pentru același context. **Refresh options** solicită rezultate noi. Repornirea backendului golește această memorie.

Implementarea folosește parametrii documentați pentru [Text Search (New)](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places/searchText). Atribuirea Google și a fotografiilor este păstrată conform [politicilor Places](https://developers.google.com/maps/documentation/places/web-service/policies).

## Alegerea, modificarea itinerarului și partajarea

**Choose for this meal** salvează restaurantul și un instantaneu al informațiilor afișate, păstrând orele și durata mesei. Nu marchează masa ca rezervare cumpărată sau blocată. Backendul verifică proprietarul, tokenul rezultatului Google, expirarea și revizia itinerarului înainte de scrierea tranzacțională.

La editare/regenerare, alegerea se păstrează pentru masa corespunzătoare din aceeași zi. O deplasare a zonei cu peste 800 m, schimbarea orei sau a preferințelor o marchează pentru verificare. Restaurantul nu este înlocuit automat. Dacă masa dispare, alegerea este păstrată în metadate și afișată sub **Saved restaurants to review**.

Selectarea restaurantului nu adaugă automat transferuri suplimentare și nu verifică traseul rutier real sau orarul de deschidere la data viitoare. Distanțele sunt estimări geografice; verificarea programului, rezervărilor și a accesibilității rămâne necesară.

În partajarea publică poate apărea restaurantul ales, categoria, adresa și linkul. Notele alimentare, preferințele private și metadatele interne nu sunt publicate. Dacă este activată ascunderea cazării, se păstrează regula existentă care ascunde și locațiile meselor. Documentele Travel Wallet nu sunt implicate.

## PDF

O masă fără restaurant rămâne **Meal break**. O masă aleasă apare cu numele restaurantului, categoria și adresa. Lista alternativelor, fotografiile, notele alimentare private și diagnosticele nu sunt tipărite. Exportul existent rămâne autentificat.

PDF-ul descărcat în testul real a fost deschis în Chrome și inspectat pe toate cele cinci pagini. **Trattoria Buoni Amici** apare la masa aleasă; celelalte patru recomandări nu apar ca alternative în document.

## Endpointuri

| Endpoint | Comportament |
|---|---|
| GET `/api/trips/:id/itinerary` | Include lista backend de locuri neprogramate și restaurantele de verificat |
| POST `/api/trips/:id/itinerary/preview` | Primește contextul complet și prioritizează locurile dorite |
| POST `/api/trips/:id/meals/:meal/options` | Caută la cerere; acceptă `refresh: true` |
| POST `/api/trips/:id/meals/:meal/choice` | Salvează un rezultat din tokenul de căutare |
| GET `/api/trips/:id/itinerary/pdf` | Include numai restaurantul ales |

Noile endpointuri păstrează autentificarea, controlul proprietarului, protecția cererilor și limitarea frecvenței. Cheile rămân exclusiv pe backend.

## Verificări și dovezi

- Typecheck, ESLint, 52 teste unitare/HTTP și 11 teste MySQL trec.
- Buildul Vite trece; rămân avertismentele existente despre două clase Tailwind și dimensiunea bundle-ului.
- Regresia Chrome pentru autentificare, cele șase etape, sugestii, editare, referral și partajare trece.
- Chrome real a testat o excursie fictivă de trei zile, cu două locuri dorite fezabile, un loc dorit imposibil în ziua sosirii și opt sugestii acceptate. Dialogul a afișat ambele priorități; Add to request a păstrat textul. OpenAI real a produs o previzualizare aplicabilă, apoi locul reintrodus s-a păstrat după reload.
- Google real a returnat cinci restaurante apropiate pentru o masă: Trattoria Buoni Amici, Trattoria Adagio, Faruno, Bellini Garden și Vatra, la aproximativ 237–505 m. Au fost afișate ratingurile, recenziile, prețurile disponibile, adresele, fotografiile și linkurile exacte.
- Schimbarea Local / Traditional → Italian a modificat efectiv lista. Preferințele au fost salvate prin formular și verificate după reload. Alegerea restaurantului a păstrat orele mesei și s-a salvat în MySQL.
- Testele automate acoperă și eșecul Google fără modificarea itinerarului, accesul altui cont, date expirate, cache-ul, păstrarea alegerii la regenerare și confidențialitatea partajării.

Dovezi locale: `.local/dining-verification/report.json`, capturile din același director și `.local/dining-pdf-inspection/`. Testul real folosește un server local izolat cu buildul aplicației și configurarea reală Google/OpenAI; contul fictiv este eliminat la final. Excursiile existente nu sunt modificate.

## Fișiere schimbate

- Module noi backend: `server/meal-context.js`, `server/meal-options.js`.
- Backend existent: `server/app.js`, `server/schema.js`, `server/migrate.js`, `server/schema/Trip.json`, `server/schema/ItineraryItem.json`, `server/planning-suggestions.js`, `server/itinerary-ai.js`, `server/itinerary-changes.js`, `server/itinerary-service.js`, `server/itinerary-pdf.js`, `server/trips.js`.
- Frontend nou: `src/lib/dining.js`, `src/components/planning/FoodPreferences.jsx`, `src/components/itinerary/MealOptionsDialog.jsx`, `MealDetails.jsx`, `MealReviewNotice.jsx`.
- Frontend existent: `src/api/client.js`, `src/components/planning/StepPreferences.jsx`, `StepFinalize.jsx`, `PlacePhotos.jsx`, `src/components/itinerary/ChangeItineraryDialog.jsx`, `ItineraryDay.jsx`, `src/pages/Itinerary.jsx`, `PublicTrip.jsx`.
- Teste/comenzi: `server/tests/dining.test.js`, `server/tests/dining-integration.mjs`, `scripts/verify-dining.mjs`, `package.json` (script de test, fără dependențe noi).
- Documentație: acest raport, `docs/MIGRATION_STATUS.md`, `README.md`. `dist/` este regenerat prin build.

## Configurare și testare manuală

**Configurare suplimentară pe calculatorul actual: niciuna.** Cheia existentă a funcționat pentru Places API (New), Text Search, Place Details și Place Photos. Nu există cheie frontend nouă sau variabilă nouă de mediu. Pe un alt server, `GOOGLE_MAPS_API_KEY` trebuie să permită aceste operații, cu billing activ și restricții potrivite backendului; configurarea OpenAI existentă rămâne necesară pentru Preview changes.

Migrarea locală este deja aplicată. Reîncarcă aplicația, apoi:

1. Preferences → Food & Dining: selectează bucătăriile, bugetul și eventualele nevoi alimentare. Reîncarcă pentru verificarea salvării.
2. Deschide un itinerar cu locuri selectate neprogramate. Change itinerary → extinde lista → Add to request. Scrie înainte o propoziție proprie și verifică păstrarea ei. Preview changes → verifică programul → Apply changes.
3. La o masă, View meal options. Verifică zona afișată, ratingurile și linkurile. Choose for this meal → reîncarcă → Change restaurant.
4. Schimbă bucătăria preferată și redeschide opțiunile. Verifică rezultatele noi.
5. Download PDF: restaurantul ales trebuie să apară, alternativele nu.

Pentru altă instanță: `npm.cmd run db:migrate`, apoi `npm.cmd run dev`. Pentru verificări:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
$env:MYSQL_TEST_DATABASE = 'tripsync_test'
npm.cmd run test:integration
npm.cmd run build
node scripts/smoke-browser.mjs --full --mock-providers
```

`node scripts/verify-dining.mjs` testează fluxul cu Google/OpenAI reale și poate genera costuri normale ale acestor API-uri. Această etapă rămâne locală; aplicația nu a fost publicată.
