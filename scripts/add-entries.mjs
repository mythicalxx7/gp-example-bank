#!/usr/bin/env node
/**
 * Fetches new examples via the Gemini API (with Google Search grounding)
 * and appends them to data/entries.json.
 *
 * Runs on Gemini's free tier: Flash models are free subject to rate limits,
 * and Search grounding has a monthly free allowance. One run a day sits well
 * inside both. Enabling billing REPLACES the free allowance rather than
 * adding to it, so leave billing off unless you mean to pay.
 *
 * Env:
 *   GEMINI_API_KEY   required — from Google AI Studio, no credit card needed
 *   ENTRY_COUNT      how many to ask for (default 6)
 *   MODEL            model id (default gemini-3.5-flash)
 *   SKIP_LINK_CHECK  "1" to skip verifying that source URLs resolve
 *   DRY_RUN          "1" to print without writing
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DATA_PATH = path.join(ROOT, "data", "entries.json");
const PROMPT_PATH = path.join(HERE, "prompt.md");

const API_KEY = process.env.GEMINI_API_KEY;
const COUNT = Number(process.env.ENTRY_COUNT || 6);
const MODEL = (process.env.MODEL && process.env.MODEL.trim()) || "gemini-3.5-flash";
const DRY_RUN = process.env.DRY_RUN === "1";
const SKIP_LINK_CHECK = process.env.SKIP_LINK_CHECK === "1";

const VALID_CATS = ["sci","env","med","pol","glo","eco","soc","gen","edu","hea","art","eth","rel"];
const VALID_REGIONS = ["sg","asia","world"];

if(!API_KEY){
  console.error("GEMINI_API_KEY is not set. Get one free at https://aistudio.google.com/apikey");
  process.exit(1);
}

/* ---------- build the prompt from the current state of the bank ---------- */

function buildPrompt(template, entries){
  const catCounts = Object.fromEntries(
    VALID_CATS.map(c => [c, entries.filter(e => e.c.includes(c)).length]));
  const thin = VALID_CATS
    .slice()
    .sort((a, b) => catCounts[a] - catCounts[b])
    .slice(0, 4)
    .join(", ");

  const words = {};
  entries.forEach(e => e.t.toLowerCase().split(/[^a-z]+/).forEach(w => {
    if(w.length > 4) words[w] = (words[w] || 0) + 1;
  }));
  const hot = Object.entries(words)
    .filter(([, n]) => n >= 4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w)
    .join(", ") || "none yet";

  const titles = entries.slice(-90).map(e => `- ${e.t} (${e.y})`).join("\n");

  return template
    .replaceAll("{{TODAY}}", new Date().toISOString().slice(0, 10))
    .replaceAll("{{COUNT}}", String(COUNT))
    .replaceAll("{{THIN_CATS}}", thin)
    .replaceAll("{{HOT_TOPICS}}", hot)
    .replaceAll("{{RECENT_TITLES}}", titles);
}

/* ---------- API ----------
   Google Search grounding cannot be combined with JSON response mode — the API
   rejects the pair. So we ask for JSON in the prompt and extract it from the
   text response instead. */

async function callGemini(prompt){
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 8000 }
  };

  // NO_SEARCH=1 disables grounding. Diagnostic only: without search the model
  // cannot know what happened this week and will invent entries and URLs.
  // Use it to tell a grounding-quota problem apart from a project-tier one,
  // then always run with DRY_RUN=1 alongside it.
  if(process.env.NO_SEARCH !== "1"){
    body.tools = [{ google_search: {} }];
  } else {
    console.log("NO_SEARCH set — grounding disabled. Output will be unreliable; do not commit it.");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": API_KEY },
    body: JSON.stringify(body)
  });

  if(!res.ok){
    throw new Error(`Gemini returned ${res.status}: ${(await res.text()).slice(0, 600)}`);
  }

  const data = await res.json();
  const cand = data.candidates?.[0];
  if(!cand) throw new Error("No candidate in response: " + JSON.stringify(data).slice(0, 400));

  const text = (cand.content?.parts || []).map(p => p.text || "").join("").trim();

  // Grounding metadata tells us which pages the model actually read.
  const chunks = cand.groundingMetadata?.groundingChunks || [];
  const groundedHosts = new Set();
  for(const ch of chunks){
    try { groundedHosts.add(new URL(ch.web?.uri || "").hostname.replace(/^www\./, "")); }
    catch(e) {}
  }
  const queries = cand.groundingMetadata?.webSearchQueries || [];
  if(queries.length) console.log(`Searches run: ${queries.slice(0, 10).join(" | ")}`);

  return { text, groundedHosts };
}

