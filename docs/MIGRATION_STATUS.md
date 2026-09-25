# Starea migrării

## Actualizare — Tours & Tickets

Marketplace affiliate link-only cu patru furnizori, mapări globale, asociere Wallet, disclosure și analytics de clicuri implementat local. Migrarea aditivă este aplicată; niciun cont/furnizor real nu a fost activat automat. Manual affiliate setup required pentru fiecare platformă. Documentație: [AFFILIATE_TICKETS.md](AFFILIATE_TICKETS.md).

## Actualizare — verificarea finală locală, 25 septembrie 2026

Trip Health, readiness, Before You Go, repair cu preview/apply/Undo și Security & privacy sunt conectate. Migrarea aditivă `itinerary_repair_history` este aplicată local. Motorul 3 poate utiliza Google Routes și programul Google Places; planurile salvate nu sunt regenerate automat. Această integrare actualizează limitarea istorică de mai jos privind transportul exclusiv estimativ.

Typecheck, lint, 61 teste unitare/HTTP, 20 teste MySQL, build și Chrome complet trec. Testele reale Google/OpenAI au rezultate pozitive, dar modificarea AI a scenariului complex a întâmpinat un timeout; reluarea restrânsă a trecut. SMTP real rămâne neconfigurat, iar ștergerea contului produce o cerere pending pentru procesare manuală. Detalii, capturi și verdict: [FINAL_PREPRODUCTION_AUDIT.md](FINAL_PREPRODUCTION_AUDIT.md).

## Actualizare — Change Itinerary și Food & Dining

Change itinerary afișează locurile selectate neprogramate, cu Must-see/Preferred și Add to request fără suprascrierea textului. Preferințele alimentare se salvează în trei câmpuri opționale. Mesele oferă restaurante Google reale, căutate numai la cerere în zona traseului; alegerea se păstrează, este marcată pentru verificare după schimbări relevante și apare în PDF. Migrarea aditivă este aplicată local; nu sunt necesare pachete sau variabile de mediu noi.

Typecheck, ESLint, 52 teste unitare/HTTP, 11 teste MySQL și buildul trec. Chrome a verificat dialogul cu locuri neprogramate, previzualizarea/aplicarea OpenAI reală și restaurante Google reale, inclusiv fotografii, preferințe diferite, salvare, reîncărcare și PDF. Regresia Chrome a fluxurilor anterioare trece. Detaliile, fișierele schimbate, limitele și pașii de testare sunt în [FOOD_AND_CHANGE_POLISH.md](FOOD_AND_CHANGE_POLISH.md).

## Actualizare — 24 septembrie 2026

Au fost completate îmbunătățirile pentru rezolvarea locațiilor sugestiilor AI, fotografii Google, Special wishes, editare AI cu previzualizare și Download PDF. Detaliile și fișierele sunt în [FUNCTIONAL_POLISH.md](FUNCTIONAL_POLISH.md).

Motorul distinge acum locurile dorite de sugestiile opționale neprogramate, păstrează rezervările și transferurile fixe și folosește date/ore complete pentru trecerea peste miezul nopții. Opțiunile neprogramate au secțiune informativă separată. PDF-ul nu mai include diagnostice. Migrarea aditivă pentru `start_datetime` și `end_datetime` este aplicată; itinerarele vechi necesită regenerare explicită și nu au fost suprascrise.

Typecheck, ESLint, 47 teste automate, 10 teste MySQL, build și regresia Chrome a fluxurilor existente trec. Scenariul București cu transfer 23:22 → 00:27 păstrează ambele locuri dorite și 14 opțiuni neprogramate fără conflicte. PDF-ul descărcat a fost inspectat vizual în Chrome pe toate cele patru pagini. Nu sunt necesare chei sau pachete noi. Raportul complet, limitele, fișierele și pașii utilizatorului sunt în [SCHEDULING_FIXES.md](SCHEDULING_FIXES.md).

## Implementat

