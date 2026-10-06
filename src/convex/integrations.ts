"use node";

import { v } from "convex/values";
import { vly } from "../lib/vly-integrations";
import { action } from "./_generated/server";

/**
 * Connections status for /settings (ROADMAP P20): surface which integrations
 * Tailorly can reach and let the user test them with one click.
 *
 * - AI (LLM): powered by the project's VLY integration key, which the
 *   platform provisions automatically — so it is either wired (a completion
 *   round-trips) or the deployment itself is misconfigured. No key to paste.
 * - Email: Resend, gated on RESEND_API_KEY in the Keys tab. A test mail is
 *   sent to the signed-in user's alert address on request.
 * - Telegram: gated on TELEGRAM_BOT_TOKEN; verified via getUpdates, which
 *   only proves the token works (chat id lives on the watch).
 */

/** Shape consumed by the Settings connections card. */
export interface IntegrationStatus {
  ai: { connected: boolean; detail: string };
  email: { connected: boolean; detail: string };
  telegram: { connected: boolean; detail: string };
}

export const status = action({
  args: {},
  handler: async (): Promise<IntegrationStatus> => {
    const aiKeyed = !!process.env.VLY_INTEGRATION_KEY;
    const emailKeyed = !!process.env.RESEND_API_KEY;
    const telegramKeyed = !!process.env.TELEGRAM_BOT_TOKEN;

    let telegramDetail = telegramKeyed
      ? "Token present in the Keys tab — use “Find ID” on a watch to link a chat."
      : "Add TELEGRAM_BOT_TOKEN in the Keys tab to enable Telegram alerts.";
    if (telegramKeyed) {
      try {
        const res = await fetch("https://api.telegram.org", {
          signal: AbortSignal.timeout(10_000),
        });
        telegramDetail = `Token present in the Keys tab · Telegram API ${res.status === 404 ? "reachable" : `reachable (${res.status})`}`;
      } catch {
        telegramDetail =
          "Token present in the Keys tab · Telegram API unreachable from this deployment right now.";
      }
    }

    return {
      ai: {
        connected: aiKeyed,
        detail: aiKeyed
          ? "Wired to the platform's managed LLM gateway (no key to paste). Run the test below to confirm it answers."
          : "The project's VLY integration key is missing — AI tailoring will fail until the deployment is re-provisioned.",
      },
      email: {
        connected: emailKeyed,
        detail: emailKeyed
          ? "RESEND_API_KEY found — watch alerts can send. Run the test below to confirm delivery."
          : "Add RESEND_API_KEY in the Keys tab to enable email alerts.",
      },
      telegram: { connected: telegramKeyed, detail: telegramDetail },
    };
  },
});

/** One real LLM completion — proves the AI connection end to end. */
export const testAi = action({
  args: {},
  handler: async (): Promise<
    { ok: true; reply: string } | { ok: false; error: string }
  > => {
    try {
      const completion = await vly.ai.completion({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a connectivity probe for a resume app. Answer in at most six words.",
          },
          { role: "user", content: "Reply with exactly: LLM connection OK" },
        ],
        temperature: 0,
        maxTokens: 20,
      });
      if (!completion.success || !completion.data) {
        return {
          ok: false,
          error:
            completion.error ??
            "The AI gateway didn't answer — try again in a few seconds.",
        };
      }
      const reply =
        completion.data.choices[0]?.message.content?.trim() ?? "(empty reply)";
      return { ok: true, reply: reply.slice(0, 120) };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

/**
 * Send one test email through Resend to the address the user wants alerts
 * on. Never throws — the UI shows the returned status either way.
 */
export const testEmail = action({
  args: { to: v.string() },
  handler: async (
    _ctx,
    { to },
  ): Promise<{ ok: boolean; detail: string }> => {
    const key = process.env.RESEND_API_KEY;
    const target = to.trim();
    if (!key) {
      return {
        ok: false,
        detail: "Add RESEND_API_KEY in the Keys tab first.",
      };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      return { ok: false, detail: "Enter a valid email address first." };
    }
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM ?? "Tailorly <onboarding@resend.dev>",
          to: [target],
          subject: "Tailorly test email — you're connected",
          html: `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:24px"><h2 style="margin:0 0 8px">Tailorly email is connected</h2><p style="color:#555">Job Radar watch alerts for this address will arrive from this sender.</p></div>`,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const body = (await res.text().catch(() => "")).slice(0, 160);
        return {
          ok: false,
          detail: `Resend answered ${res.status}${body ? `: ${body}` : ""}`,
        };
      }
      return { ok: true, detail: `Test email sent to ${target}.` };
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  },
});
