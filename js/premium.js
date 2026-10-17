/* ==========================================================================
   CENTAVUS PREMIUM — planos, limites, cotas diárias e ativação
   ---------------------------------------------------------------------------
   Modelo: ADITIVO com restrições estilo Pierre.
   • Tudo que o Centavus já tem continua disponível no plano Grátis.
   • O Grátis tem limites (como o Pierre limita "1 banco / 1 agente / mensagens"):
       - 3 metas · 2 contas · 2 cartões
       - 30 comandos de voz/dia · 5 comandos no Zap/dia
       - exportação de CSV/relatório bloqueadas
   • Pro (R$ 19,90/mês ou R$ 199/ano) e Premium (R$ 39,90/mês ou R$ 399/ano)
     liberam cotas maiores, itens ilimitados e exportação.
   • Recursos exclusivos futuros ficam listados como "em breve" nos planos.

   ATIVAÇÃO (sem servidor, por enquanto):
   • Código tem formato  CV-(PRO|PRE)-XXXX-MESES-HASH  (ex.: CV-PRO-A1B2-3-K7PQ)
   • O DONO DO PROJETO gera códigos no console do navegador:
         cvMakeCode('pro', 1)      → código Pro de 1 mês
         cvMakeCode('premium', 12) → código Premium de 1 ano
     e entrega o código após o pagamento (Pix/checkout).
   • O HASH é simples (client-side); segurança REAL exige backend — anotado
     como próximo passo quando o checkout entrar.

   Estados: 'free' | 'pro' | 'premium' | 'trial' (Premium por 7 dias)
   ========================================================================== */
'use strict';

/* ---------------- tabela de planos (preços configuráveis aqui) ---------------- */
const CV_PLANOS = {
    free:    { nome: 'Grátis',   precoM: 0,    precoA: 0,   metas: 3,       contas: 2,     cartoes: 2,      vozDia: 30,  zapDia: 5,   exportar: false, extras: false },
    pro:     { nome: 'Pro',      precoM: 19.9, precoA: 199, metas: 10,      contas: 6,     cartoes: 5,      vozDia: 150, zapDia: 150, exportar: true,  extras: true },
    premium: { nome: 'Premium',  precoM: 39.9, precoA: 399, metas: Infinity, contas: Infinity, cartoes: Infinity, vozDia: Infinity, zapDia: Infinity, exportar: true, extras: true }
};
const CV_TRIAL_DIAS = 7;

/* links de pagamento (checkout) — cole aqui os seus ou rode no console:
      cvSetCheckout('pro',      'https://pay.hotmart.com/XXXX?off=YYYY')
      cvSetCheckout('premium',  'https://pay.hotmart.com/ZZZZ?off=WWWW')
   Enquanto estiver vazio, o botão "Escolher" leva ao campo de código. */
const CV_CHECKOUT = { pro: '', premium: '' };
function cvCheckoutLink(plano) {
    try {
        const salvo = JSON.parse(localStorage.getItem('centavus_checkout') || '{}');
        if (salvo && salvo[plano]) return salvo[plano];
    } catch (e) {}
    return CV_CHECKOUT[plano] || '';
}
function cvSetCheckout(plano, url) {
    if (plano !== 'pro' && plano !== 'premium') { console.warn('cvSetCheckout: plano deve ser "pro" ou "premium".'); return; }
    let salvo = {};
    try { salvo = JSON.parse(localStorage.getItem('centavus_checkout') || '{}') || {}; } catch (e) {}
    salvo[plano] = String(url || '');
    try { localStorage.setItem('centavus_checkout', JSON.stringify(salvo)); } catch (e) {}
    cvRenderPlanos();
    toast(url ? ('Link de pagamento do plano ' + plano + ' salvo.') : ('Link do plano ' + plano + ' removido.'));
}
window.cvSetCheckout = cvSetCheckout;

/* ---------------- estado do plano (por conta) ---------------- */
function cvPlanoKey() {
    let u = '';
    try { u = (typeof lastUid === 'function') ? lastUid() : ''; } catch (e) {}
    return u ? ('centavus_plano_u' + u) : 'centavus_plano';
}
function cvPlanoLeia() {
    try {
        const s = JSON.parse(localStorage.getItem(cvPlanoKey()) || 'null');
        if (s && s.plano) return s;
    } catch (e) {}
    return { plano: 'free' };
}
function cvPlanoGrava(s) {
    try { localStorage.setItem(cvPlanoKey(), JSON.stringify(s)); } catch (e) {}
}