- React + Vite cu alias propriu și proxy către Express.
- Eliminarea pachetelor @base44/sdk și @base44/vite-plugin din manifest și lockfile.
- API Express, MySQL, validarea câmpurilor și filtre SQL parametrizate.
- Tabele pentru cele opt entități, plus sesiuni, coduri temporare și fișiere.
- Proprietari verificați pe server, inclusiv pentru înregistrările asociate și operațiile în lot.
- Înregistrare, verificare e-mail, login, logout, profil și resetare parolă.
- Cookie HTTP-only, scrypt, limitarea cererilor și protecție pentru cereri din alte origini.
- Încărcări private și imagini generate salvate local.
- Salvarea colecțiilor de planificare și reconstruirea itinerarului în tranzacții.
- Ștergerea în cascadă a datelor unei excursii sau liste.
- Partajare prin token generat pe server și proiecție publică fără câmpurile private.
- Integrare AI configurabilă direct pe backend.
- Cele cinci fișiere media din interfață copiate în public/media/.
- Import JSON cu verificare prealabilă, proprietari și mapare de fișiere.
- MySQL 8.4.11 configurat și pornit local în directorul proiectului, cu pornire/oprire prin comenzi npm și fără serviciu Windows. Configurația Docker Compose rămâne disponibilă ca alternativă.

## Verificări efectuate

- Buildul Vite trece.
- Verificarea typecheck trece fără erori. Au fost corectate definițiile proprietăților componentelor React, calculele cu date și proprietățile opționale; verificarea nu a fost dezactivată și configurația ei nu a fost restrânsă.
- ESLint trece fără erori; există avertismente despre variabile nefolosite în componentele exportate.
- Testele unitare, HTTP, de verificare a importului și de integrare cu furnizorii simulați acoperă parolele, cookie-urile, redirecționările, filtrele, proprietarii, datele publice, încărcările și protecția cererilor. Etapa 1 extinde suita la 16 teste.
- Testul de integrare pe MySQL real trece: login, înregistrare și cod de verificare, resetarea parolei, izolarea conturilor, planificare, partajare, încărcări private și ștergere în cascadă. Folosește tripsync_test, separat de baza aplicației.
- Importul efectiv cu date fictive trece pentru toate cele opt entități: proprietari, relații, avatar local, ID-uri și data creării păstrate, partajare dezactivată. Un conflict de ID anulează tranzacția și elimină fișierele copiate de importul eșuat, fără suprascrierea datelor existente.
- Chrome fără fereastră a verificat login/register/forgot-password, redirecționarea utilizatorului neautentificat, login real, excursia, documentele, planificarea, itinerarul, profilul, lista To-Do și partajarea anonimă. Fără erori JavaScript și fără cereri către Base44 pe paginile testate.
- Verificarea în Chrome parcurge toate cele șase etape ale planificării, modifică o preferință și confirmă păstrarea ei în MySQL după reîncărcare.
- Lista documentelor se reîmprospătează după înlocuirea imaginii. Importul hotelului citește metadate HTML, apoi poate folosi AI; PDF/imagine folosesc AI cu previzualizare și confirmare. Câmpurile manuale rămân disponibile.
- Pachetele Base44 nu mai sunt instalate în proiectul activ.
- Fișierele interne cunoscute sunt blocate de serverul Vite.
- Auditul npm din 23 septembrie 2026 raportează 0 vulnerabilități cunoscute, față de 14 înaintea actualizărilor (5 ridicate, 8 moderate, 1 scăzută). Rezultatul include dependențele de dezvoltare și este salvat în .local/npm-audit-final.json.
- Au fost actualizate dependențele vulnerabile compatibile, inclusiv PostCSS, Browserslist, Nano ID, js-yaml și uneltele ESLint. React Router a fost migrat explicit de la 6.30.4 la 7.18.4, versiunea verificată împreună cu React 18; nu s-a folosit audit fix --force.
- Bibliotecile react-quill, jspdf și html2canvas au fost eliminate după confirmarea că nu sunt folosite de codul aplicației. Bibliotecile lor tranzitive nefolosite, inclusiv Quill, DOMPurify și fflate, au fost eliminate din arborele instalat.
- Testul Chrome verifică acum și crearea excursiei prin formular, redirecționarea unei pagini private spre login, revenirea la URL-ul cerut după autentificare, navigarea prin linkuri fără reîncărcare și istoricul Înapoi/Înainte.

