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
- **Hartă dark mode** (CARTO dark, cu rezervă OpenStreetMap inversat).
- **Blur** (sticlă mată) pe HUD, butoane, carduri, ferestre și fundal.
- Butonul „Intră în cameră” este centrat, pe tot rândul.
