// Genera el plan de ZAP Automation Framework para un rol. Solo escaneo PASIVO (sin activeScan).
// La cookie de sesión NO va en el plan: se inyecta por línea de comandos (-config replacer...) desde _herramientas/zap_rol.js.
// Uso: node generar_plan.js <rol> <carpeta_salida>
const fs = require('fs');
const [rol, salida] = process.argv.slice(2);
const BASE = 'https://www.proyectonara.com';
const paginasPorRol = {
  experto: ['/inicio', '/experto', '/experto/nueva', '/rutas', '/personas', '/territorios', '/equipos', '/perfil', '/activos', '/informes'],
  clinico: ['/inicio', '/clinico', '/clinico/aprobaciones', '/clinico/crisis', '/clinico/crisis/historial', '/clinico/pacientes', '/personas', '/perfil', '/informes'],
  observador: ['/inicio', '/observador', '/informes', '/informe', '/territorios', '/personas', '/perfil'],
  paciente: ['/paciente', '/paciente/animo', '/paciente/historial', '/paciente/pendiente', '/paciente/plan', '/paciente/resumen', '/paciente/ruta', '/paciente/tecnicas', '/paciente/clinico', '/paciente/revisita'],
};
const api = ['/api/auth/me', '/api/app-state', '/api/patients', '/api/patients/me', '/api/people', '/api/territories', '/api/experts', '/api/worklists', '/api/flags', '/api/assets', '/api/health', '/api/health/db', '/api/accounts'];
const urls = ['/', '/ingreso', ...paginasPorRol[rol], ...api];
const dir = salida.split('\\').join('/');
const y = [];
y.push('env:');
y.push('  contexts:');
y.push(`    - name: nara-${rol}`);
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
// La cookie se inyecta con -config replacer.full_list(0).* desde zap_rol.js (la sustitución ${VAR} no funcionó en el job replacer).
y.push('  - type: requestor');
y.push('    requests:');
for (const u of urls) { y.push(`      - url: "${BASE}${u}"`); y.push('        method: GET'); if (u === '/api/auth/me' || u === paginasPorRol[rol][0]) y.push('        responseCode: 200'); }
y.push('  - type: spider');
y.push(`    parameters: { context: nara-${rol}, maxDuration: 3, maxChildren: 20, processForm: false, postForm: false, threadCount: 2 }`);
y.push('  - type: passiveScan-wait');
y.push('    parameters: { maxDuration: 5 }');
y.push('  - type: report');
y.push(`    parameters: { template: traditional-html, reportDir: "${dir}", reportFile: "zap-baseline-${rol}.html", reportTitle: "ZAP baseline pasivo autenticado - NARA - rol ${rol}" }`);
y.push('  - type: report');
y.push(`    parameters: { template: traditional-json, reportDir: "${dir}", reportFile: "zap-baseline-${rol}.json" }`);
fs.writeFileSync(`plan-${rol}.yaml`, y.join('\n') + '\n');
console.log('plan escrito', rol);
