// api/crm-webhook.js  (Serverless Function for Vercel)
// Updated to use waitUntil for reliable background execution on Vercel Pro

require('dotenv').config();
const jwt = require('jsonwebtoken');
const { waitUntil } = require('@vercel/functions'); // ⬅️ IMPORT waitUntil
const syncFull = require('../scripts/sync_full');     // ⬅️ Adjust the path if needed

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
    // 3. Verify the JWT Signature
    const token = auth.split(' ')[1];
    const payload = jwt.verify(token, secret);

    // 4. Validate the Payload Content
    const requiredFields = ['entityName', 'recordId', 'changeType'];
    const missingFields = requiredFields.filter(field => !payload[field]);

    if (missingFields.length > 0) {
      console.warn(`Webhook rejected due to missing fields: ${missingFields.join(', ')}`);
      return res.status(400).json({
        message: `Bad Request: Payload missing required fields.`,
        missing: missingFields,
      });
    }

    // 5. If valid, accept the webhook and start the background task
    console.log('✅ CRM webhook accepted:', payload);

    /*
     * ✅ Use waitUntil() to allow the sync process to run reliably in the
     * background after the response has been sent. This is the correct
     * approach for long-running tasks on Vercel Pro.
     */
    waitUntil(
      syncFull()
        .then(() => console.log('✔︎ Full CRM → Webflow sync finished successfully.'))
        .catch(err => console.error('❌ A critical error occurred during the background sync:', err))
    );

    // 6. Respond immediately to the sender. The sync now runs in the background.
    return res.status(202).json({
      message: 'Sync triggered successfully and is running in the background.'
    });

  } catch (err) {
    // This block catches errors from jwt.verify(), like an invalid signature.
    console.error('JWT verification error:', err.message);
    return res.status(401).send('Unauthorized: Invalid token.');
  }
};