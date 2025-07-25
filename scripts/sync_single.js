/**
 * sync_single.js – v2.9 (18 Jul 2025)
 * One-way, single-item sync from Dynamics CRM → Webflow CMS
 * - FIXED: Correctly unpublishes items using the `DELETE .../items/:id/live` endpoint, which also sets the item to draft.
 * - MODIFIED: Unpublished events are now set to a draft state instead of being archived.
 * - FIXED: The root cause of the sync failure. The script now handles the fact that the CRM
 * returns a list of ALL published events, by filtering this list for the specific event ID
 * being synced.
 * - ADDED: More specific logging to show the total events returned and the result of the filtering step.
 */

require('dotenv').config();
const { getEvents } = require('../lib/crm');
const axios =require('axios');

// --- Helper Functions ------------------------------------------------------
const webflowApiBase = 'https://api.webflow.com/v2';

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
      await new Promise(resolve => setTimeout(resolve, 1100));
      const response = await axios(options);
      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 429) {
        attempt++;
        const retryAfter = error.response.headers['retry-after'];
        const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : (2 ** attempt) * 1000;
        console.warn(`      -> Rate limit hit. Retrying after ${waitTime / 1000}s... (Attempt ${attempt}/${maxRetries})`);
        if (attempt >= maxRetries) throw error;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        if (error.response) console.error(`      -> Webflow API Error: ${error.response.status}`, error.response.data);
        else console.error('      -> Axios request setup error:', error.message);
        throw error;
      }
    }
  }
  throw new Error('Exited retry loop unexpectedly in callWebflowApi.');
}

async function fetchAllWebflowItemsPaginated(collectionId) {
  let allItems = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;
  while (hasMore) {
    const response = await callWebflowApi('GET', `/collections/${collectionId}/items?limit=${limit}&offset=${offset}`);
    if (response?.items?.length > 0) {
      allItems = allItems.concat(response.items);
      offset += response.items.length;
    }
    hasMore = response?.pagination && (offset < response.pagination.total);
  }
  return allItems;
}

async function publishItem(collectionId, itemId) {
  await callWebflowApi('POST', `/collections/${collectionId}/items/publish`, { itemIds: [itemId] });
}

const slugify = txt => (txt || '').toString().toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-').replace(/^-+|-+$/g, '');

async function upsertReferenceItem({ cache, collectionId, crmIdFieldSlug, crmId, name, additionalFields = {} }) {
  if (!crmId) return null;
  const fieldData = { name, slug: slugify(name), [crmIdFieldSlug]: crmId, ...additionalFields };
  if (cache.has(crmId)) {
    const webflowId = cache.get(crmId);
    await callWebflowApi('PATCH', `/collections/${collectionId}/items/${webflowId}`, { fieldData });
    await publishItem(collectionId, webflowId);
    return webflowId;
  }
  console.log(`    ↳ Creating new reference item: “${name}” (${crmId})`);
  const { id } = await callWebflowApi('POST', `/collections/${collectionId}/items`, { isArchived: false, isDraft: false, fieldData });
  cache.set(crmId, id);
  await publishItem(collectionId, id);
  return id;
}

async function deleteWebflowItem(collectionId, itemId) {
  await callWebflowApi('DELETE', `/collections/${collectionId}/items/${itemId}`);
}

// --- Main Sync Logic -------------------------------------------------------

