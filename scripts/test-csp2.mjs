import https from 'https';
import fs from 'fs';
https.get('https://www.thereelhousesociety.com/', (res) => {
    fs.writeFileSync('csp.log', JSON.stringify(res.headers, null, 2));
    process.exit(0);
}).on('error', (e) => {
    console.error(e);
});
