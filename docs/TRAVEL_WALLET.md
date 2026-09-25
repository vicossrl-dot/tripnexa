# Travel Wallet — documente și bilete

Implementat și verificat local la 23 septembrie 2026. Aplicația păstrează React + Vite, Express, MySQL și autentificarea locală. Nu au fost instalate pachete noi.

## Ce poți folosi

Deschide o excursie → **Travel Wallet** → **Add to Trip**.

- **Flight:** Upload files sau Fill manually. Un singur zbor poate avea biletele mai multor persoane. Formularul include companie, număr zbor, aeroporturi, date/ore, referință și călător; câmpurile sunt opționale.
- **Stay / Hotel:** Upload files, From a link sau Fill manually. Importul hotelului folosește backendul existent și necesită confirmarea previzualizării.
- **Places to visit / Tickets:** aceleași trei metode, cu dată/oră, adresă cu Google Places, referință, călător și note.
- **Documents:** încărcare cu metadate opționale pentru fiecare fișier: titlu, tip, persoană, expirare și note. Nu este pornită extragerea AI pentru această categorie.

Poți selecta mai multe fișiere simultan sau le poți trage în zona de încărcare. Sunt acceptate PDF, JPEG/JPG, PNG, WebP și GIF: maximum 10 MB per fișier, 25 fișiere per selecție și 100 per rezervare. Numerele din taburi reprezintă **fișiere**, nu rezervări.

**View** deschide rezervarea și toate anexele. **View file** deschide imaginea pe tot ecranul sau PDF-ul în vizualizatorul browserului. **Original size** permite inspectarea imaginii la rezoluția originală; comenzile sunt deasupra conținutului, fără suprapunere peste codul de bare. Există și Open in new tab / Download.

**Edit / add files** permite adăugarea, etichetarea și eliminarea individuală. Modificările și eliminările se aplică la Save changes. Adăugarea unui fișier nu înlocuiește celelalte fișiere. Anularea ferestrei păstrează anexele deja salvate.

În itinerar apar View boarding passes, View booking sau View tickets numai dacă există fișiere și o asociere determinabilă: ID de înregistrare, ID de loc sau nume/adresă exactă și dată compatibilă. Nu se ghicesc asocieri după nume aproximative și nu se adaugă scurtături către documente personale. Încărcarea unui bilet nu adaugă automat o vizită obligatorie; selecția locurilor și generarea itinerarului rămân în planificator.

## AI și configurare

Nu sunt necesare variabile de mediu noi. `.env.example` și dependențele nu au necesitat modificări.

Sunt reutilizate variabilele backend existente:

- `OPENAI_API_KEY` și `OPENAI_MODEL`: extragerea opțională a biletelor; modelul trebuie să accepte imaginile/PDF-urile și răspunsurile JSON folosite deja de importul hotelului.
- `GOOGLE_MAPS_API_KEY`: completarea adreselor prin backendul existent.
- Configurația MySQL și stocarea privată existente.

Extragerea pornește numai prin **Extract details for review** și trimite fișierul ales către furnizorul AI prin backend. Promptul cere numai date vizibile, valori goale pentru necunoscute, fără inventarea rezervărilor și fără executarea instrucțiunilor din document. Răspunsul JSON este validat. **Use these details** aplică previzualizarea în formular; **Save** este necesar pentru a salva datele rezervării. Fișierele sunt încărcate privat înainte de acest pas, dar AI nu scrie automat date factuale în excursie.

În lipsa AI sau la eroare, încărcarea și introducerea manuală rămân disponibile. Cheile nu ajung în frontend.

## Baza de date și compatibilitate

Migrarea aditivă din `server/migrate.js` a fost deja aplicată local. Poate fi repetată:

```powershell
cd C:\travel
npm.cmd run db:start
npm.cmd run db:migrate
npm.cmd run dev
```

Dacă aplicația rulează deja, o poți folosi la http://127.0.0.1:5173. Nu porni o a doua instanță pe aceleași porturi.

Schimbările sunt:

- `trip_items`: coloane opționale `airline`, `traveler`.
- `uploads`: `wallet_managed` cu valoare implicită false și index unic `(id, owner_id)`.
- `item_attachments`: `id`, date creare/modificare, `owner_id`, `item_id`, `upload_id`, `original_name`, `label`, `traveler`, `notes`, `document_type`, `expiry_date`. Cheile externe verifică simultan înregistrarea și proprietarul, cu ștergere în cascadă. Perechea `(item_id, upload_id)` este unică.

