import http from 'http';

http.get('http://localhost:3000/src/styles.css', { headers: { 'Accept': 'text/css' } }, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Contains .btn-primary:', data.includes('.btn-primary'));
    console.log('Contains .bg-red-600:', data.includes('.bg-red-600'));
  });
}).on('error', (e) => {
  console.error(e);
});
