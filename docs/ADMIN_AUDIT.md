# TripSync — audit Admin / Backoffice

Data: **24 septembrie 2026**. Domeniu: proiectul standalone din `C:\travel`.

**Verdict: NU există un panou admin standalone și NU există încă roluri administrative funcționale.** Există administrarea propriului cont/propriilor excursii și instrumente locale pentru operatorul serverului. Acestea nu formează un backoffice.

Acesta este un audit, nu o implementare. Singurul fișier creat este acest raport. Nu au fost schimbate codul, configurația, datele, schema, pachetele sau comportamentul aplicației.

## Metodă și limite

- Am inspectat `README.md`, manifestul, rutele React/Express, autentificarea, validarea, toate schemele, migrarea, fișierele/configurația furnizorilor, uploadurile, partajarea, documentația și scripturile operaționale. Căutarea a inclus fișiere ascunse de configurare și directoarele de referință.
- Am citit **numai metadatele MySQL** din `information_schema`: baza configurată are exact **12 tabele**, toate de tip BASE TABLE. Nu am extras conturi, parole, documente private sau itinerare reale.
- `.env` a fost verificat prin numele variabilelor și prezența valorilor, fără afișarea secretelor. Pentru `.local/` am verificat existența directoarelor, configurației referral și caracteristicile fișierelor de log, fără publicarea conținutului sensibil.
- Cereri GET locale: `/api/health` → 200, MySQL disponibil; `/api/config` → 200, capabilitățile AI/imagine/Places configurate; `/api/auth/me` fără cookie → 401; `/api/admin/users` → 404.
- Nu am rulat build, migrări, instalări, teste care scriu în DB, generare AI, trimitere e-mail sau cereri Google. Rezultatele testelor din etapele anterioare sunt documentate separat; nu sunt prezentate ca teste noi ale acestui audit.
- Atașamentul acestui audit conține textul cererii, dar nu și capturi ale vechiului dashboard Base44. Comparația de mai jos folosește ariile enumerate în cerere și exportul local. Descrierea scopului ariilor platformei este conceptuală, nu o verificare vizuală a unor controale care nu au fost furnizate.
- Auditul codului și verificările GET nu reprezintă un test de penetrare complet sau o certificare de producție.

## A. Există un panou admin?

**NO / Missing.** Nu există `/admin`, componente admin montate, `/api/admin/*`, middleware `requireAdmin` sau tabele de administrare.

Rutele active sunt definite în [src/App.jsx](../src/App.jsx):

| Rută | Scop real |
|---|---|
| `/login`, `/register`, `/forgot-password`, `/reset-password` | Autentificare locală |
| `/` | Excursiile utilizatorului autentificat |
| `/trip/:tripId` | `Dashboard.jsx`: prezentarea unei excursii, **nu dashboard administrativ** |
| `/trip/:tripId/plan` | Planificarea excursiei proprii |
| `/trip/:tripId/itinerary` | Itinerarul excursiei proprii |
| `/trip/:tripId/wallet`, `/trip/:tripId/documents` | Wallet și compatibilitatea paginii de documente |
| `/profile` | Profilul propriu, preferințe, locuri vizitate, To-Do |
| `/share/:token` | Vizualizare publică limitată, prin token |
| Orice altă rută | `PageNotFound` |

Referințe care pot induce în eroare:

- [src/lib/PageNotFound.jsx](../src/lib/PageNotFound.jsx) conține un mesaj condiționat de `user.role === 'admin'`. Nu oferă funcții admin; API-ul actual returnează întotdeauna `user`.
- `UserNotRegisteredError.jsx` menționează administratorul, dar nu implementează invitații sau administrare.
- `src/pages/OAuthConsent.jsx` este un redirect spre login, fără rută montată. Nu este un serviciu MCP.
- `src/api/base44Client.js` este un fișier de compatibilitate care reexportă clientul local. Nu încarcă SDK-ul Base44.
- Referințele la `adminConfig` din scripturile MySQL înseamnă contul de administrare al **serverului MySQL**, nu un rol în aplicație.

## B. Capabilități actuale de administrare a propriilor date

Surse: [server/auth.js](../server/auth.js), [server/entities.js](../server/entities.js), [server/trips.js](../server/trips.js), [server/wallet.js](../server/wallet.js), [src/api/client.js](../src/api/client.js).

### Utilizatori

| Funcție | Ce există acum |
|---|---|
| Listă/căutare utilizatori | Nu există API sau interfață |
| Profil | GET/PATCH `/api/auth/me`, numai contul curent |
| Data înregistrării | `users.created_date`, disponibilă în înregistrare; fără listă administrativă |
| Rol | Valoare API constantă `user`; nu există coloană `role` |
| Starea contului | Numai `email_verified` în DB; serializarea profilului o elimină. Nu există activ/suspendat/șters |
| Excursiile unui utilizator | Utilizatorul își vede propriile excursii; operatorul DB poate interoga datele, fără funcție admin în aplicație |
| Stocare utilizată | Nu există contor de octeți/quota. Numărul uploadurilor se poate calcula; octeții necesită măsurarea fișierelor |
| Istoric login | Lipsește. `sessions` nu are data loginului, IP, dispozitiv sau ultima activitate |
| Dezactivare/reactivare | Lipsește |
| Resetare parolă | Flux existent prin e-mail, token temporar și parolă nouă; fără buton admin |
| Ștergere cont | Nu există endpoint, nici flux de ștergere completă a contului și fișierelor |
| Schimbare rol | Lipsește |
| Impersonare | Lipsește; nu este recomandată pentru prima versiune admin |

Parolele nu trebuie afișate, recuperate sau înlocuite cu parole cunoscute de administrator. Viitorul admin poate iniția **procesul existent de resetare prin e-mail**, fără a primi linkul/tokenul sau parola utilizatorului.

### Excursii

| Funcție | Utilizatorul proprietar | Administrator global în aplicație |
|---|---|---|
| Listare/deschidere | Da | Nu există |
| Filtre | API generic: egalitate pe câmpuri permise, sortare, maximum 1.000 de rezultate, fără paginare completă | Nu există căutare globală sau filtru pe proprietar |
| Filtru destinație/date/stare | Egalitate prin API; nu un explorer administrativ cu intervale și căutare liberă | Nu există |
| Itinerar și planificare | Da, endpointuri dedicate și entități proprii | Nu există |
| Erori de programare | Conflicte/metadate ale ultimului plan | Nu există consolă globală sau istoric complet |
| Ștergere excursie | Da, cu cascade și curățare Wallet specifică | Nu există |
| Reparare | Editare, regenerare explicită, Preview/Apply | Nu există unealtă de diagnostic/reparare administrativă |
| Metadate Wallet | Da, pentru propria excursie | Nu există acces global |
| Fișiere private | Numai proprietarul, prin endpoint autentificat | Nicio excepție admin |

