// Server-side automations. Secrets live in Google Secret Manager, never in the repo:
//   firebase functions:secrets:set STRIPE_SECRET
//   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
//   firebase functions:secrets:set ANTHROPIC_API_KEY
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

const STRIPE_SECRET = defineSecret('STRIPE_SECRET');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const APP_URL = process.env.APP_URL || 'https://YOUR-PROJECT.web.app';

// 1. Every new invoice gets a Stripe Checkout link (card + ACH). Email it with your provider of choice.
exports.onInvoiceCreated = onDocumentCreated({ document: 'invoices/{id}', secrets: [STRIPE_SECRET] }, async (event) => {
  const inv = event.data.data();
  if (inv.status !== 'open' || inv.paymentUrl) return;
  const stripe = require('stripe')(STRIPE_SECRET.value());
  const acct = (await db.doc(`accounts/${inv.accountId}`).get()).data() || {};
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card', 'us_bank_account'],
    customer_email: acct.billingEmail,
    line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: Math.round(inv.amount * 100),
      product_data: { name: `${inv.id} · ${inv.kind} · order ${inv.orderId}` } } }],
    metadata: { invoiceId: inv.id },
    success_url: `${APP_URL}/?paid=${inv.id}`,
    cancel_url: `${APP_URL}/`,
  });
  await event.data.ref.update({ paymentUrl: session.url, stripeSession: session.id });
  // TODO: send email to acct.billingEmail with session.url (SendGrid, Postmark or Gmail API).
});

// 2. Stripe webhook marks invoices paid and releases deposits to design.
exports.stripeWebhook = onRequest({ secrets: [STRIPE_SECRET, STRIPE_WEBHOOK_SECRET] }, async (req, res) => {
  const stripe = require('stripe')(STRIPE_SECRET.value());
  let evt;
  try { evt = stripe.webhooks.constructEvent(req.rawBody, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET.value()); }
  catch (e) { return res.status(400).send(`Webhook error: ${e.message}`); }
  if (evt.type === 'checkout.session.completed' || evt.type === 'checkout.session.async_payment_succeeded') {
    const id = evt.data.object.metadata.invoiceId;
    if (evt.data.object.payment_status !== 'paid') return res.json({ received: true });
    const ref = db.doc(`invoices/${id}`); const inv = (await ref.get()).data();
    const today = new Date().toISOString().slice(0, 10);
    await ref.update({ status: 'paid', paidAt: today, method: 'stripe', qbo: 'queued' });
    if (inv.kind === 'deposit') {
      const oref = db.doc(`orders/${inv.orderId}`); const o = (await oref.get()).data();
      if (o && o.stage === 'deposit') await oref.update({ stage: 'design', depositPaidAt: today });
    }
    await db.collection('log').add({ at: new Date().toISOString(), event: 'Payment received', detail: `${id} paid via Stripe`, ref: inv.orderId, actor: 'Stripe' });
  }
  res.json({ received: true });
});

// 3. Owner assigns roles. Customers get { role:'customer', accountId }.
exports.setRole = onCall(async (req) => {
  if (req.auth?.token?.role !== 'owner') throw new HttpsError('permission-denied', 'Owner only');
  const { email, role, accountId } = req.data;
  const user = await admin.auth().getUserByEmail(email);
  await admin.auth().setCustomUserClaims(user.uid, accountId ? { role, accountId } : { role });
  return { ok: true };
});

// 4. AI intake: turn an email into a structured order draft. Staff review before anything is sent.
exports.aiIntake = onCall({ secrets: [ANTHROPIC_API_KEY] }, async (req) => {
  if (!['owner', 'am'].includes(req.auth?.token?.role)) throw new HttpsError('permission-denied', 'Staff only');
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
  const products = (await db.doc('settings/pricebook').get()).data().products.map(p => `${p.id}: ${p.name}`).join('\n');
  const msg = await client.messages.create({
    model: 'claude-sonnet-5-5', max_tokens: 1024,
    system: `You read sign orders for a Florida real estate sign company. Return only JSON:
{"orders":[{"productId","qty","w","h","fulfillment":"install|pickup","street","city","headline","line1","line2","rush":bool,"contact","notes"}],"missing":[string]}
Valid productIds:\n${products}\nNever invent an address. List anything unclear in "missing".`,
    messages: [{ role: 'user', content: req.data.text }],
  });
  return JSON.parse(msg.content[0].text);
});

// 5. QuickBooks sync: push paid invoices to QBO. Needs an Intuit developer app and OAuth tokens in Secret Manager.
// exports.qboSync = onDocumentUpdated('invoices/{id}', async (event) => { ... create Invoice + Payment in QBO, set qbo:'synced' ... });
