// /api/m8_SubmitSalesOrderV2.js

// Import CORS middleware handler
import cors from 'cors';

// Import the function from your CRM library using ESM syntax
import { submitSalesOrder } from '../lib/crm.js';

// Initialize CORS middleware to allow requests from your Webflow domain
const corsHandler = cors({
  origin: 'https://k108---esc-european-speed-club.webflow.io',
  methods: ['POST', 'OPTIONS'], // Allow POST for the main request and OPTIONS for preflight
  optionsSuccessStatus: 200,
});

// Helper function to run middleware in a Vercel Serverless Function
const runMiddleware = (req, res, fn) => {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
};


/**
 * Vercel Serverless Function to handle the sales order submission.
 * It includes CORS handling to allow requests from the Webflow front-end.
 */
export default async function handler(req, res) {
  // 1. First, run the CORS middleware to handle cross-origin requests
  await runMiddleware(req, res, corsHandler);

  // 2. We only accept POST requests for this endpoint.
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    // 3. Extract the sales order data from the incoming request body.
    // NOTE: This was updated to match the data structure sent by the front-end script.
    // The payload is now the entire request body.
    const salesorder = req.body;

    // Validate that the body is not empty
    if (!salesorder || Object.keys(salesorder).length === 0) {
      return res.status(400).json({ error: { message: 'Missing salesorder data in request body.' } });
    }
    
    // 4. Call the secure CRM library function with the payload.
    console.log('Submitting Sales Order to CRM...');
    const crmResponse = await submitSalesOrder(salesorder);

    // 5. Forward the successful response from the CRM back to the browser.
    console.log('CRM submission successful:', crmResponse);
    return res.status(200).json(crmResponse);

  } catch (error) {
    // 6. If anything goes wrong, log the error and send a generic error message.
    console.error('Error in m8_SubmitSalesOrderV2 handler:', error.message);
    
    // Attempt to parse a specific error message from the CRM if possible
    try {
        const errorJson = JSON.parse(error.message.split(' failed: ')[1]);
         return res.status(500).json(errorJson);
    } catch (e) {
        return res.status(500).json({ error: { message: 'An internal server error occurred.' } });
    }
  }
}