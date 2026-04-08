
import Database from 'better-sqlite3';
try {
    const db = new Database('donishup.db');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('Tables:', tables);
    if (tables.some(t => t.name === 'users')) {
        const count = db.prepare('SELECT COUNT(*) as count FROM users').get();
        console.log('User count:', count);
    }
} catch (e) {
    console.error('DB Test failed:', e);
}