Instrumentele locale existente sunt pornirea/oprirea MySQL, migrarea aditivă, importul JSON cu verificare prealabilă, testele și verificările Chrome. Ele nu trebuie expuse ca terminal sau SQL arbitrar în browser.

## C. Securitatea utilizatorilor și rolurilor

### Autentificare

- Parole scrypt cu salt individual; lungime acceptată 12–128 caractere. Hash-ul nu este serializat către client.
- Token de sesiune aleator; în DB se păstrează SHA-256, nu tokenul cookie. Sesiune de șapte zile, cookie `HttpOnly`, `SameSite=Lax`, `Secure` în producție, `Path=/`.
- Loginul cere e-mail verificat. Verificarea folosește cod de șase cifre, 15 minute și maximum cinci încercări pe token; resetarea folosește token aleator cu expirare de 15 minute.
- Resetarea parolei șterge sesiunile și tokenurile de autentificare ale contului. Logoutul invalidează sesiunea curentă.
- Nu există MFA, roluri, super-admin, blocare de cont, administrarea sesiunilor sau autentificare admin separată.

### Autorizare

`requireUser` verifică sesiunea pe server. `owned()` și `querySpec()` impun `owner_id = req.user.id`; identificatorul proprietarului trimis de client nu este acceptat ca autoritate. Entitățile și câmpurile sunt pe liste permise, valorile SQL sunt parametrizate. Părinții și legăturile între excursii/documente sunt verificate; cheile externe compuse protejează relațiile proprietar–părinte.

Planificarea, AI bazat pe excursie, PDF-ul și Wallet folosesc aceeași verificare a proprietarului. `/api/uploads/:id` cere și `id`, și `owner_id`. Endpointul public folosește un token valid, partajare activată și proiecție restrânsă; nu oferă documentele Wallet.

`owner_id` înseamnă **proprietarul înregistrării**, nu „owner al platformei”. Nu există distincție operațională USER/ADMIN/OWNER/SUPER ADMIN. `serialize('User')` din [server/schema.js](../server/schema.js) adaugă explicit `role = 'user'`. Schema și DB confirmă absența unui rol persistent. PATCH profil nu acceptă `role`, `email_verified` sau `password_hash`.

[ProtectedRoute.jsx](../src/components/ProtectedRoute.jsx) este o protecție de autentificare pentru UX, nu o protecție administrativă. Manipularea stării React nu elimină verificările backendului.

**Concluzie:** în traseele inspectate nu am identificat o cale intenționată prin care un utilizator obișnuit să modifice datele altuia sau să se promoveze admin. Acest rezultat nu garantează absența oricărei vulnerabilități. Testele existente verifică izolarea, dar nu au fost rerulate în această etapă de audit.

### Constatări relevante înainte de producție

| Constatare | Implicație și recomandare |
|---|---|
| Rolurile lipsesc | Nu construi doar meniuri admin. Autorizarea server-side și modelul persistent trebuie să vină înaintea acțiunilor globale |
| Înregistrarea este deschisă; lipsesc cote per cont | Rate limiturile existente nu sunt bugete de cost. Utilizatori noi pot consuma AI, Google și stocare; adaugă controlul înscrierii, cote și alerte |
| Limitatoare în memoria procesului | Se resetează la restart și nu se coordonează între replici. Pentru mai multe instanțe este necesară stocare comună |
| Logarea acțiunilor sensibile lipsește | Nu există trasabilitate administrativă; trebuie introdusă înaintea suportului privilegiat |
| SMTP neconfigurat, mod development local | Situație normală local, insuficientă pentru publicare. Necesită SMTP și HTTPS reale |
| Uploaduri fără quota și fără scanare malware | Verificarea semnăturii PDF/imaginii nu certifică fișierul ca sigur. Sunt necesare limite operaționale și o decizie explicită privind scanarea/carantina |
| Ștergerea SQL a contului nu este un flux complet | Cascadele șterg rânduri, nu garantează eliminarea fișierelor fizice după dispariția referințelor. Trebuie serviciu dedicat de ștergere și retry |
| Înregistrarea întoarce 201 la cont nou și 200 la existent | Din cod se poate distinge existența contului prin status. Nu am făcut probe pe adrese reale; merită uniformizat într-o etapă de securitate |
| API generic permite editări ale datelor proprii | Nu trebuie reutilizat drept editor SQL admin: unele câmpuri de planificare/versiune pot fi schimbate fără operația completă de recalculare |
| Antete existente, fără politică CSP globală/HSTS în Express | HTTPS/reverse proxy trebuie configurate și testate; CSP ar necesita inventarierea resurselor externe, nu adăugare arbitrară |

## D. Toate tabelele MySQL și administrarea lor

Schema de mai jos este confirmată prin metadatele bazei active, nu doar prin fișierele exportului. Pentru cele șapte entități obișnuite există `id`, `owner_id`, `created_date`, `updated_date`. Datele calendaristice sunt DATE, multe structuri sunt JSON în TEXT, iar valorile numerice sunt frecvent DOUBLE.

**Categorii:** S = sigur de gestionat prin operații dedicate și câmpuri permise; L = acces limitat, sensibil; X = tabel de sistem, fără editor manual. „S” nu înseamnă SQL liber sau acces nelimitat la date personale.

