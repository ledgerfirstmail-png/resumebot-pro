"use node";

import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";

/**
 * Alert delivery for Job Radar watches: Resend email digest + Telegram bot
 * message. Runs in the Node runtime so it can read API keys from process.env
 * (Keys tab). Every path returns a status string instead of throwing so a
 * missing key or blocked channel can never fail the watch sweep itself.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendEmail(
  to: string,
  subject: string,
  jobs: Array<{ title: string; company: string; url: string; score: number }>,
): Promise<string> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return "skipped: add RESEND_API_KEY in the Keys tab";
  if (!to.trim()) return "skipped: no email address on this watch";

  const rows = jobs
    .map(
      (j) =>
        `<li><a href="${escapeHtml(j.url)}">${escapeHtml(j.title)} — ${escapeHtml(j.company)}</a> <strong>${j.score}% match</strong></li>`,
    )
    .join("");
  const html = `
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 4px">New matches on Tailorly</h2>
      <p style="color:#555;margin:0 0 16px">Fresh postings that cleared your match threshold:</p>
      <ul style="padding-left:18px;line-height:1.7">${rows}</ul>
      <p style="color:#888;font-size:13px">Open the Job Radar in Tailorly to tailor, auto-apply, or adjust this watch.</p>
    </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? "Tailorly <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 200);
      return `failed: email API ${res.status} ${body}`.trim();
    }
    return "sent";
  } catch (err) {
    return `failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function sendTelegram(
  chatId: string,
  jobs: Array<{ title: string; company: string; url: string; score: number }>,
): Promise<string> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return "skipped: add TELEGRAM_BOT_TOKEN in the Keys tab";
  if (!chatId.trim()) return "skipped: no chat ID on this watch";

  const lines = jobs
    .map(
      (j) =>
        `• <a href="${escapeHtml(j.url)}">${escapeHtml(j.title)} — ${escapeHtml(j.company)}</a> (${j.score}%)`,
    )
    .join("\n");
  const text = `🔔 <b>${jobs.length} new job match${jobs.length === 1 ? "" : "es"} on Tailorly</b>\n${lines}`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId.trim(),
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return `failed: Telegram API ${res.status}`;
    }
    return "sent";
  } catch (err) {
    return `failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * Deliver one watch digest. Never throws — returns per-channel statuses.
 * Internal: only the watch sweep (jobSearch.ts) calls it.
 */
export const sendWatchAlert = internalAction({
  args: {
    emailEnabled: v.boolean(),
    email: v.optional(v.string()),
    telegramEnabled: v.boolean(),
    telegramChatId: v.optional(v.string()),
    subject: v.string(),
    jobs: v.array(
      v.object({
        title: v.string(),
        company: v.string(),
        url: v.string(),
        score: v.number(),
      }),
    ),
  },
  handler: async (
    _ctx: ActionCtx,
    args,
  ): Promise<{ email: string; telegram: string }> => {
    const email = args.emailEnabled
      ? await sendEmail(args.email ?? "", args.subject, args.jobs)
      : "off";
    const telegram = args.telegramEnabled
      ? await sendTelegram(args.telegramChatId ?? "", args.jobs)
      : "off";
    return { email, telegram };
  },
});

/**
 * One-time helper for the watch setup UI: after the user messages their bot,
 * read the latest chat id out of getUpdates so they can paste it.
 */
export const resolveTelegramChat = action({
  args: {},
  handler: async (): Promise<
    { ok: true; chatId: string; name: string } | { ok: false; error: string }
  > => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return {
        ok: false,
        error: "Add TELEGRAM_BOT_TOKEN in the Keys tab first.",
      };
    }
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
        signal: AbortSignal.timeout(10_000),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        result?: Array<{
          message?: {
            chat?: { id?: number; type?: string; first_name?: string };
          };
        }>;
      };
      if (!data.ok) {
        return {
          ok: false,
          error: "Telegram rejected the token — check TELEGRAM_BOT_TOKEN.",
        };
      }
      const chats = (data.result ?? [])
        .map((u) => u.message?.chat)
        .filter((c): c is NonNullable<typeof c> => !!c && typeof c.id === "number")
        .reverse();
      const chat = chats[0];
      if (!chat) {
        return {
          ok: false,
          error: "Open your bot in Telegram and send it any message, then retry.",
        };
      }
      return {
        ok: true,
        chatId: String(chat.id),
        name: chat.first_name ?? chat.type ?? "Telegram",
      };
    } catch (err) {
      return {
        ok: false,
        error: `Telegram unreachable: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
});
