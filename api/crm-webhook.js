// api/crm-webhook.js
const jwt = require('jsonwebtoken');

module.exports = (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const authHeader = req.headers.authorization;
  const secretKey = process.env.JWT_SECRET; // Wichtig: Secret Key aus Umgebungsvariable!

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

    // Überprüfe, ob die erwarteten Felder vorhanden sind
    if (!decoded || !decoded.entityName || !decoded.recordId || !decoded.changeType) {
      console.error('JWT Payload missing required fields:', decoded);
      return res.status(400).json({ message: 'Bad Request: JWT Payload is missing required fields (entityName, recordId, changeType).', decoded });
    }

    const { entityName, recordId, changeType } = decoded;
    console.log('Decoded JWT Payload:', decoded);
    console.log(`Änderung in ${entityName} mit ID ${recordId} (${changeType})`);

    // Hier kommt deine Logik zur Weiterverarbeitung der Daten (z.B. an die Webflow API)
    // ...

    res.status(200).json({ message: 'Webhook received and processed.', data: { entityName, recordId, changeType } });
  });
};