'use strict';
/* ==========================================================================
   CENTAVUS ZAP — bot de WhatsApp (WhatsApp Cloud API oficial da Meta)
   --------------------------------------------------------------------------
   Dois modos de dados, decididos pelo vínculo do telefone:
     • VINCULADO  → lê e grava no ESTADO DA CONTA do site (data/centavus_db.json)
                    "gastei 45 no almoço" aparece no painel Centavus na hora
     • DEMO       → arquivo próprio data/<numero>.json (sem vínculo, para testar)
   Comandos: gastei/recebi (aceita "1.200,55", "2 mil", "R$ 30"), resumo,
   saldo, limpar (com confirmação), vincular <código>, desvincular, ajuda.
   Zero dependências — só Node 18+. Configuração: README.md.
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const store = require('./store');

const DATA_DIR = path.join(__dirname, 'data');
const META_TOKEN = process.env.META_TOKEN || '';
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || '';
const APP_SECRET = process.env.APP_SECRET || '';
const GRAPH_V = 'v21.0';
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_ABR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const AJUDA = [
    '🤖 *Centavus Zap — o que eu faço:*',
    '',
    '💸 Registrar: *"gastei 45,90 no almoço"*',
    '💰 Receita: *"recebi 3000 de salário"*',
    '📊 Resumo: *"resumo"* · *"quanto gastei este mês"* · *"saldo"*',
    '🗓️ Mês anterior: *"resumo do mês passado"*',
    '📱 Vincular: mande *"vincular CVZ-XXXXXX"* (o código aparece no site)',
    '🧹 Apagar tudo: *"limpar"*',
    'ℹ️ Esta ajuda: *"ajuda"*',
    '',
    'Deixe seu mês organizado só mandando mensagem! 🚀'
].join('\n');

/* =============================== utilidades ============================ */
function norm(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function isoHoje() { return isoDe(new Date()); }
function isoDe(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function brl(v) {
    return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function diaCurto(iso) { return String(iso || '').split('-').reverse().slice(0, 2).join('/'); }
function pad2(n) { return String(n).padStart(2, '0'); }

/* número em pt-BR: aceita "45,90" · "45.90" · "1.200,55" · "3 mil" · "r$ 30" */
function parseValor(txt) {
    const m = String(txt).match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:[.,](\d{1,2}))?(\s*mil)?/i);
    if (!m) return null;
    let valor = parseFloat(m[1].replace(/\./g, ''));
    if (isNaN(valor)) return null;
    if (m[2]) valor += parseFloat('0.' + m[2]);
    if (m[3]) valor *= 1000;
    if (valor <= 0 || valor > 100000000) return null;
    return { valor: Math.round(valor * 100) / 100, inicio: m.index, fim: m.index + m[0].length };
}

/* "no almoço" vira "Almoço" — e tira verbos sobrando no fim ("freela entrou") */
function extrairDesc(trecho) {
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

/* ================= contexto de dados (conta × demo) ==================== */
function arquivoDemo(phone) { return path.join(DATA_DIR, String(phone).replace(/\D/g, '') + '.json'); }

function lerDemo(phone) {
    try {
        const d = JSON.parse(fs.readFileSync(arquivoDemo(phone), 'utf8'));
        if (!Array.isArray(d.lancamentos)) d.lancamentos = [];
        return d;
    } catch (e) {
        return { phone: String(phone).replace(/\D/g, ''), criado: isoHoje(), lancamentos: [] };
    }
}
function gravarDemo(phone, d) {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(arquivoDemo(phone), JSON.stringify(d, null, 2), 'utf8');
    } catch (e) { console.error('[store-demo] falha:', e.message); }
}

function ctxDe(phone) {
    const uid = store.uidDoZap(phone);
    if (uid) {
        const conta = store.contaById(uid);
        if (conta) {
            const estado = store.lerEstado(uid) || {};
            if (!Array.isArray(estado.transactions)) estado.transactions = [];
            return {
                tipo: 'conta', uid: uid, nome: conta.name || conta.email, estado: estado,
                salvar: function () { store.gravarEstado(uid, estado); }
            };
        }
        store.desvincularZap(phone);          /* conta não existe mais → solta */
    }
    const demo = lerDemo(phone);
    return {
        tipo: 'demo', lancamentos: demo.lancamentos,
        salvar: function () { gravarDemo(phone, demo); }
    };
}

/* transação no MESMO formato que o site cria (o painel renderiza igualzinho) */
function txSite(tipo, valor, desc, iso) {
    const d = new Date(iso + 'T12:00:00');
    const receita = tipo === 'receita';
    return {
        id: Date.now(),
        desc: desc,
        cat: receita ? 'Receita' : 'Outros',
        pay: 'debito',
        parcelas: 1,
        total: Math.abs(valor),
        cardId: null,
        cardNome: null,
        month: MESES_ABR[d.getMonth()],
        iso: iso,
        date: pad2(d.getDate()) + ' ' + MESES_ABR[d.getMonth()],
        amount: receita ? Math.abs(valor) : -Math.abs(valor),
        icon: receita ? 'fa-arrow-down' : 'fa-basket-shopping',
        color: receita ? '#40C8A0' : '#8070F0',
        accId: null
    };
}

function registrar(ctx, tipo, valor, desc, iso) {
    if (ctx.tipo === 'conta') {
        const tx = txSite(tipo, valor, desc, iso);
        while (ctx.estado.transactions.some(function (t) { return t && t.id === tx.id; })) tx.id++;
        ctx.estado.transactions.unshift(tx);
    } else {
        ctx.lancamentos.push({ tipo: tipo, valor: valor, desc: desc, iso: iso });
    }
    ctx.salvar();
}

/* itens unificados: {iso, valor} com sinal (+receita, −gasto) */
function itensDo(ctx) {
    if (ctx.tipo === 'conta') {
        return ctx.estado.transactions
            .filter(function (t) { return t && t.iso && Number(t.amount); })
            .map(function (t) { return { iso: String(t.iso).slice(0, 10), valor: Number(t.amount) }; });
    }
    return ctx.lancamentos.map(function (l) {
        return { iso: l.iso, valor: l.tipo === 'receita' ? Math.abs(l.valor) : -Math.abs(l.valor) };
    });
}

function totaisDoMes(ctx, mesIso) {
    const doMes = itensDo(ctx).filter(function (i) { return String(i.iso).slice(0, 7) === mesIso; });
    let entradas = 0, saidas = 0, nGastos = 0, nReceitas = 0;
    doMes.forEach(function (i) {
        if (i.valor > 0) { entradas += i.valor; nReceitas++; }
        else { saidas += Math.abs(i.valor); nGastos++; }
    });
    return { entradas: entradas, saidas: saidas, nGastos: nGastos, nReceitas: nReceitas, saldo: entradas - saidas };
}

/* ====================== levar dados de demo p/ conta ==================== */
/* ao vincular: o que o cliente já tinha registrado em modo demonstração
   vira lançamento de verdade na conta dele. */
function migrarDemoParaConta(demo, ctxConta) {
    if (!demo || !demo.lancamentos || !demo.lancamentos.length) return 0;
    const novos = demo.lancamentos.map(function (l) { return l; });
    let n = 0;
    novos.forEach(function (l, i) {
        const tx = txSite(l.tipo, l.valor, l.desc || 'Sem descrição', l.iso || isoHoje());
        tx.id = Date.now() + i;
        while (ctxConta.estado.transactions.some(function (t) { return t && t.id === tx.id; })) tx.id++;
        ctxConta.estado.transactions.push(tx);
        n++;
    });
    /* padrão do site: mais recentes primeiro */
    ctxConta.estado.transactions.sort(function (a, b) {
        if (a.iso === b.iso) return (b.id || 0) - (a.id || 0);
        return a.iso < b.iso ? 1 : -1;
    });
    ctxConta.salvar();
    /* guarda o arquivo de demonstração como backup e zera */
    try {
        fs.renameSync(arquivoDemo(demo.phone), arquivoDemo(demo.phone) + '.bak');
    } catch (e) {}
    return n;
}

/* ========================== intérprete ================================== */

/* pendência de "limpar" (1 mensagem): phone → true — memória, sem sujar dados */
const _pendenteLimpar = {};

function processar(phone, texto) {
    const t = norm(texto).trim();
    if (!t) return null;
    const ctx = ctxDe(phone);

    /* ---- vínculo com a conta do site (antes de tudo) ---- */
    const mCod = String(texto || '').toUpperCase().match(/CVZ-[A-Z0-9]{6}/);
    if (/(vincular|vinculo|ligar|conectar)/.test(t) && !/desvincular/.test(t)) {
        if (ctx.tipo === 'conta') {
            return '📱 Este número já está vinculado à conta *' + ctx.nome + '*.\nPara trocar, mande *desvincular*.';
        }
        if (!mCod) {
            return '🔑 Me mande seu código de vinculação:\n*vincular CVZ-XXXXXX*\n\nGere no site: Centavus Zap → **Vincular meu número** (o código vale 20 minutos).';
        }
        const uid = store.usarCodigoZap(mCod[0]);
        if (!uid) return '❌ Código inválido ou expirado. Gere um novo no site (Centavus Zap → Vincular meu número).';
        store.vincularZap(phone, uid);
        const demoAgora = lerDemo(phone);
        const contaCtx = ctxDe(phone);
        const migrados = migrarDemoParaConta(demoAgora, contaCtx);
        const conta = store.contaById(uid);
        return '📱 *Número vinculado à conta de ' + ((conta && (conta.name || conta.email)) || 'você') + '!*\n' +
            (migrados ? '📦 Levei ' + migrados + (migrados === 1 ? ' lançamento' : ' lançamentos') + ' de demonstração pra sua conta.\n' : '') +
            'Agora tudo o que você mandar aqui entra no seu painel Centavus. Bora organizar? 🚀';
    }
    if (/desvincular/.test(t)) {
        if (store.desvincularZap(phone)) return '🔓 Número desvinculado. Seus dados continuam na sua conta; este número volta ao modo demonstração.';
        return 'ℹ️ Este número não está vinculado a nenhuma conta.';
    }

    /* ---- confirmação pendente de "limpar" ---- */
    if (_pendenteLimpar[phone]) {
        const confirmar = /\b(sim|confirmo|pode|isso|apagar|excluir)\b/.test(t) && !/\b(nao|cancelar|perdoa)\b/.test(t);
        const negar = /\b(nao|cancela|perdoa|esquece|depois)\b/.test(t);
        const outroComando = /\d/.test(texto) || /(gastei|gasto|paguei|recebi|ganhei|resumo|saldo|ajuda)/.test(t);
        delete _pendenteLimpar[phone];
        if (confirmar) {
            if (ctx.tipo === 'conta') { ctx.estado.transactions = []; ctx.salvar(); }
            else { ctx.lancamentos.length = 0; ctx.salvar(); }
            return '🧹 Tudo apagado! Seu histórico foi zerado. Bora de novo?';
        }
        if (negar || !outroComando) return '👌 Cancelei. Nada foi apagado.';
        /* era outro comando (ex.: um gasto no meio) → segue o fluxo normal */
    }

    /* ---- saudação ---- */
    if (/^(oi|ola|olae|e ai|eai|bom dia|boa tarde|boa noite|fala|e ai, zap)\b/.test(t)) {
        const vinc = ctx.tipo === 'conta' ? ' Estou ligado à sua conta — seus lançamentos entram direto no painel. 😉' : '';
        return 'Oi! 👋 Eu sou o *Centavus Zap*.' + vinc +
            '\n\nMande por exemplo: *"gastei 40 no almoço"* ou *"resumo"*. Digite *ajuda* para ver tudo.';
    }

    /* ---- ajuda ---- */
    if (/(ajuda|help|comando|o que voce faz|como funciona|socorro)/.test(t)) return AJUDA;

    /* ---- limpar ---- */
    if (/\b(limpar|apagar|zerar|excluir)\b/.test(t) && !/\b(nao|cancelar|depois)\b/.test(t)) {
        if (/\b(sim|confirmo|pode|isso)\b/.test(t)) {
            /* confirmação na mesma frase ("limpar sim") → executa direto */
            if (ctx.tipo === 'conta') { ctx.estado.transactions = []; ctx.salvar(); }
            else { ctx.lancamentos.length = 0; ctx.salvar(); }
            delete _pendenteLimpar[phone];
            return '🧹 Tudo apagado! Seu histórico foi zerado. Bora de novo?';
        }
        _pendenteLimpar[phone] = true;
        return '⚠️ Isso apaga *todos* os seus lançamentos ' + (ctx.tipo === 'conta' ? 'da conta (site e WhatsApp)' : 'deste número') + '.\nPara confirmar, responda: *limpar sim*';
    }

    /* ---- resumo / saldo ---- */
    if (/(resumo|quanto gastei|quanto recebi|saldo|como estou|fechamento|extrato|quanto sai)/.test(t)) {
        const passado = /passad|anterior|mes \d|ultimo/.test(t);
        const hoje = new Date();
        const alvo = new Date(hoje.getFullYear(), hoje.getMonth() + (passado ? -1 : 0), 1);
        const tot = totaisDoMes(ctx, isoDe(alvo).slice(0, 7));
        if (!tot.nGastos && !tot.nReceitas) {
            return 'Nada registrado em *' + MESES[alvo.getMonth()] + '* ainda. 🕳️\nMande algo como *"gastei 35 no café"*.';
        }
        return [
            '📊 *Resumo de ' + MESES[alvo.getMonth()] + '/' + alvo.getFullYear() + '*',
            '',
            '💸 Gastos: *' + brl(tot.saidas) + '* (' + tot.nGastos + ' lançamentos)',
            '💰 Receitas: *' + brl(tot.entradas) + '* (' + tot.nReceitas + ')',
            '📈 Saldo do mês: *' + brl(tot.saldo) + '*',
            '',
            tot.saldo >= 0 ? '✅ No azul! Continue assim.' : '⚠️ Você gastou mais do que entrou este mês.'
        ].join('\n');
    }

    /* ---- receita ---- */
    if (/(recebi|ganhei|entrou|caiu|recebo|lucro|freela pago)/.test(t)) {
        const v = parseValor(texto);
        if (!v) return 'Entendi que entrou dinheiro, mas não achei o valor. Ex.: *"recebi 3000 de salário"*';
        const depois = texto.slice(v.fim);
        const antes = texto.slice(0, v.inicio);
        const desc = extrairDesc(depois || antes);
        registrar(ctx, 'receita', v.valor, desc, isoHoje());
        const tot = totaisDoMes(ctx, isoHoje().slice(0, 7));
        return '💰 *Receita registrada!*\n' + desc + ' — ' + brl(v.valor) + '\n📅 ' + diaCurto(isoHoje()) +
            '\n\n💸 Saídas de ' + MESES[new Date().getMonth()] + ': ' + brl(tot.saidas) +
            (ctx.tipo === 'conta' ? '\n\n✅ Já aparece no seu painel Centavus.' : '');
    }

    /* ---- gasto: com verbo OU só o valor ("1.200,55 na farmácia") ---- */
    const temValor = parseValor(texto);
    if (/(gastei|gasto|paguei|pago|desembolsei|torrei|saiu|comprei|investi)/.test(t) || temValor) {
        if (!temValor) return 'Achei que teve gasto, mas não li o valor. Ex.: *"gastei 45,90 no almoço"*';
        const depois = texto.slice(temValor.fim);
        const antes = texto.slice(0, temValor.inicio);
        const desc = extrairDesc(depois || antes);
        registrar(ctx, 'gasto', temValor.valor, desc, isoHoje());
        const tot = totaisDoMes(ctx, isoHoje().slice(0, 7));
        return '💸 *Gasto registrado!*\n' + desc + ' — ' + brl(temValor.valor) + '\n📅 ' + diaCurto(isoHoje()) +
            '\n\n📊 Você já gastou *' + brl(tot.saidas) + '* em ' + MESES[new Date().getMonth()] +
            ' (' + tot.nGastos + ' lançamentos)' +
            (ctx.tipo === 'conta' ? '\n\n✅ Já aparece no seu painel Centavus.' : '');
    }

    return '🤔 Não entendi essa. Tenta assim:\n• *"gastei 45,90 no almoço"*\n• *"recebi 3000 de salário"*\n• *"resumo"*\n\nOu digite *ajuda*.';
}

/* ============================ envio ===================================== */
function enviar(to, body) {
    const destino = String(to).replace(/\D/g, '');
    if (!META_TOKEN || !PHONE_NUMBER_ID) {
        console.log('[sem META_TOKEN/PHONE_NUMBER_ID] resposta para ' + destino + ':\n' + body + '\n');
        return;
    }
    const payload = JSON.stringify({
        messaging_product: 'whatsapp', to: destino, type: 'text',
        text: { preview_url: false, body: body }
    });
    const req = https.request({
        hostname: 'graph.facebook.com', port: 443,
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

/* ====================== rate limit (20/min por nº) ====================== */
const limites = {};
function podeFalar(phone) {
    const agora = Date.now();
    const l = limites[phone] || (limites[phone] = { ini: agora, n: 0 });
    if (agora - l.ini > 60000) { l.ini = agora; l.n = 0; }
    l.n++;
    return l.n <= 20;
}

/* ============================= webhook ================================== */
function assinaturaValida(req, corpo) {
    if (!APP_SECRET) return true;
    const h = req.headers['x-hub-signature-256'] || '';
    if (!h.startsWith('sha256=')) return false;
    const esperado = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(corpo).digest('hex');
    const a = Buffer.from(h), b = Buffer.from(esperado);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* GET /webhook — verificação que a Meta faz ao salvar */
function verificarWebhook(url, res) {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === (process.env.VERIFY_TOKEN || 'centavus-zap')) {
        console.log('[webhook] verificado ✔');
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(challenge || '');
    } else {
        res.writeHead(403); res.end('token invalido');
    }
}

/* POST /webhook — mensagens */
function receberWebhook(req, res, corpo) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('EVENT_RECEIVED');                     /* responde 200 antes (Meta tem timeout) */
    if (!assinaturaValida(req, corpo)) { console.warn('[webhook] assinatura inválida — descartado'); return; }
    let payload;
    try { payload = JSON.parse(corpo); } catch (e) { console.error('[webhook] payload inválido:', e.message); return; }
    try {
        (payload.entry || []).forEach(function (entry) {
            (entry.changes || []).forEach(function (change) {
                const valor = change.value || {};
                (valor.messages || []).forEach(function (m) {
                    try {
                        if (m.type !== 'text') {
                            enviar(m.from, '📩 Só entendo *textos* por enquanto. Me manda um comando! 😉');
                            return;
                        }
                        if (!podeFalar(m.from)) return;
                        const resposta = processar(m.from, (m.text && m.text.body) || '');
                        if (resposta) enviar(m.from, resposta);
                    } catch (e) { console.error('[msg] erro:', e && e.stack); }
                });
            });
        });
    } catch (e) { console.error('[webhook] erro:', e.message); }
}

/* ============================ status ==================================== */
function stats() {
    let demoNumeros = 0, demoLancamentos = 0;
    try {
        fs.readdirSync(DATA_DIR).forEach(function (f) {
            if (!f.endsWith('.json') || f.indexOf('centavus_db') === 0) return;
            try {
                const d = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
                demoNumeros++; demoLancamentos += (d.lancamentos || []).length;
            } catch (e) {}
        });
    } catch (e) {}
    const db = store.db();
    return {
        contas: Object.keys(db.contas).length,
        vinculados: Object.keys(db.zapLinks).length,
        demoNumeros: demoNumeros,
        demoLancamentos: demoLancamentos,
        memoria: !!(META_TOKEN && PHONE_NUMBER_ID)
    };
}

module.exports = { verificarWebhook, receberWebhook, stats, enviar, processar };
