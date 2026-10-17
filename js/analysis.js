/* ==========================================================================
   CENTAVUS — ANÁLISE DO DASHBOARD (item 4)
   Tudo calculado a partir das movimentações, contas, orçamentos, cartões e
   metas do próprio usuário — nada de número inventado.
   ========================================================================== */

let wealthChartInstance = null;
let compareChartInstance = null;
let goalsChartInstance = null;

/* ---------- helpers de data ---------- */
function monthEndDate(y, m) { return new Date(y, m + 1, 0); }
function lastMonths(n) {
    const out = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        out.push({ y: d.getFullYear(), m: d.getMonth(), label: MONTHS_SHORT[d.getMonth()] });
    }
    return out;
}
function txIsoSafe(t) { try { return txIso(t) || ''; } catch (e) { return String(t.iso || ''); } }

/* 12 meses do PLANO: do mês de referência (calendário) até os 11 seguintes —
   é onde o salário fixo e as entradas/saídas lançadas formam o relatório */
function planMonths(n) {
    const base = (typeof dataReferencia === 'function') ? dataReferencia() : new Date();
    const refYear = base.getFullYear();
    const out = [];
    for (let i = 0; i < n; i++) {
        const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
        const label = MONTHS_SHORT[d.getMonth()] + (d.getFullYear() !== refYear ? '/' + String(d.getFullYear()).slice(2) : '');
        out.push({ y: d.getFullYear(), m: d.getMonth(), label: label });
    }
    return out;
}
/* Renda Fixa reconhecida como RECEITA: vale por cada mês do período cadastrado
   (o salário fica fixo — padrão 12 meses — a partir da data inicial) */
function rfReceitaNoAnoMes(y, m) {
    try {
        if (typeof rfNoJanela === 'function') return rfNoJanela(y, m);
    } catch (e) { /* Renda Fixa ainda não carregada */ }
    return { valor: 0, qtd: 0 };
}
function monthTotals(y, m) {
    const prefix = y + '-' + pad2(m + 1);
    let inc = 0, out = 0, n = 0;
    transactions.forEach(t => {
        const i = txIsoSafe(t);
        if (i.slice(0, 7) !== prefix) return;
        n++;
        const v = Number(t.amount) || 0;
        if (v > 0) inc += v; else out += Math.abs(v);
    });
    /* o salário da Renda Fixa é ENTRADA do mês — entra na comparação entrada × saída */
    const rf = rfReceitaNoAnoMes(y, m);
    if (rf.valor > 0) { inc = round2(inc + rf.valor); n += rf.qtd; }
    return { inc: round2(inc), out: round2(out), saldo: round2(inc - out), n: n };
}
function accountsInitialSum() {
    return round2((accounts || []).reduce((s, a) => s + (Number(a.initial) || 0), 0));
}

/* ---------- 1. Evolução do patrimônio ---------- */
function chartColors() {
    const light = (typeof isLightMode === 'function') && isLightMode();
    return {
        grid: light ? 'rgba(11,18,17,.08)' : 'rgba(255,255,255,.06)',
        tick: '#6F807C',
        line: light ? '#30A080' : '#70E0C0',
        fill: light ? 'rgba(48,160,128,.14)' : 'rgba(112,224,192,.14)'
    };
}

/* cores das colunas de entrada/saída (acompanham o modo claro/escuro) */
function wealthColors() {
    const light = (typeof isLightMode === 'function') && isLightMode();
    const c = chartColors();
    c.inc = light ? 'rgba(48,160,128,.75)' : 'rgba(48,160,128,.85)';
    c.out = light ? 'rgba(247,128,110,.8)' : 'rgba(247,128,110,.85)';
    c.line = light ? '#0B7A62' : '#70E0C0';
    return c;
}

/* 12 meses do plano: entradas (com o salário fixo), saídas e o patrimônio acumulado */
function wealthSeries() {
    const base = accountsInitialSum();
    const meses = planMonths(12);
    let acc = base;
    return meses.map(mm => {
        const t = monthTotals(mm.y, mm.m);   /* entradas já reconhecem a Renda Fixa */
        acc = round2(acc + t.inc - t.out);
        return { label: mm.label, y: mm.y, m: mm.m, inc: t.inc, out: t.out, value: acc };
    });
}

