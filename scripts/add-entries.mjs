#!/usr/bin/env node
/**
 * Reads RSS feeds, fetches the article text, and asks Gemini to pick the items
 * worth adding to the example bank. Appends accepted entries to data/entries.json.
 *
 * Why RSS rather than the model's own search: Google Search grounding is not
 * included on the Gemini free tier, so a grounded request returns 429 from the
 * first call. Feeds cost nothing, and links come from the feed itself, so they
 * are real by construction rather than something the model might invent.
 *
 * Env:
 *   GEMINI_API_KEY   required - from Google AI Studio, no billing linked
 *   ENTRY_COUNT      how many to ask for (default 6)
 *   MODEL            model id (default gemini-3.5-flash)
 *   LOOKBACK_DAYS    how far back to consider items (default 4)
 *   MAX_ARTICLES     how many article pages to fetch text for (default 30)
 *   SKIP_LINK_CHECK  "1" to skip verifying source URLs resolve
 *   DRY_RUN          "1" to print without writing
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DATA_PATH = path.join(ROOT, "data", "entries.json");
const PROMPT_PATH = path.join(HERE, "prompt.md");
const FEEDS_PATH = path.join(HERE, "feeds.json");

const API_KEY = process.env.GEMINI_API_KEY;
const COUNT = Number(process.env.ENTRY_COUNT || 6);
const MODEL = (process.env.MODEL && process.env.MODEL.trim()) || "gemini-3.5-flash";
const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS || 4);
const MAX_ARTICLES = Number(process.env.MAX_ARTICLES || 30);
const DRY_RUN = process.env.DRY_RUN === "1";
const SKIP_LINK_CHECK = process.env.SKIP_LINK_CHECK === "1";

const VALID_CATS = ["sci","env","med","pol","glo","eco","soc","gen","edu","hea","art","eth","rel"];
const VALID_REGIONS = ["sg","asia","world"];
const UA = "Mozilla/5.0 (compatible; ExampleBankBot/1.0; +https://github.com)";

if(!API_KEY){
  console.error("GEMINI_API_KEY is not set. Get one free at https://aistudio.google.com/apikey");
  process.exit(1);
}

/* ---------------- feed reading ---------------- */

function unwrapCdata(s){
  return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function decodeEntities(s){
  return String(s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

/* CDATA must be unwrapped BEFORE tags are stripped, or a CDATA-wrapped title
   is read as one big tag and deleted outright. */
function stripTags(s){
  const unwrapped = unwrapCdata(s).replace(/<[^>]*>/g, " ");
  return decodeEntities(unwrapped).replace(/\s+/g, " ").trim();
}

function pick(block, tag){
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? stripTags(m[1]) : "";
}

/* Handles both RSS <item> and Atom <entry>. */
function parseFeed(xml){
  const out = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  for(const b of blocks){
    const title = pick(b, "title");
    let link = pick(b, "link");
    if(!link){
      const href = b.match(/<link[^>]*href=["']([^"']+)["']/i);   // Atom style
      if(href) link = href[1];
    }
    const date = pick(b, "pubDate") || pick(b, "published") || pick(b, "updated") || pick(b, "dc:date");
    const desc = pick(b, "description") || pick(b, "summary") || pick(b, "content");
    if(title && link) out.push({ title, link: link.trim(), date, desc: desc.slice(0, 400) });
  }
  return out;
}

async function fetchText(url, timeoutMs = 15000){
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "user-agent": UA } });
    if(!res.ok) throw new Error("HTTP " + res.status);
    return await res.text();
  } finally { clearTimeout(timer); }
}

async function readFeeds(feeds){
  const cutoff = Date.now() - LOOKBACK_DAYS * 86400000;
  const items = [];
  const results = await Promise.allSettled(feeds.map(f => fetchText(f.url)));

  results.forEach((r, i) => {
    const f = feeds[i];
    if(r.status !== "fulfilled"){
      console.log(`  feed failed: ${f.name} (${r.reason?.message || "error"})`);
      return;
    }
    const parsed = parseFeed(r.value);
    let kept = 0;
    for(const it of parsed){
      const t = it.date ? Date.parse(it.date) : NaN;
      if(Number.isFinite(t) && t < cutoff) continue;   // undated items are kept
      items.push({ ...it, source: f.name, region: f.region });
      kept++;
    }
    console.log(`  ${f.name}: ${parsed.length} items, ${kept} recent`);
  });

  // De-duplicate by URL and by near-identical headline.
  const seenUrl = new Set(), seenTitle = new Set(), unique = [];
  for(const it of items){
    const key = it.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
    if(seenUrl.has(it.link) || seenTitle.has(key)) continue;
    seenUrl.add(it.link); seenTitle.add(key);
    unique.push(it);
  }
  return unique;
}

/* Pull readable body text so the model writes from the article, not from memory. */
function extractArticleText(html){
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ");
  const paras = (body.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || [])
    .map(stripTags)
    .filter(p => p.length > 60);
  return paras.join(" ").slice(0, 1600);
}

async function enrich(items){
  const subset = items.slice(0, MAX_ARTICLES);
  let got = 0;
  await Promise.allSettled(subset.map(async it => {
    try {
      const html = await fetchText(it.link, 12000);
      const text = extractArticleText(html);
      if(text.length > 200){ it.text = text; got++; }
    } catch(e) { /* paywall, block or timeout - headline and summary still usable */ }
  }));
  console.log(`Fetched article text for ${got} of ${subset.length} attempted.`);
  return items;
}

