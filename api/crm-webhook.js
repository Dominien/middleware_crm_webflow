// api/crm-webhook.js

// --- NEW: Import Express and create a router ---
const express = require('express');
const router = express.Router();

const jwt = require('jsonwebtoken');

// --- NEW: Wrap your logic in a router.post() handler ---
// We use .post() because your original code checked for the POST method.
// The path is '/' because the filename 'crm-webhook' already defines the route path.
router.post('/', (req, res) => {
  // Your original code starts here, everything else is the same.
  const authHeader = req.headers.authorization;
  const secretKey = process.env.JWT_SECRET;

  if (!secretKey) {
    console.error('JWT_SECRET environment variable not set!');
    return res.status(500).send('Server configuration error.');
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized: No Bearer token.' });
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, secretKey, (err, decoded) => {
    if (err) {
      console.error('JWT Verification Error:', err);
      return res.status(401).json({ message: 'Unauthorized: Invalid token.' });
    }

    if (!decoded || !decoded.entityName || !decoded.recordId || !decoded.changeType) {
      console.error('JWT Payload missing required fields:', decoded);
      return res.status(400).json({ message: 'Bad Request: JWT Payload is missing required fields (entityName, recordId, changeType).', decoded });
    }

    const { entityName, recordId, changeType } = decoded;
    console.log('Decoded JWT Payload:', decoded);
    console.log(`Änderung in ${entityName} mit ID ${recordId} (${changeType})`);

    // Your future logic will go here
    // ...

    res.status(200).json({ message: 'Webhook received and processed.', data: { entityName, recordId, changeType } });
  });
});

// --- NEW: Export the router, not the function ---
module.exports = router;