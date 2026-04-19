"use strict";

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// ── State ─────────────────────────────────────────────────────────────────────
let currentPriceNum = null;
let budgetLimit     = null;
let isProductPage   = false;
let isDark          = false;
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
  const el = $(id);
  if (!el) return;
  el.addEventListener("click", () => {
    el.classList.toggle("on");
    chrome.storage.local.set({ [key]: el.classList.contains("on") });
  });
}
setupToggle("tog-dismiss",    "dismissPopup");
setupToggle("tog-cart",       "goToCart");
setupToggle("tog-checkout",   "doCheckout");
setupToggle("tog-placeorder", "doPlaceOrder");
setupToggle("tog-sound",      "soundEnabled");
setupToggle("tog-faster-catch","fasterCatchIt");
setupToggle("tog-cart-protect","cartProtectEnabled");

// ── Budget guard ──────────────────────────────────────────────────────────────
function checkBudget() {
  const badge    = $("budget-badge");
  const blockMsg = $("budget-block-msg");
  const btn      = $("cta-btn");
  if (!badge || !blockMsg || !btn) return;
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
  if (!el) return;
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

// ── Global message router — single listener for all popup messages ────────────
// FIX: one listener instead of many scattered ones, prevents duplicate handlers
chrome.runtime.onMessage.addListener((msg) => {
  switch (msg.type) {

    case "PROGRESS":
      handleProgress(msg);
      break;

    case "SNIPER_HIT":
      handleSniperHit(msg);
      break;

    case "SNIPER_STOPPED":
      $("pk-watching").style.display = "none";
      pkSniperOn = false;
      $("tog-sniper")?.classList.remove("on");
      break;

    case "SNIPER_ERROR":
      $("pk-watching").style.display = "none";
      showHitBox(`⚠️ Sniper error: ${msg.error}`, "warn");
      pkSniperOn = false;
      $("tog-sniper")?.classList.remove("on");
      chrome.storage.local.set({ sniperOn: false });
      break;

    case "MULTISNIPER_HIT":
      renderMultiUrlList();
      showHitBox(`🌐 Multi-Sniper: ${msg.title || msg.label || "Item"} at ${msg.price} — go buy it!`, "ok");
      break;

    case "STREAK_UPDATED":
      updateStreakUI();
      break;

    case "NOTIFICATION_LOG_UPDATED":
      renderNotifLog();
      break;

    case "SCHEDULE_FIRED":
      // FIX: single handler — was duplicated at two places before
      renderSchedules();
      updateStreakUI();
      break;

    case "CART_ITEM_DROPPED":
      showHitBox(`⚠️ Cart item dropped: ${msg.title || "Item"} was removed from your cart!`, "warn");
      renderNotifLog();
      break;

    case "PRICE_DROP":
      showHitBox(`📉 Price drop: ${msg.title} ${msg.prevPrice} → ${msg.price}`, "ok");
      renderNotifLog();
      break;
  }
});

function showHitBox(text, style = "ok") {
  const hitBox = $("pk-hit-box");
  if (!hitBox) return;
  hitBox.style.display  = "block";
  hitBox.textContent    = text;
  // Reset inline styles set by previous alerts
  hitBox.style.background = "";
  hitBox.style.color      = "";
  if (style === "warn") {
    hitBox.style.background = "var(--warn-bg)";
    hitBox.style.color      = "var(--warn-txt)";
  }
}

function handleProgress(msg) {
  setStep(msg.step, msg.status, msg.message);
  const btn = $("cta-btn");
  if (!btn) return;

  if (msg.step === 3 && (msg.status === "done" || msg.status === "skipped")) {
    if (msg.status === "done") flowStarted = true;
    btn.disabled = false;
    btn.textContent = "⚡ CATCH IT";
    return;
  }
  if (msg.step === 5) {
    btn.disabled = false;
    btn.textContent = msg.status === "done" ? "✓ CAUGHT!" : "⚡ CATCH IT";
    if (msg.status === "done") {
      // Increment streak on successful purchase
      chrome.runtime.sendMessage({ type: "INCREMENT_STREAK" }, () => { void chrome.runtime.lastError; });
      // Start cart protection if enabled
      chrome.storage.local.get(["cartProtectEnabled","goToCart"]).then(prefs => {
        if (prefs.cartProtectEnabled && prefs.goToCart) {
          chrome.tabs.query({ active:true, currentWindow:true }).then(([tab]) => {
            if (!tab) return;
            chrome.tabs.sendMessage(tab.id, {
              type: "START_CART_PROTECT",
              url: tab.url,
              title: $("product-title")?.textContent || "",
            }, () => { void chrome.runtime.lastError; });
          });
        }
      });
    }
    setTimeout(() => {
      btn.textContent = "⚡ CATCH IT";
      checkBudget();
      resetSteps();
      flowStarted = false;
    }, 3000);
  }
}

function handleSniperHit(msg) {
  if (msg.autoBuy) {
    showHitBox(`🎯 Auto-buying: ${msg.price}${msg.waveCap ? " (wave limit reached)" : ""}`, "ok");
    // In wave/auto-buy mode sniper stays armed — don't reset toggle
  } else {
    showHitBox(`✅ In stock at ${msg.price}! Click buy now before it's gone.`, "ok");
    $("pk-watching").style.display = "none";
    pkSniperOn = false;
    $("tog-sniper")?.classList.remove("on");
    chrome.storage.local.set({ sniperOn: false });
  }
}

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
// FIX: amazon.com added to SUPPORTED list
const SUPPORTED_SITES = ["target.com", "walmart.com", "bestbuy.com", "amazon.com"];

async function init() {
  const prefs = await chrome.storage.local.get([
    "darkMode","dismissPopup","goToCart","doCheckout","doPlaceOrder","budgetLimit",
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
  currentTab = tab;

  if (tab?.url) {
    const su = $("sched-url-current");
    if (su) su.textContent = "URL: " + tab.url.slice(0, 55) + (tab.url.length > 55 ? "…" : "");
  }

  if (!tab?.url || !SUPPORTED_SITES.some(s => tab.url.includes(s))) {
    $("header-sub").textContent   = "Not on a supported site";
    $("no-product").style.display = "block";
    renderBudgetStatus();
    initScheduleUI(tab);
    renderSchedules();
    return;
  }

  // Scrape product info via content.js SCRAPE_FULL
  let scrapeResult;
  try {
    try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }); } catch {}
    await new Promise(r => setTimeout(r, 200));
    scrapeResult = await new Promise((resolve, reject) => {
      let settled = false;
      const t = setTimeout(() => { if (!settled) { settled = true; reject(new Error("timeout")); } }, 5000);
      chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_FULL" }, (resp) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        if (chrome.runtime.lastError || !resp) reject(new Error("no resp"));
        else resolve(resp);
      });
    });
  } catch {
    // Fallback inline scrape
    try {
      const [inj] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const h = window.location.hostname;
          const isTgt = h.includes("target.com"), isWmt = h.includes("walmart.com"), isAmz = h.includes("amazon.com");
          const titleEl = isTgt ? document.querySelector('[data-test="product-title"]')
                        : isWmt ? document.querySelector('h1[itemprop="name"]')
                        : isAmz ? document.querySelector('#productTitle')
                        : document.querySelector('.sku-title h1');
          const priceEl = isTgt ? document.querySelector('[data-test="product-price"]')
                        : isWmt ? document.querySelector('[data-seo-id="hero-price"],[itemprop="price"]')
                        : isAmz ? document.querySelector('.a-price .a-offscreen')
                        : document.querySelector('.priceView-customer-price span[aria-hidden="false"]');
          const addBtn  = document.querySelector('[data-test="shippingButton"],[data-test="addToCartButton"],button.add-to-cart-button,button[data-dca-name="ItemBuyBoxAddToCartButton"],#add-to-cart-button')
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
    initScheduleUI(tab);
    renderSchedules();
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
  initScheduleUI(tab);
  renderSchedules();
  updateStreakUI();
  syncOverlaysToPage();
}

// ── Multi-Schedule ─────────────────────────────────────────────────────────────
let currentTab = null;
let schedCountdownTimers = {};
let schedUIInit = false;

function initScheduleUI(tab) {
  currentTab = tab;
  if (schedUIInit) return;
  schedUIInit = true;
  $("sched-arm").addEventListener("click", addSchedule);
  if (tab?.url) {
    const su = $("sched-url-current");
    if (su) su.textContent = "URL: " + tab.url.slice(0, 55) + (tab.url.length > 55 ? "…" : "");
  }
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

  const schedId   = "s" + Date.now();
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
    budgetLimit,
    priceNum:     currentPriceNum,
  };

  const data = await chrome.storage.local.get("schedules");
  const schedules = data.schedules || {};
  schedules[schedId] = sched;
  await chrome.storage.local.set({ schedules });

  await chrome.alarms.clear(alarmName);
  chrome.alarms.create(alarmName, { when: ts });

  $("sched-label-input").value = "";
  $("sched-url-input").value   = "";
  renderSchedules();
}

