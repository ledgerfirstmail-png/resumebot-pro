/**
 * Pure helpers for the resume file upload flow (ROADMAP E4) — shared by the
 * wizard (client) and the `extractResume` Convex action (Node). PDF parsing
 * itself lives in `pdfText.ts` so pdf-parse never enters the client bundle.
 */

/** Client + server guard: resume files over this are rejected up front. */
export const MAX_RESUME_FILE_BYTES = 5 * 1024 * 1024;

/** Below this much extracted text there's nothing for the AI parser to read. */
export const MIN_EXTRACTED_CHARS = 120;

export type ResumeFileKind = "pdf" | "docx";

/** "%PDF" — every real PDF starts with this. */
function hasPdfMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 // F
  );
}

/** ZIP local/central headers (PK\x03\x04, PK\x05\x06, PK\x07\x08) — .docx is a zip. */
function hasZipMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 && // P
    bytes[1] === 0x4b && // K
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08)
  );
}

/**
 * What kind of resume file this is — requires the extension AND the magic
 * bytes to agree, so a renamed/corrupt file is rejected instead of parsed.
 * Returns null when we can't read it (the caller shows a friendly error).
 */
export function detectResumeFileKind(
  filename: string,
  bytes: Uint8Array,
): ResumeFileKind | null {
  const name = filename.trim().toLowerCase();
  if (name.endsWith(".pdf") && hasPdfMagic(bytes)) return "pdf";
  if (name.endsWith(".docx") && hasZipMagic(bytes)) return "docx";
  return null;
}

/** True when the name is one we support (used for a better error message). */
export function hasSupportedExtension(filename: string): boolean {
  const name = filename.trim().toLowerCase();
  return name.endsWith(".pdf") || name.endsWith(".docx");
}

/**
 * Bytes → base64 (portable: no Buffer on the client). Chunked so we never
 * spread more than 8k arguments into String.fromCharCode.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x2000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Tidy raw extractor output for the AI parse pass: normalize newlines, drop
 * control characters that PDFs/DOCXes love to emit, and collapse runaway
 * blank lines. The AI action applies its own 30k clip on top.
 */
export function normalizeExtractedText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    // Strip control characters (Cc) except tab and newline — PDFs and
    // DOCXes love to emit them; \p keeps this readable and lint-friendly.
    .replace(/[^\P{Cc}\t\n]/gu, "")
    // pdf-parse's page markers ("-- 2 of 5 --") are extractor chrome.
    .replace(/^--\s*\d+\s+of\s+\d+\s*--\s*$/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
