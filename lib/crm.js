require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const TENANT_ID = process.env.CRM_TENANT_ID;
const CLIENT_ID = process.env.CRM_CLIENT_ID;
const CLIENT_SECRET = process.env.CRM_CLIENT_SECRET;
const CRM_BASE_URL = process.env.CRM_BASE_URL;

if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET || !CRM_BASE_URL) {
  console.warn('CRM environment variables are not fully configured.');
}

// ----------------------------------------
// Helper: Persist large responses to file
// ----------------------------------------
function saveResponseToFile(data, filenamePrefix = 'crm-response') {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputDir = path.resolve(__dirname, '../logs');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filePath = path.join(outputDir, `${filenamePrefix}-${timestamp}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`\n📝 Full response saved to ${filePath}`);
  } catch (err) { // ⬅️ CORRECTED: Added the missing opening brace
    console.error('❌ Failed to write output file:', err);
  }
}

const tokenEndpoint = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;

async function getAccessToken() {
  // ⬇️ ADDED FOR DEBUGGING: This will log the credentials being used to the Vercel console.
  console.log(`[DEBUG] Authenticating with TENANT_ID: ${TENANT_ID} and CLIENT_ID ending in ...${CLIENT_ID?.slice(-4)}`);

  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET || !CRM_BASE_URL) {
    throw new Error('Cannot get access token: CRM environment variables are not fully configured.');
  }
  const params = new URLSearchParams();
  params.append('client_id', CLIENT_ID);
  params.append('client_secret', CLIENT_SECRET);
  params.append('grant_type', 'client_credentials');

  const resourceRoot = CRM_BASE_URL.match(/^(https?:\/\/[^\/]+)/);
  if (!resourceRoot) {
    throw new Error('Could not determine resource root from CRM_BASE_URL for token scope.');
  }
  params.append('scope', `${resourceRoot[0]}/.default`);

  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token request failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

async function callCrm(endpoint, token, method = 'POST', body = null) {
  if (!CRM_BASE_URL) {
    throw new Error('Cannot call CRM: CRM_BASE_URL is not configured.');
  }
  const fullUrl = `${CRM_BASE_URL}/${endpoint}`;
  console.log(`Calling CRM: ${method} ${fullUrl}`);

  const options = {
    method: method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
     'OData-MaxVersion': '4.0',
      'OData-Version': '4.0' // CORRECTED: Was '4.O
    },
  };

  if (body && method !== 'GET') {
    console.log('Request Body:', JSON.stringify(body, null, 2));
    options.headers['Content-Type'] = 'application/json; charset=utf-8';
    options.body = JSON.stringify(body);
  } else {
    console.log('Request Body: None');
  }

  const res = await fetch(fullUrl, options);

  if (!res.ok) {
    const text = await res.text();
    console.error(`CRM request to ${endpoint} failed: ${res.status} ${text}`);
    // IMPORTANT: Throw the raw text so the handler can try to parse it as JSON
    throw new Error(`CRM request to ${endpoint} failed: ${text}`);
  }

  if (res.status === 204) {
    return null;
  }

  try {
    const jsonResponse = await res.json();
    return jsonResponse;
  } catch (e) {
    console.error(`CRM request to ${endpoint} succeeded but response was not valid JSON. Status: ${res.status}`);
    throw new Error(`CRM request to ${endpoint} succeeded but response was not valid JSON. Status: ${res.status}`);
  }
}

// --- API Functions ---

async function getWhoAmI() {
    const token = await getAccessToken();
    return callCrm('WhoAmI', token, 'GET');
}

async function getEvents(filterIds) {
  const token = await getAccessToken();
  let body = null;
  if (filterIds && filterIds.length > 0) {
    body = { entityids: filterIds };
  }
  return callCrm('m8_GetEventsV1', token, 'POST', body);
}

async function getEventPriceLevel(eventId) {
  if (!eventId) {
    throw new Error("eventId is required for getEventPriceLevel.");
  }
  const token = await getAccessToken();
  const body = { eventId: eventId };
  return callCrm('m8_GetEventPriceLevelV1', token, 'POST', body);
}

async function getEventCategories(filterIds) {
  const token = await getAccessToken();
  let body = null;
  if (filterIds && filterIds.length > 0) {
    body = { entityids: filterIds };
  }
  return callCrm('m8_GetEventCategoriesV1', token, 'POST', body);
}

async function getEventLocations(filterIds) {
  const token = await getAccessToken();
  let body = null;
  if (filterIds && filterIds.length > 0) {
    body = { entityids: filterIds };
  }
  return callCrm('m8_GetEventLocationsV1', token, 'POST', body);
}

async function getAirports(filterIds) {
  const token = await getAccessToken();
  let body = null;
  if (filterIds && filterIds.length > 0) {
    body = { entityids: filterIds };
  }
  return callCrm('m8_GetAirportsV1', token, 'POST', body);
}

async function submitSalesOrder(salesOrderData) {
  if (!salesOrderData) {
    throw new Error("salesOrderData is required.");
  }
  const token = await getAccessToken();
  return callCrm('m8_SubmitSalesOrderV2', token, 'POST', salesOrderData);
}


// --- EXPORTS ---
module.exports = {
  getAccessToken,
  callCrm,
  getWhoAmI,
  getEvents,
  getEventPriceLevel,
  getEventCategories,
  getEventLocations,
  getAirports,
  submitSalesOrder
};


// --- UPDATED EXAMPLE USAGE ---
(async () => {
  if (require.main === module) {
    const outputSummary = {}; // collect everything here

    try {
      console.log("--- Step 1: Checking User Identity ---");
      const userInfo = await getWhoAmI();
      outputSummary.userInfo = userInfo;

      if (userInfo && userInfo.UserId) {
        console.log(`✅ Successfully connected. UserID: ${userInfo.UserId}`);
      } else {
         console.warn("Could not determine UserID. Response was:", userInfo);
      }

      console.log("\n--- Step 2: Testing Get All Active Events ---");
      const allEventsResponse = await getEvents();
      outputSummary.allEvents = allEventsResponse;
      console.log("Response for All Active Events:", JSON.stringify(allEventsResponse, null, 2));

      if (allEventsResponse && allEventsResponse.value && allEventsResponse.value.length > 0) {
        const testEventId = allEventsResponse.value[0].m8_eventid;
        console.log(`\n--- Step 3: Testing other endpoints using Event ID: ${testEventId} ---`);

        // Test GetEventPriceLevel
        console.log("\n--- Testing GetEventPriceLevel ---");
        const priceLevelResponse = await getEventPriceLevel(testEventId);
        outputSummary.priceLevel = priceLevelResponse;
        console.log("Response for GetEventPriceLevel:", JSON.stringify(priceLevelResponse, null, 2));
      } else {
        console.log("\nSkipping endpoint tests that require an Event ID, as no events were found.");
      }

      // --- NEW: Test endpoints that can be called without IDs ---
      console.log("\n--- Step 4: Testing other list endpoints ---");

      console.log("\n--- Testing GetEventCategories (All) ---");
      const categoriesResponse = await getEventCategories();
      outputSummary.categories = categoriesResponse;
      console.log("Response for GetEventCategories:", JSON.stringify(categoriesResponse, null, 2));

      console.log("\n--- Testing GetEventLocations (All) ---");
      const locationsResponse = await getEventLocations();
      outputSummary.locations = locationsResponse;
      console.log("Response for GetEventLocations:", JSON.stringify(locationsResponse, null, 2));

      console.log("\n--- Testing GetAirports (All) ---");
      const airportsResponse = await getAirports();
      outputSummary.airports = airportsResponse;
      console.log("Response for GetAirports:", JSON.stringify(airportsResponse, null, 2));

      // ---------------------------------------------
      // Persist everything we collected to a file
      // ---------------------------------------------
      saveResponseToFile(outputSummary);

    } catch (error) {
      console.error("\n❌ An error occurred in the main execution block:", error.message);
      outputSummary.error = error.message;
      // Try to persist even on error so we have context
      saveResponseToFile(outputSummary, 'crm-error');
    }
  }
})();
