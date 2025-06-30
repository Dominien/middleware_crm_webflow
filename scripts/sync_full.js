/**
 * sync_full.js  – v2.9 (30 Jun 2025)
 * One-way, full sync from Dynamics CRM → Webflow CMS
 * - FINAL DEBUGGING: Added granular logging inside callWebflowApi to pinpoint the exact line of failure.
 * - BUGFIX: Corrected a typo in the environment variable check (WEBFLOW_COLlection_ID_CATEGORIES).
 * - Re-instated a longer timeout as a safeguard.
 */

require('dotenv').config();
const { getEvents } = require('../lib/crm');
const fetch = require('node-fetch');

// --- Helpers ---------------------------------------------------------------
const webflowApiBase = 'https://api.webflow.com/v2';

// MODIFIED FOR FINAL DEBUGGING: Granular logging and timeout re-instated.
async function callWebflowApi(method, endpoint, body = null) {
  console.log(`      -> Preparing to call: ${method} ${endpoint}`);
  const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000); // 45-second timeout

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
    console.log(`      -> Sending fetch request to ${endpoint}...`);
    const res = await fetch(`${webflowApiBase}${endpoint}`, options);
    console.log(`      -> Received response from ${endpoint} with status: ${res.status}`);

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`      -> Response not OK. Body: ${errorText}`);
      throw new Error(`Webflow API ${res.status} → ${errorText}`);
    }
    
    if (res.status === 204) {
        console.log(`      -> Endpoint ${endpoint} returned 204 No Content.`);
        return null;
    }

    console.log(`      -> Parsing JSON response from ${endpoint}...`);
    const jsonResponse = await res.json();
    console.log(`      -> JSON parsed successfully for ${endpoint}.`);
    return jsonResponse;

  } catch (error) {
     if (error.name === 'AbortError') {
        const errorMessage = `Webflow API call to ${endpoint} timed out after 45 seconds.`;
        console.error(errorMessage);
        throw new Error(errorMessage);
     }
    console.error(`      -> CRITICAL ERROR during Webflow API call to endpoint: ${endpoint}`, error);
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
        console.log(`   -> Fetching page for collection ${collectionId} (offset: ${offset})...`);
        const response = await callWebflowApi('GET', `/collections/${collectionId}/items?limit=${limit}&offset=${offset}`);
        
        if (response && response.items && response.items.length > 0) {
            allItems = allItems.concat(response.items);
            offset += response.items.length;
        }
        
        hasMore = response && response.pagination && (offset < response.pagination.total);
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
    // Step 1: Check all required environment variables
    const requiredEnvVars = {
      WEBFLOW_API_TOKEN: process.env.WEBFLOW_API_TOKEN,
      WEBFLOW_COLLECTION_ID_EVENTS: process.env.WEBFLOW_COLLECTION_ID_EVENTS,
      WEBFLOW_COLLECTION_ID_LOCATIONS: process.env.WEBFLOW_COLLECTION_ID_LOCATIONS,
      // BUGFIX: Corrected typo from 'WEBFLOW_COLlection_ID_CATEGORIES'
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
    console.log('   ✓ All environment variables (CRM & Webflow) are present.');

    const COLLECTION_IDS = {
      EVENTS: requiredEnvVars.WEBFLOW_COLLECTION_ID_EVENTS,
      LOCATIONS: requiredEnvVars.WEBFLOW_COLLECTION_ID_LOCATIONS,
      CATEGORIES: requiredEnvVars.WEBFLOW_COLLECTION_ID_CATEGORIES,
      AIRPORTS: requiredEnvVars.WEBFLOW_COLLECTION_ID_AIRPORTS,
    };

    // Step 2: Fetch all data SEQUENTIALLY to isolate issues
    console.log('--- STARTING SEQUENTIAL FETCH ---');
    
    console.log('[1/4] Fetching Webflow Locations...');
    const webflowLocations = await fetchAllWebflowItemsPaginated(COLLECTION_IDS.LOCATIONS);
    console.log(`   ✓ Webflow Locations fetched: ${webflowLocations.length} total items.`);
    
    console.log('[2/4] Fetching Webflow Categories...');
    const webflowCategories = await fetchAllWebflowItemsPaginated(COLLECTION_IDS.CATEGORIES);
    console.log(`   ✓ Webflow Categories fetched: ${webflowCategories.length} total items.`);

    console.log('[3/4] Fetching Webflow Airports...');
    const webflowAirports = await fetchAllWebflowItemsPaginated(COLLECTION_IDS.AIRPORTS);
    console.log(`   ✓ Webflow Airports fetched: ${webflowAirports.length} total items.`);

    console.log('[4/4] Fetching CRM Events...');
    const crmEventsRes = await getEvents();
    console.log('   ✓ CRM Events fetched.');

    console.log('--- SEQUENTIAL FETCH COMPLETE ---');
    
    // Step 3: Process the fetched data
    const locationCache = new Map(webflowLocations.map(i => [i.fieldData.eventlocationid, i.id]));
    const categoryCache = new Map(webflowCategories.map(i => [i.fieldData['category-id'], i.id]));
    const airportCache  = new Map(webflowAirports.map(i => [i.fieldData.airportid, i.id]));

    const crmEvents = crmEventsRes?.value ?? [];
    if (!crmEvents.length) {
      console.log('No events returned from CRM – nothing to sync.');
      return;
    }

    console.log('Fetching main Webflow Event collection to build cache...');
    const webflowEvents = await fetchAllWebflowItemsPaginated(COLLECTION_IDS.EVENTS);
    const eventCache = new Map(webflowEvents.map(i => [i.fieldData.eventid, i.id]));

    console.log(`• ${crmEvents.length} CRM events to process`);
    for (const ev of crmEvents) {
      console.log(`\n→ Processing Event: ${ev.m8_name} (${ev.m8_eventid})`);
      
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
        await callWebflowApi('PATCH', `/collections/${COLLECTION_IDS.EVENTS}/items/${webflowId}`, { fieldData });
        await publishItem(COLLECTION_IDS.EVENTS, webflowId);
        console.log('   ↻ updated & published');
      } else {
        const { id: newId } = await callWebflowApi('POST', `/collections/${COLLECTION_IDS.EVENTS}/items`, { isArchived: false, isDraft: false, fieldData });
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