async function cancelSchedule(schedId) {
  await chrome.alarms.clear("pokebot-sched-" + schedId);
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

  // Clear all existing countdown timers for schedules we're re-rendering
  Object.keys(schedCountdownTimers).forEach(id => {
    clearInterval(schedCountdownTimers[id]);
    delete schedCountdownTimers[id];
  });

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

    // FIX: escape label/url before injecting into innerHTML to prevent XSS
    const safeLabel = (s.label || "Schedule").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const safeUrl   = (s.url || "").replace(/</g,"&lt;").replace(/>/g,"&gt;");

    div.innerHTML = `
      <div class="sched-item-header">
        <span class="sched-item-label">${safeLabel}</span>
        <span class="sched-item-badge ${state}">${badge}</span>
      </div>
      <div class="sched-item-time">${fmtTs(s.ts)} · ${safeUrl.slice(0,45)}${safeUrl.length>45?"…":""}</div>
      ${s.active ? `<div class="sched-item-countdown" id="scd-${id}">${fmtCountdown(s.ts)}</div>` : ""}
      <div class="sched-item-actions">
        ${s.active ? `<button class="sched-cancel-btn" data-id="${id}">Cancel</button>` : ""}
        <button class="sched-remove-btn" data-id="${id}">Remove</button>
      </div>`;

    list.appendChild(div);

    if (s.active) {
      schedCountdownTimers[id] = setInterval(() => {
        const el = document.getElementById("scd-" + id);
        if (el) el.textContent = fmtCountdown(s.ts);
        if (Date.now() >= s.ts) {
          clearInterval(schedCountdownTimers[id]);
          delete schedCountdownTimers[id];
          renderSchedules();
        }
      }, 1000);
    }
  });

  list.querySelectorAll(".sched-cancel-btn").forEach(btn => btn.addEventListener("click", () => cancelSchedule(btn.dataset.id)));
  list.querySelectorAll(".sched-remove-btn").forEach(btn => btn.addEventListener("click", () => removeSchedule(btn.dataset.id)));
}

