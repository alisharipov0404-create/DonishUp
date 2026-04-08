async function test() {
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch('http://localhost:3000/api/subjects');
      console.log(i, res.status);
    } catch(e) {
      console.error(i, e.message);
    }
    await new Promise(r => setTimeout(r, 100));
  }
}
test();
