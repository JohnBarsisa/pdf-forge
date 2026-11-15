# PDF Forge

An ad-free PDF workspace. Read, mark up, assemble and convert files on your own device. Windows is the first desktop target. The GitHub Pages version runs the same core workbench in a browser.

![PDF Forge](app/art/forge-hero.webp)

## Try it

- **Web:** [Open PDF Forge](https://johnbarsisa.github.io/pdf-forge/). Choose **Try sample** or drop your own PDF.
- **Windows x64:** Open [Actions](https://github.com/JohnBarsisa/pdf-forge/actions/workflows/windows.yml), choose a successful run and download the **PDF-Forge-Windows-x64** artifact. Extract the artifact and the Windows ZIP it contains before opening `PDF Forge.exe`. Keep the EXE beside the other files. This is an unsigned preview, not an installed or code-signed release.

## Run from source on Windows

Use Node.js 24 and PowerShell. Run these in the project folder:

```powershell
npm install
npm run vendor
npm run desktop
```

`npm run web` serves the browser version at http://127.0.0.1:4173. Run `npm test` after vendoring. To build the portable Windows archive from source, run `pwsh -NoProfile -File scripts/package-win.ps1`. It validates the x64 Electron download against Electron’s release checksum. Output goes to `out/`.

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

Theme preferences and recent filenames/sizes stay on this device. PDF bytes are not uploaded or kept in the browser's persistent storage. Third-party notices are bundled by `npm run vendor` and linked on the Privacy page.

PDF Forge is a Windows-first preview. macOS and the separate Unzipper app are not part of this release.