| Tabel | Scop și câmpuri importante | Proprietate/relații | Clasă și administrare recomandată |
|---|---|---|---|
| `users` | E-mail unic, hash parolă nullable, `email_verified`, nume, telefon, oraș, avatar, preferințe personale, date creare/modificare | Părintele datelor utilizatorului | **S pentru subsetul de cont**: listă, contact minim, stare și operații dedicate viitoare. Hash/tokenuri excluse; date personale sensibile limitate. Fără editare directă a acreditărilor |
| `trips` | Destinație/date/fus, călători, bugete, transport, coordonate/ID Google, sosire/plecare, preferințe, Special wishes, `plan_status`, `plan_version`, `itinerary_meta`, `share_token`, `share_enabled`, `share_hide_stay`, referințe bilete | `owner_id → users` | **L**: rezumat și diagnostic; corectare/ștergere prin servicii cu preview. JSON/versiuni/tokenuri nu se editează manual |
| `trip_items` | Cazare/zbor/activitate/document, date și ore, locații, rezervare, confirmare, număr zbor, persoane, URL-uri fișiere | Proprietar + `(trip_id, owner_id) → trips` | **L**: conține informații private. Corectări controlate cu acord și audit; schimbările pot afecta rezervări și itinerarul |
| `place_selections` | Nume/adresă/ID/coord., origine, prioritate, stare, durată, dată/oră fixă, bilet, cost, motiv AI | Proprietar + excursie; `trip_item_id` validat în aplicație | **L**: diagnostic; nu transforma sugestii în obligatorii și nu muta bilete fixe prin CRUD liber |
| `day_windows` | Zi, JSON `windows`/`blocked`, puncte început/sfârșit, note | Proprietar + excursie | **L**: modificarea ferestrelor poate invalida întregul plan |
| `itinerary_items` | Zi/ordine, tip, titlu, ore și datetime complete, durată, locație, transport, cost/bilet, `locked`, `version`, `selection_id`, `meal_choice` | Proprietar + excursie; selecția verificată în aplicație | **L**: structură calculată/editabilă prin serviciul de itinerar; fără schimbare directă a JSON, timpilor și versiunilor |
| `todo_boards` | Numele listei | Proprietar | **L, utilitate admin redusă**: conținut personal; eventual diagnostic/ștergere la solicitare, fără CRUD global implicit |
| `todo_items` | Titlu, `done`, `board_id` | Proprietar + `(board_id, owner_id) → todo_boards` | **L**: aceeași politică de confidențialitate |
| `uploads` | ID, proprietar, basename fizic, MIME, creare, `wallet_managed`; **fără size_bytes** | Proprietar; fișierul este pe disc | **X** pentru rândurile interne; admin poate avea un DTO limitat de stocare. Editarea basename/owner sau ștergerea SQL poate orfana fișiere |
| `item_attachments` | Legătura fișier–rezervare, nume original, etichetă, persoană, note, tip document, expirare, timestamps | FK compuse spre `trip_items` și `uploads` cu același owner; pereche item/upload unică | **L**: chiar metadatele pot dezvălui identitate și călătorie. Atașarea/ștergerea trece prin lifecycle Wallet |
| `sessions` | `token_hash`, `user_id`, `expires_at` | FK utilizator, ștergere în cascadă | **X**: numai revocare prin operație dedicată; fără vizualizare/copiere/editare token |
| `auth_tokens` | `user_id`, `kind`, `token_hash`, expirare, încercări; PK user/kind | FK utilizator | **X**: coduri verify/reset; numai emitere/revocare prin fluxurile de autentificare |

Nu există tabele separate pentru share tokens, resetări, verificări sau planning metadata: acestea sunt în `trips`, respectiv `auth_tokens`. Nu există `roles`, `permissions`, `settings`, `audit_logs`, `analytics_events`, `provider_requests`, `referral_rules`, `email_events` sau un registru versionat de migrări.

Nu există în prezent un tabel de conținut global potrivit unui CRUD admin larg. Viitoarele `referral_rules` și setări publice validate ar fi candidați mai buni decât un explorer care poate edita orice tabel.

## E. Configurarea sistemului și conținutul aplicației

Surse: [server/config.js](../server/config.js), [.env.example](../.env.example), [server/auth.js](../server/auth.js), [server/mail.js](../server/mail.js), [server/uploads.js](../server/uploads.js).

| Zonă | Sursa și comportamentul actual | Ce poate deveni administrabil |
|---|---|---|
| OpenAI | `.env`: `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_IMAGE_MODEL`; URL fix în `server/ai.js` | Model din listă validată, enable/disable, cote; cheia rămâne pe server |
| Timeout AI | Cod: implicit 120 secunde; generarea numelor 20 secunde | Eventual limite validate, numai super-admin; nu timeout arbitrar din browser |
| Activare AI | Deducere din prezența cheii/modelului; fără feature flag persistent | Flag separat de prezența acreditărilor |
| Google | `GOOGLE_MAPS_API_KEY`; Places API (New) și Time Zone API; endpointuri fixe în cod | Stare, funcții permise, cote; restricțiile cheii în Google Cloud |
| Fotografii | Proxy autentificat, atribuire; token HMAC legat de utilizator, 15 minute, secret aleator în proces | Monitorizare; nu editor al tokenurilor sau cheii |
| Restaurante | `meal-options.js`: maximum cinci rezultate, rază 1.500 m/1.000 m, până la trei căutări, cache 10 minute/max. 200 contexte în memorie | Limite validate și feature flag, după măsurarea costurilor; preferințele rămân per excursie |
| SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Sender și template-uri cu validare; host/transport gestionate de operator, parola secretă |
| E-mailuri verify/reset | Text în `server/auth.js`; durate și încercări în cod | Template-uri versionate; fără afișarea tokenurilor sau mesajelor sensibile în log viewer |
| Uploaduri | `UPLOAD_DIR`, implicit `.local/uploads`; 10 MB/fișier în cod, PDF/PNG/JPEG/GIF/WebP; un fișier per upload, maximum 100 atașamente/rezervare | Cote și tipuri/limite din listă strictă; calea fizică rămâne server-only |
| Securitate sesiuni | Șapte zile, cookie și reguli Origin în cod/config; expirările curățate orar | Politici super-admin, reautentificare; nu modificare liberă a flagurilor de cookie |
| Înregistrare | Mereu disponibilă; fără invitații/flag | Flag validat, păstrând posibilitatea de recuperare a contului |
| Referral | `REFERRAL_LINKS_FILE`, implicit `.local/referrals.json`; fișierul implicit **lipsește local** | CRUD cu preview/validare de host și identitate; fără secrete brute |
| URL/port/host | `APP_URL`, `HOST`, `PORT` | Configurare de infrastructură; nu un simplu câmp editabil de admin |
| Monedă | Câmpuri per excursie în DB; fallback EUR în `StepTrip.jsx`; schimburi în `currencyUtils.js` | Default global validat, fără rescrierea monedelor excursiilor existente |
| Maintenance | Nu există mod sau mesaj de mentenanță | Flag/mesaj, super-admin, cu acces de recuperare și endpoint health disponibil |

Rate limits actuale: API general 300/minut/IP; autentificare 30/15 minute/IP pentru fluxurile de la register în jos; AI 10/minut/utilizator; Places 60/minut/utilizator; generare/preview/PDF împart un limitator de itinerar de 10/minut/utilizator; mese 20/minut/utilizator. Toate sunt valori în cod. Nu sunt plafoane de cost zilnic, tokenuri sau stocare. Randarea PDF are și maximum două procese concurente per proces Node.

### Identitate, conținut și SEO

