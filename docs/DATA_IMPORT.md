# Importul datelor

Importatorul este un utilitar local. Nu se conectează la Base44 și nu solicită acreditările vechii platforme. Mai întâi exportă înregistrările și descarcă fișierele pe care le deții.

## Format JSON

Un singur fișier JSON, cu câte un array pentru fiecare entitate. Exemplu minimal:

```json
{
  "User": [{ "id": "old-user-1", "email": "owner@example.com", "display_name": "Owner" }],
  "Trip": [{ "id": "old-trip-1", "created_by_id": "old-user-1", "name": "Roma", "destination": "Rome" }],
  "TripItem": [{ "id": "old-item-1", "trip_id": "old-trip-1", "title": "Hotel", "category": "stay" }],
  "PlaceSelection": [],
  "DayWindow": [],
  "ItineraryItem": [],
  "TodoBoard": [],
  "TodoItem": []
}
```

Păstrează toate câmpurile de aplicație din export, nu doar cele din exemplu. Definițiile se găsesc în server/schema/. Fișierele CSV trebuie convertite în acest format JSON înainte de import; importatorul nu ghicește tipurile din CSV.

## Proprietarii

Utilizatorii sunt identificați prin ID sau e-mail. Importatorul citește created_by_id, owner_id sau created_by. Copiii fără proprietar explicit moștenesc proprietarul excursiei sau listei. Un proprietar explicit necunoscut sau diferit de cel al părintelui oprește importul.

Dacă exportul nu conține deloc proprietari și toate datele aparțin aceleiași persoane, se poate folosi explicit:

    npm.cmd run data:import -- export.json --owner=owner@example.com

Nu folosi această opțiune pentru un export cu date aparținând mai multor persoane.

## Fișierele

Descarcă imaginile și documentele vechi într-un director local. Creează files.json care mapează fiecare URL vechi la un fișier, cu calea relativă la files.json:

```json
{
  "https://media.base44.com/example/avatar.png": "downloaded/avatar.png",
  "https://media.base44.com/example/ticket.pdf": "downloaded/ticket.pdf"
}
```

Sunt acceptate PNG, JPEG, GIF, WebP și PDF, până la 20 MB per fișier pentru import. Avatarele sunt incluse. Fișierele sunt copiate în stocarea privată, cu acces doar pentru proprietar. Linkurile către platforma veche fără mapare opresc importul. Linkurile externe obișnuite pot fi păstrate.

## Verificare și aplicare

    npm.cmd run data:import -- export.json --media-map=files.json

Aceasta este o verificare fără scrieri în baza de date. Verifică numărul de utilizatori, înregistrări și fișiere afișat. Nu validează existența unui server MySQL sau eventualele coliziuni cu date deja importate.

Cu MySQL pregătit și tabelele create:

    npm.cmd run data:import -- export.json --media-map=files.json --apply

Importul folosește o tranzacție. Coliziunile de ID/e-mail opresc importul; datele existente nu sunt suprascrise. Fișierele copiate de un import eșuat sunt curățate. Pentru importuri mari, verifică spațiul pe disc și lucrează pe o copie de bază de date.

ID-urile și datele de creare/modificare ale entităților sunt păstrate. Linkurile publice vechi sunt dezactivate: proprietarii pot activa partajarea după verificare. Parolele și sesiunile vechi nu sunt importate. Utilizatorii importați folosesc Forgot password pentru a stabili parola locală; configurează SMTP pentru livrarea reală a mesajelor.

După import, verifică totalurile, relațiile, accesul cu două conturi diferite, documentele, imaginile și un itinerar. Păstrează exportul original și backupul fișierelor până când verificarea este completă.
