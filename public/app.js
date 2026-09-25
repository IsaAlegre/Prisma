/* =====================================================================
   Monitor Hidropónico — aplicación del productor (PWA)
   JavaScript puro, sin librerías.

   Parámetros: temperatura, humedad, pH, conductividad eléctrica (CE),
   nivel de caldo y disponibilidad de energía eléctrica.

   Cómo viajan los datos:
     ESP32 (Wi-Fi) --POST--> servidor --push--> celular (esta PWA)
   El servidor recibe las lecturas, detecta los problemas y manda la
   notificación push, aunque la app esté cerrada.

   MODO_DEMO = true simula todo en el navegador, sin placa ni servidor.
   ===================================================================== */

// ---------------------------------------------------------------------
// 1. Configuración de la conexión
// ---------------------------------------------------------------------
const MODO_DEMO = true;      // false = leer del servidor real
const API = '';              // misma dirección que la app (ej.: 'https://mi-servidor.com')
const INTERVALO_MS = 1000;   // demo: 1 s = 1 minuto simulado. Real: usar 30000 o más.

// ---------------------------------------------------------------------
// 2. Parámetros y valores recomendados para lechuga
// ---------------------------------------------------------------------
const PARAMS = {
  temp: { nombre: 'Temperatura',        unidad: '°C',    dec: 1, paso: 0.5, escala: [0, 45],  margenUrgente: 4 },
  hum:  { nombre: 'Humedad',            unidad: '%',     dec: 0, paso: 1,   escala: [20, 100], margenUrgente: 10 },
  ph:   { nombre: 'pH',                 unidad: '',      dec: 1, paso: 0.1, escala: [4, 9],   margenUrgente: 0.4 },
  ce:   { nombre: 'Conductividad (CE)', unidad: 'mS/cm', dec: 1, paso: 0.1, escala: [0, 4],   margenUrgente: 0.4 }
};
const LECHUGA = { temp: [15, 24], hum: [60, 80], ph: [5.8, 6.2], ce: [1.2, 1.8], nivelMin: 30 };
const TIPOS_LECHUGA = ['Mantecosa', 'Crespa', 'Morada', 'Romana', 'Francesa', 'Otra'];
const SISTEMAS = { nft: 'NFT', flotante: 'Raíz flotante', sustrato: 'Sustrato', torre: 'Torre vertical', otro: 'Otro' };
const NOMBRES_AVISO = { temp: 'Temperatura', hum: 'Humedad', ph: 'pH', ce: 'Conductividad', nivel: 'Nivel de caldo', energia: 'Corte de luz' };

// Recomendaciones que acompañan a cada aviso (el primer ítem es la acción principal)
const RECOMENDACIONES = {
  temp: {
    alto: ['Abrí los laterales para ventilar.', 'Extendé la media sombra en las horas de más sol.', 'Revisá que el caldo no se esté calentando.'],
    bajo: ['Cerrá los laterales y las cortinas.', 'Revisá que no entre aire frío por roturas del plástico.']
  },
  hum: {
    alto: ['Ventilá el invernadero.', 'Evitá mojar el piso a última hora de la tarde.', 'Revisá las hojas por manchas de hongos.'],
    bajo: ['Mojá los pasillos.', 'Si tenés nebulizadores, encendelos unos minutos.']
  },
  ph: {
    alto: ['Agregá de a poco corrector de pH (ácido).', 'Esperá 15 minutos y volvé a medir.', 'No corrijas todo de una vez: la planta sufre los cambios bruscos.'],
    bajo: ['Agregá de a poco corrector de pH (base).', 'Esperá 15 minutos y volvé a medir.']
  },
  ce: {
    alto: ['Agregá agua limpia al tanque.', 'Volvé a medir después de mezclar.', 'Con calor es común que suba: la planta toma más agua que nutrientes.'],
    bajo: ['Agregá solución nutritiva A y B según tu fórmula.', 'Mezclá bien y volvé a medir.']
  },
  nivel: ['Llená el tanque con agua limpia.', 'Después de llenar, controlá pH y CE.', 'Revisá caños y uniones por si hay pérdidas.'],
  generador: ['Revisá que el grupo electrógeno tenga combustible.', 'Confirmá que la bomba siga funcionando.'],
  sin: ['Encendé el grupo electrógeno.', 'Sin luz la bomba está parada: las raíces se secan rápido.', 'Si el corte sigue, mojá las raíces a mano cada 30 minutos.']
};

// ---------------------------------------------------------------------
// 3. Configuración del productor (se guarda en el celular)
// ---------------------------------------------------------------------
const CLAVE = 'monitor-hidro-v5';
const copiar = o => JSON.parse(JSON.stringify(o));
function cargar() { try { return JSON.parse(localStorage.getItem(CLAVE)); } catch (e) { return null; } }
function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify(cfg)); } catch (e) {}
  if (!MODO_DEMO) fetch(API + '/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rangos: rangos(), avisos: cfg.avisos }) }).catch(() => {});
}
let cfg = cargar() || {
  invernadero: { nombre: 'Mi invernadero', sistema: 'nft' },
  cultivo: 'lechuga',
  cultivos: { lechuga: { nombre: 'Lechuga', tipo: 'Mantecosa', fijo: true, rangos: copiar(LECHUGA) } },
  avisos: { espera: 5, sirena: true, activos: { temp: true, hum: true, ph: true, ce: true, nivel: true, energia: true } }
};
const rangos = () => cfg.cultivos[cfg.cultivo].rangos;
const nombreCultivo = (id = cfg.cultivo) => { const c = cfg.cultivos[id]; return c.tipo ? `${c.nombre} ${c.tipo.toLowerCase()}` : c.nombre; };

