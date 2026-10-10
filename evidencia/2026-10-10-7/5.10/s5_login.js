// 5.10 S-5: intentos de login contra la API directa. Uso: node s5_login.js bloqueo|fin
// La clave se lee en tiempo de ejecución de soak_prod.local; nunca se escribe ni se imprime.
const fs = require('fs');
const path = require('path');
const API = 'https://nara-api-wyvw.onrender.com';
const fase = process.argv[2];
const local = fs.readFileSync('D:/WORK/NARA/herramientas/qa/laboratorio/soak_prod.local', 'utf8');
const val = (k) => (local.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1].trim();
const EMAIL = val('USER_EMAIL');
const PASS = val('USER_PASS');
const NOEXISTE = 'trl-qa-20261010-noexiste-s5@nara.com';

async function health() {
  const r = await fetch(API + '/api/health');
  return (await r.json()).commit;
}

async function intento(n, email, password, etiqueta) {
  const t0 = Date.now();
  const r = await fetch(API + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const ms = Date.now() - t0;
  let body = {};
  try { body = await r.json(); } catch {}
  const setCookie = r.headers.get('set-cookie') ? 'presente' : 'ausente';
  return {
    n, etiqueta, correo: email === EMAIL ? 'cuenta soak TRL-QA-20261010-clin' : email,
    at: new Date(t0).toISOString(), status: r.status, ms,
    error: body.error ?? null, ok: body.ok ?? null,
    token_en_cuerpo: body.token ? 'sí (no guardado)' : 'no', set_cookie: setCookie,
    retry_after: r.headers.get('retry-after'),
  };
}

(async () => {
  const out = { fase, commit_inicio: await health(), intentos: [] };
  if (fase === 'bloqueo') {
    for (let i = 1; i <= 5; i++) out.intentos.push(await intento(i, EMAIL, 'TRL-QA-incorrecta-' + i, 'clave incorrecta'));
    out.intentos.push(await intento(6, EMAIL, PASS, 'clave correcta'));
    out.intentos.push(await intento(1, NOEXISTE, 'TRL-QA-incorrecta-1', 'correo inexistente con prefijo'));
  } else if (fase === 'fin') {
    out.intentos.push(await intento(7, EMAIL, PASS, 'clave correcta tras el bloqueo'));
  } else if (fase === 'sondeo') {
    out.intentos.push(await intento(0, EMAIL, PASS, 'sondeo clave correcta (aún bloqueada?)'));
  }
  out.commit_fin = await health();
  const archivo = path.join(__dirname, `s5_${fase}_${Date.now()}.json`);
  fs.writeFileSync(archivo, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})();
