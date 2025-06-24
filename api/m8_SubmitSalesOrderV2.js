// /api/m8_SubmitSalesOrderV2.js – robust gegen doppelte Verkapselung
import cors from 'cors';
import { submitSalesOrder } from '../lib/crm.js';

const corsHandler = cors({
  origin: 'https://k108---esc-european-speed-club.webflow.io',
  methods: ['POST', 'OPTIONS'],
  optionsSuccessStatus: 200,
});

const runMiddleware = (req, res, fn) =>
  new Promise((resolve, reject) => {
    fn(req, res, result => (result instanceof Error ? reject(result) : resolve(result)));
  });

export default async function handler(req, res) {
  await runMiddleware(req, res, corsHandler);

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    // ------------------------------------------------------------------
    // 1) Body prüfen
    // ------------------------------------------------------------------
    const body = req.body;
    if (!body || Object.keys(body).length === 0) {
      return res.status(400).json({ error: { message: 'Missing salesOrder data in request body.' } });
    }

    // ------------------------------------------------------------------
    // 2) Erstes Unwrapping – salesOrder vs. legacy salesorder
    // ------------------------------------------------------------------
    let content = body.salesOrder ?? body.salesorder ?? body;

    // ------------------------------------------------------------------
    // 3) Falls noch ein "salesorder"‑Wrapper **im String** steckt → rausparsen
    //    Beispiel:   { salesOrder: "{\"salesorder\":\"{...}\"}" }
    // ------------------------------------------------------------------
    if (typeof content === 'string') {
      // Versuch: String zu JSON parsen
      try {
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object' && parsed.salesorder) {
          // innen liegt nochmal ein String – das eigentliche Objekt
          content = parsed.salesorder;
        } else {
          content = parsed; // schon richtig
        }
      } catch (_) {
        // content bleibt String (bereits escaped)
      }
    }

    // ------------------------------------------------------------------
    // 4) Sicherstellen, dass wir jetzt einen String haben
    // ------------------------------------------------------------------
    const salesOrderString = typeof content === 'string' ? content : JSON.stringify(content);

    // ------------------------------------------------------------------
    // 5) Payload für Dynamics
    // ------------------------------------------------------------------
    const finalPayload = { salesOrder: salesOrderString };

    console.log('Submitting Sales Order to CRM …');
    const crmResponse = await submitSalesOrder(finalPayload);
    return res.status(200).json(crmResponse);
  } catch (err) {
    console.error('Handler error:', err);
    try {
      const parsed = JSON.parse(err.message.split(' failed: ')[1]);
      return res.status(500).json(parsed);
    } catch {
      return res.status(500).json({ error: { message: 'Internal server error.' } });
    }
  }
}
