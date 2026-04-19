# 🎯 Pokébot

> Automate Pokémon TCG purchases on Target, Walmart, Best Buy, and Amazon.  
> Add to cart → checkout → place order in seconds. Built for drops that sell out fast.

---

## Features

| Feature | Description |
|---|---|
| ⚡ **One-click checkout** | Add to cart, close popup, go to checkout, save & continue, place order — all automated |
| 🎯 **Stock Sniper** | Watches the current page every 2.5s and fires the moment it hits MSRP |
| 🌐 **Multi-URL Sniper** | Watch up to 20 product URLs across all supported sites, checked every 10 seconds |
| ⏰ **Multi-Schedule** | Set multiple timed auto-fires, each with its own URL, label, and settings |
| 💰 **Budget Guard** | Disables buying if the price exceeds your limit |
| 🔍 **Deal Finder** | Shows Great Deal / At MSRP / Overpriced based on real Pokémon Center MSRP data |
| 📈 **Price History** | Tracks and charts price changes over time |
| ⛔ **Panic Stop** | Kills all snipers and timers instantly |
| 🌙 **Dark / Light mode** | Pokédex-themed UI with toggle |

**Supported stores:** Target · Walmart · Best Buy · Amazon

---

## Installation

### Option A — Download ZIP (easiest)

