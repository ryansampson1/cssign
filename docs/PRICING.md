# Price engine

Every customer price is calculated from cost. Nobody types a price.

```
direct cost = materials + labor minutes × loaded labor rate
price       = round_up( direct cost × (1 + overhead) ÷ (1 − target margin), round-to )
```

The owner edits these inputs in **Price book**:

- **Material costs.** Update these from vendor invoices: ACM and MDO sheets, vinyl, laminate, ink, banner, posts, paint, hardware, truck cost per mile.
- **Labor.** Loaded rate, defaulting to $38/hr on a $30 wage plus payroll tax, workers' comp, and PTO. Each product also carries its labor minutes.
- **Overhead** as a % of direct cost, plus ACM waste on custom sizes and the round-to increment.
- **Target margin** by category: panels, posts, banners, install, removal.
- **Install zones.** Each zone has a mileage cap, billed miles, and on-site minutes. Drive time is charged at the route-share % of a round trip, because installs are batched into routes.
- **Policies:** deposit %, rush %, sales tax, included proof rounds, extra-round fee, and how long a quote holds.

Prices recalculate as soon as an input changes. Orders already quoted keep the price on their quote. Every change is written to the activity log.

## Defaults and the resulting standard price

A 4×8 ACM double-sided panel with a post package, installed in Zone 1, comes to **$530 panel + $175 posts + $165 install = $870 before tax**. That is a 59% blended gross margin on loaded cost.

## Account tiers (earned automatically, no staff overrides)

| Tier | Rule | Benefit |
|---|---|---|
| Standard | default | — |
| Program | 6+ orders, trailing 12 months | free removal |
| Builder | $50k+ billed, trailing 12 months | free removal, 7.5% off panels and posts |

## Bootstrap

To grant yourself the owner role the first time, run this in Cloud Shell:
```
node -e "const a=require('firebase-admin');a.initializeApp({projectId:'YOUR-PROJECT'});a.auth().getUserByEmail('you@domain.com').then(u=>a.auth().setCustomUserClaims(u.uid,{role:'owner'})).then(()=>console.log('done'))"
```
