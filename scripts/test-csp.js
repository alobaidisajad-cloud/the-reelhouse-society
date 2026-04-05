const https = require('https');
https.get('https://thereelhousesociety.com', (res) => {
    console.log(res.headers['content-security-policy']);
}).on('error', (e) => {
    console.error(e);
});
