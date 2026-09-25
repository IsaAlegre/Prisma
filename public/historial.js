/* =====================================================================
   Historial: estadísticas, gráficos y recomendaciones del período.
   Usa las definiciones de app.js (PARAMS, rangos, num, esc, $...).
   Gráficos en SVG hechos a mano, sin librerías.
   ===================================================================== */

const HORA_MS = 3600e3;
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const H_CLAVES = ['temp', 'hum', 'ph', 'ce', 'nivel'];
const H_NOMBRE = { temp: 'Temperatura', hum: 'Humedad', ph: 'pH', ce: 'Conductividad', nivel: 'Nivel de caldo' };
const H_UNIDAD = { temp: '°C', hum: '%', ph: '', ce: 'mS/cm', nivel: '%' };
const H_DEC = { temp: 1, hum: 0, ph: 2, ce: 2, nivel: 0 };
let hSel = { k: 'temp', horas: 168 };

// ---------------------------------------------------------------------
// Datos: en modo demo se generan 7 días de lecturas horarias realistas.
// En modo real vienen de GET /api/historial?horas=168 (promedios por hora).
// ---------------------------------------------------------------------
function semilla(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function generarDemo() {
  const r = semilla(7), g = () => { let s = 0; for (let i = 0; i < 6; i++) s += r(); return s - 3; };
  const ahora = new Date(); ahora.setMinutes(0, 0, 0);
  const serie = { temp: [], hum: [], ph: [], ce: [], nivel: [] };
  let ph = 6.0, ce = 1.68, nivel = 80;
  for (let i = 167; i >= 0; i--) {
    const t = ahora.getTime() - i * HORA_MS, h = new Date(t).getHours(), ciclo = Math.sin(2 * Math.PI * (h - 9) / 24);
    serie.temp.push({ t, v: 19.5 + 5.2 * ciclo + g() * 0.6 });
    serie.hum.push({ t, v: Math.min(97, 70 - 9.5 * ciclo + g() * 2) });
    ph += 0.0062 + g() * 0.008; if (ph > 6.52) ph = 5.9 + r() * 0.05;          // el productor corrige
    serie.ph.push({ t, v: ph });
    ce -= 0.0046 + g() * 0.002; if (ce < 1.16) ce = 1.72 + r() * 0.04;          // repone solución
    serie.ce.push({ t, v: ce });
    nivel -= (h >= 8 && h <= 19) ? 1.15 : 0.35; if (nivel < 26) nivel = 88;     // llena el tanque
    serie.nivel.push({ t, v: nivel });
  }
  const cortes = [
    { inicio: ahora.getTime() - 122 * HORA_MS, horas: 2, tipo: 'generador' },
    { inicio: ahora.getTime() - 57 * HORA_MS, horas: 1, tipo: 'generador' }
  ];
  return { serie, cortes };
}
let HIST = generarDemo();
async function cargarHistorialServidor() {
  try { HIST = await (await fetch(API + '/api/historial?horas=168', { cache: 'no-store' })).json(); } catch (e) {}
}

// ---------------------------------------------------------------------
// Estadística
// ---------------------------------------------------------------------
const limites = k => k === 'nivel' ? [rangos().nivelMin, Infinity] : rangos()[k];
function estadisticas(k, datos) {
  const vs = datos.map(d => d.v), n = vs.length;
  const prom = vs.reduce((a, b) => a + b, 0) / n;
  const desvio = Math.sqrt(vs.reduce((a, b) => a + (b - prom) ** 2, 0) / n);
  const [mn, mx] = limites(k);
  const bajo = vs.filter(v => v < mn).length, alto = vs.filter(v => v > mx).length;
  return { n, prom, min: Math.min(...vs), max: Math.max(...vs), desvio, bajo: bajo / n, alto: alto / n, ok: (n - bajo - alto) / n };
}
function pendientePorDia(datos) {   // regresión lineal: cuánto cambia por día
  const n = datos.length, xs = datos.map(d => d.t / (24 * HORA_MS)), ys = datos.map(d => d.v);
  const mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  let num_ = 0, den = 0; for (let i = 0; i < n; i++) { num_ += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den ? num_ / den : 0;
}
function perfilHorario(datos) {     // promedio de cada hora del día
  const s = Array(24).fill(0), c = Array(24).fill(0);
  datos.forEach(d => { const h = new Date(d.t).getHours(); s[h] += d.v; c[h]++; });
  return s.map((v, i) => c[i] ? v / c[i] : null);
}
function franjas(horasMarcadas) {    // [13,14,15,17] -> "de 13 a 16 h y de 17 a 18 h"
  const g = []; let ini = null, prev = null;
  horasMarcadas.forEach(h => { if (ini === null) ini = h; else if (h !== prev + 1) { g.push([ini, prev]); ini = h; } prev = h; });
  if (ini !== null) g.push([ini, prev]);
  return g.map(([a, b]) => `de ${a} a ${b + 1} h`).join(' y ');
}
function tramosFuera(k, datos) {     // cada vez que un valor sale del rango
  const [mn, mx] = limites(k); const t = []; let fuera = false;
  datos.forEach(d => { const f = d.v < mn || d.v > mx; if (f && !fuera) t.push(d.t); fuera = f; });
  return t;
}
function porDia(datos) {
  const m = new Map();
  datos.forEach(d => { const dia = new Date(d.t); dia.setHours(0, 0, 0, 0); const key = dia.getTime(); if (!m.has(key)) m.set(key, []); m.get(key).push(d); });
  return [...m.entries()];
}
const etiquetaDia = t => { const d = new Date(t); return `${DIAS[d.getDay()]} ${d.getDate()}`; };
const etiquetaHora = t => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:00`; };
const fmtV = (k, v) => `${num(v, H_DEC[k])}${H_UNIDAD[k] ? ' ' + H_UNIDAD[k] : ''}`;

// ---------------------------------------------------------------------
// Recomendaciones del período (reglas simples y explicables)
// ---------------------------------------------------------------------
const CONSEJO_PREVENTIVO = {
  temp: { alto: h => `Abrí los laterales o extendé la media sombra antes de las ${h} h.`, bajo: h => `Cerrá los laterales antes de las ${h} h para guardar el calor.` },
  hum: { alto: () => 'Ventilá al atardecer y a primera hora para que no se acumule humedad.', bajo: h => `Mojá los pasillos antes de las ${h} h.` }
};
function recomendaciones(horas) {
  const out = [];
  for (const k of H_CLAVES) {
    const datos = HIST.serie[k].slice(-horas), e = estadisticas(k, datos), [mn, mx] = limites(k);
    if ((k === 'temp' || k === 'hum') && (e.alto >= 0.08 || e.bajo >= 0.08)) {
      const dir = e.alto >= e.bajo ? 'alto' : 'bajo', perfil = perfilHorario(datos);
      const hs = perfil.map((v, h) => (v !== null && (dir === 'alto' ? v > mx : v < mn)) ? h : null).filter(h => h !== null);
      if (hs.length) out.push({ tipo: 'warn', titulo: `${H_NOMBRE[k]} ${dir === 'alto' ? 'alta' : 'baja'} ${franjas(hs)}`,
        texto: `Pasó el ${num((dir === 'alto' ? e.alto : e.bajo) * 100, 0)} % del tiempo fuera del rango. ${CONSEJO_PREVENTIVO[k][dir](hs[0])}` });
    }
    if (k === 'ph') {
      const p = pendientePorDia(datos);
      if (p > 0.05) out.push({ tipo: 'warn', titulo: `El pH sube unos ${num(p, 2)} por día`, texto: `Salió del rango ${tramosFuera(k, datos).length} veces. Medilo cada mañana y corregilo antes de que pase ${num(mx, 1)}.` });
      else if (e.ok < 0.9) out.push({ tipo: 'warn', titulo: `El pH estuvo fuera del rango el ${num((1 - e.ok) * 100, 0)} % del tiempo`, texto: 'Controlalo dos veces por día y corregí de a poco.' });
    }
    if (k === 'ce') {
      const cargas = tramosSubida(datos);
      if (cargas >= 1 || pendientePorDia(datos) < -0.05) out.push({ tipo: 'info', titulo: 'La CE baja a medida que la planta consume nutrientes', texto: `Baja unos ${num(consumoDiario(datos), 2)} mS/cm por día. Reponé solución A y B cada ${Math.max(1, Math.floor((mx - mn) / consumoDiario(datos)))} días, antes de que baje de ${num(mn, 1)}.` });
    }
    if (k === 'nivel') {
      const llenados = tramosSubida(datos);
      const consumo = consumoDiario(datos);
      if (llenados) out.push({ tipo: 'info', titulo: `Se llenó el tanque ${llenados} ${llenados === 1 ? 'vez' : 'veces'}`, texto: `Se consume cerca del ${num(consumo, 0)} % por día, sobre todo de 8 a 20 h. Llenalo cada ${Math.max(1, Math.floor((88 - rangos().nivelMin) / consumo))} días para no bajar del ${rangos().nivelMin} %.` });
    }
    if (e.ok >= 0.97 && k !== 'nivel') out.push({ tipo: 'ok', titulo: `${H_NOMBRE[k]}: muy estable`, texto: `Estuvo dentro del rango el ${num(e.ok * 100, 0)} % del tiempo.` });
  }
  const desdeT = Date.now() - horas * HORA_MS, cortes = HIST.cortes.filter(c => c.inicio >= desdeT);
  if (cortes.length) {
    const total = cortes.reduce((a, c) => a + c.horas, 0);
    out.push({ tipo: 'warn', titulo: `${cortes.length} ${cortes.length === 1 ? 'corte' : 'cortes'} de luz (${total} h en total)`, texto: 'El grupo electrógeno respondió. Revisá el combustible una vez por semana y probalo en vacío.' });
  }
  const orden = { warn: 0, info: 1, ok: 2 };
  return out.sort((a, b) => orden[a.tipo] - orden[b.tipo]);
}
function tramosSubida(datos) { let c = 0; for (let i = 1; i < datos.length; i++) if (datos[i].v - datos[i - 1].v > 0.2 * Math.abs(datos[i - 1].v)) c++; return c; }
function consumoDiario(datos) { let baja = 0; for (let i = 1; i < datos.length; i++) { const d = datos[i - 1].v - datos[i].v; if (d > 0) baja += d; } return baja / (datos.length / 24); }

// ---------------------------------------------------------------------
// Utilidades de gráficos
// ---------------------------------------------------------------------
function ticks(a, b, n = 4) {
  const paso0 = (b - a) / n, mag = 10 ** Math.floor(Math.log10(paso0)), f = paso0 / mag;
  const paso = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  const out = []; for (let v = Math.ceil(a / paso) * paso; v <= b + 1e-9; v += paso) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}
function tooltip(cont) { let t = cont.querySelector('.gtip'); if (!t) { t = document.createElement('div'); t.className = 'gtip'; t.hidden = true; cont.appendChild(t); } return t; }
function mostrarTT(cont, x, y, html) { const t = tooltip(cont); t.innerHTML = html; t.hidden = false; const w = cont.clientWidth; t.style.left = Math.min(Math.max(x, 70), w - 70) + 'px'; t.style.top = y + 'px'; }
const ocultarTT = cont => { const t = cont.querySelector('.gtip'); if (t) t.hidden = true; };
const barraRedondeada = (x, y, w, h, r = 4) => { r = Math.min(r, w / 2, h); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; };

// Línea en el tiempo con banda del rango ideal y cursor
function graficoLinea(cont, k, datos) {
  const W = Math.max(280, cont.clientWidth), H = 240, m = { l: 40, r: 14, t: 14, b: 26 };
  const [mn, mx0] = limites(k), mx = k === 'nivel' ? 100 : mx0;
  let lo = Math.min(mn, ...datos.map(d => d.v)), hi = Math.max(mx, ...datos.map(d => d.v));
  const pad = (hi - lo) * 0.1; lo -= pad; hi += pad; if (k === 'nivel') { lo = 0; hi = 100; }
  const t0 = datos[0].t, t1 = datos[datos.length - 1].t;
  const X = t => m.l + (t - t0) / (t1 - t0) * (W - m.l - m.r), Y = v => m.t + (hi - v) / (hi - lo) * (H - m.t - m.b);
  const yt = ticks(lo, hi, 4);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${H_NOMBRE[k]} en el período">`;
  s += `<rect x="${m.l}" y="${Y(mx)}" width="${W - m.l - m.r}" height="${Y(mn) - Y(mx)}" fill="var(--ok-bg)"/>`;
  s += `<text x="${m.l + 6}" y="${Y(mx) + 13}" style="fill:var(--ok);font-weight:600">Rango ideal</text>`;
  yt.forEach(v => { s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${m.l - 6}" y="${Y(v) + 4}" text-anchor="end">${num(v, v % 1 ? 1 : 0)}</text>`; });
  // eje x: medianoche de cada día (7 días) o cada 4 horas (24 h)
  let marca = 0; const salto = W < 520 ? 2 : 1;
  datos.forEach(d => {
    const h = new Date(d.t).getHours();
    if (((hSel.horas > 24 && h === 0) || (hSel.horas <= 24 && h % 4 === 0)) && (marca++ % salto === 0)) {
      s += `<line x1="${X(d.t)}" x2="${X(d.t)}" y1="${H - m.b}" y2="${H - m.b + 4}" stroke="var(--muted)"/><text x="${X(d.t)}" y="${H - 8}" text-anchor="middle">${hSel.horas > 24 ? etiquetaDia(d.t) : etiquetaHora(d.t)}</text>`;
    }
  });
  const pts = datos.map(d => `${X(d.t).toFixed(1)},${Y(d.v).toFixed(1)}`).join(' ');
  s += `<polyline points="${pts}" fill="none" stroke="var(--serie)" stroke-width="2" stroke-linejoin="round"/>`;
  s += `<line id="cx" y1="${m.t}" y2="${H - m.b}" stroke="var(--muted)" stroke-dasharray="3 3" visibility="hidden"/><circle id="cp" r="5" fill="var(--serie)" stroke="var(--surface)" stroke-width="2" visibility="hidden"/>`;
  s += `<rect x="${m.l}" y="0" width="${W - m.l - m.r}" height="${H}" fill="transparent" id="hit"/></svg>`;
  cont.innerHTML = s;
  const svg = cont.querySelector('svg'), cx = svg.querySelector('#cx'), cp = svg.querySelector('#cp');
  const mover = ev => {
    const b = svg.getBoundingClientRect(), px = (ev.clientX - b.left) * (W / b.width);
    const t = t0 + (px - m.l) / (W - m.l - m.r) * (t1 - t0);
    const i = Math.max(0, Math.min(datos.length - 1, Math.round((t - t0) / HORA_MS))), d = datos[i];
    cx.setAttribute('x1', X(d.t)); cx.setAttribute('x2', X(d.t)); cx.setAttribute('visibility', 'visible');
    cp.setAttribute('cx', X(d.t)); cp.setAttribute('cy', Y(d.v)); cp.setAttribute('visibility', 'visible');
    const est = d.v < mn ? 'Bajo' : d.v > mx0 ? 'Alto' : 'En rango';
    mostrarTT(cont, X(d.t) * b.width / W, Y(d.v) * b.height / H, `${etiquetaDia(d.t)}, ${etiquetaHora(d.t)} · <b>${fmtV(k, d.v)}</b> · ${est}`);
  };
  svg.addEventListener('pointermove', mover);
  svg.addEventListener('pointerleave', () => { cx.setAttribute('visibility', 'hidden'); cp.setAttribute('visibility', 'hidden'); ocultarTT(cont); });
}

// Histograma: cuántas horas en cada franja de valores
function graficoHistograma(cont, k, datos) {
  const W = Math.max(260, cont.clientWidth), H = 200, m = { l: 34, r: 8, t: 18, b: 26 };
  const vs = datos.map(d => d.v), lo0 = Math.min(...vs), hi0 = Math.max(...vs);
  const ancho = ticks(lo0, hi0, 9)[1] - ticks(lo0, hi0, 9)[0] || 1;
  const ini = Math.floor(lo0 / ancho) * ancho, nb = Math.ceil((hi0 - ini) / ancho + 1e-9);
  const cuenta = Array(nb).fill(0); vs.forEach(v => cuenta[Math.min(nb - 1, Math.floor((v - ini) / ancho))]++);
  const maxC = Math.max(...cuenta), fin = ini + nb * ancho;
  const X = v => m.l + (v - ini) / (fin - ini) * (W - m.l - m.r), Y = c => m.t + (1 - c / maxC) * (H - m.t - m.b);
  const [mn, mx] = limites(k);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Distribución de ${H_NOMBRE[k]}">`;
  const bx0 = Math.max(m.l, X(mn)), bx1 = Math.min(W - m.r, X(Math.min(mx, fin)));
  if (bx1 > bx0) s += `<rect x="${bx0}" y="${m.t}" width="${bx1 - bx0}" height="${H - m.t - m.b}" fill="var(--ok-bg)"/>`;
  ticks(0, maxC, 3).forEach(c => { s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(c)}" y2="${Y(c)}" stroke="var(--grid)"/><text x="${m.l - 6}" y="${Y(c) + 4}" text-anchor="end">${c}</text>`; });
  cuenta.forEach((c, i) => {
    const x = X(ini + i * ancho) + 1, w = Math.max(1, X(ini + (i + 1) * ancho) - X(ini + i * ancho) - 2);
    if (c) s += `<path d="${barraRedondeada(x, Y(c), w, H - m.b - Y(c))}" fill="var(--serie)"/>`;
    s += `<rect x="${x}" y="${m.t}" width="${w}" height="${H - m.t - m.b}" fill="transparent" data-i="${i}"/>`;
  });
  const cadaTanto = Math.ceil(nb / 5);
  for (let i = 0; i <= nb; i += cadaTanto) s += `<text x="${X(ini + i * ancho)}" y="${H - 8}" text-anchor="middle">${num(ini + i * ancho, H_DEC[k] > 1 ? 1 : H_DEC[k])}</text>`;
  s += '</svg>';
  cont.innerHTML = s;
  const svg = cont.querySelector('svg');
  svg.addEventListener('pointermove', ev => {
    const r = ev.target.closest('[data-i]'); if (!r) return ocultarTT(cont);
    const i = +r.dataset.i, b = svg.getBoundingClientRect(), a = ini + i * ancho;
    mostrarTT(cont, (X(a) + X(a + ancho)) / 2 * b.width / W, Y(cuenta[i]) * b.height / H,
      `${fmtV(k, a)} a ${fmtV(k, a + ancho)} · <b>${cuenta[i]} h</b> (${num(cuenta[i] / vs.length * 100, 0)} %)`);
  });
  svg.addEventListener('pointerleave', () => ocultarTT(cont));
}

// Barras apiladas: tiempo bajo / en rango / alto por parámetro
function graficoRangos(cont, horas) {
  cont.innerHTML = H_CLAVES.map(k => {
    const e = estadisticas(k, HIST.serie[k].slice(-horas));
    const seg = [['bajo', e.bajo, 'Bajo'], ['ok', e.ok, 'En rango'], ['alto', e.alto, 'Alto']].filter(x => x[1] > 0.001);
    return `<div class="rfila"><span class="nom">${H_NOMBRE[k]}</span><div class="rbar">${seg.map(([c, p, t]) =>
      `<div style="width:${p * 100}%;background:var(--${c === 'ok' ? 'neutro' : c})" data-tt="${H_NOMBRE[k]} · ${t}: <b>${num(p * 100, 0)} %</b> (${Math.round(p * e.n)} h)"></div>`).join('')}</div>
      <span class="pct">${num(e.ok * 100, 0)} %</span></div>`;
  }).join('') + '<p class="hint" style="margin-top:8px">El número de la derecha es el porcentaje de horas en rango.</p>';
  cont.style.position = 'relative';
  cont.onpointermove = ev => {
    const d = ev.target.closest('[data-tt]'); if (!d) return ocultarTT(cont);
    const b = cont.getBoundingClientRect(), r = d.getBoundingClientRect();
    mostrarTT(cont, r.left - b.left + r.width / 2, r.top - b.top, d.dataset.tt);
  };
  cont.onpointerleave = () => ocultarTT(cont);
}

// Avisos por día (últimos 7 días)
function graficoAvisos(cont) {
  const dias = porDia(HIST.serie.temp).map(([t]) => t).slice(-7);
  const cuenta = dias.map(d0 => {
    let c = 0; H_CLAVES.forEach(k => { c += tramosFuera(k, HIST.serie[k]).filter(t => t >= d0 && t < d0 + 24 * HORA_MS).length; });
    c += HIST.cortes.filter(x => x.inicio >= d0 && x.inicio < d0 + 24 * HORA_MS).length;
    return c;
  });
  const W = Math.max(260, cont.clientWidth), H = 200, m = { l: 26, r: 8, t: 22, b: 26 };
  const maxC = Math.max(4, ...cuenta), bw = (W - m.l - m.r) / dias.length;
  const Y = c => m.t + (1 - c / maxC) * (H - m.t - m.b);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Avisos por día">`;
  ticks(0, maxC, 2).forEach(c => { s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(c)}" y2="${Y(c)}" stroke="var(--grid)"/><text x="${m.l - 6}" y="${Y(c) + 4}" text-anchor="end">${c}</text>`; });
  dias.forEach((d, i) => {
    const x = m.l + i * bw + bw * 0.22, w = bw * 0.56, c = cuenta[i];
    if (c) s += `<path d="${barraRedondeada(x, Y(c), w, H - m.b - Y(c))}" fill="var(--serie)"/>`;
    s += `<text x="${x + w / 2}" y="${Y(c) - 6}" text-anchor="middle" style="fill:var(--ink);font-weight:600">${c}</text>`;
    s += `<text x="${x + w / 2}" y="${H - 8}" text-anchor="middle">${etiquetaDia(d)}</text>`;
  });
  cont.innerHTML = s + '</svg>';
}

// ---------------------------------------------------------------------
// Pintar la pestaña
// ---------------------------------------------------------------------
async function pintarHistorial() {
  if (!MODO_DEMO) await cargarHistorialServidor();
  const { k, horas } = hSel, datos = (HIST.serie[k] || []).slice(-horas);
  if (datos.length < 3) {
    $('hStats').innerHTML = ''; ['gLinea', 'gHisto', 'gRango', 'gAvisos', 'hRecos', 'hTabla'].forEach(id => { $(id).innerHTML = ''; });
    $('gLinea').innerHTML = '<div class="vacio">Todavía no hay suficientes lecturas. El historial se completa a medida que el ESP32 envía datos.</div>';
    return;
  }
  const e = estadisticas(k, datos);
  $('hParam').innerHTML = H_CLAVES.map(c => `<button class="chip" aria-pressed="${c === k}" data-k="${c}">${H_NOMBRE[c]}</button>`).join('');
  document.querySelectorAll('#hPeriodo button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.p === horas));
  const u = H_UNIDAD[k] ? `<small>${H_UNIDAD[k]}</small>` : '';
  $('hStats').innerHTML = [
    ['Promedio', num(e.prom, H_DEC[k]) + u, ''],
    ['Mínimo', num(e.min, H_DEC[k]) + u, ''],
    ['Máximo', num(e.max, H_DEC[k]) + u, ''],
    ['Desvío estándar', '±' + num(e.desvio, H_DEC[k]) + u, 'Cuánto varía'],
    ['En rango', num(e.ok * 100, 0) + '<small>%</small>', `${Math.round(e.ok * e.n)} de ${e.n} h`]
  ].map(([l, n, x]) => `<div class="stat"><div class="l">${l}</div><div class="n">${n}</div>${x ? `<div class="x">${x}</div>` : ''}</div>`).join('');
  const [mn, mx] = limites(k);
  $('hTituloLinea').textContent = `${H_NOMBRE[k]} ${horas > 24 ? 'en los últimos 7 días' : 'en las últimas 24 horas'}`;
  $('hSubLinea').textContent = k === 'nivel' ? `Lectura por hora. Aviso si baja de ${mn} %.` : `Lectura por hora. Rango ideal: ${num(mn, PARAMS[k].dec)} a ${num(mx, PARAMS[k].dec)}${H_UNIDAD[k] ? " " + H_UNIDAD[k] : ""}.`;
  graficoLinea($('gLinea'), k, datos);
  graficoHistograma($('gHisto'), k, datos);
  graficoRangos($('gRango'), horas);
  graficoAvisos($('gAvisos'));
  $('hTabla').innerHTML = `<table><thead><tr><th>Día</th><th>Promedio</th><th>Mínimo</th><th>Máximo</th><th>En rango</th></tr></thead><tbody>${
    porDia(datos).map(([t, ds]) => { const s = estadisticas(k, ds); return `<tr><td>${etiquetaDia(t)}</td><td>${num(s.prom, H_DEC[k])}</td><td>${num(s.min, H_DEC[k])}</td><td>${num(s.max, H_DEC[k])}</td><td>${num(s.ok * 100, 0)} %</td></tr>`; }).join('')}</tbody></table>`;
  const recos = recomendaciones(horas);
  const ic = { warn: '!', info: 'i', ok: '✓' };
  $('hRecos').innerHTML = recos.length ? recos.map(r => `<div class="reco ${r.tipo}"><span class="ri" aria-hidden="true">${ic[r.tipo]}</span><div><b>${esc(r.titulo)}</b><p>${esc(r.texto)}</p></div></div>`).join('') : '<div class="vacio">Sin recomendaciones para este período.</div>';
}
$('hParam').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) { hSel.k = b.dataset.k; pintarHistorial(); } });
$('hPeriodo').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) { hSel.horas = +b.dataset.p; pintarHistorial(); } });
let hResize; window.addEventListener('resize', () => { clearTimeout(hResize); hResize = setTimeout(() => { if (!$('vista-historial').hidden) pintarHistorial(); }, 200); });
