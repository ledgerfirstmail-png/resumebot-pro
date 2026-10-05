"use node";

import { vly } from "../lib/vly-integrations";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { ScoreLabel } from "./schema";
import { MAX_AI_CALLS_PER_DAY } from "./aiUsage";
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
  /** Posting terms the tailored resume still doesn't clearly cover. */
  missingKeywords: string[];
  breakdown: Array<{
    label: ScoreLabel;
    score: number;
    maxScore: number;
    note: string
  }>;
}

/** Copy-ready application material for one job (the "auto-fill kit"). */
export interface ApplicationKit {
  coverLetter: string;
  whyThisRole: string;
  answers: Array<{ question: string; answer: string }>;
}

const scoreLabelUnion =
  "Skills | Experience | Education | Summary | Formatting";

/** Input caps — a giant paste inflates the prompt and risks truncation. */
const MAX_JOB_DESCRIPTION_CHARS = 20_000;
const MAX_PROFILE_JSON_CHARS = 60_000;

const SYSTEM_PROMPT = `You are an expert resume tailoring engine. You rework a candidate's resume so it scores as highly as possible against one job description, WITHOUT inventing experience the candidate doesn't have.

STRICT RULES:
1. Every claim must be traceable to the candidate's real profile. You may rewrite, re-merge, re-order, and re-emphasize; you may NOT invent jobs, titles, dates, degrees, certifications, or metrics that are not in the profile.
2. You may convert real work into numbers only if the profile already contains the number (e.g. "led a team" + profile says "5 direct reports" → "Led a team of 5").
3. Weave the job's exact key terms into bullets only where they genuinely describe the candidate's experience. Never stuff keywords.
4. Keep at most 6 bullets per role and at most 15 skills total; keep every bullet to one line if possible.
5. Tailor the professional summary to the target job title and company.
6. Reply with ONLY the JSON object. No markdown fences, no commentary.`;

function buildUserPrompt(
  profileJson: string,
  jobTitle: string,
  companyName: string,
  jobDescription: string,
  boostKeywords: string[],
) {
  const boostSection =
    boostKeywords.length > 0
      ? `\nBOOST PASS: These high-value terms from the posting were missing or weak in the previous version: ${boostKeywords.join(", ")}. Work each one into the summary, skills, or bullets ONLY where it truthfully describes the candidate's real experience. Never stuff a term the profile cannot support.`
      : "";
  return `The candidate's master resume profile:
<profile>
${profileJson}
</profile>

Target role: ${jobTitle}${companyName ? ` at ${companyName}` : ""}

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
  "missingKeywords": [<up to 12 important terms from the job description that the tailored resume still does NOT clearly cover — empty array if none>],
  "breakdown": [
    { "label": "Skills", "score": <0-25>, "maxScore": 25, "note": "<one short sentence: what earns points and what loses them>" },
    { "label": "Experience", "score": <0-30>, "maxScore": 30, "note": "..." },
    { "label": "Education", "score": <0-15>, "maxScore": 15, "note": "..." },
    { "label": "Summary", "score": <0-15>, "maxScore": 15, "note": "..." },
    { "label": "Formatting", "score": <0-15>, "maxScore": 15, "note": "..." }
  ]
}

Breakdown labels must be exactly: ${scoreLabelUnion}.
"score" must equal the sum of the five breakdown scores.${boostSection}`;
}

const KIT_SYSTEM_PROMPT = `You write application materials for a candidate applying to one specific job.

STRICT RULES:
1. Every claim must trace back to the candidate's real profile. Never invent jobs, titles, dates, degrees, certifications, metrics, or experiences that are not in the profile.
2. Mirror the job posting's own vocabulary where it is genuinely true of the candidate.
3. Sound like a capable human, not a marketing brochure: concrete, warm, no clichés (no "I am passionate about leveraging"), no exclamation marks.
4. First person. No placeholders like [Company] — use the real company name.
5. Reply with ONLY the JSON object. No markdown fences, no commentary.`;

