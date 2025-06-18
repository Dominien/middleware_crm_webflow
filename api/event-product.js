// api/event-product.js

// Import and configure CORS
const cors = require('cors');

// Initialize CORS middleware
const corsHandler = cors({
  origin: 'https://k108---esc-european-speed-club.webflow.io',
  optionsSuccessStatus: 200
});

// The main serverless function Vercel will run
export default async function handler(req, res) {
  // We use a helper to run the CORS middleware
  await new Promise((resolve, reject) => {
    corsHandler(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });

  // Ensure this only responds to GET requests
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // Get the eventId from the query string
  const { eventId } = req.query;

  console.log(`[Vercel Function] Endpoint hit with query parameter eventId: ${eventId}`);

  if (!eventId) {
    return res.status(400).json({ message: "Query parameter 'eventId' is required." });
  }

  // Just send back a success message
  res.status(200).json([{ productname: `Test for ${eventId} successful` }]);
}