1. Go to the [Releases](../../releases) page and download the latest `pokebot-extension.zip`
2. Unzip it — you'll get a folder called `pokebot-extension`
3. Skip to **[Load into Chrome](#load-into-chrome)**

---

### Option B — Clone from GitHub

You'll need [Git](https://git-scm.com/downloads) installed. Open a terminal and run:

```bash
git clone https://github.com/YOUR_USERNAME/pokebot-extension.git
```

This creates a `pokebot-extension` folder wherever you ran the command.

> **Windows users:** Right-click on your Desktop or any folder → *Open in Terminal* (or *Git Bash*), then paste the command above.

> **Mac users:** Open **Terminal** (search Spotlight for "Terminal"), then paste the command.

---

### Load into Chrome

1. Open Chrome and go to:
   ```
   chrome://extensions
   ```

2. In the top-right corner, turn on **Developer mode**

   ![Developer mode toggle in the top-right of the extensions page]

3. Click **Load unpacked**

4. In the file picker, select the `pokebot-extension` folder (the one containing `manifest.json`)

5. Pokébot will appear in your extensions list with a Pokéball icon

6. Click the **puzzle piece** icon in your Chrome toolbar, then click the **pin** next to Pokébot so it's always visible

---

### Keeping it updated

If you installed via Git:

```bash
cd pokebot-extension
git pull
```

Then go to `chrome://extensions` and click the **↻ Refresh** button on the Pokébot card.

If you installed via ZIP, download the new zip from Releases and repeat the Load unpacked steps — Chrome will update in place.

---

## How to use

### ⚡ Cart Tab — buy something right now

1. Navigate to a product page on Target, Walmart, Best Buy, or Amazon
2. Open Pokébot from the toolbar
3. Toggle the steps you want automated:
   - **Dismiss popup** — closes the "added to cart" drawer
   - **Go to checkout** — jumps straight to the checkout page
   - **Save & continue** — confirms your saved shipping address
   - **Place order** — clicks the final Place Order button
4. Click **⚡ CATCH IT**

> ⚠️ **Place Order requires** a saved shipping address and payment method on your account. Pokébot cannot enter new payment details.

---

### 🔍 Pokémon Tab — deal finder + sniper

Open the **🔍 Pokémon** tab while on any supported product page to see:

- **Deal card** — instant verdict (Great Deal ✓, At MSRP, Overpriced, Scalper Price ✕) based on Pokémon Center MSRP data
- **Price history chart** — see if the price is trending up or down
- **Stock status** — In Stock / Out of Stock live indicator

#### Stock Sniper (current page)

1. Open the Pokémon tab on a product page
2. Toggle **Stock Sniper** on
3. Optionally toggle **Auto-Buy** — if off, you get a notification and the buy button flashes gold; if on, Pokébot buys automatically
4. Pokébot polls every **2.5 seconds** — fast enough to catch reload waves (when stock flickers in and out quickly)

#### Multi-URL Sniper (watch multiple pages)

1. In the Pokémon tab, scroll down to **Multi-URL Sniper**
2. Paste a product URL and click **+ Add** (repeat for up to 20 URLs from any supported site)
3. Toggle **Multi-URL Sniper** on
4. Pokébot opens each URL silently in the background every **10 seconds** and fires when any of them hit MSRP

> The Multi-URL Sniper uses **Auto-Buy** from the same toggle above — enable it before turning on the multi-sniper if you want automatic purchases.

---

### ⏰ Schedule Tab — set a future drop time

1. Open the **⏰ Schedule** tab
2. Fill in:
   - **URL** — paste a product URL, or leave blank to use the current page
   - **Label** — a name to identify this schedule (optional)
   - **Date + Time + Timezone** — when to fire
3. Click **ADD SCHEDULE**
4. The schedule appears in the list with a live countdown

You can add **multiple schedules** — each fires independently. Cancel or remove any of them at any time.

---

### 💰 Budget Tab — set a price limit

1. Open the **💰 Budget** tab
2. Enter a maximum price (e.g. `59.99`) and click **SAVE BUDGET**
3. The **⚡ CATCH IT** button will disable itself if the current product is over your limit
4. For scheduled and sniper runs: Pokébot still adds to cart, but stops before checkout if over budget

---

### ⛔ Panic Stop

If anything goes wrong or you change your mind — hit the red **⛔ PANIC STOP** button in the Pokémon tab. It immediately kills all snipers, timers, and background checks.

---

## Supported MSRP prices

Prices sourced from [pokemoncenter.com](https://www.pokemoncenter.com) — updated April 2026.

| Product | MSRP |
|---|---|
| Booster Box (36 packs) | $161.64 |
| Ultra Premium Collection | $119.99 |
| Elite Trainer Box (ETB) | $59.99 |
| Special / Premium Collection | $39.99 |
| Booster Bundle (6 packs) | $26.94 |
| Collector's Tin | $26.94 |
| Build & Battle Box | $21.99 |
| 3-Pack Blister | $13.99 |
| Battle / Theme Deck | $14.99 |
| Mini Tin (2 packs) | $9.99 |
| Booster Pack (single) | $4.49 |

---

## Permissions explained

Pokébot requests these Chrome permissions:

| Permission | Why it's needed |
|---|---|
| `activeTab` | Read the current product page to detect title, price, and stock |
| `scripting` | Inject the content script that clicks buttons on the page |
| `storage` | Save your settings, budget, schedules, and price history |
| `tabs` | Open background tabs for Multi-URL Sniper checks |
| `alarms` | Fire scheduled purchases at the exact time you set |
| `notifications` | Show a desktop alert when a sniper hits |

Pokébot does **not** collect or transmit any personal data. Everything stays local in your browser.

---

## Troubleshooting

**Pokébot doesn't detect the product**  
Make sure you're on the actual product detail page (the URL should contain `/p/` on Target, `/ip/` on Walmart, etc.), not a search or category page.

**"Add to Cart button not found" error**  
The page may still be loading. Refresh the page, wait a moment, then try again. This can also happen if the item is sold out and the button isn't present.

**Place Order doesn't fire**  
Make sure your Target/Walmart/Best Buy/Amazon account has a saved default shipping address and payment method. Pokébot cannot fill in new payment details.

**Multi-URL Sniper isn't triggering**  
Check that the URLs are from supported sites (Target, Walmart, Best Buy, Amazon). Each check opens a background tab — if Chrome is throttling background tabs, results may be slower.

**Schedule didn't fire**  
Chrome must be running at the scheduled time. If Chrome is closed, the alarm won't fire. Keep a browser window open when you're expecting a drop.

---

## Files

```
pokebot-extension/
├── manifest.json      Extension config, permissions, site matches
├── content.js         Runs on product pages — scrapes data, drives purchases
├── background.js      Service worker — handles schedules, multi-URL sniper
├── popup.html         Extension popup UI
├── popup.js           Popup logic — all tabs, toggles, sniper UI
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Disclaimer

Pokébot is a personal automation tool for your own purchases. Use it responsibly and in accordance with each retailer's terms of service. The authors are not responsible for missed purchases, accidental orders, or account restrictions.

---

*Built for Pokémon TCG collectors who are tired of missing drops.* 🎴