function renderWealth() {
    const canvas = document.getElementById('wealthChart');
    const empty = document.getElementById('wealthEmpty');
    if (!canvas || typeof Chart === 'undefined') return;
    const serie = wealthSeries();
    let temRf = false;
    try { temRf = (rendaFixa.itens || []).length > 0; } catch (e) {}
    const hasData = transactions.length > 0 || (accounts || []).length > 0 || temRf;
    if (empty) empty.classList.toggle('hidden', hasData);
    canvas.parentElement.style.display = hasData ? '' : 'none';
    if (!hasData) return;

    const c = wealthColors();
    const labels = serie.map(s => s.label);
    const z = v => (isPrivacyHidden ? 0 : v);
    const inc = serie.map(s => z(s.inc));
    const out = serie.map(s => z(s.out));
    const pat = serie.map(s => z(s.value));
    const now = serie[serie.length - 1];

    const badge = document.getElementById('wealthNow');
    if (badge) {
        badge.textContent = isPrivacyHidden ? '••••••' : money(now.value);
        badge.title = 'Patrimônio ao fim dos 12 meses do plano';
    }

    if (wealthChartInstance) {
        const d = wealthChartInstance.data;
        d.labels = labels;
        d.datasets[0].data = inc;
        d.datasets[0].backgroundColor = c.inc;
        d.datasets[1].data = out;
        d.datasets[1].backgroundColor = c.out;
        d.datasets[2].data = pat;
        d.datasets[2].borderColor = c.line;
        d.datasets[2].pointHoverBackgroundColor = c.line;
        ['x', 'y', 'y1'].forEach(k => {
            const ax = wealthChartInstance.options.scales[k];
            if (!ax) return;
            if (ax.grid && k !== 'y1') ax.grid.color = c.grid;
            ax.ticks.color = c.tick;
        });
        if (wealthChartInstance.options.plugins.legend) {
            wealthChartInstance.options.plugins.legend.labels.color = c.tick;
        }
        wealthChartInstance.update('none');
        return;
    }

    const ctx = canvas.getContext('2d');
    wealthChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Entradas (com salário)',
                    data: inc,
                    backgroundColor: c.inc,
                    borderRadius: 6,
                    borderSkipped: false,
                    maxBarThickness: 16
                },
                {
                    type: 'bar',
                    label: 'Saídas',
                    data: out,
                    backgroundColor: c.out,
                    borderRadius: 6,
                    borderSkipped: false,
                    maxBarThickness: 16
                },
                {
                    type: 'line',
                    label: 'Patrimônio acumulado',
                    data: pat,
                    borderColor: c.line,
                    backgroundColor: c.line,
                    borderWidth: 2.5,
                    tension: 0.35,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointHoverBackgroundColor: c.line,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 700 },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true,
                    labels: { color: c.tick, boxWidth: 10, boxHeight: 10, font: { size: 11 }, usePointStyle: false }
                },
                tooltip: {
                    callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + money(Number(ctx.parsed && ctx.parsed.y) || 0) }
                }
            },
            scales: {
                x: { grid: { color: c.grid }, ticks: { color: c.tick, font: { size: 11 } } },
                y: {
                    position: 'left',
                    grid: { color: c.grid },
                    ticks: { color: c.tick, font: { size: 11 }, callback: v => money(v) }
                },
                y1: {
                    position: 'right',
                    grid: { drawOnChartArea: false, color: c.grid },
                    ticks: { color: c.tick, font: { size: 11 }, callback: v => money(v) }
                }
            }
        }
    });
}

