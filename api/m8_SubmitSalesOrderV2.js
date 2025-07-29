// /api/m8_SubmitSalesOrderV2.js – robust gegen doppelte Verkapselung
import cors from 'cors';
import { submitSalesOrder } from '../lib/crm.js';

// --- Updated CORS Configuration ---
const corsHandler = cors({
  origin: [
    'https://k108---esc-european-speed-5d15a0ed8a9d2.webflow.io', // New testing domain
    'https://k108---esc-european-speed-club.webflow.io',
    'https://www.european-speed-club.com',
    'https://european-speed-club.com'
  ],
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
      console.error('Request body is missing or empty.');
      return res.status(400).json({ error: { message: 'Missing salesOrder data in request body.' } });
    }

    console.log('Request body received:', JSON.stringify(body, null, 2));

    // ------------------------------------------------------------------
    // 2) Erstes Unwrapping – salesOrder vs. legacy salesorder
    // ------------------------------------------------------------------
    let content = body.salesOrder ?? body.salesorder ?? body;
    console.log('Initial content extracted:', JSON.stringify(content, null, 2));

    // ------------------------------------------------------------------
    // 3) Falls noch ein "salesorder"‑Wrapper **im String** steckt → rausparsen
    //    Beispiel:   { salesOrder: "{\"salesorder\":\"{...}\"}" }
    // ------------------------------------------------------------------
    if (typeof content === 'string') {
      console.log('Content is a string, attempting to parse it.');
      try {
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object' && parsed.salesorder) {
          content = parsed.salesorder; // inner string – the actual object
          console.log('Parsed salesorder from string:', JSON.stringify(content, null, 2));
        } else {
          content = parsed; // already in the correct format
          console.log('Parsed valid object:', JSON.stringify(content, null, 2));
        }
      } catch (err) {
        console.error('Error parsing salesorder string:', err);
      }
    }

    // ------------------------------------------------------------------
    // 4) Sicherstellen, dass wir jetzt einen String haben
    // ------------------------------------------------------------------
    const salesOrderString = typeof content === 'string' ? content : JSON.stringify(content);
    console.log('Final salesOrder string:', salesOrderString);

    // ------------------------------------------------------------------
    // 5) Payload für Dynamics
    // ------------------------------------------------------------------
    const finalPayload = { salesOrder: salesOrderString };
    console.log('Prepared payload for CRM:', JSON.stringify(finalPayload, null, 2));

    // ------------------------------------------------------------------
    // Submit the sales order
    // ------------------------------------------------------------------
    console.log('Submitting Sales Order to CRM …');
    const crmResponse = await submitSalesOrder(finalPayload);
    console.log('CRM Response:', JSON.stringify(crmResponse, null, 2));

    return res.status(200).json(crmResponse);
  } catch (err) {
    console.error('Handler error:', err);
    try {
      const parsed = JSON.parse(err.message.split(' failed: ')[1]);
      console.error('Error response from CRM:', JSON.stringify(parsed, null, 2));
      return res.status(500).json(parsed);
    } catch {
      console.error('Error while parsing CRM error response.');
      return res.status(500).json({ error: { message: 'Internal server error.' } });
    }
  }
}