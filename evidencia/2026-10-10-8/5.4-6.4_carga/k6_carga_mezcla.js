// COPIA CORREGIDA de pruebas/scripts_ajustados/k6_carga.js para la sesión TRL 2026-10-10-8 (desviación declarada).
// Cambios frente al original (el original NO se tocó):
//   1. noCookiesReset: true. Sin esto k6 borra la cookie nara_sid al empezar cada iteración y, como el
//      login es una vez por usuario virtual, desde la 2.ª iteración las lecturas dan 401 (mismo defecto
//      que se corrigió en k6_estres_soak.js tras el soak del 2026-10-10).
//   2. Mezcla de roles en un solo proceso (el original admite un solo ROL por proceso). Proporción de
//      parametros.md: 6 expertos, 6 clínicos + 1 (en lugar del administrador, que no tiene cuenta de prueba),
//      6 observadores y el resto pacientes. Los usuarios virtuales se intercalan para que cada escalón
//      tenga la misma proporción.
//   3. Si una respuesta trae X-Vercel-Mitigated, k6 se detiene (instrucción de la sesión).
// Las rutas por rol, los escalones, las pausas y los umbrales son los del original.
//
// Variables de entorno (las claves solo en el entorno del proceso, nunca en archivos):
//   BASE_URL, PASS_PRUEBA (cuentas prueba.*), SOAK_EMAIL, SOAK_PASS (cuenta TRL-QA-20261010-clin), VUS_OBJETIVO (65)
//   ESCALONES_CORTOS=1 -> perfil corto para la corrida de recuperación 6.6 (1 min subida, 3 min meseta, 1 min bajada)

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import exec from 'k6/execution';
import { Trend, Rate, Counter } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

const BASE_URL = __ENV.BASE_URL;
const PASS_PRUEBA = __ENV.PASS_PRUEBA;
const SOAK_EMAIL = __ENV.SOAK_EMAIL;
const SOAK_PASS = __ENV.SOAK_PASS;
const OBJETIVO = Number(__ENV.VUS_OBJETIVO || 65);
const CORTO = __ENV.ESCALONES_CORTOS === '1';
const ETIQUETA = __ENV.ETIQUETA || 'carga';

if (!BASE_URL || !PASS_PRUEBA || !SOAK_EMAIL || !SOAK_PASS) {
  throw new Error('Faltan BASE_URL, PASS_PRUEBA, SOAK_EMAIL o SOAK_PASS.');
}

const RUTAS_POR_ROL = {
  experto:    ['/api/auth/me', '/api/app-state', '/api/patients', '/api/people', '/api/territories', '/api/worklists'],
  clinico:    ['/api/auth/me', '/api/app-state', '/api/patients', '/api/people', '/api/territories', '/api/worklists'],
  observador: ['/api/auth/me', '/api/app-state', '/api/people', '/api/territories', '/api/experts'],
  paciente:   ['/api/auth/me', '/api/app-state', '/api/patients/me'],
};

// Proporción objetivo por rol (sobre 65): 6 / 7 / 6 / 46
const META = { experto: 6, clinico: 7, observador: 6, paciente: OBJETIVO - 19 };
function construirSlots(n) {
  const asignados = { experto: 0, clinico: 0, observador: 0, paciente: 0 };
  const slots = [];
  for (let i = 0; i < n; i += 1) {
    let mejor = null; let menor = Infinity;
    for (const rol of Object.keys(META)) {
      if (META[rol] <= 0) continue;
      const r = asignados[rol] / META[rol];
      if (r < menor) { menor = r; mejor = rol; }
    }
    slots.push({ rol: mejor, indice: asignados[mejor] });
    asignados[mejor] += 1;
  }
  return slots;
}
const SLOTS = construirSlots(OBJETIVO);

function cuentaDe(slot) {
  if (slot.rol === 'experto') return { email: 'prueba.experto@nara.com', pass: PASS_PRUEBA };
  if (slot.rol === 'observador') return { email: 'prueba.observador@nara.com', pass: PASS_PRUEBA };
  if (slot.rol === 'clinico') return slot.indice % 2 === 0 ? { email: 'prueba.clinico@nara.com', pass: PASS_PRUEBA } : { email: SOAK_EMAIL, pass: SOAK_PASS };
  return { email: `prueba${(slot.indice % 5) + 1}.paciente@nara.com`, pass: PASS_PRUEBA };
}

const tiempoLogin = new Trend('tiempo_login', true);
const tasaError = new Rate('tasa_error');
const mitigadas = new Counter('respuestas_vercel_mitigated');

const medio = Math.max(1, Math.round(OBJETIVO * 0.4));
export const options = {
  stages: CORTO
    ? [{ duration: '1m', target: OBJETIVO }, { duration: '3m', target: OBJETIVO }, { duration: '1m', target: 0 }]
    : [
        { duration: '2m', target: medio },
        { duration: '5m', target: medio },
        { duration: '2m', target: OBJETIVO },
        { duration: '5m', target: OBJETIVO },
        { duration: '2m', target: 0 },
      ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
    tasa_error: ['rate<0.01'],
  },
  noCookiesReset: true,
};

let sesionIniciada = false;
let slot = null;

function revisarMitigacion(res) {
  if (res.headers['X-Vercel-Mitigated'] || res.headers['x-vercel-mitigated']) {
    mitigadas.add(1);
    console.error(`X-Vercel-Mitigated en ${res.request.url} (HTTP ${res.status}); se detiene k6`);
    exec.test.abort('Vercel mitigó el tráfico (X-Vercel-Mitigated)');
  }
}

function login(cuenta) {
  const res = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({ email: cuenta.email, password: cuenta.pass }),
    { headers: { 'Content-Type': 'application/json' }, tags: { rol: slot.rol, ruta: '/api/auth/login' } });
  revisarMitigacion(res);
  tiempoLogin.add(res.timings.duration, { rol: slot.rol });
  let okJson = false;
  try { okJson = res.json('ok') === true; } catch (e) { okJson = false; }
  const ok = check(res, { 'login 200 y ok:true': (r) => r.status === 200 && okJson }, { rol: slot.rol });
  tasaError.add(!ok, { rol: slot.rol });
  if (!ok) console.warn(`login falló rol=${slot.rol} http=${res.status}`);
  return ok;
}

export default function () {
  if (!slot) slot = SLOTS[(exec.vu.idInTest - 1) % SLOTS.length];
  const rutas = RUTAS_POR_ROL[slot.rol];
  if (!sesionIniciada) {
    group('login', () => { sesionIniciada = login(cuentaDe(slot)); });
    if (!sesionIniciada) { sleep(2); return; }
  }
  group('lecturas', () => {
    for (const ruta of rutas) {
      const res = http.get(`${BASE_URL}${ruta}`, { tags: { rol: slot.rol, ruta } });
      revisarMitigacion(res);
      const ok = check(res, { [`${ruta} 200`]: (r) => r.status === 200 }, { rol: slot.rol });
      tasaError.add(!ok, { rol: slot.rol, ruta });
      if (res.status === 401) sesionIniciada = false; // si la sesión se pierde, vuelve a iniciarla en la siguiente vuelta
      sleep(1);
    }
  });
  sleep(Math.random() * 3 + 1);
}

export function handleSummary(data) {
  const sello = new Date().toISOString().replace(/[:.]/g, '-');
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: false }),
    [`resultado_${ETIQUETA}_${sello}.json`]: JSON.stringify(data, null, 2),
  };
}
