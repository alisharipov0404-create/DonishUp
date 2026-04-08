import http from 'http';

http.get('http://localhost:3000/', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Headers:', res.headers);
    console.log('Body length:', data.length);
    console.log('Body start:', data.substring(0, 200));
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});