init();

// ══════════════════════════════════════════════════════════════════════════════
// ── Pokémon Tab ───────────────────────────────────────────────────────────────
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

function lookupMsrp(text) {
  const lower = (text || "").toLowerCase();
  return MSRP_MAP.find(e => e.keys.some(k => lower.includes(k))) || null;
}

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
let multiSniperOn = false;

function pkShow(state) {
  $("pk-scanning").style.display   = state === "scanning"   ? "block" : "none";
  $("pk-not-target").style.display = state === "not-target" ? "block" : "none";
  $("pk-not-tcg").style.display    = state === "not-tcg"    ? "block" : "none";
  $("pk-content").style.display    = state === "content"    ? "block" : "none";
}

function renderDealCard(scan) {
  const { title, price, priceNum, msrp, msrpLabel, deal, inStock, trend, history, restockHistory } = scan;

  $("pk-title").textContent = title || "Unknown product";
  $("pk-price").textContent = price || (priceNum != null ? `$${priceNum.toFixed(2)}` : "—");

  const msrpEl = $("pk-msrp-label");
  if (msrpEl) msrpEl.textContent = (msrp && msrpLabel) ? `MSRP $${msrp.toFixed(2)} · ${msrpLabel}` : "MSRP unknown";

  const tier = deal?.tier ?? "unknown";
  $("pk-stripe").className   = `deal-stripe ${tier}`;
  $("pk-badge").className    = `deal-badge ${tier}`;
  $("pk-badge").textContent  = deal?.label  ?? "Unknown";
  $("pk-detail").textContent = deal?.detail ?? "";

  const dotEl = $("pk-stock-dot"), lblEl = $("pk-stock-label");
  if (dotEl && lblEl) {
    if (inStock === true) {
      dotEl.className = "stock-dot in"; lblEl.className = "stock-label in"; lblEl.textContent = "In Stock";
    } else if (inStock === false) {
      dotEl.className = "stock-dot out"; lblEl.className = "stock-label out"; lblEl.textContent = "Out of Stock";
    } else {
      dotEl.className = "stock-dot unk"; lblEl.className = "stock-label unk"; lblEl.textContent = "Stock unknown";
    }
  }

  const trendRow = $("pk-trend-row"), trendTxt = $("pk-trend-text");
  if (trendRow && trendTxt) {
    if (trend && trend !== "stable") {
      trendRow.style.display = "flex";
      trendTxt.className = trend === "rising" ? "trend-text trend-rising" : "trend-text trend-falling";
      trendTxt.textContent = trend === "rising" ? "📈 Price trending up recently" : "📉 Price trending down — good time to buy";
    } else {
      trendRow.style.display = "none";
    }
  }

  renderChart(history, priceNum);
  renderRestockHistory(restockHistory);
}

