const express = require('express');
const fs = require('fs');
const path = require('path');
const { seedProjects } = require('./seed');

const PORT = Number(process.env.PORT || 3000);
const SWEEP_SECONDS = Number(process.env.SWEEP_SECONDS || 60); // demo cadence; weekly in real use
const DATA_FILE = path.join(__dirname, 'data', 'db.json');
const DAY = 86400000;
const STATUSES = ['On track', 'At risk', 'Blocked', 'Done'];

// ---------- storage (a JSON file) ----------
function load() {
  if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  return { projects: seedProjects(), digests: [], events: [], nextSweepAt: null };
}
let db = load();
function save() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}
function logEvent(kind, text) {
  db.events.unshift({ at: new Date().toISOString(), kind, text });
  db.events = db.events.slice(0, 100);
}

// ---------- risk engine ----------
function assess(p, now = Date.now()) {
  if (p.status === 'Done') return { score: 0, reasons: [] };
  let score = 0;
  const reasons = [];
  const due = new Date(p.dueDate + 'T23:59:59').getTime();
  const start = new Date(p.startDate + 'T00:00:00').getTime();
  const daysLeft = Math.ceil((due - now) / DAY);
  const staleDays = Math.floor((now - new Date(p.updatedAt).getTime()) / DAY);
  const expected = Math.max(0, Math.min(100, Math.round(((now - start) / (due - start)) * 100)));
  const gap = expected - p.progress;

  if (p.status === 'Blocked') { score += 50; reasons.push('Blocked'); }
  if (p.status === 'At risk') { score += 30; reasons.push('Owner flagged at risk'); }
  if (daysLeft < 0) { score += 40; reasons.push(`Overdue by ${-daysLeft} day(s)`); }
  else if (daysLeft <= 14 && p.progress < 80) { score += 20; reasons.push(`Due in ${daysLeft} day(s) at ${p.progress}%`); }
  if (gap >= 15) { score += Math.min(25, gap); reasons.push(`${gap} pts behind plan (expected ${expected}%)`); }
  if (staleDays >= 14) { score += 25; reasons.push(`No update for ${staleDays} days`); }
  else if (staleDays >= 7) { score += 10; reasons.push(`No update for ${staleDays} days`); }
  return { score, reasons, daysLeft, staleDays, expected };
}
function withRisk(p) { return { ...p, risk: assess(p) }; }
function topThree() {
  return db.projects.map(withRisk).filter((p) => p.risk.score > 0)
    .sort((a, b) => b.risk.score - a.risk.score || a.risk.daysLeft - b.risk.daysLeft).slice(0, 3);
}

// ---------- the automated step: scheduled risk sweep ----------
function sweep(trigger) {
  const now = Date.now();
  const changes = [];
  for (const p of db.projects) {
    const r = assess(p, now);
    // Auto-escalate: "On track" claims that the data contradicts get flagged At risk.
    if (p.status === 'On track' && (r.staleDays >= 14 || r.daysLeft < 0 || (r.expected - p.progress) >= 20)) {
      p.status = 'At risk';
      const why = r.reasons.join('; ');
      p.updates.unshift({ at: new Date(now).toISOString(), by: 'Risk sweep (auto)', status: 'At risk', progress: p.progress, note: `Auto-flagged: ${why}` });
      changes.push(`${p.id} ${p.name} → At risk (${why})`);
    }
  }
  const top = topThree();
  const counts = Object.fromEntries(STATUSES.map((s) => [s, db.projects.filter((p) => p.status === s).length]));
  const digest = {
    at: new Date(now).toISOString(), trigger, counts, changes,
    top: top.map((p) => ({ id: p.id, name: p.name, function: p.function, owner: p.owner, score: p.risk.score, reasons: p.risk.reasons })),
  };
  db.digests.unshift(digest);
  db.digests = db.digests.slice(0, 50);
  if (trigger === 'schedule') db.nextSweepAt = new Date(now + SWEEP_SECONDS * 1000).toISOString();
  logEvent('sweep', `Risk sweep ran (${trigger}): ${changes.length} auto-flag(s); top 3 = ${digest.top.map((t) => t.id).join(', ')}`);
  save();
  console.log(`[sweep] ${digest.at} trigger=${trigger} changes=${changes.length} top=${digest.top.map((t) => t.id).join(',')}`);
  return digest;
}
let timer = null;
function schedule() {
  clearInterval(timer);
  db.nextSweepAt = new Date(Date.now() + SWEEP_SECONDS * 1000).toISOString();
  timer = setInterval(() => sweep('schedule'), SWEEP_SECONDS * 1000);
}