/* ---------- 2. Mês focado × mês anterior (seguindo o calendário de datas) ---------- */
function compareData() {
    const hoje = new Date();
    let ref = hoje;
    if (typeof selectedDate !== 'undefined' && selectedDate) {
        const d = isoToDate(selectedDate);
        if (!isNaN(d.getTime())) ref = d;
    }
    const focado = (typeof selectedMonthIndex !== 'undefined' && selectedMonthIndex >= 0)
        ? selectedMonthIndex : ref.getMonth();
    const y = ref.getFullYear();
    const prevIdx = focado - 1;
    const prevM = prevIdx < 0 ? 11 : prevIdx;
    const prevY = prevIdx < 0 ? y - 1 : y;
    const cur = monthTotals(y, focado);          /* entradas já com o salário */
    const ant = monthTotals(prevY, prevM);
    return {
        curName: MONTHS_SHORT[focado],
        prevName: MONTHS_SHORT[prevM],
        cur: cur, prev: ant,
        labelCur: mesNomeCompleto(focado),
        labelPrev: mesNomeCompleto(prevM) + (prevY !== y ? '/' + prevY : ''),
        focado: focado,
        eMesAtual: (focado === hoje.getMonth() && y === hoje.getFullYear())
    };
}

function deltaPct(atual, anterior) {
    if (!anterior) return null;
    return ((atual - anterior) / Math.abs(anterior)) * 100;
}

function renderCompare() {
    const grid = document.getElementById('compareGrid');
    if (!grid) return;
    const d = compareData();
    const sub = document.getElementById('compareSubtitle');
    if (sub) sub.textContent = d.labelCur + ' × ' + d.labelPrev;
    const titulo = document.getElementById('compareTitle');
    if (titulo) titulo.textContent = d.eMesAtual ? 'Mês atual × mês anterior' : 'Mês focado × mês anterior';

    const cell = (label, valor, delta, bomSeSobe) => {
        let badge = '<span class="cv-delta neutral">—</span>';
        if (delta !== null && isFinite(delta)) {
            const sobe = delta >= 0;
            const positivo = bomSeSobe ? sobe : !sobe;
            badge = '<span class="cv-delta ' + (Math.abs(delta) < 0.05 ? 'neutral' : (positivo ? 'up' : 'down')) + '">' +
                '<i class="fa-solid ' + (sobe ? 'fa-arrow-up' : 'fa-arrow-down') + '"></i> ' +
                Math.abs(delta).toFixed(1).replace('.', ',') + '%</span>';
        }
        return '<div class="cv-compare-cell">' +
            '<p class="cv-compare-label">' + label + '</p>' +
            '<strong class="confidential-value" data-value="' + valor + '">' + money(valor) + '</strong>' + badge +
            '</div>';
    };

    grid.innerHTML =
        cell('Entradas · ' + d.curName, d.cur.inc, deltaPct(d.cur.inc, d.prev.inc), true) +
        cell('Saídas · ' + d.curName, d.cur.out, deltaPct(d.cur.out, d.prev.out), false) +
        cell('Saldo · ' + d.curName, d.cur.saldo, deltaPct(d.cur.saldo, d.prev.saldo), true) +
        cell('Economia', d.cur.inc > 0 ? round2(d.cur.inc - d.cur.out) : 0,
             deltaPct(d.cur.inc > 0 ? (d.cur.inc - d.cur.out) : 0, d.prev.inc > 0 ? (d.prev.inc - d.prev.out) : 0), true);

    renderCompareChart(d);
    if (isPrivacyHidden) applyPrivacyState();
}

function renderCompareChart(d) {
    const canvas = document.getElementById('compareChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const c = chartColors();
    const labels = ['Entradas', 'Saídas', 'Saldo'];
    const dadosPrev = [d.prev.inc, d.prev.out, d.prev.saldo];
    const dadosCur = [d.cur.inc, d.cur.out, d.cur.saldo];

    if (compareChartInstance) {
        compareChartInstance.data.datasets[0].data = dadosPrev;
        compareChartInstance.data.datasets[1].data = dadosCur;
        /* os labels também mudam ao trocar o mês: sem isso a legenda continuava
           mostrando os meses ANTIGOS com os valores NOVOS */
        compareChartInstance.data.datasets[0].label = d.labelPrev;
        compareChartInstance.data.datasets[1].label = d.labelCur;
        compareChartInstance.options.plugins.tooltip.callbacks.title = () => '';
        compareChartInstance.update('none');
        return;
    }
    compareChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: d.labelPrev, data: dadosPrev, backgroundColor: 'rgba(160,144,255,.55)', borderRadius: 6 },
                { label: d.labelCur, data: dadosCur, backgroundColor: 'rgba(48,160,128,.85)', borderRadius: 6 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 700 },
            plugins: {
                legend: { labels: { color: c.tick, boxWidth: 10, boxHeight: 10, font: { size: 11 } } },
                tooltip: { callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + money(ctx.parsed.y) } }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: c.tick, font: { size: 11 } } },
                y: { grid: { color: c.grid }, ticks: { color: c.tick, font: { size: 11 }, callback: v => money(v) } }
            }
        }
    });
}

