// api/crm-webhook.js  (Serverless Function for Vercel)
require('dotenv').config();
const jwt = require('jsonwebtoken');
const syncFull = require('../scripts/sync_full');     // ⬅️  adjust the path if needed

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

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
    // Step 1: Verify the token's signature.
    // If the secret is wrong, this line will fail and jump to the catch block,
    // causing the '401 Unauthorized' error.
    const token = auth.split(' ')[1];
    const payload = jwt.verify(token, secret);

    // Step 2: NEW - Validate the payload content, as per your documentation.
    // This code only runs if the token's signature was successfully verified in Step 1.
    const requiredFields = ['entityName', 'recordId', 'changeType'];
    const missingFields = requiredFields.filter(field => !payload[field]);

    if (missingFields.length > 0) {
      console.warn(`Webhook rejected due to missing fields: ${missingFields.join(', ')}`);
      return res.status(400).json({
        message: `Bad Request: Payload missing required fields.`,
        missing: missingFields,
      });
    }

    // If both signature and payload are valid, proceed.
    console.log('✅ CRM webhook accepted:', payload);

    /*
     * Kick off the long-running sync **without** blocking the webhook:
     * – fire-and-forget → let the function return immediately (202 Accepted)
     * – any errors are only logged to Vercel
     */
    syncFull()
      .then(() => console.log('✔︎ Full CRM → Webflow sync finished'))
      .catch(err => console.error('✘ Sync failed:', err));

    // Respond immediately to the sender. The sync runs in the background.
    // Note: Your docs mention 200 OK, but 202 Accepted is more appropriate for a
    // background task that has been accepted but not yet completed.
    return res.status(202).json({ message: 'Sync triggered successfully.' });

  } catch (err) {
    // This block catches errors from jwt.verify(), like an invalid signature.
    console.error('JWT verification error:', err.message);
    return res.status(401).send('Unauthorized: Invalid token.');
  }
};
