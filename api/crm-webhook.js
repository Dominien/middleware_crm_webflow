// api/crm-webhook.js
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { waitUntil } = require('@vercel/functions'); // ⬅️ IMPORT waitUntil
const syncFull = require('../scripts/sync_full');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // ... (your existing authorization and JWT validation logic remains the same)

  try {
    const token = req.headers.authorization.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    
    // ... (your payload validation remains the same)

    console.log('✅ CRM webhook accepted:', payload);

    /*
     * ✅ CORRECT WAY TO RUN A BACKGROUND TASK ON VERCEL PRO
     * Use waitUntil() to ensure the sync process runs to completion
     * after the response has been sent.
     */
    waitUntil(
      syncFull()
        .then(() => console.log('✔︎ Full CRM → Webflow sync finished successfully.'))
        .catch(err => console.error('❌ A critical error occurred during the background sync:', err))
    );

    // Respond immediately to the sender. The sync now reliably runs in the background.
    return res.status(202).json({ message: 'Sync triggered successfully and is running in the background.' });

  } catch (err) {
    console.error('JWT verification error:', err.message);
    return res.status(401).send('Unauthorized: Invalid token.');
  }
};