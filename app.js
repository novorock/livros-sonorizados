// ===== Utilidades de UI =====
const $ = (id) => document.getElementById(id);
const pageText = $("page-text");
const moodPill = $("mood-pill");
const pagePill = $("page-pill");
const startBtn = $("start");
const prevBtn = $("prev");
const nextBtn = $("next");
const muteBtn = $("mute");
const loadSampleBtn = $("load-sample");
const processBtn = $("process");
const inputText = $("input-text");
const pagesList = $("pages");
const summary = $("summary");
const cmdInput = $("cmd");
const cmdRun = $("run-cmd");
const cmdLog = $("cmd-log");

let ctx;               // WebAudio context
let bgmEnabled = true; // som ligado
let currentPage = 0;
let book = null;       // { pages: [{text, mood, effects: [{name, trigger, offset_ms}]}], crossfade_ms, tracks, effects }

// ===== Amostras de áudio SINTÉTICO (WebAudio), livres de direitos =====
// Gera trilhas por osciladores + harmônicos, e efeitos por ruído/senos.
// Nada é baixado da internet.
async function ensureAudio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
}

// Síntese de trilhas: calma/suspense/acao
function createBgmSource(mood) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();

  // Config de cada clima
  if (mood === "calma") {
    osc.type = "sine";        osc.frequency.value = 220;
    lfo.frequency.value = 0.07; lfoGain.gain.value = 20;
  } else if (mood === "suspense") {
    osc.type = "triangle";    osc.frequency.value = 180;
    lfo.frequency.value = 0.15; lfoGain.gain.value = 35;
  } else { // acao
    osc.type = "sawtooth";    osc.frequency.value = 110;
    lfo.frequency.value = 0.12; lfoGain.gain.value = 28;
  }

  // LFO modula a frequência (leve vibrato/clima)
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  gain.gain.value = 0;
  osc.connect(gain).connect(ctx.destination);

  osc.start();
  lfo.start();

  return { osc, gain, stop: () => { osc.stop(); lfo.stop(); } };
}

// Síntese de efeitos
async function playEffect(name) {
  await ensureAudio();
  let node;

  if (name === "trovao" || name === "explosao" || name === "aplausos") {
    // Ruído + envelope
    const bufferSize = 2 * ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const gain = ctx.createGain();
    if (name === "trovao") gain.gain.setValueAtTime(0.9, ctx.currentTime);
    if (name === "explosao") gain.gain.setValueAtTime(1.0, ctx.currentTime);
    if (name === "aplausos") gain.gain.setValueAtTime(0.6, ctx.currentTime);

    noise.connect(gain).connect(ctx.destination);
    noise.start();

    // Decaimento
    const dur = name === "aplausos" ? 0.8 : 1.2;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    noise.stop(ctx.currentTime + dur + 0.05);
    node = noise;
  } else if (name === "sino") {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.9, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1.05);
    node = osc;
  } else if (name === "porta") {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(300, ctx.currentTime + 1.2);
    gain.gain.setValueAtTime(0.6, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1.25);
    node = osc;
  } else if (name === "passos") {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine"; osc.frequency.value = 180;
    osc.connect(gain).connect(ctx.destination);
    let t = ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      gain.gain.setValueAtTime(0.9, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      t += 0.22;
    }
    osc.start();
    osc.stop(t + 0.1);
    node = osc;
  } else if (name === "risada_bruja") {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 5; lfoGain.gain.value = 50;
    lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
    osc.frequency.value = 300;
    gain.gain.setValueAtTime(0.8, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
    osc.connect(gain).connect(ctx.destination);
    lfo.start(); osc.start();
    osc.stop(ctx.currentTime + 1.05); lfo.stop(ctx.currentTime + 1.05);
    node = osc;
  }
  return node;
}