/* ---------- 3. Saldo projetado ---------- */
function renderProjection() {
    const now = new Date();
    const hojeIso = toIso(now);
    const inicioMes = toIso(new Date(now.getFullYear(), now.getMonth(), 1));
    const fimMes = monthEndDate(now.getFullYear(), now.getMonth());
    const diasRestantes = Math.max(0, fimMes.getDate() - now.getDate());

    const saldoAteAgora = round2(transactions
        .filter(t => { const i = txIsoSafe(t); return i >= inicioMes && i <= hojeIso; })
        .reduce((s, t) => s + (Number(t.amount) || 0), 0));

    const limiteInf = toIso(new Date(now.getTime() - 90 * 86400000));
    const janela = transactions.filter(t => { const i = txIsoSafe(t); return i >= limiteInf && i <= hojeIso; });
    const somaJanela = janela.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const mediaDia = janela.length ? round2(somaJanela / 90) : 0;

    const projetado = round2(saldoAteAgora + mediaDia * diasRestantes);

    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    const proj = document.getElementById('projectedBalance');
    if (proj) {
        proj.dataset.value = projetado;
        if (!isPrivacyHidden) proj.textContent = money(projetado);
        proj.classList.toggle('text-[#40C8A0]', projetado >= 0);
        proj.classList.toggle('text-[#ff8d9a]', projetado < 0);
    }
    set('projNow', money(saldoAteAgora));
    set('projDaily', (mediaDia >= 0 ? '+' : '') + money(mediaDia));
    set('projDays', diasRestantes + (diasRestantes === 1 ? ' dia' : ' dias'));

    const deltaEl = document.getElementById('projectedDelta');
    if (deltaEl) {
        if (!janela.length) deltaEl.textContent = 'Sem movimentações nos últimos 90 dias para projetar.';
        else {
            const diff = round2(projetado - saldoAteAgora);
            deltaEl.textContent = (diff >= 0 ? 'Tendência de +' : 'Tendência de ') + money(Math.abs(diff)) + ' até o fim do mês.';
            deltaEl.className = 'text-[11px] mt-1 ' + (diff >= 0 ? 'text-[#40C8A0] font-semibold' : 'text-[#ff8d9a] font-semibold');
        }
    }
    if (isPrivacyHidden) applyPrivacyState();
}

