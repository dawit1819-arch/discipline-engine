/* =====================================================================
   DISCIPLINE ENGINE — food photo -> calories

   Uses the Google Gemini free tier. The key lives in localStorage on the
   device and is sent only to generativelanguage.googleapis.com.

   Note on accuracy: photo calorie estimation is genuinely approximate —
   it cannot see oil absorbed into a stew or how heavy the injera is. For
   a hard gainer that error is acceptable in one direction only, so the
   prompt is told to estimate the HIGH end of a plausible range and never
   round down. Undercounting here would be the same failure as not eating.
   ===================================================================== */

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];

/* Downscale before upload: cheaper, faster, and well within free quota. */
function fileToScaledBase64(file, maxDim = 768) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width: w, height: h } = img;
      const scale = Math.min(1, maxDim / Math.max(w, h));
      w = Math.round(w * scale); h = Math.round(h * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      const dataUrl = c.toDataURL('image/jpeg', 0.82);
      resolve({ b64: dataUrl.split(',')[1], preview: dataUrl });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

const FOOD_PROMPT = `You are a nutrition estimator for an adult who is deliberately eating in a surplus
to gain weight. They often eat Ethiopian home cooking:
injera, shiro, misir wat, doro wat, key wat, tibs, kitfo, gomen, ayib, firfir, ful.

Identify every distinct food in the photo. For each one:
- estimate the portion from visual cues (plate size, injera diameter ~50cm when full-size, spoon sizes)
- account for cooking fat: Ethiopian stews carry a lot of niter kibbeh or oil, so do NOT estimate them as if they were plain boiled lentils
- when a portion is ambiguous, choose the HIGHER end of the plausible range

Return the total for the whole plate as shown, not per-serving reference values.
If the photo contains no food at all, return an empty items array and say so in "note".`;

const FOOD_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name:      { type: 'STRING', description: 'Food name, Ethiopian name if applicable' },
          portion:   { type: 'STRING', description: 'Estimated portion, e.g. "1 cup", "half a plate"' },
          kcal:      { type: 'INTEGER' },
          protein:   { type: 'INTEGER', description: 'grams' },
          confidence:{ type: 'STRING', enum: ['high', 'medium', 'low'] },
        },
        required: ['name', 'portion', 'kcal', 'protein', 'confidence'],
      },
    },
    note: { type: 'STRING', description: 'One short sentence: what you assumed, or what you could not see.' },
  },
  required: ['items', 'note'],
};

async function callGemini(model, key, b64) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: FOOD_PROMPT },
          { inline_data: { mime_type: 'image/jpeg', data: b64 } },
        ],
      }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: FOOD_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    let msg = `HTTP ${res.status}`;
    try { msg = JSON.parse(txt).error?.message || msg; } catch (_) {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const reason = json?.candidates?.[0]?.finishReason || 'no content returned';
    throw new Error(`Model returned nothing (${reason}).`);
  }
  return JSON.parse(text);
}

/* Tries the configured model first, then falls back through the list —
   Google renames and retires free-tier model ids fairly often. */
async function analyzeFoodPhoto(file) {
  const key = S.settings.geminiKey;
  if (!key) throw new Error('NO_KEY');

  const { b64, preview } = await fileToScaledBase64(file);
  const tried = [];
  const order = [S.settings.geminiModel, ...GEMINI_MODELS.filter(m => m !== S.settings.geminiModel)];

  let lastErr;
  for (const model of order) {
    if (!model || tried.includes(model)) continue;
    tried.push(model);
    try {
      const result = await callGemini(model, key, b64);
      if (model !== S.settings.geminiModel) { S.settings.geminiModel = model; saveNow(); }
      const items = (result.items || []).map(i => ({
        ...i,
        kcal: Math.max(0, Math.round(Number(i.kcal) || 0)),
        protein: Math.max(0, Math.round(Number(i.protein) || 0)),
      }));
      return {
        items, note: result.note || '', preview, model,
        totals: items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, protein: a.protein + i.protein }),
          { kcal: 0, protein: 0 }),
      };
    } catch (e) {
      lastErr = e;
      // 404 = model id retired, try the next one. Anything else is real.
      if (e.status !== 404 && e.status !== 400) break;
    }
  }

  if (lastErr?.status === 403 || /API key/i.test(lastErr?.message || ''))
    throw new Error('That API key was rejected. Check it in Settings.');
  if (lastErr?.status === 429)
    throw new Error('Free-tier rate limit hit. Wait a minute, or log the plate by hand.');
  throw new Error(lastErr?.message || 'Could not analyse that photo.');
}
