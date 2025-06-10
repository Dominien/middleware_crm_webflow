const assert = require('assert');
require('dotenv').config({ path: '.env.example' });

assert.ok(process.env.CRM_TENANT_ID, 'CRM_TENANT_ID missing');
assert.ok(process.env.CRM_CLIENT_ID, 'CRM_CLIENT_ID missing');
assert.ok(process.env.CRM_CLIENT_SECRET, 'CRM_CLIENT_SECRET missing');
assert.ok(process.env.CRM_BASE_URL, 'CRM_BASE_URL missing');
assert.ok(process.env.JWT_SECRET, 'JWT_SECRET missing');

console.log('Environment variable test passed');
