import { loadEnv } from 'vite';
process.env.GEMINI_API_KEY = 'test-key';
const env = loadEnv('development', '.', '');
console.log(env.GEMINI_API_KEY);
