# ModuleScan v8 — PaddleOCR main-thread diagnostic build

This version changes OCR startup to the simplest official PaddleOCR browser flow:

- main-thread OCR (no Worker)
- `ortOptions: { backend: "auto" }`
- direct `File` input to `ocr.predict()`
- full on-screen technical diagnostics if initialization or OCR fails

## Deploy
Replace the repository files with this package and commit to `main`. Vercel should redeploy automatically.

## Test
1. Open the Vercel site on iPhone.
2. Choose a JPG or PNG schedule photo.
3. Tap **Extract Data**.
4. If it fails, take a screenshot of the **Technical Error Details** box.

The app still keeps:
- position-based table parsing
- Qty ignored
- Tower No. and Level fields
- local database and CSV export