Fișierele rămân în sistemul de încărcare existent; tabela nouă le asociază rezervărilor fără a le copia. Nu se creează câte un zbor/hotel pentru fiecare fișier.

Categoriile interne `flight`, `stay`, `place`, `document` sunt păstrate. `reservation_file_url` și imaginile private ale documentelor vechi sunt afișate ca anexe virtuale și asociate tabelei noi la editare. Biletele vechi de sosire/plecare ale excursiei apar ca înregistrări virtuale editabile din planificator. Înregistrările fără fișiere rămân vizibile. Nu este necesar un import separat pentru datele existente în baza locală.

## Endpointuri

| Endpoint | Rol |
| --- | --- |
| `GET /api/trips/:tripId/wallet` | Rezervările și metadatele anexelor proprietarului |
| `POST /api/trips/:tripId/wallet/items` | O rezervare nouă cu mai multe anexe, într-o tranzacție |
| `PATCH /api/trips/:tripId/wallet/items/:itemId` | Editare, adăugare și eliminări explicite; anexele omise sunt păstrate |
| `POST /api/uploads/wallet` | Încărcare privată PDF/imagine în infrastructura existentă |
| `GET /api/uploads/:id?view=1` | Vizualizare privată PDF în browser; fără parametru se păstrează descărcarea PDF |
| `POST /api/ai/wallet-extraction` | Extragere pentru zbor sau activitate; categoria document personal este respinsă |

Importul hotelului reutilizează endpointul AI existent. Ștergerile existente pentru Trip/TripItem declanșează și curățarea fișierelor portofelului.

## Securitate și stocare

Toate endpointurile de portofel și fișiere necesită sesiune și verifică proprietarul pe server. Un token de partajare nu oferă acces la fișiere. SQL rămâne parametrizat; protecțiile CSRF și cookie-urile existente sunt păstrate. Răspunsurile nu conțin căi fizice de stocare. Tipul fișierului este verificat după semnătura binară, iar SVG/HTML nu sunt acceptate.

Fișierele sunt servite cu `private, no-store` și `nosniff`. PDF-urile permit afișarea în cadrul aplicației de aceeași origine, cu CSP restrictiv. Proiecția publică nu include anexele, persoanele sau documentele personale. Noua interfață nu generează automat imagini AI din titlurile documentelor.

După eliminarea unei anexe sau a excursiei/rezervării, fișierul fizic este șters numai dacă nu mai este referit de nicio înregistrare. Fișierele încă utilizate sunt păstrate. Fișierele noi încărcate și abandonate fără Save devin eligibile pentru curățarea periodică după 24 de ore. Curățarea verifică referințele și nu șterge global încărcările vechi. La o eroare de disc, ștergerea datelor rămâne salvată, iar curățarea fișierului este reîncercată de procesul periodic.

Stocarea locală **nu adaugă criptare individuală la repaus**. O extensie fără schimbarea fluxului aplicației ar fi criptarea volumului care conține `.local/uploads/`, MySQL și copiile de siguranță. Criptarea individuală a fișierelor ar necesita separat administrarea cheilor, rotație și migrare; nu a fost introdusă în această etapă. Fișierele trebuie salvate în backup împreună cu MySQL. Portofelul necesită acces la server; nu este un mod offline.

## Verificări și testare manuală

Au trecut typecheck, ESLint, 32 teste unitare/HTTP și 9 teste MySQL. Buildul Vite trece; păstrează avertismentele existente despre dimensiunea pachetului și două clase Tailwind. Migrarea este verificată și prin executare repetată în testele MySQL.

Chrome a folosit fișiere fictive încărcate efectiv prin formular și două conturi temporare, eliminate la sfârșit:

