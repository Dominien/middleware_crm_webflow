require('dotenv').config();
const fetch = require('node-fetch');

const TENANT_ID = process.env.CRM_TENANT_ID;
const CLIENT_ID = process.env.CRM_CLIENT_ID;
const CLIENT_SECRET = process.env.CRM_CLIENT_SECRET;
const CRM_BASE_URL = process.env.CRM_BASE_URL;

if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET || !CRM_BASE_URL) {
  console.warn('CRM environment variables are not fully configured.');
}

const tokenEndpoint = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;

async function getAccessToken() {
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
      'OData-Version': '4.0'
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
    throw new Error(`CRM request to ${endpoint} failed: ${res.status} ${text}`);
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

// --- NEW FUNCTIONS FOR OTHER ENDPOINTS ---

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


// We export all functions now
module.exports = {
  getAccessToken,
  callCrm,
  getWhoAmI,
  getEvents,
  getEventPriceLevel,
  getEventCategories,
  getEventLocations,
  getAirports,
};

// --- UPDATED EXAMPLE USAGE ---
(async () => {
  if (require.main === module) {
    try {
      console.log("--- Step 1: Checking User Identity ---");
      const userInfo = await getWhoAmI();
      if (userInfo && userInfo.UserId) {
        console.log(`✅ Successfully connected. UserID: ${userInfo.UserId}`);
      } else {
         console.warn("Could not determine UserID. Response was:", userInfo);
      }

      console.log("\n--- Step 2: Testing Get All Active Events ---");
      const allEventsResponse = await getEvents();
      console.log("Response for All Active Events:", JSON.stringify(allEventsResponse, null, 2));

      // --- NEW: Test other endpoints if we have an event ID ---
      if (allEventsResponse && allEventsResponse.value && allEventsResponse.value.length > 0) {
        const testEventId = allEventsResponse.value[0].m8_eventid;
        console.log(`\n--- Step 3: Testing other endpoints using Event ID: ${testEventId} ---`);

        // Test GetEventPriceLevel
        console.log("\n--- Testing GetEventPriceLevel ---");
        const priceLevelResponse = await getEventPriceLevel(testEventId);
        console.log("Response for GetEventPriceLevel:", JSON.stringify(priceLevelResponse, null, 2));
      } else {
        console.log("\nSkipping endpoint tests that require an Event ID, as no events were found.");
      }

      // --- NEW: Test endpoints that can be called without IDs ---
      console.log("\n--- Step 4: Testing other list endpoints ---");

      console.log("\n--- Testing GetEventCategories (All) ---");
      const categoriesResponse = await getEventCategories();
      console.log("Response for GetEventCategories:", JSON.stringify(categoriesResponse, null, 2));

      console.log("\n--- Testing GetEventLocations (All) ---");
      const locationsResponse = await getEventLocations();
      console.log("Response for GetEventLocations:", JSON.stringify(locationsResponse, null, 2));
      
      console.log("\n--- Testing GetAirports (All) ---");
      const airportsResponse = await getAirports();
      console.log("Response for GetAirports:", JSON.stringify(airportsResponse, null, 2));


    } catch (error) {
      console.error("\n❌ An error occurred in the main execution block:", error.message);
    }
  }
})();