function renderChart(history, currentPriceNum) {
  const chartBox  = $("pk-chart-box");
  const chartBars = $("pk-chart-bars");
  if (!chartBox || !chartBars) return;
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

function renderRestockHistory(restockHistory) {
  const box = $("pk-restock-box");
  const log = $("pk-restock-log");
  if (!box || !log || !restockHistory?.length) { if (box) box.style.display = "none"; return; }
  box.style.display = "block";
  log.innerHTML = restockHistory.slice(-8).reverse().map(r => {
    const time = new Date(r.ts).toLocaleTimeString(undefined, { hour:"2-digit", minute:"2-digit" });
    const date = new Date(r.ts).toLocaleDateString(undefined, { month:"short", day:"numeric" });
    return `<div class="restock-item">
      <span class="${r.inStock ? "restock-in" : "restock-out"}">${r.inStock ? "IN" : "OUT"}</span>
      <span style="font-size:10.5px;color:var(--text2);">${date} ${time}${r.price ? " · " + r.price : ""}</span>
    </div>`;
  }).join("");
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

// ── Auto-Buy toggle ───────────────────────────────────────────────────────────
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
  multiSniperOn = false;
  $("tog-sniper")?.classList.remove("on");
  $("tog-multisniper")?.classList.remove("on");
  $("pk-watching").style.display = "none";
  chrome.storage.local.set({ sniperOn: false, multiSniperActive: false });

  if (pkCurrentTab) {
    try { await chrome.scripting.executeScript({ target:{ tabId:pkCurrentTab.id }, files:["content.js"] }); } catch {}
    chrome.tabs.sendMessage(pkCurrentTab.id, { type:"PANIC" }, () => { void chrome.runtime.lastError; });
  }
  chrome.runtime.sendMessage({ type: "MULTISNIPER_STOP" }, () => { void chrome.runtime.lastError; });

  const btn = $("panic-btn");
  btn.textContent = "✓ STOPPED";
  setTimeout(() => { btn.textContent = "⛔ PANIC STOP"; }, 2000);
});