/* ---------- validation ---------- */

function parseEntries(text){
  const cleaned = text.replace(/^```(?:json)?/gm, "").replace(/```$/gm, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if(start === -1 || end === -1){
    throw new Error("No JSON array in response:\n" + cleaned.slice(0, 500));
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

function slug(title){
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

/* A hallucinated URL is the main risk with a smaller model, so check it resolves. */
async function linkResolves(url){
  if(SKIP_LINK_CHECK) return true;
  for(const method of ["HEAD", "GET"]){
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(url, {
        method,
        redirect: "follow",
        signal: ctrl.signal,
        headers: { "user-agent": "Mozilla/5.0 (compatible; ExampleBankBot/1.0)" }
      });
      clearTimeout(timer);
      if(res.status < 400) return true;
      if(res.status === 404 || res.status === 410) return false;
      // 403/405 usually means the site dislikes bots, not that the page is missing.
      if(method === "GET") return res.status !== 404;
    } catch(e) { /* fall through and try the next method */ }
  }
  return false;
}

async function validate(raw, existing, groundedHosts){
  const problems = [];
  const seenIds = new Set(existing.map(e => e.id));
  const seenTitles = new Set(existing.map(e => e.t.toLowerCase()));
  const now = new Date().toISOString();
  const ok = [];

  for(const e of raw){
    const why = [];
    if(typeof e.t !== "string" || e.t.length < 15) why.push("title too short or missing");
    if(!Number.isFinite(e.y) || e.y < 1900 || e.y > new Date().getFullYear() + 1) why.push("bad year");
    if(!VALID_REGIONS.includes(e.r)) why.push("bad region");
    if(!Array.isArray(e.c) || !e.c.length || e.c.some(c => !VALID_CATS.includes(c))) why.push("bad categories");
    if(typeof e.s !== "string" || e.s.length < 80) why.push("summary too short");
    if(typeof e.u !== "string" || e.u.length < 30) why.push("use line too short");
    if(e.t && seenTitles.has(e.t.toLowerCase())) why.push("duplicate title");

    let host = null;
    if(typeof e.link !== "string" || !/^https:\/\/.+\..+/.test(e.link)){
      why.push("missing or malformed link");
    } else {
      try { host = new URL(e.link).hostname.replace(/^www\./, ""); }
      catch(err) { why.push("unparseable link"); }
      if(host && groundedHosts.size && !groundedHosts.has(host)){
        console.log(`  note: ${host} was not among the grounded sources`);
      }
    }

    if(!why.length && !(await linkResolves(e.link))){
      why.push("link does not resolve");
    }

    if(why.length){
      problems.push(`  rejected "${(e.t || "untitled").slice(0, 60)}": ${why.join("; ")}`);
      continue;
    }

    let id = slug(e.t);
    let n = 2;
    while(seenIds.has(id)) id = `${slug(e.t)}-${n++}`;
    seenIds.add(id);
    seenTitles.add(e.t.toLowerCase());

    ok.push({
      id, t: e.t.trim(), y: e.y, r: e.r, c: e.c.slice(0, 3),
      s: e.s.trim(), u: e.u.trim(),
      link: e.link, source: e.source || null,
      added: now
    });
  }

  return { ok, problems };
}

/* ---------- main ---------- */

const entries = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
const template = await fs.readFile(PROMPT_PATH, "utf8");
const prompt = buildPrompt(template, entries);

console.log(`Bank holds ${entries.length} entries. Asking ${MODEL} for up to ${COUNT} more.`);

const { text, groundedHosts } = await callGemini(prompt);
const raw = parseEntries(text);
console.log(`Model returned ${raw.length}. Validating…`);

const { ok, problems } = await validate(raw, entries, groundedHosts);

if(problems.length){
  console.log(`Rejected ${problems.length} of ${raw.length}:`);
  problems.forEach(p => console.log(p));
}

if(!ok.length){
  console.log("Nothing passed validation. Leaving the bank unchanged.");
  process.exit(0);
}

console.log(`Accepted ${ok.length}:`);
ok.forEach(e => console.log(`  [${e.r}] ${e.t}  →  ${e.source || e.link}`));

if(DRY_RUN){
  console.log("\nDRY_RUN set — not writing.");
  console.log(JSON.stringify(ok, null, 1));
  process.exit(0);
}

await fs.writeFile(DATA_PATH, JSON.stringify([...entries, ...ok], null, 1) + "\n");
console.log(`Written. Bank now holds ${entries.length + ok.length}.`);
