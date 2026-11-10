import type { Config } from "@netlify/functions";
import { sweep } from "./_shared/tracker.js";

// Replaces the old in-process setInterval: Netlify runs this on a schedule.
export default async () => {
  const d = await sweep("schedule");
  console.log(`[sweep] ${d.at} changes=${d.changes.length} top=${d.top.map((t) => t.id).join(",")}`);
};

export const config: Config = {
  schedule: "@hourly",
};
