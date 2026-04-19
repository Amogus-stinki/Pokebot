"use strict";

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// ── State ─────────────────────────────────────────────────────────────────────
let currentPriceNum = null;
let budgetLimit     = null;
let isProductPage   = false;
let isDark          = false;
let countdownTimer  = null;
let flowStarted     = false;

// ── Theme ─────────────────────────────────────────────────────────────────────
function applyTheme(dark) {
  isDark = dark;
  document.body.classList.toggle("dark", dark);
  $("theme-toggle").textContent = dark ? "☀️ Light" : "🌙 Dark";
  chrome.storage.local.set({ darkMode: dark });
}
$("theme-toggle").addEventListener("click", () => applyTheme(!isDark));

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    $("panel-" + tab.dataset.tab).classList.add("active");
  });
});

// ── Toggle helpers ────────────────────────────────────────────────────────────
function setupToggle(id, key) {
  $(id).addEventListener("click", () => {
    $(id).classList.toggle("on");
    chrome.storage.local.set({ [key]: $(id).classList.contains("on") });
  });
}
setupToggle("tog-dismiss",    "dismissPopup");
setupToggle("tog-cart",       "goToCart");
setupToggle("tog-checkout",   "doCheckout");
setupToggle("tog-placeorder", "doPlaceOrder");

// ── Budget guard ──────────────────────────────────────────────────────────────
function checkBudget() {
  const badge    = $("budget-badge");
  const blockMsg = $("budget-block-msg");
  const btn      = $("cta-btn");
  if (budgetLimit === null || currentPriceNum === null) {
    badge.className        = "budget-badge";
    blockMsg.style.display = "none";
    if (isProductPage) btn.disabled = false;
    return;
  }
  if (currentPriceNum > budgetLimit) {
    badge.className        = "budget-badge over";
    badge.textContent      = "Over budget";
    blockMsg.style.display = "block";
    blockMsg.textContent   = `$${currentPriceNum.toFixed(2)} exceeds your $${budgetLimit.toFixed(2)} limit`;
    btn.disabled = true;
  } else {
    badge.className        = "budget-badge ok";
    badge.textContent      = `Within $${budgetLimit.toFixed(2)}`;
    blockMsg.style.display = "none";
    btn.disabled = false;
  }
}

function renderBudgetStatus() {
  const el = $("budget-status");
  if (budgetLimit === null) { el.className = "status-box"; return; }
  if (currentPriceNum !== null) {
    el.className   = currentPriceNum > budgetLimit ? "status-box warn" : "status-box ok";
    el.textContent = currentPriceNum > budgetLimit
      ? `Current item ($${currentPriceNum.toFixed(2)}) exceeds $${budgetLimit.toFixed(2)} budget`
      : `Budget $${budgetLimit.toFixed(2)} — item is within budget`;
  } else {
    el.className   = "status-box info";
    el.textContent = `Budget set to $${budgetLimit.toFixed(2)}`;
  }
}

$("budget-save").addEventListener("click", () => {
  const val = parseFloat($("budget-input").value);
  if (isNaN(val) || val <= 0) {
    $("budget-status").className   = "status-box warn";
    $("budget-status").textContent = "Enter a valid positive amount.";
    return;
  }
  budgetLimit = val;
  chrome.storage.local.set({ budgetLimit: val });
  renderBudgetStatus();
  checkBudget();
});

$("budget-clear").addEventListener("click", () => {
  budgetLimit = null;
  $("budget-input").value = "";
  chrome.storage.local.remove("budgetLimit");
  $("budget-status").className = "status-box";
  checkBudget();
});

// ── Steps ─────────────────────────────────────────────────────────────────────
const LABELS = {
  1: { pending:"Add to cart",    active:"Adding to cart…",          done:"Added to cart ✓",     error:"Button not found",   skipped:"Skipped" },
  2: { pending:"Close popup",    active:"Closing popup…",           done:"Popup closed ✓",       error:"Error",              skipped:"No popup" },
  3: { pending:"Go to checkout", active:"Heading to checkout…",     done:"Navigating…",          error:"Nav failed",         skipped:"Over budget — stopped" },
  4: { pending:"Save & continue",active:"Clicking Save & Continue…",done:"Shipping confirmed ✓", error:"Step failed",        skipped:"Skipped" },
  5: { pending:"Place order",    active:"Placing order…",           done:"Order placed! 🎉",     error:"Button not found",   skipped:"Skipped" },
};
const ICONS = { pending: n => n, active: n => n, done: () => "✓", skipped: () => "–", error: () => "!" };

function setStep(n, status, msg) {
  const icon = $(`s${n}-icon`), text = $(`s${n}-text`);
  if (!icon || !text) return;
  icon.className   = "step-icon " + status;
  icon.textContent = ICONS[status](n);
  text.className   = "step-text " + status;
  text.textContent = msg || LABELS[n][status] || "";
}
function resetSteps() { [1,2,3,4,5].forEach(n => setStep(n, "pending")); }

