/* =====================================================================
   Servidor del Monitor Hidropónico
   - Recibe las lecturas del ESP32 (POST /api/lecturas)
   - Detecta problemas con los rangos que configuró el productor
   - Envía notificaciones push a los celulares con la PWA instalada
   - Sirve la PWA (carpeta ../public)

   Uso:
     npm install
     npx web-push generate-vapid-keys      (una sola vez)
     VAPID_PUBLICA=... VAPID_PRIVADA=... CLAVE_ESP32=unaclave npm start
   ===================================================================== */
const express = require('express');
const webpush = require('web-push');
const fs = require('fs');
const path = require('path');

const PUERTO = process.env.PORT || 3000;
const CLAVE_ESP32 = process.env.CLAVE_ESP32 || 'cambiar-esta-clave';
const ARCHIVO = path.join(__dirname, 'datos.json');
webpush.setVapidDetails('mailto:equipo@example.com', process.env.VAPID_PUBLICA, process.env.VAPID_PRIVADA);

// ---------- datos guardados ----------
const LECHUGA = { temp: [15, 24], hum: [60, 80], ph: [5.8, 6.2], ce: [1.2, 1.8], nivelMin: 30 };
let db = { config: { rangos: LECHUGA, avisos: { espera: 5, sirena: true, activos: { temp: true, hum: true, ph: true, ce: true, nivel: true, energia: true } } }, lecturas: [], cortes: [], suscripciones: [] };
try { db = { ...db, ...JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')) }; } catch (e) {}
let guardarPendiente = null;
const guardar = () => { clearTimeout(guardarPendiente); guardarPendiente = setTimeout(() => fs.writeFile(ARCHIVO, JSON.stringify(db), () => {}), 2000); };

// ---------- reglas de aviso (las mismas que usa la app) ----------
const PARAMS = { temp: { nombre: 'Temperatura', unidad: '°C', margen: 4 }, hum: { nombre: 'Humedad', unidad: '%', margen: 10 }, ph: { nombre: 'pH', unidad: '', margen: 0.4 }, ce: { nombre: 'Conductividad', unidad: 'mS/cm', margen: 0.4 } };
const CAMPO = { temp: 'temperatura', hum: 'humedad', ph: 'ph', ce: 'ce', nivel: 'nivelCaldo', energia: 'energia' };
const CONSEJO = {
  temp: { alto: 'Abrí los laterales o extendé la media sombra.', bajo: 'Cerrá los laterales y las cortinas.' },
  hum: { alto: 'Ventilá el invernadero.', bajo: 'Mojá los pasillos.' },
  ph: { alto: 'Agregá de a poco corrector de pH (ácido) y volvé a medir.', bajo: 'Agregá de a poco corrector de pH (base) y volvé a medir.' },
  ce: { alto: 'Agregá agua limpia al tanque.', bajo: 'Agregá solución nutritiva A y B.' }
};
function evaluar(k, v) {
  const r = db.config.rangos;
  if (k === 'energia') {
    if (v === 'generador') return { estado: 'warn', titulo: 'Se cortó la luz', cuerpo: 'Funciona con grupo electrógeno. Revisá el combustible.' };
    if (v === 'sin') return { estado: 'crit', titulo: 'Sin luz y sin grupo electrógeno', cuerpo: 'La bomba está parada. Encendé el grupo.' };
    return { estado: 'ok' };
  }
  if (k === 'nivel') {
    if (v < 15) return { estado: 'crit', titulo: `Tanque casi vacío (${Math.round(v)} %)`, cuerpo: 'Llená el tanque y revisá pérdidas.' };
    if (v < r.nivelMin) return { estado: 'warn', titulo: `Bajó el nivel de caldo (${Math.round(v)} %)`, cuerpo: 'Llená el tanque y controlá pH y CE.' };
    return { estado: 'ok' };
  }
  const [mn, mx] = r[k], p = PARAMS[k];
  if (v >= mn && v <= mx) return { estado: 'ok' };
  const alto = v > mx;
  return { estado: (alto ? v - mx : mn - v) > p.margen ? 'crit' : 'warn', titulo: `${p.nombre} ${alto ? 'alta' : 'baja'}: ${v} ${p.unidad}`.replace('pH alta', 'pH alto').replace('pH baja', 'pH bajo').trim(), cuerpo: CONSEJO[k][alto ? 'alto' : 'bajo'] };
}
const NOMBRE = { temp: 'Temperatura', hum: 'Humedad', ph: 'pH', ce: 'Conductividad', nivel: 'Nivel de caldo', energia: 'Energía eléctrica' };
const peso = e => ({ ok: 0, warn: 1, crit: 2 }[e]);
const desde = {}, activo = {};
function revisar(l) {
  const ahora = Date.now(), { espera, activos } = db.config.avisos;
  for (const k of Object.keys(CAMPO)) {
    const r = evaluar(k, l[CAMPO[k]]);
    if (r.estado === 'ok' || !activos[k]) {
      if (activo[k]) enviarPush({ titulo: `${NOMBRE[k]}: volvió a la normalidad`, cuerpo: '', clave: k });
      desde[k] = null; activo[k] = null; continue;
    }
    if (!desde[k]) desde[k] = ahora;
    if (ahora - desde[k] >= espera * 60e3 && (!activo[k] || peso(r.estado) > peso(activo[k]))) {
      activo[k] = r.estado;
      enviarPush({ titulo: r.titulo, cuerpo: r.cuerpo, clave: k, urgente: r.estado === 'crit' });
      // Si hay sirena, el ESP32 la enciende al leer "sirena: true" en la respuesta (ver POST /api/lecturas)
    }
  }
}
async function enviarPush(msg) {
  const vivas = [];
  await Promise.all(db.suscripciones.map(async s => {
    try { await webpush.sendNotification(s, JSON.stringify(msg)); vivas.push(s); }
    catch (e) { if (e.statusCode !== 404 && e.statusCode !== 410) vivas.push(s); }   // 404/410 = el celular desinstaló la app
  }));
  db.suscripciones = vivas; guardar();
}

// ---------- API ----------
const app = express();
app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// El ESP32 manda una lectura por minuto:
// { "temperatura": 21.4, "humedad": 68, "ph": 6.1, "ce": 1.5, "nivelCaldo": 72, "energia": "red" }
app.post('/api/lecturas', (req, res) => {
  if (req.get('x-clave') !== CLAVE_ESP32) return res.status(401).json({ error: 'Clave incorrecta' });
  const l = { t: Date.now(), ...req.body };
  const previa = db.lecturas[db.lecturas.length - 1];
  if (previa && previa.energia === 'red' && l.energia !== 'red') db.cortes.push({ inicio: l.t, horas: 0, tipo: l.energia });
  if (previa && previa.energia !== 'red' && l.energia === 'red' && db.cortes.length) { const c = db.cortes[db.cortes.length - 1]; c.horas = Math.round((l.t - c.inicio) / 36e5 * 10) / 10; }
  db.lecturas.push(l);
  const limite = Date.now() - 7 * 24 * 36e5;                     // se guardan 7 días
  db.lecturas = db.lecturas.filter(x => x.t >= limite);
  db.cortes = db.cortes.filter(x => x.inicio >= limite);
  revisar(l); guardar();
  const sirena = db.config.avisos.sirena && Object.values(activo).includes('crit');
  res.json({ ok: true, sirena, rangos: db.config.rangos });      // el ESP32 puede usar esto para encender la sirena
});

app.get('/api/estado', (req, res) => res.json(db.lecturas[db.lecturas.length - 1] || {}));

// Promedios por hora para los gráficos del historial
app.get('/api/historial', (req, res) => {
  const horas = Math.min(168, +req.query.horas || 168), desdeT = Date.now() - horas * 36e5;
  const serie = { temp: [], hum: [], ph: [], ce: [], nivel: [] }, grupos = new Map();
  db.lecturas.filter(l => l.t >= desdeT).forEach(l => { const h = Math.floor(l.t / 36e5) * 36e5; if (!grupos.has(h)) grupos.set(h, []); grupos.get(h).push(l); });
  for (const [t, ls] of [...grupos.entries()].sort((a, b) => a[0] - b[0])) {
    for (const k of Object.keys(serie)) { const vs = ls.map(l => l[CAMPO[k]]).filter(v => typeof v === 'number'); if (vs.length) serie[k].push({ t, v: vs.reduce((a, b) => a + b) / vs.length }); }
  }
  res.json({ serie, cortes: db.cortes });
});

app.get('/api/config', (req, res) => res.json(db.config));
app.put('/api/config', (req, res) => { if (req.body.rangos) db.config.rangos = req.body.rangos; if (req.body.avisos) db.config.avisos = req.body.avisos; guardar(); res.json({ ok: true }); });

app.get('/api/vapid', (req, res) => res.json({ clave: process.env.VAPID_PUBLICA }));
app.post('/api/suscribir', (req, res) => {
  const s = req.body; if (!s || !s.endpoint) return res.status(400).json({ error: 'Suscripción inválida' });
  if (!db.suscripciones.some(x => x.endpoint === s.endpoint)) db.suscripciones.push(s);
  guardar(); res.json({ ok: true });
});

app.listen(PUERTO, () => console.log(`Monitor Hidropónico en http://localhost:${PUERTO}`));