import { describe, expect, it } from "vitest";
import {
  addEmployerToQuery,
  buildWorkdaySearchText,
  EMPLOYER_CHIP_NAMES,
  findEmployers,
  isEmployerSelected,
  LOCAL_EMPLOYERS,
  parsePostedOn,
  parseTacoBellListings,
  parseWincoDetail,
  parseWincoListings,
  removeEmployerFromQuery,
  stripBrandTerms,
} from "../localEmployers";

describe("employer chips (query ↔ brand)", () => {
  it("finds brands by name, alias, and common misspellings", () => {
    expect(
      findEmployers("part time walmart cashier").map((e) => e.name),
    ).toEqual(["Walmart"]);
    expect(findEmployers("lows").map((e) => e.name)).toEqual(["Lowe's"]);
    expect(findEmployers("star bucks barista").map((e) => e.name)).toEqual([
      "Starbucks",
    ]);
    expect(findEmployers("tacobell").map((e) => e.name)).toEqual(["Taco Bell"]);
    expect(findEmployers("software engineer")).toEqual([]);
  });

  it("only matches whole words", () => {
    expect(findEmployers("the clerk allows returns")).toEqual([]);
    expect(findEmployers("target audience research")).toHaveLength(1); // Target chip
  });

  it("adds a brand once and keeps the user's own words", () => {
    const q1 = addEmployerToQuery("cashier", "Walmart");
    expect(q1).toBe("cashier walmart");
    expect(addEmployerToQuery(q1, "Walmart")).toBe(q1);
    expect(addEmployerToQuery("", "Taco Bell")).toBe("taco bell");
  });

  it("removes only the brand, keeping the rest of the query", () => {
    expect(removeEmployerFromQuery("overnight lowes stocker", "Lowe's")).toBe(
      "overnight stocker",
    );
    expect(removeEmployerFromQuery("home depot cashier", "Home Depot")).toBe(
      "cashier",
    );
    expect(removeEmployerFromQuery("cashier", "Walmart")).toBe("cashier");
  });

  it("round-trips through selected-state checks", () => {
    const q = addEmployerToQuery("cashier", "WinCo Foods");
    expect(isEmployerSelected(q, "WinCo Foods")).toBe(true);
    expect(isEmployerSelected(q, "Walmart")).toBe(false);
    expect(removeEmployerFromQuery(q, "WinCo Foods")).toBe("cashier");
  });

  it("strips every brand alias for employer-side search", () => {
    expect(stripBrandTerms("walmart taco bell cashier")).toBe("cashier");
    expect(stripBrandTerms("taco bell")).toBe("");
    expect(stripBrandTerms("react developer")).toBe("react developer");
  });
});

describe("buildWorkdaySearchText", () => {
  it("prefers locations so a city scan lands on local stores", () => {
    expect(
      buildWorkdaySearchText("walmart cashier", ["austin", "tx"]),
    ).toBe("austin tx");
  });
  it("falls back to the brand-stripped query", () => {
    expect(buildWorkdaySearchText("home depot cashier", [])).toBe("cashier");
    expect(buildWorkdaySearchText("lowes", [])).toBe("");
    expect(buildWorkdaySearchText("", [])).toBe("");
  });
});

describe("parsePostedOn (Workday relative dates)", () => {
  const now = Date.now();
  const days = (n: number) => Math.abs(now - (parsePostedOn(`Posted ${n} Days Ago`) ?? 0)) / 86_400_000;

  it("parses today and day counts", () => {
    expect(Math.abs(now - (parsePostedOn("Posted Today") ?? 0))).toBeLessThan(
      60_000,
    );
    expect(days(5)).toBeCloseTo(5, 1);
  });
  it("parses the 30+ floor, weeks, and months", () => {
    const plus = parsePostedOn("Posted 30+ Days Ago") ?? 0;
    expect(Math.abs(now - plus) / 86_400_000).toBeCloseTo(31, 0);
    expect(Math.abs(now - (parsePostedOn("Posted 2 Weeks Ago") ?? 0)) / 86_400_000).toBeCloseTo(14, 0);
    expect(Math.abs(now - (parsePostedOn("Posted 3 Months Ago") ?? 0)) / 86_400_000).toBeCloseTo(90, 0);
  });
  it("returns undefined for empty or unknown formats", () => {
    expect(parsePostedOn("")).toBeUndefined();
    expect(parsePostedOn(null)).toBeUndefined();
    expect(parsePostedOn("Whenever")).toBeUndefined();
  });
});

