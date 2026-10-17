/* ==========================================================================
   CENTAVUS — RECURSOS PREMIUM (Pro · Premium)
   ---------------------------------------------------------------------------
   • Projeção de fim de mês (ritmo de gasto diário)
   • Detector de vazamentos (cobranças duplicadas, assinaturas, gastos
     formiga e picos por categoria)
   • Mapa de calor de gastos (estilo GitHub, últimos 20 semanas)
   • Relatório em PDF (via "Salvar como PDF" da impressão, com layout próprio)
   No plano Grátis os cards aparecem BORRADOS com cadeado (modelo Pierre):
   é a vitrine de conversão — "testar 7 dias" libera tudo na hora.
   ========================================================================== */
'use strict';

const CX_MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/* ---------- utilitários ---------- */
function cxHoje() { return new Date(); }
function cxIso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function cxDiasAtras(n) { const d = new Date(); d.setDate(d.getDate() - n); return cxIso(d); }
function cxTxIso(t) { return String((t && (t.iso || (typeof txIso === 'function' ? txIso(t) : ''))) || '').slice(0, 10); }
function cxMoney(v) {
    const oculto = (typeof isPrivacyHidden !== 'undefined') && isPrivacyHidden;
    return oculto ? 'R$ •••' : money(v);
}
function cxDinheiroCurto(v) {
    const n = Math.abs(Number(v) || 0);
    if (n >= 1000) return 'R$ ' + (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.', ',') + ' mil';
    return 'R$ ' + n.toFixed(0);
}
/* normaliza descrição: "Almoço do Trabalho #2" → "almocho do trabalho" */
function cxFetch(desc) {
    return String(desc || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\d+/g, ' ').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function cxDespesas(desdeIso) {
    return (typeof transactions !== 'undefined' && Array.isArray(transactions) ? transactions : [])
        .filter(function (t) { return t && Number(t.amount) < 0 && (!desdeIso || cxTxIso(t) >= desdeIso); });
}

/* ==========================================================================
   1) PROJEÇÃO DE FIM DE MÊS
   ========================================================================== */
function cxProjecaoDados() {
    const hoje = cxHoje();
    const mesAtual = cxIso(hoje).slice(0, 7);
    const mesPassadoD = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const mesPassado = cxIso(mesPassadoD).slice(0, 7);
    const despesas = cxDespesas('').filter(function (t) { return cxTxIso(t).slice(0, 7) === mesAtual; });
    if (!despesas.length) return null;
    let ateAgora = 0;
    despesas.forEach(function (t) { ateAgora += Math.abs(Number(t.amount) || 0); });
    let doMesPassado = 0;
    (typeof transactions !== 'undefined' ? transactions : []).forEach(function (t) {
        if (t && Number(t.amount) < 0 && cxTxIso(t).slice(0, 7) === mesPassado) doMesPassado += Math.abs(Number(t.amount) || 0);
    });
    const dia = hoje.getDate();
    const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const ritmo = ateAgora / Math.max(1, dia);
    return {
        ateAgora: ateAgora,
        ritmo: ritmo,
        projecao: ritmo * diasNoMes,
        dia: dia,
        diasNoMes: diasNoMes,
        restante: diasNoMes - dia,
        dif: doMesPassado > 0 ? ((ritmo * diasNoMes - doMesPassado) / doMesPassado) * 100 : null,
        mes: hoje.getMonth(),
        mesPassado: mesPassadoD.getMonth()
    };
}

function cxProjecaoCorpo() {
    const p = cxProjecaoDados();
    if (!p) {
        return '<p class="cvx-vazio">Sem gastos neste mês ainda. Registre movimentações e volte aqui para ver a previsão.</p>';
    }
    const dif = p.dif;
    const tendencia = dif === null ? ''
        : '<div class="cvx-cmp ' + (dif > 0 ? 'cvx-ruim' : 'cvx-bom') + '"><i class="fa-solid fa-arrow-' + (dif > 0 ? 'up' : 'down') + '"></i> ' +
          Math.abs(dif).toFixed(0) + '% ' + (dif > 0 ? 'a mais' : 'a menos') + ' que ' + CX_MESES[p.mesPassado] + ' (se mantiver o ritmo)</div>';
    return '<div class="cvx-valor">' + cxMoney(p.projecao) + '</div>' +
        '<div class="cvx-legenda">é o que você deve gastar até o fim de ' + CX_MESES[p.mes] + '</div>' +
        '<div class="cvx-mini">' +
            '<div><span>Já gastei</span><strong>' + cxMoney(p.ateAgora) + '</strong></div>' +
            '<div><span>Por dia</span><strong>' + cxMoney(p.ritmo) + '</strong></div>' +
            '<div><span>Faltam</span><strong>' + p.restante + ' dias</strong></div>' +
        '</div>' + tendencia;
}

/* ==========================================================================
   2) DETECTOR DE VAZAMENTOS
   ========================================================================== */
function cxVazamentosLista() {
    const itens = [];
    const todas = cxDespesas('').filter(function (t) { return cxTxIso(t); });
    const hoje = cxHoje();

    /* --- a) cobranças duplicadas (mesmo valor em até 3 dias) --- */
    const porChave = {};
    todas.forEach(function (t) {
        const k = cxFetch(t.desc) + '|' + Math.abs(Number(t.amount) || 0).toFixed(2);
        (porChave[k] = porChave[k] || []).push(t);
    });
    Object.keys(porChave).forEach(function (k) {
        const lst = porChave[k].slice().sort(function (a, b) { return cxTxIso(a) < cxTxIso(b) ? -1 : 1; });
        for (let i = 1; i < lst.length; i++) {
            const d1 = new Date(cxTxIso(lst[i - 1]) + 'T12:00:00'), d2 = new Date(cxTxIso(lst[i]) + 'T12:00:00');
            if ((d2 - d1) / 86400000 <= 3 && Number(lst[i].amount) === Number(lst[i - 1].amount)) {
                itens.push({
                    icone: 'fa-copy', cor: '#FF6B6B', peso: 3,
                    titulo: 'Possível cobrança duplicada',
                    texto: '“' + lst[i].desc + '” (' + cxMoney(Math.abs(Number(lst[i].amount))) + ') aparece em ' +
                        cxTxIso(lst[i - 1]).split('-').reverse().slice(0, 2).join('/') + ' e ' + cxTxIso(lst[i]).split('-').reverse().slice(0, 2).join('/') +
                        '. Vale conferir no extrato.'
                });
                break; /* uma bandeira por descrição é suficiente */
            }
        }
    });

    /* --- b) assinaturas / cobranças recorrentes (3+ ocorrências, valores parecidos) --- */
    const porNome = {};
    todas.forEach(function (t) {
        const k = cxFetch(t.desc);
        if (k) (porNome[k] = porNome[k] || []).push(t);
    });
    const assinaturasVistas = {};
    Object.keys(porNome).forEach(function (k) {
        const lst = porNome[k].slice().sort(function (a, b) { return cxTxIso(a) < cxTxIso(b) ? -1 : 1; });
        if (lst.length < 3) return;
        const valores = lst.map(function (t) { return Math.abs(Number(t.amount) || 0); });
        const soma = valores.reduce(function (a, b) { return a + b; }, 0);
        const media = soma / valores.length;
        const desvio = Math.max.apply(null, valores.map(function (v) { return Math.abs(v - media); }));
        if (media <= 0 || desvio / media > 0.05) return;           /* valores muito diferentes: não é assinatura */
        /* intervalos de ~15 a ~45 dias entre ocorrências */
        let intervalosOk = true;
        for (let i = 1; i < lst.length; i++) {
            const d1 = new Date(cxTxIso(lst[i - 1]) + 'T12:00:00'), d2 = new Date(cxTxIso(lst[i]) + 'T12:00:00');
            const gap = (d2 - d1) / 86400000;
            if (gap < 12 || gap > 45) { intervalosOk = false; break; }
        }
        if (!intervalosOk) return;
        if (assinaturasVistas[k]) return;
        assinaturasVistas[k] = true;
        itens.push({
            icone: 'fa-rotate', cor: '#FFD166', peso: 2,
            titulo: 'Assinatura detectada',
            texto: '“' + lst[lst.length - 1].desc + '” sai por volta de ' + cxMoney(media) + ' por mês — cerca de ' +
                cxMoney(media * 12) + ' por ano. ' + lst.length + ' cobranças nos últimos meses.'
        });
    });

    /* --- c) gastos formiga (últimos 30 dias, itens abaixo de R$ 20) --- */
    const desde30 = cxDiasAtras(30);
    let formigaQtd = 0, formigaTotal = 0;
    todas.forEach(function (t) {
        const v = Math.abs(Number(t.amount) || 0);
        if (cxTxIso(t) >= desde30 && v > 0 && v < 20) { formigaQtd++; formigaTotal += v; }
    });
    if (formigaQtd >= 5 && formigaTotal >= 30) {
        itens.push({
            icone: 'fa-bug', cor: '#8070F0', peso: 1,
            titulo: 'Gastos formiga',
            texto: formigaQtd + ' lançamentos abaixo de R$ 20 somaram ' + cxMoney(formigaTotal) + ' nos últimos 30 dias. Pequenos no dia a dia, grandes no fim do mês.'
        });
    }

    /* --- d) picos por categoria (mês atual × média de 3 meses) --- */
    const mesAtual = cxIso(hoje).slice(0, 7);
    const inicioPassado = cxIso(new Date(hoje.getFullYear(), hoje.getMonth() - 3, 1));
    const porCatMes = {}, porCatHist = {};
    todas.forEach(function (t) {
        const iso = cxTxIso(t), v = Math.abs(Number(t.amount) || 0), cat = t.cat || 'Outros';
        if (iso.slice(0, 7) === mesAtual) porCatMes[cat] = (porCatMes[cat] || 0) + v;
        else if (iso >= inicioPassado) porCatHist[cat] = (porCatHist[cat] || 0) + v;
    });
    Object.keys(porCatMes).forEach(function (cat) {
        const hist = porCatHist[cat] || 0;
        if (hist <= 0) return;
        const mediaHist = hist / 3;
        const atual = porCatMes[cat];
        if (mediaHist > 5 && atual > mediaHist * 1.5) {
            const sobe = ((atual - mediaHist) / mediaHist) * 100;
            itens.push({
                icone: 'fa-chart-line', cor: '#F7806E', peso: 2,
                titulo: 'Pico em ' + cat,
                texto: 'Você gastou ' + cxMoney(atual) + ' em ' + cat + ' este mês — ' + sobe.toFixed(0) + '% acima da sua média de ' + cxMoney(mediaHist) + '.'
            });
        }
    });

    itens.sort(function (a, b) { return b.peso - a.peso; });
    return itens.slice(0, 6);
}

function cxVazamentosCorpo() {
    const itens = cxVazamentosLista();
    if (!itens.length) {
        return '<div class="cvx-ok"><i class="fa-solid fa-shield-heart"></i><span>Nada suspeito por aqui: sem duplicidade, sem assinatura escondida e sem estouro de categoria. Continue assim!</span></div>';
    }
    return itens.map(function (it) {
        return '<div class="cvx-achado"><i class="fa-solid ' + it.icone + '" style="color:' + it.cor + '"></i>' +
            '<div><strong>' + it.titulo + '</strong><p>' + it.texto + '</p></div></div>';
    }).join('');
}

/* ==========================================================================
   3) MAPA DE CALOR DE GASTOS (últimas 20 semanas)
   ========================================================================== */
function cxHeatmapCorpo() {
    const hoje = cxHoje();
    const porDia = {};
    let maxDia = 0;
    cxDespesas('').forEach(function (t) {
        const iso = cxTxIso(t);
        if (!iso) return;
        porDia[iso] = (porDia[iso] || 0) + Math.abs(Number(t.amount) || 0);
    });
    Object.keys(porDia).forEach(function (k) { if (porDia[k] > maxDia) maxDia = porDia[k]; });

    /* alinha no domingo de 19 semanas atrás (colunas = semanas, linhas = Dom..Sáb) */
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - (19 * 7 + hoje.getDay()));
    const niveis = [0.25, 0.5, 0.75].map(function (p) { return maxDia * p; });
    let cols = '', totalHeat = 0;
    for (let sem = 0; sem < 20; sem++) {
        cols += '<div class="cvx-col">';
        for (let dow = 0; dow < 7; dow++) {
            const d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + sem * 7 + dow);
            const iso = cxIso(d);
            const v = porDia[iso] || 0;
            let lvl = 0;
            if (v > 0) { totalHeat += v; lvl = v <= niveis[0] ? 1 : v <= niveis[1] ? 2 : v <= niveis[2] ? 3 : 4; }
            cols += '<span class="cvx-cel cvx-l' + lvl + '" title="' + d.getDate() + ' de ' + CX_MESES[d.getMonth()] + ': ' + (v > 0 ? cxMoney(v) : 'sem gastos') + '"></span>';
        }
        cols += '</div>';
    }
    return '<div class="cvx-heat">' + cols + '</div>' +
        '<div class="cvx-heat-legenda"><span>' + cxIso(inicio).split('-').reverse().slice(0, 2).join('/') + '</span>' +
        '<span class="cvx-legend-cels"><i class="cvx-cel cvx-l0"></i><i class="cvx-cel cvx-l1"></i><i class="cvx-cel cvx-l2"></i><i class="cvx-cel cvx-l3"></i><i class="cvx-cel cvx-l4"></i></span>' +
        '<span>hoje · total no período: ' + cxMoney(totalHeat) + '</span></div>';
}

