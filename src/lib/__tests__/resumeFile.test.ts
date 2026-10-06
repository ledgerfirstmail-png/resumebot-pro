import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { extractDocxText, docxXmlToText } from "@/lib/docxText";
import {
  MAX_RESUME_FILE_BYTES,
  MIN_EXTRACTED_CHARS,
  bytesToBase64,
  detectResumeFileKind,
  hasSupportedExtension,
  normalizeExtractedText,
} from "@/lib/resumeFile";

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]);
const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const TEXT_BYTES = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);

describe("constants", () => {
  it("keeps the file cap sane", () => {
    expect(MAX_RESUME_FILE_BYTES).toBe(5 * 1024 * 1024);
    expect(MIN_EXTRACTED_CHARS).toBe(120);
  });
});

describe("detectResumeFileKind", () => {
  it("accepts a real PDF named .pdf", () => {
    expect(detectResumeFileKind("resume.pdf", PDF_BYTES)).toBe("pdf");
    expect(detectResumeFileKind("Resume.PDF", PDF_BYTES)).toBe("pdf");
    expect(detectResumeFileKind("  my resume.pdf ", PDF_BYTES)).toBe("pdf");
  });

  it("accepts a real zip named .docx", () => {
    expect(detectResumeFileKind("resume.docx", ZIP_BYTES)).toBe("docx");
    expect(detectResumeFileKind("RESUME.DOCX", ZIP_BYTES)).toBe("docx");
  });

  it("rejects when extension and magic bytes disagree", () => {
    expect(detectResumeFileKind("resume.pdf", ZIP_BYTES)).toBeNull();
    expect(detectResumeFileKind("resume.docx", PDF_BYTES)).toBeNull();
    expect(detectResumeFileKind("resume.docx", TEXT_BYTES)).toBeNull();
    expect(detectResumeFileKind("resume.pdf", TEXT_BYTES)).toBeNull();
  });

  it("rejects unsupported or empty input", () => {
    expect(detectResumeFileKind("resume.txt", TEXT_BYTES)).toBeNull();
    expect(detectResumeFileKind("resume.doc", ZIP_BYTES)).toBeNull();
    expect(detectResumeFileKind("resume.pdf", new Uint8Array(0))).toBeNull();
  });
});

describe("hasSupportedExtension", () => {
  it("recognizes pdf and docx only", () => {
    expect(hasSupportedExtension("a.pdf")).toBe(true);
    expect(hasSupportedExtension("a.DOCX")).toBe(true);
    expect(hasSupportedExtension("a.doc")).toBe(false);
    expect(hasSupportedExtension("a.txt")).toBe(false);
    expect(hasSupportedExtension("a.zip")).toBe(false);
  });
});

describe("bytesToBase64", () => {
  it("round-trips small inputs", () => {
    const bytes = new Uint8Array([1, 2, 3, 250, 251, 252]);
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
  });

  it("round-trips inputs larger than one chunk", () => {
    const bytes = new Uint8Array(20_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
  });

  it("handles empty input", () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe("");
  });
});

describe("normalizeExtractedText", () => {
  it("normalizes Windows and old-Mac newlines", () => {
    expect(normalizeExtractedText("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
  });

  it("strips control characters but keeps tabs and newlines", () => {
    expect(normalizeExtractedText("a\u0000b\u0007c\td\ne")).toBe(
      "abc\td\ne",
    );
    expect(normalizeExtractedText("keep\ttabs\nand\nlines")).toBe(
      "keep\ttabs\nand\nlines",
    );
  });

  it("trims line ends and collapses runaway blank lines", () => {
    expect(normalizeExtractedText("  hi   \n\n\n\n there  \n\n\n ")).toBe(
      "hi\n\n there",
    );
  });

  it("strips pdf-parse page markers", () => {
    expect(
      normalizeExtractedText("Ada\nEngineering Lead\n\n-- 1 of 2 --\n\nMore\n\n-- 2 of 2 --"),
    ).toBe("Ada\nEngineering Lead\n\nMore");
  });
});

describe("docxXmlToText", () => {
  it("turns paragraphs into lines and keeps run text in order", () => {
    const xml =
      "<w:document><w:body>" +
      "<w:p><w:r><w:t>First</w:t></w:r></w:p>" +
      "<w:p><w:r><w:t>Second</w:t></w:r><w:r><w:t> more</w:t></w:r></w:p>" +
      "</w:body></w:document>";
    expect(docxXmlToText(xml)).toBe("First\nSecond more");
  });

  it("decodes entities in a single pass", () => {
    expect(docxXmlToText("<w:p><w:t>A &amp; B &lt; C &gt; D</w:t></w:p>")).toBe(
      "A & B < C > D",
    );
    expect(docxXmlToText("<w:p><w:t>&amp;lt;</w:t></w:p>")).toBe("&lt;");
    expect(docxXmlToText("<w:p><w:t>em &#x2014; dash &#8212; end</w:t></w:p>")).toBe(
      "em — dash — end",
    );
    expect(docxXmlToText("<w:p><w:t>&nbsp;&quot;q&quot;</w:t></w:p>")).toBe(
      ' "q"',
    );
    expect(docxXmlToText("<w:p><w:t>&bogus; stays</w:t></w:p>")).toBe(
      "&bogus; stays",
    );
  });

  it("maps tabs and breaks, drops field codes and deleted text", () => {
    const xml =
      "<w:p><w:r><w:t>Tab</w:t><w:tab/><w:t>bed</w:t></w:r>" +
      "<w:r><w:br/><w:t>next line</w:t></w:r>" +
      "<w:r><w:instrText>PAGEREF _Toc</w:instrText><w:t>visible</w:t></w:r>" +
      "<w:r><w:delText>removed words</w:delText><w:t>kept</w:t></w:r></w:p>";
    expect(docxXmlToText(xml)).toBe("Tab bed\nnext linevisiblekept");
  });

  it("ignores paragraph properties and other markup", () => {
    const xml =
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Title</w:t></w:r></w:p>';
    expect(docxXmlToText(xml)).toBe("Title");
  });
});

describe("extractDocxText", () => {
  const xml =
    '<?xml version="1.0"?><w:document><w:body>' +
    "<w:p><w:r><w:t>Ada Lovelace</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>Mathematician &amp; writer</w:t></w:r></w:p>" +
    "</w:body></w:document>";

  it("extracts text from real .docx bytes", () => {
    const zip = zipSync({ "word/document.xml": strToU8(xml) });
    expect(extractDocxText(new Uint8Array(zip))).toBe(
      "Ada Lovelace\nMathematician & writer",
    );
  });

  it("rejects a zip without a Word document (legacy .doc, random zip)", () => {
    const zip = zipSync({ "hello.txt": strToU8("not a resume") });
    expect(() => extractDocxText(new Uint8Array(zip))).toThrow(
      /No Word document found/i,
    );
  });

  it("rejects bytes that aren't a zip at all", () => {
    expect(() => extractDocxText(new Uint8Array([1, 2, 3, 4, 5]))).toThrow(
      /couldn't be opened as a \.docx/i,
    );
  });
});
