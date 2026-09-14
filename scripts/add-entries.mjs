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
const COUNT = Number(process.env.ENTRY_COUNT || 10);
const MODEL = (process.env.MODEL && process.env.MODEL.trim()) || "gemini-3.5-flash";
const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS || 4);
const MAX_ARTICLES = Number(process.env.MAX_ARTICLES || 70);
const DRY_RUN = process.env.DRY_RUN === "1";
const SKIP_LINK_CHECK = process.env.SKIP_LINK_CHECK === "1";
/* Gemini 3.x uses thinkingLevel ("minimal" | "low" | "medium" | "high").
   Gemini 2.5 uses a numeric thinkingBudget. Sending both returns a 400.
   Thinking cannot be switched off entirely on Gemini 3 Flash; "minimal" is
   the floor. Left unset, 3.5 Flash defaults to "medium", which spends most of
   maxOutputTokens reasoning and truncates the JSON. */
const THINKING_LEVEL  = process.env.THINKING_LEVEL || "minimal";
const THINKING_BUDGET = Number(process.env.THINKING_BUDGET ?? 0);
const IS_GEMINI_3 = /^gemini-3/i.test(MODEL);

/* The output cap applies per response, so the fix for truncation is more
   requests, not a bigger cap. Asking for PER_BATCH entries at a time keeps
   every response small. Batches run sequentially on the same key. */
const PER_BATCH = Number(process.env.PER_BATCH || 5);

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

function buildPrompt(template, entries, items, alreadyThisRun = [], countForBatch = COUNT){
  const catCounts = Object.fromEntries(VALID_CATS.map(c => [c, entries.filter(e => e.c.includes(c)).length]));
  const thin = VALID_CATS.slice().sort((a, b) => catCounts[a] - catCounts[b]).slice(0, 4).join(", ");

  const words = {};
  entries.forEach(e => e.t.toLowerCase().split(/[^a-z]+/).forEach(w => {
    if(w.length > 4) words[w] = (words[w] || 0) + 1;
  }));
  const hot = Object.entries(words).filter(([, n]) => n >= 4)
    .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w]) => w).join(", ") || "none yet";

  const DEDUPE_WINDOW = Math.max(120, COUNT * 14);   // ~2 weeks of history
  const titles = entries.slice(-DEDUPE_WINDOW).map(e => `- ${e.t} (${e.y})`)
    .concat(alreadyThisRun.map(t => `- ${t} (just added)`))
    .join("\n");

  const headlines = items.map((it, i) =>
    `### [${i + 1}] ${it.title}\n` +
    `SOURCE: ${it.source}\n` +
    `URL: ${it.link}\n` +
    (it.text ? `TEXT: ${it.text}\n` : it.desc ? `SUMMARY: ${it.desc}\n` : "")
  ).join("\n");

  return template
    .replaceAll("{{TODAY}}", new Date().toISOString().slice(0, 10))
    .replaceAll("{{COUNT}}", String(countForBatch))
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
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 32000,
        responseMimeType: "application/json",
        // Thinking tokens are charged against maxOutputTokens, so the level
        // has to be pinned low or the JSON comes back truncated mid-object.
        thinkingConfig: IS_GEMINI_3
          ? { thinkingLevel: THINKING_LEVEL }
          : { thinkingBudget: THINKING_BUDGET }
      }
    })
  });
  if(!res.ok) throw new Error(`Gemini returned ${res.status}: ${(await res.text()).slice(0, 600)}`);
  const data = await res.json();
  const cand = data.candidates?.[0];
  if(!cand) throw new Error("No candidate: " + JSON.stringify(data).slice(0, 400));
  if(cand.finishReason === "MAX_TOKENS"){
    console.log("  WARNING: response hit the output limit and was truncated.");
    console.log("  Complete entries will be salvaged; the last one is discarded.");
    console.log("  If this recurs, lower ENTRY_COUNT or raise maxOutputTokens.");
  } else if(cand.finishReason && cand.finishReason !== "STOP"){
    console.log(`  note: finishReason was ${cand.finishReason}`);
  }
  const u = data.usageMetadata;
  if(u){
    console.log(`  Tokens — prompt ${u.promptTokenCount ?? "?"}, `
      + `thinking ${u.thoughtsTokenCount ?? 0}, `
      + `answer ${u.candidatesTokenCount ?? "?"} (cap ${32000}).`);
  }
  return (cand.content?.parts || []).map(p => p.text || "").join("").trim();
}

/* ---------------- validation ---------------- */

/* Scans for balanced top-level {...} blocks and parses each on its own, so a
   response cut off mid-object still yields every complete entry before it. */
function salvageObjects(text){
  const out = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for(let i = 0; i < text.length; i++){
    const ch = text[i];
    if(inStr){
      if(esc) esc = false;
      else if(ch === "\\") esc = true;
      else if(ch === '"') inStr = false;
      continue;
    }
    if(ch === '"'){ inStr = true; continue; }
    if(ch === "{"){ if(depth === 0) start = i; depth++; continue; }
    if(ch === "}"){
      depth--;
      if(depth === 0 && start !== -1){
        try { out.push(JSON.parse(text.slice(start, i + 1))); } catch(e) {}
        start = -1;
      }
    }
  }
  return out;
}

