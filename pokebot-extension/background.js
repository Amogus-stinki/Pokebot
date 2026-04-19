// Pokébot background.js v4
// Handles: keyboard shortcut, scheduled alarms, multi-URL sniper, notifications,
// badge, catch count (streak), cart protection relay, settings export/import

const delay = ms => new Promise(r => setTimeout(r, ms));

// ── Badge ─────────────────────────────────────────────────────────────────────
function setBadge(text, color) {
  chrome.action.setBadgeText({ text: text || "" });
  if (color) chrome.action.setBadgeBackgroundColor({ color });
}

// ── Notification ──────────────────────────────────────────────────────────────
function notify(id, title, message) {
  try { chrome.notifications.create("pokebot-" + id + "-" + Date.now(), { type:"basic", iconUrl:"icons/icon128.png", title, message, priority:2 }); } catch {}
}

// ── Streak counter ────────────────────────────────────────────────────────────
async function incrementStreak() {
  const data = await chrome.storage.local.get("catchStreak");
  const streak = (data.catchStreak || 0) + 1;
  await chrome.storage.local.set({ catchStreak: streak });
  return streak;
}

// ── Keyboard shortcut ─────────────────────────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "catch-it") return;
  const data = await chrome.storage.local.get("fasterCatchIt");
  if (!data.fasterCatchIt) return; // must be enabled in settings

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const SUPPORTED = ["target.com","walmart.com","bestbuy.com","amazon.com"];
  if (!SUPPORTED.some(s => (tab.url || "").includes(s))) return;

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
  } catch {}
  await delay(300);

  chrome.tabs.sendMessage(tab.id, { type: "KEYBOARD_CATCH" }, () => { void chrome.runtime.lastError; });
});

// ── Message handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SNIPER_HIT") {
    notify("hit", "🎯 Pokébot — In Stock!", `${msg.title || "Item"} at ${msg.price || "MSRP"} on ${msg.site || "retailer"}`);
    setBadge("!", "#FFD700");
    chrome.storage.local.set({
      sniperLastHit: { title: msg.title, price: msg.price, site: msg.site, ts: Date.now() },
      sniperActive: false,
    });
    // Log notification history
    logNotification({ type: "sniper", title: msg.title, price: msg.price, site: msg.site });
  }
  if (msg.type === "SNIPER_STARTED") { chrome.storage.local.set({ sniperActive: true }); setBadge("👁", "#CC0000"); }
  if (msg.type === "SNIPER_STOPPED") {
    chrome.storage.local.get("sniperLastHit").then(d => {
      if (!d.sniperLastHit || Date.now() - d.sniperLastHit.ts > 60000) setBadge("", null);
    });
    chrome.storage.local.set({ sniperActive: false });
  }
  if (msg.type === "SNIPER_ERROR")    { setBadge("✕", "#888"); chrome.storage.local.set({ sniperActive: false }); }
  if (msg.type === "MULTISNIPER_START") { startMultiSniper(); }
  if (msg.type === "MULTISNIPER_STOP")  { stopMultiSniper(); }
  if (msg.type === "PRICE_DROP") {
    notify("price", "📉 Price Drop!", `${msg.title || "Item"}: ${msg.prevPrice} → ${msg.price}`);
    logNotification({ type: "price_drop", title: msg.title, price: msg.price, prevPrice: msg.prevPrice, site: msg.site });
  }
  if (msg.type === "RESTOCK_EVENT") {
    if (msg.inStock) {
      notify("restock", "📦 Back In Stock!", `${msg.title || "Item"} is available on ${msg.site}`);
      logNotification({ type: "restock", title: msg.title, price: msg.price, site: msg.site });
    }
  }
  if (msg.type === "CART_ITEM_DROPPED") {
    notify("cart", "⚠️ Cart Item Dropped!", `${msg.title || "Item"} was removed from your cart`);
    logNotification({ type: "cart_dropped", title: msg.title, site: msg.site });
  }
  if (msg.type === "KEYBOARD_CATCH_RESULT") {
    if (msg.ok) { incrementStreak(); chrome.runtime.sendMessage({ type: "STREAK_UPDATED" }, () => { void chrome.runtime.lastError; }); }
  }
  if (msg.type === "INCREMENT_STREAK") {
    incrementStreak().then(streak => {
      sendResponse({ streak });
      chrome.runtime.sendMessage({ type: "STREAK_UPDATED", streak }, () => { void chrome.runtime.lastError; });
    });
    return true;
  }
});