// ---------------------------------------------------------------------
// 4. Utilidades
// ---------------------------------------------------------------------
const $ = id => document.getElementById(id);
const num = (v, d) => Number(v).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
const hora = m => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const azar = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// Ilustraciones
const HOJA = 'M50 64 C30 50 26 22 50 12 C74 22 70 50 50 64 Z';
const COLORES = { Mantecosa: ['#7DB84A', '#BFE081', '#5E9A33'], Crespa: ['#5FA83A', '#A9D96B', '#437F28'], Morada: ['#8B3A62', '#A5CF62', '#6A2A4A'], Romana: ['#4E9A3A', '#9CCB5E', '#387027'], Francesa: ['#6DAF45', '#C4E38C', '#4C8A2E'], Otra: ['#6AAE44', '#B3DC76', '#4A8A2E'] };
function lechugaSVG(tipo) {
  const [a, b, v] = COLORES[tipo] || COLORES.Otra;
  const ext = [-72, -40, 40, 72, -14, 14].map(g => `<path d="${HOJA}" transform="rotate(${g} 50 64)" fill="${a}" stroke="${v}" stroke-width="1.2"/>`).join('');
  const int = [-30, 30, 0].map(g => `<path d="${HOJA}" transform="translate(50 64) scale(.66) translate(-50 -64) rotate(${g} 50 64)" fill="${b}" stroke="${v}" stroke-width="1.4"/>`).join('');
  return `<svg class="art" viewBox="0 0 100 80" role="img" aria-label="Lechuga"><ellipse cx="50" cy="70" rx="30" ry="5" fill="#000" opacity=".12"/>${ext}${int}</svg>`;
}
const broteSVG = () => `<svg class="art" viewBox="0 0 100 80" aria-hidden="true"><path d="M50 70V40" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/><path d="M50 46C36 46 28 36 28 24C42 24 50 32 50 46Z" fill="var(--accent)" opacity=".7"/><path d="M50 40C62 40 72 30 72 18C58 18 50 26 50 40Z" fill="var(--accent)"/></svg>`;
const imagen = c => c.foto ? `<img class="art" src="${c.foto}" alt="${esc(c.nombre)}">` : c.fijo ? lechugaSVG(c.tipo) : broteSVG();
const ICONOS = {
  temp: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0Z"/></svg>',
  hum: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11Z"/></svg>',
  ph: 'pH', ce: 'CE',
  nivel: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M5 13h14"/></svg>',
  energia: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/></svg>'
};

// ---------------------------------------------------------------------
// 5. PWA: instalación y notificaciones push
// ---------------------------------------------------------------------
let swReg = null, pedidoInstalar = null;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(r => { swReg = r; pintarPush(); }).catch(() => pintarPush());
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); pedidoInstalar = e; $('instalar').hidden = false; });
$('instalar').addEventListener('click', async () => { if (!pedidoInstalar) return; pedidoInstalar.prompt(); await pedidoInstalar.userChoice; pedidoInstalar = null; $('instalar').hidden = true; });

const permisoPush = () => ('Notification' in window) ? Notification.permission : 'no-soportado';
function pintarPush() {
  const p = permisoPush(), t = $('pushEstado'), b = $('activarPush');
  if (p === 'granted') { t.textContent = 'Las notificaciones están activadas en este dispositivo.'; b.hidden = true; }
  else if (p === 'denied') { t.textContent = 'El navegador bloqueó las notificaciones. Activalas desde la configuración del navegador, en los permisos de este sitio.'; b.hidden = true; }
  else if (p === 'no-soportado' || !swReg) { t.textContent = 'Acá no se pueden activar notificaciones. Abrí la app desde el celular e instalala en la pantalla de inicio (en iPhone, desde Compartir > Agregar a inicio).'; b.hidden = true; }
  else { t.textContent = 'Activá las notificaciones para recibir los avisos aunque la app esté cerrada.'; b.hidden = false; }
}
async function activarPush() {
  try {
    const p = await Notification.requestPermission();
    if (p === 'granted' && swReg && !MODO_DEMO) {
      // Suscripción Web Push: el servidor usa esta suscripción para enviar los avisos
      const { clave } = await (await fetch(API + '/api/vapid')).json();
      const sub = await swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64aBytes(clave) });
      await fetch(API + '/api/suscribir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) });
    }
  } catch (e) { $('pushEstado').textContent = 'No se pudieron activar las notificaciones: ' + e.message; return; }
  pintarPush();
}
function base64aBytes(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4), s = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...s].map(c => c.charCodeAt(0)));
}
// Muestra la notificación del sistema (en modo real la envía el servidor por push)
function notificacionSistema(a) {
  if (permisoPush() !== 'granted' || !swReg) return;
  swReg.showNotification(a.titulo, { body: (a.recomendaciones || [])[0] || '', tag: a.clave || 'aviso', icon: 'iconos/icon-192.png', badge: 'iconos/icon-192.png' }).catch(() => {});
}
$('activarPush').addEventListener('click', activarPush);
$('probarPush').addEventListener('click', () => {
  const a = { estado: 'warn', titulo: 'Aviso de prueba', recomendaciones: ['Si ves este mensaje, los avisos funcionan.'], clave: 'prueba' };
  notificar(a); notificacionSistema(a);
});

// ---------------------------------------------------------------------
// 6. Lecturas: simulación (demo) o servidor (real)
// ---------------------------------------------------------------------
let minuto = new Date().getHours() * 60 + new Date().getMinutes();
const centro = k => (rangos()[k][0] + rangos()[k][1]) / 2;
let lectura = { temp: centro('temp'), hum: centro('hum'), ph: centro('ph'), ce: centro('ce'), nivel: 72, energia: 'red' };
let sim = { objetivo: {}, energia: 'red', vaciando: false, activos: new Set() };
const RUIDO = { temp: 0.18, hum: 0.7, ph: 0.015, ce: 0.012 };

