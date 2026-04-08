import Database from "better-sqlite3";

try {
  const db = new Database('donishup.db');
  const count = db.prepare('SELECT COUNT(*) as count FROM users').get();
  console.log("Users count:", count);
} catch (err) {
  console.error("DB Error:", err);
}
