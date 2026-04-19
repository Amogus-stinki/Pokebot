// Pokébot background service worker v3
// Handles: scheduled alarms (multi), multi-URL sniper polling, notifications, badges

const delay = ms => new Promise(r => setTimeout(r, ms));

// ── Badge ─────────────────────────────────────────────────────────────────────
function setBadge(text, color) {
  chrome.action.setBadgeText({ text: text || "" });
  if (color) chrome.action.setBadgeBackgroundColor({ color });
}

// ── Notification ──────────────────────────────────────────────────────────────
function notify(id, title, message) {
  try {
    chrome.notifications.create("pokebot-" + id + "-" + Date.now(), {
      type: "basic", iconUrl: "icons/icon128.png",
      title, message, priority: 2,
    });
  } catch {}
}

// ── Message handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "SNIPER_HIT") {
    notify("hit", "🎯 Pokébot — In Stock!", `${msg.title || "Item"} at ${msg.price || "MSRP"} on ${msg.site || "retailer"}`);
    setBadge("!", "#FFD700");
    chrome.storage.local.set({ sniperLastHit: { title: msg.title, price: msg.price, site: msg.site, ts: Date.now() }, sniperActive: false });
  }
  if (msg.type === "SNIPER_STARTED") { chrome.storage.local.set({ sniperActive: true }); setBadge("👁", "#CC0000"); }
  if (msg.type === "SNIPER_STOPPED") {
    chrome.storage.local.get("sniperLastHit").then(d => {
      if (!d.sniperLastHit || Date.now() - d.sniperLastHit.ts > 60000) setBadge("", null);
    });
    chrome.storage.local.set({ sniperActive: false });
  }
  if (msg.type === "SNIPER_ERROR") { setBadge("✕", "#888"); chrome.storage.local.set({ sniperActive: false }); }
  if (msg.type === "MULTISNIPER_START") startMultiSniper();
  if (msg.type === "MULTISNIPER_STOP")  stopMultiSniper();
});

// ══════════════════════════════════════════════════════════════════════════════
// ── Multi-URL Sniper ──────────────────────────────────────────────────────────
// Polls a user-defined list of URLs by opening each in a background tab,
// injecting content.js, running SILENT_CHECK, then closing the tab.
// Interval: every 15s (background tabs are slower — can't match 2.5s in-page poll)
// ══════════════════════════════════════════════════════════════════════════════

const MULTI_POLL_MS  = 15000;
let multiSniperTimer = null;
let multiRunning     = false; // semaphore

async function startMultiSniper() {
  if (multiSniperTimer) return; // already running
  await pollMultiUrls(); // immediate first run
  multiSniperTimer = setInterval(pollMultiUrls, MULTI_POLL_MS);
  setBadge("👁", "#CC0000");
}

function stopMultiSniper() {
  if (multiSniperTimer) { clearInterval(multiSniperTimer); multiSniperTimer = null; }
  // Only clear badge if no active single-page sniper
  chrome.storage.local.get("sniperActive").then(d => {
    if (!d.sniperActive) setBadge("", null);
  });
}

async function pollMultiUrls() {
  if (multiRunning) return;
  multiRunning = true;
  try {
    const data = await chrome.storage.local.get(["multiSniperUrls","multiSniperAutoBuy","multiSniperActive"]);
    if (!data.multiSniperActive || !data.multiSniperUrls?.length) {
      stopMultiSniper();
      return;
    }

    const autoBuy = data.multiSniperAutoBuy === true;
    const urls    = data.multiSniperUrls; // array of { url, label, budgetLimit? }

    for (const entry of urls) {
      if (!entry?.url) continue;
      await checkUrl(entry, autoBuy);
    }
  } catch (e) {
    console.error("Pokébot multi-sniper error:", e);
  } finally {
    multiRunning = false;
  }
}

