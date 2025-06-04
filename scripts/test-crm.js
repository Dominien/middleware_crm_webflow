const { getEvents } = require('../lib/crm');

getEvents()
  .then(data => {
    console.log('Events response:', JSON.stringify(data, null, 2));
  })
  .catch(err => {
    console.error('CRM connection error:', err.message);
  });