/* ==========================================================================
   4) RELATÓRIO EM PDF (impressão com layout próprio → "Salvar como PDF")
   ========================================================================== */
function cvPrintReport() {
    const area = document.getElementById('cvPrintArea') || (function () {
        const d = document.createElement('div');
        d.id = 'cvPrintArea';
        document.body.appendChild(d);
        return d;
    })();

    const todas = (typeof transactions !== 'undefined' && Array.isArray(transactions) ? transactions : []).slice();
    const esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };

    let entradas = 0, saidas = 0;
    const porCat = {};
    todas.forEach(function (t) {
        const v = Number(t.amount) || 0;
        if (v > 0) entradas += v; else saidas += Math.abs(v);
        if (v < 0) { const c = t.cat || 'Outros'; porCat[c] = (porCat[c] || 0) + Math.abs(v); }
    });
    const topCats = Object.keys(porCat).map(function (c) { return { c: c, v: porCat[c] }; })
        .sort(function (a, b) { return b.v - a.v; }).slice(0, 5);
    const linhas = todas.slice(0, 300).map(function (t) {
        const v = Number(t.amount) || 0;
        const pay = (typeof PAY_METHODS !== 'undefined' && PAY_METHODS[t.pay]) ? PAY_METHODS[t.pay].label : (t.pay || '');
        return '<tr><td>' + esc(cxTxIso(t).split('-').reverse().join('/')) + '</td><td>' + esc(t.desc) + '</td><td>' + esc(t.cat) +
            '</td><td>' + esc(pay) + '</td><td class="' + (v < 0 ? 'cvp-neg' : 'cvp-pos') + '">' + money(v) + '</td></tr>';
    }).join('');

    area.innerHTML =
        '<div class="cvp-head"><div><h1>Centavus — Relatório Financeiro</h1>' +
        '<p>Emitido em ' + new Date().toLocaleDateString('pt-BR') + (perfil && perfil.nome ? ' · ' + esc(perfil.nome) : '') + '</p></div>' +
        '<div class="cvp-logo">CENTAV<span>US</span></div></div>' +
        '<div class="cvp-resumo">' +
            '<div><span>Entradas</span><strong class="cvp-pos">' + money(entradas) + '</strong></div>' +
            '<div><span>Saídas</span><strong class="cvp-neg">' + money(saidas) + '</strong></div>' +
            '<div><span>Saldo</span><strong>' + money(entradas - saidas) + '</strong></div>' +
            '<div><span>Movimentações</span><strong>' + todas.length + '</strong></div>' +
        '</div>' +
        (topCats.length ? '<h2>Maiores categorias</h2><div class="cvp-cats">' + topCats.map(function (x, i) {
            return '<div><b>' + (i + 1) + '.</b> ' + esc(x.c) + ' — <strong>' + money(x.v) + '</strong> (' + (saidas > 0 ? ((x.v / saidas) * 100).toFixed(0) : 0) + '% das saídas)</div>';
        }).join('') + '</div>' : '') +
        '<h2>Movimentações' + (todas.length > 300 ? ' (primeiras 300 de ' + todas.length + ')' : '') + '</h2>' +
        '<table class="cvp-tabela"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Pagamento</th><th>Valor</th></tr></thead><tbody>' +
        (linhas || '<tr><td colspan="5">Nenhuma movimentação registrada.</td></tr>') + '</tbody></table>' +
        '<p class="cvp-rodape">Gerado pelo Centavus — smart finance. Dica: no diálogo de impressão, escolha “Salvar como PDF”.</p>';

    window.print();
}