/* plano efetivo (expira trial/código automaticamente) */
function cvPlanoAtual() {
    const s = cvPlanoLeia();
    let plano = s.plano || 'free';
    if (plano === 'trial') {
        if (s.trialAte && Date.now() > s.trialAte) { plano = 'free'; s.plano = 'free'; cvPlanoGrava(s); }
        else plano = 'premium';
    } else if (plano === 'pro' || plano === 'premium') {
        if (s.expira && Date.now() > s.expira) { plano = 'free'; s.plano = 'free'; s.expira = 0; cvPlanoGrava(s); }
    } else plano = 'free';
    return plano;
}
function cvPlanoNome(plano) {
    plano = plano || cvPlanoAtual();
    if (plano === 'premium') return cvPlanoLeia().plano === 'trial' ? 'Teste Premium' : 'Premium';
    return (CV_PLANOS[plano] || CV_PLANOS.free).nome;
}
function cvPlanoLimits() { return CV_PLANOS[cvPlanoAtual()] || CV_PLANOS.free; }

/* ---------------- cotas diárias (voz / zap) ---------------- */
function cvHoje() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function cvQuotaMax(kind) {
    const L = cvPlanoLimits();
    return kind === 'zap' ? L.zapDia : L.vozDia;
}
function cvQuotaLeia(kind) {
    try {
        const q = JSON.parse(localStorage.getItem('centavus_qt_' + kind) || 'null');
        if (q && q.d === cvHoje()) return Number(q.n) || 0;
    } catch (e) {}
    return 0;
}
function cvQuotaGrava(kind, n) {
    try { localStorage.setItem('centavus_qt_' + kind, JSON.stringify({ d: cvHoje(), n: n })); } catch (e) {}
}
/* consuma 1 unidade; false = cota diária esgotada (planos ilimitados sempre true) */
function cvQuotaUsar(kind) {
    const max = cvQuotaMax(kind);
    if (max === Infinity) return true;
    const n = cvQuotaLeia(kind);
    if (n >= max) return false;
    cvQuotaGrava(kind, n + 1);
    return true;
}
function cvQuotaUsada(kind) { const max = cvQuotaMax(kind); return max === Infinity ? 0 : cvQuotaLeia(kind); }
/* palavras que NÃO consomem cota (o usuário precisa delas justamente para assinar) */
function cvQuotaLivre(nv) {
    return /\bplano|\bpremium|\bassinatura|\bativar|codigo|quanto custa|meu plano|\bzap\b|whatsapp|testar|\btrial\b/.test(nv);
}

/* ---------------- bloqueios por limite (estilo Pierre) ---------------- */
function cvBloqueado(msg) {
    if (typeof toast === 'function') toast(msg, 'error');
    /* a voz fala o aviso se o painel estiver aberto; o Zap mostra no chat */
    try { document.dispatchEvent(new CustomEvent('cv:gate', { detail: { message: msg } })); } catch (e) {}
    cvAbrirPlanos();
}
/* feature: 'metas' | 'contas' | 'cartoes' — true = pode criar mais uma */
function cvGate(feature) {
    const max = cvLimiteDe(feature);
    if (max === Infinity) return true;
    const atual = feature === 'metas' ? (typeof goals !== 'undefined' ? goals.length : 0)
        : feature === 'contas' ? (typeof accounts !== 'undefined' ? accounts.length : 0)
        : (typeof cards !== 'undefined' ? cards.length : 0);
    if (atual < max) return true;
    const nomes = { metas: 'metas financeiras', contas: 'contas', cartoes: 'cartões' };
    cvBloqueado('Limite do plano Grátis: ' + max + ' ' + nomes[feature] + ' (você já tem ' + atual + '). Assine o Pro para ter ' +
        (feature === 'metas' ? CV_PLANOS.pro.metas : feature === 'contas' ? CV_PLANOS.pro.contas : CV_PLANOS.pro.cartoes) + '.');
    return false;
}
function cvLimiteDe(feature) { const L = cvPlanoLimits(); return L ? L[feature] : Infinity; }
/* recursos exclusivos (mapa de calor, vazamentos, projeção, PDF): Pro e Premium */
function cvExtras() { const L = cvPlanoLimits(); return !!(L && L.extras); }
/* feature booleana: 'exportar' */
function cvGateBool(feature) {
    const L = cvPlanoLimits();
    if (L && L[feature]) return true;
    const msg = feature === 'exportar'
        ? 'Exportar CSV e imprimir relatórios são recursos dos planos pagos. O Pro começa em R$ 19,90 por mês.'
        : 'Este recurso faz parte dos planos pagos.';
    cvBloqueado(msg);
    return false;
}