// ── Progress listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "PROGRESS") return;
  setStep(msg.step, msg.status, msg.message);
  const btn = $("cta-btn");

  if (msg.step === 3 && msg.status === "done") {
    flowStarted = true;
    btn.disabled = false;
    btn.textContent = "⚡ CATCH IT";
    return;
  }
  if (msg.step === 3 && msg.status === "skipped") {
    btn.disabled = false;
    btn.textContent = "⚡ CATCH IT";
    return;
  }
  if (msg.step === 5) {
    btn.disabled = false;
    btn.textContent = msg.status === "done" ? "✓ CAUGHT!" : "⚡ CATCH IT";
    setTimeout(() => {
      btn.textContent = "⚡ CATCH IT";
      checkBudget();
      resetSteps();
      flowStarted = false;
    }, 3000);
  }
});

// ── CTA click ─────────────────────────────────────────────────────────────────
$("cta-btn").addEventListener("click", async () => {
  const btn = $("cta-btn");
  btn.disabled = true;
  btn.textContent = "WORKING…";
  flowStarted = false;
  resetSteps();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) { btn.disabled = false; btn.textContent = "⚡ CATCH IT"; return; }

  try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }); } catch {}

  chrome.tabs.sendMessage(tab.id, {
    type: "QUICK_ADD",
    options: {
      dismissPopup: $("tog-dismiss").classList.contains("on"),
      goToCart:     $("tog-cart").classList.contains("on"),
      doCheckout:   $("tog-checkout").classList.contains("on"),
      doPlaceOrder: $("tog-placeorder").classList.contains("on"),
      budgetLimit,
      priceNum: currentPriceNum,
    },
  }, (resp) => {
    if (chrome.runtime.lastError) {
      // Navigation caused connection drop — expected if flowStarted
      if (!flowStarted) {
        btn.disabled = false;
        btn.textContent = "⚡ CATCH IT";
        setStep(1, "error", "Could not connect — refresh and try again");
      }
      return;
    }
    if (resp && !resp.ok) {
      btn.disabled = false;
      btn.textContent = "⚡ CATCH IT";
      setStep(1, "error", resp.error || "Something went wrong");
    }
  });
});

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const prefs = await chrome.storage.local.get([
    "darkMode","dismissPopup","goToCart","doCheckout","doPlaceOrder",
    "budgetLimit","scheduleActive","scheduleFired","scheduleTs",
  ]);

  applyTheme(prefs.darkMode === true);
  if (prefs.dismissPopup === false) $("tog-dismiss").classList.remove("on");
  if (prefs.goToCart     === false) $("tog-cart").classList.remove("on");
  if (prefs.doCheckout   === true)  $("tog-checkout").classList.add("on");
  if (prefs.doPlaceOrder === true)  $("tog-placeorder").classList.add("on");
  if (prefs.budgetLimit  != null) {
    budgetLimit = prefs.budgetLimit;
    $("budget-input").value = budgetLimit.toFixed(2);
  }

  const soon = new Date(Date.now() + 3600000);
  $("sched-date").value = soon.toISOString().slice(0, 10);
  $("sched-time").value = soon.toTimeString().slice(0, 5);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const SUPPORTED = ["target.com", "walmart.com", "bestbuy.com"];
  if (!tab?.url || !SUPPORTED.some(s => tab.url.includes(s))) {
    $("header-sub").textContent   = "Not on a supported site";
    $("no-product").style.display = "block";
    renderBudgetStatus();
    initScheduleUI(prefs, tab);
    return;
  }

  // Use content.js SCRAPE_FULL for product info — avoids duplicating selectors
  let scrapeResult;
  try {
    try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }); } catch {}
    await new Promise(r => setTimeout(r, 200));
    scrapeResult = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), 5000);
      chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_FULL" }, (resp) => {
        clearTimeout(t);
        if (chrome.runtime.lastError || !resp) reject(new Error("no resp"));
        else resolve(resp);
      });
    });
  } catch {
    // Fallback inline scrape for non-TCG pages / before content script loads
    try {
      const [inj] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const h = window.location.hostname;
          const isTgt = h.includes("target.com"), isWmt = h.includes("walmart.com");
          const titleEl = isTgt ? document.querySelector('[data-test="product-title"]')
                        : isWmt ? document.querySelector('h1[itemprop="name"]')
                        : document.querySelector('.sku-title h1');
          const priceEl = isTgt ? document.querySelector('[data-test="product-price"]')
                        : isWmt ? document.querySelector('[data-seo-id="hero-price"],[itemprop="price"]')
                        : document.querySelector('.priceView-customer-price span[aria-hidden="false"]');
          const addBtn  = document.querySelector('[data-test="shippingButton"],[data-test="addToCartButton"],button.add-to-cart-button,button[data-dca-name="ItemBuyBoxAddToCartButton"]')
                       || Array.from(document.querySelectorAll("button")).find(b => /^add to cart$/i.test(b.textContent.trim()) && !b.disabled);
          const priceStr = priceEl?.textContent.trim() || "";
          const m = priceStr.replace(/[^0-9.]/g,"").match(/\d+\.?\d*/);
          return { isProductPage:!!addBtn, isTcg:false, title:titleEl?.textContent.trim()||null, price:priceStr, priceNum:m?parseFloat(m[0]):null };
        },
      });
      scrapeResult = inj?.result;
    } catch {}
  }

  if (!scrapeResult?.isProductPage) {
    $("header-sub").textContent   = "No product found";
    $("no-product").style.display = "block";
    renderBudgetStatus();
    initScheduleUI(prefs, tab);
    return;
  }

  isProductPage   = true;
  currentPriceNum = scrapeResult.priceNum;
  $("header-sub").textContent    = "Product ready";
  $("product-title").textContent = scrapeResult.title || "Unknown product";
  if (scrapeResult.price) $("product-price").textContent = scrapeResult.price;
  $("main-content").style.display = "block";
  checkBudget();
  renderBudgetStatus();
  initScheduleUI(prefs, tab);
  // Restore multi-sniper state for the schedule panel URL hint
  if (tab?.url) {
    const su = document.getElementById("sched-url-current");
    if (su) su.textContent = "URL: " + tab.url.slice(0, 55) + (tab.url.length > 55 ? "…" : "");
  }
  // Restore schedule list
  renderSchedules();
}

