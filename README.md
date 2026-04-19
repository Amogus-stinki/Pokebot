🎯 Pokébot

Automate Pokémon TCG purchases on Target, Walmart, Best Buy, and Amazon.
Add to cart → checkout → place order in seconds. Built for drops that sell out fast.


Features
FeatureDescription⚡ One-click checkoutAdd to cart, close popup, go to checkout, save & continue, place order — all automated🎯 Stock SniperWatches the current page every 2.5s and fires the moment it hits MSRP🌐 Multi-URL SniperWatch up to 20 product URLs across all supported sites, checked every 10 seconds⏰ Multi-ScheduleSet multiple timed auto-fires, each with its own URL, label, and settings💰 Budget GuardDisables buying if the price exceeds your limit🔍 Deal FinderShows Great Deal / At MSRP / Overpriced based on real Pokémon Center MSRP data📈 Price HistoryTracks and charts price changes over time⛔ Panic StopKills all snipers and timers instantly🌙 Dark / Light modePokédex-themed UI with toggle
Supported stores: Target
Unsupported stores: Walmart · Best Buy · Amazon

Installation
Option A — Download ZIP (easiest)

Download the ZIP File, unpack it, and go to web browser of your choice. Then you go to the extensions tab.
From here, turn on developer mode, after that you should see a button that says "Load Unpacked". Click it and select the poke-extension folder. 

⚠️ Make sure you select the one that holds all the JSON's and scripts.

After that your ready to go, but to activate it, you need to go to the Offical Target Website. 
Then click a pokemon product of your choosing. This extension is specifically for pokemon ETB's and Booster packs incase of any drops.

Keeping it updated
If you installed via Git:
bashcd pokebot-extension
git pull
Then go to chrome://extensions and click the ↻ Refresh button on the Pokébot card.
If you installed via ZIP, download the new zip from Releases and repeat the Load unpacked steps — Chrome will update in place.

How to use
⚡ Cart Tab — buy something right now

Navigate to a product page on Target, Walmart, Best Buy, or Amazon
Open Pokébot from the toolbar
Toggle the steps you want automated:

Dismiss popup — closes the "added to cart" drawer
Go to checkout — jumps straight to the checkout page
Save & continue — confirms your saved shipping address
Place order — clicks the final Place Order button


Click ⚡ CATCH IT


⚠️ Place Order requires a saved shipping address and payment method on your account. Pokébot cannot enter new payment details.


🔍 Pokémon Tab — deal finder + sniper
Open the 🔍 Pokémon tab while on any supported product page to see:

Deal card — instant verdict (Great Deal ✓, At MSRP, Overpriced, Scalper Price ✕) based on Pokémon Center MSRP data
Price history chart — see if the price is trending up or down
Stock status — In Stock / Out of Stock live indicator

Stock Sniper (current page)

Open the Pokémon tab on a product page
Toggle Stock Sniper on
Optionally toggle Auto-Buy — if off, you get a notification and the buy button flashes gold; if on, Pokébot buys automatically
Pokébot polls every 2.5 seconds — fast enough to catch reload waves (when stock flickers in and out quickly)

Multi-URL Sniper (watch multiple pages)

In the Pokémon tab, scroll down to Multi-URL Sniper
Paste a product URL and click + Add (repeat for up to 20 URLs from any supported site)
Toggle Multi-URL Sniper on
Pokébot opens each URL silently in the background every 10 seconds and fires when any of them hit MSRP


The Multi-URL Sniper uses Auto-Buy from the same toggle above — enable it before turning on the multi-sniper if you want automatic purchases.


⏰ Schedule Tab — set a future drop time

Open the ⏰ Schedule tab
Fill in:

URL — paste a product URL, or leave blank to use the current page
Label — a name to identify this schedule (optional)
Date + Time + Timezone — when to fire


Click ADD SCHEDULE
The schedule appears in the list with a live countdown

You can add multiple schedules — each fires independently. Cancel or remove any of them at any time.

💰 Budget Tab — set a price limit

Open the 💰 Budget tab
Enter a maximum price (e.g. 59.99) and click SAVE BUDGET
The ⚡ CATCH IT button will disable itself if the current product is over your limit
For scheduled and sniper runs: Pokébot still adds to cart, but stops before checkout if over budget


⛔ Panic Stop
If anything goes wrong or you change your mind — hit the red ⛔ PANIC STOP button in the Pokémon tab. It immediately kills all snipers, timers, and background checks.

Supported MSRP prices
Prices sourced from pokemoncenter.com — updated April 2026.
ProductMSRPBooster Box (36 packs)$161.64Ultra Premium Collection$119.99Elite Trainer Box (ETB)$59.99Special / Premium Collection$39.99Booster Bundle (6 packs)$26.94Collector's Tin$26.94Build & Battle Box$21.993-Pack Blister$13.99Battle / Theme Deck$14.99Mini Tin (2 packs)$9.99Booster Pack (single)$4.49

Permissions explained
Pokébot requests these Chrome permissions:
PermissionWhy it's neededactiveTabRead the current product page to detect title, price, and stockscriptingInject the content script that clicks buttons on the pagestorageSave your settings, budget, schedules, and price historytabsOpen background tabs for Multi-URL Sniper checksalarmsFire scheduled purchases at the exact time you setnotificationsShow a desktop alert when a sniper hits
Pokébot does not collect or transmit any personal data. Everything stays local in your browser.

Troubleshooting
Pokébot doesn't detect the product
Make sure you're on the actual product detail page (the URL should contain /p/ on Target, /ip/ on Walmart, etc.), not a search or category page.
"Add to Cart button not found" error
The page may still be loading. Refresh the page, wait a moment, then try again. This can also happen if the item is sold out and the button isn't present.
Place Order doesn't fire
Make sure your Target/Walmart/Best Buy/Amazon account has a saved default shipping address and payment method. Pokébot cannot fill in new payment details.
Multi-URL Sniper isn't triggering
Check that the URLs are from supported sites (Target, Walmart, Best Buy, Amazon). Each check opens a background tab — if Chrome is throttling background tabs, results may be slower.
Schedule didn't fire
Chrome must be running at the scheduled time. If Chrome is closed, the alarm won't fire. Keep a browser window open when you're expecting a drop.

Files
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

Disclaimer
Pokébot is a personal automation tool for your own purchases. Use it responsibly and in accordance with each retailer's terms of service. The authors are not responsible for missed purchases, accidental orders, or account restrictions.

Built for Pokémon TCG collectors who are tired of missing drops. 🎴