/* ---------------- códigos de ativação ---------------- */
/* hash determinístico de 4 caracteres (sem I/O/0/1 para não gerar confusão) */
function cvHash4(s) {
    let h1 = 0x811c9dc5, h2 = 0x1b873593;
    s = String(s);
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
        h2 = Math.imul(h2 + c, 2654435761) >>> 0;
    }
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return A[h1 % 32] + A[(h1 >>> 5) % 32] + A[(h2 >>> 11) % 32] + A[(h2 >>> 17) % 32];
}
/* DONO: cvMakeCode('pro', 1) → "CV-PRO-AB12-3-X7KQ" (1 mês) */
function cvMakeCode(plano, meses) {
    const tag = (plano === 'premium') ? 'PRE' : 'PRO';
    meses = Math.max(1, Math.min(36, parseInt(meses, 10) || 1));
    let rnd = '';
    try { rnd = (Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '') + 'XXXX').slice(0, 4); } catch (e) { rnd = 'XXXX'; }
    const base = 'CV-' + tag + '-' + rnd + '-' + meses;
    return base + '-' + cvHash4(base);
}
function cvParseCode(code) {
    const m = /^CV-(PRO|PRE)-([A-Z0-9]{1,6})-(\d{1,2})-([A-Z0-9]{4})$/.exec(String(code || '').trim().toUpperCase().replace(/\s+/g, ''));
    if (!m) return null;
    const base = 'CV-' + m[1] + '-' + m[2] + '-' + m[3];
    if (cvHash4(base) !== m[4]) return null;
    return { plano: m[1] === 'PRE' ? 'premium' : 'pro', meses: parseInt(m[3], 10) };
}
function cvAtivarCodigo(code) {
    const r = cvParseCode(code);
    if (!r) { toast('Código inválido. Confira a letra/letras e tente de novo.', 'error'); return false; }
    const s = cvPlanoLeia();
    const ativo = (s.plano === r.plano || s.plano === 'trial') && s.expira && s.expira > Date.now();
    const base = ativo ? s.expira : Date.now();
    s.plano = r.plano;
    s.trialAte = 0;
    s.expira = base + r.meses * 30 * 86400000;
    s.codigo = String(code);
    cvPlanoGrava(s);
    cvPlanoBadge();
    cvRenderPlanos();
    toast('Plano ' + CV_PLANOS[r.plano].nome + ' ativado por ' + r.meses + (r.meses === 1 ? ' mês' : ' meses') + '. Bom uso!');
    return true;
}
function cvIniciarTrial() {
    if (cvPlanoAtual() !== 'free') {
        toast('Você já está no plano ' + cvPlanoNome() + ' — não precisa de teste.', 'error');
        return false;
    }
    const s = cvPlanoLeia();
    if (s.trialUsado) { toast('O teste grátis de ' + CV_TRIAL_DIAS + ' dias já foi usado nesta conta.', 'error'); return false; }
    s.plano = 'trial';
    s.trialAte = Date.now() + CV_TRIAL_DIAS * 86400000;
    s.trialUsado = true;
    s.expira = 0;
    cvPlanoGrava(s);
    cvPlanoBadge();
    cvRenderPlanos();
    toast('Premium liberado por ' + CV_TRIAL_DIAS + ' dias. Sem limite de comandos!');
    return true;
}

/* ---------------- selo do plano (topo) ---------------- */
function cvPlanoBadge() {
    const plano = cvPlanoAtual();
    const trial = cvPlanoLeia().plano === 'trial';
    const txt = trial ? 'Teste ' + CV_TRIAL_DIAS + 'd' : CV_PLANOS[plano].nome;
    const pill = document.getElementById('cvPlanPill');
    if (pill) {
        pill.textContent = txt;
        pill.parentElement.classList.toggle('cv-pill-pro', plano !== 'free');
    }
    const zapTag = document.getElementById('zapPlanTag');
    if (zapTag) zapTag.textContent = txt;
    /* libera (ou trava) os cards premium: projeção, vazamentos, mapa de calor */
    if (typeof renderPremiumExtras === 'function') { try { renderPremiumExtras(); } catch (e) {} }
}