// ── Multi-Schedule ────────────────────────────────────────────────────────────
let currentTab = null; // set during init()
let schedCountdownTimers = {}; // keyed by schedId
let schedUIInit = false;

function initScheduleUI(prefs, tab) {
  currentTab = tab;
  if (schedUIInit) return;
  schedUIInit = true;
  $("sched-arm").addEventListener("click", addSchedule);
  // Populate current page URL hint
  if (tab?.url) $("sched-url-current").textContent = "URL: " + tab.url.slice(0, 55) + (tab.url.length > 55 ? "…" : "");
  renderSchedules();
}

function parseScheduledTs() {
  const dateStr = $("sched-date").value, timeStr = $("sched-time").value, tz = $("sched-tz").value;
  if (!dateStr || !timeStr) return null;
  if (tz === "local") { const ts = new Date(`${dateStr}T${timeStr}`).getTime(); return isNaN(ts) ? null : ts; }
  const naive = new Date(`${dateStr}T${timeStr}:00`);
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false });
  const parts = fmt.formatToParts(naive);
  const get = t => parts.find(p => p.type === t)?.value ?? "00";
  const localStr = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
  const offset = naive.getTime() - new Date(localStr).getTime();
  const ts = naive.getTime() - offset;
  return isNaN(ts) ? null : ts;
}

async function addSchedule() {
  const ts = parseScheduledTs();
  if (!ts)              { alert("Please enter a valid date and time."); return; }
  if (ts <= Date.now()) { alert("Scheduled time must be in the future."); return; }

  const urlInput   = $("sched-url-input").value.trim();
  const labelInput = $("sched-label-input").value.trim();
  const url        = urlInput || currentTab?.url || "";
  if (!url) { alert("Please provide a URL or navigate to a product page."); return; }

  const schedId = "s" + Date.now();
  const alarmName = "pokebot-sched-" + schedId;

  const sched = {
    id:           schedId,
    label:        labelInput || url.split("/").slice(-1)[0].slice(0, 40) || "Schedule",
    url,
    ts,
    active:       true,
    fired:        false,
    tabId:        currentTab?.id ?? null,
    dismissPopup: $("tog-dismiss").classList.contains("on"),
    goToCart:     $("tog-cart").classList.contains("on"),
    doCheckout:   $("tog-checkout").classList.contains("on"),
    doPlaceOrder: $("tog-placeorder").classList.contains("on"),
    budgetLimit:  budgetLimit,
    priceNum:     currentPriceNum,
  };

  const data = await chrome.storage.local.get("schedules");
  const schedules = data.schedules || {};
  schedules[schedId] = sched;
  await chrome.storage.local.set({ schedules });

  await chrome.alarms.clear(alarmName);
  chrome.alarms.create(alarmName, { when: ts });

  // Clear form
  $("sched-label-input").value = "";
  $("sched-url-input").value   = "";

  renderSchedules();
}

