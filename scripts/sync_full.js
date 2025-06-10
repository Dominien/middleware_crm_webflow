/**
 * sync_full.js
 * This script performs a full, one-way synchronization from the Dynamics CRM
 * to a Webflow CMS. It uses a caching mechanism to prevent duplicate reference
 * item creation and improve performance.
 */

require('dotenv').config();
const { getEvents } = require('../lib/crm'); // Assumes crm.js is in the lib/ directory
const fetch = require('node-fetch');

// --- Configuration ---
const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;

// Collection IDs from your .env file
const COLLECTION_IDS = {
    EVENTS: process.env.WEBFLOW_COLLECTION_ID_EVENTS,
    LOCATIONS: process.env.WEBFLOW_COLLECTION_ID_LOCATIONS,
    CATEGORIES: process.env.WEBFLOW_COLLECTION_ID_CATEGORIES,
    AIRPORTS: process.env.WEBFLOW_COLLECTION_ID_AIRPORTS,
};

// Check for required environment variables
if (!WEBFLOW_API_TOKEN || !COLLECTION_IDS.EVENTS || !COLLECTION_IDS.LOCATIONS || !COLLECTION_IDS.CATEGORIES || !COLLECTION_IDS.AIRPORTS) {
    console.error("One or more required environment variables (WEBFLOW_API_TOKEN, WEBFLOW_COLLECTION_ID_...) are not defined in your .env file.");
    process.exit(1);
}

// --- Webflow API Helper ---
const webflowApiBase = 'https://api.webflow.com/v2';

async function callWebflowApi(method, endpoint, body = null) {
    const options = {
        method: method,
        headers: {
            'accept': 'application/json',
            'authorization': `Bearer ${WEBFLOW_API_TOKEN}`,
            'content-type': 'application/json'
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${webflowApiBase}${endpoint}`, options);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Webflow API Error: ${response.status} ${errorText}`);
    }

    if (response.status === 204) return null;
    return response.json();
}

function slugify(text) {
  if (!text) return '';
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-').replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-').replace(/^-+/, '').replace(/-+$/, '');
}

/**
 * Finds a reference item in a local cache, or creates it in Webflow if it doesn't exist.
 * This function is the key to preventing duplicate slug errors.
 * @param {object} config - Configuration object.
 * @param {Map<string, string>} config.cache - The local cache Map (CRM ID -> Webflow ID).
 * @param {string} config.collectionId - The Webflow Collection ID for creation.
 * @param {string} config.crmIdFieldSlug - The slug of the field storing the CRM ID.
 * @param {string} config.crmId - The CRM ID of the item to find or create.
 * @param {string} config.name - The name of the item.
 * @param {object} config.additionalFields - Other fields for creation.
 * @returns {Promise<string|null>} The Webflow Item ID.
 */
async function getOrCreateReferenceItem({ cache, collectionId, crmIdFieldSlug, crmId, name, additionalFields = {} }) {
    if (!crmId) return null;

    // 1. Check the local cache first! This is the most important step.
    if (cache.has(crmId)) {
        return cache.get(crmId);
    }

    // 2. If not in cache, create the item in Webflow.
    console.log(`  Item '${name}' (CRM ID: ${crmId}) not in cache. Creating in Webflow...`);
    const newItemData = {
        isArchived: false,
        isDraft: false,
        fieldData: {
            name: name,
            slug: slugify(name),
            [crmIdFieldSlug]: crmId,
            ...additionalFields
        }
    };

    const createdItem = await callWebflowApi('POST', `/collections/${collectionId}/items`, newItemData);
    
    // 3. Add the newly created item to the cache for subsequent loops.
    cache.set(crmId, createdItem.id);
    
    return createdItem.id;
}

