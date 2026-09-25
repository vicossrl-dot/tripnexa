# TripSync — aplicație independentă

Autentificare Google/Apple și domenii portabile: [configurare socială](docs/SOCIAL_AUTH.md), [domenii, callback-uri și mutarea instalării](docs/DOMAIN_CONFIGURATION.md). Paginile Admin sunt implementate; furnizorii OAuth rămân dezactivați până la configurarea credențialelor. Loginul real Google/Apple nu este încă verificat.

Tours & Tickets: [configurarea GetYourGuide, Viator, Tiqets și Klook](docs/AFFILIATE_TICKETS.md). Interfața și adaptoarele affiliate sunt pregătite local; furnizorii rămân dezactivați până la introducerea linkurilor oficiale din conturile tale în Admin → Revenue.

Verificarea locală din 25 septembrie 2026: [raport preproducție, Trip Health, Repair/Undo, securitatea contului și capturi](docs/FINAL_PREPRODUCTION_AUDIT.md). Typecheck, lint, 61 teste unitare/HTTP, 20 teste MySQL, build și Chrome trec; raportul separă testele reale de fixtures și listează pașii rămași.

Frontend: React + Vite. Backend: Node.js + Express. Baza de date: MySQL 8.4. Autentificarea și fișierele sunt administrate de backendul propriu.

Ultima corectare a itinerarului: [priorități, sugestii opționale, transferuri peste miezul nopții și PDF](docs/SCHEDULING_FIXES.md). Include migrarea aditivă, rezultatele testelor și pașii pentru actualizarea itinerarelor deja salvate.

Aplicația activă nu folosește SDK-ul, autentificarea, baza de date, funcțiile sau găzduirea media Base44. Exportul original este păstrat în migration-backup/; directorul base44/ rămas este doar o referință istorică și nu este executat.

## Pornire locală pe Windows

Ai nevoie de Node.js 22 sau mai nou. Pe acest calculator, MySQL 8.4.11 este deja descărcat și configurat în .local/mysql/, cu parole locale generate automat. Nu este necesar Docker și nu a fost instalat un serviciu Windows.

În PowerShell, deschide directorul proiectului:

    cd C:\travel
    npm.cmd run db:start
    npm.cmd run db:migrate
    npm.cmd run dev

Deschide http://127.0.0.1:5173. API-ul rulează pe http://127.0.0.1:3001. Verificarea bazei de date este la http://127.0.0.1:3001/api/health. Dacă aplicația este deja pornită, deschide direct adresa în browser.

Pentru oprire: Ctrl+C în terminalul aplicației, apoi npm.cmd run db:stop. Baza de date este păstrată pentru următoarea pornire.

Pe un alt calculator Windows, pregătește mai întâi dependențele și distribuția oficială MySQL:

    npm.cmd install
    node scripts/setup-local.mjs
    node scripts/download-mysql.mjs
    Expand-Archive -LiteralPath .local/mysql/mysql-8.4.11-winx64.zip -DestinationPath .local/mysql

Continuă apoi cu db:start, db:migrate și dev. Comanda setup creează .env cu parole aleatoare; nu suprascrie configurarea existentă și nu afișează parolele. db:start creează bazele tripsync și tripsync_test la prima pornire. Arhiva MySQL este descărcată de la Oracle; binarul folosit aici a avut semnătura digitală Oracle validă.

Alternativ, cu Docker Desktop instalat și pornit, poți folosi configurația Compose. Oprește mai întâi instanța locală cu db:stop: cele două variante folosesc același port și baze de date separate.

    docker compose up -d mysql
    docker compose ps
    npm.cmd run db:migrate
    npm.cmd run dev

Așteaptă ca MySQL să fie healthy înainte de db:migrate.

Dacă folosești un alt server MySQL existent, creează baza tripsync și un utilizator cu drepturi doar pe această bază, apoi completează MYSQL_HOST, MYSQL_PORT, MYSQL_DATABASE, MYSQL_USER și MYSQL_PASSWORD în .env. Comanda db:migrate creează tabelele în baza existentă; nu instalează MySQL și nu creează conturi de server.

