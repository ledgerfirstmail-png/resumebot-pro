"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { vly } from "../lib/vly-integrations";
import { assertPublicHttpUrl, clampScore, extractJson, htmlToText } from "../lib/aiParse";
import {
  normalizeParsedResume,
  type ProfileFormValues,
} from "../lib/resumeSchemas";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { AiRunKind, ScoreLabel } from "./schema";
import { MAX_AI_CALLS_PER_DAY } from "./aiUsage";
import { action, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

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

/** Token/credit usage from provider responses, collected for the run log. */
interface CompletionUsage {
  tokensIn?: number;
  tokensOut?: number;
  credits?: number;
}

/**
 * Shared daily budget — checked BEFORE any AI call so the open endpoint
 * can't drain integration credits. The key is the signed-in account
 * (unforgeable — the server resolves it, never the client), so clearing
 * localStorage or replaying someone's session id buys nothing.
 */
async function enforceDailyBudget(
  ctx: ActionCtx,
  budgetKey: string,
): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const used = await ctx.runQuery(internal.aiUsage.getUsage, {
    sessionId: budgetKey,
    day,
  });
  if (used >= MAX_AI_CALLS_PER_DAY) {
    throw new Error(
      `Daily AI limit reached (${MAX_AI_CALLS_PER_DAY} runs per day). Your work is saved — try again tomorrow.`,
    );
  }
  await ctx.runMutation(internal.aiUsage.recordCall, {
    sessionId: budgetKey,
    day,
  });
}

/**
 * Record one AI run (outcome, failure reason, tokens, duration) for
 * observability (ROADMAP D6). Never throws — logging must not mask the
 * real result of the action.
 */
async function logAiRun(
  ctx: ActionCtx,
  entry: {
    sessionId: string;
    kind: AiRunKind;
    ok: boolean;
    error?: string;
    score?: number;
    tokensIn?: number;
    tokensOut?: number;
    credits?: number;
    durationMs?: number;
  },
): Promise<void> {
  try {
    await ctx.runMutation(internal.aiUsage.logRun, entry);
  } catch (logErr) {
    console.error("[ai] could not record run log:", logErr);
  }
}

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

/**
 * One AI completion with the shared retry-on-unparsable-JSON loop (models
 * occasionally wrap, truncate, or babble instead of JSON). Fills `usage`
 * from provider responses; throws an actionable error otherwise.
 */
async function completeToJson(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  failureHint: string,
  usage: CompletionUsage,
): Promise<Record<string, unknown>> {
  let lastFailure = "unparsable response";
  for (let attempt = 0; attempt < 2; attempt++) {
    const completion = await vly.ai.completion({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      maxTokens,
    });

    if (!completion.success || !completion.data) {
      throw new Error(
        completion.error ??
          "The AI service is busy right now. Give it a few seconds and try again.",
      );
    }

    usage.tokensIn = completion.data.usage?.promptTokens;
    usage.tokensOut = completion.data.usage?.completionTokens;
    usage.credits = completion.usage?.credits;

    try {
      const content = completion.data.choices[0]?.message.content ?? "";
      return extractJson(content) as Record<string, unknown>;
    } catch (err) {
      lastFailure = err instanceof Error ? err.message : lastFailure;
    }
  }
  throw new Error(
    `The AI returned an unusable response (${lastFailure}). ${failureHint}`,
  );
}

/**
 * Analyze + tailor the user's resume against one job description.
 * Called directly from the resume wizard; the result is saved separately via
 * resumes.saveResume so the caller can preview/confirm first.
 */
interface TailorArgs {
  profileJson: string;
  jobTitle: string;
  companyName: string;
  jobDescription: string;
  /** Server-derived budget key ("user:<id>") — never client-supplied. */
  budgetKey: string;
  boostKeywords?: string[];
}

/**
 * The shared tailor pass (prompt → completion → strict parse → run log).
 * Used by the wizard's tailorResume action AND auto-apply so both spend the
 * same daily budget and log identically.
 */