function simular() {
  for (const k in PARAMS) {
    const o = sim.objetivo[k] ?? centro(k);
    lectura[k] += (o - lectura[k]) * 0.14 + azar() * RUIDO[k];
  }
  lectura.nivel += sim.vaciando ? -2.5 : (74 - lectura.nivel) * 0.2;
  lectura.nivel = Math.max(0, Math.min(100, lectura.nivel));
  lectura.energia = sim.energia;
}
const ESCENARIOS = {
  calor: () => Object.assign(sim.objetivo, { temp: 34, hum: 45 }),
  ph: () => Object.assign(sim.objetivo, { ph: 7.2 }),
  ce: () => Object.assign(sim.objetivo, { ce: 0.6 }),
  caldo: () => { sim.vaciando = true; },
  corte: () => { sim.energia = 'generador'; },
  apagon: () => { sim.energia = 'sin'; },
  normal: () => { sim = { objetivo: {}, energia: 'red', vaciando: false, activos: new Set() }; }
};
async function leerServidor() {
  const d = await (await fetch(API + '/api/estado', { cache: 'no-store' })).json();
  return { temp: d.temperatura, hum: d.humedad, ph: d.ph, ce: d.ce, nivel: d.nivelCaldo, energia: d.energia };
}

// ---------------------------------------------------------------------
// 7. Evaluar el estado y generar avisos
// ---------------------------------------------------------------------
// Devuelve { estado: 'ok' | 'warn' | 'crit', titulo, recomendaciones }
function evaluar(k, v = lectura[k]) {
  if (k === 'energia') {
    if (v === 'generador') return { estado: 'warn', titulo: 'Se cortó la luz: funciona con grupo electrógeno', recomendaciones: RECOMENDACIONES.generador };
    if (v === 'sin') return { estado: 'crit', titulo: 'Sin luz y sin grupo electrógeno', recomendaciones: RECOMENDACIONES.sin };
    return { estado: 'ok' };
  }
  if (k === 'nivel') {
    const min = rangos().nivelMin;
    if (v < 15) return { estado: 'crit', titulo: `El tanque está casi vacío (${num(v, 0)} %)`, recomendaciones: RECOMENDACIONES.nivel };
    if (v < min) return { estado: 'warn', titulo: `Bajó el nivel de caldo (${num(v, 0)} %)`, recomendaciones: RECOMENDACIONES.nivel };
    return { estado: 'ok' };
  }
  const p = PARAMS[k], [mn, mx] = rangos()[k];
  if (v >= mn && v <= mx) return { estado: 'ok' };
  const alto = v > mx, dif = alto ? v - mx : mn - v;
  const palabra = k === 'ph' ? (alto ? 'alto' : 'bajo') : (alto ? 'alta' : 'baja');
  return {
    estado: dif > p.margenUrgente ? 'crit' : 'warn',
    titulo: `${p.nombre} ${palabra}: ${num(v, p.dec)} ${p.unidad}`.trim(),
    recomendaciones: RECOMENDACIONES[k][alto ? 'alto' : 'bajo']
  };
}
const CLAVES = ['temp', 'hum', 'ph', 'ce', 'nivel', 'energia'];
const peso = e => ({ ok: 0, warn: 1, crit: 2 }[e]);
const desde = {};      // minuto en que empezó cada problema
const activo = {};     // aviso enviado y todavía sin resolver
let historialAvisos = [
  { id: 's2', hora: '09:12', estado: 'ok', titulo: 'El pH volvió a la normalidad' },
  { id: 's1', clave: 'ph', hora: '08:47', estado: 'warn', titulo: 'pH alto: 6,7', recomendaciones: RECOMENDACIONES.ph.alto,
    resuelto: { por: 'Encargado/a', rol: 'Encargado', hora: '08:58' } }
];

// En modo real esta misma lógica corre en el servidor, que es quien manda el push.
function revisarAvisos() {
  for (const k of CLAVES) {
    const r = evaluar(k);
    if (r.estado === 'ok' || !cfg.avisos.activos[k]) {
      desde[k] = null;
      if (activo[k]) {
        cerrarAvisos(k, { auto: 'normalizado', hora: hora(minuto) });   // lo viejo deja de mostrar recomendaciones
        agregarAviso({ clave: k, estado: 'ok', titulo: `${NOMBRES_AVISO[k]}: volvió a la normalidad` }); activo[k] = null;
      }
      continue;
    }
    if (desde[k] == null) desde[k] = minuto;
    if (minuto - desde[k] >= cfg.avisos.espera && (!activo[k] || peso(r.estado) > peso(activo[k].estado))) {
      activo[k] = agregarAviso({ clave: k, ...r, sirena: r.estado === 'crit' && cfg.avisos.sirena });
    }
  }
}
function agregarAviso(a) {
  a.hora = hora(minuto);
  a.id = a.id || 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  if (a.estado !== 'ok' && a.clave) cerrarAvisos(a.clave, { auto: 'reemplazado', hora: a.hora });  // un aviso más grave reemplaza al anterior
  historialAvisos.unshift(a);
  historialAvisos = historialAvisos.slice(0, 30);
  a.para = destinatarios(a.estado);                               // quiénes lo reciben según su rol
  notificar(a);
  if (meLlega(a.estado)) notificacionSistema(a);                   // en este celular, solo si mi rol lo recibe
  if (!$('vista-avisos').hidden) pintarLista();
  return a;
}
function notificar(a) {
  const el = document.createElement('div');
  el.className = 'toast ' + a.estado;
  el.innerHTML = `<div class="a">${esc(cfg.invernadero.nombre || 'Mi invernadero')} · ${a.hora || hora(minuto)}${a.sirena ? ' · sirena encendida' : ''}${a.para ? ` · a ${a.para.length} ${a.para.length === 1 ? 'persona' : 'personas'}` : ''}</div><div class="b">${esc(a.titulo)}</div>${a.recomendaciones ? `<div class="c">${esc(a.recomendaciones[0])}</div>` : ''}`;
  $('toasts').prepend(el);
  const maximo = window.matchMedia('(max-width:700px)').matches ? 1 : 3;   // en el celular, de a uno
  while ($('toasts').children.length > maximo) $('toasts').lastChild.remove();
  el.addEventListener('click', () => el.remove());
  setTimeout(() => el.remove(), 5000);
}

