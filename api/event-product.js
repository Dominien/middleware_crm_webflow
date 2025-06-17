/**
 * api/event-products.js
 * * This file defines the middleware API endpoint for fetching live product and price
 * information for a specific event from the Dynamics CRM. It acts as a secure
 * proxy, preventing any secret keys from being exposed on the front end.
 */

// Assuming you are using an Express.js server framework
const express = require('express');
const router = express.Router();

// Import the function to get price levels from your crm.js module
// The path assumes that crm.js is in a 'lib' directory one level up.
const { getEventPriceLevel } = require('../lib/crm');

/**
 * @route   GET /api/event-products/:eventId
 * @desc    Fetches all products and their live prices for a single event.
 * @access  Public
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