async function syncSingleEvent(eventId, changeType = 'Update') {
  if (!eventId) {
    console.error('❌ Sync aborted: No Event ID was provided.');
    return;
  }

  try {
    console.log(`🔄 Single Event Sync started for ID: ${eventId} (Type: ${changeType})`);

    const COLLECTION_IDS = {
        EVENTS: process.env.WEBFLOW_COLLECTION_ID_EVENTS,
        LOCATIONS: process.env.WEBFLOW_COLLECTION_ID_LOCATIONS,
        CATEGORIES: process.env.WEBFLOW_COLLECTION_ID_CATEGORIES,
        AIRPORTS: process.env.WEBFLOW_COLLECTION_ID_AIRPORTS,
    };

    if (changeType === 'Delete') {
      console.log(`    [1/1] Processing DELETE request for event ${eventId}`);
      const webflowEvents = await fetchAllWebflowItemsPaginated(COLLECTION_IDS.EVENTS);
      const eventCache = new Map(webflowEvents.map(i => [i.fieldData.eventid, i.id]));

      if (eventCache.has(eventId)) {
        const webflowId = eventCache.get(eventId);
        console.log(`    → Found matching item in Webflow (ID: ${webflowId}). Deleting...`);
        await deleteWebflowItem(COLLECTION_IDS.EVENTS, webflowId);
        console.log('    ✓ Item successfully deleted from Webflow.');
      } else {
        console.warn(`    ⚠️ Could not find item in Webflow with CRM ID ${eventId} to delete. No action taken.`);
      }
      return;
    }

    console.log('[1/3] Fetching Webflow reference collections...');
    const [webflowLocations, webflowCategories, webflowAirports] = await Promise.all([
        fetchAllWebflowItemsPaginated(COLLECTION_IDS.LOCATIONS),
        fetchAllWebflowItemsPaginated(COLLECTION_IDS.CATEGORIES),
        fetchAllWebflowItemsPaginated(COLLECTION_IDS.AIRPORTS)
    ]);
    console.log('    ✓ Caches for reference collections are ready.');

    console.log('[2/3] Fetching Webflow event collection...');
    const webflowEvents = await fetchAllWebflowItemsPaginated(COLLECTION_IDS.EVENTS);
    const eventCache = new Map(webflowEvents.map(i => [i.fieldData.eventid, i.id]));
    console.log('    ✓ Webflow event cache is ready.');

    console.log(`[3/3] Fetching event ${eventId} from CRM and processing...`);
    const crmEventsRes = await getEvents({ entityids: [eventId] });
    
    const allPublishedEvents = crmEventsRes?.value ?? [];
    console.log(`    ↳ CRM returned a list of ${allPublishedEvents.length} total published event(s).`);

    const crmEvents = allPublishedEvents.filter(event => event.m8_eventid === eventId);
    console.log(`    ↳ Found ${crmEvents.length} matching event(s) for ID ${eventId}.`);

    // If the filtered array is empty, the specific event is not published. Unpublish it and set to draft.
    if (!crmEvents.length) {
      console.log(`    → Decision: Event ID ${eventId} was not found in the list of published events. Unpublishing...`);
      if (eventCache.has(eventId)) {
        const webflowId = eventCache.get(eventId);
        console.log(`    → Found Webflow item ${webflowId}. Unpublishing via DELETE .../live endpoint...`);

        // This endpoint unpublishes the item AND sets it to draft.
        const endpoint = `/collections/${COLLECTION_IDS.EVENTS}/items/${webflowId}/live`;
        
        await callWebflowApi('DELETE', endpoint); // No payload needed for this DELETE request.

        console.log('    ✓ Item successfully unpublished and moved to drafts.');
      } else {
        console.warn(`    ⚠️ Event is unpublished, but no matching item found in Webflow to unpublish for ID ${eventId}. No action taken.`);
      }
      return;
    }

    // If we reach here, the event was found in the published list and should be created/updated.
    const ev = crmEvents[0];
    console.log(`    ✓ Found CRM Event: "${ev.m8_name}"`);
    console.log(`    → Decision: Event data found in CRM. It will be created/updated and published in Webflow.`);
    
    const locationCache = new Map(webflowLocations.map(i => [i.fieldData.eventlocationid, i.id]));
    const categoryCache = new Map(webflowCategories.map(i => [i.fieldData['category-id'], i.id]));
    const airportCache = new Map(webflowAirports.map(i => [i.fieldData.airportid, i.id]));

    const locationId = ev.m8_eventlocation ? await upsertReferenceItem({ cache: locationCache, collectionId: COLLECTION_IDS.LOCATIONS, crmIdFieldSlug: 'eventlocationid', crmId: ev.m8_eventlocation.m8_eventlocationid, name: ev.m8_eventlocation.m8_name, additionalFields: { address1city: ev.m8_eventlocation.m8_address1city, address1country: ev.m8_eventlocation.m8_address1country } }) : null;
    const categoryIds = await Promise.all((ev.m8_eventcategories || []).map(cat => upsertReferenceItem({ cache: categoryCache, collectionId: COLLECTION_IDS.CATEGORIES, crmIdFieldSlug: 'category-id', crmId: cat.m8_eventcategoryid, name: cat.m8_name })));
    const airportIds = await Promise.all((ev.m8_airports || []).map(air => upsertReferenceItem({ cache: airportCache, collectionId: COLLECTION_IDS.AIRPORTS, crmIdFieldSlug: 'airportid', crmId: air.m8_airportid, name: air.m8_name, additionalFields: { iataairport: air.m8_iataairport, iataairportcode: air.m8_iataairportcode, note: air.m8_note, address1city: air.m8_address1city, address1country: air.m8_address1country } })));

    const fieldData = { name: ev.m8_name, slug: slugify(ev.m8_name), eventid: ev.m8_eventid, startdate: ev.m8_startdate, enddate: ev.m8_enddate, startingamount: ev.m8_startingamount, drivingdays: ev.m8_drivingdays, eventbookingstatuscode: ev.m8_eventbookingstatuscode, isflightincluded: ev.m8_isflightincluded, iseventpublished: ev.m8_iseventpublished, isaccommodationandcateringincluded: ev.m8_isaccommodationandcateringincluded, isfullybooked: ev.m8_isfullybooked, isfullybookedboleantext: ev.m8_isfullybooked ? 'true' : 'false', availablevehicles: ev.m8_availablevehicles, categorie: categoryIds.filter(Boolean), airport: airportIds.filter(Boolean), location: locationId ? [locationId] : [], };

    // Create or update the item in Webflow and ensure it is published.
    if (eventCache.has(ev.m8_eventid)) {
      const webflowId = eventCache.get(ev.m8_eventid);
      console.log(`    → Updating and publishing item ${webflowId}...`);
      await callWebflowApi('PATCH', `/collections/${COLLECTION_IDS.EVENTS}/items/${webflowId}`, {
        isArchived: false,
        isDraft: false,
        fieldData
      });
      await publishItem(COLLECTION_IDS.EVENTS, webflowId);
      console.log('    ✓ Updated & published successfully.');
    } else {
      console.log('    → Event not found in Webflow. Creating new item...');
      const { id: newId } = await callWebflowApi('POST', `/collections/${COLLECTION_IDS.EVENTS}/items`, { isArchived: false, isDraft: false, fieldData });
      await publishItem(COLLECTION_IDS.EVENTS, newId);
      console.log('    ✓ Created & published successfully.');
    }

  } catch (error) {
    console.error(`\n❌ A critical error occurred during the sync for event ${eventId} (Type: ${changeType}).`);
    console.error(`❌ Error Message: ${error.message}`);
    throw error;
  } finally {
    console.log(`\n✅  Sync operation complete for ${eventId}.`);
  }
}

module.exports = syncSingleEvent;

if (require.main === module) {
  const eventId = process.argv[2];
  const changeType = process.argv[3] || 'Update';
  if (!eventId) {
    console.error('Usage: node scripts/sync_single.js <event-id> [Create|Update|Delete]');
    process.exit(1);
  }
  syncSingleEvent(eventId, changeType).catch(() => process.exit(1));
}