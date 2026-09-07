# ModuleScan — PaddleOCR v7

Free browser-based OCR for module schedules.

## v7 changes
- Keeps PaddleOCR instead of switching back to plain Tesseract.js.
- Uses PaddleOCR Worker mode.
- Explicitly loads ONNX Runtime WASM from the official jsDelivr package path.
- Uses a single WASM thread for better iPhone Safari compatibility.
- Preprocesses schedule images with moderate upscaling, grayscale conversion and contrast enhancement before OCR.
- Keeps the existing position-based table parser and ignores Qty.
- Extracts Tower No. (for example A02) and Level (for example L38) from the schedule/tag structure.