// ── Init Pokémon tab ──────────────────────────────────────────────────────────
async function initPokemonTab() {
  pkShow("scanning");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  pkCurrentTab = tab;

  // FIX: amazon.com added here too
  if (!tab?.url || !SUPPORTED_SITES.some(s => tab.url.includes(s))) {
    pkShow("not-target");
    return;
  }

  const stored = await chrome.storage.local.get(["sniperOn","autoBuyOn","sniperLastHit"]);
  pkSniperOn  = stored.sniperOn  === true;
  pkAutoBuyOn = stored.autoBuyOn === true;
  $("tog-sniper")?.classList.toggle("on", pkSniperOn);
  $("tog-autobuy")?.classList.toggle("on", pkAutoBuyOn);
  if (pkSniperOn) $("pk-watching").style.display = "flex";

  if (stored.sniperLastHit && Date.now() - stored.sniperLastHit.ts < 300000) {
    const h = stored.sniperLastHit;
    showHitBox(`✅ In stock! ${h.title} at ${h.price}`, "ok");
  }

  try { await chrome.scripting.executeScript({ target:{ tabId:tab.id }, files:["content.js"] }); } catch {}
  await new Promise(r => setTimeout(r, 300));

  let scan;
  try {
    scan = await new Promise((resolve, reject) => {
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

  const msrpEntry = lookupMsrp(scan.title);
  const msrp      = msrpEntry?.msrp ?? scan.msrp ?? null;
  const msrpLabel = msrpEntry?.label ?? null;
  const deal      = rateDeal(scan.priceNum, msrp);

  pkShow("content");
  renderDealCard({ ...scan, msrp, msrpLabel, deal, trend, history: rawHistory.slice(-12) });

  // Also restore multi-sniper UI
  initMultiSniperUI();
}

document.querySelectorAll(".tab").forEach(tab => {
  if (tab.dataset.tab === "pokemon") tab.addEventListener("click", initPokemonTab);
});

// ══════════════════════════════════════════════════════════════════════════════
// ── Multi-URL Sniper UI ───────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// FIX: single renderMultiUrlList definition — no more double-declaration
async function renderMultiUrlList() {
  const data  = await chrome.storage.local.get(["multiSniperUrls","multiSniperHits"]);
  const urls  = data.multiSniperUrls || [];
  const hits  = data.multiSniperHits || [];
  const list  = $("multi-url-list");
  const hitLog = $("multi-hit-log");
  if (!list) return;

  list.innerHTML = "";
  if (!urls.length) {
    list.innerHTML = '<p style="font-size:10.5px;color:var(--text3);margin-bottom:4px;">No URLs added yet.</p>';
  } else {
    urls.forEach((entry, i) => {
      const hitForUrl = hits.find(h => h.url === entry.url && Date.now() - h.ts < 3600000);
      const safeLabel = (entry.label || entry.url).replace(/</g,"&lt;").replace(/>/g,"&gt;");
      const safeUrl   = (entry.url || "").replace(/"/g,"&quot;");
      const div = document.createElement("div");
      div.className = "url-item";
      div.style.flexWrap = "wrap";
      div.innerHTML = `
        <span class="url-item-label" title="${safeUrl}" style="min-width:0;flex:1;">${safeLabel}</span>
        ${hitForUrl ? `<span class="url-item-status hit">✓</span>` : `<span class="url-item-status watching">👁</span>`}
        <input class="url-budget-input" type="number" placeholder="$max" value="${entry.budgetLimit || ""}" data-i="${i}" title="Per-URL budget limit"/>
        <button class="url-remove-btn" data-i="${i}" title="Remove">×</button>`;
      list.appendChild(div);
    });

    // Wire per-URL budget inputs
    list.querySelectorAll(".url-budget-input").forEach(input => {
      input.addEventListener("change", async () => {
        const i   = parseInt(input.dataset.i);
        const val = parseFloat(input.value);
        const d2  = await chrome.storage.local.get("multiSniperUrls");
        const u2  = d2.multiSniperUrls || [];
        if (u2[i]) u2[i].budgetLimit = (isNaN(val) || val <= 0) ? null : val;
        await chrome.storage.local.set({ multiSniperUrls: u2 });
      });
    });

    list.querySelectorAll(".url-remove-btn").forEach(btn =>
      btn.addEventListener("click", () => removeMultiUrl(parseInt(btn.dataset.i)))
    );
  }

  if (!hitLog) return;
  hitLog.innerHTML = "";
  hits.slice(0, 3).forEach(h => {
    const el = document.createElement("div");
    el.className = "multi-hit-item";
    el.textContent = `✅ ${h.label || h.title || h.url} — ${h.price} (${new Date(h.ts).toLocaleTimeString()})`;
    hitLog.appendChild(el);
  });
}

async function addMultiUrl() {
  const input = $("multi-url-input");
  const url   = (input?.value || "").trim();
  if (!url) return;
  try { new URL(url); } catch { alert("Please enter a valid URL."); return; }
  if (!SUPPORTED_SITES.some(s => url.includes(s))) {
    alert("URL must be from Target, Walmart, Best Buy, or Amazon.");
    return;
  }
  const data = await chrome.storage.local.get("multiSniperUrls");
  const urls = data.multiSniperUrls || [];
  if (urls.some(e => e.url === url)) { alert("This URL is already in the list."); return; }
  if (urls.length >= 20) { alert("Maximum 20 URLs in the list."); return; }
  const label = url.split("/").filter(Boolean).slice(-1)[0].replace(/-/g, " ").slice(0, 50) || url.slice(0, 50);
  urls.push({ url, label });
  await chrome.storage.local.set({ multiSniperUrls: urls });
  if (input) input.value = "";
  renderMultiUrlList();
}

async function removeMultiUrl(index) {
  const data = await chrome.storage.local.get("multiSniperUrls");
  const urls = data.multiSniperUrls || [];
  urls.splice(index, 1);
  await chrome.storage.local.set({ multiSniperUrls: urls });
  renderMultiUrlList();
}

$("tog-multisniper").addEventListener("click", async () => {
  multiSniperOn = !multiSniperOn;
  $("tog-multisniper").classList.toggle("on", multiSniperOn);
  await chrome.storage.local.set({ multiSniperActive: multiSniperOn, multiSniperAutoBuy: pkAutoBuyOn });
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

$("multi-url-add-btn").addEventListener("click", addMultiUrl);
$("multi-url-input").addEventListener("keydown", e => { if (e.key === "Enter") addMultiUrl(); });

async function initMultiSniperUI() {
  const data = await chrome.storage.local.get(["multiSniperActive","multiSniperUrls"]);
  multiSniperOn = data.multiSniperActive === true && (data.multiSniperUrls?.length > 0);
  $("tog-multisniper")?.classList.toggle("on", multiSniperOn);
  renderMultiUrlList();
}

// ── Wishlist import ────────────────────────────────────────────────────────────
$("wishlist-import-btn")?.addEventListener("click", async () => {
  const input = $("wishlist-url-input");
  const url   = (input?.value || "").trim();
  if (!url) { alert("Paste a wishlist or list URL first."); return; }

  const btn = $("wishlist-import-btn");
  btn.textContent = "Loading…";
  btn.disabled = true;
  let importTab = null;

  try {
    importTab = await new Promise((resolve, reject) => {
      chrome.tabs.create({ url, active: false }, t => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(t);
      });
    });

    // FIX: timeout also cleans up the tab
    await new Promise((resolve) => {
      let done = false;
      const cleanup = () => { if (!done) { done = true; chrome.tabs.onUpdated.removeListener(listener); resolve(); } };
      function listener(id, info) { if (id === importTab.id && info.status === "complete") cleanup(); }
      chrome.tabs.onUpdated.addListener(listener);
      setTimeout(cleanup, 15000);
    });

    const results = await chrome.scripting.executeScript({
      target: { tabId: importTab.id },
      func: () => {
        const links = Array.from(document.querySelectorAll("a[href]"))
          .map(a => a.href)
          .filter(h =>
            h.includes("target.com/p/") ||
            h.includes("walmart.com/ip/") ||
            (h.includes("bestbuy.com/site/") && h.includes(".p")) ||
            h.includes("amazon.com/dp/") ||
            h.includes("amazon.com/gp/product/")
          );
        return [...new Set(links)].slice(0, 20);
      },
    });

    // FIX: always close the import tab
    try { chrome.tabs.remove(importTab.id); } catch {}
    importTab = null;

    const found = results?.[0]?.result || [];
    if (!found.length) { alert("No product links found on that page."); return; }

    const data = await chrome.storage.local.get("multiSniperUrls");
    const existing = data.multiSniperUrls || [];
    let added = 0;
    found.forEach(u => {
      if (!existing.some(e => e.url === u) && existing.length < 20) {
        const label = u.split("/").filter(Boolean).pop().replace(/-/g, " ").slice(0, 50);
        existing.push({ url: u, label });
        added++;
      }
    });
    await chrome.storage.local.set({ multiSniperUrls: existing });
    renderMultiUrlList();
    if (input) input.value = "";
    alert(`Added ${added} new URL${added !== 1 ? "s" : ""} from the list.`);
  } catch (err) {
    // FIX: always close tab on error too
    if (importTab) { try { chrome.tabs.remove(importTab.id); } catch {} }
    alert("Could not import — check the URL and try again.");
  }

  btn.textContent = "📋 Import";
  btn.disabled = false;
});

// ══════════════════════════════════════════════════════════════════════════════
// ── Settings Tab ──────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// FIX: auto-refresh toggle stops old refresh before starting new one
$("tog-auto-refresh").addEventListener("click", async () => {
  $("tog-auto-refresh").classList.toggle("on");
  const on = $("tog-auto-refresh").classList.contains("on");
  chrome.storage.local.set({ autoRefreshActive: on });
  $("refresh-interval-row").style.display = on ? "flex" : "none";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }); } catch {}
  // Always stop first so content.js resets the timer, then start if on
  chrome.tabs.sendMessage(tab.id, { type: "STOP_AUTO_REFRESH" }, () => {
    void chrome.runtime.lastError;
    if (on) {
      const ms = Math.max(3, parseInt($("refresh-interval-val").value) || 5) * 1000;
      chrome.tabs.sendMessage(tab.id, { type: "START_AUTO_REFRESH", intervalMs: ms }, () => { void chrome.runtime.lastError; });
    }
  });
});

$("refresh-interval-val").addEventListener("change", async () => {
  const ms = Math.max(3, parseInt($("refresh-interval-val").value) || 5) * 1000;
  chrome.storage.local.set({ autoRefreshMs: ms });
  if ($("tog-auto-refresh").classList.contains("on")) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    // Stop then restart with new interval
    chrome.tabs.sendMessage(tab.id, { type: "STOP_AUTO_REFRESH" }, () => {
      void chrome.runtime.lastError;
      chrome.tabs.sendMessage(tab.id, { type: "START_AUTO_REFRESH", intervalMs: ms }, () => { void chrome.runtime.lastError; });
    });
  }
});

// ── Streak counter ────────────────────────────────────────────────────────────
async function updateStreakUI() {
  const data   = await chrome.storage.local.get("catchStreak");
  const streak = data.catchStreak || 0;
  const display = $("streak-display");
  const count   = $("streak-count");
  const setting = $("streak-setting-count");
  if (count)   count.textContent   = streak;
  if (setting) setting.textContent = streak;
  if (display) display.style.display = streak > 0 ? "inline-flex" : "none";
}

$("reset-streak-btn")?.addEventListener("click", async () => {
  await chrome.storage.local.set({ catchStreak: 0 });
  updateStreakUI();
});

// ── Notification log ──────────────────────────────────────────────────────────
const NOTIF_ICONS = {
  sniper:"🎯", multi_sniper:"🌐", price_drop:"📉",
  restock:"📦", cart_dropped:"⚠️", scheduled:"⏰",
};

async function renderNotifLog() {
  const el = $("notif-log");
  if (!el) return;
  const data = await chrome.storage.local.get("notificationHistory");
  const log  = data.notificationHistory || [];
  if (!log.length) { el.innerHTML = '<div class="notif-empty">No notifications yet</div>'; return; }
  el.innerHTML = log.slice(0, 15).map(n => {
    const icon = NOTIF_ICONS[n.type] || "🔔";
    const time = new Date(n.ts).toLocaleTimeString(undefined, { hour:"2-digit", minute:"2-digit" });
    const date = new Date(n.ts).toLocaleDateString(undefined, { month:"short", day:"numeric" });
    const safeTitle = (n.title || n.url || "Item").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    return `<div class="notif-item">
      <span class="notif-icon">${icon}</span>
      <div class="notif-body">
        <div class="notif-title">${safeTitle}</div>
        <div class="notif-meta">${n.price ? n.price + " · " : ""}${date} ${time}</div>
      </div>
    </div>`;
  }).join("");
}

$("clear-notif-btn")?.addEventListener("click", async () => {
  await chrome.storage.local.set({ notificationHistory: [] });
  renderNotifLog();
});

// ── Export / Import ───────────────────────────────────────────────────────────
const EXPORT_KEYS = [
  "darkMode","dismissPopup","goToCart","doCheckout","doPlaceOrder",
  "budgetLimit","soundEnabled","fasterCatchIt","autoRefreshActive","autoRefreshMs",
  "cartProtectEnabled","multiSniperUrls","schedules","sniperOn","autoBuyOn","priceHistory",
];

$("export-btn")?.addEventListener("click", async () => {
  const data = await chrome.storage.local.get(EXPORT_KEYS);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "pokebot-settings.json"; a.click();
  URL.revokeObjectURL(url);
});

$("import-file")?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const data     = JSON.parse(ev.target.result);
      const filtered = {};
      EXPORT_KEYS.forEach(k => { if (k in data) filtered[k] = data[k]; });
      await chrome.storage.local.set(filtered);
      alert("Settings imported! Reopening popup to apply…");
      window.location.reload();
    } catch { alert("Import failed — file may be corrupted."); }
  };
  reader.readAsText(file);
  e.target.value = "";
});

