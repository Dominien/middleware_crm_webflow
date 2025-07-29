// api/event-product.js -- FINAL VERSION

// Import CORS middleware handler
import cors from 'cors';

// Import your CRM logic
import { getEventPriceLevel } from '../lib/crm.js'; // Using ESM import

// Initialize CORS middleware with multiple origins
const corsHandler = cors({
  origin: [
    'https://k108---esc-european-speed-5d15a0ed8a9d2.webflow.io', // New testing domain
    'https://k108---esc-european-speed-club.webflow.io',
    'https://www.european-speed-club.com',
    'https://european-speed-club.com'
  ],
  optionsSuccessStatus: 200
});

// Helper to run middleware in a native serverless function
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

// The main serverless function Vercel will run
export default async function handler(req, res) {
  // First, run the CORS middleware
  await runMiddleware(req, res, corsHandler);

  // Ensure this only responds to GET requests
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // --- Your Original Logic Starts Here ---
  try {
    // Get the eventId from the query string
    const { eventId } = req.query;

    if (!eventId) {
      return res.status(400).json({ msg: "Query parameter 'eventId' is required." });
    }

    console.log(`[API] Received request for event products for eventId: ${eventId}`);

    // Call the CRM function to get the price level and products
    const priceLevelData = await getEventPriceLevel(eventId);

    // The CRM response nests the data. We need to safely extract it.
    if (priceLevelData && priceLevelData.value && priceLevelData.value.length > 0) {
      const products = priceLevelData.value[0].m8_pricelevelproducts || [];
      console.log(`[API] Found ${products.length} products for eventId: ${eventId}. Sending to client.`);
      return res.status(200).json(products);
    } else {
      // Handle cases where the event is found but has no products
      console.log(`[API] No products found for eventId: ${eventId}.`);
      return res.status(200).json([]);
    }

  } catch (error) {
    console.error('[API Error] Failed to fetch event products from CRM:', error.message);
    // Send a generic server error to the client
    res.status(500).json({ msg: 'Server error while fetching product data.' });
  }
}