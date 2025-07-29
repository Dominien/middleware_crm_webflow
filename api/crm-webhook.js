// api/crm-webhook.js (Serverless Function for Vercel)
// v3.0 - Updated to handle 'environment' for Production/Staging syncs

require('dotenv').config();
const jwt = require('jsonwebtoken');
const { waitUntil } = require('@vercel/functions');
const syncSingleEvent = require('../scripts/sync_single');

module.exports = async (req, res) => {
  // 1. Validate HTTP Method
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // 2. Validate Authorization Header and JWT Secret
  const auth = req.headers.authorization;
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    console.error('JWT_SECRET missing in env');
    return res.status(500).send('Server config error');
  }

  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).send('Unauthorized: Bearer token missing or malformed.');
  }

  try {
    // 3. Verify the JWT and extract payload
    const token = auth.split(' ')[1];
    const payload = jwt.verify(token, secret);

    // 4. Validate the Payload Content, now including 'environment'
    const requiredFields = ['entityName', 'recordId', 'changeType', 'environment'];
    const missingFields = requiredFields.filter(field => !payload[field]);

    if (missingFields.length > 0) {
      console.warn(`Webhook rejected due to missing fields: ${missingFields.join(', ')}`);
      return res.status(400).json({
        message: 'Bad Request: Payload missing required fields.',
        missing: missingFields,
      });
    }

    // 5. If valid, accept the webhook and start the background task
    console.log('✅ CRM webhook accepted:', payload);

    // We only care about the 'Event' entity for now
    if (payload.entityName !== 'Event') {
        console.log(`  -> Ignoring webhook for entity '${payload.entityName}'. No action taken.`);
        return res.status(200).json({ message: 'Webhook received but not applicable to this endpoint.'});
    }

    /*
     * ✅ Use waitUntil() to trigger the targeted sync, passing the recordId,
     * changeType, AND the environment for a precise, targeted action.
     */
    waitUntil(
      // Pass all three parameters to the sync function
      syncSingleEvent(payload.recordId, payload.changeType, payload.environment)
        .then(() => console.log(`✔︎ Sync (${payload.changeType}) for ${payload.recordId} on [${payload.environment}] finished successfully.`))
        .catch(err => console.error(`❌ A critical error occurred during the background sync for ${payload.recordId} on [${payload.environment}]:`, err))
    );

    // 6. Respond immediately to the sender.
    return res.status(202).json({
      message: `Targeted sync for [${payload.environment}] triggered successfully and is running in the background.`
    });

  } catch (err) {
    console.error('JWT verification error:', err.message);
    return res.status(401).send('Unauthorized: Invalid token.');
  }
};