/* ==========================================================================
   MONTAGEM DOS CARDS (com vitrine travada no plano Grátis)
   ========================================================================== */
function cxCard(id, icone, cor, titulo, sub, corpo, liberado) {
    return '<div class="cvx-card centavus-card p-6' + (liberado ? '' : ' cvx-travado') + '">' +
        '<div class="cvx-cab"><h3 class="text-base font-bold text-white flex items-center gap-2">' +
        '<span class="cvx-ico" style="background:' + cor + '1f;color:' + cor + '"><i class="fa-solid ' + icone + '"></i></span>' +
        titulo + '</h3><p class="cvx-sub">' + sub + '</p></div>' +
        '<div class="cvx-corpo">' + corpo + '</div>' +
        (liberado ? '' :
            '<div class="cvx-lock">' +
                '<i class="fa-solid fa-lock"></i>' +
                '<strong>Recurso Premium</strong>' +
                '<span>Disponível no Pro e no Premium — teste 7 dias grátis.</span>' +
                '<div class="cvx-lock-btns">' +
                    '<button type="button" class="cvx-btn-try" onclick="cvIniciarTrial()">Testar 7 dias</button>' +
                    '<button type="button" class="cvx-btn-ver" onclick="cvAbrirPlanos()">Ver planos</button>' +
                '</div>' +
            '</div>') +
        '</div>';
}

