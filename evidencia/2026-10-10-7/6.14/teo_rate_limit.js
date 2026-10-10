// 6.14: 21 POST /api/teo/ask con pregunta vacía como prueba.clinico, directo a la API; luego espera 65 s y 1 llamada más.
// La clave se lee en ejecución del archivo privado; ni la clave ni la cookie se escriben.
const fs = require('fs');
const path = require('path');
const API = 'https://nara-api-wyvw.onrender.com';
const priv = fs.readFileSync('D:/WORK/NARA/entrega/USUARIOS_PRUEBA_PRIVADO.txt', 'utf8');
const PASS = (priv.match(/^Clave \(todas las cuentas\):\s*(\S+)/m) || [])[1];
const EMAIL = 'prueba.clinico@nara.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function health() { return (await (await fetch(API + '/api/health')).json()).commit; }

async function ask(n, cookie) {
  const t0 = Date.now();
  const r = await fetch(API + '/api/teo/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ question: '' }),
  });
  const ms = Date.now() - t0;
  let b = {};
  try { b = await r.json(); } catch {}
  return { n, at: new Date(t0).toISOString(), status: r.status, ms, error: b.error ?? null, ok: b.ok ?? null,
    model: b.model ?? null, provider: b.provider ?? null, retry_after: r.headers.get('retry-after') };
}

(async () => {
  const out = { commit_inicio: await health() };
  const lr = await fetch(API + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }) });
  out.login = { status: lr.status, at: new Date().toISOString() };
  const sc = lr.headers.get('set-cookie') || '';
  const m = sc.match(/nara_sid=([^;]+)/);
  if (!m) { out.error = 'sin cookie nara_sid'; console.log(JSON.stringify(out, null, 2)); return; }
  const cookie = 'nara_sid=' + m[1];
  out.rafaga = [];
  const t0 = Date.now();
  for (let i = 1; i <= 21; i++) out.rafaga.push(await ask(i, cookie));
  out.duracion_rafaga_ms = Date.now() - t0;
  out.conteo = out.rafaga.reduce((a, x) => ((a[x.status] = (a[x.status] || 0) + 1), a), {});
  const ultimoOk = Date.parse(out.rafaga[19].at);
  // Espera hasta 65 s después de la 20.ª petición contada (la ventana es deslizante sobre las marcas de tiempo del servidor).
  const espera = Math.max(0, ultimoOk + 65_000 - Date.now());
  out.espera_ms = espera;
  await sleep(espera);
  out.tras_espera = await ask(22, cookie);
  out.commit_fin = await health();
  fs.writeFileSync(path.join(__dirname, 'teo_rate_limit_resultado.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ...out, rafaga: out.rafaga.map((x) => `${x.n} ${x.at} ${x.status} ${x.ms}ms ${x.error}`) }, null, 2));
})();