// ---------------------------------------------------------------------
// 8. Pantalla de inicio
// ---------------------------------------------------------------------
function etiqueta(k, r) {
  if (r.estado === 'ok') return '<span class="st">Bien</span>';
  const txt = r.estado === 'crit' ? 'Urgente' : 'Revisar';
  if (!cfg.avisos.activos[k]) return `<span class="st ${r.estado}">${txt} · aviso apagado</span>`;
  if (activo[k] && activo[k].resuelto) return `<span class="st ${r.estado}">${txt} · en atención</span>`;
  if (activo[k]) return `<span class="st ${r.estado}">${txt} · te avisamos</span>`;
  const falta = Math.max(0, cfg.avisos.espera - (minuto - (desde[k] ?? minuto)));
  return `<span class="st ${r.estado}">${txt} · aviso en ${falta} min</span>`;
}
function tarjeta(k) {
  const r = evaluar(k), cab = t => `<div class="h"><span class="icono">${ICONOS[k]}</span><span class="hn">${t}</span><span class="semaforo" data-st="${r.estado}" aria-hidden="true"><i></i><i></i><i></i></span></div>`;
  if (k === 'energia') {
    const t = { red: 'Hay luz', generador: 'Con grupo electrógeno', sin: 'Sin energía' }[lectura.energia];
    return `<article class="tile" data-st="${r.estado}">${cab('Energía eléctrica')}<div class="v txt">${t}</div>${etiqueta(k, r)}</article>`;
  }
  if (k === 'nivel') {
    const min = rangos().nivelMin;
    return `<article class="tile" data-st="${r.estado}">${cab('Nivel de caldo')}<div class="v">${num(lectura.nivel, 0)}<small>%</small></div>
      <div class="tanque"><div class="lleno" style="width:${lectura.nivel}%"></div><div class="min" style="left:${min}%"></div></div>
      <div class="ref">Aviso si baja de ${min} %</div>${etiqueta(k, r)}</article>`;
  }
  const p = PARAMS[k], [mn, mx] = rangos()[k], v = lectura[k];
  const pos = x => Math.max(0, Math.min(100, (x - p.escala[0]) / (p.escala[1] - p.escala[0]) * 100));
  return `<article class="tile" data-st="${r.estado}">${cab(p.nombre)}<div class="v">${num(v, p.dec)}<small>${p.unidad}</small></div>
    <div class="barra"><div class="ideal" style="left:${pos(mn)}%;width:${pos(mx) - pos(mn)}%"></div><div class="mk" style="left:${pos(v)}%"></div></div>
    <div class="ref">Ideal: ${num(mn, p.dec)} a ${num(mx, p.dec)} ${p.unidad}</div>${etiqueta(k, r)}</article>`;
}
function pintarInicio() {
  const problemas = CLAVES.map(k => ({ k, ...evaluar(k) })).filter(r => r.estado !== 'ok').sort((a, b) => peso(b.estado) - peso(a.estado));
  const st = problemas.length ? problemas[0].estado : 'ok';
  const icono = st === 'ok'
    ? '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    : '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M12 6v7" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/><circle cx="12" cy="17.5" r="1.7" fill="#fff"/></svg>';
  const todoAtendido = problemas.length && problemas.every(p => activo[p.k] && activo[p.k].resuelto);
  const titulo = st === 'ok' ? 'Todo bien en el invernadero' : todoAtendido ? 'En atención' : st === 'crit' ? 'Atención urgente' : 'Hay algo para revisar';
  const detalle = st === 'ok'
    ? `<div class="d">Los valores están dentro de lo ideal para ${esc(nombreCultivo().toLowerCase())}.</div>`
    : problemas.slice(0, 2).map(p => {
        const a = activo[p.k];
        if (a && a.resuelto) return `<div class="d"><b>${esc(p.titulo)}</b><span class="atendido">✓ Resuelto por ${esc(a.resuelto.por)} a las ${a.resuelto.hora}. Esperando que el valor vuelva a lo normal.</span></div>`;
        return `<div class="d"><b>${esc(p.titulo)}</b><ul>${p.recomendaciones.slice(0, 2).map(x => `<li>${esc(x)}</li>`).join('')}</ul>${a ? `<button class="btn resolver" data-resolver="${a.id}">Marcar como resuelto</button>` : ''}</div>`;
      }).join('');
  $('estado').dataset.st = st;
  $('estado').innerHTML = `<div class="ic">${icono}</div><div><div class="t">${titulo}</div>${detalle}</div>`;
  $('tiles').innerHTML = CLAVES.map(tarjeta).join('');
  document.querySelectorAll('[data-sim]').forEach(b => b.classList.toggle('on', sim.activos.has(b.dataset.sim)));
}
function pintarEncabezado() {
  const c = cfg.cultivos[cfg.cultivo];
  $('brandArt').innerHTML = imagen(c);
  $('nombreInv').textContent = cfg.invernadero.nombre || 'Mi invernadero';
  $('subInv').textContent = `${nombreCultivo()} · ${SISTEMAS[cfg.invernadero.sistema]}`;
  $('reloj').textContent = hora(minuto);
  const n = Object.values(activo).filter(a => a && !a.resuelto).length;
  $('badge').hidden = !n; $('badge').textContent = n;
}

