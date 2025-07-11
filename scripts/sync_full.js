/**
 * sync_single.js – v1.1 (11 Jul 2025)
 * One-way, single-item sync from Dynamics CRM → Webflow CMS
 * - FIX: Added missing helper functions from full sync script.
 */

require('dotenv').config();
const { getEvents } = require('../lib/crm');
const axios = require('axios');

// --- START: MISSING HELPER FUNCTIONS ---------------------------------------

const webflowApiBase = 'https://api.webflow.com/v2';

/**
 * Makes a call to the Webflow API with rate-limiting and retry logic.
 */
async function callWebflowApi(method, endpoint, body = null) {
  const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
  const fullUrl = `${webflowApiBase}${endpoint}`;
  const timeout = 45000;

  const options = {
    method,
    url: fullUrl,
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${WEBFLOW_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    timeout,
  };

  if (body) {
    options.data = body;
  }

  const maxRetries = 5;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      await new Promise(resolve => setTimeout(resolve, 1100)); // Rate limit buffer
      const response = await axios(options);
      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 429) {
        attempt++;
        const retryAfter = error.response.headers['retry-after'];
        const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : (2 ** attempt) * 1000;
        
        console.warn(`      -> Rate limit hit. Retrying after ${waitTime / 1000}s... (Attempt ${attempt}/${maxRetries})`);
        
        if (attempt >= maxRetries) {
          console.error(`      -> Max retries reached for request to ${fullUrl}. Aborting.`);
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        if (axios.isCancel(error)) {
            console.error(`Request to ${fullUrl} was canceled or timed out.`);
        } else if (error.response) {
          console.error(`      -> Webflow API Error Status: ${error.response.status}`);
          console.error(`      -> Webflow API Error Data:`, error.response.data);
        } else {
          console.error('      -> Axios request setup error:', error.message);
        }
        throw error;
      }
    }
  }
  throw new Error('Exited retry loop unexpectedly in callWebflowApi.');
}

/**
 * Fetches all items from a Webflow collection using pagination.
 */
async function fetchAllWebflowItemsPaginated(collectionId) {
    let allItems = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while(hasMore) {
        const response = await callWebflowApi('GET', `/collections/${collectionId}/items?limit=${limit}&offset=${offset}`);
        if (response && response.items && response.items.length > 0) {
            allItems = allItems.concat(response.items);
            offset += response.items.length;
        }
        hasMore = response && response.pagination && (offset < response.pagination.total);
    }
    return allItems;
}

/**
 * Publishes a specific item in a Webflow collection.
 */
async function publishItem(collectionId, itemId) {
  await callWebflowApi(
    'POST',
    `/collections/${collectionId}/items/publish`,
    { itemIds: [itemId] },
  );
}

/**
 * Creates a URL-friendly slug from a string.
 */
const slugify = txt =>
  (txt || '')
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Creates or updates a reference item (e.g., location, category) in Webflow.
 */
async function upsertReferenceItem({
  cache,
  collectionId,
  crmIdFieldSlug,
  crmId,
  name,
  additionalFields = {},
}) {
  if (!crmId) return null;

  const fieldData = {
    name,
    slug: slugify(name),
    [crmIdFieldSlug]: crmId,
    ...additionalFields,
  };

  if (cache.has(crmId)) {
    const webflowId = cache.get(crmId);
    await callWebflowApi(
      'PATCH',
      `/collections/${collectionId}/items/${webflowId}`,
      { fieldData },
    );
    await publishItem(collectionId, webflowId);
    return webflowId;
  }

  console.log(`   ↳ Creating new reference item: “${name}” (${crmId})`);
  const { id } = await callWebflowApi('POST', `/collections/${collectionId}/items`, {
    isArchived: false,
    isDraft: false,
    fieldData,
  });
  cache.set(crmId, id);
  await publishItem(collectionId, id);
  return id;
}

// --- END: MISSING HELPER FUNCTIONS -----------------------------------------


// --- Main sync for a SINGLE EVENT ------------------------------------------
/**
 * Syncs a single CRM event to Webflow based on its ID.
 * @param {string} eventId The CRM GUID of the event to sync.
 */
