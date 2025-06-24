// /api/m8_SubmitsalesOrderV2.js
import cors from 'cors';
import { submitsalesOrder } from '../lib/crm.js';

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
    /** ----------------------------------------------------------------
     *  STEP 1 – Rohdaten übernehmen
     *  Erwartet wird eines der beiden Formate:
     *    a) { salesOrder: { … } }      ← vom Frontend geschickt
     *    b) { …direkt das salesOrder-Objekt… }  ← Fallback
     * ----------------------------------------------------------------*/
    const body = req.body;

    if (!body || Object.keys(body).length === 0) {
      return res
        .status(400)
        .json({ error: { message: 'Missing salesOrder data in request body.' } });
    }

    // -----------------------------------------------------------------
    // STEP 2 – Nur den eigentlichen Sales-Order-Teil herausziehen
    // -----------------------------------------------------------------
    const salesOrderContent = body.hasOwnProperty('salesOrder') ? body.salesOrder : body;

    // -----------------------------------------------------------------
    // STEP 3 – Falls noch nicht passiert: in einen JSON-String verwandeln
    // -----------------------------------------------------------------
    const salesOrderString =
      typeof salesOrderContent === 'string'
        ? salesOrderContent               // schon escapet
        : JSON.stringify(salesOrderContent); // jetzt escapen

    // -----------------------------------------------------------------
    // STEP 4 – Payload fürs CRM bauen
    // -----------------------------------------------------------------
    const finalPayloadForCrm = { salesOrder: salesOrderString };

    console.log('Submitting Sales Order to CRM with stringified payload …');
    const crmResponse = await submitsalesOrder(finalPayloadForCrm);

    console.log('CRM submission successful:', crmResponse);
    return res.status(200).json(crmResponse);
  } catch (error) {
    console.error('Error in m8_SubmitsalesOrderV2 handler:', error);

    // Versuche, ein strukturiertes Fehlerobjekt des CRM durchzureichen
    try {
      const errorJson = JSON.parse(error.message.split(' failed: ')[1]);
      return res.status(500).json(errorJson);
    } catch {
      return res.status(500).json({ error: { message: 'An internal server error occurred.' } });
    }
  }
}
