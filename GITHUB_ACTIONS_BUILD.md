# GitHub Actions: Build APK

This repo includes a workflow that builds a **debug APK** on demand.

## How to use
1. Push this project to a GitHub repo (private is fine).
2. Go to **Actions** → **Build Android APK** → **Run workflow**.
3. Download the artifact **app-debug-apk** → `app-debug.apk`.

Notes:
- The workflow builds **debug** only (`assembleDebug`).
- For release signing, add a separate workflow with keystore secrets.