// ---------------------------------------------------------------------
// 9. Pantalla de avisos
// ---------------------------------------------------------------------
function pintarLista() {
  $('lista').innerHTML = historialAvisos.length ? historialAvisos.map(a => `
    <div class="aviso ${a.estado} ${a.resuelto ? 'cerrado' : ''}"><div class="hora">${a.hora}</div><div>
      <div class="ttl">${esc(a.titulo)}</div>
      ${a.recomendaciones && !a.resuelto ? `<ul>${a.recomendaciones.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${a.resuelto ? `<div class="resuelto-por">${textoResuelto(a.resuelto)}</div>` : ''}
      ${a.estado !== 'ok' && !a.resuelto ? `<button class="btn resolver" data-resolver="${a.id}">Marcar como resuelto</button>` : ''}
      ${a.para && a.estado !== 'ok' ? `<div class="env">Enviado a: ${a.para.length ? a.para.map(p => `${esc(p.nombre)} (${esc(p.rol)})`).join(', ') : 'nadie (ningún rol recibe este nivel)'}</div>` : ''}
      ${a.sirena ? '<div class="env">También se encendió la sirena.</div>' : ''}
    </div></div>`).join('') : '<div class="vacio">Todavía no hubo avisos.</div>';
}
function pintarAvisos() {
  pintarPush(); pintarLista();
  $('espera').value = String(cfg.avisos.espera);
  $('sirena').checked = cfg.avisos.sirena;
  $('switches').innerHTML = CLAVES.map(k => `<label class="sw"><input type="checkbox" id="sw-${k}" data-sw="${k}" ${cfg.avisos.activos[k] ? 'checked' : ''}><span class="tr"></span>${NOMBRES_AVISO[k]}</label>`).join('');
}

// ---------------------------------------------------------------------
// 10. Pantalla de configuración
// ---------------------------------------------------------------------
const paso = (k, i, valor) => `<span class="step"><button type="button" data-paso="${k}" data-i="${i}" data-d="-1" aria-label="Bajar">−</button><output>${valor}</output><button type="button" data-paso="${k}" data-i="${i}" data-d="1" aria-label="Subir">+</button></span>`;
function pintarConfig() {
  $('cultivos').innerHTML = Object.entries(cfg.cultivos).map(([id, c]) =>
    `<button class="cultivo" type="button" data-cultivo="${id}" aria-pressed="${cfg.cultivo === id}">${imagen(c)}<strong>${esc(c.nombre)}</strong><span>${esc(c.tipo || 'Sin tipo')}</span></button>`).join('')
    + `<button class="cultivo agregar" type="button" id="abrirNuevo"><svg class="art" viewBox="0 0 100 80" aria-hidden="true"><circle cx="50" cy="40" r="20" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="5 4"/><path d="M50 31v18M41 40h18" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/></svg><strong>Agregar producto</strong></button>`;
  const c = cfg.cultivos[cfg.cultivo];
  $('tipoCultivo').innerHTML = `<div class="tipo"><label class="fld">Tipo de ${esc(c.nombre.toLowerCase())}${c.fijo
    ? `<select id="tipoSel">${TIPOS_LECHUGA.map(t => `<option ${c.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select>`
    : `<input id="tipoSel" value="${esc(c.tipo || '')}">`}</label>${c.fijo ? '' : `<button class="btn" type="button" id="borrar">Quitar ${esc(c.nombre)}</button>`}</div>`;
  $('rangos').innerHTML = Object.entries(PARAMS).map(([k, p]) => {
    const [mn, mx] = rangos()[k];
    return `<div class="rango"><div class="n">${p.nombre}${p.unidad ? `<small>${p.unidad}</small>` : ''}</div>
      <div class="ctl"><div class="lim"><span>Mínimo</span>${paso(k, 0, num(mn, p.dec))}</div><div class="lim"><span>Máximo</span>${paso(k, 1, num(mx, p.dec))}</div></div></div>`;
  }).join('') + `<div class="rango"><div class="n">Nivel de caldo<small>%</small></div><div class="ctl"><div class="lim"><span>Avisar si baja de</span>${paso('nivelMin', 0, rangos().nivelMin)}</div></div></div>`;
  $('invNombre').value = cfg.invernadero.nombre;
  $('invSistema').innerHTML = Object.entries(SISTEMAS).map(([v, t]) => `<option value="${v}" ${cfg.invernadero.sistema === v ? 'selected' : ''}>${t}</option>`).join('');
}
const mensaje = t => { $('guardado').textContent = t; };
function cambiarRango(k, i, dir) {
  const r = rangos();
  if (k === 'nivelMin') r.nivelMin = Math.max(10, Math.min(90, r.nivelMin + dir * 5));
  else {
    const p = PARAMS[k], nuevo = Math.round((r[k][i] + dir * p.paso) * 100) / 100;
    if (i === 0 && nuevo >= r[k][1]) return mensaje('El mínimo tiene que quedar por debajo del máximo.');
    if (i === 1 && nuevo <= r[k][0]) return mensaje('El máximo tiene que quedar por encima del mínimo.');
    if (nuevo < p.escala[0] || nuevo > p.escala[1]) return;
    r[k][i] = nuevo;
  }
  guardar(); pintarConfig(); pintarInicio(); mensaje('Guardado.');
}

// ---------------------------------------------------------------------
// 11. Eventos
// ---------------------------------------------------------------------
function mostrar(t) {
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t));
  ['inicio', 'historial', 'avisos', 'config'].forEach(v => { $('vista-' + v).hidden = v !== t; });
  if (!MODO_DEMO) $('abrirDemo').hidden = true;
  if (t === 'historial') pintarHistorial();
  if (t === 'avisos') pintarAvisos();
  if (t === 'config') pintarConfig();
  if (t === 'config') pintarEquipo();
  aplicarPermisos();
  window.scrollTo(0, 0);
}
document.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('.tab'); if (b) mostrar(b.dataset.tab); });
const hojaDemo = abrir => { $('demo').hidden = !abrir; $('abrirDemo').setAttribute('aria-expanded', abrir); };
$('abrirDemo').addEventListener('click', () => hojaDemo($('demo').hidden));
$('cerrarDemo').addEventListener('click', () => hojaDemo(false));
$('demo').addEventListener('click', e => {
  const b = e.target.closest('[data-sim]'); if (!b) return;
  ESCENARIOS[b.dataset.sim]();
  if (b.dataset.sim !== 'normal') sim.activos.add(b.dataset.sim);
  pintarInicio(); hojaDemo(false);
});
$('espera').addEventListener('change', e => { cfg.avisos.espera = +e.target.value; guardar(); pintarInicio(); });
$('sirena').addEventListener('change', e => { cfg.avisos.sirena = e.target.checked; guardar(); });
$('switches').addEventListener('change', e => { const k = e.target.dataset.sw; if (!k) return; cfg.avisos.activos[k] = e.target.checked; guardar(); pintarInicio(); });