// Crossfade entre trilhas
let bgmA = null, bgmB = null, currentSlot = "A";
function fadeIn(gain, sec) {
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.75, now + sec);
}
function fadeOut(gain, sec) {
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(0.0001, now + sec);
}
async function playBgm(mood, crossfadeMs) {
  if (!bgmEnabled) return;
  await ensureAudio();
  const src = createBgmSource(mood);
  const dur = (crossfadeMs || 1200) / 1000;

  if (currentSlot === "A") {
    if (bgmB) fadeOut(bgmB.gain, dur);
    bgmA = src; currentSlot = "B";
  } else {
    if (bgmA) fadeOut(bgmA.gain, dur);
    bgmB = src; currentSlot = "A";
  }
  fadeIn(src.gain, dur);
}

// ===== “IA” básica: segmentação, clima e eventos =====
function segmentText(raw) {
  // quebra por parágrafos e junta em blocos de ~450 caracteres
  const paras = raw.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
  const chunks = [];
  let acc = "";
  for (const p of paras) {
    const join = acc ? acc + "\n\n" + p : p;
    if (join.length > 450) { chunks.push(acc); acc = p; }
    else acc = join;
  }
  if (acc) chunks.push(acc);
  return chunks;
}
function guessMood(text) {
  const s = text.toLowerCase();
  if (/(medo|escuro|silêncio|silencio|sombra|noite|estranho|assust|tensão|tensao)/.test(s)) return "suspense";
  if (/(corre|fogo|gritou|caiu|explos|luta|rápido|rapido|perigo)/.test(s)) return "acao";
  return "calma";
}
function detectEvents(text) {
  const s = text.toLowerCase();
  const evts = [];
  if (/(trovão|trovao|raio|tempestade)/.test(s)) evts.push({ name: "trovao", trigger: "page_turn", offset_ms: 0 });
  if (/(porta|rang|abrir|fechou a porta)/.test(s)) evts.push({ name: "porta", trigger: "page_turn", offset_ms: 150 });
  if (/(passo|caminhou|andou|correndo)/.test(s)) evts.push({ name: "passos", trigger: "page_turn", offset_ms: 200 });
  if (/(explosão|explosao|estour|fogo|labareda)/.test(s)) evts.push({ name: "explosao", trigger: "page_turn", offset_ms: 100 });
  if (/(risada|riso|gargalhada|bruxa)/.test(s)) evts.push({ name: "risada_bruja", trigger: "page_turn", offset_ms: 250 });
  if (/(sino|badal)/.test(s)) evts.push({ name: "sino", trigger: "page_turn", offset_ms: 200 });
  return evts;
}
function buildBookFromText(raw) {
  const chunks = segmentText(raw);
  return {
    title: "Livro processado",
    crossfade_ms: 1200,
    pages: chunks.map((t) => ({
      text: t,
      mood: guessMood(t),
      effects: detectEvents(t)
    }))
  };
}

// ===== UI: carregamento, processamento, navegação, comandos =====
const sampleText = `João e Maria viviam perto de uma grande floresta. Numa manhã clara, caminharam pela trilha, ouvindo os pássaros e sentindo a brisa calma.

Logo a luz foi sumindo entre as árvores. A floresta ficou silenciosa e estranha, e um trovão distante anunciou a tempestade.

Eles viram uma casinha com cheiro doce. A porta rangeu quando João tocou, e uma risada fina ecoou lá dentro.

De repente, o fogo do forno explodiu em labaredas. Os dois correram o mais rápido que podiam até a saída da casa.

Do lado de fora, a noite abriu em estrelas. Um sino distante soou, e os irmãos seguiram em paz pelo caminho de volta.`;

function renderPages(b) {
  pagesList.innerHTML = "";
  b.pages.forEach((p, i) => {
    const div = document.createElement("div");
    div.className = "pageItem";
    div.innerHTML = `<div class="small"><strong>Página ${i+1}</strong> — clima: <em>${p.mood}</em> — efeitos: ${p.effects.map(e=>e.name).join(", ")||"—"}</div><div style="margin-top:6px">${p.text.replace(/\n/g,"<br/>")}</div>`;
    pagesList.appendChild(div);
  });
  summary.textContent = `${b.pages.length} página(s) detectadas.`;
}