| Element | Locație/stare |
|---|---|
| Nume aplicație | Hardcodat în `index.html`, `public/manifest.json`, Home/Profile/TripUI/AuthLayout, e-mailuri și PDF |
| Logo/favicon | `public/favicon.svg`; elemente Compass + text în componente; nu brand configurat în DB |
| Text homepage | `src/pages/Home.jsx`, hardcodat; homepage-ul este protejat prin login |
| Support email | Nu am găsit setare/adresă de suport sau rută de suport. `SMTP_FROM` este expeditor, nu helpdesk |
| Imagine social/share | Nu există metadate Open Graph/Twitter sau imagine socială dedicată configurată |
| Imagini călătorie | Active locale în `public/media/`; cover per trip în DB; mapping în `src/lib/travel-types.js`, `public/media/travel/*.svg` |
| Terms / Privacy | Nu am găsit pagini/rute/linkuri active dedicate |
| Maintenance message | Lipsește |
| Meta title | Titlu static TripSync în `index.html`; nu un sistem SEO per pagină |
| Meta description / Open Graph / Twitter | Lipsesc în shell-ul activ |
| Sitemap / robots.txt | Nu există în `public/`; politica indexării paginilor partajate trebuie decisă explicit |
| Analytics/marketing | Nu există tracking integrat sau panou de campanii. `recharts` și Stripe în manifest nu dovedesc existența analytics/plăților |

`hotel-page.js` citește meta taguri de pe pagini externe pentru importul hotelurilor; acesta **nu** este SEO al TripSync. Pentru o aplicație privată, nu este necesară clonarea unei suite marketing. Sunt utile o pagină publică de prezentare și politici clare de indexare/confidențialitate, dacă se dorește lansare publică.

## F. Logare și audit

| Eveniment | Implementare și persistență |
|---|---|
| Pornire/API | `console.log/error`; erorile HTTP >=500 sunt logate cu cod sau mesaj. Nu există logger structurat/request ID comun |
| Login/logout/register/reset | Nu există jurnal de evenimente reușite/eșuate; sesiunile/tokenurile sunt stare curentă, nu istoric |
| OpenAI/Google | `provider-errors.js` loghează numele serviciului, status, cod sanitizat, request ID și eroare de rețea; fără corpuri, prompturi sau antete |
| Upload/download | Nu există jurnal de acces sau evenimente de upload. Există rânduri cu data creării, nu istoric de descărcări |
| Curățare fișiere | Erori în consolă; retry orar pentru fișiere eligibile. Fără tabel de joburi/rezultate |
| SMTP | Trimiterea reușită nu are registru; erorile propagate pot ajunge la loggerul generic. În dev mesajele sunt fișiere text |
| Generare itinerar | Ultima stare/conflicte/generație în `trips.itinerary_meta`; nu istoric complet al tuturor încercărilor |
| Acțiuni utilizator/admin | Fără tracking/audit central |
| Origin/rate limit/401/403 | Răspunsuri de protecție; fără jurnal dedicat de securitate |

În `.local/` există `dev-live.log`, `dev-live-error.log`, rapoarte de test, capturi, audituri npm și loguri MySQL. Fișierele deja scrise supraviețuiesc restartului, dar **aplicația nu configurează automat rotația/retenția consolei**; `scripts/dev.mjs` moștenește stdout/stderr. Prezența unor loguri locale nu garantează logging de producție.

`.local/mail/` și `MAIL_OUTBOX` sunt outbox de dezvoltare, **nu log viewer sigur**: pot conține adrese, coduri și linkuri de resetare. Nu au retenție automată. Artefactele browser pot conține capturi ale datelor, iar profilurile Chrome pot conține stare de autentificare. Nu trebuie expuse în Admin sau publicate.

Loggerul furnizorilor filtrează datele deliberat; loggerul generic `error.message` nu reprezintă o politică globală de redactare. Un viitor viewer trebuie să consume evenimente structurate, filtrate, cu retenție, nu să citească arbitrar fișiere din `.local/`.

**Nu există tabel de audit.** Recomand evenimente cu actor, acțiune, țintă, rezultat, motiv, request ID, timestamp și modificări permise redactate. Exclude parole, hash-uri, tokenuri, chei, conținutul pașapoartelor, prompturi complete și note alimentare/medicale. Jurnalul nu trebuie să poată fi șters/editat de operatorul ale cărui acțiuni le înregistrează.

## G. Analytics

**Disponibil acum:** statistici personale ale excursiilor/locurilor vizitate în UI și starea planurilor individuale. **Nu există analytics administrativ global.**

| Metrică | Derivabilă din DB actuală? | Limită |
|---|---|---|
| Total utilizatori / înregistrări pe zi | Da, users + created_date | Numai conturile încă existente |
| Utilizatori verificați | Da, email_verified | Nu este același lucru cu activ/activitate recentă |
| Utilizatori activi DAU/MAU | Nu | Sesiuni neexpirate înseamnă sesiuni valide, nu activitate măsurată |
| Excursii create, destinații, stări | Da, trips | Nu reconstruiește istoricul rândurilor șterse |
| Excursii cu itinerar/ultimă generare | Da, item-uri + meta | `plan_version` se schimbă și la editare/alegerea mesei; nu este contor exact de generări AI |
| Număr generări, reîncercări, erori în timp | Nu | Necesită evenimente |
| Excursii cu partajare activă | Da, share_enabled | Vizualizările și accesările linkurilor nu sunt măsurate |
| Uploaduri/atașamente | Da, număr și dată | Nu sunt totaluri istorice; bytes/quota lipsesc |
| Exporturi PDF | Nu | Necesită evenimente |
| Cereri OpenAI/Google, latență, cost/tokenuri | Nu | Răspunsurile furnizorului nu sunt agregate/persistate pentru acest scop |
| Erori de programare actuale | Parțial, itinerary_meta | Nu reprezintă rata erorilor API sau istoricul incidentelor |

În prima versiune sunt suficiente agregări fără conținut privat. Trackingul viitor trebuie limitat la evenimente operaționale necesare, cu retenție și definiții explicite ale metricilor.

## H. Furnizori, sănătate și referrals

### Sănătate

| Sistem | Diagnostic actual | Ce ar trebui să arate System Health |
|---|---|---|
| Express + MySQL | GET `/api/health`: execută SELECT 1, 200/503. Verificat acum 200 | Stare, latență, versiune aplicație și momentul verificării; fără detalii SQL/credentiale publice |
| OpenAI | `/api/config` indică doar cheie+model prezente; erori la apelul real | Configurat/neconfigurat, model permis, ultima reușită/eroare sanitizată, quota măsurată. Test explicit limitat, posibil taxabil |
| Google | `/api/config.places` indică prezența cheii | Ultima reușită, API folosit, erori/restricții fără cheie. Nu test pentru fiecare încărcare a paginii |
| SMTP | Nu există endpoint verify/send-test sau delivery history | Configurat, verificare conexiune controlată, test către adresă verificată, ultima livrare/eșec |
| Fișiere | Director local; fără healthcheck de capacitate sau integritate | Spațiu liber, quota, volume montate, probe controlate și număr de fișiere lipsă/orfane |
| PDF | Erori returnate când Chrome nu rulează; fără readiness pentru Chrome | Binar disponibil, capacitate, ultimul export reușit; fără a porni Chrome la fiecare refresh |

