async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/subjects');
    console.log(res.status);
    console.log(await res.text());
  } catch(e) {
    console.error(e);
  }
}
test();
