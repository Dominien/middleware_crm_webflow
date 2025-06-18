/**
 * api/event-products.js
 * * This file defines the middleware API endpoint for fetching live product and price
 * information for a specific event from the Dynamics CRM. It acts as a secure
 * proxy, preventing any secret keys from being exposed on the front end.
 */

const express = require('express');
const router = express.Router();
const { getEventPriceLevel } = require('../lib/crm');

// --- CORS Configuration Start ---
// This block will ensure that only your Webflow site can access this API from a browser.

// 1. Import the cors middleware
const cors = require('cors');

// 2. Define the security options for CORS
const corsOptions = {
  // Only allow requests from your specific Webflow domain
  origin: 'https://k108---esc-european-speed-club.webflow.io',
  optionsSuccessStatus: 200 // For legacy browser support
};

// 3. Apply the CORS middleware to the router
// Every request to this router will first pass through this security check.
router.use(cors(corsOptions));

// --- CORS Configuration End ---


/**
 * @route   GET /api/event-products/:eventId
 * @desc    Fetches all products and their live prices for a single event.
 * @access  Public (but restricted by CORS)
 */
router.get('/:eventId', async (req, res) => {
    try {
        const { eventId } = req.params;

        if (!eventId) {
            return res.status(400).json({ msg: 'Event ID is required.' });
        }

        console.log(`[API] Received request for event products for eventId: ${eventId}`);

        // Call the CRM function to get the price level and products
        const priceLevelData = await getEventPriceLevel(eventId);

        // The CRM response nests the data. We need to safely extract it.
        // The structure is: response -> value (array) -> first element -> m8_pricelevelproducts (array)
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
});

module.exports = router;