import { jsPDF } from "jspdf";
import { describe, expect, it } from "vitest";
import { normalizeExtractedText } from "@/lib/resumeFile";
import { extractPdfText } from "@/lib/pdfText";

function makePdf(lines: string[]): Uint8Array {
  const doc = new jsPDF();
  if (lines.length > 0) {
    doc.setFontSize(11);
    doc.text(lines, 15, 20);
  }
  return new Uint8Array(doc.output("arraybuffer"));
}

describe("extractPdfText", () => {
  it(
    "extracts the text layer of a real PDF",
    async () => {
      const text = await extractPdfText(
        makePdf([
          "Ada Lovelace",
          "Senior Data Analyst",
          "EXPERIENCE",
          "- Built automated reporting pipelines in Python",
        ]),
      );
      expect(text).toContain("Ada Lovelace");
      expect(text).toContain("Senior Data Analyst");
      expect(text).toContain("Built automated reporting pipelines in Python");
    },
    30_000,
  );

  it(
    "normalizes a blank page to no usable text",
    async () => {
      // The raw layer still carries pdf-parse's page marker chrome.
      const raw = await extractPdfText(makePdf([]));
      expect(normalizeExtractedText(raw)).toBe("");
    },
    30_000,
  );

  it(
    "rejects bytes that aren't a PDF with a friendly error",
    async () => {
      await expect(
        extractPdfText(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])),
      ).rejects.toThrow(/couldn't be read/i);
    },
    30_000,
  );
});