async function syncSingleEvent(eventId) {
    // ... This function remains the same as in the previous answer ...
    // ... No changes are needed inside syncSingleEvent itself.
  if (!eventId) {
    console.error('❌ Sync aborted: No Event ID was provided.');
    return;
  }
  console.log(`🔄 Single Event Sync started for ID: ${eventId}`);

  try {
    const requiredEnvVars = {
      WEBFLOW_API_TOKEN: process.env.WEBFLOW_API_TOKEN,
      WEBFLOW_COLLECTION_ID_EVENTS: process.env.WEBFLOW_COLLECTION_ID_EVENTS,
      WEBFLOW_COLLECTION_ID_LOCATIONS: process.env.WEBFLOW_COLLECTION_ID_LOCATIONS,
      WEBFLOW_COLLECTION_ID_CATEGORIES: process.env.WEBFLOW_COLLECTION_ID_CATEGORIES,
      WEBFLOW_COLLECTION_ID_AIRPORTS: process.env.WEBFLOW_COLLECTION_ID_AIRPORTS,
      CRM_TENANT_ID: process.env.CRM_TENANT_ID,
      CRM_CLIENT_ID: process.env.CRM_CLIENT_ID,
      CRM_CLIENT_SECRET: process.env.CRM_CLIENT_SECRET,
      CRM_BASE_URL: process.env.CRM_BASE_URL,
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
    
    console.log('[1/3] Fetching Webflow reference collections (Locations, Categories, Airports)...');
    const [webflowLocations, webflowCategories, webflowAirports] = await Promise.all([
        fetchAllWebflowItemsPaginated(COLLECTION_IDS.LOCATIONS),
        fetchAllWebflowItemsPaginated(COLLECTION_IDS.CATEGORIES),
        fetchAllWebflowItemsPaginated(COLLECTION_IDS.AIRPORTS)
    ]);
    console.log('   ✓ Caches for reference collections are ready.');
    
    console.log(`   [2/3] Fetching event ${eventId} from CRM...`);
    const crmEventsRes = await getEvents({ entityids: [eventId] });
    const crmEvents = crmEventsRes?.value ?? [];

    if (!crmEvents.length) {
        console.warn(`⚠️ No event found in CRM with ID ${eventId}. It might be inactive or deleted. Sync for this ID will stop.`);
        return;
    }
    const ev = crmEvents[0];
    console.log(`   ✓ Found CRM Event: "${ev.m8_name}"`);

    console.log('   [3/3] Processing and upserting event to Webflow...');
    const locationCache = new Map(webflowLocations.map(i => [i.fieldData.eventlocationid, i.id]));
    const categoryCache = new Map(webflowCategories.map(i => [i.fieldData['category-id'], i.id]));
    const airportCache  = new Map(webflowAirports.map(i => [i.fieldData.airportid, i.id]));

    const webflowEvents = await fetchAllWebflowItemsPaginated(COLLECTION_IDS.EVENTS);
    const eventCache = new Map(webflowEvents.map(i => [i.fieldData.eventid, i.id]));

    const locationId = ev.m8_eventlocation ? await upsertReferenceItem({
        cache: locationCache,
        collectionId: COLLECTION_IDS.LOCATIONS,
        crmIdFieldSlug: 'eventlocationid',
        crmId: ev.m8_eventlocation.m8_eventlocationid,
        name: ev.m8_eventlocation.m8_name,
        additionalFields: {
          address1city: ev.m8_eventlocation.m8_address1city,
          address1country: ev.m8_eventlocation.m8_address1country,
        },
      }) : null;

      const categoryIds = await Promise.all((ev.m8_eventcategories || []).map(cat => upsertReferenceItem({
        cache: categoryCache,
        collectionId: COLLECTION_IDS.CATEGORIES,
        crmIdFieldSlug: 'category-id',
        crmId: cat.m8_eventcategoryid,
        name: cat.m8_name,
      })));
      
      const airportIds = await Promise.all((ev.m8_airports || []).map(air => upsertReferenceItem({
        cache: airportCache,
        collectionId: COLLECTION_IDS.AIRPORTS,
        crmIdFieldSlug: 'airportid',
        crmId: air.m8_airportid,
        name: air.m8_name,
        additionalFields: {
          iataairport: air.m8_iataairport,
          iataairportcode: air.m8_iataairportcode,
          note: air.m8_note,
          address1city: air.m8_address1city,
          address1country: air.m8_address1country,
        },
      })));

      const fieldData = {
        name: ev.m8_name,
        slug: slugify(ev.m8_name),
        eventid: ev.m8_eventid,
        startdate: ev.m8_startdate,
        enddate: ev.m8_enddate,
        startingamount: ev.m8_startingamount,
        drivingdays: ev.m8_drivingdays,
        eventbookingstatuscode: ev.m8_eventbookingstatuscode,
        isflightincluded: ev.m8_isflightincluded,
        iseventpublished: ev.m8_iseventpublished,
        isaccommodationandcateringincluded: ev.m8_isaccommodationandcateringincluded,
        isfullybooked: ev.m8_isfullybooked,
        isfullybookedboleantext: ev.m8_isfullybooked ? 'true' : 'false',
        availablevehicles: ev.m8_availablevehicles,
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
  const testEventId = process.argv[2]; 
  if (!testEventId) {
    console.error('Please provide an event ID to test. Usage: node scripts/sync_single.js <event-id>');
    process.exit(1);
  }
  syncSingleEvent(testEventId).catch(err => {
    console.error('\n❌  Sync script failed to run directly.');
    process.exit(1);
  });
}