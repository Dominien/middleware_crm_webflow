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
  const params = new URLSearchParams();
  params.append('client_id', CLIENT_ID);
  params.append('client_secret', CLIENT_SECRET);
  params.append('grant_type', 'client_credentials');
  params.append('scope', `${CRM_BASE_URL}/.default`);

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

async function callCrm(endpoint, token) {
  const res = await fetch(`${CRM_BASE_URL}/${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CRM request failed: ${res.status} ${text}`);
  }

  return res.json();
}

async function getEvents() {
  const token = await getAccessToken();
  return callCrm('m8_GetEventsV1', token);
}

async function getEventPriceLevel() {
  const token = await getAccessToken();
  return callCrm('m8_GetEventPriceLevelV1', token);
}

async function getEventCategories() {
  const token = await getAccessToken();
  return callCrm('m8_GetEventCategoriesV1', token);
}

async function getEventLocations() {
  const token = await getAccessToken();
  return callCrm('m8_GetEventLocationsV1', token);
}

async function getAirports() {
  const token = await getAccessToken();
  return callCrm('m8_GetAirportsV1', token);
}

module.exports = {
  getAccessToken,
  getEvents,
  getEventPriceLevel,
  getEventCategories,
  getEventLocations,
  getAirports,
};