Configurația locală are OpenAI/model text/model imagine și Google setate. SMTP host/user/password nu sunt setate. Nu am apelat furnizorii în acest audit; testele reale anterioare sunt în `FOOD_AND_CHANGE_POLISH.md`. Lipsa unui healthcheck SMTP nu înseamnă că e-mailul este funcțional.

### Referral management

Sursa exactă: [server/referrals.js](../server/referrals.js) citește `config.referralFile`, rezolvat din `REFERRAL_LINKS_FILE` sau `.local/referrals.json`. În mediul local inspectat se folosește implicitul și fișierul **nu există**. Există exemplul [server/referrals.example.json](../server/referrals.example.json), dar acesta nu este încărcat automat.

Regulile conțin `allowed_hosts` și `rules`. Asocierea se face după `place_id`, apoi `selection_id`, sau perechea normalizată `name` + `destination`. Sunt eligibile vizitele cu bilet `needed`/`to_verify`. URL-ul exact sau șablonul admite substituții codificate pentru nume, destinație, place ID, dată și selection ID. Sunt cerute HTTPS, host permis, lipsa credentialelor în URL și completarea validă a placeholderelor.

Frontendul primește numai obiectul final `booking` cu URL și etichetă, nu configurația completă. Nu există configurare/click tracking/conversii în UI. Dacă regula lipsește, poate fi folosit `source_url` HTTPS al vizitei ca **Find tickets / Official source**; aceasta nu dovedește existența unei relații affiliate. Fără sursă validă, butonul lipsește.

Managementul prin Admin este practic. Un fișier privat versionat este suficient pentru un singur operator și puține reguli. Pentru mai mulți operatori/replici, `referral_rules` în DB cu activare, versiune, audit, preview și allowlist ar fi mai potrivit. Identificatorul affiliate destinat URL-ului public nu este o cheie API secretă; acreditările furnizorului nu trebuie puse în link.

## I. Base44: ce aparținea platformei

`base44/entities/*.jsonc` păstrează vechi reguli care menționează `role: admin`. `base44/functions/getSharedTrip/entry.ts` folosește vechiul service role. Aceste fișiere nu sunt încărcate de aplicația standalone. `migration-backup/` este exportul istoric, nu un modul activ.

| Arie veche Base44 | Scopul ariei | Echivalent TripSync / unde | Recomandare | Prioritate |
|---|---|---|---|---|
| Overview | Rezumat operare aplicație | Nu; Dashboard actual este per excursie | Dashboard operațional redus | ESSENTIAL |
| App Users | Conturi și acces | Auth local, fără management global | Users + roluri și suspendare | ESSENTIAL |
| Data | Explorer/CRUD entități | MySQL + API owner-scoped | Diagnostic și operații limitate; fără SQL arbitrar | USEFUL |
| Analytics | Statistici aplicație | Doar date derivabile | Agregări inițiale, evenimente ulterior | USEFUL |
| Marketing | Promovare/SEO/campanii | Nu există suite exportată | Numai nevoi reale de conținut/SEO | OPTIONAL |
| Domains | Domenii/găzduire/TLS | APP_URL și viitoarea infrastructură | Configurare la host/DNS; nu clona UI | DO NOT RECREATE |
| Integrations | Conectare furnizori | OpenAI/Google/SMTP backend | Status, limite și controale non-secrete | ESSENTIAL |
| Security | Politici de acces | Owner checks, auth, Origin, rate limits | Admin autorizat, MFA, audit și revocare | ESSENTIAL |
| Code | Editor/deployment platformă | Cod local + build | Repository și pipeline; fără editor/shell web | DO NOT RECREATE |
| Logs | Diagnostic platformă | Consolă și artefacte locale | Loguri sanitizate și audit persistent | ESSENTIAL |
| API | API platformă | Express și client local | Documentare internă; fără API explorer privilegiat liber | USEFUL |
| Settings | Setări aplicație | env/cod/DB per trip | Setări limitate și versionate | USEFUL |
| Authentication | Configurarea identității | Autentificare locală | Politici, sesiuni și recuperare controlată | ESSENTIAL |
| Agents | Agenți administrați de platformă | Nicio implementare runtime exportată | Apelurile AI actuale sunt funcții dedicate, nu agent platform | DO NOT RECREATE |
| Workflows | Automatizări platformă | Funcții Express; timer local de curățare | Nu există motor workflow; joburi doar dacă apare nevoie | DO NOT RECREATE |
| MCP | Integrare protocol/platformă | Vechiul OAuthConsent în backup; fără serviciu activ | Nu este necesar pentru TripSync actual | DO NOT RECREATE |
| Secrets | Credentiale administrate de platformă | `.env` și procesul serverului | Folosește secrets ale infrastructurii; admin vede doar starea | DO NOT RECREATE |

**EXISTS IN STANDALONE:** integrări explicite AI/Places/SMTP, fluxuri de planificare, timer de curățare. **LEGACY/REFERENCE ONLY:** politici Base44/service role, vechiul MCP consent UI. **BASE44 PLATFORM ONLY în materialul inspectat:** panoul de agenți, designer workflows, manager domenii/secrets și editorul de cod al platformei. Nu există dovezi locale pentru reproducerea completă a funcțiilor acelor panouri.

## J. Funcții administrative esențiale lipsă

1. Roluri persistente, middleware de autorizare și bootstrap sigur al primului super-admin.
2. Listă/căutare utilizatori, suspendare/reactivare și revocarea sesiunilor.
3. Audit persistent pentru acțiuni privilegiate și acces la date sensibile.
4. Rezumat operațional, health intern și erori sanitizate.
5. Controlul înscrierii și consumului AI/Google/upload pentru lansare publică.
6. Procedură de ștergere cont/date/fișiere și restaurare din backup.
7. Politică explicită de suport pentru excursii și Travel Wallet.

Un backoffice complet cu 14 pagini nu este o condiție tehnică obligatorie pentru orice lansare. Pentru prima lansare publică recomand subsetul minimal de mai jos; funcțiile suport pot fi inițial proceduri operator controlate, nu CRUD generic.

## K. Structura recomandată TripSync Admin

Toate rutele și endpointurile din această secțiune sunt **propuneri inexistente în prezent**. ADMIN înseamnă operator suport limitat; SUPER ADMIN controlează politicile și privilegiile. Niciun rol nu primește automat documente private.

