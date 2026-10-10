// Genera el plan de ZAP Automation Framework para el rol administrador. Solo escaneo PASIVO (sin activeScan).
// Copia de pruebas/evidencia/2026-10-10-8/5.12-6.9_zap/generar_plan.js con las pantallas del administrador
// (tomadas de las rutas que recorre la suite e2e: 4.7, T-05, A-05 y H-014).
// La cookie de sesión NO va en el plan: se inyecta por línea de comandos (-config replacer...) desde _herramientas/zap_admin.js.
// Uso: node generar_plan.js <carpeta_salida>
const fs = require('fs');
const path = require('path');
const [salida] = process.argv.slice(2);
const BASE = 'https://www.proyectonara.com';
const paginas = ['/inicio', '/territorios', '/admin/territorio', '/usuarios', '/personas', '/admin/persona', '/informes', '/informe', '/informe?t=admin-weekly', '/rutas', '/equipos', '/activos', '/perfil'];
const api = ['/api/auth/me', '/api/app-state', '/api/patients', '/api/patients/me', '/api/people', '/api/territories', '/api/experts', '/api/worklists', '/api/flags', '/api/assets', '/api/health', '/api/health/db', '/api/accounts'];
const urls = ['/', '/ingreso', ...paginas, ...api];
const dir = salida.split('\\').join('/');
const y = [];
y.push('env:');
y.push('  contexts:');
y.push('    - name: nara-admin');
y.push(`      urls: ["${BASE}"]`);
y.push(`      includePaths: ["${BASE}.*"]`);
y.push('      excludePaths:');
for (const e of ['.*logout.*', '.*salir.*', '.*cerrar-sesion.*', '.*/api/teo.*', '.*/api/auth/login.*']) y.push(`        - "${e}"`);
y.push('  parameters:');
y.push('    failOnError: true');
y.push('    progressToStdout: true');
y.push('jobs:');
y.push('  - type: passiveScan-config');
y.push('    parameters: { maxAlertsPerRule: 10, scanOnlyInScope: true }');
y.push('  - type: requestor');
y.push('    requests:');
for (const u of urls) { y.push(`      - url: "${BASE}${u}"`); y.push('        method: GET'); if (u === '/api/auth/me' || u === '/api/health/db' || u === paginas[0]) y.push('        responseCode: 200'); }
y.push('  - type: spider');
y.push('    parameters: { context: nara-admin, maxDuration: 3, maxChildren: 20, processForm: false, postForm: false, threadCount: 2 }');
y.push('  - type: passiveScan-wait');
y.push('    parameters: { maxDuration: 5 }');
y.push('  - type: report');
y.push(`    parameters: { template: traditional-html, reportDir: "${dir}", reportFile: "zap-baseline-admin.html", reportTitle: "ZAP baseline pasivo autenticado - NARA - rol admin" }`);
y.push('  - type: report');
y.push(`    parameters: { template: traditional-json, reportDir: "${dir}", reportFile: "zap-baseline-admin.json" }`);
fs.writeFileSync(path.join(salida, 'plan-admin.yaml'), y.join('\n') + '\n');
console.log('plan escrito', path.join(salida, 'plan-admin.yaml'));
