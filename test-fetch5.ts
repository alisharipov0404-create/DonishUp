async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: '123', classId: 'Admin' })
    });
    console.log('login:', res.status);
    const text = await res.text();
    console.log(text);
  } catch(e) {
    console.error(e);
  }
}
test();
