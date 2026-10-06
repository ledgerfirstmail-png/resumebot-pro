/**
 * PDF → plain text (ROADMAP E4), wrapping pdf-parse (pdf.js). Kept in its own
 * module so the heavy parser is only pulled in by the Node action and the
 * tests — never by the client bundle.
 */
import { installRenderShims } from "./renderShims";
// Bundling the worker module is pdf.js's documented in-process ("fake
// worker") mode: evaluating it self-registers `globalThis.pdfjsWorker`, so
// pdf.js never looks for a worker file on disk (which Convex's bundle doesn't
// ship). The module is pure worker logic — no DOM at module scope.
import * as pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";

if (pdfWorker.WorkerMessageHandler) {
  (globalThis as unknown as Record<string, unknown>).pdfjsWorker = pdfWorker;
}

/**
 * Extract the text layer of a PDF. Throws a friendly error for
 * password-protected or corrupt files; the technical cause is logged for
 * `convex logs`.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  // Shims must be in place before pdf.js's main module first evaluates.
  installRenderShims();
  const { PDFParse } = await import("pdf-parse");

  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Keep the technical cause visible in `convex logs` — the user-facing
    // error below stays friendly.
    console.warn("[extractResume] pdf.js getText failed:", message);
    if (/password|encrypt/i.test(message)) {
      throw new Error(
        "That PDF is password-protected — remove the password and try again (or paste the text instead).",
      );
    }
    throw new Error(
      "That PDF couldn't be read — it may be corrupt or a scanned image. Try a different export, or paste the text instead.",
    );
  } finally {
    await parser.destroy();
  }
}
