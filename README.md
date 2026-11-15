# DE-A ȘNURU' (Android)
APK semnat construit de GitHub Actions (`.github/workflows/android.yml`), conectat la serverul de pe Hugging Face.
- `app/static/` – front-end (identic cu cel din Space)
- `android-src/` – Java nativ: `GameService` (fundal, GPS, notificări, alerte), `GamePlugin`, `MainActivity`, `SaveImagePlugin`
- `scripts/` – pregătirea fișierelor web și patch-uri Android (permisiuni, serviciu, semnare)
- `signing/` – cheia de semnare (vezi INSTRUCTIUNI.md)

## Modificări v2.1
- **Notificări:** „SOS” nu mai apare permanent. Butonul SOS a fost scos din notificarea live; alerta SOS dispare când situația s-a încheiat, când deschizi aplicația sau după 60 s.
- **SOS → poză automată:** după confirmarea SOS (ține apăsat 2 s) se deschide camera; SOS-ul se trimite imediat, poza se atașează după aceea.
- **Cameră:** se alege obiectivul principal (wide), nu ultra-wide; rezervă pe camera sistemului pentru orice dispozitiv.
- **Hartă gri dark** din OpenStreetMap (fără CARTO).
- **Blur** (sticlă mată) pe HUD, butoane, carduri, ferestre și fundal.
- Butonul „Intră în cameră” este centrat, pe tot rândul.

## Modificări v2.2
- **Hartă:** OpenStreetMap în gri dark (dale OSM filtrate), fără CARTO.
- **Cameră:** obiectivul principal (wide, standard), cadru 4:3 ca în aplicația foto; ultra-wide doar evitat, rezervă pe camera sistemului.
- **Aspect:** sticlă mată (blur) rafinată, animații de intrare, vignetă pe hartă.
- **Notificări (și cu ecranul stins):** start de joc + rolul tău, 30 s de ascundere, pornirea vânătorii, 1 minut până la final, Hider prins, jucători care intră/ies din lobby, final de joc; ecranul se aprinde la alertele importante.
- **Reveal:** scos textul „Jump in”.
- **Spectator:** Hider roșu · Seeker galben · Spectator albastru · pierdut gri; „X” pe hartă unde a fost prins cineva; cei pierduți au SOS și buton „Intră ca spectator”; spectatorii văd locația tuturor și pot trimite poze. **Necesită serverul actualizat: vezi `SERVER_SPECTATE.md`.**
