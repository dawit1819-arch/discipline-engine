/* Speech in and out, both free and built into the phone's browser. */
const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
const canListen = !!Rec, canSpeak = 'speechSynthesis' in window;
let rec = null;

function listen({ onPartial, onFinal, onEnd, onError }) {
  if (!canListen) { onError('This browser cannot hear you. Type instead.'); return; }
  stopSpeaking();
  rec = new Rec();
  rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  let final = '', error = '';
  const session = rec;
  rec.onresult = ev => {
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i]; if (r.isFinal) final += r[0].transcript; else interim += r[0].transcript;
    }
    onPartial((final + ' ' + interim).trim());
  };
  rec.onerror = ev => { error = ev.error; if (ev.error !== 'no-speech' && ev.error !== 'aborted') onError(ev.error === 'not-allowed' ? 'Microphone is blocked. Allow it in the browser settings.' : 'Did not catch that.'); };
  rec.onend = () => { rec = null; if (final.trim()) onFinal(final.trim()); onEnd({ hadFinal: !!final.trim(), error, stopped: !!session.userStopped }); };
  rec.start();
}
function stopListening() { if (rec) { rec.userStopped = true; rec.stop(); } }

function bestVoice() {
  const vs = speechSynthesis.getVoices().filter(v => v.lang && v.lang.startsWith('en'));
  if (S.settings.voiceName) { const v = vs.find(x => x.name === S.settings.voiceName); if (v) return v; }
  return vs.find(v => /natural|neural|google us english|samantha|aria|jenny/i.test(v.name)) || vs.find(v => v.lang === 'en-US') || vs[0] || null;
}
/* Human-sounding voice: Gemini TTS with the same free key. Falls back to
   the phone's own voice if there is no key, no TTS model, or a limit hit. */
const HUMAN_VOICES = ['Kore', 'Aoede', 'Leda', 'Charon', 'Puck', 'Fenrir', 'Orus', 'Zephyr'];
let audioCtx = null, playing = null;
async function pickTtsModel(key) {
  const res = await fetch(`${GEM}/models?pageSize=200`, { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('tts list ' + res.status);
  const names = ((await res.json()).models || []).map(m => m.name.replace('models/', '')).filter(n => /tts/.test(n) && /flash/.test(n));
  if (!names.length) throw new Error('no tts model');
  const ver = n => parseFloat((n.match(/gemini-([\d.]+)/) || [0, 0])[1]);
  names.sort((a, b) => ver(b) - ver(a));
  return names[0];
}
async function humanSpeak(text) {
  const key = S.settings.geminiKey;
  if (!S.settings.ttsModel) { S.settings.ttsModel = await pickTtsModel(key); save(); }
  const res = await fetch(`${GEM}/models/${S.settings.ttsModel}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ parts: [{ text: `Say this warmly and naturally, like a calm friend, at a relaxed pace: ${text}` }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: S.settings.humanVoice || 'Kore' } } } } }),
    signal: AbortSignal.timeout(30000),
  });
  if (res.status === 404) { S.settings.ttsModel = ''; save(); }
  if (!res.ok) throw new Error('tts ' + res.status);
  const part = (await res.json()).candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!part) throw new Error('no audio');
  const bin = atob(part.inlineData.data), pcm = new Int16Array(bin.length / 2);
  for (let i = 0; i < pcm.length; i++) pcm[i] = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
  const rate = +(part.inlineData.mimeType.match(/rate=(\d+)/) || [0, 24000])[1];
  audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  await audioCtx.resume();
  const buf = audioCtx.createBuffer(1, pcm.length, rate), ch = buf.getChannelData(0);
  for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
  return new Promise(done => {
    const src = audioCtx.createBufferSource(); src.buffer = buf; src.connect(audioCtx.destination);
    src.onended = () => { playing = null; done(); }; playing = src; src.start();
  });
}
/* Called inside the tap that sends a message, so phones allow audio later. */
function unlockAudio() {
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch (_) {}
}
async function speak(text, onDone) {
  if (!S.settings.voice) { onDone && onDone(); return; }
  if (S.settings.geminiKey && S.settings.humanVoice !== 'phone') {
    try { await humanSpeak(text); onDone && onDone(); return; }
    catch (e) { console.warn('[voice] human voice failed, using phone voice:', e.message); }
  }
  phoneSpeak(text, onDone);
}
function phoneSpeak(text, onDone) {
  if (!canSpeak) { onDone && onDone(); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = bestVoice(); if (v) u.voice = v;
  u.rate = 1.03; u.pitch = 1;
  u.onend = () => onDone && onDone();
  u.onerror = () => onDone && onDone();
  speechSynthesis.speak(u);
}
function stopSpeaking() { if (canSpeak) speechSynthesis.cancel(); if (playing) { try { playing.stop(); } catch (_) {} playing = null; } }
if (canSpeak) speechSynthesis.onvoiceschanged = () => {};
