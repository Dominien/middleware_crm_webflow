// api/event-product.js  -- MINIMAL TEST CODE

const express = require('express');
const router = express.Router();
const cors = require('cors');

// Use the same CORS options
const corsOptions = {
  origin: 'https://k108---esc-european-speed-club.webflow.io',
  optionsSuccessStatus: 200
};
router.use(cors(corsOptions));

// A very simple route handler
router.get('/:eventId', (req, res) => {
  const { eventId } = req.params;
  console.log(`[TEST] Minimal endpoint hit for eventId: ${eventId}`);
  res.status(200).json([{ productname: "Test successful" }]);
});

module.exports = router;