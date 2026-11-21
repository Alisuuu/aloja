/* ==========================================================================
   VALIDADOR DE TEMA — Alive
   Uso:  node tools/valida-tema.js <caminho-do-zip>
   Checa: zip íntegro, theme.json válido, assets referenciados existindo,
          campos obrigatórios, tipos, valores fora de faixa e avisos.
   Sai com código 0 (ok) ou 1 (erro) — dá pra usar em CI.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const zipPath = process.argv[2];
if (!zipPath) {
  console.error('Uso: node tools/valida-tema.js <tema.zip>');
  process.exit(2);
}

const problems = [];
const warnings = [];
const ok = (m) => console.log('  ✔ ' + m);
const bad = (m) => problems.push(m);
const warn = (m) => warnings.push(m);

/* ---------------- 1. extrai ---------------- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tema-'));
try {
  execFileSync('unzip', ['-o', '-q', path.resolve(zipPath), '-d', tmp], { stdio: 'pipe' });
  ok('zip extraído');
} catch (e) {
  bad('zip inválido ou corrompido: ' + (e.stderr || e.message).toString().trim());
  finish();
}

const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p); else files.push(path.relative(tmp, p));
  }
})(tmp);
ok(files.length + ' arquivo(s) no pacote: ' + files.join(', '));

/* estrutura achatada? subpastas quebram a leitura do app */
const nested = files.filter(f => f.includes('/') || f.includes('\\'));
if (nested.length) warn('arquivos em subpasta (o app espera tudo na raiz): ' + nested.join(', '));

/* ---------------- 2. theme.json ---------------- */
const jsonRel = files.find(f => path.basename(f) === 'theme.json');
if (!jsonRel) {
  bad('theme.json não encontrado na raiz do pacote');
  finish();
}

let theme;
try {
  theme = JSON.parse(fs.readFileSync(path.join(tmp, jsonRel), 'utf8'));
  ok('theme.json é JSON válido');
} catch (e) {
  bad('theme.json com erro de sintaxe: ' + e.message);
  finish();
}

/* ---------------- 3. campos obrigatórios ---------------- */
const required = ['id', 'name', 'version', 'author', 'widgets', 'standby', 'preview_image'];
required.forEach(k => {
  if (theme[k] === undefined || theme[k] === null || theme[k] === '') bad('campo obrigatório ausente: ' + k);
});
if (problems.length === 0) ok('campos obrigatórios presentes (' + required.join(', ') + ')');

if (theme.id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(theme.id)) {
  warn('id não parece UUID: ' + theme.id);
}
if (!Array.isArray(theme.widgets)) bad('widgets deve ser uma lista');

/* faixas seguras */
const num = (v, min, max, label) => {
  if (typeof v !== 'number' || isNaN(v)) { warn(label + ' não é número: ' + v); return; }
  if (v < min || v > max) warn(label + ' fora de faixa [' + min + ',' + max + ']: ' + v);
};
num(theme.viewport && theme.viewport.scale_x, 0.1, 4, 'viewport.scale_x');
num(theme.viewport && theme.viewport.scale_y, 0.1, 4, 'viewport.scale_y');
(theme.widgets || []).forEach((w, i) => {
  num(w.normalized_x, -1, 1, `widgets[${i}].normalized_x`);
  num(w.normalized_y, -1, 1, `widgets[${i}].normalized_y`);
  num(w.opacity, 0, 1, `widgets[${i}].opacity`);
  num(w.scale, 0.05, 10, `widgets[${i}].scale`);
  if (w.type === 'image' && !w.file) warn(`widget "${w.name}" é tipo image mas não tem file`);
  if (w.type === 'musicqueue' && !w.file) ok(`widget "${w.name}" (musicqueue) sem file — esperado`);
});

/* ---------------- 4. assets referenciados ---------------- */
const refs = [];
const push = (label, val) => { if (val) refs.push({ label, val: String(val).trim() }); };

push('preview_image', theme.preview_image);
push('standby.file', theme.standby && theme.standby.file);
push('background.file', theme.background && theme.background.enabled ? theme.background.file : '');
push('frame.file', theme.frame && theme.frame.enabled ? theme.frame.file : '');
(theme.widgets || []).forEach((w, i) => {
  push(`widgets[${i}] "${w.name}".file`, w.file);
  push(`widgets[${i}] "${w.name}".frame_image_file`, w.frame_image_enabled ? w.frame_image_file : '');
});

const lowerFiles = new Map(files.map(f => [f.toLowerCase(), f]));
let missing = 0;
refs.forEach(r => {
  const hit = lowerFiles.get(r.val.toLowerCase()) || lowerFiles.get(path.basename(r.val).toLowerCase());
  if (hit) ok(`${r.label} → ${hit}`);
  else { missing++; bad(`${r.label} referencia asset inexistente: "${r.val}"`); }
});

/* assets órfãos */
const used = new Set(refs.map(r => r.val.toLowerCase()));
files.forEach(f => {
  if (path.basename(f).toLowerCase() === 'theme.json') return;
  if (!used.has(f.toLowerCase()) && !used.has(path.basename(f).toLowerCase())) {
    warn('asset não referenciado pelo theme.json: ' + f);
  }
});

/* ---------------- 5. mídia ---------------- */
files.forEach(f => {
  const p = path.join(tmp, f);
  const ext = path.extname(f).toLowerCase();
  const size = fs.statSync(p).size;
  if (size === 0) bad('arquivo vazio: ' + f);
  if (size > 45 * 1024 * 1024) warn(`arquivo grande (${(size / 1024 / 1024).toFixed(1)}MB): ${f} — bot do Telegram limita em 50MB`);
  const head = fs.readFileSync(p).subarray(0, 12);
  if (ext === '.png' && !(head[0] === 0x89 && head[1] === 0x50)) bad('PNG corrompido: ' + f);
  if (ext === '.mp4' && head.subarray(4, 8).toString() !== 'ftyp') warn('mp4 com cabeçalho incomum: ' + f);
  if (ext === '.zip') warn('zip dentro de zip: ' + f);
});
if (!problems.some(p => p.includes('corrompido'))) ok('assinaturas de mídia conferidas');

/* ---------------- relatório ---------------- */
finish();

function finish() {
  console.log('');
  if (warnings.length) {
    console.log('⚠ ' + warnings.length + ' aviso(s):');
    warnings.forEach(w => console.log('   - ' + w));
  }
  if (problems.length) {
    console.log('✖ ' + problems.length + ' problema(s):');
    problems.forEach(p => console.log('   - ' + p));
    console.log('\nRESULTADO: REPROVADO');
    process.exit(1);
  }
  console.log('✔ RESULTADO: APROVADO — tema pronto para a loja/storage');
  process.exit(0);
}