| Secțiune `/admin/...` | Informații și acțiuni | Date/API necesare | Nivel / înainte de producție |
|---|---|---|---|
| Dashboard | Totaluri, conturi noi, planuri cu probleme, storage și erori recente agregate | `GET /api/admin/overview`, agregări users/trips/uploads, evenimente noi | ADMIN; **da**, versiune minimală |
| Users | Căutare paginată, contact minim, verificare, rol/stare, count trips/files; suspendare, reactivare, revocare sesiuni, inițiere reset | `/users`, `/users/:id`, endpointuri de acțiune; stare/rol persistente | ADMIN pentru utilizatori obișnuiți; modificare privilegii SUPER ADMIN; **da** |
| Trips | Căutare globală pe owner/destinație/interval/stare, diagnostic redactat; acces conținut numai justificat; reparație preview/apply | `/trips`, `/trips/:id/diagnostics`; servicii existente adaptate explicit | ADMIN limitat; rezumat util înainte de lansare, reparații ulterior |
| Travel Wallet / Files | Număr, MIME, dimensiune, stare, lipsă/orfan; fără previzualizare implicită | `/files` DTO minim, size_bytes/job storage; acces excepțional separat | ADMIN metadate tehnice; acces conținut SUPER ADMIN + grant; politica **da**, UI avansat ulterior |
| Data / Records | Relații și integritate, căutare ID, preview reparație | `/data/records`, `/tools/integrity`; allowlist de entități/câmpuri | SUPER ADMIN; **nu** editor universal; ulterior |
| AI & Providers | Configurat, modele permise, enable, quota, consum, ultime erori; test limitat | `/providers/status`, `/providers/:name/check`, `/settings/providers`, request metrics | ADMIN status; SUPER ADMIN politici; status/cote **da** |
| Referral Links | Reguli, hosturi aprobate, target, preview, activare/dezactivare | `/referrals`, `/referrals/preview`; viitor referral_rules | ADMIN reguli, SUPER ADMIN allowlist; înainte numai dacă monetizarea e lansată |
| Analytics | Agregări, destinații, utilizare și cost, fără conținut documente | `/analytics`, DB existentă + evenimente viitoare | ADMIN; agregări utile, tracking avansat ulterior |
| Logs & Audit | Evenimente sanitizate, filtre, actor/țintă/rezultat, export restrâns | `/audit`, loguri structurate; audit_events append-only | ADMIN operațional, SUPER ADMIN audit privilegiat; **da** |
| System Health | DB/API, SMTP, provider status, storage, backup, Chrome | `/health`, probe whitelist și status joburi | ADMIN citire, SUPER ADMIN teste; **da** |
| Email | Stare SMTP, livrări/eșecuri, template-uri; trimitere test către adresă verificată | `/email/status`, `/email/events`, `/email/test`; evenimente fără corp/token | ADMIN stare, SUPER ADMIN test/config; SMTP **da**, editor template ulterior |
| App Settings | Nume/support/default currency/texte/imagini publice, valori validate | `/settings/app`, app_settings versionate | SUPER ADMIN inițial; **nu** necesită UI complet înainte de lansare |
| Security | Roluri privilegiate, MFA, sesiuni, înscriere, politici și evenimente | `/security/...`, `/users/:id/role`, revocări | SUPER ADMIN; **da** pentru roluri și acces admin |
| Maintenance / Tools | Stare backup/joburi, verificare integritate, preview curățare, mentenanță | `/maintenance`, `/jobs`, operații whitelisted | SUPER ADMIN; backup/restore **da**, butoanele avansate ulterior |

În prima versiune, AI & Providers, Email și Health pot împărți aceeași pagină; Analytics poate începe în Dashboard; Files rămâne numai metadate. Nu este necesar un meniu mare gol.

## L. Modelul de securitate propus și confidențialitatea Wallet

### Matrice de acces

| Resursă/acțiune | USER | ADMIN | SUPER ADMIN |
|---|---|---|---|
| Conturi | Profil propriu | Contact/stare minimă utilizatori obișnuiți, suport auditat | Roluri privilegiate și politici; protejarea ultimului super-admin |
| Excursii | Propriile date | Rezumat redactat; detalii cu scop/grant suport | Acces justificat și auditat, nu browsing implicit |
| Analytics | Propriile statistici | Agregări | Agregări/politici |
| Loguri | Mesaje proprii de eroare | Sanitizate, acces operațional | Audit privilegiat și retenție; fără editarea evenimentelor |
| Provider health | Capabilitățile publice actuale | Status fără acreditări | Teste/politici/model/cote |
| Setări sistem | Preferințe personale | Citire limitată | Schimbări validate, reautentificare și audit |
| Referral | Linkurile finale | Reguli pe hosturi aprobate | Allowlist și politici comerciale |
| Ștergere cont | Solicitare pentru contul propriu | Poate iniția cerere, nu ștergere privilegiată unilaterală | Aprobare și job auditat; reautentificare, protejare ultimului super-admin |
| Wallet metadate | Propriile date | Număr, MIME, bytes, stare; nu nume originale/note/persoane implicit | Câmpuri sensibile numai justificate |
| Wallet conținut | Propriile documente | **Interzis implicit** | **Interzis implicit**; excepție explicită, temporară și auditată |
| Secrete | Niciodată | Niciodată | Fără citire brută în browser; rotație prin infrastructură |

### Implementare recomandată, fără aplicare acum

- `/admin/*` are guard pentru experiența utilizatorului; **fiecare** `/api/admin/*` verifică pe server sesiunea, starea contului, rolul și permisiunea acțiunii. Nu reutiliza `requireUser` drept control admin.
- Păstrează API-urile obișnuite owner-scoped, inclusiv pentru administratori. Construiește servicii explicite pentru operațiile globale; nu adăuga un bypass general în `owned()`.
- Rolul se citește din DB, nu din body, localStorage sau declarația frontendului. Suspendarea este verificată la încărcarea sesiunii; revocă sesiunile când starea/rolul se schimbă.
- Primul super-admin se acordă prin comandă operator sigură, explicită, fără a transforma automat primul utilizator în admin. Fără cont/parolă implicită. Viitorul model trebuie să împiedice auto-escaladarea și eliminarea ultimului super-admin activ.
- MFA pentru conturile privilegiate; reautentificare recentă pentru schimbări de rol, ștergere, politici și acces excepțional la documente.
- Păstrează cookie HttpOnly/Secure, originea unică și protecția cu header/Origin. Nicio regulă CORS wildcard cu credentiale. Acțiuni privilegiate numai POST/PATCH/DELETE, rate limits și audit; lista/citirea nu declanșează mutații.
- Paginare și DTO-uri cu câmpuri permise; nicio serializare `SELECT *` către admin, nicio expunere a tokenurilor sau căilor fizice.
- Schimbările distructive folosesc motiv, preview/confirmare și protecție de versiune; nu înlocuiesc implicit itinerare existente. Configurațiile au validare, versiune și posibilitate de rollback.

### Politica pentru pașapoarte, acte, vize și asigurări