// --- Main Synchronization Logic ---
async function syncFull() {
    console.log('Starting full sync from CRM to Webflow...');

    // 1. Fetch existing Webflow items and CRM events in parallel to build our caches.
    console.log('Fetching existing Webflow items and CRM events...');
    const [existingLocations, existingCategories, existingAirports, crmEventsResponse] = await Promise.all([
        callWebflowApi('GET', `/collections/${COLLECTION_IDS.LOCATIONS}/items`),
        callWebflowApi('GET', `/collections/${COLLECTION_IDS.CATEGORIES}/items`),
        callWebflowApi('GET', `/collections/${COLLECTION_IDS.AIRPORTS}/items`),
        getEvents()
    ]);

    // 2. Create local caches (Maps) for quick lookups.
    const locationCache = new Map(existingLocations.items.map(item => [item.fieldData.eventlocationid, item.id]));
    const categoryCache = new Map(existingCategories.items.map(item => [item.fieldData['category-id'], item.id]));
    const airportCache = new Map(existingAirports.items.map(item => [item.fieldData.airportid, item.id]));
    console.log(`Caches built. Locations: ${locationCache.size}, Categories: ${categoryCache.size}, Airports: ${airportCache.size}`);
    
    // 3. Get events from the CRM response.
    if (!crmEventsResponse || !crmEventsResponse.value || crmEventsResponse.value.length === 0) {
        console.log('No active events found in CRM. Sync complete.');
        return;
    }
    const crmEvents = crmEventsResponse.value;
    console.log(`Found ${crmEvents.length} active event(s) in CRM to process.`);

    // 4. Find existing Webflow events to create a cache for them too.
    const existingWebflowEvents = await callWebflowApi('GET', `/collections/${COLLECTION_IDS.EVENTS}/items`);
    const eventCache = new Map(existingWebflowEvents.items.map(item => [item.fieldData.eventid, item.id]));

    // 5. Process each event.
    for (const crmEvent of crmEvents) {
        console.log(`\nProcessing CRM Event: "${crmEvent.m8_name}" (ID: ${crmEvent.m8_eventid})`);

        // Location
        let locationWebflowId = null;
        if (crmEvent.m8_eventlocation) {
            locationWebflowId = await getOrCreateReferenceItem({
                cache: locationCache,
                collectionId: COLLECTION_IDS.LOCATIONS,
                crmIdFieldSlug: 'eventlocationid',
                crmId: crmEvent.m8_eventlocation.m8_eventlocationid,
                name: crmEvent.m8_eventlocation.m8_name,
                additionalFields: {
                    address1city: crmEvent.m8_eventlocation.m8_address1city,
                    address1country: crmEvent.m8_eventlocation.m8_address1country,
                }
            });
        }
        
        // Categories
        const categoryWebflowIds = await Promise.all(crmEvent.m8_eventcategories.map(category =>
            getOrCreateReferenceItem({
                cache: categoryCache,
                collectionId: COLLECTION_IDS.CATEGORIES,
                crmIdFieldSlug: 'category-id',
                crmId: category.m8_eventcategoryid,
                name: category.m8_name
            })
        ));

        // Airports
        const airportWebflowIds = await Promise.all(crmEvent.m8_airports.map(airport =>
             getOrCreateReferenceItem({
                cache: airportCache,
                collectionId: COLLECTION_IDS.AIRPORTS,
                crmIdFieldSlug: 'airportid',
                crmId: airport.m8_airportid,
                name: airport.m8_name
            })
        ));

        // Prepare main event data
        const eventFieldData = {
            name: crmEvent.m8_name,
            slug: slugify(crmEvent.m8_name),
            eventid: crmEvent.m8_eventid,
            startdate: crmEvent.m8_startdate,
            enddate: crmEvent.m8_enddate,
            startingamount: crmEvent.m8_startingamount,
            drivingdays: crmEvent.m8_drivingdays,
            eventbookingstatuscode: crmEvent.m8_eventbookingstatuscode,
            isflightincluded: crmEvent.m8_isflightincluded,
            iseventpublished: crmEvent.m8_iseventpublished,
            isaccommodationandcateringincluded: crmEvent.m8_isaccommodationandcateringincluded,
            categorie: categoryWebflowIds.filter(Boolean), // Filter out any nulls
            airport: airportWebflowIds.filter(Boolean),
            location: locationWebflowId ? [locationWebflowId] : [] 
        };

        // Check event cache to decide whether to update (PATCH) or create (POST).
        const existingEventId = eventCache.get(crmEvent.m8_eventid);

        if (existingEventId) {
            console.log(`  Event exists in Webflow (Item ID: ${existingEventId}). Updating...`);
            await callWebflowApi('PATCH', `/collections/${COLLECTION_IDS.EVENTS}/items/${existingEventId}`, { fieldData: eventFieldData });
        } else {
            console.log(`  Event not found in Webflow. Creating...`);
            await callWebflowApi('POST', `/collections/${COLLECTION_IDS.EVENTS}/items`, { isArchived: false, isDraft: false, fieldData: eventFieldData });
        }
        console.log(`  Successfully processed "${crmEvent.m8_name}".`);
    }

    console.log('\n✅ Full sync from CRM to Webflow completed successfully!');
}

// --- Execution ---
if (require.main === module) {
    syncFull().catch(error => {
        console.error('\n❌ An error occurred during the sync process:');
        console.error(error);
        process.exit(1);
    });
}