async function cancelSchedule(schedId) {
  const alarmName = "pokebot-sched-" + schedId;
  await chrome.alarms.clear(alarmName);
  const data = await chrome.storage.local.get("schedules");
  const schedules = data.schedules || {};
  if (schedules[schedId]) {
    schedules[schedId] = { ...schedules[schedId], active: false };
    await chrome.storage.local.set({ schedules });
  }
  if (schedCountdownTimers[schedId]) { clearInterval(schedCountdownTimers[schedId]); delete schedCountdownTimers[schedId]; }
  renderSchedules();
}

async function removeSchedule(schedId) {
  await cancelSchedule(schedId);
  const data = await chrome.storage.local.get("schedules");
  const schedules = data.schedules || {};
  delete schedules[schedId];
  await chrome.storage.local.set({ schedules });
  renderSchedules();
}

function fmtCountdown(ts) {
  const d = ts - Date.now();
  if (d <= 0) return "Firing now…";
  const h = Math.floor(d/3600000), m = Math.floor((d%3600000)/60000), s = Math.floor((d%60000)/1000);
  return `Fires in ${h>0?h+"h ":""}${m}m ${s}s`;
}

function fmtTs(ts) {
  return new Date(ts).toLocaleString(undefined, { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" });
}

async function renderSchedules() {
  const data = await chrome.storage.local.get("schedules");
  const schedules = data.schedules || {};
  const list = $("sched-list");
  if (!list) return;
  list.innerHTML = "";

  const ids = Object.keys(schedules).sort((a,b) => (schedules[a].ts||0) - (schedules[b].ts||0));
  if (!ids.length) {
    list.innerHTML = '<p style="font-size:11px;color:var(--text3);margin-bottom:8px;">No schedules yet. Add one below.</p>';
    return;
  }

  ids.forEach(id => {
    const s = schedules[id];
    const div = document.createElement("div");
    div.className = "sched-item";

    const state = s.fired ? "fired" : s.active ? "armed" : "idle";
    const badge = { fired:"✓ Fired", armed:"⚡ Armed", idle:"Idle" }[state];

    div.innerHTML = `
      <div class="sched-item-header">
        <span class="sched-item-label">${s.label || "Schedule"}</span>
        <span class="sched-item-badge ${state}">${badge}</span>
      </div>
      <div class="sched-item-time">${fmtTs(s.ts)} · ${(s.url||"").slice(0,45)}${(s.url||"").length>45?"…":""}</div>
      ${s.active ? `<div class="sched-item-countdown" id="scd-${id}">${fmtCountdown(s.ts)}</div>` : ""}
      <div class="sched-item-actions">
        ${s.active ? `<button class="sched-cancel-btn" data-id="${id}">Cancel</button>` : ""}
        <button class="sched-remove-btn" data-id="${id}">Remove</button>
      </div>`;

    list.appendChild(div);

    // Countdown ticker
    if (s.active) {
      if (schedCountdownTimers[id]) clearInterval(schedCountdownTimers[id]);
      schedCountdownTimers[id] = setInterval(() => {
        const el = document.getElementById("scd-" + id);
        if (el) el.textContent = fmtCountdown(s.ts);
        if (Date.now() >= s.ts) { clearInterval(schedCountdownTimers[id]); delete schedCountdownTimers[id]; renderSchedules(); }
      }, 1000);
    }
  });

  // Wire buttons
  list.querySelectorAll(".sched-cancel-btn").forEach(btn => btn.addEventListener("click", () => cancelSchedule(btn.dataset.id)));
  list.querySelectorAll(".sched-remove-btn").forEach(btn => btn.addEventListener("click", () => removeSchedule(btn.dataset.id)));
}

// Listen for background schedule fires
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "SCHEDULE_FIRED") renderSchedules();
});

init();

// ══════════════════════════════════════════════════════════════════════════════
// ── Pokémon Tab — Deal finder, sniper, price history, panic stop ───────────────
// ══════════════════════════════════════════════════════════════════════════════

const MSRP_MAP = [
  { keys:["booster display box","booster box","36 pack","36-pack"], msrp:161.64, label:"Booster Box (36 packs)" },
  { keys:["ultra premium collection","ultra-premium collection"],    msrp:119.99, label:"Ultra Premium Collection" },
  { keys:["pokemon center elite trainer","pokémon center elite trainer"], msrp:59.99, label:"Pokémon Center ETB" },
  { keys:["elite trainer box","etb"],                                msrp:59.99,  label:"Elite Trainer Box" },
  { keys:["special collection","premium collection","collection box"],msrp:39.99,  label:"Special Collection" },
  { keys:["booster bundle"],                                         msrp:26.94,  label:"Booster Bundle (6 packs)" },
  { keys:["collection tin","collector tin"],                         msrp:26.94,  label:"Collector's Tin" },
  { keys:["blister","3-pack blister","3 pack blister"],             msrp:13.99,  label:"3-Pack Blister" },
  { keys:["build & battle","build and battle"],                      msrp:21.99,  label:"Build & Battle Box" },
  { keys:["battle deck","theme deck","ex battle deck"],              msrp:14.99,  label:"Battle Deck" },
  { keys:["mini tin"],                                               msrp:9.99,   label:"Mini Tin (2 packs)" },
  { keys:["tin"],                                                    msrp:26.94,  label:"Tin" },
  { keys:["booster pack"],                                           msrp:4.49,   label:"Booster Pack" },
];

