'use strict';
/* ==========================================================================
   CENTAVUS ZAP — bot de WhatsApp (WhatsApp Cloud API oficial da Meta)
   --------------------------------------------------------------------------
   • Zero dependências: só Node 18+ (usa https/fs/crypto nativos)
   • Recebe webhook da Meta, interpreta comandos em português e responde
   • Guarda os lançamentos de cada cliente em data/<numero>.json
   • Comandos: gastei/recebi, resumo do mês, saldo, ajuda, limpar
   Configuração: veja README.md (variáveis VERIFY_TOKEN, META_TOKEN,
   PHONE_NUMBER_ID, PORT e APP_SECRET).
   ========================================================================== */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/* ----------------------------- configuração ----------------------------- */
const PORT = parseInt(process.env.PORT || '3000', 10);
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'centavus-zap';
const META_TOKEN = process.env.META_TOKEN || '';            // token de acesso permanente
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || '';  // ID do número WhatsApp
const APP_SECRET = process.env.APP_SECRET || '';            // opcional: valida a assinatura do webhook
const GRAPH_API = 'https://graph.facebook.com';
const GRAPH_V = 'v21.0';
const DATA_DIR = path.join(__dirname, 'data');
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const AJUDA = [
    '🤖 *Centavus Zap — o que eu faço:*',
    '',
    '💸 Registrar: *"gastei 45,90 no almoço"*',
    '💰 Receita: *"recebi 3000 de salário"*',
    '📊 Resumo: *"resumo"* · *"quanto gastei este mês"* · *"saldo"*',
    '🗓️ Mês anterior: *"resumo do mês passado"*',
    '🧹 Apagar tudo: *"limpar"*',
    'ℹ️ Esta ajuda: *"ajuda"*',
    '',
    'Deixe seu mês organizado só mandando mensagem! 🚀'
].join('\n');

