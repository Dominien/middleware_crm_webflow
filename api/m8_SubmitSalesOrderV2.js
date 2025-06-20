// /api/m8_SubmitSalesOrderV2.js

import cors from 'cors';
import { submitSalesOrder } from '../lib/crm.js';

const corsHandler = cors({
  origin: 'https://k108---esc-european-speed-club.webflow.io',
  methods: ['POST', 'OPTIONS'],
  optionsSuccessStatus: 200,
});

const runMiddleware = (req, res, fn) => {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) { return reject(result); }
      return resolve(result);
    });
  });
};

export default async function handler(req, res) {
  await runMiddleware(req, res, corsHandler);

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    // 1. Receive the JSON object from the front-end.
    const salesOrderObject = req.body;

    if (!salesOrderObject || Object.keys(salesOrderObject).length === 0) {
      return res.status(400).json({ error: { message: 'Missing salesorder data in request body.' } });
    }

    // --- FIX APPLIED HERE ---
    // 2. Convert the entire object into an "escaped-JSON" string.
    const salesOrderString = JSON.stringify(salesOrderObject);

    // 3. Create the final payload for the CRM, with the stringified data as the value.
    // This matches the API's required format: { salesorder: "..." }
    const finalPayloadForCrm = {
      salesorder: salesOrderString
    };
    
    // 4. Call the CRM library function with the correctly formatted payload.
    console.log('Submitting Sales Order to CRM with stringified payload...');
    const crmResponse = await submitSalesOrder(finalPayloadForCrm);

    console.log('CRM submission successful:', crmResponse);
    return res.status(200).json(crmResponse);

  } catch (error) {
    console.error('Error in m8_SubmitSalesOrderV2 handler:', error.message);
    
    try {
        const errorJson = JSON.parse(error.message.split(' failed: ')[1]);
        return res.status(500).json(errorJson);
    } catch (e) {
        return res.status(500).json({ error: { message: 'An internal server error occurred.' } });
    }
  }
}