1. **A:** patru fișiere la un singur zbor, cu persoane separate.
2. **B:** un PDF și o imagine la același hotel.
3. **C:** trei bilete la o atracție, deschise din Wallet.
4. **D:** trei documente sintetice etichetate pașaport, act de identitate și asigurare; fără apel AI pentru Documents.
5. **E:** acces anonim respins cu 401, acces din alt cont respins cu 404, tokenul public nu deschide fișiere; răspunsul public nu conține anexe sau metadate personale.
6. **F/G:** toate cele 12 fișiere și contoarele rămân corecte după reîncărcare.
7. **H:** imagine cu cod de bare sintetic afișată mare, la rezoluție originală și pe ecran mobil; PDF vizibil în browser. Nu s-a testat scanarea cu un cititor fizic de bilete.
8. Adăugarea unui al cincilea fișier, redenumirea și eliminarea lui păstrează cele patru ID-uri originale.
9. Scurtăturile din itinerar deschid rezervarea asociată. Nu apar erori JavaScript sau apeluri Base44.
10. Două apeluri AI reale, pe un PDF de zbor și o imagine de activitate fictive, au produs previzualizări editabile; datele rezervării nu existau înainte de confirmare și Save.

Regresia Chrome pentru fazele anterioare a trecut cu furnizori simulați: autentificare, creare excursie, autocomplete, planificare, reîncercare AI, duplicate/excluderi, salvare, generare/editare itinerar și partajare publică.

Dovezi: `.local/wallet-browser/report.json`, `.local/wallet-browser/report-live-ai.json` și capturile PNG din același director.

Pentru testare manuală, repetă pașii A–H de mai sus din Travel Wallet, apoi deschide **Edit / add files**, adaugă un fișier, schimbă o etichetă și salvează. Reîncarcă pagina, deschide un fișier și verifică aceeași adresă într-o fereastră fără autentificare. În planificator adaugă atracția la Desired places, generează itinerarul și verifică View tickets. Folosește documente fictive pentru aceste verificări.

Comenzi de verificare:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
$env:MYSQL_TEST_DATABASE='tripsync_test'
npm.cmd run test:integration
npm.cmd run build
node scripts/smoke-browser.mjs --full --mock-providers
# Necesită aplicația locală pornită; creează și elimină numai propriile date de test:
node scripts/verify-wallet.mjs
# Opțional, două extrageri reale pe documente fictive, cu costul furnizorului:
node scripts/verify-wallet.mjs --live-ai
```

## Fișiere schimbate în această etapă

| Fișiere | Schimbare |
| --- | --- |
| `server/schema/TripItem.json`, `server/migrate.js` | Câmpuri opționale și tabela anexelor |
| `server/uploads.js`, `server/file-lifecycle.js` (nou), `server/index.js` | Încărcare, vizualizare PDF și curățare controlată |
| `server/wallet.js` (nou), `server/entities.js`, `server/app.js` | Persistență tranzacțională, proprietari și rutare |
| `server/wallet-extraction.js` (nou), `server/ai.js` | Extragere opțională pe backend |
| `server/itinerary-service.js` | Metadatele persoanei/companiei nu invalidează singure itinerarul existent |
| `src/api/client.js`, `src/App.jsx` | API client și ruta protejată Wallet |
| `src/pages/TravelWallet.jsx` (nou), `src/pages/Dashboard.jsx`, `src/pages/TripDocuments.jsx`, `src/pages/Itinerary.jsx` | Portofel și puncte de acces |
| `src/components/trip/AddItemModal.jsx`, `src/components/trip/categories.js`, `src/components/trip/ItemDetailDialog.jsx` | Fluxurile de adăugare și editare, etichete, acces la anexe |
| `src/components/trip/WalletAttachments.jsx`, `src/components/trip/WalletFileViewer.jsx` (noi) | Metadate per fișier și vizualizare |
| `src/components/trip/LinkAutoFill.jsx`, `src/components/home/DestinationAutocomplete.jsx` | Reutilizarea importului hotelului și variantă vizuală pentru formularul deschis la culoare |
| `src/lib/wallet-links.js` (nou) | Asocieri precise dintre itinerar și rezervări |
| `server/tests/wallet.test.js`, `server/tests/wallet-integration.mjs` (noi), `package.json` | Teste și includerea suitei MySQL Wallet |
| `scripts/browser-driver.mjs`, `scripts/verify-wallet.mjs` (noi) | Verificări Chrome reutilizabile, cu fișiere reale de test |
| `docs/TRAVEL_WALLET.md` (nou), `docs/MIGRATION_STATUS.md` | Instrucțiuni și starea implementării |