Metadatele pot fi sensibile: numele fișierului, persoana, data expirării și notele nu sunt „inofensive”. Adminul normal vede numai identificator opac, tip, dimensiune și stare tehnică. Nu primește URL de fișier și nu poate solicita o previzualizare prin simpla cunoaștere a ID-ului.

Pentru suport, recomand mai întâi diagnostic fără document și utilizatorul poate furniza o copie redactată. Dacă accesul la original este indispensabil: cerere cu motiv, consimțământ/autorizație explicită pentru fișierul exact, aprobare super-admin, reautentificare, grant cu expirare scurtă și jurnalizarea fiecărei vizualizări/descărcări. Grantul nu oferă acces la restul Wallet. Accesul de urgență trebuie separat și investigabil; notificarea utilizatorului unde este aplicabilă.

Nu implementa impersonare pentru a ocoli aceste reguli. Fișierele rămân în stocare privată. În prezent nu există criptare individuală gestionată de aplicație; operatorul cu acces OS/DB poate accesa fizic datele. Viitorul model de roluri nu înlocuiește permisiunile serverului, criptarea volumelor/backupurilor și restricționarea operatorilor infrastructurii.

## M. Secrete și valori care rămân pe server

**Numele variabilelor sunt enumerate fără valori.** Nu există în cod variabile JWT/session-secret necesare sesiunilor actuale; nu trebuie inventate în inventar.

| Clasă | Variabile / date | Politică |
|---|---|---|
| A — secrete server-only existente | `OPENAI_API_KEY`, `GOOGLE_MAPS_API_KEY`, `SMTP_PASSWORD`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` | Env/secrets manager; niciodată DTO admin, bundle frontend sau log |
| A — credentiale/context operațional privat | `SMTP_USER`, `MYSQL_USER`, `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Nu toate sunt secrete criptografice, dar nu se publică. Modificările de conexiune rămân operator-only |
| B — valori non-secrete administrabile cu validare | `OPENAI_MODEL`, `OPENAI_IMAGE_MODEL`, `SMTP_FROM` | Pot avea management restrâns. Viitoarele enable flags, cote, default currency/support și limite upload nu sunt variabile deja implementate |
| Server-only infrastructură | `NODE_ENV`, `HOST`, `PORT`, `APP_URL`, `TRUST_PROXY`, `UPLOAD_DIR`, `MAIL_OUTBOX`, `REFERRAL_LINKS_FILE`, `CHROME_PATH`, `MYSQL_TEST_DATABASE` | Nu sunt secrete în sine; căi/runtime/proxy/medii nu se schimbă liber din UI. Unele sunt opționale și lipsesc din `.env` local |
| Date secrete fără env dedicat | Tokenuri sesiune/reset/verify/share; secretul HMAC foto generat în memorie | Nu se afișează în admin/loguri; share URL numai proprietarului în fluxul existent |

`MYSQL_ROOT_PASSWORD` este pentru provisioning/pornirea locală sau container, nu pentru accesul normal Express. Separă contul de runtime de credentialele de migrare/provisioning în producție.

**C — posibilă stocare criptată în DB, numai dacă apare o nevoie reală:** credentiale per tenant/per utilizator sau SMTP per organizație. Ar necesita criptare cu cheie externă DB, rotație, ACL și acces write-only/masked în admin; nici super-adminul nu ar primi plaintext în browser. Pentru actualul deployment cu furnizori globali, secrets manager/env este soluția mai simplă. Acest mecanism nu există și nu este propus ca cerință imediată.

## N. Ce poate fi gestionat din Admin și ce aparține deploymentului

Admin poate gestiona, după implementarea autorizării: starea conturilor, roluri prin super-admin, referral rules validate, modele aprobate, activare funcții, cote, texte/support/defaults publice, mesaje de mentenanță și monitorizare. Modificările se înregistrează în audit.

Deploymentul păstrează: DNS, certificate HTTPS, reverse proxy, porturi, baze de date, căi fizice, volume, credentiale, executabil Chrome, upgrade-uri de pachete și migrări. Nu expune `npm`, PowerShell, shell, SQL, import arbitrar sau scriere în `.env` printr-un panou web.

### Situația pentru publicare

- Vite produce `dist/`; Express servește `dist` și fallback SPA după `/api`. Clientul folosește URL-uri relative `/api` și cookie same-origin. În dev, Vite pe loopback face proxy către Express.
- Nu există CORS cross-domain general; arhitectura actuală presupune frontend și API pe aceeași origine. Protecția mutațiilor verifică headerul și Origin; fără Origin, headerul cerut rămâne obligatoriu.
- `server/index.js` refuză producția fără SMTP_HOST și APP_URL HTTPS. Acesta verifică prezența configurării, nu validitatea credentialelor SMTP, DNS sau certificatului.
- `TRUST_PROXY=1` înseamnă un hop proxy; trebuie să corespundă topologiei și backendul să nu fie accesibil direct ocolind proxy-ul.
- MySQL folosește pool de zece conexiuni, UTC/dateStrings. Nu este configurat TLS pentru conexiunea MySQL în `server/config.js`; pentru DB la distanță trebuie proiectat transportul sigur.
- `.local/uploads` și MySQL sunt persistente numai dacă discul/volumul este persistent. Compose conține numai MySQL cu volum și port loopback; nu este un deployment complet Express/reverse-proxy.
- Migrarea este script aditiv, idempotent, rulat explicit; nu există istoric de versiuni al migrărilor/rollback. Nu rula migrări din cereri web.
- `npm start` rulează Node, fără supervisor de producție configurat. Există închidere SIGINT/SIGTERM, nu restart automat Node, alertare, backup automat sau rotație de loguri.
- `.env` este sursa backend globală; testele separă DB prin `MYSQL_TEST_DATABASE`. Staging/producție cu credentiale, DB și volume separate trebuie pregătite.
- Cache-ul meselor, previzualizările AI de 20 minute, secretul fotografiilor și limitatoarele sunt în memorie. La restart expiră funcțional; într-un cluster cererile ajunse pe alt proces pot eșua. Prima publicare poate folosi un singur proces; scalarea cere proiectare explicită a stării partajate/afinității.
- Pentru PDF este necesar Chrome pe server. API-ul nu are încă un healthcheck separat pentru acesta.
- Vite blochează directoarele interne; Express servește numai buildul și uploadurile autentificate. Reverse proxy-ul trebuie să păstreze această separare. `.env`, `.local`, `base44`, `migration-backup`, sursa backend și artefactele de test nu sunt directoare publice.
- Backupul trebuie să includă DB și fișierele private, cu restaurare verificată. Schimbarea unui server nu importă automat datele vechi Base44.

## O. Modificări DB propuse — NEAPLICATE