$('cultivos').addEventListener('click', e => {
  if (e.target.closest('#abrirNuevo')) { $('nuevo').hidden = false; $('nNombre').focus(); return; }
  const b = e.target.closest('[data-cultivo]'); if (!b) return;
  cfg.cultivo = b.dataset.cultivo; guardar(); pintarConfig(); pintarInicio(); pintarEncabezado();
});
$('tipoCultivo').addEventListener('change', e => {
  if (e.target.id !== 'tipoSel') return;
  cfg.cultivos[cfg.cultivo].tipo = e.target.value.trim(); guardar(); pintarConfig(); pintarEncabezado(); pintarInicio();
});
$('tipoCultivo').addEventListener('click', e => {
  if (e.target.id !== 'borrar') return;
  delete cfg.cultivos[cfg.cultivo]; cfg.cultivo = 'lechuga'; guardar(); pintarConfig(); pintarEncabezado(); pintarInicio();
});
$('rangos').addEventListener('click', e => { const b = e.target.closest('[data-paso]'); if (b) cambiarRango(b.dataset.paso, +b.dataset.i, +b.dataset.d); });
$('restablecer').addEventListener('click', () => { cfg.cultivos[cfg.cultivo].rangos = copiar(LECHUGA); guardar(); pintarConfig(); pintarInicio(); mensaje('Se volvió a los valores recomendados para lechuga.'); });
$('invNombre').addEventListener('input', e => { cfg.invernadero.nombre = e.target.value; guardar(); pintarEncabezado(); });
$('invSistema').addEventListener('change', e => { cfg.invernadero.sistema = e.target.value; guardar(); pintarEncabezado(); });

// Nuevo producto (con foto opcional)
let fotoNueva = null;
$('nFoto').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const lector = new FileReader();
  lector.onload = () => {
    const img = new Image();
    img.onload = () => {
      const S = 200, cv = document.createElement('canvas'); cv.width = S; cv.height = S;
      const m = Math.min(img.width, img.height);
      cv.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S, S);
      fotoNueva = cv.toDataURL('image/jpeg', 0.8);
      $('nPrev').innerHTML = `<img class="art" src="${fotoNueva}" alt="Vista previa">`;
    };
    img.src = lector.result;
  };
  lector.readAsDataURL(f);
});
function cerrarNuevo() { $('nuevo').reset(); $('nuevo').hidden = true; $('nPrev').innerHTML = ''; $('nErr').textContent = ''; fotoNueva = null; }
$('nCancelar').addEventListener('click', cerrarNuevo);
$('nuevo').addEventListener('submit', e => {
  e.preventDefault();
  const nombre = $('nNombre').value.trim(), tipo = $('nTipo').value.trim();
  if (!nombre) { $('nErr').textContent = 'Escribí el nombre del producto.'; return; }
  const id = 'p' + Date.now().toString(36);
  cfg.cultivos[id] = { nombre, tipo, foto: fotoNueva, rangos: copiar(LECHUGA) };  // arranca con los valores de lechuga
  cfg.cultivo = id; guardar(); cerrarNuevo(); pintarConfig(); pintarEncabezado(); pintarInicio();
  mensaje(`${nombre} agregado. Ajustá sus valores ideales.`);
});

// ---------------------------------------------------------------------
// 12. Ciclo principal
// ---------------------------------------------------------------------
async function ciclo() {
  if (MODO_DEMO) { minuto++; simular(); revisarAvisos(); }
  else {
    try { lectura = await leerServidor(); const d = new Date(); minuto = d.getHours() * 60 + d.getMinutes(); $('conexion').innerHTML = '<span class="dot"></span>ESP32 · Wi-Fi'; }
    catch (err) { $('conexion').innerHTML = '<span class="dot" style="background:var(--crit)"></span>Sin conexión con el servidor'; return; }
  }
  pintarInicio(); pintarEncabezado();
}
window.addEventListener('DOMContentLoaded', () => { pintarInicio(); pintarEncabezado(); mostrar('inicio'); pintarPush(); pintarRol(); });
setInterval(ciclo, INTERVALO_MS);


