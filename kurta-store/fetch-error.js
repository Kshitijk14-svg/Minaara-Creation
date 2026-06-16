const http = require('http');

http.get('http://localhost:3002', (res) => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    // try to extract Next.js error from HTML if any
    const match = data.match(/<title>(.*?)<\/title>/);
    console.log('Status:', res.statusCode);
    if (match) console.log('Title:', match[1]);
    
    // Look for error message in Next.js error overlay JSON
    const nextErr = data.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
    if (nextErr) {
        try {
            const parsed = JSON.parse(nextErr[1]);
            console.log('Next.js Data:', parsed.err?.message || 'No direct message');
        } catch(e){}
    }
    
    // Or just look for "Error:" in the body
    const errMatch = data.match(/Error:.*?(?=<)/g);
    if (errMatch) {
      console.log('Found errors in body:', errMatch.slice(0, 5).join('\n'));
    } else {
      console.log('First 500 chars:', data.substring(0, 500));
    }
  });
}).on('error', err => console.log('Fetch error:', err.message));
