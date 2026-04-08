async function test() {
  try {
    const res1 = await fetch('http://localhost:3000/api/schedule');
    console.log('schedule:', res1.status);
    const res2 = await fetch('http://localhost:3000/api/users');
    console.log('users:', res2.status);
  } catch(e) {
    console.error(e);
  }
}
test();