// ---------------------------------------------------------------------
// 13. Equipo y roles
//     Cada persona tiene un rol. El rol define:
//       - qué avisos recibe (todos, solo urgentes o ninguno)
//       - si puede cambiar la configuración
//     Solo el Administrador gestiona el equipo.
//     En la demo, el botón del encabezado permite "probar como" otra persona.
//     En la versión real, cada persona entra con su usuario.
// ---------------------------------------------------------------------
const RECIBE = { todos: 'Todos los avisos', urgentes: 'Solo los urgentes', ninguno: 'Ningún aviso' };
const EQUIPO_INICIAL = {
  roles: {
    admin:     { nombre: 'Administrador', desc: 'Configura todo y administra el equipo.', recibe: 'todos',    editar: true, fijo: true },
    encargado: { nombre: 'Encargado',     desc: 'Atiende el invernadero día a día.',      recibe: 'todos',    editar: true },
    operario:  { nombre: 'Operario',      desc: 'Ayuda en tareas puntuales.',             recibe: 'todos',    editar: false }
  },
  personas: [
    { id: 'u1', nombre: 'Productor/a', rol: 'admin' },
    { id: 'u2', nombre: 'Encargado/a', rol: 'encargado' },
    { id: 'u3', nombre: 'Operario/a',  rol: 'operario' }
  ],
  actual: 'u1'
};
if (!cfg.equipo) { cfg.equipo = copiar(EQUIPO_INICIAL); guardar(); }   // agrega el equipo sin borrar la configuración existente

const yo = () => cfg.equipo.personas.find(p => p.id === cfg.equipo.actual) || cfg.equipo.personas[0];
const rolDe = p => cfg.equipo.roles[p.rol];
const recibeNivel = (rol, estado) => rol.recibe === 'todos' || (rol.recibe === 'urgentes' && estado === 'crit');
const meLlega = estado => recibeNivel(rolDe(yo()), estado);
const puedeEditar = () => rolDe(yo()).editar;
const esAdmin = () => yo().rol === 'admin';
const destinatarios = estado => cfg.equipo.personas.filter(p => recibeNivel(rolDe(p), estado)).map(p => ({ nombre: p.nombre || 'Sin nombre', rol: rolDe(p).nombre }));
const admins = () => cfg.equipo.personas.filter(p => p.rol === 'admin').length;
const ICONO_PERSONA = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>';

