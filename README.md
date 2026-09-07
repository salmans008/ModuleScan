# ModuleScan – Free AI OCR Edition

This version uses the official PaddleOCR.js browser SDK and runs OCR in the user's browser.

## Deploy on Vercel
1. Upload these files to the GitHub repository (replace the existing project).
2. In Vercel, import/redeploy the repository.
3. Vercel should detect Vite automatically.
4. Build command: `npm run build`
5. Output directory: `dist`

No paid OCR API key is required.

The first OCR run may take longer because the OCR model and browser runtime are loaded on demand.


## v5.1 iPhone compatibility fix

This release uses PaddleOCR's official quick-start style more closely:
- automatic backend selection (`backend: "auto"`)
- sends the uploaded `File` directly to OCR
- no forced CDN WASM path
- exact technical errors are shown in the app if initialization fails


Version 5.2: Improved iPhone/iPad photo picker compatibility.

Version 5.3: Fixes iPhone Files/HEIC uploads and accepts image files with missing MIME types.