/* ---------- 4. Saúde financeira ---------- */
function healthScore() {
    const agora = new Date();
    const limiteInf = toIso(new Date(agora.getTime() - 90 * 86400000));
    const hojeIso = toIso(agora);
    const janela = transactions.filter(t => { const i = txIsoSafe(t); return i >= limiteInf && i <= hojeIso; });
    if (janela.length < 3) return null;

    let inc = 0, out = 0;
    const porCat = {};
    janela.forEach(t => {
        const v = Number(t.amount) || 0;
        if (v > 0) inc += v; else {
            const abs = Math.abs(v);
            out += abs;
            porCat[t.cat] = (porCat[t.cat] || 0) + abs;
        }
    });

    const criterios = [];

    // 1) taxa de economia (40 pts)
    const taxa = inc > 0 ? Math.max(0, (inc - out) / inc) : 0;
    criterios.push({
        label: 'Taxa de economia', valor: Math.round(taxa * 100) + '%',
        pts: Math.round(Math.min(1, taxa / 0.3) * 40), max: 40,
        dica: 'Meta saudável: guardar 30% do que entra.'
    });

    // 2) concentração de gastos (20 pts)
    const maiorCat = Math.max(0, ...Object.values(porCat));
    const concentracao = out > 0 ? maiorCat / out : 0;
    const diverso = Math.max(0, Math.min(1, 1 - (concentracao - 0.3) / 0.4));
    criterios.push({
        label: 'Concentração de gastos', valor: Math.round(concentracao * 100) + '%',
        pts: Math.round(diverso * 20), max: 20,
        dica: 'Nenhuma categoria deve passar de 30% dos gastos.'
    });

    // 3) orçamentos (20 pts)
    if (budgets.length) {
        const estourados = budgets.filter(b => {
            const gasto = transactions.filter(t => t.cat === b.name && t.amount < 0).reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
            return gasto > (Number(b.limit) || 0);
        }).length;
        criterios.push({
            label: 'Orçamentos respeitados', valor: (budgets.length - estourados) + '/' + budgets.length,
            pts: Math.round(((budgets.length - estourados) / budgets.length) * 20), max: 20,
            dica: 'Limite estourado derruba a nota.'
        });
    } else {
        criterios.push({ label: 'Orçamentos respeitados', valor: 'sem limites', pts: 10, max: 20, dica: 'Defina limites por categoria para ganhar pontos.' });
    }

    // 4) uso do cartão (20 pts)
    const limiteTotal = (cards || []).reduce((s, c) => s + (Number(c.limit) || 0), 0);
    const faturaTotal = (cards || []).reduce((s, c) => s + ((typeof faturaNoMes === 'function') ? faturaNoMes(c) : (Number(c.fatura) || 0)), 0);
    if (limiteTotal > 0) {
        const uso = faturaTotal / limiteTotal;
        criterios.push({
            label: 'Uso do limite de crédito', valor: Math.round(uso * 100) + '%',
            pts: Math.round(Math.max(0, Math.min(1, 1 - uso / 0.5)) * 20), max: 20,
            dica: 'Abaixo de 50% do limite é o ideal.'
        });
    } else {
        criterios.push({ label: 'Uso do limite de crédito', valor: 'sem cartões', pts: 15, max: 20, dica: 'Sem cartão cadastrado: nota neutra.' });
    }

    const total = criterios.reduce((s, c) => s + c.pts, 0);
    return { score: total, criterios: criterios, inc: round2(inc), out: round2(out) };
}

function renderHealth() {
    const gauge = document.getElementById('healthGauge');
    const scoreEl = document.getElementById('healthScore');
    const labelEl = document.getElementById('healthLabel');
    const hintEl = document.getElementById('healthHint');
    const barsEl = document.getElementById('healthBars');
    if (!gauge || !scoreEl) return;

    const h = healthScore();
    if (!h) {
        gauge.style.setProperty('--cv-score', '0%');
        gauge.classList.add('empty');
        scoreEl.textContent = '—';
        labelEl.textContent = 'Sem dados suficientes';
        hintEl.textContent = 'Registre pelo menos 3 movimentações nos últimos 90 dias para calcular a sua saúde financeira.';
        barsEl.innerHTML = '';
        return;
    }

    gauge.classList.remove('empty');
    const s = h.score;
    gauge.style.setProperty('--cv-score', Math.max(0, Math.min(100, s)) + '%');
    gauge.classList.toggle('warn', s < 50);
    gauge.classList.toggle('good', s >= 70);
    scoreEl.textContent = String(s);

    let label = 'Equilibrada', hint = 'Seu ritmo está dentro do esperado.';
    if (s >= 80) { label = 'Muito saudável'; hint = 'Parabéns: economia alta e gastos sob controle.'; }
    else if (s >= 60) { label = 'Saudável'; hint = 'Bom equilíbrio, com espaço para melhorar alguns pontos.'; }
    else if (s >= 40) { label = 'Atenção'; hint = 'Vale revisar gastos e limites nos próximos dias.'; }
    else { label = 'Crítica'; hint = 'Entradas e saídas estão desequilibradas — priorize reduzir despesas.'; }

    labelEl.textContent = label + ' · ' + s + '/100';
    hintEl.textContent = hint;

    barsEl.innerHTML = h.criterios.map(c => {
        const pct = Math.round((c.pts / c.max) * 100);
        const cor = pct >= 70 ? 'bg-[#30A080]' : (pct >= 40 ? 'bg-[#FFD166]' : 'bg-[#ff5064]');
        return '<div>' +
            '<div class="flex justify-between text-[11px] mb-1"><span class="text-[#A8B5B2] font-semibold">' + c.label + '</span>' +
            '<span class="text-[#6F807C]">' + c.valor + ' · ' + c.pts + '/' + c.max + '</span></div>' +
            '<div class="budget-bar"><div class="budget-fill ' + cor + '" style="width:' + pct + '%"></div></div>' +
            '<p class="text-[10px] text-[#6F807C] mt-1">' + c.dica + '</p>' +
        '</div>';
    }).join('');
}