function pintarRol() {
  const p = yo();
  $('rolActual').innerHTML = `${ICONO_PERSONA}<span class="rn">${esc(p.nombre || 'Sin nombre')}</span><b>${esc(rolDe(p).nombre)}</b>`;
  $('menuRol').innerHTML = '<div class="menu-t">Probar la app como (demo)</div>' + cfg.equipo.personas.map(x =>
    `<button data-persona="${x.id}" aria-current="${x.id === p.id}"><span>${esc(x.nombre || 'Sin nombre')}</span><small>${esc(rolDe(x).nombre)}</small></button>`).join('');
}
function aplicarPermisos() {
  const ed = puedeEditar(), ad = esAdmin(), r = rolDe(yo()).nombre;
  document.querySelectorAll('.editable').forEach(el => { el.inert = !ed; el.classList.toggle('bloqueado', !ed); });
  document.querySelectorAll('.solo-admin').forEach(el => { el.inert = !ad; el.classList.toggle('bloqueado', !ad); });
  const msg = ed ? (ad ? '' : `Con el rol ${r} podés cambiar la configuración, pero solo el Administrador gestiona el equipo.`)
                 : `Con el rol ${r} podés ver el estado y los avisos, pero no cambiar la configuración.`;
  $('permisoConfig').textContent = msg; $('permisoConfig').hidden = !msg;
  $('permisoAvisos').textContent = ed ? '' : `Con el rol ${r} no podés cambiar cuándo se envían los avisos.`; $('permisoAvisos').hidden = ed;
}
function pintarEquipo() {
  const eq = cfg.equipo;
  $('roles').innerHTML = Object.entries(eq.roles).map(([id, r]) => `
    <div class="rolc" data-rol="${id}">
      ${r.fijo ? `<strong>${esc(r.nombre)}</strong>` : `<input class="rol-nombre" id="rn-${id}" data-campo="nombre" value="${esc(r.nombre)}" aria-label="Nombre del rol">`}
      <span class="hint" style="margin:0">${esc(r.desc)}</span>
      <label class="fld">Recibe<select id="rr-${id}" data-campo="recibe">${Object.entries(RECIBE).map(([v, t]) => `<option value="${v}" ${r.recibe === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="sw"><input type="checkbox" id="re-${id}" data-campo="editar" ${r.editar ? 'checked' : ''} ${r.fijo ? 'disabled' : ''}><span class="tr"></span>Puede cambiar la configuración</label>
      <span class="hint" style="margin:0">${eq.personas.filter(p => p.rol === id).length} ${eq.personas.filter(p => p.rol === id).length === 1 ? 'persona' : 'personas'}</span>
    </div>`).join('');
  $('personas').innerHTML = eq.personas.map(p => `
    <div class="persona" data-id="${p.id}">
      <input id="pn-${p.id}" data-campo="nombre" value="${esc(p.nombre)}" placeholder="Nombre" aria-label="Nombre">
      <select id="pr-${p.id}" data-campo="rol" aria-label="Rol">${Object.entries(eq.roles).map(([id, r]) => `<option value="${id}" ${p.rol === id ? 'selected' : ''}>${esc(r.nombre)}</option>`).join('')}</select>
      <button class="btn" type="button" data-quitar="${p.id}">Quitar</button>
    </div>`).join('');
  $('equipoErr').textContent = '';
}
const equipoCambio = () => { guardar(); pintarRol(); aplicarPermisos(); };

$('rolActual').addEventListener('click', e => { e.stopPropagation(); const m = $('menuRol'); m.hidden = !m.hidden; $('rolActual').setAttribute('aria-expanded', !m.hidden); });
document.addEventListener('click', e => { if (!e.target.closest('#menuRol')) { $('menuRol').hidden = true; $('rolActual').setAttribute('aria-expanded', 'false'); } });
$('menuRol').addEventListener('click', e => {
  const b = e.target.closest('[data-persona]'); if (!b) return;
  cfg.equipo.actual = b.dataset.persona; $('menuRol').hidden = true; equipoCambio();
  const activa = document.querySelector('.tab[aria-selected="true"]').dataset.tab; mostrar(activa);
  notificar({ estado: 'ok', titulo: `Ahora ves la app como ${yo().nombre || 'Sin nombre'} (${rolDe(yo()).nombre})` });
});
$('roles').addEventListener('change', e => {
  const c = e.target.closest('[data-rol]'); if (!c) return; const r = cfg.equipo.roles[c.dataset.rol], campo = e.target.dataset.campo;
  if (campo === 'recibe') r.recibe = e.target.value;
  if (campo === 'editar') r.editar = e.target.checked;
  if (campo === 'nombre') r.nombre = e.target.value.trim() || r.nombre;
  equipoCambio(); pintarEquipo();
});
$('personas').addEventListener('input', e => {
  if (e.target.dataset.campo !== 'nombre') return;
  cfg.equipo.personas.find(p => p.id === e.target.closest('[data-id]').dataset.id).nombre = e.target.value; guardar(); pintarRol();
});
$('personas').addEventListener('change', e => {
  if (e.target.dataset.campo !== 'rol') return;
  const p = cfg.equipo.personas.find(x => x.id === e.target.closest('[data-id]').dataset.id);
  if (p.rol === 'admin' && e.target.value !== 'admin' && admins() === 1) { e.target.value = 'admin'; $('equipoErr').textContent = 'Tiene que quedar al menos un Administrador.'; return; }
  p.rol = e.target.value; equipoCambio(); pintarEquipo();
});
$('personas').addEventListener('click', e => {
  const b = e.target.closest('[data-quitar]'); if (!b) return;
  const p = cfg.equipo.personas.find(x => x.id === b.dataset.quitar);
  if (p.rol === 'admin' && admins() === 1) { $('equipoErr').textContent = 'Tiene que quedar al menos un Administrador.'; return; }
  if (p.id === cfg.equipo.actual) { $('equipoErr').textContent = 'No podés quitarte a vos mismo.'; return; }
  cfg.equipo.personas = cfg.equipo.personas.filter(x => x.id !== p.id); equipoCambio(); pintarEquipo();
});
$('agregarPersona').addEventListener('click', () => {
  const id = 'u' + Date.now().toString(36);
  cfg.equipo.personas.push({ id, nombre: '', rol: 'operario' }); equipoCambio(); pintarEquipo(); $('pn-' + id).focus();
});


// ---------------------------------------------------------------------
// 14. Avisos en modo broadcast y "Marcar como resuelto"
//     El aviso llega a todos los celulares con la app instalada.
//     La primera persona que lo atiende lo marca como resuelto:
//       - desaparece como pendiente para todos
//       - se ocultan sus recomendaciones (ya no corresponden)
//       - queda registrado quién y a qué hora lo resolvió
//     Si el valor se normaliza solo, o llega un aviso más grave del mismo
//     parámetro, el aviso anterior también se cierra.
// ---------------------------------------------------------------------
function cerrarAvisos(clave, datos) {
  historialAvisos.forEach(a => { if (a.clave === clave && a.estado !== 'ok' && !a.resuelto) a.resuelto = datos; });
}
function textoResuelto(r) {
  if (r.auto === 'normalizado') return `✓ Se normalizó a las ${r.hora}`;
  if (r.auto === 'reemplazado') return `Reemplazado por un aviso más grave a las ${r.hora}`;
  return `✓ Resuelto por ${esc(r.por)} (${esc(r.rol)}) a las ${r.hora}`;
}
// En la demo, marcar como resuelto también "arregla" la simulación,
// como si la persona hubiera corregido el problema en el invernadero.
const ARREGLO_DEMO = {
  temp: () => { delete sim.objetivo.temp; sim.activos.delete('calor'); },
  hum: () => { delete sim.objetivo.hum; sim.activos.delete('calor'); },
  ph: () => { delete sim.objetivo.ph; sim.activos.delete('ph'); },
  ce: () => { delete sim.objetivo.ce; sim.activos.delete('ce'); },
  nivel: () => { sim.vaciando = false; sim.activos.delete('caldo'); },
  energia: () => { sim.energia = 'red'; sim.activos.delete('corte'); sim.activos.delete('apagon'); }
};
function resolverAviso(id) {
  const a = historialAvisos.find(x => x.id === id); if (!a || a.resuelto) return;
  a.resuelto = { por: yo().nombre || 'Sin nombre', rol: rolDe(yo()).nombre, hora: hora(minuto) };
  if (MODO_DEMO && ARREGLO_DEMO[a.clave]) ARREGLO_DEMO[a.clave]();
  else fetch(API + '/api/avisos/' + encodeURIComponent(id) + '/resolver', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ por: a.resuelto.por, rol: a.resuelto.rol }) }).catch(() => {});
  notificar({ estado: 'ok', titulo: `${a.titulo}: resuelto por ${a.resuelto.por}`, hora: a.resuelto.hora });
  pintarLista(); pintarInicio(); pintarEncabezado();
}
document.addEventListener('click', e => { const b = e.target.closest('[data-resolver]'); if (b) resolverAviso(b.dataset.resolver); });

// Modo real: la lista de avisos (y quién los resolvió) viene del servidor,
// así todos los celulares ven lo mismo.
async function sincronizarAvisos() {
  if (MODO_DEMO) return;
  try {
    const lista = await (await fetch(API + '/api/avisos', { cache: 'no-store' })).json();
    historialAvisos = lista;
    for (const k of CLAVES) activo[k] = lista.find(a => a.clave === k && a.estado !== 'ok' && !a.resuelto) || null;
    if (!$('vista-avisos').hidden) pintarLista();
  } catch (e) {}
}
if (!MODO_DEMO) setInterval(sincronizarAvisos, 15000);