async function checkUrl(entry, autoBuy) {
  let tab;
  try {
    // Open URL in a background tab (not focused)
    tab = await chrome.tabs.create({ url: entry.url, active: false });
    await waitForTabComplete(tab.id, 20000);
    await delay(1500); // let React hydrate

    // Inject content script
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    } catch {}
    await delay(500);

    // Ask for a silent check
    const result = await new Promise((resolve) => {
      let settled = false;
      const t = setTimeout(() => { if (!settled) { settled = true; resolve(null); } }, 6000);
      chrome.tabs.sendMessage(tab.id, { type: "SILENT_CHECK" }, (resp) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        void chrome.runtime.lastError;
        resolve(resp || null);
      });
    });

    if (!result) return;

    const inStock = result.inStock;
    if (!inStock) return;

    // Get MSRP for this URL's product
    const msrp = getMsrpForTitle(result.title || "");
    const atMsrp = msrp == null || result.priceNum == null || result.priceNum <= msrp * 1.05;
    if (!atMsrp) return;

    // Hit!
    const hitInfo = { title: result.title, price: result.price, site: result.site, url: entry.url, label: entry.label };
    notify("multi-hit", "🎯 Pokébot — Multi-Sniper Hit!", `${result.title || entry.label || "Item"} is in stock at ${result.price || "MSRP"}`);
    setBadge("!", "#FFD700");

    // Record this hit
    const hits = (await chrome.storage.local.get("multiSniperHits")).multiSniperHits || [];
    hits.unshift({ ...hitInfo, ts: Date.now() });
    await chrome.storage.local.set({ multiSniperHits: hits.slice(0, 20) });

    if (autoBuy) {
      const prefs = await chrome.storage.local.get(["doCheckout","doPlaceOrder","dismissPopup","goToCart"]);
      // Bring tab to front and trigger purchase
      await chrome.tabs.update(tab.id, { active: true });
      await delay(300);
      chrome.tabs.sendMessage(tab.id, {
        type: "QUICK_ADD",
        options: {
          dismissPopup: prefs.dismissPopup ?? true,
          goToCart:     prefs.goToCart     ?? true,
          doCheckout:   prefs.doCheckout   ?? false,
          doPlaceOrder: prefs.doPlaceOrder ?? false,
          budgetLimit:  entry.budgetLimit  ?? null,
          priceNum:     result.priceNum,
        },
      }, () => { void chrome.runtime.lastError; });
      // Don't close tab — let purchase flow complete
      tab = null; // prevent close below
    }

    // Notify popup
    chrome.runtime.sendMessage({ type: "MULTISNIPER_HIT", ...hitInfo }, () => { void chrome.runtime.lastError; });

  } catch (e) {
    // Per-URL error — don't crash the whole poll loop
  } finally {
    // Close the background tab unless auto-buy took over
    if (tab) {
      try { await chrome.tabs.remove(tab.id); } catch {}
    }
  }
}

// ── MSRP lookup (mirrors content.js) ─────────────────────────────────────────
const MSRP_TABLE = [
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
  return MSRP_TABLE.find(e => e.keys.some(k => lower.includes(k)))?.msrp ?? null;
};

// ══════════════════════════════════════════════════════════════════════════════
// ── Scheduled alarms ─────────────────────────────────────────────────────────
// Each schedule has a unique ID. Alarm name = "pokebot-sched-{id}"
// ══════════════════════════════════════════════════════════════════════════════

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith("pokebot-sched-")) return;
  const schedId = alarm.name.replace("pokebot-sched-", "");

  const data = await chrome.storage.local.get("schedules");
  const schedules = data.schedules || {};
  const sched = schedules[schedId];
  if (!sched || !sched.active) return;

  // Mark fired
  schedules[schedId] = { ...sched, active: false, fired: true };
  await chrome.storage.local.set({ schedules });

  let tabId = sched.tabId;
  let tabExists = false;
  if (tabId) { try { await chrome.tabs.get(tabId); tabExists = true; } catch {} }

  if (tabExists) {
    try { await chrome.tabs.reload(tabId, { bypassCache: true }); } catch { tabExists = false; }
  }
  if (!tabExists && sched.url) {
    try {
      const t = await chrome.tabs.create({ url: sched.url, active: true });
      tabId = t.id;
      schedules[schedId] = { ...schedules[schedId], tabId };
      await chrome.storage.local.set({ schedules });
    } catch { return; }
  }

  await waitForTabComplete(tabId, 25000);
  await delay(1500);

  try { await chrome.scripting.executeScript({ target:{ tabId }, files:["content.js"] }); } catch {}
  await delay(500);

  try {
    chrome.tabs.sendMessage(tabId, {
      type: "SCHEDULED_FIRE",
      options: {
        dismissPopup:  sched.dismissPopup  ?? true,
        goToCart:      sched.goToCart      ?? true,
        doCheckout:    sched.doCheckout    ?? false,
        doPlaceOrder:  sched.doPlaceOrder  ?? false,
        budgetLimit:   sched.budgetLimit   ?? null,
        priceNum:      sched.priceNum      ?? null,
      },
    }, () => { void chrome.runtime.lastError; });
  } catch {}

  // Notify popup that this schedule fired
  chrome.runtime.sendMessage({ type: "SCHEDULE_FIRED", schedId }, () => { void chrome.runtime.lastError; });
  notify("sched", "⚡ Pokébot Schedule Fired!", sched.label || "Scheduled purchase started");
});

// ── Restore multi-sniper on service worker restart ────────────────────────────
chrome.runtime.onStartup.addListener(async () => {
  const data = await chrome.storage.local.get("multiSniperActive");
  if (data.multiSniperActive) startMultiSniper();
});

// ── Tab load helper ───────────────────────────────────────────────────────────
function waitForTabComplete(tabId, timeout = 25000) {
  return new Promise(resolve => {
    let settled = false;
    const done = () => {
      if (settled) return; settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    chrome.tabs.get(tabId, tab => {
      if (chrome.runtime.lastError) return done();
      if (tab?.status === "complete") return done();
    });
    function listener(id, info) { if (id === tabId && info.status === "complete") done(); }
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(done, timeout);
  });
}
