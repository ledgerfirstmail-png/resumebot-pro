import { describe, expect, it } from "vitest";
import {
  isValidShareSlug,
  makeShareSlug,
  shareUrl,
} from "@/lib/shareLink";

describe("makeShareSlug", () => {
  it("defaults to a 10-character slug", () => {
    expect(makeShareSlug()).toHaveLength(10);
  });

  it("respects a custom length", () => {
    expect(makeShareSlug(16)).toHaveLength(16);
    expect(makeShareSlug(4)).toHaveLength(4);
  });

  it("only emits lowercase url-safe characters", () => {
    for (let i = 0; i < 200; i++) {
      expect(makeShareSlug()).toMatch(/^[a-z0-9]{10}$/);
    }
  });

  it("practically never collides", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(makeShareSlug());
    expect(seen.size).toBe(500);
  });
});

describe("isValidShareSlug", () => {
  it("accepts slugs we could have issued", () => {
    expect(isValidShareSlug(makeShareSlug())).toBe(true);
    expect(isValidShareSlug("abcd")).toBe(true);
    expect(isValidShareSlug("a".repeat(32))).toBe(true);
  });

  it("rejects malformed or malicious input", () => {
    expect(isValidShareSlug("")).toBe(false);
    expect(isValidShareSlug("abc")).toBe(false); // too short
    expect(isValidShareSlug("a".repeat(33))).toBe(false); // too long
    expect(isValidShareSlug("UPPER")).toBe(false);
    expect(isValidShareSlug("has-hyphen")).toBe(false);
    expect(isValidShareSlug("has space")).toBe(false);
    expect(isValidShareSlug("../etc/passwd")).toBe(false);
    expect(isValidShareSlug("a'b\";drop")).toBe(false);
  });
});

describe("shareUrl", () => {
  it("builds the public /r/<slug> URL", () => {
    expect(shareUrl("https://tailorly.app", "kx3mtr9wpq")).toBe(
      "https://tailorly.app/r/kx3mtr9wpq",
    );
  });

  it("tolerates origins with trailing slashes", () => {
    expect(shareUrl("https://tailorly.app/", "kx3mtr9wpq")).toBe(
      "https://tailorly.app/r/kx3mtr9wpq",
    );
    expect(shareUrl("https://tailorly.app///", "abcd")).toBe(
      "https://tailorly.app/r/abcd",
    );
  });
});