describe("parseTacoBellListings (JSON-LD job slugs)", () => {
  const html = `
    <script type="application/ld+json">{
      "@type": "ItemList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1,
         "url": "https://jobs.tacobell.com/job/manager-in-training-or/the-dalles-or/955703939/"},
        {"@type": "ListItem", "position": 2,
         "url": "https://jobs.tacobell.com/job/crew-or/portland-or/380151109/"},
        {"@type": "ListItem", "position": 3,
         "url": "https:\\/\\/jobs.tacobell.com\\/job\\/cashier-tx\\/austin-tx\\/111222333\\/"},
        {"@type": "ListItem", "position": 4,
         "url": "https://jobs.tacobell.com/job/crew-or/portland-or/380151109/"}
      ]
    }</script>`;

  it("derives title and city/state from the URL slugs", () => {
    const jobs = parseTacoBellListings(html);
    expect(jobs).toHaveLength(3); // duplicate id deduped
    expect(jobs[0]).toMatchObject({
      externalId: "955703939",
      title: "Manager In Training",
      location: "The Dalles, OR",
    });
    expect(jobs[1]).toMatchObject({
      title: "Crew",
      location: "Portland, OR",
    });
    expect(jobs[2]).toMatchObject({
      title: "Cashier",
      location: "Austin, TX",
      url: "https://jobs.tacobell.com/job/cashier-tx/austin-tx/111222333/",
    });
  });

  it("returns an empty list when nothing matches", () => {
    expect(parseTacoBellListings("<html>nothing here</html>")).toEqual([]);
  });
});

describe("parseWincoListings (iCims list rows)", () => {
  const html = `
    <div class="col-xs-12 title"> <a href="https://careers-winco.icims.com/jobs/155810/fresh-foods-clerk/job?in_iframe=1" class="iCIMS_Anchor" title="155810 - Fresh Foods Clerk"> <span class="sr-only field-label">Title</span> <h3 > Fresh Foods Clerk</h3> </a> </div>
    <div class="col-xs-12 description"> Join us at <b>WinCo Foods</b>, employee owned! </div>
    <div class="col-xs-12 title"> <a href="https://careers-winco.icims.com/jobs/155809/overnight-stocker/job?in_iframe=1" class="iCIMS_Anchor" title="155809 - Overnight Stocker"> <span class="sr-only field-label">Title</span> <h3 > Overnight Stocker</h3> </a> </div>
    <div class="col-xs-12 description"> Overnight shifts available. </div>`;

  it("extracts id, title, url, and the snippet description", () => {
    const rows = parseWincoListings(html);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      externalId: "155810",
      title: "Fresh Foods Clerk",
      url: "https://careers-winco.icims.com/jobs/155810/fresh-foods-clerk/job?in_iframe=1",
    });
    expect(rows[0].description).toContain("WinCo Foods");
    expect(rows[0].description).not.toContain("<b>");
    expect(rows[1].title).toBe("Overnight Stocker");
  });
});

describe("parseWincoDetail (iCims job page)", () => {
  it("reads location, posted date, and JSON-escaped description", () => {
    const html = `
      {"jobPostingInfo": {"location":"Logan, Utah, United States","title":"Fresh Foods Clerk"}}
      {"Posted":"2026-10-05T04:00:00.000Z","occupationalCategory":"Store"}
      <script>{"description":"<p>Join our team \\u0026 grow with us.</p>"}</script>`;
    const detail = parseWincoDetail(html);
    expect(detail.location).toBe("Logan, Utah, United States");
    expect(detail.postedAt).toBe(Date.parse("2026-10-05T04:00:00.000Z"));
    expect(detail.description).toContain("Join our team & grow with us.");
    expect(detail.description).not.toContain("<p>");
  });

  it("returns an empty object when the page has no data", () => {
    expect(parseWincoDetail("<html></html>")).toEqual({});
  });
});

describe("registry", () => {
  it("offers every requested chain as a chip", () => {
    for (const name of [
      "Walmart",
      "Big Lots",
      "Home Depot",
      "Lowe's",
      "Taco Bell",
      "WinCo Foods",
      "Starbucks",
    ]) {
      expect(EMPLOYER_CHIP_NAMES).toContain(name);
    }
  });

  it("wires exactly the seven verified Workday feeds", () => {
    const workday = LOCAL_EMPLOYERS.filter((e) => e.workday);
    expect(workday.map((e) => e.name).sort()).toEqual([
      "Chipotle",
      "Dollar Tree",
      "Home Depot",
      "Lowe's",
      "Meijer",
      "Target",
      "Walmart",
    ]);
    for (const emp of workday) {
      expect(emp.workday?.host).toMatch(/\.myworkdayjobs\.com$/);
      expect(emp.workday?.site.length).toBeGreaterThan(0);
    }
  });
});
