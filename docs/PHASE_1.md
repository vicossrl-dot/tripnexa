# Etapa 1 — crearea și pornirea unei excursii

## Funcționalități finalizate

1. **Destinație cu sugestii Google.** În New Trip, sugestiile apar după minimum două caractere și o pauză de 300 ms. Se pot alege cu mouse-ul sau cu săgețile și Enter; Escape închide lista. La selectare, backendul rezolvă numele, localitatea, țara, adresa, ID-ul Google, coordonatele și, când serviciul răspunde, fusul orar. Datele sunt salvate la crearea excursiei. Dacă sugestiile nu sunt configurate sau un apel eșuează, introducerea manuală funcționează în continuare. Răspunsurile vechi sunt ignorate când utilizatorul schimbă textul. Lista include atribuirea Google Maps.
2. **Trei nume pentru excursie.** Butonul „Surprise me with a spicy name” trimite destinația și tipul călătoriei la backend. OpenAI generează trei nume distincte, de 1–3 cuvinte. Primul se completează automat; celelalte pot fi alese din butoane, iar câmpul rămâne editabil. Backendul validează rezultatul. Dacă AI lipsește, expiră sau returnează un răspuns invalid, apar trei idei simple, marcate explicit ca alternativă fără AI. Alte erori permit în continuare completarea manuală.
3. **Tipul călătoriei.** Plane, Car, Train, Ship, Bus și Mixed / Other sunt disponibile în New Trip și în primul pas al planificării. Câmpul este opțional pentru compatibilitate cu excursiile vechi. Este separat de trip_type (componența grupului), arrival_mode și transport_preference; acestea își păstrează rolul.
4. **Fundaluri locale.** Desktopul și mobilul folosesc șapte ilustrații SVG originale din public/media/travel/, cu estompare și strat întunecat. Există câte un fișier pentru fiecare opțiune și unul implicit. Imaginile utilizatorului din galerie rămân disponibile în prim-plan. Nu se descarcă imagini de fundal de la un serviciu extern.
5. **Plan your trip.** Excursiile fără itinerar au un card către ruta existentă /trip/:tripId/plan. Cardul nu deschide formularul de documente. „Add to Trip” și documentele rămân disponibile separat. După construirea itinerarului, cardul inițial de planificare dispare.

## Configurare

Singura variabilă nouă este:

```dotenv
GOOGLE_MAPS_API_KEY=
```

Adaug-o în fișierul local .env. Codul nu modifică automat cheile tale. Pentru nume sunt reutilizate OPENAI_API_KEY și OPENAI_MODEL; modelul text trebuie să accepte Responses API și Structured Outputs. OPENAI_IMAGE_MODEL nu este necesar pentru nume sau fundalurile acestei etape.

În Google Cloud:

1. Selectează un proiect cu facturare activată.
2. Activează **Places API (New)** pentru Autocomplete și Place Details.
3. Activează **Time Zone API** pentru fusul orar. Dacă acest serviciu eșuează, destinația se poate salva cu timezone necompletat și se poate completa ulterior.
4. Creează o cheie și limiteaz-o la aceste două API-uri. Pentru producție, limitează accesul și la IP-ul public de ieșire al backendului. Restricția HTTP referrer nu este potrivită acestor apeluri de server.
5. Configurează limite de utilizare și repornește Express după completarea .env. Serviciile Google și OpenAI pot fi facturate de furnizor.

**Nu este necesară o cheie publică în frontend și nici Maps JavaScript API.** Nu crea VITE_GOOGLE_MAPS_API_KEY sau VITE_OPENAI_API_KEY. Browserul contactează numai endpointurile locale pentru aceste funcționalități. Cheia Google și cheia OpenAI sunt trimise furnizorilor doar de Express.

Sunt folosite endpointuri fixe, autentificare locală, protecția existentă a cererilor și limite per utilizator: 60 de cereri Places/minut și 10 cereri AI/minut. Se cer doar câmpurile Google necesare, cu același token de sesiune între căutare și alegere. Nu se păstrează listele de predicții; la confirmare sunt salvate câmpurile excursiei cerute în această etapă.