// ── Notification history log ──────────────────────────────────────────────────
async function logNotification(entry) {
  try {
    const data = await chrome.storage.local.get("notificationHistory");
    const log = data.notificationHistory || [];
    log.unshift({ ...entry, ts: Date.now() });
    await chrome.storage.local.set({ notificationHistory: log.slice(0, 50) });
    chrome.runtime.sendMessage({ type: "NOTIFICATION_LOG_UPDATED" }, () => { void chrome.runtime.lastError; });
  } catch {}
}

// ── Multi-URL Sniper ──────────────────────────────────────────────────────────
const MULTI_POLL_MS = 10000;
let multiSniperTimer = null, multiRunning = false;

async function startMultiSniper() {
  if (multiSniperTimer) return;
  await pollMultiUrls();
  multiSniperTimer = setInterval(pollMultiUrls, MULTI_POLL_MS);
  setBadge("👁", "#CC0000");
}

function stopMultiSniper() {
  if (multiSniperTimer) { clearInterval(multiSniperTimer); multiSniperTimer = null; }
  chrome.storage.local.get("sniperActive").then(d => { if (!d.sniperActive) setBadge("", null); });
}

async function pollMultiUrls() {
  if (multiRunning) return;
  multiRunning = true;
  try {
    const data = await chrome.storage.local.get(["multiSniperUrls","multiSniperAutoBuy","multiSniperActive"]);
    if (!data.multiSniperActive || !data.multiSniperUrls?.length) { stopMultiSniper(); return; }
    for (const entry of data.multiSniperUrls) {
      if (!entry?.url) continue;
      await checkMultiUrl(entry, data.multiSniperAutoBuy === true);
    }
  } catch (e) { console.error("Pokébot multi-sniper:", e); } finally { multiRunning = false; }
}

async function checkMultiUrl(entry, autoBuy) {
  let tab;
  try {
    tab = await chrome.tabs.create({ url: entry.url, active: false });
    await waitForTabComplete(tab.id, 20000);
    await delay(1500);
    try { await chrome.scripting.executeScript({ target:{ tabId: tab.id }, files: ["content.js"] }); } catch {}
    await delay(500);

    const result = await new Promise(resolve => {
      let settled = false;
      const t = setTimeout(() => { if (!settled) { settled = true; resolve(null); } }, 6000);
      chrome.tabs.sendMessage(tab.id, { type: "SILENT_CHECK" }, resp => {
        if (settled) return; settled = true; clearTimeout(t); void chrome.runtime.lastError; resolve(resp || null);
      });
    });

    if (!result?.inStock) return;
    const msrp = getMsrpForTitle(result.title || "");
    const atMsrp = msrp == null || result.priceNum == null || result.priceNum <= msrp * 1.05;

    // Price drop check (even if not at MSRP)
    const priceKey = "lastPrice_" + entry.url.slice(-40);
    const pData = await chrome.storage.local.get(priceKey);
    const lastPrice = pData[priceKey];
    if (lastPrice && result.priceNum && result.priceNum < lastPrice * (1 - (entry.priceDrop || 0.05))) {
      notify("price-drop", "📉 Price Drop!", `${result.title || entry.label}: $${lastPrice.toFixed(2)} → ${result.price}`);
      logNotification({ type: "price_drop", title: result.title, price: result.price, site: result.site });
    }
    if (result.priceNum) await chrome.storage.local.set({ [priceKey]: result.priceNum });

    if (!atMsrp) return;

    // Hit!
    const hitInfo = { title: result.title, price: result.price, site: result.site, url: entry.url, label: entry.label };
    notify("multi-hit", "🎯 Pokébot Multi-Sniper Hit!", `${result.title || entry.label || "Item"} in stock at ${result.price || "MSRP"}`);
    logNotification({ type: "multi_sniper", ...hitInfo });
    setBadge("!", "#FFD700");

    const hits = (await chrome.storage.local.get("multiSniperHits")).multiSniperHits || [];
    hits.unshift({ ...hitInfo, ts: Date.now() });
    await chrome.storage.local.set({ multiSniperHits: hits.slice(0, 20) });

    if (autoBuy) {
      const prefs = await chrome.storage.local.get(["doCheckout","doPlaceOrder","dismissPopup","goToCart","soundEnabled"]);
      await chrome.tabs.update(tab.id, { active: true });
      await delay(300);
      chrome.tabs.sendMessage(tab.id, {
        type: "QUICK_ADD",
        options: {
          dismissPopup: prefs.dismissPopup ?? true, goToCart: prefs.goToCart ?? true,
          doCheckout: prefs.doCheckout ?? false, doPlaceOrder: prefs.doPlaceOrder ?? false,
          budgetLimit: entry.budgetLimit ?? null, priceNum: result.priceNum,
        },
      }, () => { void chrome.runtime.lastError; });
      const streak = await incrementStreak();
      chrome.runtime.sendMessage({ type: "STREAK_UPDATED", streak }, () => { void chrome.runtime.lastError; });
      tab = null; // don't close — let checkout proceed
    }

    chrome.runtime.sendMessage({ type: "MULTISNIPER_HIT", ...hitInfo }, () => { void chrome.runtime.lastError; });
  } catch {} finally {
    if (tab) { try { await chrome.tabs.remove(tab.id); } catch {} }
  }
}

