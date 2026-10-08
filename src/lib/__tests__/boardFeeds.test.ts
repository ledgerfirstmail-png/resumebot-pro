import { describe, expect, it } from "vitest";
import {
  decodeXmlEntities,
  parseWeWorkRemotelyRss,
} from "../boardFeeds";
import { isUsFocusedPosting } from "../matchScore";

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>We Work Remotely</title>
    <item>
      <title>BlueGeko: IT Infrastructure Engineer</title>
      <link>https://weworkremotely.com/remote-jobs/1</link>
      <region>Anywhere in the World</region>
      <country></country>
      <state>Alabama</state>
      <category>DevOps and Sysadmin</category>
      <type>Full-Time</type>
      <pubDate>Mon, 05 Oct 2026 12:00:00 +0000</pubDate>
      <description>&lt;p&gt;Headquarters: London&lt;/p&gt; &lt;p&gt;Build &amp;amp; run systems&lt;/p&gt;</description>
    </item>
    <item>
      <title>Acme Retail: Cashier (USA Only)</title>
      <link>https://weworkremotely.com/remote-jobs/2</link>
      <region>USA Only</region>
      <country>United States</country>
      <state></state>
      <category>Customer Support</category>
      <type>Full-Time</type>
      <pubDate>Tue, 06 Oct 2026 09:30:00 +0000</pubDate>
      <description>Help customers.</description>
    </item>
  </channel>
</rss>`;

describe("parseWeWorkRemotelyRss", () => {
  it("splits company and role from the combined title", () => {
    const rows = parseWeWorkRemotelyRss(SAMPLE_XML);
    expect(rows).toHaveLength(2);
    expect(rows[0].company).toBe("BlueGeko");
    expect(rows[0].title).toBe("IT Infrastructure Engineer");
    expect(rows[1].company).toBe("Acme Retail");
    expect(rows[1].title).toBe("Cashier (USA Only)");
  });

  it("prefers country/state over the region for the location", () => {
    const rows = parseWeWorkRemotelyRss(SAMPLE_XML);
    // State-only row: US evidence survives the US-focus filter.
    expect(rows[0].location).toBe("Alabama");
    expect(isUsFocusedPosting(rows[0].location)).toBe(true);
    expect(rows[1].location).toBe("United States");
  });

  it("keeps the link, date, tags, and a text description", () => {
    const rows = parseWeWorkRemotelyRss(SAMPLE_XML);
    expect(rows[0].url).toBe("https://weworkremotely.com/remote-jobs/1");
    expect(rows[0].externalId).toBe(rows[0].url);
    expect(rows[0].postedAt).toBe(Date.parse("Mon, 05 Oct 2026 12:00:00 +0000"));
    expect(rows[0].tags).toEqual(["DevOps and Sysadmin", "Full-Time"]);
    expect(rows[0].description).toContain("Build & run systems");
    expect(rows[0].description).not.toContain("<p>");
  });

  it("falls back to the region when no country/state is present", () => {
    const xml = SAMPLE_XML.replace(
      "<state>Alabama</state>",
      "<state></state>",
    );
    const rows = parseWeWorkRemotelyRss(xml);
    expect(rows[0].location).toBe("Anywhere in the World");
  });

  it("skips items without a title or link", () => {
    const xml = SAMPLE_XML.replace(
      /<title>BlueGeko[\s\S]*?<\/title>/,
      "",
    );
    expect(parseWeWorkRemotelyRss(xml)).toHaveLength(1);
  });
});

describe("decodeXmlEntities", () => {
  it("decodes the five XML entities without double-unescaping &", () => {
    expect(decodeXmlEntities("a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39;"))
      .toBe('a & b <c> "d" \'e\'');
  });
});
