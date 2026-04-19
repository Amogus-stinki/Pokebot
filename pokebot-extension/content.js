// Pokébot content.js — Target · Walmart · Best Buy · Amazon
// F1 Stock Sniper + Reload Wave | F3 Retry | F4 Price Tracking
// F11 Panic Cancel | F14 TCG Detection | Phase A/B checkout

(function () {
  "use strict";

  if (window.__pokebotLoaded) return;
  window.__pokebotLoaded = true;

  // ── Site detection ────────────────────────────────────────────────────────
  const host = window.location.hostname;
  const SITE =
    host.includes("target.com")  ? "target"  :
    host.includes("walmart.com") ? "walmart" :
    host.includes("bestbuy.com") ? "bestbuy" :
    host.includes("amazon.com")  ? "amazon"  : null;

  // ── Per-site selectors ────────────────────────────────────────────────────
  const SITE_SEL = {
    target: {
      title:    '[data-test="product-title"]',
      price:    '[data-test="product-price"]',
      addToCart:['[data-test="shippingButton"]','[data-test="addToCartButton"]'],
      outOfStock:'[data-test="outOfStockButton"]',
      closeModal:'button[aria-label="close"]',
      checkoutUrl:"https://www.target.com/checkout",
      saveAndContinue:['[data-test="primary-save-button"][aria-label*="save" i]','[data-test="primary-save-button"]'],
      placeOrder:['[data-test="placeOrderButton"]'],
      isCheckout:() => location.href.includes("target.com/checkout"),
    },
    walmart: {
      title:    'h1[itemprop="name"],[data-automation-id="product-title"],h1[class*="heading"]',
      price:    '[data-seo-id="hero-price"],[itemprop="price"],[data-automation-id="buybox-price"]',
      addToCart:[
        'button[data-dca-name="ItemBuyBoxAddToCartButton"]',
        'button[data-automation-id="add-to-cart"]',
        '[data-tl-id="ProductPrimaryCTA-cta_add_to_cart_button"]',
      ],
      outOfStock:'[class*="out-of-stock-msg"],[data-automation-id*="out-of-stock"]',
      closeModal:'button[aria-label*="close" i][class*="modal"],[data-automation-id="modal-close-button"]',
      checkoutUrl:"https://www.walmart.com/checkout",
      saveAndContinue:['button[data-automation-id="shipping-continue-btn"]','button[class*="continue"][type="button"]'],
      placeOrder:['button[data-automation-id="place-order-btn"]','button[class*="place-order"]'],
      isCheckout:() => location.href.includes("walmart.com/checkout"),
    },
    bestbuy: {
      title:    '.sku-title h1,h1.heading-5.v-fw-regular',
      price:    '.priceView-customer-price span[aria-hidden="false"],.priceView-hero-price span:first-child',
      addToCart:['button.add-to-cart-button:not(.btn-disabled)','.fulfillment-add-to-cart-button:not(.btn-disabled)'],
      outOfStock:'.add-to-cart-button.btn-disabled,.fulfillment-add-to-cart-button.btn-disabled',
      closeModal:'button[aria-label="Close"],.c-close-icon',
      checkoutUrl:"https://www.bestbuy.com/checkout/r/fast-track",
      saveAndContinue:['button[data-track="Continue to Delivery"]','.btn-primary.btn-lg[type="submit"]'],
      placeOrder:['button[data-track="Place Order"]','.place-order-button'],
      isCheckout:() => location.href.includes("bestbuy.com/checkout"),
    },
    amazon: {
      // Amazon product page — stable selectors (2025/2026)
      title:    '#productTitle,#title',
      price:    '.a-price .a-offscreen,.a-price[data-a-size="xl"] .a-offscreen,#priceblock_ourprice,#priceblock_saleprice',
      addToCart:['#add-to-cart-button','#buy-now-button','input#add-to-cart-button'],
      outOfStock:'#availability .a-color-price,#outOfStock',
      closeModal:'.a-popover-closebutton,button[data-action="a-popover-close"]',
      // Amazon checkout is multi-step — navigate to cart then proceed
      checkoutUrl:"https://www.amazon.com/gp/cart/view.html",
      saveAndContinue:['input[name="proceedToRetailCheckout"]','#proceed-to-checkout-action input','#sc-buy-box-ptc-button'],
      placeOrder:['input[name="placeYourOrder1"]','#submitOrderButtonId input','#placeYourOrder'],
      isCheckout:() => location.href.includes("amazon.com/gp/buy") || location.href.includes("amazon.com/checkout"),
    },
  };

  const SEL = SITE_SEL[SITE] || SITE_SEL.target;

  // ── TCG detection (F14) ───────────────────────────────────────────────────
  const TCG_KW = [
    "pokémon","pokemon","pikachu","charizard","mewtwo","eevee","gengar",
    "booster box","booster pack","booster bundle","booster display",
    "elite trainer box","etb","ultra premium collection","upc",
    "special collection","premium collection","collection box",
    "build & battle","build and battle","battle deck","theme deck",
    "tin","blister","mini tin","collector tin",
    "scarlet","violet","obsidian flames","paradox rift","paldea","151",
    "crown zenith","silver tempest","lost origin","astral radiance",
    "fusion strike","evolving skies","chilling reign","battle styles",
    "shining fates","vivid voltage","darkness ablaze","rebel clash",
    "prismatic evolutions","surging sparks","stellar crown",
    "twilight masquerade","temporal forces","paldean fates",
    "destined rivals","journey together","black bolt","white flare","mega evolution",
    "tcg","trading card game","pokemon center","pokémon center",
  ];
  const isTcg = t => TCG_KW.some(k => (t || "").toLowerCase().includes(k));

  // ── MSRP table ────────────────────────────────────────────────────────────
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
  const getMsrp = t => {
    const lower = (t || "").toLowerCase();
    return MSRP_TABLE.find(e => e.keys.some(k => lower.includes(k)))?.msrp ?? null;
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function parsePrice(text) {
    if (!text) return null;
    const s = text.replace(/[^0-9.,]/g, "");
    const cleaned = s.replace(/,(?=\d{3}(?:[.,]|$))/g, "");
    const m = cleaned.match(/\d+\.?\d*/);
    if (!m) return null;
    const n = parseFloat(m[0]);
    return isNaN(n) ? null : n;
  }

  function waitFor(selectors, timeout = 12000) {
    const list = Array.isArray(selectors) ? selectors : [selectors];
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (val, err) => {
        if (settled) return; settled = true;
        ob.disconnect(); clearTimeout(timer);
        err ? reject(err) : resolve(val);
      };
      const check = () => {
        for (const s of list) {
          try {
            const el = document.querySelector(s);
            if (!el) continue;
            if (el.tagName === "BUTTON" && (el.disabled || el.classList.contains("btn-disabled"))) continue;
            if (el.tagName === "INPUT" && el.disabled) continue;
            return el;
          } catch {}
        }
        return null;
      };
      const f = check();
      if (f) return resolve(f);
      const ob = new MutationObserver(() => { const f2 = check(); if (f2) done(f2); });
      ob.observe(document.body, { childList: true, subtree: true });
      const timer = setTimeout(() => done(null, new Error("Timeout: " + list[0])), timeout);
    });
  }

  async function withRetry(fn, attempts = 3, baseMs = 1000) {
    let last;
    for (let i = 0; i < attempts; i++) {
      try { return await fn(); } catch (e) { last = e; if (i < attempts - 1) await sleep(baseMs * (i + 1)); }
    }
    throw last;
  }

  function sendMsg(type, payload = {}) {
    try { chrome.runtime.sendMessage({ type, ...payload }, () => { void chrome.runtime.lastError; }); } catch {}
  }
  const sendProgress = (step, status, message) => sendMsg("PROGRESS", { step, status, message });

  // ── DOM scrapers ──────────────────────────────────────────────────────────
  function findAddToCartBtn() {
    for (const s of SEL.addToCart) {
      try {
        const el = document.querySelector(s);
        if (!el) continue;
        if ((el.tagName === "BUTTON" || el.tagName === "INPUT") && el.disabled) continue;
        if (el.classList.contains("btn-disabled")) continue;
        return el;
      } catch {}
    }
    return Array.from(document.querySelectorAll("button,input[type='submit']")).find(b =>
      /^add to cart$/i.test((b.textContent || b.value || "").trim()) && !b.disabled
    ) || null;
  }

  function getTitle() {
    for (const s of (SEL.title || "").split(",").map(x => x.trim())) {
      try {
        const el = document.querySelector(s);
        if (el) { const t = el.textContent.trim(); if (t) return t; }
      } catch {}
    }
    if (SITE === "walmart") {
      try {
        const nd = document.getElementById("__NEXT_DATA__");
        if (nd) {
          const data = JSON.parse(nd.textContent);
          const item = data?.props?.pageProps?.initialData?.data?.product?.item;
          const t = item?.name || item?.shortDescription;
          if (t) return t;
        }
      } catch {}
    }
    return document.title || null;
  }

  function getPrice() {
    for (const s of (SEL.price || "").split(",").map(x => x.trim())) {
      try {
        const el = document.querySelector(s);
        if (el) { const t = el.textContent.trim(); if (t && t.match(/\d/)) return t; }
      } catch {}
    }
    if (SITE === "walmart") {
      try {
        const nd = document.getElementById("__NEXT_DATA__");
        if (nd) {
          const data = JSON.parse(nd.textContent);
          const pi = data?.props?.pageProps?.initialData?.data?.product?.priceInfo;
          const p = pi?.currentPrice?.price ?? pi?.wasPrice?.price;
          if (p != null) return `$${p}`;
        }
      } catch {}
    }
    return null;
  }

  function isInStock() {
    if (findAddToCartBtn()) return true;
    // Amazon: check availability text
    if (SITE === "amazon") {
      const avail = document.querySelector("#availability");
      if (avail) {
        const text = avail.textContent.toLowerCase();
        if (/in stock/i.test(text)) return true;
        if (/out of stock|unavailable|currently unavailable/i.test(text)) return false;
      }
    }
    if (document.querySelector(SEL.outOfStock)) return false;
    return null;
  }

  function scrapeProduct() {
    const title    = getTitle();
    const priceStr = getPrice();
    const priceNum = parsePrice(priceStr);
    return {
      isProductPage: !!(findAddToCartBtn()) || isTcg(title),
      isTcg:    isTcg(title),
      title,
      price:    priceStr,
      priceNum,
      msrp:     getMsrp(title),
      inStock:  isInStock(),
      site:     SITE,
      url:      location.href,
    };
  }

  // ── Price tracking (F4) ───────────────────────────────────────────────────
  async function recordPrice(title, priceNum) {
    if (!title || !priceNum || priceNum <= 0) return;
    const pKey = title.slice(0, 60).replace(/\W+/g, "_");
    try {
      const data = await chrome.storage.local.get("priceHistory");
      const history = data.priceHistory || {};
      if (!history[pKey]) history[pKey] = [];
      history[pKey].push({ price: priceNum, ts: Date.now(), site: SITE });
      if (history[pKey].length > 50) history[pKey] = history[pKey].slice(-50);
      await chrome.storage.local.set({ priceHistory: history });
    } catch {}
  }

  // ── Phase A: add to cart → navigate to checkout ───────────────────────────
  async function quickCartAdd(options = {}) {
    const {
      dismissPopup = true, goToCart = true,
      doCheckout   = false, doPlaceOrder = false,
      budgetLimit  = null, priceNum = null,
    } = options;

    const overBudget = budgetLimit != null && priceNum != null && priceNum > budgetLimit;

    // Step 1 — Add to cart (F3 retry)
    sendProgress(1, "active", "Clicking Add to Cart…");
    let addBtn;
    try {
      addBtn = await withRetry(() => {
        const b = findAddToCartBtn();
        if (!b) throw new Error("No button");
        return b;
      }, 3, 800);
    } catch {
      sendProgress(1, "error", "Add to Cart button not found");
      return { ok: false, error: "Add to Cart button not found" };
    }
    addBtn.click();
    sendProgress(1, "done", "Added to cart ✓");

    // Record price (F4)
    const priceNow = parsePrice(getPrice());
    if (priceNow) recordPrice(getTitle(), priceNow);

    // Step 2 — close modal
    if (dismissPopup) {
      sendProgress(2, "active", "Closing popup…");
      try {
        const close = await waitFor(SEL.closeModal, 7000);
        await sleep(250);
        close.click();
        sendProgress(2, "done", "Popup closed ✓");
      } catch { sendProgress(2, "done", "No popup — skipped"); }
    } else {
      sendProgress(2, "skipped", "Skipped");
    }

    // Budget gate
    if (overBudget) {
      sendProgress(3, "skipped", "Over budget — stopped");
      sendProgress(4, "skipped", "Skipped");
      sendProgress(5, "skipped", "Skipped");
      return { ok: true, stoppedForBudget: true };
    }

    // Step 3 — navigate to checkout
    if (goToCart) {
      sendProgress(3, "active", "Heading to checkout…");
      await chrome.storage.local.set({
        pokebotPending: { doCheckout, doPlaceOrder, site: SITE, ts: Date.now() },
      });
      await sleep(150);
      sendProgress(3, "done", "Navigating…");
      window.location.href = SEL.checkoutUrl;
    } else {
      sendProgress(3, "skipped", "Cart nav skipped");
      sendProgress(4, "skipped", "Skipped");
      sendProgress(5, "skipped", "Skipped");
    }
    return { ok: true };
  }

  // ── Phase B: checkout page ────────────────────────────────────────────────
  async function checkoutPhase() {
    const data = await chrome.storage.local.get("pokebotPending");
    const pending = data.pokebotPending;
    if (!pending || Date.now() - pending.ts > 180000) return;
    if (pending.site && pending.site !== SITE) return;
    await chrome.storage.local.remove("pokebotPending");

    if (pending.doCheckout) {
      sendProgress(4, "active", "Clicking Save & Continue…");
      try {
        await withRetry(async () => {
          const btn = await waitFor(SEL.saveAndContinue, 12000);
          await sleep(400); btn.click();
        }, 2, 1000);
        sendProgress(4, "done", "Save & Continue clicked ✓");
        await sleep(2500);
      } catch { sendProgress(4, "done", "Shipping already saved"); }
    } else { sendProgress(4, "skipped", "Skipped"); }

    if (pending.doPlaceOrder) {
      sendProgress(5, "active", "Placing order…");
      try {
        await withRetry(async () => {
          const btn = await waitFor(SEL.placeOrder, 15000);
          await sleep(400); btn.click();
        }, 2, 1000);
        sendProgress(5, "done", "Order placed! 🎉");
      } catch { sendProgress(5, "error", "Place order button not found"); }
    } else { sendProgress(5, "skipped", "Skipped"); }
  }

  if (SEL.isCheckout()) setTimeout(() => checkoutPhase(), 2000);

  // ── Sniper + Reload Wave (F1) ─────────────────────────────────────────────
  const SNIPER_MS    = 2500;
  const WAVE_COOL_MS = 4000;
  const MAX_WAVE_BUYS = 5;

  let sniperTimer   = null;
  let sniperActive  = false;
  let sniperAutoBuy = false;
  let waveBuyCount  = 0;
  let lastBuyTs     = 0;
  let retryFails    = 0;
  let tickRunning   = false;

  async function sniperTick() {
    if (!sniperActive || tickRunning) return;
    tickRunning = true;
    try { await _doTick(); } finally { tickRunning = false; }
  }

  async function _doTick() {
    let title, priceStr, price, inStock;
    try {
      title    = getTitle() || "";
      priceStr = getPrice() || "";
      price    = parsePrice(priceStr);
      inStock  = isInStock();
      retryFails = 0;
    } catch {
      if (++retryFails >= 4) { sendMsg("SNIPER_ERROR", { error:"Scan failed repeatedly" }); stopSniper(); }
      return;
    }

    if (!inStock) return;

    const msrp   = getMsrp(title);
    const atMsrp = msrp == null || price == null || price <= msrp * 1.05;
    if (!atMsrp) return;

    const now = Date.now();
    if (sniperAutoBuy && (now - lastBuyTs) < WAVE_COOL_MS) return;
    if (sniperAutoBuy && waveBuyCount >= MAX_WAVE_BUYS) {
      stopSniper();
      sendMsg("SNIPER_HIT", { title, price: priceStr, site: SITE, autoBuy: false, waveCap: true });
      return;
    }

    if (price) recordPrice(title, price);
    sendMsg("SNIPER_HIT", { title, price: priceStr, site: SITE, autoBuy: sniperAutoBuy, url: location.href });

    if (sniperAutoBuy) {
      waveBuyCount++;
      lastBuyTs = now;
      if (sniperTimer) { clearInterval(sniperTimer); sniperTimer = null; }
      try {
        const stored = await chrome.storage.local.get(["doCheckout","doPlaceOrder","dismissPopup","goToCart"]);
        await quickCartAdd({
          dismissPopup: stored.dismissPopup ?? true,
          goToCart:     stored.goToCart     ?? true,
          doCheckout:   stored.doCheckout   ?? false,
          doPlaceOrder: stored.doPlaceOrder ?? false,
          budgetLimit:  null, priceNum: price,
        });
        if (sniperActive && !stored.goToCart) sniperTimer = setInterval(sniperTick, SNIPER_MS);
      } catch {
        if (sniperActive) sniperTimer = setInterval(sniperTick, SNIPER_MS);
      }
    } else {
      _flashButton(findAddToCartBtn());
    }
  }

  function _flashButton(btn) {
    if (!btn) return;
    btn.style.outline   = "3px solid #FFD700";
    btn.style.boxShadow = "0 0 18px #FFD700bb";
    btn.scrollIntoView({ behavior: "smooth", block: "center" });
    let on = true;
    const pulse = setInterval(() => {
      if (!btn.isConnected) { clearInterval(pulse); return; }
      btn.style.outline = on ? "3px solid #FFD700" : "3px solid #ff4500";
      on = !on;
    }, 400);
    setTimeout(() => { clearInterval(pulse); if (btn.isConnected) btn.style.outline = ""; }, 15000);
  }

  function startSniper(autoBuy = false) {
    if (sniperActive) return;
    sniperActive = true; sniperAutoBuy = autoBuy;
    waveBuyCount = 0; lastBuyTs = 0; retryFails = 0; tickRunning = false;
    sniperTick();
    sniperTimer = setInterval(sniperTick, SNIPER_MS);
  }

  function stopSniper() {
    sniperActive = false;
    if (sniperTimer) { clearInterval(sniperTimer); sniperTimer = null; }
    sendMsg("SNIPER_STOPPED");
  }

  function panicStop() {
    stopSniper();
    tickRunning = false;
  }

  // ── SCRAPE_FULL handler ───────────────────────────────────────────────────
  async function scrapeFull(sendResponse) {
    const info = scrapeProduct();
    const pKey = (info.title || "").slice(0, 60).replace(/\W+/g, "_");
    if (info.priceNum) await recordPrice(info.title, info.priceNum);
    const data    = await chrome.storage.local.get("priceHistory");
    const history = data.priceHistory?.[pKey] ?? [];
    sendResponse({ ...info, history });
  }

  // ── Message listener ──────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "GET_PRODUCT_INFO") { sendResponse(scrapeProduct()); return true; }
    if (msg.type === "QUICK_ADD") {
      quickCartAdd(msg.options).then(sendResponse).catch(e => sendResponse({ ok:false, error:e.message }));
      return true;
    }
    if (msg.type === "SCHEDULED_FIRE") {
      (async () => {
        try { await waitFor(SEL.addToCart, 15000); await sleep(800); } catch {}
        quickCartAdd(msg.options).then(sendResponse).catch(e => sendResponse({ ok:false, error:e.message }));
      })();
      return true;
    }
    if (msg.type === "START_SNIPER") { startSniper(msg.autoBuy === true); sendResponse({ ok:true }); return true; }
    if (msg.type === "STOP_SNIPER")  { stopSniper(); sendResponse({ ok:true }); return true; }
    if (msg.type === "PANIC")        { panicStop(); sendResponse({ ok:true }); return true; }
    if (msg.type === "SCRAPE_FULL")  { scrapeFull(sendResponse); return true; }
    // Background uses this to silently check a URL for multi-sniper
    if (msg.type === "SILENT_CHECK") {
      const info = scrapeProduct();
      sendResponse({ inStock: info.inStock, price: info.priceStr ?? info.price, priceNum: info.priceNum, title: info.title, site: SITE });
      return true;
    }
  });
})();
