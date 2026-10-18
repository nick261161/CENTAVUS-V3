'use strict';
/* ==========================================================================
   CENTAVUS SERVER — ponto de entrada (Node 18+, ZERO dependências)
   ---------------------------------------------------------------------------
   Um único serviço no Render que faz TUDO:
     1. Hospeda o site Centavus (estático a partir da raiz do repositório)
     2. API do produto: contas, sessão, dados financeiros, vínculo do Zap
     3. Webhook do WhatsApp (bot Centavus Zap)
     4. /status — verificação de saúde (usado pelo botão do Render)

   Rotas:
     GET  /api/...                → api.js   (formatos que o site já usa)
     *    /webhook                → bot.js   (Cloud API da Meta)
     GET  /status                 → stats    (JSON)
     *    estático                → index.html e /js /css /img da raiz

   Configuração: README.md · Start: node server.js
   ========================================================================== */

const http = require('http');
const fs = require('fs');
const path = require('path');

const { handleApi } = require('./api');
const bot = require('./bot');
const store = require('./store');

const PORTA = Number(process.env.PORT) || 3000;
const MAX_JSON = 7 * 1024 * 1024;            /* snapshot do site (6 MB) + margem */
const MAX_WEBHOOK = 1024 * 1024;

/* --------------------------- servidor estático -------------------------- */
/* Se o site foi deployado junto (raiz do repo), serve ele; senão serve os
   arquivos desta pasta (deploy só do bot — API + webhook continuam no ar). */
const RAIZ_REPO = path.join(__dirname, '..');
const RAIZ = fs.existsSync(path.join(RAIZ_REPO, 'index.html')) ? RAIZ_REPO : __dirname;

const TIPOS = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
    '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
    '.map': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json'
};

function servirEstatico(rota, res) {
    let rel = decodeURIComponent(rota.split('?')[0]);
    if (rel === '/' || rel === '') rel = '/index.html';
    const alvo = path.normalize(path.join(RAIZ, rel));
    if (alvo !== RAIZ && !alvo.startsWith(RAIZ + path.sep)) {
        res.writeHead(403); res.end('negado'); return;
    }
    fs.stat(alvo, function (err, st) {
        let arquivo = alvo;
        if (!err && st.isDirectory()) arquivo = path.join(alvo, 'index.html');
        fs.stat(arquivo, function (e2, s2) {
            if (e2 || !s2.isFile()) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('404 — não encontrado: ' + rel);
                return;
            }
            const tipo = TIPOS[path.extname(arquivo).toLowerCase()] || 'application/octet-stream';
            fs.readFile(arquivo, function (e3, buf) {
                if (e3) { res.writeHead(500); res.end('erro'); return; }
                res.writeHead(200, {
                    'Content-Type': tipo,
                    'Content-Length': buf.length,
                    /* o site detecta /api/health sem cache — e versionamento aqui é por push */
                    'Cache-Control': 'no-cache'
                });
                res.end(buf);
            });
        });
    });
}

/* ------------------------------- corpo ---------------------------------- */
function lerCorpo(req, max, cb) {
    const partes = [];
    let total = 0, cortado = false;
    req.on('data', function (c) {
        total += c.length;
        if (total > max) { cortado = true; req.destroy(); return; }
        partes.push(c);
    });
    req.on('end', function () { cb(cortado ? null : Buffer.concat(partes).toString('utf8')); });
    req.on('error', function () { cb(null); });
}

function responderJson(res, status, obj) {
    const b = Buffer.from(JSON.stringify(obj));
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': b.length, 'Cache-Control': 'no-store' });
    res.end(b);
}

/* ------------------------------ /status --------------------------------- */
function servirStatus(res) {
    const s = bot.stats();
    const mem = process.memoryUsage();
    responderJson(res, 200, {
        ok: true,
        servico: 'centavus',
        site: fs.existsSync(path.join(RAIZ, 'index.html')),
        raiz: path.basename(RAIZ),
        memoria: s.memoria,                      /* Meta conectada ✓ */
        bot: s.memoria ? 'conectada à Meta ✓' : 'modo teste (sem META_TOKEN)',
        contas: s.contas,
        vinculados: s.vinculados,
        demoNumeros: s.demoNumeros,
        demoLancamentos: s.demoLancamentos,
        rssMb: Math.round(mem.rss / 1048576),
        uptimeSeg: Math.round(process.uptime())
    });
}

/* ------------------------------ roteador -------------------------------- */
const servidor = http.createServer(function (req, res) {
    const u = new URL(req.url, 'http://servidor.local');
    const rota = u.pathname || '/';
    const metodo = (req.method || 'GET').toUpperCase();
    req.ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || '?';

    /* 1) API do site (JSON) */
    if (rota.indexOf('/api/') === 0) {
        if (metodo === 'GET' || metodo === 'HEAD') {
            let tratou = false;
            try { tratou = handleApi(rota, metodo, null, req, res); } catch (e) { console.error('[api]', e.stack); }
            if (!tratou && !res.headersSent) responderJson(res, 404, { error: 'Rota não encontrada.' });
            return;
        }
        lerCorpo(req, MAX_JSON, function (bruto) {
            if (bruto === null) return responderJson(res, 413, { error: 'Corpo grande demais.' });
            let corpo = {};
            if (bruto.trim()) {
                try { corpo = JSON.parse(bruto); }
                catch (e) { return responderJson(res, 400, { error: 'JSON inválido.' }); }
            }
            let tratou = false;
            try { tratou = handleApi(rota, metodo, corpo, req, res); }
            catch (e) { console.error('[api]', e.stack); }
            if (!res.headersSent && !tratou) responderJson(res, 404, { error: 'Rota não encontrada.' });
        });
        return;
    }

    /* 2) Webhook do WhatsApp (precisa do corpo cru p/ assinatura HMAC) */
    if (rota === '/webhook') {
        if (metodo === 'GET') { bot.verificarWebhook(u, res); return; }
        if (metodo === 'POST') {
            lerCorpo(req, MAX_WEBHOOK, function (bruto) {
                if (bruto === null) { res.writeHead(413); res.end('grande demais'); return; }
                try { bot.receberWebhook(req, res, bruto); }
                catch (e) { console.error('[webhook]', e.stack); if (!res.headersSent) { res.writeHead(500); res.end(); } }
            });
            return;
        }
        res.writeHead(405); res.end(); return;
    }

    /* 3) Status */
    if (rota === '/status' || rota === '/api/status') { servirStatus(res); return; }

    /* 4) Site */
    if (metodo === 'GET' || metodo === 'HEAD') { servirEstatico(rota, res); return; }
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('método não permitido');
});

/* ------------------------------ boot ------------------------------------ */
store.limparCodigos();
servidor.listen(PORTA, function () {
    const info = bot.stats();
    console.log('==============================================');
    console.log('  CENTAVUS SERVER  ·  porta ' + PORTA);
    console.log('  site ..... ' + (fs.existsSync(path.join(RAIZ, 'index.html')) ? 'raiz do repo (' + path.basename(RAIZ) + ')' : 'só API + bot (sem index.html na raiz)'));
    console.log('  contas ... ' + info.contas + '  ·  zap vinculado: ' + info.vinculados);
    console.log('  memória .. ' + (info.memoria ? 'conectada à Meta ✓' : 'modo teste (sem META_TOKEN)'));
    console.log('==============================================');
});

/* saída limpa (Render envia SIGTERM) */
['SIGTERM', 'SIGINT'].forEach(function (s) {
    process.on(s, function () { try { store.salvar(); } catch (e) {} process.exit(0); });
});