async function runTailor(
  ctx: ActionCtx,
  {
    profileJson,
    jobTitle,
    companyName,
    jobDescription,
    budgetKey,
    boostKeywords,
  }: TailorArgs,
): Promise<TailorResult> {
    const jd = jobDescription.slice(0, MAX_JOB_DESCRIPTION_CHARS);
    const pj = profileJson.slice(0, MAX_PROFILE_JSON_CHARS);
    const boosts = (boostKeywords ?? [])
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 20)
      .map((k) => k.slice(0, 80));

    // Daily account-bound budget so a leaked deployment URL can't be drained.
    await enforceDailyBudget(ctx, budgetKey);

    const startedAt = Date.now();
    const usage: CompletionUsage = {};
    let parsed: Record<string, unknown>;
    try {
      parsed = await completeToJson(
        SYSTEM_PROMPT,
        buildUserPrompt(pj, jobTitle, companyName, jd, boosts),
        4000,
        "Try shortening the job posting or trimming a role, then generate again.",
        usage,
      );
    } catch (err) {
      await logAiRun(ctx, {
        sessionId: budgetKey,
        kind: "tailor",
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startedAt,
        ...usage,
      });
      throw err;
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

    const result: TailorResult = {
      score: clampScore(parsed.score ?? derivedScore, derivedScore),
      summary: summaryText,
      skills,
      experience,
      education,
      keywords,
      missingKeywords,
      breakdown,
    };
    await logAiRun(ctx, {
      sessionId: budgetKey,
      kind: "tailor",
      ok: true,
      score: result.score,
      durationMs: Date.now() - startedAt,
      ...usage,
    });
    return result;
}

export const tailorResume = action({
  args: {
    profileJson: v.string(),
    jobTitle: v.string(),
    companyName: v.string(),
    jobDescription: v.string(),
    boostKeywords: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<TailorResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("You're signed out — sign in to continue.");
    }
    return runTailor(ctx, {
      ...args,
      budgetKey: `user:${userId}`,
    });
  },
});

/**
 * Auto-apply (feature: apply to radar results): for each selected listing,
 * run the full tailor pass (its AI cost shares the daily budget), save the
 * tailored resume into the owner's collection, and mark the listing applied
 * with a link out to the posting. Capped at 3 per call so one click can't
 * drain the budget.
 */
export const autoApply = action({
  args: {
    jobIds: v.array(v.id("jobMatches")),
  },
  handler: async (ctx, { jobIds }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("You're signed out — sign in to continue.");
    }
    const profileData = await ctx.runQuery(internal.jobs.profileForMatch, {
      userId,
    });
    if (!profileData) {
      throw new Error("Build your master profile first — then auto-apply.");
    }

    const ids = [...new Set(jobIds)].slice(0, 3);
    const applied: Array<{
      jobId: Id<"jobMatches">;
      score: number;
      url: string;
    }> = [];

    for (const jobId of ids) {
      const match = await ctx.runQuery(internal.jobs.getMatchForUser, {
        jobId,
        userId,
      });
      if (!match) continue;

      const tailored = await runTailor(ctx, {
        profileJson: JSON.stringify(profileData.profile),
        jobTitle: match.title,
        companyName: match.company,
        jobDescription: match.description,
        budgetKey: `user:${userId}`,
        // Feed the deterministic matcher's gaps straight into the rewrite.
        boostKeywords: match.missingKeywords,
      });

      const resumeId = await ctx.runMutation(internal.resumes.insertResume, {
        userId,
        profileId: profileData.profileId,
        companyName: match.company,
        jobTitle: match.title,
        jobDescription: match.description,
        score: tailored.score,
        summary: tailored.summary,
        skills: tailored.skills,
        experience: tailored.experience,
        education: tailored.education,
        keywords: tailored.keywords,
        missingKeywords: tailored.missingKeywords,
        breakdown: tailored.breakdown,
      });

      await ctx.runMutation(internal.jobs.markApplied, {
        jobId,
        userId,
        resumeId,
        tailoredScore: tailored.score,
      });

      applied.push({ jobId, score: tailored.score, url: match.url });
    }

    return applied;
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
  },
  handler: async (
    ctx,
    { profileJson, jobTitle, companyName, jobDescription },
  ): Promise<ApplicationKit> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("You're signed out — sign in to continue.");
    }
    const budgetKey = `user:${userId}`;
    const jd = jobDescription.slice(0, MAX_JOB_DESCRIPTION_CHARS);
    const pj = profileJson.slice(0, MAX_PROFILE_JSON_CHARS);

    await enforceDailyBudget(ctx, budgetKey);

    const startedAt = Date.now();
    const usage: CompletionUsage = {};
    let parsed: Record<string, unknown>;
    try {
      parsed = await completeToJson(
        KIT_SYSTEM_PROMPT,
        buildKitUserPrompt(pj, jobTitle, companyName, jd),
        2500,
        "Try again, or shorten the job posting.",
        usage,
      );
    } catch (err) {
      await logAiRun(ctx, {
        sessionId: budgetKey,
        kind: "kit",
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startedAt,
        ...usage,
      });
      throw err;
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

    const kitResult: ApplicationKit = {
      coverLetter:
        text(parsed.coverLetter, 3500) ||
        "The cover letter didn't generate — try the kit again.",
      whyThisRole: text(parsed.whyThisRole, 1400),
      answers,
    };
    await logAiRun(ctx, {
      sessionId: budgetKey,
      kind: "kit",
      ok: true,
      durationMs: Date.now() - startedAt,
      ...usage,
    });
    return kitResult;
  },
});

