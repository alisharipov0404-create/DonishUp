import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: window.__GEMINI_API_KEY__ });
const translationCache = JSON.parse(localStorage.getItem('translationCache') || '{}');

export async function translateText(text, targetLang) {
    if (!text || typeof text !== 'string' || text.trim() === '') return text;
    
    // Don't translate if it's just numbers or very short
    if (!isNaN(text) || text.length < 2) return text;

    const cacheKey = `${text}_${targetLang}`;
    if (translationCache[cacheKey]) {
        return translationCache[cacheKey];
    }

    try {
        let langName = 'English';
        if (targetLang === 'ru') langName = 'Russian';
        if (targetLang === 'tj') langName = 'Tajik';
        if (targetLang === 'en') langName = 'English';

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Translate the following text to ${langName}. Return ONLY the translated text, nothing else. Do not add quotes or explanations.\n\nText: ${text}`,
            config: {
                temperature: 0.1,
            }
        });

        const translated = response.text.trim();
        if (translated) {
            translationCache[cacheKey] = translated;
            localStorage.setItem('translationCache', JSON.stringify(translationCache));
            return translated;
        }
    } catch (error) {
        console.error('Translation error:', error);
    }
    return text;
}

export async function translateObject(obj, fieldsToTranslate, targetLang) {
    if (!obj) return obj;
    const translatedObj = { ...obj };
    for (const field of fieldsToTranslate) {
        if (translatedObj[field]) {
            translatedObj[field] = await translateText(translatedObj[field], targetLang);
        }
    }
    return translatedObj;
}

export async function translateArray(arr, fieldsToTranslate, targetLang) {
    if (!arr || !Array.isArray(arr)) return arr;
    return Promise.all(arr.map(item => translateObject(item, fieldsToTranslate, targetLang)));
}