/* ---------------- prompt ---------------- */

function buildPrompt(template, entries, items){
  const catCounts = Object.fromEntries(VALID_CATS.map(c => [c, entries.filter(e => e.c.includes(c)).length]));
  const thin = VALID_CATS.slice().sort((a, b) => catCounts[a] - catCounts[b]).slice(0, 4).join(", ");

  const words = {};
  entries.forEach(e => e.t.toLowerCase().split(/[^a-z]+/).forEach(w => {
    if(w.length > 4) words[w] = (words[w] || 0) + 1;
  }));
  const hot = Object.entries(words).filter(([, n]) => n >= 4)
    .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w]) => w).join(", ") || "none yet";

  const titles = entries.slice(-90).map(e => `- ${e.t} (${e.y})`).join("\n");

  const headlines = items.map((it, i) =>
    `### [${i + 1}] ${it.title}\n` +
    `SOURCE: ${it.source}\n` +
    `URL: ${it.link}\n` +
    (it.text ? `TEXT: ${it.text}\n` : it.desc ? `SUMMARY: ${it.desc}\n` : "")
  ).join("\n");

  return template
    .replaceAll("{{TODAY}}", new Date().toISOString().slice(0, 10))
    .replaceAll("{{COUNT}}", String(COUNT))
    .replaceAll("{{THIN_CATS}}", thin)
    .replaceAll("{{HOT_TOPICS}}", hot)
    .replaceAll("{{RECENT_TITLES}}", titles)
    .replaceAll("{{HEADLINES}}", headlines);
}

async function callGemini(prompt){
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": API_KEY },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 8000, responseMimeType: "application/json" }
    })
  });
  if(!res.ok) throw new Error(`Gemini returned ${res.status}: ${(await res.text()).slice(0, 600)}`);
  const data = await res.json();
  const cand = data.candidates?.[0];
  if(!cand) throw new Error("No candidate: " + JSON.stringify(data).slice(0, 400));
  if(cand.finishReason && cand.finishReason !== "STOP"){
    console.log(`  note: finishReason was ${cand.finishReason}`);
  }
  return (cand.content?.parts || []).map(p => p.text || "").join("").trim();
}

/* ---------------- validation ---------------- */

function parseEntries(text){
  const cleaned = text.replace(/^```(?:json)?/gm, "").replace(/```$/gm, "").trim();
  const start = cleaned.indexOf("["), end = cleaned.lastIndexOf("]");
  if(start === -1 || end === -1) throw new Error("No JSON array in response:\n" + cleaned.slice(0, 500));
  return JSON.parse(cleaned.slice(start, end + 1));
}

const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

async function linkResolves(url){
  if(SKIP_LINK_CHECK) return true;
  for(const method of ["HEAD", "GET"]){
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(url, { method, redirect: "follow", signal: ctrl.signal, headers: { "user-agent": UA } });
      clearTimeout(timer);
      if(res.status < 400) return true;
      if(res.status === 404 || res.status === 410) return false;
      if(method === "GET") return res.status !== 404;
    } catch(e) {}
  }
  return false;
}

async function validate(raw, existing, feedUrls){
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

    // A link must either be null (structural entry, no article) or exactly one
    // we supplied. Anything else is a URL the model composed itself.
    const noLink = e.link === null || e.link === undefined || e.link === "";
    if(!noLink){
      if(typeof e.link !== "string" || !/^https?:\/\/.+\..+/.test(e.link)){
        why.push("malformed link");
      } else if(!feedUrls.has(e.link)){
        why.push("link was not in the supplied list");
      } else if(!(await linkResolves(e.link))){
        why.push("link does not resolve");
      }
    }

    if(why.length){
      problems.push(`  rejected "${(e.t || "untitled").slice(0, 60)}": ${why.join("; ")}`);
      continue;
    }

    let id = slug(e.t), n = 2;
    while(seenIds.has(id)) id = `${slug(e.t)}-${n++}`;
    seenIds.add(id); seenTitles.add(e.t.toLowerCase());

    ok.push({ id, t: e.t.trim(), y: e.y, r: e.r, c: e.c.slice(0, 3),
              s: e.s.trim(), u: e.u.trim(),
              link: noLink ? null : e.link,
              source: noLink ? null : (e.source || null),
              added: now });
  }
  return { ok, problems };
}

/* ---------------- main ---------------- */

const entries = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
const template = await fs.readFile(PROMPT_PATH, "utf8");
const { feeds } = JSON.parse(await fs.readFile(FEEDS_PATH, "utf8"));

console.log(`Bank holds ${entries.length} entries. Reading ${feeds.length} feeds…`);
let items = await readFeeds(feeds);
console.log(`${items.length} unique recent items.`);

if(!items.length){
  console.log("No feed items. Check scripts/feeds.json — the URLs may have changed.");
  process.exit(0);
}

items = await enrich(items);

const feedUrls = new Set(items.map(i => i.link));
const prompt = buildPrompt(template, entries, items);
console.log(`Prompt is ~${Math.round(prompt.length / 4000)}k tokens. Asking ${MODEL} for up to ${COUNT}.`);

const text = await callGemini(prompt);
const raw = parseEntries(text);
console.log(`Model returned ${raw.length}. Validating…`);

const { ok, problems } = await validate(raw, entries, feedUrls);

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
