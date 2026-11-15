# Cerințe server pentru modul Spectator (FastAPI / Hugging Face)

Clientul trimite și așteaptă următoarele. Fără ele, restul aplicației merge, dar spectatorii nu vor vedea jucătorii.

## Mesaje WebSocket primite de la client
- `{"type":"join","name":"...","spectate":true|false}` – la intrare (și în timpul unui joc în desfășurare).
- `{"type":"spectate","on":true|false}` – jucătorul devine spectator (din lobby sau după ce a pierdut) sau revine jucător (doar în lobby).

## Reguli
1. Jucătorul marcat spectator: `role:"spectator"` (sau `spec:true`) în `players[]` și în `me`. Păstrează `st` (un jucător pierdut rămâne `caught`).
2. Spectatorii NU primesc rol la `start`, NU intră în `nh`/`ns`, nu pot fi prinși și nu influențează condițiile de final (`all_caught`, `seekers_left`).
3. `start` se poate apăsa cu minim 2 jucători ne-spectatori.
4. Spectatorii pot ieși/intra oricând, inclusiv în timpul jocului. Sunt păstrați la `reset` (rămân spectatori până apasă „Intră ca jucător”).
5. **Vizibilitate pentru spectator:** în `state` (WS și `GET /api/room/{code}/state`) primește TOȚI jucătorii cu `lat`,`lng`, `role`, `st`, `live`, fără filtrarea de ping (`pt` poate lipsi). Poziția spectatorului se trimite ca la ceilalți jucători.
6. Ceilalți jucători văd spectatorii în `players[]` cu `role:"spectator"` și poziție (marcați albastru). Opțional: nu li se trimit pozițiile spectatorilor.
7. `POST /api/room/{code}/photo` și `/sos` acceptate și de la spectatori și de la jucătorii pierduți.
8. `caps[]` (locurile unde au fost prinși jucători) conțin `id, lat, lng, n, url, t` – clientul desenează „X” acolo.