function buildKitUserPrompt(
  profileJson: string,
  jobTitle: string,
  companyName: string,
  jobDescription: string,
) {
  return `The candidate's master resume profile:
<profile>
${profileJson}
</profile>

Target role: ${jobTitle}${companyName ? ` at ${companyName}` : ""}

The job description:
<job_description>
${jobDescription}
</job_description>

Return a JSON object with EXACTLY this shape:
{
  "coverLetter": "<150-200 word cover letter body: who the candidate is, 2 concrete reasons they fit this exact role drawn from the profile, one line of motivation for this company>",
  "whyThisRole": "<80-100 word answer to the application question 'Why are you interested in this role?'>",
  "answers": [
    { "question": "What makes you a strong fit for this role?", "answer": "<60-90 words>" },
    { "question": "Tell us about a project you're proud of and your role in it.", "answer": "<60-90 words, drawn from the profile's real experience>" },
    { "question": "How do you approach collaboration and feedback?", "answer": "<50-80 words>" },
    { "question": "What can you contribute that isn't obvious from your resume?", "answer": "<50-80 words>" }
  ]
}

Keep the four questions exactly as written. If the profile cannot support a detail, choose a different truthful angle instead of inventing one.`;
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
    sessionId: v.string(),
    boostKeywords: v.optional(v.array(v.string())),
  },
  handler: async (
    ctx,
    { profileJson, jobTitle, companyName, jobDescription, sessionId, boostKeywords },
  ): Promise<TailorResult> => {
    const jd = jobDescription.slice(0, MAX_JOB_DESCRIPTION_CHARS);
    const pj = profileJson.slice(0, MAX_PROFILE_JSON_CHARS);
    const boosts = (boostKeywords ?? [])
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 20)
      .map((k) => k.slice(0, 80));
    const sid = sessionId.trim().slice(0, 64) || "anonymous";

    // Daily per-session budget so the open, login-free endpoint can't be drained.
    const day = new Date().toISOString().slice(0, 10);
    const used = await ctx.runQuery(internal.aiUsage.getUsage, {
      sessionId: sid,
      day,
    });
    if (used >= MAX_AI_CALLS_PER_DAY) {
      throw new Error(
        `Daily tailoring limit reached (${MAX_AI_CALLS_PER_DAY} runs per day). Your profile and saved resumes are untouched — try again tomorrow.`,
      );
    }
    await ctx.runMutation(internal.aiUsage.recordCall, { sessionId: sid, day });

    // One retry: models occasionally wrap, truncate, or babble instead of JSON.
    let parsed: Record<string, unknown> | null = null;
    let lastFailure = "unparsable response";
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      const completion = await vly.ai.completion({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: buildUserPrompt(pj, jobTitle, companyName, jd, boosts),
          },
        ],
        temperature: 0.4,
        maxTokens: 4000,
      });

      if (!completion.success || !completion.data) {
        throw new Error(
          completion.error ??
            "The AI service is busy right now. Give it a few seconds and try again.",
        );
      }

      const content = completion.data.choices[0]?.message?.content ?? "";
      try {
        parsed = extractJson(content) as Record<string, unknown>;
      } catch (err) {
        lastFailure = err instanceof Error ? err.message : lastFailure;
      }
    }
    if (!parsed) {
      throw new Error(
        `The AI returned an unusable response (${lastFailure}). Try shortening the job posting or trimming a role, then generate again.`,
      );
    }

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
    const missingKeywords = Array.isArray(parsed.missingKeywords)
      ? parsed.missingKeywords
          .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
          .map((k) => k.trim())
          .slice(0, 12)
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
      missingKeywords,
      breakdown,
    };
  },
});

/**
 * Generate the application answer kit for the same job: cover letter,
 * "why this role", and answers to the four questions application forms
 * almost always ask. Shares the daily budget with tailoring.
 */
export const generateApplicationKit = action({
  args: {
    profileJson: v.string(),
    jobTitle: v.string(),
    companyName: v.string(),
    jobDescription: v.string(),
    sessionId: v.string(),
  },
  handler: async (
    ctx,
    { profileJson, jobTitle, companyName, jobDescription, sessionId },
  ): Promise<ApplicationKit> => {
    const jd = jobDescription.slice(0, MAX_JOB_DESCRIPTION_CHARS);
    const pj = profileJson.slice(0, MAX_PROFILE_JSON_CHARS);
    const sid = sessionId.trim().slice(0, 64) || "anonymous";

    const day = new Date().toISOString().slice(0, 10);
    const used = await ctx.runQuery(internal.aiUsage.getUsage, {
      sessionId: sid,
      day,
    });
    if (used >= MAX_AI_CALLS_PER_DAY) {
      throw new Error(
        `Daily AI limit reached (${MAX_AI_CALLS_PER_DAY} runs per day). Your work is saved — try again tomorrow.`,
      );
    }
    await ctx.runMutation(internal.aiUsage.recordCall, { sessionId: sid, day });

    let parsed: Record<string, unknown> | null = null;
    let lastFailure = "unparsable response";
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      const completion = await vly.ai.completion({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: KIT_SYSTEM_PROMPT },
          {
            role: "user",
            content: buildKitUserPrompt(pj, jobTitle, companyName, jd),
          },
        ],
        temperature: 0.4,
        maxTokens: 2500,
      });

      if (!completion.success || !completion.data) {
        throw new Error(
          completion.error ??
            "The AI service is busy right now. Give it a few seconds and try again.",
        );
      }

      const content = completion.data.choices[0]?.message?.content ?? "";
      try {
        parsed = extractJson(content) as Record<string, unknown>;
      } catch (err) {
        lastFailure = err instanceof Error ? err.message : lastFailure;
      }
    }
    if (!parsed) {
      throw new Error(
        `The AI returned an unusable response (${lastFailure}). Try again, or shorten the job posting.`,
      );
    }

    const text = (value: unknown, max: number): string =>
      typeof value === "string" ? value.trim().slice(0, max) : "";

    const answers = (Array.isArray(parsed.answers) ? parsed.answers : [])
      .map((entry) => {
        const a = (entry ?? {}) as Record<string, unknown>;
        return { question: text(a.question, 240), answer: text(a.answer, 1400) };
      })
      .filter((a) => a.question.length > 0 && a.answer.length > 0)
      .slice(0, 5);

    return {
      coverLetter:
        text(parsed.coverLetter, 3500) ||
        "The cover letter didn't generate — try the kit again.",
      whyThisRole: text(parsed.whyThisRole, 1400),
      answers,
    };
  },
});