// ── Settings tab init ─────────────────────────────────────────────────────────
async function initSettingsTab() {
  const prefs = await chrome.storage.local.get([
    "soundEnabled","fasterCatchIt","autoRefreshActive","autoRefreshMs","cartProtectEnabled",
  ]);
  if (prefs.soundEnabled       === true) $("tog-sound")?.classList.add("on");
  if (prefs.fasterCatchIt      === true) $("tog-faster-catch")?.classList.add("on");
  if (prefs.cartProtectEnabled === true) $("tog-cart-protect")?.classList.add("on");
  if (prefs.autoRefreshActive  === true) {
    $("tog-auto-refresh")?.classList.add("on");
    const rr = $("refresh-interval-row");
    if (rr) rr.style.display = "flex";
  }
  if (prefs.autoRefreshMs) {
    const rv = $("refresh-interval-val");
    if (rv) rv.value = Math.round(prefs.autoRefreshMs / 1000);
  }
  updateStreakUI();
  renderNotifLog();
}

document.querySelectorAll(".tab").forEach(tab => {
  if (tab.dataset.tab === "settings") tab.addEventListener("click", initSettingsTab);
});

// ── Overlay sync ──────────────────────────────────────────────────────────────
// FIX: use Promise-based executeScript correctly (MV3 doesn't support callbacks)
async function syncOverlaysToPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;
  const data      = await chrome.storage.local.get("schedules");
  const schedules = data.schedules || {};
  const now       = Date.now();

  for (const s of Object.values(schedules)) {
    if (!s.active || s.ts <= now || !s.url) continue;
    const schedBase = s.url.split("?")[0];
    const tabBase   = tab.url.split("?")[0];
    if (!tabBase.startsWith(schedBase) && !schedBase.startsWith(tabBase)) continue;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      await new Promise(r => setTimeout(r, 200));
      chrome.tabs.sendMessage(tab.id, { type:"SHOW_OVERLAY", ts: s.ts, label: s.label }, () => { void chrome.runtime.lastError; });
    } catch {}
  }
}

// Boot
updateStreakUI();
