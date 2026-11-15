# PDF Forge

An ad-free file workspace for PDFs, ebooks, comics and everyday documents. Browse and pin files on your own device while keeping the original PDF editing and conversion tools. Windows is the first desktop target. The GitHub Pages version runs the same core workbench in a browser.

![PDF Forge](app/art/forge-hero.webp)

## Try it

- **Web:** [Open PDF Forge](https://johnbarsisa.github.io/pdf-forge/). Open an included PDF, EPUB or CBZ sample, or drop a file of your own.
- **Windows x64:** Download the portable ZIP from [GitHub Releases](https://github.com/JohnBarsisa/pdf-forge/releases). Extract the entire folder, then open `PDF Forge.exe`. This is an unsigned preview. CI build details are available under [Actions](https://github.com/JohnBarsisa/pdf-forge/actions/workflows/windows.yml).

## Run from source on Windows

Use Node.js 24 and PowerShell. Run these in the project folder:

```powershell
npm install
npm run vendor
npm run desktop
```

`npm run web` serves the browser version at http://127.0.0.1:4173. Run `npm test` after vendoring. To build the portable Windows archive from source, run `pwsh -NoProfile -File scripts/package-win.ps1`. It uses the installed x64 Electron runtime or verifies a direct download with Electron’s release checksum. Output goes to `out/`.

## File shelf and reader

- **Keep a shelf:** Open multiple files into tabs, search or filter by type and pin the ones you want to keep. Pinning saves a copy in this installation's local storage, not in the cloud. Removing a shelf copy leaves the original untouched. For PDFs, pinning stores the original input, not unsaved edits. Export an edited copy from the PDF reader.
- **Ebooks:** Reflowable, DRM-free EPUB and text-oriented FictionBook (FB2) with chapter navigation, font sizing and remembered positions. EPUBs show supported embedded raster images. Vendor styles, scripts, external resources, fixed-layout fidelity and FB2 images are not preserved.
- **Comics:** CBZ, standard uncompressed TAR-based CBT and ZIP archives with page images. Natural page order, page jump, fit page/width, and progress. RAR-based CBR and 7z-based CB7 are not supported.
- **Documents and images:** PDF, text-only DOCX (Word), TXT, Markdown as text, CSV/TSV, JSON, logs, JPG/JPEG, PNG, WebP, GIF, AVIF and BMP. Plain-text previews use UTF-8 or BOM-marked UTF-16. Readable formats are not all convertible or editable.
- **Examples:** Summit Field Notes (PDF), The Lantern Ridge (EPUB) and Signal at Dusk (CBZ). The ebook and comic are original samples. The browser and desktop builds include the same files.

## Current scope

| Tool | Works today |
| --- | --- |
| Viewer | Drag-and-drop, tabs, thumbnails, page navigation, fit / zoom, find text, printing |
| Edit and assemble | Add text overlays, pen, highlight, typed visual signatures, undo / redo, rotate, reorder, delete, merge and extract a range |
| Convert | JPG, PNG, TXT and plain Markdown to PDF. PDF to TXT, text-only DOCX or a current-page PNG/JPG |
| Office import | Desktop only. Install LibreOffice in the standard location to convert DOCX, XLSX, PPTX or OpenDocument files locally |
| Compress | Lossless structural optimization. No copy is saved if it would be as large or larger |
| Appearance | Soft dark, tinted light or system. Six accent palettes and compact spacing |

Visual signatures are not digital signatures. Editing an already signed document may invalidate its signature. Basic PDF text overlays use a Latin font. Scan OCR, editing existing paragraph layout, high-fidelity Word reconstruction, encryption and redaction are not in this preview. Password-protected documents can be opened for viewing and content export, but not modified in this build. Complex interactive features such as form fields and outlines may not survive page-copy operations. Use a copy rather than overwriting an original.

## Implementation

`app/` is a static ES module workbench using PDF.js to render and extract text, pdf-lib for PDF mutations and JSZip for DOCX packaging. `desktop/` provides a sandboxed Electron shell, local Save and Print dialogs, and an optional local LibreOffice adapter. The desktop UI is loaded from local assets, and outbound HTTP(S) is disabled in its renderer. The GitHub Pages workflow publishes only the browser workspace. The Windows workflow packages and checks the desktop executable separately.

Theme preferences, recent filenames/sizes, and reading position metadata stay on this device. File bytes are never uploaded by the app. Only files you explicitly pin are stored locally beyond the session. Third-party notices are bundled by `npm run vendor` and linked on the Privacy page.

PDF Forge is a Windows-first preview. macOS and the separate Unzipper app are not part of this release.
