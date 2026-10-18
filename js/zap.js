/* ==========================================================================
   CENTAVUS ZAP — assistente no estilo WhatsApp
   ---------------------------------------------------------------------------
   • Chat dentro do site que roda OS MESMOS comandos do assistente de voz
     (motor compartilhado: cvVoice.ask), registrando tudo na hora.
   • Cota própria do plano (5/dia no Grátis, 150 no Pro, livre no Premium).
   • "Comandos rápidos" abrem o WhatsApp (wa.me) com a mensagem pronta para o
     número do usuário — funciona SEM servidor.
   • O bot automático no número real entra via WhatsApp Cloud API (backend);
     o card "Bot automático" explica isso ao usuário.
   ========================================================================== */
'use strict';

const ZAP_CMDS = [
    'Gastei 45 reais no almoço',
    'Recebi três mil de salário',
    'Quanto gastei este mês?',
    'Quanto tenho em cada conta?',
    'Paguei a fatura do Nubank',
    'Criar meta viagem com 500 de 5000',
    'Guardar 200 no cofrinho',
    'Ver planos'
];

function zap$(id) { return document.getElementById(id); }

/* ---------- bolhas (XSS-safe: sempre textContent) ---------- */
function zapBubble(who, text) {
    const box = zap$('zapMsgs');
    if (!box) return null;
    const row = document.createElement('div');
    row.className = 'zap-bubble ' + (who === 'user' ? 'zap-user' : 'zap-bot');
    const p = document.createElement('span');
    p.textContent = String(text == null ? '' : text);
    row.appendChild(p);
    const hora = document.createElement('i');
    hora.className = 'zap-hora';
    hora.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    row.appendChild(hora);
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
    return row;
}
function zapBot(text) { return zapBubble('bot', text); }
function zapUser(text) { return zapBubble('user', text); }

/* ---------- roda um comando pelo motor do assistente (sem falar em voz alta) ---------- */
function zapAsk(texto) {
    const t = String(texto || '').trim();
    if (!t) return;
    zapUser(t);
    const nv = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    /* cota do Zap — comandos de plano/ativacao não contam */
    if (typeof cvQuotaUsar === 'function' && typeof cvQuotaLivre === 'function' && !cvQuotaLivre(nv)) {
        if (!cvQuotaUsar('zap')) {
            const max = cvQuotaMax('zap');
            zapBot('Você usou todos os ' + max + ' comandos Zap do plano Grátis hoje. O Pro (R$ 19,90/mês) dá 150 por dia — abri os planos pra você.');
            if (typeof cvAbrirPlanos === 'function') cvAbrirPlanos();
            return;
        }
    }

    let replies = [];
    window.__cvZapAtivo = true;
    try {
        if (window.cvVoice && typeof cvVoice.ask === 'function') replies = cvVoice.ask(t) || [];
    } catch (e) {
        replies = ['Tive um problema ao processar isso. Tente de novo.'];
    } finally {
        window.__cvZapAtivo = false;
    }
    if (!replies.length) replies = ['Não entendi. Tente “gastei 50 reais no almoço”, “quanto gastei este mês” ou “ver planos”.'];
    replies.forEach(zapBot);
}

/* ---------- WhatsApp (wa.me, sem backend) ---------- */
function zapNumero() {
    try { return (localStorage.getItem('centavus_zap_numero') || '').replace(/\D/g, ''); } catch (e) { return ''; }
}
function zapAbrirZap(msg) {
    const n = zapNumero();
    const url = (n ? 'https://wa.me/' + n : 'https://wa.me/') + '?text=' + encodeURIComponent(String(msg || ''));
    try { window.open(url, '_blank', 'noopener'); }
    catch (e) { toast('Não consegui abrir o WhatsApp aqui.', 'error'); }
}

