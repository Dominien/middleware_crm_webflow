// api/crm-webhook.js  (Serverless Function for Vercel)
require('dotenv').config();
const jwt = require('jsonwebtoken');
const syncFull = require('../scripts/sync_full');     // ⬅️  adjust the path if needed

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const auth = req.headers.authorization;
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    console.error('JWT_SECRET missing in env');
    return res.status(500).send('Server config error');
  }
  if (!auth?.startsWith('Bearer ')) return res.status(401).send('Unauthorized');

  try {
    const token = auth.split(' ')[1];
    const payload = jwt.verify(token, secret);

    // (Optional) quick sanity-check of the payload
    if (!payload?.entityName) {
      return res.status(400).json({ message: 'Bad payload', payload });
    }

    console.log('✅ CRM webhook accepted:', payload);

    /*
     * Kick off the long-running sync **without** blocking the webhook:
     *  – fire-and-forget → let the function return immediately (202 Accepted)
     *  – any errors are only logged to Vercel
     */
    syncFull()
      .then(() => console.log('✔︎ Full CRM → Webflow sync finished'))
      .catch(err => console.error('✘ Sync failed:', err));

    return res.status(202).json({ message: 'Sync triggered' });
  } catch (err) {
    console.error('JWT error:', err);
    return res.status(401).send('Unauthorized');
  }
};