// ---------- API ----------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/state', (req, res) => {
  res.json({
    now: new Date().toISOString(), sweepSeconds: SWEEP_SECONDS, nextSweepAt: db.nextSweepAt,
    statuses: STATUSES, projects: db.projects.map(withRisk), top: topThree(),
    digests: db.digests.slice(0, 10), events: db.events.slice(0, 30),
  });
});

function applyUpdate(p, body, by) {
  if (body.status && !STATUSES.includes(body.status)) throw new Error('bad status');
  if (body.status) p.status = body.status;
  if (body.progress !== undefined && body.progress !== '') p.progress = Math.max(0, Math.min(100, Number(body.progress)));
  if (body.owner) p.owner = body.owner;
  if (body.dueDate) p.dueDate = body.dueDate;
  p.updatedAt = new Date().toISOString();
  p.updates.unshift({ at: p.updatedAt, by: by || p.owner, status: p.status, progress: p.progress, note: body.note || '' });
}

app.post('/api/projects', (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.function || !b.owner || !b.dueDate) return res.status(400).json({ error: 'name, function, owner and dueDate are required' });
  const id = 'P' + String(db.projects.length + 1).padStart(3, '0');
  const now = new Date().toISOString();
  const p = {
    id, name: b.name, function: b.function, owner: b.owner, status: STATUSES.includes(b.status) ? b.status : 'On track',
    startDate: b.startDate || now.slice(0, 10), dueDate: b.dueDate, progress: Number(b.progress || 0), updatedAt: now,
    updates: [{ at: now, by: b.owner, status: b.status || 'On track', progress: Number(b.progress || 0), note: b.note || 'Project created' }],
  };
  db.projects.push(p);
  logEvent('create', `${id} ${p.name} added by ${p.owner} (${p.function})`);
  save();
  res.status(201).json(withRisk(p));
});

app.post('/api/projects/:id/update', (req, res) => {
  const p = db.projects.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  try { applyUpdate(p, req.body || {}, req.body && req.body.by); } catch (e) { return res.status(400).json({ error: e.message }); }
  logEvent('update', `${p.id} ${p.name} → ${p.status}, ${p.progress}%`);
  save();
  res.json(withRisk(p));
});

app.post('/api/sweep', (req, res) => res.json(sweep('manual')));

// Webhook: a function's own tool (Jira, a sheet script, etc.) pushes an update here.
// Body: { "project": "P011" or project name, "status": "...", "progress": 70, "note": "...", "source": "jira" }
app.post('/hooks/update', (req, res) => {
  const b = req.body || {};
  const key = String(b.project || '').toLowerCase();
  const p = db.projects.find((x) => x.id.toLowerCase() === key || x.name.toLowerCase() === key);
  if (!p) return res.status(404).json({ error: `no project matching "${b.project}"` });
  try { applyUpdate(p, b, `Webhook (${b.source || 'external'})`); } catch (e) { return res.status(400).json({ error: e.message }); }
  logEvent('webhook', `Webhook from ${b.source || 'external'}: ${p.id} ${p.name} → ${p.status}, ${p.progress}%`);
  const digest = sweep('webhook'); // re-rank immediately
  res.json({ ok: true, project: withRisk(p), top: digest.top });
});

app.post('/api/reset', (req, res) => {
  db = { projects: seedProjects(), digests: [], events: [], nextSweepAt: null };
  logEvent('reset', 'Sample data reloaded');
  schedule(); save();
  res.json({ ok: true });
});

schedule();
logEvent('start', `Server started; risk sweep every ${SWEEP_SECONDS}s`);
save();
app.listen(PORT, () => console.log(`Tracker running at http://localhost:${PORT} (sweep every ${SWEEP_SECONDS}s)`));