/* ---------- cards de comandos rápidos ---------- */
function zapRenderCmds() {
    const box = zap$('zapQcmds');
    if (!box) return;
    box.innerHTML = '';
    ZAP_CMDS.forEach(function (c) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'zap-qcmd';
        b.innerHTML = '<i class="fa-brands fa-whatsapp"></i><span></span>';
        b.querySelector('span').textContent = c;
        b.addEventListener('click', function () { zapAbrirZap(c); });
        box.appendChild(b);
    });
}

/* ---------- chips do chat ---------- */
function zapRenderChips() {
    const box = zap$('zapChips');
    if (!box) return;
    box.innerHTML = '';
    ['Gastei 45 reais no almoço', 'Quanto gastei este mês?', 'Quanto tenho em cada conta?', 'Ver planos'].forEach(function (c) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'zap-chip';
        b.textContent = c;
        b.addEventListener('click', function () { zapAsk(c); });
        box.appendChild(b);
    });
}

let zapBoasVindas = false;
function zapBoasVindasSePrecisa() {
    if (zapBoasVindas) return;
    zapBoasVindas = true;
    zapBot('Oi! 👋 Eu sou o Zap do Centavus. Manda aqui qualquer comando — “gastei 50 reais no almoço”, “quanto gastei este mês”, “paguei a fatura do Nubank” — que eu registro na hora.');
    setTimeout(function () {
        zapBot('Os mesmos comandos também funcionam pelo WhatsApp: toque num comando rápido abaixo e ele abre lá com a mensagem pronta.');
    }, 500);
}

/* ---------- boot ---------- */
function zapBoot() {
    const form = zap$('zapForm');
    if (!form) return;
    zapRenderChips();
    zapRenderCmds();

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        const el = zap$('zapInput');
        const v = (el.value || '').trim();
        if (!v) return;
        el.value = '';
        zapAsk(v);
        el.focus();
    });

    const num = zap$('zapNumInput');
    if (num) num.value = (function () {
        const n = zapNumero();
        if (!n) return '';
        return n.length > 2 && n.slice(0, 2) === '55' ? n.slice(0, 2) + ' ' + n.slice(2) : n;
    })();
    const save = zap$('zapNumSave');
    if (save) save.addEventListener('click', function () {
        const n = (zap$('zapNumInput').value || '').replace(/\D/g, '');
        if (n.length < 12 && n.length !== 0) { toast('Digite o número com DDI e DDD, ex.: 55 11 99999-0000.', 'error'); return; }
        try { n ? localStorage.setItem('centavus_zap_numero', n) : localStorage.removeItem('centavus_zap_numero'); } catch (e) {}
        toast(n ? 'Número salvo. O botão “Abrir” leva direto pra ele.' : 'Número removido.');
    });
    const open = zap$('zapOpenBtn');
    if (open) open.addEventListener('click', function () {
        zapAbrirZap('Oi, Zap! ' + (zapNumero() ? '' : '(sem número salvo — salve o seu no card acima) '));
    });

    /* primeiro scroll da seção apresenta o bot + mostra status do vínculo */
    if ('IntersectionObserver' in window) {
        const sec = document.getElementById('secZap');
        if (sec) {
            const io = new IntersectionObserver(function (ents) {
                ents.forEach(function (en) { if (en.isIntersecting) { zapBoasVindasSePrecisa(); zapStatusVinculo(); io.disconnect(); } });
            }, { threshold: 0.25 });
            io.observe(sec);
        }
    } else { zapBoasVindasSePrecisa(); zapStatusVinculo(); }

    /* sessão já restaurada no boot? então o status já dá pra buscar agora */
    setTimeout(zapStatusVinculo, 1500);

    /* aviso de limite vindo dos bloqueios (gate) durante um comando Zap */
    document.addEventListener('cv:gate', function (e) {
        if (!window.__cvZapAtivo) return;
        const msg = e.detail && e.detail.message;
        if (msg) zapBot(msg);
    });
}

/* ------------------------------------------------------------------
   VÍNCULO: número do WhatsApp ↔ conta do site (código gerado no servidor)
   ------------------------------------------------------------------ */
