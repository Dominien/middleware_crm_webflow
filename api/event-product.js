// api/event-product.js -- NEW TEST WITH QUERY PARAMETER

const express = require('express');
const router = express.Router();
const cors = require('cors');

// Use the same CORS options
const corsOptions = {
  origin: 'https://k108---esc-european-speed-club.webflow.io',
  optionsSuccessStatus: 200
};
router.use(cors(corsOptions));

// A very simple route handler that now uses req.query
// The route path is now just '/'
router.get('/', (req, res) => {
  // Get the eventId from the query string instead of the path params
  const { eventId } = req.query;

  console.log(`[TEST] Minimal endpoint hit with query parameter eventId: ${eventId}`);

  if (!eventId) {
    return res.status(400).json({ message: "Query parameter 'eventId' is required." });
  }

  // Just send back a success message
  res.status(200).json([{ productname: `Test for ${eventId} successful` }]);
});

module.exports = router;