/** --- Job posting import from a URL (B2) --- */

/** Cap on bytes read from the remote page (never buffer an unbounded page). */
const MAX_PAGE_BYTES = 600_000;
/** Cap on scraped text fed to the AI (~15k tokens — well inside the model). */
const MAX_PAGE_TEXT_CHARS = 60_000;

const EXTRACT_SYSTEM_PROMPT = `You extract a single job posting from text scraped from a web page.

STRICT RULES:
1. Reply with ONLY the JSON object. No markdown fences, no commentary.
2. The shape is exactly: {"jobTitle": "...", "companyName": "...", "jobDescription": "..."}
3. jobDescription must be the posting itself — responsibilities, requirements, location, salary and benefits when present — in the posting's own words. Strip navigation menus, cookie banners, footers, apply buttons, and listings for OTHER jobs.
4. If the page does not contain exactly one job posting (a homepage, a list of many jobs, a login/captcha/blocked page, or unrelated content), return exactly {"jobTitle": "", "companyName": "", "jobDescription": ""}.
5. Keep jobDescription under 12000 characters; for very long postings, keep responsibilities and requirements and trim repetition.
6. Never invent text that is not on the page.`;

function buildExtractPrompt(pageText: string) {
  return `Scraped page text (truncated):\n<page_text>\n${pageText}\n</page_text>\n\nExtract the single job posting as the JSON object described.`;
}

/** Read at most `max` bytes of a response body — stream, don't buffer. */
async function readCappedText(
  response: Response,
  max: number,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return (await response.text()).slice(0, max);
  }
  const decoder = new TextDecoder();
  let received = 0;
  let out = "";
  while (received < max) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.byteLength > 0) {
      received += value.byteLength;
      out += decoder.decode(value, { stream: true });
    }
  }
  if (received >= max) {
    await reader.cancel().catch(() => {
      /* capped — drop the rest of the page */
    });
  }
  out += decoder.decode();
  return out.slice(0, max);
}

/** What extractJobPosting hands back to the wizard's job step. */
export interface ExtractedPosting {
  jobTitle: string;
  companyName: string;
  jobDescription: string;
}

/**
 * Import a job posting from its URL: fetch the page, strip it to text, and
 * have the AI pull out title/company/posting (B2). Shares the daily budget
 * and the structured run log with tailoring.
 */
export const extractJobPosting = action({
  args: { url: v.string() },
  handler: async (ctx, { url }): Promise<ExtractedPosting> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("You're signed out — sign in to continue.");
    }
    const budgetKey = `user:${userId}`;
    const target = assertPublicHttpUrl(url);

    await enforceDailyBudget(ctx, budgetKey);
    const startedAt = Date.now();
    const usage: CompletionUsage = {};

    const fail = async (err: unknown): Promise<never> => {
      await logAiRun(ctx, {
        sessionId: budgetKey,
        kind: "extract",
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startedAt,
        ...usage,
      });
      throw err;
    };

    let parsed: Record<string, unknown>;
    try {
      const response = await fetch(target, {
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; Tailorly/1.0; resume job-posting importer)",
          Accept:
            "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (!response.ok) {
        throw new Error(
          `That site answered with HTTP ${response.status} — many job boards block automated readers. Paste the posting text instead.`,
        );
      }
      const raw = await readCappedText(response, MAX_PAGE_BYTES);
      const pageText = htmlToText(raw).slice(0, MAX_PAGE_TEXT_CHARS);
      if (pageText.length < 200) {
        throw new Error(
          "Couldn't read any posting text from that page (it may require JavaScript or block readers). Paste the posting instead.",
        );
      }
      parsed = await completeToJson(
        EXTRACT_SYSTEM_PROMPT,
        buildExtractPrompt(pageText),
        3000,
        "Try again, or paste the posting text manually.",
        usage,
      );
    } catch (err) {
      return fail(err);
    }

    const text = (value: unknown, max: number): string =>
      typeof value === "string" ? value.trim().slice(0, max) : "";

    const jobTitle = text(parsed.jobTitle, 200);
    const companyName =
      text(parsed.companyName, 160) ||
      new URL(target).hostname.replace(/^www\./, "").split(".")[0];
    const jobDescription = text(
      parsed.jobDescription,
      MAX_JOB_DESCRIPTION_CHARS,
    );

    if (!jobTitle || jobDescription.length < 120) {
      return fail(
        new Error(
          "That page doesn't look like a single job posting we can import — open the specific role's page and paste its URL, or paste the posting text.",
        ),
      );
    }

    const result: ExtractedPosting = { jobTitle, companyName, jobDescription };
    await logAiRun(ctx, {
      sessionId: budgetKey,
      kind: "extract",
      ok: true,
      durationMs: Date.now() - startedAt,
      ...usage,
    });
    return result;
  },
});