/* ------------------------------- utilidades ------------------------------ */
function norm(s) {
    return String(s == null ? '' : s)
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function isoHoje() { return isoDe(new Date()); }
function isoDe(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function brl(v) {
    return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function diaCurto(iso) { return String(iso || '').split('-').reverse().slice(0, 2).join('/'); }

/* número em pt-BR: aceita "45,90" · "45.90" · "1.200,55" · "3 mil" · "r$ 30" */
function parseValor(txt) {
    const m = String(txt).match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:[.,](\d{1,2}))?(\s*mil)?/i);
    if (!m) return null;
    let valor = parseFloat(m[1].replace(/\./g, ''));        /* 1.200 → 1200 */
    if (isNaN(valor)) return null;
    if (m[2]) valor += parseFloat('0.' + m[2]);             /* ,55 → +0.55 */
    if (m[3]) valor *= 1000;                                /* "3 mil" → 3000 */
    if (valor <= 0 || valor > 100000000) return null;
    return { valor: Math.round(valor * 100) / 100, inicio: m.index, fim: m.index + m[0].length };
}

/* tira o verbo e as preposições sobrando → "no almoço" vira "Almoço" */
function extrairDesc(txtOriginal, trecho) {
    let s = String(trecho || '')
        .replace(/[.!?,;]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^(em|no|na|nos|nas|de|da|do|das|dos|com|por|para|paguei|gastei|recebi|ganhei|custou|saiu|aqui|foi|um|uma)\s+/i, '')
        .replace(/\s+(entrou|caiu|recebi|ganhei|gastei|paguei|saiu|custou|foi)$/i, '')
        .replace(/[.!?,;]+$/g, '')
        .trim();
    if (s.length > 60) s = s.slice(0, 60) + '…';
    if (!s) s = 'Sem descrição';
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ------------------------------- persistência ---------------------------- */
function arquivoDe(phone) {
    return path.join(DATA_DIR, String(phone).replace(/\D/g, '') + '.json');
}
function ler(phone) {
    try {
        const db = JSON.parse(fs.readFileSync(arquivoDe(phone), 'utf8'));
        if (!Array.isArray(db.lancamentos)) db.lancamentos = [];
        return db;
    } catch (e) {
        return { phone: String(phone).replace(/\D/g, ''), criado: isoHoje(), lancamentos: [] };
    }
}
function salvar(phone, db) {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(arquivoDe(phone), JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {
        console.error('[store] falha ao gravar', e.message);
    }
}

/* ------------------------- intérprete de comandos ------------------------ */
function processar(phone, texto) {
    const t = norm(texto).trim();
    if (!t) return null;
    const db = ler(phone);

    /* confirmação pendente de "limpar" (aceita "limpar sim", "sim", "confirmo"...) */
    if (db.confirmaLimpar) {
        const confirmar = /\b(sim|confirmo|pode|isso|apagar|excluir)\b/.test(t) && !/\b(nao|cancelar|perdoa)\b/.test(t);
        const negar = /\b(nao|cancela|perdoa|esquece|depois)\b/.test(t);
        const outroComando = /\d/.test(texto) || /(gastei|gasto|paguei|recebi|ganhei|resumo|saldo|ajuda)/.test(t);
        if (confirmar) {
            db.lancamentos = [];
            db.confirmaLimpar = false;
            salvar(phone, db);
            return '🧹 Tudo apagado! Seu histórico foi zerado. Bora de novo?';
        }
        db.confirmaLimpar = false;
        salvar(phone, db);
        if (negar || !outroComando) return '👌 Cancelei. Nada foi apagado.';
        /* era outro comando (ex.: um gasto no meio da confirmação) → segue o fluxo normal */
    }

    /* saudação */
    if (/^(oi|ola|olae|e ai|eai|bom dia|boa tarde|boa noite|fala|e ai, zap)\b/.test(t)) {
        return 'Oi! 👋 Eu sou o *Centavus Zap*.\n\nMande por exemplo: *"gastei 40 no almoço"* ou *"resumo"*. Digite *ajuda* para ver tudo.';
    }

    /* ajuda */
    if (/(ajuda|help|comando|o que voce faz|como funciona|socorro)/.test(t)) return AJUDA;

    /* limpar (aceita "limpar" só, ou "limpar tudo/dados/histórico") */
    if (/\b(limpar|apagar|zerar|excluir)\b/.test(t) && !/(nao|cancelar|depois|nada disso)/.test(t)) {
        db.confirmaLimpar = true;
        salvar(phone, db);
        return '⚠️ Isso apaga *todos* os seus lançamentos deste número.\nPara confirmar, responda: *limpar sim*';
    }

    /* resumo / saldo (antes dos comandos de gasto, porque contém "gastei") */
    if (/(resumo|quanto gastei|quanto recebi|saldo|como estou|fechamento|extrato|quanto sai)/.test(t)) {
        const passado = /passad|anterior|mes \d|ultimo/.test(t);
        const hoje = new Date();
        const alvo = new Date(hoje.getFullYear(), hoje.getMonth() + (passado ? -1 : 0), 1);
        const mesIso = isoDe(alvo).slice(0, 7);
        const doMes = db.lancamentos.filter(function (l) { return String(l.iso).slice(0, 7) === mesIso; });
        if (!doMes.length) {
            return 'Nada registrado em *' + MESES[alvo.getMonth()] + '* ainda. 🕳️\nMande algo como *"gastei 35 no café"*.';
        }
        let entradas = 0, saidas = 0, gastos = 0, receitas = 0;
        doMes.forEach(function (l) {
            if (l.tipo === 'receita') { entradas += l.valor; receitas++; }
            else { saidas += l.valor; gastos++; }
        });
        const saldo = entradas - saidas;
        return [
            '📊 *Resumo de ' + MESES[alvo.getMonth()] + '/' + alvo.getFullYear() + '*',
            '',
            '💸 Gastos: *' + brl(saidas) + '* (' + gastos + ' lançamentos)',
            '💰 Receitas: *' + brl(entradas) + '* (' + receitas + ')',
            '📈 Saldo do mês: *' + brl(saldo) + '*',
            '',
            saldo >= 0 ? '✅ No azul! Continue assim.' : '⚠️ Você gastou mais do que entrou este mês.'
        ].join('\n');
    }

    /* receita */
    if (/(recebi|ganhei|entrou|caiu|recebo|lucro|freela pago)/.test(t)) {
        const v = parseValor(texto);
        if (!v) return 'Entendi que entrou dinheiro, mas não achei o valor. Ex.: *"recebi 3000 de salário"*';
        const antes = texto.slice(0, v.inicio);
        const depois = texto.slice(v.fim);
        const desc = extrairDesc(texto, depois || antes);
        db.lancamentos.push({ tipo: 'receita', valor: v.valor, desc: desc, iso: isoHoje() });
        db.lancamentos.sort(function (a, b) { return a.iso < b.iso ? -1 : 1; });
        salvar(phone, db);
        const mesIso = isoHoje().slice(0, 7);
        let saidas = 0;
        db.lancamentos.forEach(function (l) { if (l.tipo === 'gasto' && String(l.iso).slice(0, 7) === mesIso) saidas += l.valor; });
        return '💰 *Receita registrada!*\n' + desc + ' — ' + brl(v.valor) + '\n📅 ' + diaCurto(isoHoje()) + '\n\n💸 Saídas de ' + MESES[new Date().getMonth()] + ': ' + brl(saidas);
    }

    /* gasto: com verbo (gastei/paguei/...) OU só o valor ("1.200,55 na farmácia") */
    const temValor = parseValor(texto);
    if (/(gastei|gasto|paguei|pago|desembolsei|torrei|saiu|comprei|investi)/.test(t) || temValor) {
        const v = temValor;
        if (!v) return 'Achei que teve gasto, mas não li o valor. Ex.: *"gastei 45,90 no almoço"*';
        const antes = texto.slice(0, v.inicio);
        const depois = texto.slice(v.fim);
        const desc = extrairDesc(texto, depois || antes);
        db.lancamentos.push({ tipo: 'gasto', valor: v.valor, desc: desc, iso: isoHoje() });
        db.lancamentos.sort(function (a, b) { return a.iso < b.iso ? -1 : 1; });
        salvar(phone, db);
        const mesIso = isoHoje().slice(0, 7);
        let saidas = 0, qtd = 0;
        db.lancamentos.forEach(function (l) { if (l.tipo === 'gasto' && String(l.iso).slice(0, 7) === mesIso) { saidas += l.valor; qtd++; } });
        return '💸 *Gasto registrado!*\n' + desc + ' — ' + brl(v.valor) + '\n📅 ' + diaCurto(isoHoje()) + '\n\n📊 Você já gastou *' + brl(saidas) + '* em ' + MESES[new Date().getMonth()] + ' (' + qtd + ' lançamentos)';
    }

    /* não entendeu */
    return '🤔 Não entendi essa. Tenta assim:\n• *"gastei 45,90 no almoço"*\n• *"recebi 3000 de salário"*\n• *"resumo"*\n\nOu digite *ajuda*.';
}

/* ---------------------------- envio de mensagem -------------------------- */
function enviar(to, body) {
    const destino = String(to).replace(/\D/g, '');
    if (!META_TOKEN || !PHONE_NUMBER_ID) {
        console.log('[sem META_TOKEN/PHONE_NUMBER_ID] resposta para ' + destino + ':\n' + body + '\n');
        return;
    }
    const payload = JSON.stringify({
        messaging_product: 'whatsapp',
        to: destino,
        type: 'text',
        text: { preview_url: false, body: body }
    });
    const req = https.request({
        hostname: 'graph.facebook.com',
        port: 443,
        path: '/' + GRAPH_V + '/' + PHONE_NUMBER_ID + '/messages',
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + META_TOKEN,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 15000
    }, function (res) {
        let out = '';
        res.on('data', function (c) { out += c; });
        res.on('end', function () {
            if (res.statusCode >= 200 && res.statusCode < 300) console.log('[enviado] → ' + destino);
            else console.error('[erro Meta] ' + res.statusCode + ' ' + out.slice(0, 300));
        });
    });
    req.on('error', function (e) { console.error('[erro envio]', e.message); });
    req.on('timeout', function () { req.destroy(); });
    req.write(payload);
    req.end();
}

/* ------------------------- rate limit simples (20/min) -------------------- */
const limites = {};
function podeFalar(phone) {
    const agora = Date.now();
    const l = limites[phone] || (limites[phone] = { inicio: agora, n: 0 });
    if (agora - l.inicio > 60000) { l.inicio = agora; l.n = 0; }
    l.n++;
    return l.n <= 20;
}

/* ------------------------------- webhook --------------------------------- */
function assinaturaValida(req, corpo) {
    if (!APP_SECRET) return true;  /* sem APP_SECRET configurado, não valida */
    const h = req.headers['x-hub-signature-256'] || '';
    if (!h.startsWith('sha256=')) return false;
    const esperado = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(corpo).digest('hex');
    const a = Buffer.from(h), b = Buffer.from(esperado);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function processarPayload(payload) {
    if (!payload || !Array.isArray(payload.entry)) return;
    payload.entry.forEach(function (entry) {
        (entry.changes || []).forEach(function (change) {
            const valor = change.value || {};
            (valor.messages || []).forEach(function (m) {
                try {
                    if (m.type !== 'text') {
                        enviar(m.from, '📩 Só entendo *textos* por enquanto. Me manda um comando! 😉');
                        return;
                    }
                    if (!podeFalar(m.from)) return;   /* estourou o limite: silencia 1 min */
                    const resposta = processar(m.from, (m.text && m.text.body) || '');
                    if (resposta) enviar(m.from, resposta);
                } catch (e) {
                    console.error('[msg] erro:', e && e.stack);
                }
            });
        });
    });
}

const servidor = http.createServer(function (req, res) {
    const url = new URL(req.url, 'http://localhost');

    /* página inicial: só um "estou no ar" */
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<!doctype html><meta charset="utf-8"><title>Centavus Zap</title>' +
            '<body style="font-family:system-ui;background:#0B1110;color:#F5F7F6;display:grid;place-items:center;height:100vh;margin:0">' +
            '<div style="text-align:center"><div style="font-size:44px">🤖</div>' +
            '<h1 style="margin:6px 0">Centavus Zap está no ar</h1>' +
            '<p style="color:#6F807C">Webhook: <code>/webhook</code> · Status: <code>/status</code></p></div></body>');
        return;
    }

    /* status */
    if (req.method === 'GET' && url.pathname === '/status') {
        let clientes = 0, lancamentos = 0;
        try {
            fs.readdirSync(DATA_DIR).forEach(function (f) {
                if (!f.endsWith('.json')) return;
                try {
                    const db = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
                    clientes++; lancamentos += (db.lancamentos || []).length;
                } catch (e) {}
            });
        } catch (e) {}
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, bot: 'Centavus Zap', clientes: clientes, lancamentos: lancamentos, memoria: !!(META_TOKEN && PHONE_NUMBER_ID) }));
        return;
    }

    /* verificação do webhook (Meta pede na hora de salvar) */
    if (req.method === 'GET' && url.pathname === '/webhook') {
        const mode = url.searchParams.get('hub.mode');
        const token = url.searchParams.get('hub.verify_token');
        const challenge = url.searchParams.get('hub.challenge');
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('[webhook] verificado ✔');
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(challenge || '');
        } else {
            res.writeHead(403); res.end('token invalido');
        }
        return;
    }

    /* mensagens */
    if (req.method === 'POST' && url.pathname === '/webhook') {
        let corpo = '';
        req.on('data', function (c) { corpo += c; });
        req.on('end', function () {
            /* responde 200 primeiro (a Meta tem timeout curto) */
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('EVENT_RECEIVED');
            if (!assinaturaValida(req, corpo)) { console.warn('[webhook] assinatura inválida — descartado'); return; }
            try {
                processarPayload(JSON.parse(corpo));
            } catch (e) {
                console.error('[webhook] payload inválido:', e.message);
            }
        });
        return;
    }

    res.writeHead(404); res.end('nao encontrado');
});

servidor.listen(PORT, function () {
    console.log('==============================================');
    console.log(' 🤖 Centavus Zap — bot no ar na porta ' + PORT);
    console.log('    Webhook : http://SEU-SERVIDOR/webhook');
    console.log('    Token   : ' + VERIFY_TOKEN);
    console.log('    Memória : ' + (META_TOKEN && PHONE_NUMBER_ID ? 'conectada à Meta ✓' : 'SEM token (só testes locais)'));
    console.log('==============================================');
});