| Modificare | Necesitate / precauții |
|---|---|
| `users.role`, `users.status`, câmpuri suspendare | Valori validate USER/ADMIN/SUPER_ADMIN și active/suspended; backfill sigur la user/active, fără promovare automată |
| `audit_events` | Actor, acțiune, țintă, rezultat, motiv, moment, request ID, modificări redactate; append-only la nivel de aplicație/permisiuni |
| `sessions` metadate opționale | created_at, last_seen_at și informații minimale de dispozitiv dacă necesare; revocare fără expunerea tokenului |
| MFA pentru conturi privilegiate | Secrete protejate și coduri de recuperare hash-uite; design separat înainte de aplicare |
| `uploads.size_bytes` și stări tehnice | Măsurare read-only/backfill al fișierelor, lipsurile raportate; nu presupune că fiecare rând are fișier valid |
| `file_access_grants` | Numai dacă se implementează suport cu acces excepțional: fișier exact, actor, aprobare, scop, expirare; audit la fiecare acces |
| `app_settings` | Allowlist de chei non-secrete, tip, versiune, autor; fără tabel generic care permite suprascrierea oricărui env |
| `provider_events` / agregări de utilizare | Furnizor, operație, rezultat, latență, tokenuri/cost când disponibile, fără prompt/corp fișier; retenție limitată |
| `referral_rules` | Opțional când administrează mai mulți operatori; validare exactă a targetului, host, versiune |
| `email_events` | Metadata livrare/eșec și template, fără tokenuri sau corp; destinatari minimizați |
| `maintenance_jobs` / cereri de ștergere | Status, idempotency, progres, retry; coordonează DB și fișierele fizice |
| `analytics_events` | Numai pentru metrici care nu pot fi derivate; nu obligatoriu un motor general de tracking |

Nu sunt necesare rescrierea tabelelor de planificare sau migrarea la alt framework. Fiecare modificare trebuie să fie aditivă, testată pe baza separată, cu compatibilitate pentru conturile/excursiile existente.

## P. Backend admin propus — NEIMPLEMENTAT

Prefix obligatoriu `/api/admin`; autentificare + cont activ + permisiune server-side + audit pentru operații sensibile.

| Endpoint propus | Scop/limită |
|---|---|
| GET `/overview` | Agregări redactate |
| GET `/users`, `/users/:id` | Paginare, căutare, DTO fără acreditări |
| POST `/users/:id/suspend`, `/reactivate`, `/revoke-sessions`, `/password-reset` | Acțiuni dedicate, auditate; resetul trimite numai utilizatorului |
| PATCH `/users/:id/role` | Super-admin, reautentificare, fără pierderea ultimului cont privilegiat |
| POST `/users/:id/deletion-preview`, `/deletion-requests` | Arată impactul și pornește proces controlat; fără DELETE SQL generic |
| GET `/trips`, `/trips/:id/diagnostics` | Rezumat/diagnostic, fără documente private |
| POST `/trips/:id/repair-preview`, `/repair-apply` | Servicii de domeniu, versiune și token de preview; nu regenerare la deschidere |
| GET `/files` | Numai metadata permisă |
| POST `/file-access-requests`, `/file-access-requests/:id/approve` | Excepție limitată și auditată |
| GET `/files/:id/content` | Numai cu grant activ + permisiune, no-store, audit; nu simplu rol admin |
| GET `/providers/status`, POST `/providers/:name/check` | Allowlist fixă, rate limit, cost comunicat; nu URL arbitrar |
| GET/PATCH `/settings/app`, `/settings/providers` | Scheme validate, versiune, fără chei brute |
| GET/POST/PATCH `/referrals`, POST `/referrals/preview` | CRUD dedicat + validarea hostului/țintei |
| GET `/analytics`, `/audit`, `/health` | Filtre limitate, sanitizare, paginare |
| GET `/email/status`, `/email/events`; POST `/email/test` | Fără acces la outboxul cu tokenuri; destinatari verificați |
| POST `/tools/integrity-preview`, `/tools/cleanup-preview`, `/tools/cleanup-apply`; GET `/jobs/:id` | Operații whitelist, impact inspectabil, fără shell/SQL liber |
| PATCH `/maintenance` | Super-admin, recuperare sigură, jurnalizare |

Rutele de mai sus sunt o schiță de contract, nu promisiunea că există. Endpointurile owner-scoped actuale rămân funcționale și nu sunt extinse implicit către toți utilizatorii.

## Q. Ordinea recomandată

### PHASE A — REQUIRED BEFORE PRODUCTION

1. **Fundație admin:** model persistent rol/stare, bootstrap explicit, autorizare per endpoint, MFA pentru privilegiați, audit și protejarea ultimului super-admin. Teste pentru 401/403, escaladare, suspendare și izolarea datelor.
2. **Backoffice minimal:** Dashboard/Users/Health/Logs cu DTO-uri limitate; suspendare, revocare sesiuni și reset prin e-mail. Politică Wallet fără acces implicit la conținut.
3. **Controlul costului și abuzului:** politică înscriere, cote AI/Places/stocare, monitorizare erori și alerte; protecția resurselor PDF/upload. Rate limits actuale se păstrează.
4. **Operare:** HTTPS/origin/proxy corect, SMTP verificat, medii separate, process supervisor, loguri cu retenție/redactare, volume persistente, acces OS/DB minim, backup și restaurare testată, Chrome disponibil.
5. **Date personale:** procedură auditată de ștergere cont + fișiere și comunicarea clară a utilizării furnizorilor. Politica de confidențialitate/termenii necesită conținut adecvat aplicației, nu copierea panoului Base44.

### PHASE B — IMPORTANT AFTER LAUNCH

Trip diagnostics și reparații controlate, referral management în DB dacă monetizarea o cere, metrici de consum/latente/cost, email delivery events, evidența sesiunilor, storage inventory/cleanup cu preview, setări publice și provider settings versionate. Dacă accesul excepțional la documente devine necesar, implementarea granturilor și auditului precedă butonul de vizualizare.

### PHASE C — OPTIONAL

Analytics avansat, conținut/SEO pentru landing page, template editor, joburi automate specifice și suport multilingv. Multi-instance cere rezolvarea stării în memorie înainte de scalare. Agenții generici, MCP, workflow builder, editorul de cod, managerul DNS și un browser de secrete nu sunt obiective ale adminului TripSync actual.

## Concluzie și următorul pas

TripSync are o bază funcțională de autentificare și proprietate a datelor, dar **nu are backoffice sau roluri administrative reale**. Prioritatea este administrarea sigură a conturilor și operarea aplicației, nu recrearea Base44.

Acest audit a creat numai `docs/ADMIN_AUDIT.md`. Nu este necesară nicio comandă de instalare, migrare sau repornire pentru citirea raportului. Implementarea propusă rămâne pentru o cerere separată.
