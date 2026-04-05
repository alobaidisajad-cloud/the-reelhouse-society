import https from 'https';
https.get('https://thereelhousesociety.com', (res) => {
    console.log(res.headers);
}).on('error', (e) => {
    console.error(e);
});
