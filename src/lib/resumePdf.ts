import { jsPDF } from "jspdf";
import type { ResumeProfileData } from "@/types/resume";

/**
 * One-click PDF export (roadmap B6) — a real, text-selectable, ATS-friendly
 * A4 PDF built client-side from the same structured data the on-screen
 * resume renders. Page breaks are computed while writing (bullet-level), so
 * multi-page resumes paginate correctly — this also covers the A6 print
 * concern without relying on CSS print hacks.
 *
 * Layout mirrors ResumeDocument: name/title/contact header, rule, then
 * Summary → Skills → Experience → Education with rose section headings.
 */

type RGB = [number, number, number];

const PAGE_W = 210; // A4, mm
const PAGE_H = 297;
const MARGIN_X = 16;
const MARGIN_TOP = 15;
const MARGIN_BOTTOM = 16;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const INK: RGB = [38, 38, 38];
const MUTED: RGB = [115, 115, 115];
const ACCENT: RGB = [244, 63, 94]; // rose-500, same as the on-screen sheet
const RULE: RGB = [229, 227, 227];

/**
 * Core PDF fonts are single-byte (WinAnsi): fold typographic punctuation to
 * ASCII equivalents, normalize spaces, and drop anything outside Latin-1 so
 * no character can corrupt the file's byte stream.
 */
const TYPOGRAPHIC: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201A": "'",
  "\u201B": "'",
  "\u201C": '"',
  "\u201D": '"',
  "\u201E": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u2011": "-",
  "\u2212": "-",
  "\u2022": "\u00B7",
  "\u2026": "...",
  "\u00A0": " ",
  "\u2122": "(TM)",
  "\u20AC": "EUR",
  "\u00AD": "",
};

/** Fold a string into bytes that are safe for the PDF's standard fonts. */
export function toPdfText(input: string): string {
  let out = "";
  for (const ch of input) {
    const replacement = TYPOGRAPHIC[ch];
    if (replacement !== undefined) {
      out += replacement;
      continue;
    }
    if (ch === "\n") {
      out += "\n";
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if (code < 32) continue; // stray control characters
    if (code <= 255) out += ch; // Latin-1 range is WinAnsi-safe
  }
  return out;
}

/** `Resume_<Company|Role|Name>.pdf` — filesystem-safe (roadmap B6). */
export function pdfFilename(label: string): string {
  const base = toPdfText(label)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^[_.]+|[_.]+$/g, "")
    .slice(0, 60)
    .replace(/[_.]+$/g, "");
  return base ? `Resume_${base}.pdf` : "Resume.pdf";
}

