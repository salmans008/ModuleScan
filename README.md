# ModuleScan – Free OCR Edition v11

## What changed
PaddleOCR has been removed because its browser runtime repeatedly failed to load on iPhone Safari with:

`TypeError: Load failed`

This version uses **Tesseract.js** instead.

## Features
- Free browser-based OCR
- No API key
- No OpenAI API credits
- Works with camera or Files photo picker
- Image preprocessing for small schedule text
- Position-based table parsing
- Qty column ignored
- Module Details extracted
- Tag extracted
- Tower No. and Level detected and applied to all rows
- Manual review before saving
- CSV export
- Browser local database

## OCR corrections
The app applies code-specific cleanup for common OCR mistakes:
- O / D / Q → 0 near tower numbers
- B → 8 near level numbers
- Removes broken spaces in code-like text
- Normalizes A02 / L38 style values

## Deploy
1. Replace the existing repository files with all files from this package.
2. Commit directly to the `main` branch.
3. Vercel will redeploy automatically.
4. Open the site on iPhone and hard refresh if Safari cached the old version.

## Important
OCR accuracy depends heavily on the photo. Use a straight, close, well-lit image with the schedule filling most of the frame.