Actualizarea React Router a fost verificată folosind [ghidul oficial de migrare](https://reactrouter.com/7.18.4/upgrading/v6) și [avizul de securitate pentru redirecționări](https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6). Manifestul și lockfile-ul anterioare acestei etape sunt păstrate în .local/dependency-backup-20260923-092613/.

Un audit fără rezultate se referă la vulnerabilitățile cunoscute de registrul npm la momentul verificării; nu înlocuiește testarea aplicației. Comanda și limitele ei sunt descrise în [documentația npm](https://docs.npmjs.com/cli/v11/commands/npm-audit/).

## Ce nu a fost verificat sau transferat

- Datele reale, conturile și fișierele private vechi nu au fost furnizate, deci nu au fost importate.
- Generarea numelor din etapa 1, sugestiile din etapa 3 și propunerea de itinerar din etapa 4 au fost verificate prin apeluri reale OpenAI cu date fictive. Extragerea rezervărilor PDF/imagine și alternativa web pentru Booking au fost ulterior verificate în Chrome cu apeluri reale. Generarea imaginilor nu a fost reverificată.
- Google Places Autocomplete și Place Details au fost verificate cu cheia reală existentă în etapa 3: Colosseum a returnat adresă, localitate, țară, ID, coordonate și categorie. Verificarea ulterioară în Chrome a confirmat și Tokyo, Barcelona, aeroportul BCN, hotelul, obiectivele și Time Zone real (Europe/Madrid).
- SMTP real nu a fost configurat sau testat. În dezvoltare, mesajele sunt salvate în .local/mail/.

Motorul existent de planificare folosește estimări de transport. Migrarea nu îl transformă într-un serviciu de rutare sau de rezervări reale. Serviciile externe de geocodare, fus orar, curs valutar, hărți și fonturi continuă să fie utilizate direct.

Directorul base44/ și migration-backup/ păstrează exportul original pentru referință. Nu sunt încărcate de aplicație, nu sunt publicate în dist/ și nu reprezintă dependențe de runtime.

## Etapa 1 — îmbunătățirea creării excursiei

Destinație cu sugestii Google prin backend și alternativă manuală; trei nume scurte generate pe backend; tip de călătorie opțional; șapte fundaluri SVG locale; card Plan your trip către planificarea existentă. Migrarea adaugă șase coloane opționale fără ștergerea datelor. Instrucțiunile de configurare, toate fișierele schimbate și pașii de verificare sunt în [PHASE_1.md](PHASE_1.md).

## Etapa 3 — locuri dorite și sugestii AI

Desired places folosește completarea Google existentă prin backend și salvează adresa, localitatea, țara, ID-ul, coordonatele și categoria. Suggestions folosește un endpoint dedicat cu toate preferințele și cazările salvate, filtre pentru duplicate/excluderi și acceptare, respingere și editare persistente. Locurile preferate acceptate pot intra în timpul rămas al itinerarului; cele excluse sunt omise.

Migrarea aditivă a fost aplicată. Typecheck, ESLint, toate cele 20 de teste, cele 3 teste de integrare MySQL și buildul trec. Chrome verifică noile fluxuri cu furnizori simulați, inclusiv eroare AI și reîncercare, și alternativa manuală fără furnizori. Un apel OpenAI real cu date fictive a returnat opt sugestii structurate; Google Autocomplete și Place Details au trecut verificarea reală. Detaliile, limitele și lista fișierelor sunt în [PHASE_3.md](PHASE_3.md).

## Etapa 4 — itinerar, editare și referral

Generare explicită în pasul final: propunere AI validată, programare locală pe zile cu transferuri, mese/pauze și conflicte, alternativă fără AI și salvare tranzacțională. Deschiderea nu regenerează itinerarul. Editarea poate muta/înlocui o vizită și recalculează numai zilele afectate; versiunile vechi și modificările concurente sunt respinse fără pierdere de date. Cardul excursiei generate deschide itinerarul, iar Back to trips revine pe Home.

Configurația referral rămâne într-un fișier privat backend; în frontend ajunge numai linkul final al unei vizite eligibile. Fără regulă validă, acțiunea este omisă. Migrarea aditivă a fost aplicată. Typecheck, ESLint, 24 teste, 4 teste MySQL, build și Chrome cu/fără furnizori trec. Un apel AI real cu date fictive a păstrat trei vizite pe trei zile și rezervarea fixă. Linkurile comerciale reale rămân de configurat. Vezi [PHASE_4.md](PHASE_4.md) pentru fișiere, configurare, limite și testarea completă.

## Remedieri după etapa 4 — verificare reală în aplicație

Google și OpenAI funcționează prin backendul real după repornirea procesului cu acces la rețea. Autocomplete este conectat la toate câmpurile cerute; selectoarele dată/oră se deschid la clic în tot câmpul. Biletele PDF/imagine sunt private și persistente. Importul hotelului din URL sau document afișează o previzualizare și necesită confirmare. Booking blochează citirea directă (HTTP 202), dar alternativa AI pentru URL-ul Arcelon a produs o previzualizare utilă.

Migrarea aditivă a fost aplicată. Typecheck, ESLint, 30 teste automate, 5 teste MySQL și buildul trec. Chrome a verificat furnizorii reali, extragerea din PDF și imagine fictive, sugestiile AI, excluderile/duplicatele și biletele private; regresia fazelor anterioare cu furnizori simulați trece. Nu sunt necesare chei noi sau schimbarea modelului existent. Lista fișierelor, configurarea exactă, dovezile și pașii de testare sunt în [PLANNING_FIXES.md](PLANNING_FIXES.md).

## Travel Wallet — bilete, rezervări și documente private

Portofel dedicat cu patru categorii, mai multe fișiere per rezervare, etichete și persoane per fișier, adăugare ulterioară și eliminare individuală. Add to Trip include încărcare, introducere manuală și import din link unde este relevant. PDF-urile și imaginile se deschid într-un vizualizator mare, cu descărcare și rezoluție originală. Itinerarul include scurtături numai către rezervări asociate cu fișiere.

Migrarea aditivă pentru item_attachments, airline/traveler și marcarea fișierelor administrate de Wallet a fost aplicată. Fișierele vechi rămân accesibile fără duplicarea datelor. Ștergerea rezervării/excursiei curăță fișierele neutilizate, păstrând referințele încă existente. Autentificarea, verificarea proprietarului și excluderea documentelor din partajarea publică sunt păstrate. Nu s-a adăugat criptare individuală la repaus.

Typecheck, ESLint, 32 teste automate, 9 teste MySQL și buildul trec. Chrome a încărcat efectiv 12 fișiere fictive pentru zbor, hotel, atracție și documente personale; a verificat persistența, editarea, contoarele, vizualizarea mare și accesul privat. Două extrageri AI reale au produs previzualizări cu confirmare. Regresia Chrome a planificării existente trece. Nu sunt necesare variabile de mediu noi. Lista fișierelor și comenzile sunt în [TRAVEL_WALLET.md](TRAVEL_WALLET.md).

## Redesign UI/UX — experiența completă a excursiei

Overview, Update Plan, Itinerary și Travel Wallet folosesc navigare și stiluri comune. Overview afișează rezumatul excursiei, următoarele acțiuni, scurtături semantice și toate zilele. Bannerul global de fișiere private a fost eliminat; fișierele rămân în Wallet și în acțiunile contextuale ale itinerarului. Planificatorul păstrează cele șase etape, cu detalii lipsă grupate și salvare vizibilă. Itinerarul are selector pe zile, timeline diferențiat și editare secundară. Wallet și modalul Add to Trip sunt integrate vizual, inclusiv pe telefon.

Fără modificări de backend, API, bază de date, chei sau dependențe. Vechiul URL Documents deschide secțiunea corespunzătoare din Wallet. Vizualizarea nu scrie ferestre zilnice și nu regenerează itinerarul. Typecheck, ESLint, 34 teste automate, 9 teste MySQL și buildul trec. Chrome a verificat o excursie de cinci zile la 2560, 1366 și 390 px, încărcările reale, navigarea și regresia planificării. Capturile paginilor au fost inspectate vizual, iar comparația MySQL înainte/după vizualizare a confirmat lipsa modificărilor. Vezi [TRIP_EXPERIENCE_REDESIGN.md](TRIP_EXPERIENCE_REDESIGN.md) pentru fișiere, limite și pașii de testare.
