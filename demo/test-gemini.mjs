// Validates Gemini integration (invalid key + optional real key from env).
// Usage: GEMINI_API_KEY=AIza... node demo/test-gemini.mjs

const MODEL = 'gemini-2.0-flash';

async function validateKey(key) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}?key=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  const text = await res.text();
  return { status: res.status, ok: res.ok, body: text.slice(0, 300) };
}

console.log('1. Invalid key test');
const bad = await validateKey('AIza-invalid-test-key');
console.log('   status:', bad.status, bad.ok ? 'UNEXPECTED_OK' : 'EXPECTED_FAIL');

const realKey = process.env.GEMINI_API_KEY;
if (realKey) {
  console.log('2. Real key validation');
  const good = await validateKey(realKey);
  console.log('   status:', good.status, good.ok ? 'OK' : good.body);

  if (good.ok) {
    console.log('3. Vision analysis smoke');
    const fs = await import('node:fs');
    const b64 = fs.readFileSync('demo/demo-meal.jpg').toString('base64');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(realKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: 'What food is this? Reply JSON: {"food":"name","protein_g":number}' },
            { inline_data: { mime_type: 'image/jpeg', data: b64 } },
          ],
        }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });
    const data = await res.json();
    console.log('   vision:', res.status, data?.candidates?.[0]?.content?.parts?.[0]?.text?.slice(0, 120));
  }
} else {
  console.log('2. Skip real key test (set GEMINI_API_KEY to run)');
}
