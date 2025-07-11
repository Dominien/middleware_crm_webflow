// api/crm-webhook.js (Serverless Function for Vercel)
// v2.0 - Updated to handle targeted syncs for Create, Update, and Delete

require('dotenv').config();
const jwt = require('jsonwebtoken');
const { waitUntil } = require('@vercel/functions');
const syncSingleEvent = require('../scripts/sync_single'); // ⬅️ IMPORTANT: Points to the new script

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

    // 4. Validate the Payload Content
    const requiredFields = ['entityName', 'recordId', 'changeType'];
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
     * ✅ Use waitUntil() to trigger the targeted sync, passing both the
     * recordId and the changeType for precise action.
     */
    waitUntil(
      // Pass both the ID and the change type to the sync function
      syncSingleEvent(payload.recordId, payload.changeType)
        .then(() => console.log(`✔︎ Sync (${payload.changeType}) for ${payload.recordId} finished successfully.`))
        .catch(err => console.error(`❌ A critical error occurred during the background sync for ${payload.recordId}:`, err))
    );

    // 6. Respond immediately to the sender.
    return res.status(202).json({
      message: 'Targeted sync triggered successfully and is running in the background.'
    });

  } catch (err) {
    console.error('JWT verification error:', err.message);
    return res.status(401).send('Unauthorized: Invalid token.');
  }
};