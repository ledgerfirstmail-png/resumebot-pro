"use node";

import { extractDocxText } from "@/lib/docxText";
import {
  MAX_RESUME_FILE_BYTES,
  MIN_EXTRACTED_CHARS,
  detectResumeFileKind,
  hasSupportedExtension,
  normalizeExtractedText,
} from "@/lib/resumeFile";
import { v } from "convex/values";
import { action } from "./_generated/server";

/**
 * E4 — read an uploaded resume file (.pdf / .docx) into plain text on the
 * server, where pdf.js and zip parsing stay out of the client bundle. The
 * caller then feeds the text to the existing `ai:parseResumeText` pass, so
 * this action costs no AI credits of its own — it's pure extraction.
 *
 * pdf-parse is imported lazily (see extractPdfText) so Convex's module
 * analysis of this file never evaluates pdf.js, and pdf.js never enters any
 * client bundle. pdfText installs the render shims before pdf.js loads.
 */
async function extractPdfTextLazy(bytes: Uint8Array): Promise<string> {
  const { extractPdfText } = await import("@/lib/pdfText");
  return await extractPdfText(bytes);
}

export const extractResumeText = action({
  args: { fileBase64: v.string(), filename: v.string() },
  handler: async (_ctx, { fileBase64, filename }) => {
    if (!filename.trim()) {
      throw new Error("That file has no name — try picking it again.");
    }

    // Reject oversized input before decoding it into memory.
    // base64 adds ~4/3 + padding; compare against the byte cap with slack.
    if (fileBase64.length > MAX_RESUME_FILE_BYTES * 1.4 + 1024) {
      throw new Error(
        `That file is over ${Math.round(MAX_RESUME_FILE_BYTES / (1024 * 1024))} MB — paste the text instead, or export a smaller copy.`,
      );
    }

    const bytes = Uint8Array.from(Buffer.from(fileBase64, "base64"));
    if (bytes.length === 0) {
      throw new Error("That file appears to be empty — try another export.");
    }
    if (bytes.length > MAX_RESUME_FILE_BYTES) {
      throw new Error(
        `That file is over ${Math.round(MAX_RESUME_FILE_BYTES / (1024 * 1024))} MB — paste the text instead, or export a smaller copy.`,
      );
    }

    const kind = detectResumeFileKind(filename, bytes);
    if (!kind) {
      throw new Error(
        hasSupportedExtension(filename)
          ? `“${filename}” doesn't look like a readable ${filename.toLowerCase().endsWith(".pdf") ? "PDF" : "Word document"} — re-export it, or paste the text instead.`
          : `Tailorly reads .pdf and .docx files — “${filename}” isn't one. Save your resume as PDF or DOCX, or paste the text instead.`,
      );
    }

    const raw =
      kind === "pdf"
        ? await extractPdfTextLazy(bytes)
        : extractDocxText(bytes);
    const text = normalizeExtractedText(raw);

    if (text.length < MIN_EXTRACTED_CHARS) {
      throw new Error(
        "Couldn't find readable text in that file — it may be a scanned image. Paste the text instead, or OCR it first.",
      );
    }

    return { text, kind, charCount: text.length };
  },
});
