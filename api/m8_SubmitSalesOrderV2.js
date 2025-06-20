// /api/m8_SubmitSalesOrderV2.js

// Import the function we will create in our CRM library
const { submitSalesOrder } = require('../lib/crm');

/**
 * Vercel Serverless Function to handle the sales order submission.
 * This function acts as a secure gateway between the public-facing
 * Webflow site and the internal CRM system.
 */
export default async function handler(req, res) {
  // 1. We only accept POST requests for this endpoint.
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    // 2. Extract the 'salesorder' object from the incoming request body.
    // The front-end script sends { "salesorder": { ... } }
    const { salesorder } = req.body;

    if (!salesorder) {
      return res.status(400).json({ error: { message: 'Missing salesorder data in request body.' } });
    }
    
    // 3. Call our secure CRM library function with the payload.
    // This is where the magic happens. The crm.js file handles the token and the actual call to Dynamics.
    console.log('Submitting Sales Order to CRM...');
    const crmResponse = await submitSalesOrder(salesorder);

    // 4. Forward the successful response from the CRM back to the browser.
    console.log('CRM submission successful:', crmResponse);
    return res.status(200).json(crmResponse);

  } catch (error) {
    // 5. If anything goes wrong (e.g., CRM is down, auth fails),
    // log the error on the server and send a generic error message back to the browser.
    console.error('Error in m8_SubmitSalesOrderV2 handler:', error.message);
    
    // Attempt to parse a JSON error from the CRM if possible
    try {
        const errorJson = JSON.parse(error.message.split(' failed: ')[1]);
         return res.status(500).json(errorJson);
    } catch (e) {
        return res.status(500).json({ error: { message: 'An internal server error occurred.' } });
    }
  }
}