/* =================== MODAL DE PLANOS =================== */
function cvPlanosItens(plano) {
    /* lista fixa de benefícios por plano */
    const mapa = {
        free: [
            ['fa-solid fa-circle-check', 'Tudo do Centavus: transações, cartões, contas, cofrinho, orçamentos, relatórios e assistente de voz'],
            ['fa-solid fa-bullseye', '3 metas · 2 contas · 2 cartões'],
            ['fa-solid fa-microphone', '30 comandos de voz por dia'],
            ['fa-brands fa-whatsapp', '5 comandos no Zap por dia']
        ],
        pro: [
            ['fa-solid fa-bullseye', '10 metas · 6 contas · 5 cartões'],
            ['fa-solid fa-microphone', '150 comandos de voz por dia'],
            ['fa-brands fa-whatsapp', '150 comandos no Zap por dia'],
            ['fa-solid fa-file-csv', 'Exportar em CSV e relatório em PDF'],
            ['fa-solid fa-hourglass-half', 'Projeção de fim de mês, detector de vazamentos e mapa de calor'],
            ['fa-solid fa-star', 'Novos recursos primeiro para você']
        ],
        premium: [
            ['fa-solid fa-infinity', 'Metas, contas e cartões ILIMITADOS'],
            ['fa-solid fa-microphone', 'Voz e Zap sem limite de comandos'],
            ['fa-solid fa-file-csv', 'Exportação sempre liberada'],
            ['fa-solid fa-fire-flame-curved', 'Mapa de calor, detector de vazamentos, projeção do mês e PDF'],
            ['fa-solid fa-rocket', 'Alertas inteligentes e acesso antecipado (em breve)']
        ]
    };
    return mapa[plano] || mapa.free;
}

function cvPlanCard(plano, atual) {
    const L = CV_PLANOS[plano];
    const preco = plano === 'free'
        ? '<span class="cv-preco">R$ 0</span><span class="cv-per">para sempre</span>'
        : '<span class="cv-preco">R$ ' + L.precoM.toFixed(2).replace('.', ',') + '</span><span class="cv-per">por mês</span>' +
          '<span class="cv-anual">ou R$ ' + L.precoA + '/ano (2 meses grátis)</span>';
    let uso = '';
    if (plano !== 'premium') {
        const vz = cvQuotaMax('voz'), zp = cvQuotaMax('zap');
        uso = '<div class="cv-uso">Seu uso hoje: voz ' + (vz === Infinity ? 'livre' : cvQuotaUsada('voz') + '/' + vz) +
            ' · Zap ' + (zp === Infinity ? 'livre' : cvQuotaUsada('zap') + '/' + zp) + '</div>';
    } else {
        uso = '<div class="cv-uso">Comandos e itens sem limite</div>';
    }
    const itens = cvPlanosItens(plano).map(function (it) {
        return '<li><i class="' + it[0] + '"></i><span>' + it[1] + '</span></li>';
    }).join('');
    const link = (plano === 'free') ? '' : cvCheckoutLink(plano);
    const btn = plano === 'free'
        ? '<button type="button" class="cv-plano-btn cv-plano-btn-fre' + (atual ? ' disabled' : '') + '" disabled>' + (atual ? 'Seu plano' : 'Sempre grátis') + '</button>'
        : '<button type="button" class="cv-plano-btn ' + (plano === 'pro' ? 'cv-btn-pro' : 'cv-btn-prem') + (atual ? ' disabled' : '') + '"' +
          (atual ? ' disabled' : ' onclick="cvAssinar(\'' + plano + '\')"') + '>' + (atual ? 'Seu plano' : (link ? 'Assinar ' + L.nome + ' →' : 'Escolher ' + L.nome)) + '</button>';
    return '<div class="cv-plano-card' + (atual ? ' cv-plano-atual' : '') + (plano === 'pro' ? ' cv-plano-destaque' : '') + '">' +
        (plano === 'pro' ? '<span class="cv-plano-flag">Mais popular</span>' : '') +
        (atual ? '<span class="cv-plano-eu">Plano atual</span>' : '') +
        '<div class="cv-plano-nome">' + (plano === 'premium' ? '<i class="fa-solid fa-crown"></i> ' : '') + L.nome + '</div>' +
        '<div class="cv-plano-preco">' + preco + '</div>' +
        '<ul class="cv-plano-itens">' + itens + '</ul>' + uso + btn + '</div>';
}

