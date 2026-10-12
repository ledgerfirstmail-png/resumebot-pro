import { describe, expect, it } from "vitest";
import {
  parseGreenhouseJobs,
  parseMuseJobs,
} from "@/lib/boardFeeds";

describe("parseMuseJobs", () => {
  it("maps the standard row shape", () => {
    const out = parseMuseJobs({
      results: [
        {
          id: 42,
          name: "Barista",
          contents: "<p>Make coffee</p>",
          publication_date: "Wed, 01 Oct 2026 10:00:00 GMT",
          refs: { landing_page: "https://muse.test/job/42" },
          locations: [{ name: "Columbus, OH" }, { name: "Remote" }],
          categories: [{ name: "Food Service" }],
          company: { name: "Brew Co" },
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      externalId: "42",
      title: "Barista",
      company: "Brew Co",
      description: "Make coffee",
      url: "https://muse.test/job/42",
      location: "Columbus, OH; Remote",
      tags: ["Food Service"],
    });
    expect(out[0].postedAt).toBeTypeOf("number");
  });

  it("falls back to the url as externalId and 'Unknown company'", () => {
    const out = parseMuseJobs({
      results: [
        {
          name: "Barista",
          refs: { landing_page: "https://muse.test/job/43" },
        },
      ],
    });
    expect(out[0].externalId).toBe("https://muse.test/job/43");
    expect(out[0].company).toBe("Unknown company");
    expect(out[0].location).toBe("Unspecified");
  });

  it("drops rows without title or url", () => {
    const out = parseMuseJobs({
      results: [
        { name: "No url" },
        { refs: { landing_page: "https://x.test" } },
        null,
      ],
    });
    expect(out).toHaveLength(0);
  });

  it("tolerates a non-object payload", () => {
    expect(parseMuseJobs(null)).toEqual([]);
    expect(parseMuseJobs("nope")).toEqual([]);
    expect(parseMuseJobs({})).toEqual([]);
  });
});

describe("parseGreenhouseJobs", () => {
  it("maps the board listing shape with location.name and company_name", () => {
    const out = parseGreenhouseJobs(
      {
        jobs: [
          {
            id: 123,
            title: "Software Engineer",
            absolute_url: "https://boards.greenhouse.io/stripe/jobs/123",
            company_name: "Stripe",
            updated_at: "2026-10-01T12:00:00-04:00",
            location: { name: "New York, NY" },
          },
        ],
      },
      "stripe",
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      externalId: "123",
      title: "Software Engineer",
      company: "Stripe",
      url: "https://boards.greenhouse.io/stripe/jobs/123",
      location: "New York, NY",
      description: "",
      tags: ["greenhouse"],
    });
    expect(out[0].postedAt).toBeTypeOf("number");
  });

  it("uses the board name when company_name is missing", () => {
    const out = parseGreenhouseJobs(
      {
        jobs: [{ id: 9, title: "Engineer", absolute_url: "https://x.test/9" }],
      },
      "stripe",
    );
    expect(out[0].company).toBe("stripe");
    expect(out[0].location).toBe("Unspecified");
  });

  it("drops rows without title or url and tolerates junk payloads", () => {
    expect(
      parseGreenhouseJobs(
        { jobs: [{ title: "no url" }, { absolute_url: "https://x.test" }] },
        "b",
      ),
    ).toHaveLength(0);
    expect(parseGreenhouseJobs(null, "b")).toEqual([]);
    expect(parseGreenhouseJobs({}, "b")).toEqual([]);
  });
});
