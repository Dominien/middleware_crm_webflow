/**
 * sync_full.js  – v2.3 (29 Jun 2025)
 * One-way, full sync from Dynamics CRM → Webflow CMS
 * - Adds timeouts to Webflow API calls to prevent hangs.
 * - Adds detailed logging to pinpoint slow or failing data fetches.
 * - Still *not* syncing price-level products (handled by middleware at runtime)
 * - Automatically publishes every created/updated item so it’s visible on the live site
 * - Fills `isfullybookedboleantext` (PlainText) with "true" / "false"
 */

require('dotenv').config();
const { getEvents } = require('../lib/crm');
const fetch = require('node-fetch');

// --- Configuration ---------------------------------------------------------
const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
const COLLECTION_IDS = {
  EVENTS:     process.env.WEBFLOW_COLLECTION_ID_EVENTS,
  LOCATIONS:  process.env.WEBFLOW_COLLECTION_ID_LOCATIONS,
  CATEGORIES: process.env.WEBFLOW_COLLECTION_ID_CATEGORIES,
  AIRPORTS:   process.env.WEBFLOW_COLLECTION_ID_AIRPORTS,
};

if (!WEBFLOW_API_TOKEN || Object.values(COLLECTION_IDS).some(v => !v)) {
  console.error('Missing ENV vars: WEBFLOW_API_TOKEN or one of the collection IDs.');
  process.exit(1);
}

// --- Helpers ---------------------------------------------------------------
const webflowApiBase = 'https://api.webflow.com/v2';

// MODIFIED: Added a 20-second timeout to all Webflow API calls.
async function callWebflowApi(method, endpoint, body = null) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20-second timeout

  const options = {
    method,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${WEBFLOW_API_TOKEN}`,
      'content-type': 'application/json',
    },
    signal: controller.signal, // Pass the abort signal to fetch
  };
  if (body) options.body = JSON.stringify(body);

  try {
    const res = await fetch(`${webflowApiBase}${endpoint}`, options);
    if (!res.ok) throw new Error(`Webflow API ${res.status} → ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Webflow API call to ${endpoint} timed out after 20 seconds.`);
    }
    // Re-throw other errors
    throw error;
  } finally {
    // Clear the timeout timer in any case
    clearTimeout(timeoutId);
  }
}

/**
 * Publish the given CMS item so it appears on the live site.
 * Webflow keeps newly‑created / updated items in a *staged* state until
 * they’re explicitly published. This helper ensures they become visible.
 */
async function publishItem(collectionId, itemId) {
  // Webflow accepts an array so we wrap the single ID
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

/**
 * Create, update or fetch a reference item.
 * Uses a cache (Map<crmId, webflowItemId>) to minimise API calls.
 * Newly‑created or updated items are published immediately.
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
    // MODIFIED: Fetch initial data sequentially with detailed logging to find hangs.
    console.log('   -> Fetching Webflow Locations...');
    const locationsRes = await callWebflowApi('GET', `/collections/${COLLECTION_IDS.LOCATIONS}/items`);
    console.log('   ✓ Locations fetched.');

    console.log('   -> Fetching Webflow Categories...');
    const categoriesRes = await callWebflowApi('GET', `/collections/${COLLECTION_IDS.CATEGORIES}/items`);
    console.log('   ✓ Categories fetched.');

    console.log('   -> Fetching Webflow Airports...');
    const airportsRes = await callWebflowApi('GET', `/collections/${COLLECTION_IDS.AIRPORTS}/items`);
    console.log('   ✓ Airports fetched.');

    console.log('   -> Fetching CRM Events (from getEvents)...');
    const crmEventsRes = await getEvents(); // This might still hang if the CRM API is slow and has no timeout
    console.log('   ✓ CRM Events fetched.');


    const locationCache = new Map(locationsRes.items.map(i => [i.fieldData.eventlocationid, i.id]));
    const categoryCache = new Map(categoriesRes.items.map(i => [i.fieldData['category-id'], i.id]));
    const airportCache  = new Map(airportsRes.items .map(i => [i.fieldData.airportid, i.id]));

    const crmEvents = crmEventsRes?.value ?? [];
    if (!crmEvents.length) {
      console.log('No events returned from CRM – nothing to sync.');
      return;
    }

    // Pull current Event items once
    const webflowEvents = await callWebflowApi('GET', `/collections/${COLLECTION_IDS.EVENTS}/items`);
    const eventCache = new Map(webflowEvents.items.map(i => [i.fieldData.eventid, i.id]));

    console.log(`• ${crmEvents.length} CRM events to process`);
    for (const ev of crmEvents) {
      console.log(`\n→ ${ev.m8_name} (${ev.m8_eventid})`);

      /* --------- 1. Upsert Location / Category / Airport references ---------- */
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

      /* ---------------------- 2. Upsert main Event item ---------------------- */
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
    // Catch any error during the sync and log it clearly.
    console.error('\n❌ A critical error occurred during the sync process:', error);
  }
}

// Export the function so it can be `require`'d by other files like the webhook.
module.exports = syncFull;


// ---------------------------------------------------------------------------
// This part allows the script to be run directly from the command line
// using `node scripts/sync_full.js`
if (require.main === module) {
  syncFull().catch(err => {
    console.error('\n❌  Sync failed:', err);
    // process.exit(1) is commented out as it's not ideal for serverless environments
  });
}