function zapStatusVinculo() {
    const st = zap$('zapLinkStatus');
    if (!st || st.dataset.ok === '1') return;
    if (typeof cvIsLocal === 'function' && cvIsLocal()) return;   /* sem servidor não há vínculo */
    apiGet('/api/me/zap').then(function (d) {
        if (!d || !d.numero) return;
        st.dataset.ok = '1';
        st.hidden = false;
        st.innerHTML = '<i class="fa-solid fa-circle-check"></i> Número vinculado: <b>' + zapFormatarTel(d.numero) + '</b> — já estou ligado à sua conta. 🎉';
        const btn = zap$('zapLinkBtn');
        if (btn) btn.innerHTML = '<i class="fa-solid fa-rotate mr-1"></i> <span>Gerar novo código</span>';
    }).catch(function () { /* sem sessão agora — tenta no próximo scroll */ });
}

function zapFormatarTel(n) {
    const d = String(n || '').replace(/\D/g, '');
    if ((d.length === 12 || d.length === 13) && d.slice(0, 2) === '55') return '+' + d.slice(0, 2) + ' (' + d.slice(2, 4) + ') ' + d.slice(4);
    return d;
}

function zapGerarVinculo() {
    const btn = zap$('zapLinkBtn');
    if (typeof cvIsLocal === 'function' && cvIsLocal()) {
        toast('O vínculo precisa do servidor no ar: abra o site pelo endereço do Render (https://…onrender.com), entre na conta e clique de novo.', 'error');
        return;
    }
    if (btn) { btn.disabled = true; btn.style.opacity = '.6'; }
    apiPost('/api/me/zap', { action: 'codigo' }).then(function (d) {
        if (btn) { btn.disabled = false; btn.style.opacity = ''; }
        if (!d || !d.codigo) return;
        zapMostrarCodigo(d.codigo, d.expiraMin);
        toast('Código gerado! Mande “vincular ' + d.codigo + '” pra mim no WhatsApp.', 'success');
    }).catch(function (err) {
        if (btn) { btn.disabled = false; btn.style.opacity = ''; }
        toast((err && err.message) ? err.message : 'Não consegui gerar o código. Tente de novo.', 'error');
    });
}

/* mostra o código no card (usado pelo botão E pela voz) */
function zapMostrarCodigo(codigo, minutos) {
    const code = zap$('zapLinkCode');
    if (!code) return;
    code.hidden = false;
    code.innerHTML = '<b class="zap-code-valor">' + codigo + '</b>' +
        '<span class="zap-code-dica">Me mande no WhatsApp: <i>vincular ' + codigo + '</i> — vale ' + (minutos || 20) + ' minutos.</span>';
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', zapBoot);
else zapBoot();

/* passo a passo do bot real (WhatsApp Cloud API) — usado pelo card "Bot automático" */
function cvBotInfo() {
    if (typeof showInfo !== 'function') return;
    showInfo(
        'Ativar o bot no seu número',
        'É um servidor gratuito que recebe as mensagens do WhatsApp e responde na hora. ' +
        'Hoje o servidor do Centavus faz tudo junto: hospeda o site, guarda os dados da conta na nuvem e roda o bot. ' +
        '1) Crie um app gratuito no Meta for Developers e ative o WhatsApp nele. ' +
        '2) Pegue o Token de acesso e o ID do número (no painel > WhatsApp > API). ' +
        '3) Suba a pasta "bot-whatsapp" num serviço como o Render (start: node server.js) e preencha as variáveis do README. ' +
        '4) Aponte o webhook da Meta para o seu servidor (o token de verificação já vem configurado). ' +
        '5) Volte aqui, clique em "Vincular meu número" e mande o código pro bot no WhatsApp. ' +
        'Pronto: seu cliente manda "gastei 45 no almoço" e o lançamento cai no painel Centavus na hora. ' +
        'O passo a passo completo está no arquivo bot-whatsapp/README.md.',
        'fa-robot'
    );
}