function setPage(i) {
  if (!book) return;
  currentPage = Math.max(0, Math.min(i, book.pages.length - 1));
  const p = book.pages[currentPage];
  pageText.textContent = p.text;
  pagePill.textContent = `Página: ${currentPage + 1}`;
  moodPill.textContent = `Trilha: ${p.mood}`;
}

async function pageTurn(delta) {
  const prev = currentPage;
  setPage(currentPage + delta);
  if (prev !== currentPage) {
    const p = book.pages[currentPage];
    await playBgm(p.mood, book.crossfade_ms);
    // dispare efeitos da página
    for (const ef of p.effects) {
      if (ef.trigger === "page_turn") {
        setTimeout(()=>playEffect(ef.name), ef.offset_ms || 0);
      }
    }
  }
}

function parseCommand(text) {
  const t = text.toLowerCase();
  if (t.includes("trilha") && t.includes("suspense")) return { type:"set_mood", mood:"suspense" };
  if (t.includes("trilha") && (t.includes("ação")||t.includes("acao"))) return { type:"set_mood", mood:"acao" };
  if (t.includes("trilha") && t.includes("calma")) return { type:"set_mood", mood:"calma" };
  if (t.includes("remova") && t.includes("efeitos")) return { type:"remove_effects" };
  const fxList = ["sino","porta","trovao","explosao","passos","risada_bruja","aplausos"];
  for (const fx of fxList) if (t.includes(fx)) return { type:"play_fx", fx };
  if (t.includes("próxima")||t.includes("proxima")) return { type:"page", delta: 1 };
  if (t.includes("anterior")) return { type:"page", delta: -1 };
  return { type:"unknown" };
}
function logCmd(msg){ cmdLog.innerHTML = `<div>${new Date().toLocaleTimeString()} — ${msg}</div>` + cmdLog.innerHTML; }

async function runCommand() {
  const t = cmdInput.value.trim(); if(!t) return;
  const cmd = parseCommand(t);
  if (!book) { logCmd("carregue e processe um texto antes"); cmdInput.value=""; return; }

  if (cmd.type === "set_mood") {
    book.pages[currentPage].mood = cmd.mood;
    moodPill.textContent = `Trilha: ${cmd.mood}`;
    await playBgm(cmd.mood, book.crossfade_ms);
    logCmd(`ok — trilha desta página alterada para ${cmd.mood}`);
  } else if (cmd.type === "remove_effects") {
    book.pages[currentPage].effects = [];
    logCmd("ok — efeitos desta página removidos");
  } else if (cmd.type === "play_fx") {
    playEffect(cmd.fx); logCmd(`ok — efeito ${cmd.fx}`);
  } else if (cmd.type === "page") {
    pageTurn(cmd.delta); logCmd("ok — mudando de página");
  } else {
    logCmd('não entendi. Ex.: "troque a trilha desta página para suspense" · "remova efeitos" · "tocar sino agora"');
  }
  cmdInput.value = "";
}

// ===== Liga os botões =====
loadSampleBtn.onclick = () => { inputText.value = sampleText; };
processBtn.onclick = () => {
  const raw = inputText.value.trim();
  if (!raw) { alert("Cole um texto ou carregue o exemplo."); return; }
  book = buildBookFromText(raw);
  renderPages(book);
  setPage(0);
};
startBtn.onclick = async () => {
  if (!book) { alert("Clique em 'Processar com IA básica' primeiro."); return; }
  await ensureAudio();
  setPage(0);
  await playBgm(book.pages[0].mood, book.crossfade_ms);
  // efeitos da primeira página
  for (const ef of book.pages[0].effects) {
    if (ef.trigger === "page_turn") setTimeout(()=>playEffect(ef.name), ef.offset_ms || 0);
  }
};
nextBtn.onclick = ()=> pageTurn(1);
prevBtn.onclick = ()=> pageTurn(-1);
muteBtn.onclick = ()=> {
  bgmEnabled = !bgmEnabled;
  muteBtn.textContent = bgmEnabled ? "Som ligado" : "Som desligado";
};
cmdRun.onclick = runCommand;
cmdInput.onkeydown = (e)=>{ if (e.key === "Enter") runCommand(); };
