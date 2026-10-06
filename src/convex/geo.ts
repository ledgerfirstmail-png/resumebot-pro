import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/**
 * Geocode cache for the 35-mile radius scan (ROADMAP P20): place strings
 * ("Columbus, OH", "43215") resolved to coordinates via Nominatim and shared
 * across every user and watch sweep so repeated scans never re-hit the
 * geocoder. Only jobSearch.ts (server) touches these; coordinates are not
 * sensitive.
 */

export const lookup = internalQuery({
  args: { query: v.string() },
  handler: async (ctx, { query }) => {
    return await ctx.db
      .query("geoCache")
      .withIndex("by_query", (q) => q.eq("query", query))
      .first();
  },
});

export const save = internalMutation({
  args: {
    query: v.string(),
    displayName: v.string(),
    lat: v.number(),
    lon: v.number(),
  },
  handler: async (ctx, { query, displayName, lat, lon }) => {
    const existing = await ctx.db
      .query("geoCache")
      .withIndex("by_query", (q) => q.eq("query", query))
      .first();
    const fields = { displayName, lat, lon, resolvedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }
    return await ctx.db.insert("geoCache", { query, ...fields });
  },
});