const TCG_KW_POPUP = [
  "pokémon","pokemon","pikachu","charizard","booster box","booster pack",
  "elite trainer box","etb","ultra premium collection","upc","special collection",
  "tin","blister","theme deck","build & battle","tcg","trading card",
  "scarlet","violet","obsidian flames","paradox rift","paldea","151",
  "crown zenith","silver tempest","lost origin","astral radiance",
  "fusion strike","evolving skies","chilling reign","battle styles",
  "shining fates","vivid voltage","darkness ablaze","rebel clash","sword & shield",
  "pokemon center","pokémon center","destined rivals","journey together",
  "mega evolution","prismatic evolutions","surging sparks","stellar crown",
];

function lookupMsrp(text) {
  const lower = (text || "").toLowerCase();
  return MSRP_MAP.find(e => e.keys.some(k => lower.includes(k))) || null;
}

// FIX: rateDeal now takes a numeric price, not a string
function rateDeal(priceNum, msrp) {
  if (priceNum == null || !msrp) return { label:"Unknown", tier:"unknown", detail:"No MSRP reference found" };
  const ratio = priceNum / msrp;
  if (ratio <= 0.95) return { label:"Great Deal ✓",  tier:"great",   detail:`${Math.round((1-ratio)*100)}% below MSRP — buy it` };
  if (ratio <= 1.05) return { label:"At MSRP",        tier:"msrp",    detail:"Fair retail price" };
  if (ratio <= 1.25) return { label:"Slight Markup",  tier:"slight",  detail:`${Math.round((ratio-1)*100)}% above MSRP` };
  if (ratio <= 1.75) return { label:"Overpriced",     tier:"over",    detail:`${Math.round((ratio-1)*100)}% above MSRP — consider waiting` };
  return                     { label:"Scalper Price ✕",tier:"scalper", detail:`${Math.round((ratio-1)*100)}% above MSRP — avoid` };
}

let pkSniperOn   = false;
let pkAutoBuyOn  = false;
let pkCurrentTab = null;
let pkTabInitDone = false; // prevent duplicate listener attachment

function pkShow(state) {
  $("pk-scanning").style.display   = state === "scanning"   ? "block" : "none";
  $("pk-not-target").style.display = state === "not-target" ? "block" : "none";
  $("pk-not-tcg").style.display    = state === "not-tcg"    ? "block" : "none";
  $("pk-content").style.display    = state === "content"    ? "block" : "none";
}

// FIX: renderDealCard uses priceNum for rateDeal, price (string) for display
function renderDealCard(scan) {
  const { title, price, priceNum, msrp, msrpLabel, deal, inStock, trend, history } = scan;

  $("pk-title").textContent = title || "Unknown product";
  // FIX: price is the string from content.js (e.g. "$59.99"); priceStr alias not needed
  $("pk-price").textContent = price || (priceNum != null ? `$${priceNum.toFixed(2)}` : "—");

  const msrpEl = $("pk-msrp-label");
  msrpEl.textContent = (msrp && msrpLabel) ? `MSRP $${msrp.toFixed(2)} · ${msrpLabel}` : "MSRP unknown";

  const tier = deal?.tier ?? "unknown";
  $("pk-stripe").className  = `deal-stripe ${tier}`;
  $("pk-badge").className   = `deal-badge ${tier}`;
  $("pk-badge").textContent  = deal?.label  ?? "Unknown";
  $("pk-detail").textContent = deal?.detail ?? "";

  const dotEl = $("pk-stock-dot"), lblEl = $("pk-stock-label");
  if (inStock === true) {
    dotEl.className = "stock-dot in"; lblEl.className = "stock-label in"; lblEl.textContent = "In Stock";
  } else if (inStock === false) {
    dotEl.className = "stock-dot out"; lblEl.className = "stock-label out"; lblEl.textContent = "Out of Stock";
  } else {
    dotEl.className = "stock-dot unk"; lblEl.className = "stock-label unk"; lblEl.textContent = "Stock unknown";
  }

  const trendRow = $("pk-trend-row"), trendTxt = $("pk-trend-text");
  if (trend && trend !== "stable") {
    trendRow.style.display = "flex";
    trendTxt.className = trend === "rising" ? "trend-text trend-rising" : "trend-text trend-falling";
    trendTxt.textContent = trend === "rising" ? "📈 Price trending up recently" : "📉 Price trending down — good time to buy";
  } else {
    trendRow.style.display = "none";
  }
  renderChart(history, priceNum);
}