/** --- Résumé paste-import (B5) --- */

/** Cap on pasted resume text fed to the AI (~8k tokens — plenty for a CV). */
const MAX_RESUME_TEXT_CHARS = 30_000;

const PARSE_SYSTEM_PROMPT = `You extract a person's resume into a fixed JSON shape.

STRICT RULES:
1. Reply with ONLY the JSON object. No markdown fences, no commentary.
2. The shape is exactly:
{"fullName": "", "title": "", "email": "", "phone": "", "location": "", "portfolioUrl": "", "summary": "", "skills": [""], "experience": [{"company": "", "title": "", "startDate": "", "endDate": "", "bulletsText": ""}], "education": [{"school": "", "degree": "", "gradYear": ""}]}
3. bulletsText holds the role's bullet points separated by newline characters, one bullet per line.
4. Use "" or [] when something is absent. Never invent details, employers, dates, or skills that are not in the text.
5. title is the person's professional headline; if none is stated, use their most recent role title.
6. summary is the profile/summary section in the person's own words (compress only if it is very long).
7. Copy dates exactly as written (e.g. "Mar 2021", "2020 – present").
8. At most 30 skills, 12 experience entries, and 8 education entries.`;

function buildParsePrompt(text: string) {
  return `Resume text (truncated):\n<resume_text>\n${text}\n</resume_text>\n\nExtract the resume as the JSON object described.`;
}

/**
 * Parse pasted plain-text resume content into the wizard's step-1 form shape
 * (B5) so users don't retype everything. Shares the daily budget, the
 * retry loop, and the structured run log with the other AI actions; the raw
 * payload is normalized (and content-checked) by `normalizeParsedResume`.
 */
export const parseResumeText = action({
  args: { text: v.string() },
  handler: async (ctx, { text }): Promise<ProfileFormValues> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("You're signed out — sign in to continue.");
    }
    const budgetKey = `user:${userId}`;
    const source = text.trim();
    if (source.length < 120) {
      throw new Error(
        "Paste your resume as text — at least a short paragraph — and try again.",
      );
    }
    const clipped = source.slice(0, MAX_RESUME_TEXT_CHARS);

    await enforceDailyBudget(ctx, budgetKey);
    const startedAt = Date.now();
    const usage: CompletionUsage = {};

    const fail = async (err: unknown): Promise<never> => {
      await logAiRun(ctx, {
        sessionId: budgetKey,
        kind: "parse",
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startedAt,
        ...usage,
      });
      throw err;
    };

    let parsed: unknown;
    try {
      parsed = await completeToJson(
        PARSE_SYSTEM_PROMPT,
        buildParsePrompt(clipped),
        4000,
        "Try again with a cleaner copy of your resume text.",
        usage,
      );
    } catch (err) {
      return fail(err);
    }

    const normalized = normalizeParsedResume(parsed);
    if (!normalized) {
      return fail(
        new Error(
          "That text didn't look like a resume we could read — paste the plain text of your resume and try again.",
        ),
      );
    }

    await logAiRun(ctx, {
      sessionId: budgetKey,
      kind: "parse",
      ok: true,
      durationMs: Date.now() - startedAt,
      ...usage,
    });
    return normalized;
  },
});