Pentru publicarea integrării Google, pregătește paginile publice de termeni și confidențialitate cerute de Google și verifică regulile aplicabile contului tău pentru stocarea datelor Places; place_id are un regim diferit față de restul conținutului. Această etapă nu creează texte juridice sau un mecanism de retenție pentru datele Google. Referință: [politicile Places](https://developers.google.com/maps/documentation/places/web-service/policies).

## Migrarea MySQL și pornirea

Din C:\travel, în PowerShell:

```powershell
npm.cmd run db:start
npm.cmd run db:migrate
npm.cmd run dev
```

Dacă dev rulează deja, oprește-l cu Ctrl+C și repornește-l după configurarea cheilor. Nu porni o a doua instanță pe aceleași porturi. Pentru producție, rulează npm.cmd run build înainte de npm.cmd start.

Migrarea a fost deja aplicată în instanța locală de lucru. Pentru alte baze, db:migrate adaugă în trips numai coloanele lipsă, toate acceptând NULL:

- destination_city și destination_formatted_address: TEXT;
- destination_place_id: VARCHAR(255);
- destination_latitude și destination_longitude: DOUBLE;
- travel_type: TEXT, cu valori validate de API.

destination păstrează numele afișat. country și timezone existau deja. Nu se șterg sau rescriu excursiile existente. Comanda poate fi repetată. Dacă o destinație aleasă din Google este schimbată manual în primul pas al planificării, metadatele vechi sunt golite pentru a evita coordonate sau un fus orar pentru alt loc.

Nu sunt necesare pachete npm suplimentare pentru această etapă.

## Cum testezi în interfață

1. **Destinație:** autentifică-te, deschide New Trip și scrie Rome. Cu Google configurat, alege o sugestie și verifică confirmarea. Creează excursia, deschide Plan Visits și verifică destinația, țara și fusul orar. Fără cheie Google, verifică dacă poți salva un text introdus manual. Localitatea, adresa, ID-ul și coordonatele sunt disponibile în răspunsul API autentificat pentru excursie.
2. **Nume:** după destinație, apasă „Surprise me with a spicy name”. Verifică cele trei variante, completarea primeia, selectarea celei de-a doua și editarea manuală. Dacă AI nu răspunde, mesajul identifică explicit ideile simple de rezervă.
3. **Transport:** selectează Train, creează excursia și verifică aceeași valoare în primul pas. Schimbă în Car, așteaptă Saved, apoi revino în dashboard. Testează și o excursie fără valoare.
4. **Fundal:** verifică fundalurile pentru cele șase opțiuni și pentru lipsa unei selecții. Imaginile sunt fișiere locale SVG, nu fotografii descărcate și nici imagini generate contra cost.
5. **Prima acțiune:** într-o excursie fără itinerar, apasă cardul „Plan your trip”. Trebuie să ajungi în planificarea existentă, fără un popup de documente. „Add to Trip” trebuie să deschidă în continuare formularul existent.
6. **Regresie:** continuă cei șase pași, construiește itinerarul și verifică documentele, profilul și partajarea.

## Verificări automate

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
$env:MYSQL_TEST_DATABASE = "tripsync_test"
npm.cmd run test:integration
node scripts/smoke-browser.mjs --full
node scripts/smoke-browser.mjs --full --mock-providers
```

Cele două verificări complete în Chrome folosesc baza separată de test și nu apelează servicii plătite. Prima verifică alternativele fără chei; a doua simulează răspunsurile furnizorilor numai în procesul de test, păstrând endpointurile reale ale aplicației și salvarea în MySQL. Nu există un comutator de simulare în aplicația publicată.

Testele acoperă și autentificarea endpointurilor noi, parametri invalizi, erori Google, lipsa fusului orar, protejarea cheilor, răspunsuri AI invalide, trei nume scurte, salvarea noilor câmpuri și repetarea migrării. Capturile sunt în .local/browser-smoke/phase-one-entry.png, phase-one-dashboard.png și phase-one-mobile.png.

Un apel real OpenAI cu cheia existentă a returnat trei nume valide: „Roman Rail Escape”, „Eternal City Express”, „Rome by Rail”. Google nu a fost testat cu o cheie reală, deoarece GOOGLE_MAPS_API_KEY nu este configurată. Activarea API-urilor și facturării Google trebuie confirmată după adăugarea cheii.

## Fișiere schimbate în această etapă

| Zonă | Fișiere |
| --- | --- |
| Configurare și bază de date | .env.example; server/config.js; server/schema/Trip.json; server/schema.js; server/migrate.js |
| API | server/app.js; server/places.js (nou); server/ai.js; src/api/client.js; src/hooks/use-capabilities.js |
| Formular și planificare | src/components/home/NewTripDialog.jsx; src/components/home/DestinationAutocomplete.jsx (nou); src/components/trip/TravelTypeField.jsx (nou); src/components/planning/StepTrip.jsx; src/pages/PlanVisits.jsx |
| Dashboard | src/pages/Dashboard.jsx; src/components/trip/DestinationHero.jsx; src/components/trip/mobile/MobileTripHero.jsx; src/components/trip/PlanTripCard.jsx (nou); src/components/trip/TravelBackground.jsx (nou); src/lib/travel-types.js (nou) |
| Imagini locale noi | public/media/travel/plane.svg; car.svg; train.svg; ship.svg; bus.svg; mixed.svg; default.svg |
| Teste | server/tests/http.test.js; server/tests/integration.mjs; server/tests/phase-one.test.js (nou); scripts/smoke-browser.mjs |
| Documentație | README.md; docs/MIGRATION_STATUS.md; docs/PHASE_1.md (nou) |

## Referințe de implementare

- [Google Autocomplete (New)](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete)
- [Google Place Details (New)](https://developers.google.com/maps/documentation/places/web-service/place-details)
- [Google Time Zone API](https://developers.google.com/maps/documentation/timezone/requests-timezone)
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs): numele sunt texte simple într-un obiect JSON, pentru validarea sigură a celor trei variante.
