import { describe, expect, it } from "vitest";
import {
  MAX_URL_CHARS,
  assertPublicHttpUrl,
  clampScore,
  extractJson,
  htmlToText,
} from "../aiParse";

describe("extractJson", () => {
  it("parses a plain JSON object", () => {
    expect(extractJson('{"a": 1}')).toEqual({ a: 1 });
  });

  it("parses JSON inside markdown fences", () => {
    const text = 'Here you go:\n```json\n{"score": 90}\n```\nDone.';
    expect(extractJson(text)).toEqual({ score: 90 });
  });

  it("parses JSON embedded in prose", () => {
    const text = 'Sure! The result is {"jobTitle": "Engineer"} — hope that helps.';
    expect(extractJson(text)).toEqual({ jobTitle: "Engineer" });
  });

  it("throws on an unparsable response", () => {
    expect(() => extractJson("no json here at all")).toThrow(
      "AI returned an unparsable response",
    );
  });
});

describe("clampScore", () => {
  it("rounds and clamps values into 0–100", () => {
    expect(clampScore(94.6, 0)).toBe(95);
    expect(clampScore(-12, 0)).toBe(0);
    expect(clampScore(250, 0)).toBe(100);
  });

  it("coerces numeric strings", () => {
    expect(clampScore("87.4", 0)).toBe(87);
  });

  it("falls back for NaN/Infinity/non-numbers", () => {
    expect(clampScore(Number.NaN, 42)).toBe(42);
    expect(clampScore(Infinity, 42)).toBe(42);
    expect(clampScore("not a number", 42)).toBe(42);
    expect(clampScore(undefined, 42)).toBe(42);
  });
});

describe("assertPublicHttpUrl", () => {
  it("accepts a public https URL", () => {
    const out = assertPublicHttpUrl("https://jobs.example.com/posting/123");
    expect(out).toContain("https://jobs.example.com/");
  });

  it("accepts http too", () => {
    expect(() => assertPublicHttpUrl("http://example.org/jobs")).not.toThrow();
  });

  it("rejects malformed URLs", () => {
    expect(() => assertPublicHttpUrl("not a url")).toThrow(
      /valid URL/i,
    );
  });

  it("rejects non-http protocols", () => {
    expect(() => assertPublicHttpUrl("ftp://example.com/file")).toThrow(
      /http\(s\)/i,
    );
    expect(() => assertPublicHttpUrl("javascript:alert(1)")).toThrow();
  });

  it("rejects localhost and loopback", () => {
    expect(() => assertPublicHttpUrl("http://localhost:3000")).toThrow();
    expect(() => assertPublicHttpUrl("http://127.0.0.1/admin")).toThrow();
    expect(() => assertPublicHttpUrl("http://[::1]/")).toThrow();
  });

  it("rejects private ranges", () => {
    expect(() => assertPublicHttpUrl("http://10.0.0.5/")).toThrow();
    expect(() => assertPublicHttpUrl("http://192.168.1.1/")).toThrow();
    expect(() => assertPublicHttpUrl("http://172.16.0.1/")).toThrow();
    expect(() => assertPublicHttpUrl("http://172.31.255.255/")).toThrow();
    expect(() => assertPublicHttpUrl("http://169.254.169.254/")).toThrow();
    expect(() => assertPublicHttpUrl("http://printer.local/")).toThrow();
  });

  it("allows 172.32.x (outside the private block) and caps length", () => {
    expect(() => assertPublicHttpUrl("http://172.32.0.1/")).not.toThrow();
    const long = `https://example.com/${"a".repeat(MAX_URL_CHARS)}`;
    expect(() => assertPublicHttpUrl(long)).not.toThrow();
  });
});

describe("htmlToText", () => {
  it("strips script/style/noscript/comments", () => {
    const html =
      "<p>Hello</p><script>alert('x')</script><style>.a{}</style>" +
      "<noscript>enable js</noscript><!-- nav -->";
    const out = htmlToText(html);
    expect(out).toBe("Hello");
    expect(out).not.toContain("alert");
    expect(out).not.toContain("enable js");
  });

  it("removes tags but keeps text, with block boundaries as newlines", () => {
    const out = htmlToText("<h1>Title</h1><p>One</p><p>Two</p>");
    expect(out).toBe("Title\nOne\nTwo");
  });

  it("decodes entities in a single pass", () => {
    expect(htmlToText("<p>It&#39;s &amp; &quot;fine&quot;</p>")).toBe(
      `It's & "fine"`,
    );
    // &amp;lt; must decode to a literal &lt; — not cascade to "<".
    expect(htmlToText("<p>&amp;lt;</p>")).toBe("&lt;");
    expect(htmlToText("<p>a&nbsp;b</p>")).toBe("a b");
  });

  it("collapses runs of whitespace and blank lines", () => {
    const out = htmlToText("<p>too   many\n\n\n   spaces</p>");
    expect(out).toBe("too many\n\nspaces");
  });
});