// ── MSRP lookup ───────────────────────────────────────────────────────────────
const MSRP_BG = [
  { keys:["booster display box","booster box","36 pack","36-pack"],      msrp:161.64 },
  { keys:["ultra premium collection","ultra-premium collection"],         msrp:119.99 },
  { keys:["pokemon center elite trainer","pokémon center elite trainer"], msrp:59.99  },
  { keys:["elite trainer box","etb"],                                     msrp:59.99  },
  { keys:["special collection","premium collection","collection box"],     msrp:39.99  },
  { keys:["booster bundle"],                                              msrp:26.94  },
  { keys:["collection tin","collector tin"],                              msrp:26.94  },
  { keys:["blister","3-pack blister","3 pack blister"],                  msrp:13.99  },
  { keys:["build & battle","build and battle"],                           msrp:21.99  },
  { keys:["battle deck","theme deck","ex battle deck"],                   msrp:14.99  },
  { keys:["mini tin"],                                                    msrp:9.99   },
  { keys:["tin"],                                                         msrp:26.94  },
  { keys:["booster pack"],                                                msrp:4.49   },
];
const getMsrpForTitle = t => {
  const lower = (t || "").toLowerCase();
  return MSRP_BG.find(e => e.keys.some(k => lower.includes(k)))?.msrp ?? null;
};

// ── Scheduled alarms ──────────────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith("pokebot-sched-")) return;
  const schedId = alarm.name.replace("pokebot-sched-", "");

  const data = await chrome.storage.local.get("schedules");
  const schedules = data.schedules || {};
  const sched = schedules[schedId];
  if (!sched || !sched.active) return;

  schedules[schedId] = { ...sched, active: false, fired: true };
  await chrome.storage.local.set({ schedules });

  let tabId = sched.tabId, tabExists = false;
  if (tabId) { try { await chrome.tabs.get(tabId); tabExists = true; } catch {} }
  if (tabExists) { try { await chrome.tabs.reload(tabId, { bypassCache: true }); } catch { tabExists = false; } }
  if (!tabExists && sched.url) {
    try { const t = await chrome.tabs.create({ url: sched.url, active: true }); tabId = t.id; schedules[schedId] = { ...schedules[schedId], tabId }; await chrome.storage.local.set({ schedules }); } catch { return; }
  }

  await waitForTabComplete(tabId, 25000);
  await delay(1500);
  try { await chrome.scripting.executeScript({ target:{ tabId }, files:["content.js"] }); } catch {}
  await delay(500);

  try {
    chrome.tabs.sendMessage(tabId, {
      type: "SCHEDULED_FIRE",
      options: {
        dismissPopup: sched.dismissPopup ?? true, goToCart: sched.goToCart ?? true,
        doCheckout: sched.doCheckout ?? false, doPlaceOrder: sched.doPlaceOrder ?? false,
        budgetLimit: sched.budgetLimit ?? null, priceNum: sched.priceNum ?? null,
      },
    }, () => { void chrome.runtime.lastError; });
  } catch {}

  const streak = await incrementStreak();
  chrome.runtime.sendMessage({ type: "SCHEDULE_FIRED", schedId, streak }, () => { void chrome.runtime.lastError; });
  notify("sched", "⚡ Pokébot Schedule Fired!", sched.label || "Scheduled purchase started");
  logNotification({ type: "scheduled", title: sched.label, url: sched.url });
});

chrome.runtime.onStartup.addListener(async () => {
  const data = await chrome.storage.local.get("multiSniperActive");
  if (data.multiSniperActive) startMultiSniper();
});

function waitForTabComplete(tabId, timeout = 25000) {
  return new Promise(resolve => {
    let settled = false;
    const done = () => { if (settled) return; settled = true; chrome.tabs.onUpdated.removeListener(listener); resolve(); };
    chrome.tabs.get(tabId, tab => { if (chrome.runtime.lastError) return done(); if (tab?.status === "complete") return done(); });
    function listener(id, info) { if (id === tabId && info.status === "complete") done(); }
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(done, timeout);
  });
}
