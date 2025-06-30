/**
 * sync_full.js  – v2.6 (30 Jun 2025)
 * One-way, full sync from Dynamics CRM → Webflow CMS
 * - CRITICAL FIX: Added check for required CRM environment variables.
 * - MAJOR FIX: Implemented pagination for all Webflow API calls.
 * - IMPROVED: Robust check for environment variables that logs a clear error message.
 */

require('dotenv').config();
// IMPORTANT: Now we import more from crm.js to get all data
const { getEvents, getEventLocations, getEventCategories, getAirports } = require('../lib/crm');
const fetch = require('node-fetch');

// --- Helpers ---------------------------------------------------------------
const webflowApiBase = 'https://api.webflow.com/v2';

async function callWebflowApi(method, endpoint, body = null) {
  const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30-second timeout

  const options = {
    method,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${WEBFLOW_API_TOKEN}`,
      'content-type': 'application/json',
    },
    signal: controller.signal,
  };
  if (body) options.body = JSON.stringify(body);

  try {
    const res = await fetch(`${webflowApiBase}${endpoint}`, options);
    if (!res.ok) throw new Error(`Webflow API ${res.status} → ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Webflow API call to ${endpoint} timed out after 30 seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchAllWebflowItemsPaginated(collectionId) {
    let allItems = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while(hasMore) {
        console.log(`   -> Fetching Webflow items from collection ${collectionId} (offset: ${offset})...`);
        const response = await callWebflowApi('GET', `/collections/${collectionId}/items?limit=${limit}&offset=${offset}`);
        
        if (response.items && response.items.length > 0) {
            allItems = allItems.concat(response.items);
            offset += response.items.length;
        }
        hasMore = offset < response.pagination.total;
    }
    return allItems;
}

async function publishItem(collectionId, itemId) {
  await callWebflowApi(
    'POST',
    `/collections/${collectionId}/items/publish`,
    { itemIds: [itemId] },
  );
}

const slugify = txt =>
  (txt || '')
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');

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

  console.log(`   ↳ creating: “${name}” (${crmId})`);
  const { id } = await callWebflowApi('POST', `/collections/${collectionId}/items`, {
    isArchived: false,
    isDraft: false,
    fieldData,
  });
  cache.set(crmId, id);
  await publishItem(collectionId, id);
  return id;
}

// --- Main sync -------------------------------------------------------------
async function syncFull() {
  console.log('🔄  Full CRM → Webflow sync started…');

  try {
    // --- NEW: Robust check for ALL required environment variables (CRM + Webflow) ---
    const requiredEnvVars = {
      // Webflow
      WEBFLOW_API_TOKEN: process.env.WEBFLOW_API_TOKEN,
      WEBFLOW_COLLECTION_ID_EVENTS: process.env.WEBFLOW_COLLECTION_ID_EVENTS,
      WEBFLOW_COLLECTION_ID_LOCATIONS: process.env.WEBFLOW_COLLECTION_ID_LOCATIONS,
      WEBFLOW_COLLECTION_ID_CATEGORIES: process.env.WEBFLOW_COLLECTION_ID_CATEGORIES,
      WEBFLOW_COLLECTION_ID_AIRPORTS: process.env.WEBFLOW_COLLECTION_ID_AIRPORTS,
      // CRM
      CRM_TENANT_ID: process.env.CRM_TENANT_ID,
      CRM_CLIENT_ID: process.env.CRM_CLIENT_ID,
      CRM_CLIENT_SECRET: process.env.CRM_CLIENT_SECRET,
      CRM_BASE_URL: process.env.CRM_BASE_URL,
    };

    const missingVars = Object.keys(requiredEnvVars).filter(key => !requiredEnvVars[key]);

    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
    console.log('   ✓ All environment variables (CRM & Webflow) are present.');

    const COLLECTION_IDS = {
      EVENTS: requiredEnvVars.WEBFLOW_COLLECTION_ID_EVENTS,
      LOCATIONS: requiredEnvVars.WEBFLOW_COLLECTION_ID_LOCATIONS,
      CATEGORIES: requiredEnvVars.WEBFLOW_COLLECTION_ID_CATEGORIES,
      AIRPORTS: requiredEnvVars.WEBFLOW_COLLECTION_ID_AIRPORTS,
    };

    // --- Fetch all data ---
    console.log('   -> Fetching all data from CRM and Webflow...');
    const [
        webflowLocations, 
        webflowCategories, 
        webflowAirports, 
        crmEventsRes
    ] = await Promise.all([
        fetchAllWebflowItemsPaginated(COLLECTION_IDS.LOCATIONS),
        fetchAllWebflowItemsPaginated(COLLECTION_IDS.CATEGORIES),
        fetchAllWebflowItemsPaginated(COLLECTION_IDS.AIRPORTS),
        getEvents() // This is the main event data from CRM
    ]);
    
    console.log(`   ✓ Webflow Locations fetched: ${webflowLocations.length} total items.`);
    console.log(`   ✓ Webflow Categories fetched: ${webflowCategories.length} total items.`);
    console.log(`   ✓ Webflow Airports fetched: ${webflowAirports.length} total items.`);
    console.log('   ✓ CRM Events fetched.');

    const locationCache = new Map(webflowLocations.map(i => [i.fieldData.eventlocationid, i.id]));
    const categoryCache = new Map(webflowCategories.map(i => [i.fieldData['category-id'], i.id]));
    const airportCache  = new Map(webflowAirports.map(i => [i.fieldData.airportid, i.id]));

    const crmEvents = crmEventsRes?.value ?? [];
    if (!crmEvents.length) {
      console.log('No events returned from CRM – nothing to sync.');
      return;
    }

    const webflowEvents = await fetchAllWebflowItemsPaginated(COLLECTION_IDS.EVENTS);
    const eventCache = new Map(webflowEvents.map(i => [i.fieldData.eventid, i.id]));

    console.log(`• ${crmEvents.length} CRM events to process`);
    for (const ev of crmEvents) {
      console.log(`\n→ Processing Event: ${ev.m8_name} (${ev.m8_eventid})`);

      const locationId = ev.m8_eventlocation
        ? await upsertReferenceItem({
            cache: locationCache,
            collectionId: COLLECTION_IDS.LOCATIONS,
            crmIdFieldSlug: 'eventlocationid',
            crmId: ev.m8_eventlocation.m8_eventlocationid,
            name: ev.m8_eventlocation.m8_name,
            additionalFields: {
              address1city:    ev.m8_eventlocation.m8_address1city,
              address1country: ev.m8_eventlocation.m8_address1country,
            },
          })
        : null;

      const categoryIds = await Promise.all(
        (ev.m8_eventcategories || []).map(cat =>
          upsertReferenceItem({
            cache: categoryCache,
            collectionId: COLLECTION_IDS.CATEGORIES,
            crmIdFieldSlug: 'category-id',
            crmId: cat.m8_eventcategoryid,
            name: cat.m8_name,
          }),
        ),
      );

      const airportIds = await Promise.all(
        (ev.m8_airports || []).map(air =>
          upsertReferenceItem({
            cache: airportCache,
            collectionId: COLLECTION_IDS.AIRPORTS,
            crmIdFieldSlug: 'airportid',
            crmId: air.m8_airportid,
            name: air.m8_name,
            additionalFields: {
              iataairport:        air.m8_iataairport,
              iataairportcode:    air.m8_iataairportcode,
              note:               air.m8_note,
              address1city:       air.m8_address1city,
              address1country:    air.m8_address1country,
            },
          }),
        ),
      );

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
        await callWebflowApi('PATCH', `/collections/${COLLECTION_IDS.EVENTS}/items/${webflowId}`, {
          fieldData,
        });
        await publishItem(COLLECTION_IDS.EVENTS, webflowId);
        console.log('   ↻ updated & published');
      } else {
        const { id: newId } = await callWebflowApi('POST', `/collections/${COLLECTION_IDS.EVENTS}/items`, {
          isArchived: false,
          isDraft: false,
          fieldData,
        });
        await publishItem(COLLECTION_IDS.EVENTS, newId);
        console.log('   ✓ created & published');
      }
    }
    console.log('\n✅  Full sync complete.');

  } catch (error) {
    console.error('\n❌ A critical error occurred during the sync process:', error);
  }
}

module.exports = syncFull;

if (require.main === module) {
  syncFull().catch(err => {
    console.error('\n❌  Sync failed:', err);
  });
}