/* ---------- 5. Evolução das metas ---------- */
function renderGoalsChart() {
    const canvas = document.getElementById('goalsChart');
    const empty = document.getElementById('goalsChartEmpty');
    if (!canvas || typeof Chart === 'undefined') return;

    /* pontos registrados a cada alteração de meta (histórico real) */
    const pontos = {};
    (goals || []).forEach(g => {
        (Array.isArray(g.hist) ? g.hist : []).forEach(h => {
            if (!h || !h.d) return;
            pontos[h.d] = (pontos[h.d] || []);
            pontos[h.d].push(Number(h.pct) || 0);
        });
        /* progresso atual entra como último ponto */
        const hoje = toIso(new Date());
        if (g.target > 0) { pontos[hoje] = (pontos[hoje] || []); pontos[hoje].push(Math.min(100, (g.current / g.target) * 100)); }
    });

    const datas = Object.keys(pontos).sort();
    const temDados = datas.length > 1;
    if (empty) empty.classList.toggle('hidden', temDados);
    canvas.parentElement.style.display = temDados ? '' : 'none';
    if (!temDados) return;

    const valores = datas.map(d => {
        const arr = pontos[d];
        return Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
    });
    const labels = datas.map(d => d.split('-').reverse().slice(0, 5).join('/'));
    const c = chartColors();

    if (goalsChartInstance) {
        goalsChartInstance.data.labels = labels;
        goalsChartInstance.data.datasets[0].data = valores;
        goalsChartInstance.update('none');
        return;
    }
    goalsChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Progresso médio das metas (%)',
                data: valores,
                borderColor: '#8070F0',
                backgroundColor: 'rgba(128,112,240,.14)',
                fill: true,
                tension: 0.35,
                borderWidth: 2.5,
                pointRadius: 3,
                pointBackgroundColor: '#A090FF'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => ' ' + ctx.parsed.y + '% das metas' }, displayColors: false }
            },
            scales: {
                x: { grid: { color: c.grid }, ticks: { color: c.tick, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
                y: { grid: { color: c.grid }, ticks: { color: c.tick, font: { size: 10 }, callback: v => v + '%' }, suggestedMax: 100, suggestedMin: 0 }
            }
        }
    });
}

/* ---------- orquestração ---------- */
function renderAnalysis() {
    try { renderWealth(); } catch (e) { console.warn('wealth', e); }
    try { renderCompare(); } catch (e) { console.warn('compare', e); }
    try { renderProjection(); } catch (e) { console.warn('projection', e); }
    try { renderHealth(); } catch (e) { console.warn('health', e); }
    try { renderGoalsChart(); } catch (e) { console.warn('goalsChart', e); }
}

/* os gráficos acompanham o modo claro/escuro */
if (typeof applyChartTheme === 'function') {
    const _applyChartTheme = applyChartTheme;
    window.applyChartTheme = function () {
        const r = _applyChartTheme.apply(this, arguments);
        try { renderAnalysis(); } catch (e) {}
        return r;
    };
}
