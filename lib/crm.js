require('dotenv').config();

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

// --- NEW FUNCTION TO GET USER INFO ---
/**
 * Calls the WhoAmI function in CRM to get the current user's details.
 * @returns {Promise<object>} The response containing UserId, BusinessUnitId, and OrganizationId.
 */
async function getWhoAmI() {
    const token = await getAccessToken();
    // WhoAmI is a GET request and has no body.
    return callCrm('WhoAmI', token, 'GET');
}


// --- Simplified Custom API Functions ---

async function getEvents(filterIds) {
  // Each function gets its own token just before it's called
  const token = await getAccessToken();
  let body = null;
  if (filterIds && filterIds.length > 0) {
    body = { entityids: filterIds };
  }
  return callCrm('m8_GetEventsV1', token, 'POST', body);
}

// We only export the functions that are still defined.
module.exports = {
  getAccessToken,
  callCrm,
  getEvents,
  getWhoAmI, // Export the new function
};

// --- UPDATED EXAMPLE USAGE ---
(async () => {
  // This block only runs when the script is executed directly.
  if (require.main === module) {
    try {
      console.log("--- Step 1: Checking User Identity ---");
      const userInfo = await getWhoAmI();
      if (userInfo && userInfo.UserId) {
        console.log(`✅ Successfully connected. The UserID for this request is: ${userInfo.UserId}`);
        console.log("You can now confidently use this UserID in your email.");
      } else {
         console.warn("Could not determine UserID. Response was:", userInfo);
      }

      console.log("\n--- Step 2: Testing Get All Active Events ---");
      // Calling getEvents without an argument to get all active events
      const allEvents = await getEvents();
      console.log("Response for All Active Events:", JSON.stringify(allEvents, null, 2));

    } catch (error) {
      console.error("\nAn error occurred in the main execution block:", error.message);
    }
  }
})();