Parolele inițiale Docker se aplică numai la crearea volumului. Modificarea lor în .env nu schimbă parola într-o bază deja inițializată. Nu șterge volumul pentru a rezolva o parolă greșită: volumul conține datele tale.

## Primul cont și e-mailurile

Creează un cont la /register. Parola trebuie să aibă 12–128 de caractere. Introdu codul de verificare primit.

În dezvoltare, dacă SMTP nu este configurat, e-mailurile NU se trimit pe internet: mesajele și codurile sunt salvate în .local/mail/. Deschide cel mai nou fișier text pentru cod sau linkul de resetare.

Pentru trimitere reală, completează SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD și SMTP_FROM în .env, apoi repornește serverul.

Sesiunile folosesc cookie HTTP-only și sunt păstrate în MySQL. Parolele sunt protejate cu scrypt și salt individual. Resetarea parolei invalidează sesiunile vechi. Autentificarea Google a fost eliminată din interfață; aplicația folosește conturi locale.

## Configurarea AI, când ești pregătit

Completează în .env:

    OPENAI_API_KEY=cheia_ta
    OPENAI_MODEL=id_model_text
    OPENAI_IMAGE_MODEL=id_model_imagini

Cheia rămâne pe server. Nu folosi prefixul VITE_ pentru chei secrete. Alege modele disponibile în contul tău: modelul text trebuie să accepte Responses API, web_search și răspunsuri JSON structurate; modelul de imagini trebuie să accepte /images/generations cu răspuns base64.

Fără configurare AI, introducerea manuală a datelor și încărcarea imaginilor funcționează. Sugestiile automate și imaginile generate se activează după configurare și repornirea serverului. Utilizarea API-ului AI poate avea costuri în contul furnizorului.

Implementarea folosește documentația oficială:
- https://developers.openai.com/api/docs/guides/tools-web-search
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/guides/image-generation

Serviciile pentru curs valutar, geocodare, fus orar, Google Maps și Google Fonts sunt în continuare externe. Ele nu trec prin Base44.

## Importul datelor vechi

Codul exportat nu conține înregistrările bazei de date. Nu au fost transferate conturi, excursii sau documente de pe serverele vechi.

Consultă docs/DATA_IMPORT.md pentru formatul JSON și maparea fișierelor. Importatorul verifică implicit datele fără să le scrie:

    npm.cmd run data:import -- export.json

Importul explicit:

    npm.cmd run data:import -- export.json --media-map=files.json --apply

Nu suprascrie înregistrări existente. Importă într-o bază nouă, verifică numărul de înregistrări și păstrează exportul original. Utilizatorii importați își stabilesc parola locală prin Forgot password.

## Fișiere și copii de siguranță

- MySQL: datele, conturile, sesiunile și referințele la fișiere. Instanța Windows inclusă păstrează datele în .local/mysql/data/; varianta Docker folosește propriul volum.
- .local/uploads/: fișiere private încărcate sau generate.
- public/media/: cele cinci imagini/video originale copiate local și imaginea de rezervă.
- .local/mail/: mesaje de dezvoltare, care pot conține coduri temporare.
- migration-backup/: codul dinainte de migrare.
- .env: configurarea și secretele locale; exclus din Git.

Salvează atât baza MySQL, cât și .local/uploads/. Un backup numai al codului nu este un backup al datelor. Pentru MySQL folosește un export SQL; dacă faci o copie a întregului director .local/mysql/, oprește mai întâi baza cu db:stop pentru o copie consistentă.

## Comenzi utile

    npm.cmd run dev             # Vite și Express împreună
    npm.cmd run db:start        # pornește MySQL local pe Windows
    npm.cmd run db:stop         # oprește MySQL local fără ștergerea datelor
    npm.cmd run dev:client      # doar Vite; necesită API pornit separat
    npm.cmd run dev:server      # doar Express
    npm.cmd run build
    npm.cmd start              # Express servește și frontendul din dist/
    npm.cmd run lint
    npm.cmd run typecheck
    npm.cmd test
    npm.cmd audit              # verifică vulnerabilitățile cunoscute ale dependențelor