function renderChart(history, currentPriceNum) {
  const chartBox  = $("pk-chart-box");
  const chartBars = $("pk-chart-bars");
  if (!history || history.length < 2) { chartBox.style.display = "none"; return; }
  chartBox.style.display = "block";
  const prices = history.map(h => h.price);
  const minP = Math.min(...prices), maxP = Math.max(...prices), range = maxP - minP || 1;
  chartBars.innerHTML = "";
  history.forEach(h => {
    const bar = document.createElement("div");
    bar.className = "chart-bar";
    bar.style.height = Math.max(8, ((h.price - minP) / range) * 100) + "%";
    bar.style.background = h.price === currentPriceNum ? "var(--yellow)"
      : h.price <= (currentPriceNum || maxP) * 1.05 ? "var(--ok-txt,#22cc88)" : "var(--warn-txt,#e84040)";
    bar.title = `$${h.price.toFixed(2)}`;
    chartBars.appendChild(bar);
  });
  $("pk-chart-low").textContent  = `$${minP.toFixed(2)}`;
  $("pk-chart-high").textContent = `$${maxP.toFixed(2)}`;
}

// ── Sniper toggle ─────────────────────────────────────────────────────────────
$("tog-sniper").addEventListener("click", async () => {
  pkSniperOn = !pkSniperOn;
  $("tog-sniper").classList.toggle("on", pkSniperOn);
  chrome.storage.local.set({ sniperOn: pkSniperOn });
  if (!pkCurrentTab) return;

  if (pkSniperOn) {
    $("pk-watching").style.display = "flex";
    $("pk-hit-box").style.display  = "none";
    try { await chrome.scripting.executeScript({ target:{ tabId:pkCurrentTab.id }, files:["content.js"] }); } catch {}
    chrome.tabs.sendMessage(pkCurrentTab.id, { type:"START_SNIPER", autoBuy:pkAutoBuyOn }, () => { void chrome.runtime.lastError; });
    chrome.storage.local.set({ sniperTabId: pkCurrentTab.id });
  } else {
    $("pk-watching").style.display = "none";
    chrome.tabs.sendMessage(pkCurrentTab.id, { type:"STOP_SNIPER" }, () => { void chrome.runtime.lastError; });
  }
});

// ── Auto-Buy toggle ────────────────────────────────────────────────────────────
$("tog-autobuy").addEventListener("click", () => {
  pkAutoBuyOn = !pkAutoBuyOn;
  $("tog-autobuy").classList.toggle("on", pkAutoBuyOn);
  chrome.storage.local.set({ autoBuyOn: pkAutoBuyOn });
  if (pkSniperOn && pkCurrentTab) {
    chrome.tabs.sendMessage(pkCurrentTab.id, { type:"STOP_SNIPER" }, () => { void chrome.runtime.lastError; });
    setTimeout(() => {
      chrome.tabs.sendMessage(pkCurrentTab.id, { type:"START_SNIPER", autoBuy:pkAutoBuyOn }, () => { void chrome.runtime.lastError; });
    }, 300);
  }
});

// ── Panic button ──────────────────────────────────────────────────────────────
$("panic-btn").addEventListener("click", async () => {
  pkSniperOn = false;
  $("tog-sniper").classList.remove("on");
  $("pk-watching").style.display = "none";
  chrome.storage.local.set({ sniperOn: false });
  if (pkCurrentTab) {
    try { await chrome.scripting.executeScript({ target:{ tabId:pkCurrentTab.id }, files:["content.js"] }); } catch {}
    chrome.tabs.sendMessage(pkCurrentTab.id, { type:"PANIC" }, () => { void chrome.runtime.lastError; });
  }
  const btn = $("panic-btn");
  btn.textContent = "✓ STOPPED";
  setTimeout(() => { btn.textContent = "⛔ PANIC STOP"; }, 2000);
});