function renderPremiumExtras() {
    const grid = document.getElementById('cvExtrasGrid');
    if (!grid) return;
    const liberado = (typeof cvExtras === 'function') ? cvExtras() : false;
    try {
        grid.innerHTML =
            cxCard('projecao', 'fa-hourglass-half', '#40C8A0', 'Projeção do fim de mês',
                'Quanto deve sobrar — ou faltar — se você mantiver o ritmo', cxProjecaoCorpo(), liberado) +
            cxCard('vazamentos', 'fa-shield-heart', '#FFD166', 'Detector de vazamentos',
                'Duplicidades, assinaturas ocultas, gastos formiga e picos', cxVazamentosCorpo(), liberado) +
            '<div class="lg:col-span-3">' +
            cxCard('heatmap', 'fa-fire-flame-curved', '#F7806E', 'Mapa de calor de gastos',
                'Cada quadrado é um dia — quanto mais forte a cor, mais você gastou', cxHeatmapCorpo(), liberado) +
            '</div>';
    } catch (e) {
        console.warn('[centavus] extras:', e && e.message);
        grid.innerHTML = '';
    }
}

/* ---------- boot ---------- */
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { try { renderPremiumExtras(); } catch (e) {} });
else { try { renderPremiumExtras(); } catch (e) {} }

/* privacidade: ao ocultar valores, os cards premium re-renderizam mascarados */
try {
    if (typeof togglePrivacyMode === 'function' && !togglePrivacyMode.__cxWrap) {
        const _cxPriv = togglePrivacyMode;
        togglePrivacyMode = function () {
            const r = _cxPriv.apply(this, arguments);
            try { renderPremiumExtras(); } catch (e) {}
            return r;
        };
        togglePrivacyMode.__cxWrap = true;
    }
} catch (e) {}
