# ModuleScan — PaddleOCR v9

Free browser-based OCR for module schedule photos.

## v9 fix
The previous build failed during PaddleOCR runtime initialization on iPhone Safari with:

`TypeError: Load failed`

This version:
- forces ONNX Runtime WebAssembly backend
- uses an explicit jsDelivr WASM path
- uses one thread for mobile compatibility
- disables SIMD for broader iPhone compatibility
- keeps PaddleOCR and the existing position-based table parser
- keeps Qty ignored
- keeps Tower No. and Level extraction
- keeps full on-screen diagnostics

## Deploy
Replace all repository files with this package, commit to `main`, and let Vercel redeploy.


## v10 fix
Technical Error Details is now outside the hidden Review Extracted Data card, so OCR startup failures are always visible immediately below the Extract Module Data section. The page automatically scrolls to the diagnostic box when OCR fails.