npm run preview verifică doar bundle-ul frontend; pentru verificarea completă a buildului folosește npm start, cu APP_URL potrivit adresei folosite.

Testele MySQL trebuie rulate într-o bază separată, cu numele terminat în _test:

    $env:MYSQL_TEST_DATABASE = "tripsync_test"
    npm.cmd run test:integration

Baza de test trebuie creată în prealabil, cu acces pentru utilizatorul configurat; db:start o pregătește automat pentru instanța locală Windows. Testele sunt omise dacă MYSQL_TEST_DATABASE nu este setat. Nu indica baza cu date reale.

Cu serverele locale pornite și Chrome instalat:

    node scripts/smoke-browser.mjs

Testul folosește Chrome fără fereastră și salvează o captură în .local/browser-smoke/.

Pentru verificarea paginilor autentificate, construiește frontendul și folosește baza separată de test. Scriptul pornește propriul server temporar și curăță contul creat:

    npm.cmd run build
    $env:MYSQL_TEST_DATABASE = "tripsync_test"
    node scripts/smoke-browser.mjs --full

## Publicare

Rulează buildul, configurează NODE_ENV=production și APP_URL cu adresa HTTPS publică, configurează SMTP, apoi pornește Express prin npm start. Pune un reverse proxy HTTPS în fața lui și servește frontendul și API-ul de pe aceeași origine. Setează TRUST_PROXY=1 numai dacă există exact un proxy de încredere. HOST poate fi schimbat explicit dacă infrastructura cere altă interfață de ascultare.

Nu publica migration-backup/, base44/, .env sau .local/ ca directoare statice. Backendul servește doar dist/ și fișierele private prin rutele autentificate. Configurația Vite blochează accesul la fișierele interne.

## Starea verificărilor

Vezi docs/MIGRATION_STATUS.md pentru verificările efectuate și ce necesită configurare locală.

Etapa 1 adaugă destinații Google, trei sugestii de nume, tipul călătoriei, fundaluri locale și cardul Plan your trip. Pentru configurarea GOOGLE_MAPS_API_KEY, migrarea aditivă și testarea fiecărei funcționalități, consultă [docs/PHASE_1.md](docs/PHASE_1.md).

Etapa 3 adaugă completarea Google în Desired places și sugestii AI bazate pe planificarea salvată, cu filtre de duplicate/excluderi și acceptare, respingere și editare persistente. Configurarea, migrarea și testarea sunt descrise în [docs/PHASE_3.md](docs/PHASE_3.md).

Etapa 4 adaugă itinerare complete pe zile, editare/mutare/înlocuire cu salvare, redeschidere din cardul excursiei și linkuri referral configurate numai pe backend. Consultă [docs/PHASE_4.md](docs/PHASE_4.md) pentru migrare, REFERRAL_LINKS_FILE și testarea completă.

Fotografiile Google, Special wishes, Change itinerary cu previzualizare, programarea îmbunătățită și exportul PDF A4 sunt descrise în [docs/FUNCTIONAL_POLISH.md](docs/FUNCTIONAL_POLISH.md). Migrarea adaugă numai câmpul opțional special_wishes; CHROME_PATH este opțional pentru export pe alt server.

Lista locurilor neprogramate din Change itinerary, preferințele Food & Dining și restaurantele Google pentru fiecare masă sunt descrise în [docs/FOOD_AND_CHANGE_POLISH.md](docs/FOOD_AND_CHANGE_POLISH.md). Migrarea adaugă trei câmpuri opționale pentru preferințe și `meal_choice`; configurația Google existentă este suficientă. Restaurantul ales se salvează, se păstrează la regenerare și apare în PDF.
