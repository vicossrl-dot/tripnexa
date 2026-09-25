# Redesignul experienței unei excursii

Implementare UI/UX din 23 septembrie 2026. Capturile furnizate au fost tratate ca interfața de înlocuit. Identitatea TripSync este păstrată: fundal închis, accent piersică/coral, fonturile existente și fundaluri locale după tipul călătoriei.

## Cele patru zone

| Zonă | Ce găsești | Rută păstrată |
| --- | --- | --- |
| Overview | Rezumat, acțiuni următoare, toate zilele și scurtături semantice | `/trip/:id` |
| Update Plan | Cele șase etape existente, salvare și generare explicită | `/trip/:id/plan` |
| Itinerary | Program pe zile, trasee, bilete asociate și editare | `/trip/:id/itinerary` |
| Travel Wallet | Rezervări și toate fișierele private | `/trip/:id/wallet` |

Navigarea comună indică pagina activă și include accesul la excursii și Share. Pe telefon folosește patru controale compacte. Antetul rămâne vizibil la derulare.

### Overview

Hero cu titlu, destinație/localitate, țară, date, durată, persoane disponibile și stare derivată din plan. Nu se inventează date lipsă. Cardurile rezumă datele, cazarea, locurile selectate/sugestiile acceptate și numărul fișierelor. What's next folosește validarea existentă și starea reală a itinerarului, cu maximum cinci acțiuni.

Trip at a glance reprezintă fiecare zi, inclusiv zilele fără vizite. Combină datele excursiei și zilele salvate în itinerar, astfel încât un plan mai vechi să nu dispară dacă datele au fost schimbate. Starea Changes pending indică necesitatea regenerării explicite. Rezumatul nu transformă pauzele de acces la o atracție în check-in fictiv la hotel.

Quick access conține Stay / Hotel, Flights, Tickets, Documents și Desired Places. Numele fișierelor nu mai sunt scurtături principale. Cardul cazării deschide direct înregistrarea din Wallet. Vechiul afișaj parțial pe baza documentelor a fost înlocuit; modul Canvas rămâne disponibil ca opțiune secundară în Wallet.

### Update Plan

Aceleași șase componente și aceeași logică de salvare. Desktop: meniu lateral și formular cu lățime limitată. Mobil: pași derulabili, cu pasul curent adus în zona vizibilă. Completarea se bazează pe informațiile disponibile, nu doar pe faptul că un pas a fost vizitat. Saved / Saving / Changes not saved reflectă salvarea reală.

Butonul principal este Save & continue; în ultimul pas, View itinerary. Detaliile lipsă sunt grupate pe înregistrare, cu pictogramă și acțiune Complete. Informațiile obligatorii și îmbunătățirile opționale sunt separate. Listele opționale lungi pot fi restrânse. Generate itinerary / Regenerate itinerary rămân acțiuni explicite.

Deschiderea planificatorului pregătește în memorie ferestrele zilnice lipsă; nu le scrie automat în MySQL. Salvarea lor are loc la interacțiunea explicită cu planificatorul. Navigarea comună și deschiderea Share așteaptă finalizarea modificărilor în curs.

### Itinerary

Selector All days / Day 1… pe desktop și mobil; fiecare zi poate fi deschisă direct din Overview. Date prietenoase, rezumat pe zi, vizite și sosiri mai proeminente, transferuri distincte și pauze/timp liber mai discrete. Rutele Google Maps și linkurile de rezervare sunt păstrate. Explicația estimărilor este concentrată într-o notă comună; detaliile transferului sunt disponibile la cerere.

Edit / move / replace rămâne o acțiune secundară. Done, Skip și întârzierile sunt în During your visit. Editarea folosește dialogul și API-ul existente. View boarding passes / View booking / View tickets deschid numai înregistrările asociate, prin Wallet.

### Travel Wallet și Add to Trip

Taburi cu număr de fișiere, carduri în aceeași identitate vizuală, titluri din metadatele existente și indicator Private. Pentru un zbor cu aeroporturi cunoscute, ruta înlocuiește numele fișierului ca titlu de card. Dacă nu există metadate, numele original rămâne disponibil.

Detaliile arată anexele, miniaturi de imagine, persoana, eticheta și numele fișierului. PDF-ul, imaginea mare și descărcarea folosesc infrastructura privată existentă. Imaginea originală a unei rezervări vechi poate fi în continuare înlocuită explicit. Linkul sursă este etichetat View booking source.

Modalul păstrează metodele relevante fiecărei categorii. Conținutul derulează în interior, iar Save rămâne în subsolul vizibil. Eliminarea unei anexe cere confirmare și se aplică numai la salvare. Adăugarea altor fișiere nu înlocuiește anexele existente. Previzualizarea AI și confirmarea ei sunt păstrate.

Vechea rută `/trip/:id/documents` redirecționează către Wallet / Documents. Linkurile existente continuă să deschidă documentele, fără o a doua interfață separată.

## Eliminat din locurile nepotrivite

- Bannerul Private tickets & reservations și linkurile globale Arrival ticket / View-download de pe Overview și Itinerary.
- Lista de nume brute de fișiere din Quick Links.
- Timeline-ul parțial al documentelor de pe Overview.
- Repetarea avertismentului lung în fiecare card de transport.
- Butoanele de operații zilnice care concurau vizual cu conținutul principal.

Niciun fișier privat nu a fost șters prin acest redesign. Componentele vechi nefolosite nu sunt încărcate de noile pagini; nu a fost necesară ștergerea lor din proiect.

## Backend, bază de date și configurare