/** Build the resume as a paginated A4 PDF document. */
export function buildResumePdf(resume: ResumeProfileData): jsPDF {
  const doc = new jsPDF({
    unit: "mm",
    format: "a4",
    orientation: "portrait",
    compress: false,
  });

  const contentTop = MARGIN_TOP + 8; // first baseline (room for cap height)
  let y = contentTop;

  const ensure = (height: number) => {
    if (y + height > PAGE_H - MARGIN_BOTTOM) {
      doc.addPage();
      y = contentTop;
    }
  };

  /** Approximate rendered line height for a font size in pt, in mm. */
  const lineH = (sizePt: number): number => sizePt * 0.5;

  /** Write (wrapping + paginating) a run of text; returns nothing (mutates y). */
  const writeText = (
    text: string,
    sizePt: number,
    opts: {
      bold?: boolean;
      color?: RGB;
      width?: number;
      x?: number;
      gapAfter?: number;
      charSpace?: number;
    } = {},
  ): void => {
    const x = opts.x ?? MARGIN_X;
    const width = opts.width ?? CONTENT_W;
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(sizePt);
    doc.setTextColor(...(opts.color ?? INK));
    if (opts.charSpace) doc.setCharSpace(opts.charSpace);
    const lines = (doc.splitTextToSize(toPdfText(text), width) as string[])
      .join("\n")
      .split("\n");
    const lh = lineH(sizePt);
    for (const line of lines) {
      ensure(lh + 0.5);
      doc.text(line, x, y);
      y += lh;
    }
    if (opts.charSpace) doc.setCharSpace(0);
    y += opts.gapAfter ?? 0;
  };

  const sectionHeading = (title: string): void => {
    ensure(16);
    y += 7;
    writeText(title.toUpperCase(), 10, {
      bold: true,
      color: ACCENT,
      charSpace: 0.5,
      gapAfter: 2,
    });
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.4);
    doc.line(MARGIN_X, y, MARGIN_X + CONTENT_W, y);
    y += 5;
  };

  const writeBullet = (text: string, sizePt: number): void => {
    const indent = 4.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(sizePt);
    doc.setTextColor(...INK);
    const lines = (doc.splitTextToSize(
      toPdfText(text),
      CONTENT_W - indent,
    ) as string[])
      .join("\n")
      .split("\n");
    const lh = lineH(sizePt);
    for (let i = 0; i < lines.length; i += 1) {
      ensure(lh + 0.5);
      if (i === 0) {
        doc.setFillColor(...INK);
        doc.circle(MARGIN_X + 1.1, y - lh * 0.32, 0.5, "F");
      }
      doc.text(lines[i], MARGIN_X + indent, y);
      y += lh;
    }
    y += 0.8;
  };

  // Header — mirrors ResumeDocument (name, title, contact line, rule).
  writeText(resume.fullName || "Your Name", 20, { bold: true, gapAfter: 1.5 });
  if (resume.title) {
    writeText(resume.title, 11.5, { color: ACCENT, gapAfter: 1.5 });
  }
  const contact = [
    resume.email,
    resume.phone,
    resume.location,
    resume.portfolioUrl,
  ]
    .filter(Boolean)
    .join("  \u00B7  ");
  if (contact) {
    writeText(contact, 9, { color: MUTED, gapAfter: 3 });
  }
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.6);
  doc.line(MARGIN_X, y, MARGIN_X + CONTENT_W, y);
  y += 3;

  if (resume.summary.trim()) {
    sectionHeading("Summary");
    writeText(resume.summary, 10, { gapAfter: 2 });
  }

  const skills = resume.skills.filter((s) => s.trim());
  if (skills.length > 0) {
    sectionHeading("Skills");
    writeText(skills.map((s) => s.trim()).join("   \u00B7   "), 10, {
      gapAfter: 2,
    });
  }

  if (resume.experience.length > 0) {
    sectionHeading("Experience");
    for (const job of resume.experience) {
      ensure(14);
      y += 3;

      const dates = [job.startDate, job.endDate].filter(Boolean).join(" \u2013 ");
      let dateW = 0;
      if (dates) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        dateW = doc.getTextWidth(toPdfText(dates)) + 4;
      }

      const headY = y;
      if (dates) {
        doc.setTextColor(...MUTED);
        doc.text(toPdfText(dates), MARGIN_X + CONTENT_W, headY, {
          align: "right",
        });
      }

      const heading = [job.title, job.company].filter(Boolean).join("  \u00B7  ");
      writeText(heading || "Role", 10.5, {
        bold: true,
        width: CONTENT_W - dateW,
        gapAfter: 1,
      });

      for (const bullet of job.bullets) {
        if (bullet.trim()) writeBullet(bullet.trim(), 9.5);
      }
      y += 2;
    }
  }

  if (resume.education.length > 0) {
    sectionHeading("Education");
    for (const edu of resume.education) {
      const restParts = (
        edu.degree ? [edu.school, edu.gradYear] : [edu.school, edu.gradYear]
      ).filter((p) => p && p !== edu.degree);
      const first = edu.degree || edu.school || edu.gradYear;
      if (!first) continue;
      y += 1.5;
      ensure(lineH(10) + 1);

      const firstText = toPdfText(first);
      if (edu.degree) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...INK);
        doc.text(firstText, MARGIN_X, y);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(...MUTED);
        doc.text(firstText, MARGIN_X, y);
      }

      const rest = restParts.map((p) => toPdfText(p.trim()).trim()).filter(Boolean).join("  \u00B7  ");
      if (rest) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(...MUTED);
        const restX = MARGIN_X + doc.getTextWidth(firstText) + 3;
        if (restX + doc.getTextWidth(rest) <= MARGIN_X + CONTENT_W) {
          doc.text(rest, restX, y);
          y += lineH(10) + 1.5;
        } else {
          y += lineH(10);
          writeText(rest, 10, { color: MUTED, gapAfter: 1.5 });
        }
      } else {
        y += lineH(10) + 1.5;
      }
    }
  }

  // Page numbers when the resume actually spilled past one page.
  const pages = doc.getNumberOfPages();
  if (pages > 1) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    for (let p = 1; p <= pages; p += 1) {
      doc.setPage(p);
      doc.text(`${p} / ${pages}`, PAGE_W / 2, PAGE_H - 8, {
        align: "center",
      });
    }
  }

  return doc;
}

/**
 * Trigger a browser download of the resume as `Resume_<label>.pdf`.
 * Returns the filename (also used for the success toast).
 */
export function downloadResumePdf(
  resume: ResumeProfileData,
  label?: string,
): string {
  const filename = pdfFilename(label ?? resume.fullName ?? "");
  buildResumePdf(resume).save(filename);
  return filename;
}