function cvRenderPlanos() {
    const grid = document.getElementById('cvPlanosGrid');
    if (!grid) return;
    const atual = cvPlanoAtual();
    grid.innerHTML = cvPlanCard('free', atual === 'free') + cvPlanCard('pro', atual === 'pro') + cvPlanCard('premium', atual === 'premium');
    const pill = document.getElementById('cvPlanosAtual');
    if (pill) pill.textContent = 'Seu plano: ' + cvPlanoNome();
    const trial = document.getElementById('cvTrialBtn');
    if (trial) trial.classList.toggle('hidden', atual !== 'free' || cvPlanoLeia().trialUsado === true);
}

function cvAbrirPlanos() {
    let ov = document.getElementById('cvPlanosModal');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'cvPlanosModal';
        ov.className = 'cv-planos-overlay hidden';
        ov.innerHTML =
            '<div class="cv-planos-card" role="dialog" aria-modal="true" aria-labelledby="cvPlanosTitle">' +
                '<div class="cv-planos-head">' +
                    '<div class="cv-planos-tit"><i class="fa-solid fa-crown"></i><h3 id="cvPlanosTitle">Planos Centavus</h3></div>' +
                    '<span id="cvPlanosAtual" class="cv-planos-atual">Seu plano: Grátis</span>' +
                    '<button type="button" id="cvPlanosClose" class="cv-planos-close" aria-label="Fechar planos"><i class="fa-solid fa-xmark"></i></button>' +
                '</div>' +
                '<div id="cvPlanosGrid" class="cv-planos-grid"></div>' +
                '<div class="cv-planos-acao">' +
                    '<button type="button" id="cvTrialBtn" class="cv-trial-btn"><i class="fa-solid fa-flask"></i> Testar Premium por ' + CV_TRIAL_DIAS + ' dias grátis</button>' +
                    '<div class="cv-cod-row">' +
                        '<input type="text" id="cvCodInput" class="cv-cod-input" placeholder="Já pagou? Cole seu código (CV-PRO-…)" aria-label="Código de ativação" spellcheck="false">' +
                        '<button type="button" id="cvCodBtn" class="cv-cod-btn">Ativar</button>' +
                    '</div>' +
                    '<p class="cv-planos-nota"><i class="fa-solid fa-circle-info"></i> Pagamento por Pix ou checkout (em breve): após pagar, você recebe um código e ativa aqui na hora. Diga “ver planos” no assistente ou use o atalho <b>Alt+V</b>.</p>' +
                '</div>' +
            '</div>';
        document.body.appendChild(ov);
        ov.querySelector('#cvPlanosClose').addEventListener('click', cvFecharPlanos);
        ov.querySelector('#cvTrialBtn').addEventListener('click', function () { cvIniciarTrial(); });
        ov.querySelector('#cvCodBtn').addEventListener('click', function () {
            const el = document.getElementById('cvCodInput');
            if (cvAtivarCodigo(el.value)) { el.value = ''; }
        });
        ov.querySelector('#cvCodInput').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); document.getElementById('cvCodBtn').click(); }
        });
        ov.addEventListener('click', function (e) { if (e.target === ov) cvFecharPlanos(); });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { const o = document.getElementById('cvPlanosModal'); if (o && !o.classList.contains('hidden')) cvFecharPlanos(); }
        });
    }
    cvRenderPlanos();
    ov.classList.remove('hidden');
    ov.classList.add('flex');
}
function cvFecharPlanos() {
    const ov = document.getElementById('cvPlanosModal');
    if (!ov) return;
    ov.classList.add('hidden');
    ov.classList.remove('flex');
}
function cvScrollToCode() {
    const el = document.getElementById('cvCodInput');
    if (el) { el.focus(); el.select && el.select(); }
}
/* botão "Assinar": abre o checkout se houver link; senão, leva ao código */
function cvAssinar(plano) {
    const link = cvCheckoutLink(plano);
    if (link) {
        try { window.open(link, '_blank', 'noopener'); } catch (e) { toast('Não consegui abrir o checkout.', 'error'); }
        toast('Abrindo o checkout seguro. Depois de pagar, seu código chega na hora.');
        return;
    }
    cvScrollToCode();
}

/* ---------------- boot ---------------- */
try { cvPlanoBadge(); } catch (e) {}

/* expõe o gerador de códigos para o dono do projeto (console) */
window.cvMakeCode = cvMakeCode;