**Nicio schimbare de backend, API, schemă sau migrare. Nicio variabilă nouă. Niciun pachet instalat.** Cheile, verificările proprietarului, partajarea și încărcările rămân pe infrastructura existentă. Nu au fost efectuate apeluri AI plătite pentru acest redesign.

Aplicația locală: http://127.0.0.1:5173. Dacă este deja pornită, reîncarcă pagina. Pentru pornire:

```powershell
cd C:\travel
npm.cmd run db:start
npm.cmd run dev
```

## Testare și dovezi

- Typecheck și ESLint: trec fără erori.
- 34 teste unitare/HTTP: trec, inclusiv acoperirea tuturor zilelor, metadatele semantice și evitarea unui check-in inventat.
- 9 teste MySQL: trec, inclusiv izolarea conturilor, persistența și fișierele private.
- Build Vite: trece. Avertismentele existente despre dimensiunea bundle-ului și două clase Tailwind rămân.
- Chrome: regresia autentificării, Google Places/AI cu furnizori simulați, salvare, generare, linkuri comerciale, mutare/înlocuire, păstrarea zilelor neafectate și partajare publică.
- Chrome Wallet: încărcarea efectivă a 12 fișiere fictive, PDF, imagini, etichete, adăugare/eliminare individuală, reîncărcare, scurtături și refuzul accesului anonim/din alt cont.
- Chrome redesign: excursie persistentă de **cinci zile**, la **2560×1440**, **1366×1000** și **390×844**. Toate cele patru pagini au fost capturate și inspectate vizual. S-au verificat cele cinci zile, filtrele pe zi, numerele fișierelor, navigarea Back/Forward, reîncărcarea și modalul mobil.
- Comparație MySQL înainte/după deschiderea tuturor paginilor: nicio modificare în excursie, înregistrări, locuri, ferestre zilnice, itinerar sau anexe. Datele reale ale utilizatorului nu au fost folosite ca date de test; conturile și fișierele fictive sunt curățate de scripturi.

Dovezile locale sunt în `.local/trip-redesign/` (report.json și capturi), `.local/wallet-browser/` și `.local/browser-smoke/`.

Comenzi reproductibile:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
$env:MYSQL_TEST_DATABASE='tripsync_test'
npm.cmd run test:integration
npm.cmd run build
node scripts/smoke-browser.mjs --full --mock-providers
# Următoarele două folosesc aplicația locală pornită, cu conturi temporare proprii:
node scripts/verify-trip-redesign.mjs
node scripts/verify-wallet.mjs
```

Pentru verificare manuală: deschide o excursie de minimum cinci zile; verifică Overview, apasă Day 3, apoi All days. Deschide Update Plan, modifică o preferință și așteaptă Saved; revenirea la itinerar trebuie să păstreze programul până la regenerare explicită. În Wallet, verifică taburile și un PDF/o imagine, apoi adaugă un fișier la o rezervare existentă. Încearcă aceeași adresă de fișier într-o fereastră fără autentificare: accesul trebuie refuzat.

Limite: testele mobile folosesc emularea Chrome, nu un dispozitiv fizic. Programul păstrează estimările motorului existent; redesignul nu adaugă rute verificate live, program de funcționare garantat sau check-in-uri care nu există în date. Nu au rămas probleme vizuale blocante în ecranele inspectate.

## Fișiere schimbate

| Fișiere | Rol |
| --- | --- |
| `src/pages/Dashboard.jsx` | Overview real, încărcare exclusiv pentru citire |
| `src/components/trip/TripOverview.jsx` (nou) | Hero, rezumate, pași următori, toate zilele, acces rapid |
| `src/components/trip/TripUI.jsx` (nou) | Navigare, titluri, stări, încărcare și empty state reutilizabile |
| `src/styles/trip-experience.css` (nou), `src/main.jsx` | Stiluri comune limitate la experiența excursiei |
| `src/lib/trip-presentation.js` (nou) | Date și denumiri pentru afișare, fără scrieri în date |
| `src/pages/PlanVisits.jsx`, `src/components/planning/WizardShell.jsx` | Layout și navigare, linkuri către pași, salvare înainte de ieșire |
| `src/components/planning/StepFinalize.jsx`, `src/components/trip/MissingDetailsList.jsx` (nou) | Validare grupată și generare explicită |
| `src/pages/Itinerary.jsx`, `src/components/itinerary/ItineraryDay.jsx` (nou) | Filtrare pe zile, timeline și acțiuni secundare |
| `src/components/itinerary/VisitCard.jsx`, `src/components/itinerary/TransportCard.jsx` | Ierarhie vizuală și acțiuni contextuale |
| `src/pages/TravelWallet.jsx`, `src/pages/TripDocuments.jsx` | Wallet integrat și compatibilitatea vechiului URL |
| `src/components/trip/AddItemModal.jsx`, `src/components/trip/ItemDetailDialog.jsx` | Modal, confirmare eliminare, etichete clare |
| `src/App.jsx` | Un singur mesaj global de eroare activ în loc de notificări suprapuse |
| `server/tests/trip-presentation.test.js` (nou) | Teste de corectitudine a afișării |
| `scripts/verify-trip-redesign.mjs` (nou) | Verificări în Chrome și comparație MySQL pentru vizualizare |
| `scripts/smoke-browser.mjs`, `scripts/verify-wallet.mjs`, `scripts/browser-driver.mjs` | Selectori adaptați, așteptarea salvării/animației, dialoguri de confirmare în teste |
| `docs/TRIP_EXPERIENCE_REDESIGN.md` (nou), `docs/MIGRATION_STATUS.md` | Raport și instrucțiuni |
