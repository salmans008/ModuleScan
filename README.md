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
