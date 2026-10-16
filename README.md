# Post & Panel

Operations platform for a commercial real estate sign company. It covers the customer portal (instant pricing, orders, proofs, payments, field signs, files) and a role-based back office (intake, design, shop, installs, inventory, receivables, accounts, price book, SOPs, automations).

## What's in the repo

| Path | What it is |
|---|---|
| `index.html` + `img/` | The whole app: website, client portal, back office. One file, no build step. |
| `firebase.json` | Hosting, Firestore, Storage, and Functions config |
| `firestore.rules` | **Staging** rules: owner account only |
| `firestore.production.rules` | Role-based rules for cutover |
| `storage.rules` | File storage rules (proofs, install photos) |
| `functions/index.js` | Stripe payment links and webhook, role assignment, AI email intake |
| `docs/PRICING.md` | How the cost-plus price engine works |

## Run it locally (sample data)

Open `index.html` in a browser. `CONFIG.backend` is `'demo'`, so it runs on fictional sample data saved in your browser. Use **View as** in the header to switch between Owner, Account manager, Designer, Shop, Installer, Bookkeeper, and Customer.

## Free preview on GitHub Pages

In the repo, open Settings → Pages. Under Build and deployment, choose Source: **Deploy from a branch**, Branch: **main**, Folder: **/ (root)**, then Save. After a minute or two the site is live at `https://<your-username>.github.io/<repo>/`. It runs in demo mode on sample data, so it's for previews only. Real customers need the Firebase setup below.

## Put it on Firebase (staging)

1. **Create the project.** At console.firebase.google.com, add a project (for example `newco-signs-staging`). Enable **Firestore** (production mode, `us-east1`), **Storage**, and **Authentication → Google** sign-in. Upgrade to the Blaze plan, which Functions require. Cost at this volume is a few dollars a month.
2. **Connect the app.** In Project settings → Your apps, add a Web app. Copy the config object into `CONFIG.firebase` in `index.html` and set `CONFIG.backend = 'firebase'`. The web config is not a secret, so it is fine to commit.
3. **Install the CLI and deploy:**
   ```
   npm i -g firebase-tools
   firebase login
   firebase use --add            # pick the project
   cd functions && npm i && cd ..
   firebase functions:secrets:set STRIPE_SECRET
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   firebase functions:secrets:set ANTHROPIC_API_KEY
   firebase deploy
   ```
4. **Make yourself owner.** Sign in once on the site. Then in Google Cloud Shell, run the Admin SDK one-liner from `docs/PRICING.md § Bootstrap`, or temporarily call `setRole` from the Functions shell.
5. **Load sample data or real data.** Import the seller's QuickBooks customer list and open invoices (Phase 0 migration).

## GitHub

This repo is public, so anyone can read the code and the docs folder. Connect it with `firebase init hosting:github` so every merge to `main` deploys automatically. Never commit Stripe, QuickBooks, or Anthropic keys. They live in Secret Manager.

## Known gaps before production

- **Server-side money writes.** In demo mode the browser issues invoices and marks them paid. In production, invoice creation and payment move into Cloud Functions triggered by order stage changes. `firestore.production.rules` already blocks browser writes to `invoices`.
- **Distance.** Zones use a city list. Production should geocode the site address with the Google Maps Distance Matrix API in a Function.
- **Email and SMS.** Notifications are logged but not sent yet. Wire SendGrid, Postmark, or the Gmail API in `functions/index.js`.
- **QuickBooks sync.** Requires an Intuit developer app. The stub is in `functions/index.js`.
- **811 tickets.** Ticket numbers are placeholders. Sunshine 811 tickets are filed through their portal; store the real number on the order.
