/**
 * DOCX → plain text (ROADMAP E4). A .docx is a zip whose WordprocessingML
 * lives in `word/document.xml` — unzip it, keep paragraph/line breaks, drop
 * tags, decode entities, and hand the AI parser readable text.
 *
 * Server/test only: imported by the `extractResume` Convex action, never by
 * the client bundle (the wizard sends bytes, not text extraction logic).
 */
import { strFromU8, unzipSync } from "fflate";

const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Single-pass entity decode — one pass so `&amp;lt;` becomes `&lt;`, not `<`. */
function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g,
    (match, entity: string) => {
      if (entity.startsWith("#x") || entity.startsWith("#X")) {
        const code = Number.parseInt(entity.slice(2), 16);
        return Number.isFinite(code) && code > 0
          ? String.fromCodePoint(code)
          : match;
      }
      if (entity.startsWith("#")) {
        const code = Number.parseInt(entity.slice(1), 10);
        return Number.isFinite(code) && code > 0
          ? String.fromCodePoint(code)
          : match;
      }
      return ENTITY_MAP[entity.toLowerCase()] ?? match;
    },
  );
}

/**
 * WordprocessingML → plain text. Exported separately from the unzip step so
 * the transformation is unit-testable without building a zip.
 */
export function docxXmlToText(xml: string): string {
  const text = xml
    // Field instructions (PAGE, TOC, hyperlinks) are not resume content.
    .replace(/<w:instrText[^>]*>[\s\S]*?<\/w:instrText>/g, "")
    .replace(/<w:delText[^>]*>[\s\S]*?<\/w:delText>/g, "")
    // Structural breaks → real line breaks.
    .replace(/<w:br\b[^>]*\/>/g, "\n")
    .replace(/<w:cr\b[^>]*\/>/g, "\n")
    .replace(/<w:tab\b[^>]*\/>/g, " ")
    .replace(/<\/w:p>/g, "\n")
    // Drop every remaining tag (paragraph props, runs, drawings …).
    .replace(/<[^>]+>/g, "");

  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .split("\n")
    .map(decodeEntities)
    .join("\n");
}

/**
 * Extract readable text from .docx bytes. Throws a friendly error for files
 * that aren't real Word documents (renamed zips, legacy .doc, HTML pages).
 */
export function extractDocxText(bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => file.name === "word/document.xml",
    });
  } catch {
    throw new Error(
      "That file couldn't be opened as a .docx — export it from your editor as “Word Document (.docx)” and try again.",
    );
  }

  const documentXml = files["word/document.xml"];
  if (!documentXml) {
    throw new Error(
      "No Word document found inside that file — if it's an old .doc, save it as .docx first (or paste the text instead).",
    );
  }

  return docxXmlToText(strFromU8(documentXml));
}
