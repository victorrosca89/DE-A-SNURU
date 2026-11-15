# DE-A ȘNURU' (Android)
APK semnat construit de GitHub Actions (`.github/workflows/android.yml`), conectat la serverul de pe Hugging Face.
- `app/static/` – front-end (identic cu cel din Space)
- `android-src/` – Java nativ: `GameService` (fundal, GPS, notificări, alerte), `GamePlugin`, `MainActivity`, `SaveImagePlugin`
- `scripts/` – pregătirea fișierelor web și patch-uri Android (permisiuni, serviciu, semnare)
- `signing/` – cheia de semnare (vezi INSTRUCTIUNI.md)
