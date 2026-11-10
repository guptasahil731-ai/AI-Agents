import type { Config, Context } from "@netlify/functions";
import {
  getState, sweep, applyUpdate, findProject, createProject, resetData, withRisk, logEvent,
} from "./_shared/tracker.js";

const bad = (status: number, error: string) => Response.json({ error }, { status });

async function readJson(req: Request) {
  try { return (await req.json()) ?? {}; } catch { return {}; }
}

export default async (req: Request, context: Context) => {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  const method = req.method;

  try {
    if (method === "GET" && path === "/api/state") return Response.json(await getState());

    if (method !== "POST") return bad(405, "method not allowed");

    if (path === "/api/sweep") return Response.json(await sweep("manual"));

    if (path === "/api/reset") {
      await resetData();
      return Response.json({ ok: true });
    }

    if (path === "/api/projects") {
      const b = await readJson(req);
      if (!b.name || !b.function || !b.owner || !b.dueDate) return bad(400, "name, function, owner and dueDate are required");
      const p = await createProject(b);
      return Response.json(withRisk(p), { status: 201 });
    }

    const m = path.match(/^\/api\/projects\/([^/]+)\/update$/);
    if (m) {
      const p = await findProject(decodeURIComponent(m[1]));
      if (!p) return bad(404, "not found");
      const b = await readJson(req);
      try { await applyUpdate(p, b, b.by); } catch (e) { return bad(400, (e as Error).message); }
      await logEvent("update", `${p.id} ${p.name} → ${p.status}, ${p.progress}%`);
      return Response.json(withRisk(p));
    }

    // Webhook: a function's own tool (Jira, a sheet script, etc.) pushes an update here.
    // Body: { "project": "P011" or project name, "status": "...", "progress": 70, "note": "...", "source": "jira" }
    if (path === "/hooks/update") {
      const b = await readJson(req);
      const p = await findProject(String(b.project || ""));
      if (!p) return bad(404, `no project matching "${b.project}"`);
      const source = b.source || "external";
      try { await applyUpdate(p, b, `Webhook (${source})`); } catch (e) { return bad(400, (e as Error).message); }
      await logEvent("webhook", `Webhook from ${source}: ${p.id} ${p.name} → ${p.status}, ${p.progress}%`);
      const digest = await sweep("webhook"); // re-rank immediately
      return Response.json({ ok: true, project: withRisk(p), top: digest.top });
    }

    return bad(404, "not found");
  } catch (e) {
    console.error(e);
    return bad(500, "server error");
  }
};

export const config: Config = {
  path: ["/api/*", "/hooks/update"],
};
