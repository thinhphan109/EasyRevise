# IELTS PDF Sources

This folder is the **local-only** drop zone for IELTS source PDFs that
the importer (`routes/ielts/importer.js`, Phase 4) reads.

## Rules

- **Nothing in this folder is committed** (see `.gitignore` rule
  `source-pdfs/**` below the placeholder `.gitkeep`).
- Files are read once, parsed by `lib/ielts/pdf-parser.js`, the
  resulting JSON draft lands in Postgres, and the PDF can then be
  deleted locally without affecting tests.
- For Vercel deploys the importer reads from a private Supabase
  Storage bucket (`ielts/source-pdfs/`) instead of this folder.

## Suggested layout

```
source-pdfs/
└─ ielts/
   ├─ cambridge-18/
   │   ├─ test-1.pdf
   │   ├─ test-2.pdf
   │   ├─ test-3.pdf
   │   └─ test-4.pdf
   ├─ cambridge-17/
   │   └─ ...
   └─ practice/
       └─ british-council-mock-1.pdf
```

## Naming convention

`<source>-<volume>-test-<n>.pdf`

Examples:

- `cambridge-18-test-2.pdf`
- `british-council-mock-1.pdf`
- `actual-test-2024-08.pdf`

The importer does not require this naming, but consistency makes
the admin UI cleaner.

## Adding a PDF

1. Drop the file into the right subfolder.
2. Open `/admin/` → IELTS → Import from PDF.
3. Choose the file, hit Parse.
4. Review the AI-parsed draft, edit any mistakes.
5. Save → publish.