// ── Init Pokémon tab ──────────────────────────────────────────────────────────
async function initPokemonTab() {
  pkShow("scanning");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  pkCurrentTab = tab;

  const SUPPORTED = ["target.com","walmart.com","bestbuy.com"];
  if (!tab?.url || !SUPPORTED.some(s => tab.url.includes(s))) { pkShow("not-target"); return; }

  const stored = await chrome.storage.local.get(["sniperOn","autoBuyOn","sniperLastHit"]);
  pkSniperOn  = stored.sniperOn  === true;
  pkAutoBuyOn = stored.autoBuyOn === true;
  $("tog-sniper").classList.toggle("on", pkSniperOn);
  $("tog-autobuy").classList.toggle("on", pkAutoBuyOn);
  if (pkSniperOn) $("pk-watching").style.display = "flex";

  if (stored.sniperLastHit && Date.now() - stored.sniperLastHit.ts < 300000) {
    const h = stored.sniperLastHit;
    $("pk-hit-box").style.display = "block";
    $("pk-hit-box").textContent = `✅ In stock! ${h.title} at ${h.price}`;
  }

  try { await chrome.scripting.executeScript({ target:{ tabId:tab.id }, files:["content.js"] }); } catch {}
  await new Promise(r => setTimeout(r, 300));

  let scan;
  try {
    scan = await new Promise((resolve, reject) => {
      // FIX: single timeout ref prevents double-resolve race
      let settled = false;
      const t = setTimeout(() => { if (!settled) { settled = true; reject(new Error("timeout")); } }, 5000);
      chrome.tabs.sendMessage(tab.id, { type:"SCRAPE_FULL" }, (resp) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        if (chrome.runtime.lastError || !resp) reject(new Error("no resp"));
        else resolve(resp);
      });
    });
  } catch { pkShow("not-target"); return; }

  if (!scan?.isTcg) { pkShow("not-tcg"); return; }

  const rawHistory = scan.history ?? [];
  let trend = "stable";
  if (rawHistory.length >= 3) {
    const recent = rawHistory.slice(-5);
    const diff = recent[recent.length-1].price - recent[0].price;
    if (diff > recent[0].price * 0.05) trend = "rising";
    else if (diff < -recent[0].price * 0.05) trend = "falling";
  }

  // FIX: look up MSRP entry for label; pass priceNum (number) to rateDeal
  const msrpEntry = lookupMsrp(scan.title);
  const msrp      = msrpEntry?.msrp ?? scan.msrp ?? null;
  const msrpLabel = msrpEntry?.label ?? null;
  // FIX: rateDeal receives numeric priceNum, not string price
  const deal = rateDeal(scan.priceNum, msrp);

  pkShow("content");
  renderDealCard({ ...scan, msrp, msrpLabel, deal, trend, history: rawHistory.slice(-12) });
}

// Wire tab click — only add listener once
document.querySelectorAll(".tab").forEach(tab => {
  if (tab.dataset.tab === "pokemon") tab.addEventListener("click", initPokemonTab);
});

