"use node";

import { vly } from "../lib/vly-integrations";
import { v } from "convex/values";
import { action } from "./_generated/server";

export interface ExperienceEntry {
  company: string;
  title: string;
  startDate: string;
  endDate: string;
  bullets: string[];
}

export interface EducationEntry {
  school: string;
  degree: string;
  gradYear: string;
}

export interface TailorResult {
  score: number;
  summary: string;
  skills: string[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
  keywords: string[];
  breakdown: Array<{
    label: "Skills" | "Experience" | "Education" | "Summary" | "Formatting";
    score: number;
    maxScore: number;
    note: string
  }>;
}

const scoreLabelUnion =
  "Skills | Experience | Education | Summary | Formatting";

const SYSTEM_PROMPT = `You are an expert resume tailoring engine. You rework a candidate's resume so it scores as highly as possible against one job description, WITHOUT inventing experience the candidate doesn't have.

STRICT RULES:
1. Every claim must be traceable to the candidate's real profile. You may rewrite, re-merge, re-order, and re-emphasize; you may NOT invent jobs, titles, dates, degrees, certifications, or metrics that are not in the profile.
2. You may convert real work into numbers only if the profile already contains the number (e.g. "led a team" + profile says "5 direct reports" → "Led a team of 5").
3. Weave the job's exact key terms into bullets only where they genuinely describe the candidate's experience. Never stuff keywords.
4. Keep at most 6 bullets per role and at most 15 skills total; keep every bullet to one line if possible.
5. Tailor the professional summary to the target job title and company.
6. Reply with ONLY the JSON object. No markdown fences, no commentary.`;

function buildUserPrompt(profileJson: string, jobDescription: string) {
  return `The candidate's master resume profile:
<profile>
${profileJson}
</profile>

The job description to tailor against:
<job_description>
${jobDescription}
</job_description>

Return a JSON object with EXACTLY this shape:
{
  "score": <integer 0-100, your honest overall match score after tailoring>,
  "summary": "<2-3 sentence professional summary tailored to this job>",
  "skills": [<up to 15 skills, most relevant to the job first>],
  "experience": [
    {
      "company": "...",
      "title": "...",
      "startDate": "...",
      "endDate": "...",
      "bullets": [<achievement bullets rewritten to mirror the job's language>]
    }
  ],
  "education": [
    { "school": "...", "degree": "...", "gradYear": "..." }
  ],
  "keywords": [<the job's most important keywords that the tailored resume now contains>],
  "breakdown": [
    { "label": "Skills", "score": <0-25>, "maxScore": 25, "note": "<one short sentence: what earns points and what loses them>" },
    { "label": "Experience", "score": <0-30>, "maxScore": 30, "note": "..." },
    { "label": "Education", "score": <0-15>, "maxScore": 15, "note": "..." },
    { "label": "Summary", "score": <0-15>, "maxScore": 15, "note": "..." },
    { "label": "Formatting", "score": <0-15>, "maxScore": 15, "note": "..." }
  ]
}

Breakdown labels must be exactly: ${scoreLabelUnion}.
"score" must equal the sum of the five breakdown scores.`;
}

/** Tolerant JSON extraction — models sometimes wrap JSON in prose or fences. */
function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to fence/prose extraction
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // fall through
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  throw new Error("AI returned an unparsable response");
}

function clampScore(n: unknown, fallback: number): number {
  const value = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Analyze + tailor the user's resume against one job description.
 * Called directly from the resume wizard; the result is saved separately via
 * resumes.saveResume so the caller can preview/confirm first.
 */
export const tailorResume = action({
  args: {
    profileJson: v.string(),
    jobTitle: v.string(),
    companyName: v.string(),
    jobDescription: v.string(),
  },
  handler: async (_ctx, { profileJson, jobTitle, companyName, jobDescription }): Promise<TailorResult> => {
    const completion = await vly.ai.completion({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: buildUserPrompt(profileJson, jobDescription),
        },
      ],
      temperature: 0.4,
      maxTokens: 3000,
    });

    if (!completion.success || !completion.data) {
      throw new Error(completion.error ?? "The AI service is unavailable. Try again in a moment.");
    }

    const content = completion.data.choices[0]?.message?.content ?? "";
    const parsed = extractJson(content) as Record<string, unknown>;

    const rawBreakdown = Array.isArray(parsed.breakdown) ? parsed.breakdown : [];
    const allowedLabels = ["Skills", "Experience", "Education", "Summary", "Formatting"] as const;

    const breakdown = allowedLabels.map((label) => {
      const found = rawBreakdown.find(
        (entry) => typeof entry === "object" && entry !== null && "label" in entry && (entry as { label: unknown }).label === label,
      ) as { score?: unknown; maxScore?: unknown; note?: unknown } | undefined;
      const maxScore = clampScore(found?.maxScore, label === "Skills" ? 25 : 15);
      const note =
        typeof found?.note === "string" && found.note.trim().length > 0
          ? found.note.trim()
          : "No notes provided for this category.";
      const cap = label === "Experience" ? 30 : label === "Skills" ? 25 : 15;
      return {
        label,
        maxScore: Math.min(maxScore, cap),
        score: Math.min(clampScore(found?.score, 0), cap),
        note,
      };
    });

    const derivedScore = breakdown.reduce((sum, b) => sum + b.score, 0);

    const skills = Array.isArray(parsed.skills)
      ? parsed.skills.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim()).slice(0, 15)
      : [];
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords.filter((k): k is string => typeof k === "string" && k.trim().length > 0).map((k) => k.trim()).slice(0, 20)
      : [];

    const experience = Array.isArray(parsed.experience)
      ? parsed.experience.map((entry) => {
          const e = (entry ?? {}) as Record<string, unknown>;
          return {
            company: typeof e.company === "string" ? e.company : "",
            title: typeof e.title === "string" ? e.title : "",
            startDate: typeof e.startDate === "string" ? e.startDate : "",
            endDate: typeof e.endDate === "string" ? e.endDate : "",
            bullets: Array.isArray(e.bullets)
              ? e.bullets.filter((b): b is string => typeof b === "string" && b.trim().length > 0)
              : [],
          };
        })
      : [];

    const education = Array.isArray(parsed.education)
      ? parsed.education.map((entry) => {
          const e = (entry ?? {}) as Record<string, unknown>;
          return {
            school: typeof e.school === "string" ? e.school : "",
            degree: typeof e.degree === "string" ? e.degree : "",
            gradYear: typeof e.gradYear === "string" ? e.gradYear : "",
          };
        })
      : [];

    const summaryText =
      typeof parsed.summary === "string" && parsed.summary.trim().length > 0
        ? parsed.summary.trim()
        : "No summary was generated. Try tailoring again.";

    return {
      score: clampScore(parsed.score ?? derivedScore, derivedScore),
      summary: summaryText,
      skills,
      experience,
      education,
      keywords,
      breakdown,
    };
  },
});
