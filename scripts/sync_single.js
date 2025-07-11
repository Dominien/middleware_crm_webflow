/**
 * sync_single.js – v1.0 (11 Jul 2025)
 * One-way, single-item sync from Dynamics CRM → Webflow CMS
 * - Processes a single event ID provided by the webhook.
 * - Reuses caching and upsert logic from the full sync script.
 */

require('dotenv').config();
const { getEvents } = require('../lib/crm'); // Assumes getEvents can take a filter
const axios = require('axios');

// --- Helpers (callWebflowApi, fetchAllWebflowItemsPaginated, etc.) ---
// ... (Copy all the helper functions from sync_full.js here)
// ... (slugify, publishItem, upsertReferenceItem)
// ... The helper functions do not need to be changed.

// --- Main sync for a SINGLE EVENT ------------------------------------------
/**
 * Syncs a single CRM event to Webflow based on its ID.
 * @param {string} eventId The CRM GUID of the event to sync.
 */
async function syncSingleEvent(eventId) {
  if (!eventId) {
    console.error('❌ Sync aborted: No Event ID was provided.');
    return;
  }
  console.log(`🔄 Single Event Sync started for ID: ${eventId}`);

  try {
    // Step 1: Check all required environment variables (same as full sync)
    const requiredEnvVars = {
      WEBFLOW_API_TOKEN: process.env.WEBFLOW_API_TOKEN,
      WEBFLOW_COLLECTION_ID_EVENTS: process.env.WEBFLOW_COLLECTION_ID_EVENTS,
      WEBFLOW_COLLECTION_ID_LOCATIONS: process.env.WEBFLOW_COLLECTION_ID_LOCATIONS,
      WEBFLOW_COLLECTION_ID_CATEGORIES: process.env.WEBFLOW_COLLECTION_ID_CATEGORIES,
      WEBFLOW_COLLECTION_ID_AIRPORTS: process.env.WEBFLOW_COLLECTION_ID_AIRPORTS,
      CRM_TENANT_ID: process.env.CRM_TENANT_ID,
      // ... and other CRM vars
    };

    const missingVars = Object.keys(requiredEnvVars).filter(key => !requiredEnvVars[key]);
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    const COLLECTION_IDS = {
      EVENTS: requiredEnvVars.WEBFLOW_COLLECTION_ID_EVENTS,
      LOCATIONS: requiredEnvVars.WEBFLOW_COLLECTION_ID_LOCATIONS,
      CATEGORIES: requiredEnvVars.WEBFLOW_COLLECTION_ID_CATEGORIES,
      AIRPORTS: requiredEnvVars.WEBFLOW_COLLECTION_ID_AIRPORTS,
    };

    // Step 2: Fetch Webflow reference collections to build caches
    console.log('   [1/3] Fetching Webflow reference collections (Locations, Categories, Airports)...');
    const [webflowLocations, webflowCategories, webflowAirports] = await Promise.all([
        fetchAllWebflowItemsPaginated(COLLECTION_IDS.LOCATIONS),
        fetchAllWebflowItemsPaginated(COLLECTION_IDS.CATEGORIES),
        fetchAllWebflowItemsPaginated(COLLECTION_IDS.AIRPORTS)
    ]);
    console.log('   ✓ Caches for reference collections are ready.');
    
    // Step 3: Fetch ONLY the specific event from CRM
    console.log(`   [2/3] Fetching event ${eventId} from CRM...`);
    // This assumes your getEvents function is updated to accept a filter payload.
    // Based on the API docs, the payload should be { entityids: [eventId] }
    const crmEventsRes = await getEvents({ entityids: [eventId] });
    const crmEvents = crmEventsRes?.value ?? [];

    if (!crmEvents.length) {
        console.warn(`⚠️ No event found in CRM with ID ${eventId}. It might be inactive or deleted. Sync for this ID will stop.`);
        // NOTE: This is where you might handle deletion in the future.
        return;
    }
    console.log(`   ✓ Found CRM Event: "${crmEvents[0].m8_name}"`);

    // Step 4: Process the event
    console.log('   [3/3] Processing and upserting event to Webflow...');
    const locationCache = new Map(webflowLocations.map(i => [i.fieldData.eventlocationid, i.id]));
    const categoryCache = new Map(webflowCategories.map(i => [i.fieldData['category-id'], i.id]));
    const airportCache  = new Map(webflowAirports.map(i => [i.fieldData.airportid, i.id]));

    const webflowEvents = await fetchAllWebflowItemsPaginated(COLLECTION_IDS.EVENTS);
    const eventCache = new Map(webflowEvents.map(i => [i.fieldData.eventid, i.id]));
    
    const ev = crmEvents[0]; // We only have one event to process

    // The rest of this logic is the same as the loop body in sync_full.js
    const locationId = ev.m8_eventlocation ? await upsertReferenceItem({ /* ... */ }) : null;
    const categoryIds = await Promise.all((ev.m8_eventcategories || []).map(cat => upsertReferenceItem({ /* ... */ })));
    const airportIds = await Promise.all((ev.m8_airports || []).map(air => upsertReferenceItem({ /* ... */ })));

    const fieldData = {
        name: ev.m8_name,
        slug: slugify(ev.m8_name),
        eventid: ev.m8_eventid,
        // ... all other event fields ...
        categorie: categoryIds.filter(Boolean),
        airport:   airportIds.filter(Boolean),
        location:  locationId ? [locationId] : [],
    };

    if (eventCache.has(ev.m8_eventid)) {
      const webflowId = eventCache.get(ev.m8_eventid);
      console.log(`   → Event exists in Webflow. Updating item ${webflowId}...`);
      await callWebflowApi('PATCH', `/collections/${COLLECTION_IDS.EVENTS}/items/${webflowId}`, { fieldData });
      await publishItem(COLLECTION_IDS.EVENTS, webflowId);
      console.log('   ↻ Updated & published successfully.');
    } else {
      console.log('   → Event not found in Webflow. Creating new item...');
      const { id: newId } = await callWebflowApi('POST', `/collections/${COLLECTION_IDS.EVENTS}/items`, { isArchived: false, isDraft: false, fieldData });
      await publishItem(COLLECTION_IDS.EVENTS, newId);
      console.log('   ✓ Created & published successfully.');
    }

    console.log(`\n✅  Single event sync complete for ${eventId}.`);

  } catch (error) {
    console.error(`\n❌ A critical error occurred during the single sync for event ${eventId}.`);
    throw error;
  }
}

// Export the function for the webhook to use
module.exports = syncSingleEvent;

// Allow running the script directly from the command line for testing
if (require.main === module) {
  const testEventId = process.argv[2]; // Get ID from command line: node scripts/sync_single.js <event-id>
  if (!testEventId) {
    console.error('Please provide an event ID to test.');
    process.exit(1);
  }
  syncSingleEvent(testEventId).catch(err => {
    console.error('\n❌  Sync script failed to run directly.');
    process.exit(1);
  });
}