// ── Sniper messages from content/background ───────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "SNIPER_HIT") {
    const hitBox = $("pk-hit-box");
    hitBox.style.display = "block";
    // FIX: in wave/auto-buy mode sniper stays active; only hide watcher if not auto-buy
    if (msg.autoBuy) {
      hitBox.textContent = `🎯 Auto-buying: ${msg.price}${msg.waveCap ? " (wave limit reached)" : ""}`;
    } else {
      hitBox.textContent = `✅ In stock at ${msg.price}! Click buy now before it's gone.`;
      $("pk-watching").style.display = "none";
      pkSniperOn = false;
      $("tog-sniper").classList.remove("on");
    }
  }
  if (msg.type === "SNIPER_STOPPED") {
    $("pk-watching").style.display = "none";
    pkSniperOn = false;
    $("tog-sniper").classList.remove("on");
  }
  if (msg.type === "SNIPER_ERROR") {
    $("pk-watching").style.display = "none";
    $("pk-hit-box").style.display  = "block";
    $("pk-hit-box").textContent    = `⚠️ Sniper error: ${msg.error}`;
    pkSniperOn = false;
    $("tog-sniper").classList.remove("on");
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── Multi-URL Sniper UI ───────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

let multiSniperOn = false;

// ── Render URL list ───────────────────────────────────────────────────────────
async function renderMultiUrlList() {
  const data = await chrome.storage.local.get(["multiSniperUrls","multiSniperHits"]);
  const urls  = data.multiSniperUrls  || [];
  const hits  = data.multiSniperHits  || [];
  const list  = $("multi-url-list");
  const hitLog = $("multi-hit-log");
  if (!list) return;

  list.innerHTML = "";
  if (!urls.length) {
    list.innerHTML = '<p style="font-size:10.5px;color:var(--text3);margin-bottom:4px;">No URLs added yet.</p>';
  } else {
    urls.forEach((entry, i) => {
      const hitForUrl = hits.find(h => h.url === entry.url && Date.now() - h.ts < 3600000);
      const div = document.createElement("div");
      div.className = "url-item";
      div.innerHTML = `
        <span class="url-item-label" title="${entry.url}">${entry.label || entry.url}</span>
        ${hitForUrl ? `<span class="url-item-status hit">✓ Hit</span>` : `<span class="url-item-status watching">👁</span>`}
        <button class="url-remove-btn" data-i="${i}" title="Remove">×</button>`;
      list.appendChild(div);
    });
    list.querySelectorAll(".url-remove-btn").forEach(btn =>
      btn.addEventListener("click", () => removeMultiUrl(parseInt(btn.dataset.i)))
    );
  }

  // Show recent hits
  hitLog.innerHTML = "";
  if (hits.length) {
    hits.slice(0, 3).forEach(h => {
      const el = document.createElement("div");
      el.className = "multi-hit-item";
      el.textContent = `✅ ${h.label || h.title || h.url} — ${h.price} (${new Date(h.ts).toLocaleTimeString()})`;
      hitLog.appendChild(el);
    });
  }
}

async function addMultiUrl() {
  const input = $("multi-url-input");
  const url   = (input?.value || "").trim();
  if (!url) return;
  // Basic URL validation
  try { new URL(url); } catch { alert("Please enter a valid URL."); return; }

  const SUPPORTED = ["target.com","walmart.com","bestbuy.com","amazon.com"];
  if (!SUPPORTED.some(s => url.includes(s))) {
    alert("URL must be from Target, Walmart, Best Buy, or Amazon.");
    return;
  }

  const data = await chrome.storage.local.get("multiSniperUrls");
  const urls = data.multiSniperUrls || [];
  if (urls.some(e => e.url === url)) { alert("This URL is already in the list."); return; }
  if (urls.length >= 20) { alert("Maximum 20 URLs in the list."); return; }

  // Derive a short label from the URL
  const label = url.split("/").filter(Boolean).slice(-1)[0].replace(/-/g, " ").slice(0, 50) || url.slice(0, 50);
  urls.push({ url, label });
  await chrome.storage.local.set({ multiSniperUrls: urls });
  input.value = "";
  renderMultiUrlList();
}

async function removeMultiUrl(index) {
  const data = await chrome.storage.local.get("multiSniperUrls");
  const urls = data.multiSniperUrls || [];
  urls.splice(index, 1);
  await chrome.storage.local.set({ multiSniperUrls: urls });
  renderMultiUrlList();
}

// ── Toggle multi-sniper ───────────────────────────────────────────────────────
$("tog-multisniper").addEventListener("click", async () => {
  multiSniperOn = !multiSniperOn;
  $("tog-multisniper").classList.toggle("on", multiSniperOn);
  await chrome.storage.local.set({
    multiSniperActive:  multiSniperOn,
    multiSniperAutoBuy: pkAutoBuyOn,
  });
  if (multiSniperOn) {
    const data = await chrome.storage.local.get("multiSniperUrls");
    if (!data.multiSniperUrls?.length) {
      alert("Add at least one URL before enabling the Multi-URL Sniper.");
      multiSniperOn = false;
      $("tog-multisniper").classList.remove("on");
      await chrome.storage.local.set({ multiSniperActive: false });
      return;
    }
    chrome.runtime.sendMessage({ type: "MULTISNIPER_START" }, () => { void chrome.runtime.lastError; });
  } else {
    chrome.runtime.sendMessage({ type: "MULTISNIPER_STOP" }, () => { void chrome.runtime.lastError; });
  }
});

// Wire add button and Enter key
$("multi-url-add-btn").addEventListener("click", addMultiUrl);
$("multi-url-input").addEventListener("keydown", e => { if (e.key === "Enter") addMultiUrl(); });

// Listen for multi-sniper hits from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "MULTISNIPER_HIT") {
    renderMultiUrlList();
    const hitBox = $("pk-hit-box");
    if (hitBox) {
      hitBox.style.display = "block";
      hitBox.textContent = `🌐 Multi-Sniper: ${msg.title || msg.label || "Item"} at ${msg.price} — go buy it!`;
    }
  }
});

// Restore multi-sniper state on popup open
async function initMultiSniper() {
  const data = await chrome.storage.local.get(["multiSniperActive","multiSniperUrls"]);
  multiSniperOn = data.multiSniperActive === true && (data.multiSniperUrls?.length > 0);
  $("tog-multisniper").classList.toggle("on", multiSniperOn);
  renderMultiUrlList();
}

// Init when Pokémon tab opens (already wired via initPokemonTab)
// Also init at load time in case the tab is already open
document.querySelectorAll(".tab").forEach(tab => {
  if (tab.dataset.tab === "pokemon") {
    // renderMultiUrlList is called inside initPokemonTab via initMultiSniper()
  }
});

// Extend initPokemonTab to call initMultiSniper
const _origInitPokemonTab = initPokemonTab;
// We override by wrapping — the function is defined above in the file
// Simpler: just call initMultiSniper from the existing SNIPER_HIT handler path
// Instead, patch the pokemon tab click listener to also init multi-sniper
document.querySelectorAll(".tab").forEach(tab => {
  if (tab.dataset.tab === "pokemon") {
    tab.addEventListener("click", initMultiSniper);
  }
});
