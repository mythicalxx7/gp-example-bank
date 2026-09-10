/* ===================================================================
   Shared config, data loading and entry rendering.

   The homepage window is 48 hours. To test without waiting, append a
   ?w= override to the URL — it only affects your own browser:

     index.html?w=5m     five minutes
     index.html?w=2h     two hours
     index.html?w=7d     seven days

   Note: a window shorter than about 3 minutes is not testable on the
   deployed site, because entries are timestamped when the job runs and
   Netlify takes a minute or two to publish the commit. They would have
   expired before the page went live.
   =================================================================== */

const WINDOW_UNITS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function windowOverride(){
  try {
    const raw = new URLSearchParams(location.search).get("w");
    const m = raw && raw.trim().match(/^(\d+(?:\.\d+)?)([smhd])$/i);
    if(!m) return null;
    return Number(m[1]) * WINDOW_UNITS[m[2].toLowerCase()];
  } catch(e) { return null; }
}

const CONFIG = {
  HOME_WINDOW_MS: windowOverride() || 48 * 60 * 60 * 1000,
  FACT_ROTATE_MS: 24 * 60 * 60 * 1000,
  FALLBACK_COUNT: 5,          // shown when nothing is inside the window
  DATA_URL: "data/entries.json"
};

const CATS = {
  sci:"Science & Technology",
  env:"Environment & Climate",
  med:"Media & Information",
  pol:"Politics & Governance",
  glo:"Global Affairs & Conflict",
  eco:"Economy, Work & Inequality",
  soc:"Society, Family & Identity",
  gen:"Gender & Equality",
  edu:"Education",
  hea:"Health & Medicine",
  art:"Arts, Culture & Sport",
  eth:"Ethics, Law & Justice",
  rel:"Religion & Belief"
};
const REGIONS = { sg:"Singapore", asia:"Asia", world:"Rest of world" };

/* ---------- saved examples ---------- */
const SAVE_KEY = "gp-example-bank-saved";
let saved = new Set();
try { saved = new Set(JSON.parse(localStorage.getItem(SAVE_KEY) || "[]")); } catch (e) {}

function toggleSaved(id){
  saved.has(id) ? saved.delete(id) : saved.add(id);
  try { localStorage.setItem(SAVE_KEY, JSON.stringify([...saved])); } catch (e) {}
  return saved.has(id);
}

/* ---------- data ---------- */
async function loadEntries(){
  const res = await fetch(CONFIG.DATA_URL, { cache: "no-store" });
  if(!res.ok) throw new Error("Could not load entries (" + res.status + ")");
  const data = await res.json();
  if(!Array.isArray(data)) throw new Error("Entries file is not a list");
  return data;
}

/* Entries added within the homepage window. */
function isFresh(entry, now = Date.now()){
  if(!entry.added) return false;
  const t = Date.parse(entry.added);
  return Number.isFinite(t) && (now - t) >= 0 && (now - t) < CONFIG.HOME_WINDOW_MS;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, ch =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
}

/* Only render links we trust the shape of. */
function safeUrl(url){
  if(!url) return null;
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") ? u.href : null;
  } catch (e) { return null; }
}

function matchesFilters(d, state){
  if(state.savedOnly && !saved.has(d.id)) return false;
  if(state.region !== "all" && d.r !== state.region) return false;
  if(state.cats.size && !d.c.some(c => state.cats.has(c))) return false;
  if(state.q){
    const hay = [d.t, d.s, d.u, d.source || "", d.c.map(c => CATS[c]).join(" "), REGIONS[d.r]]
      .join(" ").toLowerCase();
    if(!state.q.split(/\s+/).every(w => hay.includes(w))) return false;
  }
  return true;
}

function entryHtml(d){
  const url = safeUrl(d.link);
  const metaBits = [`<b>${escapeHtml(d.y)}</b>`, escapeHtml(REGIONS[d.r] || "")];
  if(d.source) metaBits.push(escapeHtml(d.source));
  return `
    <article class="entry">
      <button class="save" data-save="${escapeHtml(d.id)}" aria-pressed="${saved.has(d.id)}"
              aria-label="Save this example" title="Save">
        <svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-5-6 5z"/></svg>
      </button>
      <h2>${escapeHtml(d.t)}</h2>
      <p class="meta">${metaBits.join(" · ")}</p>
      <p class="summary">${escapeHtml(d.s)}</p>
      <p class="use"><span>${escapeHtml(d.u)}</span></p>
      <div class="tags">
        ${d.c.map(c => `<button class="tag" data-tag="${c}">${escapeHtml(CATS[c] || c)}</button>`).join("")}
        ${url ? `<a class="readmore" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Read the full article</a>` : ""}
      </div>
    </article>`;
}

/* Wire up the save + tag buttons inside a rendered list. */
function bindEntryEvents(listEl, { onTag, onSaveChange } = {}){
  listEl.querySelectorAll("[data-save]").forEach(btn => {
    btn.addEventListener("click", () => {
      const on = toggleSaved(btn.dataset.save);
      btn.setAttribute("aria-pressed", on);
      if(onSaveChange) onSaveChange();
    });
  });
  if(onTag){
    listEl.querySelectorAll("[data-tag]").forEach(btn => {
      btn.addEventListener("click", () => onTag(btn.dataset.tag));
    });
  }
}