function parseEntries(text){
  const cleaned = text.replace(/^```(?:json)?/gm, "").replace(/```$/gm, "").trim();
  const start = cleaned.indexOf("[");
  if(start === -1) throw new Error("No JSON array in response:\n" + cleaned.slice(0, 500));

  const end = cleaned.lastIndexOf("]");
  if(end > start){
    try { return JSON.parse(cleaned.slice(start, end + 1)); }
    catch(e) { /* malformed despite closing bracket - fall through to salvage */ }
  }

  const salvaged = salvageObjects(cleaned.slice(start));
  if(!salvaged.length){
    throw new Error("Response could not be parsed and nothing could be salvaged:\n"
      + cleaned.slice(0, 500));
  }
  console.log(`  Salvaged ${salvaged.length} complete entries from a truncated response.`);
  return salvaged;
}

const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

const STOPWORDS = new Set(["the","a","an","and","or","but","of","to","in","on","for","with",
  "as","by","at","from","after","over","its","it","is","are","be","been","new","first","up",
  "down","out","into","than","that","this","these","those","has","have","will","would","says"]);

/* Light stemming: plurals and common verb endings otherwise defeat matching,
   e.g. "schools ban phones" vs "school bans smartphones". */
function stem(w){
  return w.replace(/(ies)$/, "y").replace(/(sses|shes|ches|xes)$/, "$1".slice(0, -2))
          .replace(/([^s])s$/, "$1").replace(/(ing|ed)$/, "");
}
function keyWords(title){
  return new Set(title.toLowerCase().split(/[^a-z0-9]+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w))
    .map(stem)
    .filter(w => w.length > 2));
}

/* Jaccard overlap of significant words. The same event reported by two outlets
   shares most of its nouns even when the headlines differ. */
function similarity(a, b){
  const A = keyWords(a), B = keyWords(b);
  if(!A.size || !B.size) return 0;
  let shared = 0;
  for(const w of A) if(B.has(w)) shared++;
  return shared / (A.size + B.size - shared);
}

const NEAR_DUP_THRESHOLD = Number(process.env.NEAR_DUP_THRESHOLD || 0.38);

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

    if(e.t && !why.length){
      // Compare against recent entries and anything already accepted this run.
      const recent = existing.slice(-400).map(x => x.t).concat(ok.map(x => x.t));
      let worst = null, worstScore = 0;
      for(const t of recent){
        const sc = similarity(e.t, t);
        if(sc > worstScore){ worstScore = sc; worst = t; }
      }
      if(worstScore >= NEAR_DUP_THRESHOLD){
        why.push(`near-duplicate of "${worst.slice(0, 50)}" (${worstScore.toFixed(2)})`);
      }
    }

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
const batchCount = Math.max(1, Math.ceil(COUNT / PER_BATCH));

/* Deal the articles round-robin so each batch sees a spread of sources
   rather than one batch getting all the Straits Times items. */
const batches = Array.from({ length: batchCount }, () => []);
items.forEach((it, i) => batches[i % batchCount].push(it));

console.log(`Thinking: ${IS_GEMINI_3 ? "level=" + THINKING_LEVEL : "budget=" + THINKING_BUDGET}`);
console.log(`Splitting into ${batchCount} requests of up to ${PER_BATCH} entries each.`);

const raw = [];
const already = [];   // titles accepted so far, to stop batches repeating each other

for(let b = 0; b < batchCount; b++){
  const prompt = buildPrompt(template, entries, batches[b], already, PER_BATCH);
  console.log(`\nBatch ${b + 1}/${batchCount}: ${batches[b].length} articles, `
    + `~${Math.round(prompt.length / 4000)}k tokens.`);
  try {
    const text = await callGemini(prompt);
    const got = parseEntries(text);
    console.log(`  returned ${got.length}`);
    got.forEach(g => { if(g && g.t) already.push(g.t); });
    raw.push(...got);
  } catch(err){
    console.log(`  batch failed: ${err.message.slice(0, 200)}`);
  }
  if(b < batchCount - 1) await new Promise(r => setTimeout(r, 2000));
}

if(!raw.length){
  console.log("\nNo batch produced anything. Leaving the bank unchanged.");
  process.exit(0);
}

console.log(`\nModel returned ${raw.length} across all batches. Validating…`);
const { ok, problems } = await validate(raw, entries, feedUrls);

if(problems.length){
  console.log(`Rejected ${problems.length} of ${raw.length}:`);
  problems.forEach(p => console.log(p));
}
if(!ok.length){
  console.log("Nothing passed validation. Leaving the bank unchanged.");
  process.exit(0);
}

const unlinked = ok.filter(e => !e.link).length;
const sgShare = ok.filter(e => e.r === "sg").length;
console.log(`Accepted ${ok.length}: ${sgShare} Singapore, ${unlinked} without a source link.`);
if(unlinked > ok.length / 3){
  console.log("  WARNING: more than a third have no source link. These are unverified\n  structural entries written from the model's own knowledge — check them, and\n  consider lowering ENTRY_COUNT if this persists.");
}
ok.forEach(e => console.log(`  [${e.r}] ${e.t}  →  ${e.source || "NO SOURCE"}`));

if(DRY_RUN){
  console.log("\nDRY_RUN set — not writing.");
  console.log(JSON.stringify(ok, null, 1));
  process.exit(0);
}

await fs.writeFile(DATA_PATH, JSON.stringify([...entries, ...ok], null, 1) + "\n");
console.log(`Written. Bank now holds ${entries.length + ok.length}.`);
