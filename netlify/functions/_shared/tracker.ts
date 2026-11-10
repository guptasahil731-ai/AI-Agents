import { desc, eq, sql } from "drizzle-orm";
import { db } from "../../../db/index.js";
import { projects, digests, events, type ProjectUpdate } from "../../../db/schema.js";
import { seedProjects } from "./seed.js";

export const STATUSES = ["On track", "At risk", "Blocked", "Done"];
// Must match the cron in sweep-scheduled.mts (hourly).
export const SWEEP_SECONDS = 3600;
const DAY = 86400000;

export type Project = typeof projects.$inferSelect;

export async function logEvent(kind: string, text: string) {
  await db.insert(events).values({ kind, text });
}

/** Loads the sample data the first time the database is used (or after a reset). */
export async function ensureSeeded() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(projects);
  if (n > 0) return;
  await db.insert(projects).values(seedProjects()).onConflictDoNothing();
  await logEvent("reset", "Sample data loaded");
}

export function assess(p: Project, now = Date.now()) {
  if (p.status === "Done") return { score: 0, reasons: [] as string[] };
  let score = 0;
  const reasons: string[] = [];
  const due = new Date(p.dueDate + "T23:59:59").getTime();
  const start = new Date(p.startDate + "T00:00:00").getTime();
  const daysLeft = Math.ceil((due - now) / DAY);
  const staleDays = Math.floor((now - new Date(p.updatedAt).getTime()) / DAY);
  const expected = Math.max(0, Math.min(100, Math.round(((now - start) / (due - start)) * 100)));
  const gap = expected - p.progress;

  if (p.status === "Blocked") { score += 50; reasons.push("Blocked"); }
  if (p.status === "At risk") { score += 30; reasons.push("Owner flagged at risk"); }
  if (daysLeft < 0) { score += 40; reasons.push(`Overdue by ${-daysLeft} day(s)`); }
  else if (daysLeft <= 14 && p.progress < 80) { score += 20; reasons.push(`Due in ${daysLeft} day(s) at ${p.progress}%`); }
  if (gap >= 15) { score += Math.min(25, gap); reasons.push(`${gap} pts behind plan (expected ${expected}%)`); }
  if (staleDays >= 14) { score += 25; reasons.push(`No update for ${staleDays} days`); }
  else if (staleDays >= 7) { score += 10; reasons.push(`No update for ${staleDays} days`); }
  return { score, reasons, daysLeft, staleDays, expected };
}

const iso = (t: string) => new Date(t).toISOString();
export const withRisk = (p: Project) => ({ ...p, updatedAt: iso(p.updatedAt), risk: assess(p) });

export function topThree(all: Project[]) {
  return all.map(withRisk).filter((p) => p.risk.score > 0)
    .sort((a, b) => b.risk.score - a.risk.score || (a.risk.daysLeft ?? 0) - (b.risk.daysLeft ?? 0)).slice(0, 3);
}

export function nextSweepAt(now = Date.now()) {
  const ms = SWEEP_SECONDS * 1000;
  return new Date(Math.floor(now / ms) * ms + ms).toISOString();
}

/** The automated step: auto-flag "On track" claims the data contradicts, then rank the top 3. */
export async function sweep(trigger: string) {
  await ensureSeeded();
  const now = Date.now();
  const changes: string[] = [];
  const all = await db.select().from(projects);
  for (const p of all) {
    const r = assess(p, now);
    if (p.status === "On track" && ((r.staleDays ?? 0) >= 14 || (r.daysLeft ?? 0) < 0 || ((r.expected ?? 0) - p.progress) >= 20)) {
      const why = r.reasons.join("; ");
      p.status = "At risk";
      p.updates = [{ at: new Date(now).toISOString(), by: "Risk sweep (auto)", status: "At risk", progress: p.progress, note: `Auto-flagged: ${why}` }, ...p.updates];
      await db.update(projects).set({ status: p.status, updates: p.updates }).where(eq(projects.id, p.id));
      changes.push(`${p.id} ${p.name} → At risk (${why})`);
    }
  }
  const top = topThree(all);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, all.filter((p) => p.status === s).length]));
  const digest = {
    at: new Date(now).toISOString(), trigger, counts, changes,
    top: top.map((p) => ({ id: p.id, name: p.name, function: p.function, owner: p.owner, score: p.risk.score, reasons: p.risk.reasons })),
  };
  await db.insert(digests).values({ at: digest.at, trigger, data: digest });
  await logEvent("sweep", `Risk sweep ran (${trigger}): ${changes.length} auto-flag(s); top 3 = ${digest.top.map((t) => t.id).join(", ")}`);
  return digest;
}

export async function getState() {
  await ensureSeeded();
  const [all, ds, ev] = await Promise.all([
    db.select().from(projects).orderBy(projects.id),
    db.select().from(digests).orderBy(desc(digests.id)).limit(10),
    db.select().from(events).orderBy(desc(events.id)).limit(30),
  ]);
  return {
    now: new Date().toISOString(), sweepSeconds: SWEEP_SECONDS, nextSweepAt: nextSweepAt(),
    statuses: STATUSES, projects: all.map(withRisk), top: topThree(all),
    digests: ds.map((d) => d.data), events: ev.map(({ at, kind, text }) => ({ at: iso(at), kind, text })),
  };
}

export async function applyUpdate(p: Project, body: Record<string, any>, by?: string) {
  if (body.status && !STATUSES.includes(body.status)) throw new Error("bad status");
  if (body.status) p.status = body.status;
  if (body.progress !== undefined && body.progress !== "") {
    const n = Number(body.progress);
    if (!Number.isFinite(n)) throw new Error("bad progress");
    p.progress = Math.max(0, Math.min(100, Math.round(n)));
  }
  if (body.owner) p.owner = body.owner;
  if (body.dueDate) p.dueDate = body.dueDate;
  p.updatedAt = new Date().toISOString();
  const entry: ProjectUpdate = { at: p.updatedAt, by: by || p.owner, status: p.status, progress: p.progress, note: body.note || "" };
  p.updates = [entry, ...p.updates];
  await db.update(projects).set({
    status: p.status, progress: p.progress, owner: p.owner, dueDate: p.dueDate, updatedAt: p.updatedAt, updates: p.updates,
  }).where(eq(projects.id, p.id));
}

export async function findProject(key: string) {
  const k = key.toLowerCase();
  const [p] = await db.select().from(projects)
    .where(sql`lower(${projects.id}) = ${k} or lower(${projects.name}) = ${k}`).limit(1);
  return p;
}

export async function createProject(b: Record<string, any>) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(projects);
  const id = "P" + String(n + 1).padStart(3, "0");
  const now = new Date().toISOString();
  const status = STATUSES.includes(b.status) ? b.status : "On track";
  const progress = Math.max(0, Math.min(100, Math.round(Number(b.progress || 0)) || 0));
  const [p] = await db.insert(projects).values({
    id, name: b.name, function: b.function, owner: b.owner, status,
    startDate: b.startDate || now.slice(0, 10), dueDate: b.dueDate, progress, updatedAt: now,
    updates: [{ at: now, by: b.owner, status, progress, note: b.note || "Project created" }],
  }).returning();
  await logEvent("create", `${id} ${p.name} added by ${p.owner} (${p.function})`);
  return p;
}

export async function resetData() {
  await db.delete(projects);
  await db.delete(digests);
  await db.delete(events);
  await ensureSeeded();
}
