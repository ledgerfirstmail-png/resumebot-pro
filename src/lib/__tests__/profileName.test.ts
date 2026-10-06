import { describe, expect, it } from "vitest";
import {
  MAX_PROFILE_NAME_CHARS,
  normalizeProfileName,
  profileLabel,
} from "@/lib/resumeSchemas";

describe("normalizeProfileName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeProfileName("  Engineering   Team  ")).toBe(
      "Engineering Team",
    );
    expect(normalizeProfileName("Management")).toBe("Management");
  });

  it("returns null for empty input", () => {
    expect(normalizeProfileName("")).toBeNull();
    expect(normalizeProfileName("   ")).toBeNull();
    expect(normalizeProfileName("\n\t ")).toBeNull();
  });

  it("caps at the maximum length", () => {
    const long = "a".repeat(MAX_PROFILE_NAME_CHARS + 25);
    const cleaned = normalizeProfileName(long);
    expect(cleaned).not.toBeNull();
    expect(cleaned?.length).toBe(MAX_PROFILE_NAME_CHARS);
  });

  it("keeps unicode names intact", () => {
    expect(normalizeProfileName("苏珊 的简历")).toBe("苏珊 的简历");
    expect(normalizeProfileName("Ingénierie")).toBe("Ingénierie");
  });
});

describe("profileLabel", () => {
  it("falls back to the friendly default", () => {
    expect(profileLabel(null)).toBe("Default profile");
    expect(profileLabel(undefined)).toBe("Default profile");
    expect(profileLabel("")).toBe("Default profile");
    expect(profileLabel("   ")).toBe("Default profile");
  });

  it("uses the stored name when present", () => {
    expect(profileLabel("Engineering")).toBe("Engineering");
    expect(profileLabel("  PM  ")).toBe("PM");
  });
});
