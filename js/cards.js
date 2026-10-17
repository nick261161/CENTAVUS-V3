/* Extraído de index.html — scripts clássicos, carregados na ordem abaixo. */
        /* ==========================================================================
           ÁREA DE CARTÕES — limite, fatura, fechamento e vencimento
           ========================================================================== */
        const CARD_BRANDS = {
            'Mastercard':       ['#8C1C13', '#F79E1B'],
            'Visa':             ['#1E3A8A', '#3B82F6'],
            'Elo':              ['#9D174D', '#EC4899'],
            'American Express': ['#0C4A6E', '#38BDF8'],
            'Hipercard':        ['#4C1D95', '#8B5CF6'],
            'Outro':            ['#134E4A', '#14B8A6']
        };

        let cards = []; // primeira vez: nenhum cartão cadastrado
        let cardSeq = 1;
        let cardEditId = null;

        /* ------- cor do cartão: amostras prontas + cor personalizada ------- */
        const CARD_SWATCHES = [
            ['Esmeralda', '#134E4A', '#14B8A6'],
            ['Violeta',   '#4C1D95', '#A78BFA'],
            ['Coral',     '#7F1D1D', '#F87171'],
            ['Âmbar',     '#78350F', '#FBBF24'],
            ['Rosa',      '#9D174D', '#EC4899'],
            ['Azul',      '#1E3A8A', '#60A5FA'],
            ['Grafite',   '#111827', '#6B7280'],
            ['Menta',     '#064E3B', '#34D399']
        ];
        let cardColorSel = null;        // [g1, g2] escolhidos no modal
        let cardColorFromBrand = true;  // true = a cor atual é o padrão da bandeira (deve acompanhá-la)

        function shadeHex(hex, amt){
            let h = String(hex || '').replace('#', '');
            if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
            if (!/^[0-9a-f]{6}$/i.test(h)) return '#14B8A6';
            const n = parseInt(h, 16);
            const out = [ (n>>16)&255, (n>>8)&255, n&255 ].map(v => {
                const r = amt < 0 ? v * (1 + amt) : v + (255 - v) * amt;
                return Math.max(0, Math.min(255, Math.round(r)));
            });
            return '#' + out.map(v => v.toString(16).padStart(2, '0')).join('');
        }
        /* cor atual = a escolhida; se houver, a da bandeira selecionada */
        function cardColorGet(){
            const sel = document.getElementById('cardBrand');
            const g = CARD_BRANDS[(sel && sel.value) || 'Mastercard'] || CARD_BRANDS['Outro'];
            return [g[0], g[1]];
        }
        function syncCardColorUI(){
            if (!cardColorSel || !cardColorSel[0]) cardColorSel = cardColorGet();
            const sel = cardColorSel;
            const wrap = document.getElementById('cardSwatches');
            if (wrap) {
                wrap.innerHTML = CARD_SWATCHES.map(function(s, i){
                    const on = sel[0] === s[1] && sel[1] === s[2];
                    return '<button type="button" class="cv-swatch' + (on ? ' active' : '') + '" data-i="' + i + '"' +
                        ' onclick="pickCardSwatch(' + i + ')" title="' + s[0] + '" aria-label="Cor ' + s[0] + '"' +
                        ' aria-pressed="' + on + '" style="background:linear-gradient(135deg,' + s[1] + ',' + s[2] + ')"></button>';
                }).join('');
            }
            const pick = document.getElementById('cardColorPick');
            if (pick) pick.value = /^[0-9a-f]{6}$/i.test(String(sel[1]).replace('#','')) ? sel[1] : '#14B8A6';
            const prev = document.getElementById('cardColorPreview');
            if (prev) { prev.style.setProperty('--g1', sel[0]); prev.style.setProperty('--g2', sel[1]); }
        }
        function pickCardSwatch(i){
            const s = CARD_SWATCHES[i];
            if (!s) return;
            cardColorSel = [s[1], s[2]];
            cardColorFromBrand = false;
            syncCardColorUI();
        }
        function pickCustomCardColor(){
            const el = document.getElementById('cardColorPick');
            const v = (el && /^[0-9a-f]{6}$/i.test(String(el.value).replace('#',''))) ? el.value : '#14B8A6';
            cardColorSel = [shadeHex(v, -0.45), v];
            cardColorFromBrand = false;
            syncCardColorUI();
        }
        function cardBrandChanged(){
            /* só reajusta a cor se ela ainda for o padrão da bandeira anterior */
            if (cardColorFromBrand) cardColorSel = cardColorGet();
            syncCardColorUI();
        }

        function cardById(id){ return cards.find(c => c.id === id); }
        function round2(v){ return Math.round((Number(v) || 0) * 100) / 100; }
        function setText(id, text, dataVal){
            const el = document.getElementById(id);
            if (!el) return;
            if (dataVal !== undefined) el.dataset.value = dataVal;
            el.textContent = text;
        }

        function renderCards(){
            const grid = document.getElementById('cardsGrid');
            if (!grid) return;
            const empty = document.getElementById('cardsEmpty');
            const totals = document.getElementById('cardsTotals');

            const totalLimit = round2(cards.reduce((s, c) => s + (Number(c.limit) || 0), 0));
            const totalFatura = round2(cards.reduce((s, c) => s + faturaNoMes(c), 0));
            const totalDisp = round2(totalLimit - totalFatura);

            if (totals) {
                totals.innerHTML =
                    '<div class="cv-total-chip"><p>Limite total</p><strong>' + money(totalLimit) + '</strong></div>' +
                    '<div class="cv-total-chip"><p>Faturas em aberto</p><strong>' + money(totalFatura) + '</strong></div>' +
                    '<div class="cv-total-chip ok"><p>Disponível</p><strong>' + money(totalDisp) + '</strong></div>';
            }

            setText('resumoFatura', money(totalFatura), totalFatura);
            setText('resumoLimite', money(totalLimit), totalLimit);
            setText('resumoDisponivel', money(totalDisp), totalDisp);
            const nextDue = cards.length ? Math.min.apply(null, cards.map(c => Number(c.dueDay) || 0)) : null;
            setText('resumoVencimento', nextDue ? 'Dia ' + nextDue : '—', nextDue ? 'Dia ' + nextDue : '—');
            const invEl = document.getElementById('nextInvoiceValue');
            const totalProx = round2(cards.reduce((s, c) => s + proximaFatura(c).valor, 0));
            if (invEl) { invEl.dataset.value = totalProx; if (!isPrivacyHidden) invEl.innerText = money(totalProx); }
            const dueEl = document.getElementById('nextInvoiceDue');
            if (dueEl) {
                const comFatura = cards.filter(c => faturaNoMes(c) > 0 || proximaFatura(c).valor > 0);
                const alvo = (comFatura.length ? comFatura : cards).slice().sort((a, b) => nextDueDate(a) - nextDueDate(b))[0];
                if (!alvo) dueEl.innerText = 'Nenhum cartão cadastrado';
                else {
                    const di = dueInfo(alvo);
                    dueEl.innerText = comFatura.length
                        ? di.text + ' · ' + di.data + ' (' + alvo.name + ')'
                        : 'Sem fatura · próxima em ' + di.data + ' (' + alvo.name + ')';
                }
            }
            const bar = document.getElementById('resumoBarra');
            if (bar) bar.style.width = (totalLimit > 0 ? Math.min(100, totalFatura / totalLimit * 100) : 0).toFixed(1) + '%';

            if (empty) empty.classList.toggle('hidden', cards.length > 0);
            grid.classList.toggle('hidden', cards.length === 0);

            const holder = (((document.getElementById('userNameDisplay') || {}).textContent) || 'Cliente Centavus').trim().toUpperCase() || 'CLIENTE CENTAVUS';

            grid.innerHTML = cards.map(c => {
                const g = (c.g1 && c.g2) ? [c.g1, c.g2] : (CARD_BRANDS[c.brand] || CARD_BRANDS['Outro']);
                const limit = Number(c.limit) || 0;
                const fatura = Math.max(0, round2(faturaNoMes(c)));
                const disp = round2(limit - fatura);
                const pct = limit > 0 ? Math.round(fatura / limit * 100) : 0;
                const pctBar = Math.max(0, Math.min(100, pct));
                const warn = pct >= 90;
                const digits = String(c.last4 || '0000').replace(/\D/g, '').padEnd(4, '0').slice(0, 4);
                const mask = '•••• •••• •••• ' + digits;
                const info = dueInfo(c);
                const px = proximaFatura(c);
                const pxTxt = px.valor > 0 ? ' · <b class="text-[#70E0C0] confidential-value" data-value="' + px.valor + '">' + money(px.valor) + '</b>' : '';
                const dueChip = fatura > 0
                    ? '<div class="cv-due-chip ' + (info.urgent ? 'urgent' : (info.soon ? 'soon' : '')) + '"><i class="fa-solid fa-calendar"></i> ' + info.text + ' · dia ' + info.data + pxTxt + '</div>'
                    : '<div class="cv-due-chip ok"><i class="fa-solid fa-circle-check"></i> Sem fatura em aberto · próxima em ' + info.data + pxTxt + '</div>';

                return '' +
                '<div class="cv-card-item">' +
                    '<div class="cv-card-face" style="--g1:' + g[0] + ';--g2:' + g[1] + ';cursor:pointer" role="button" tabindex="0" title="Clique para ver a fatura e as faturas futuras" onclick="openCardInvoice(' + c.id + ')" onkeydown="cardKeyOpen(event,' + c.id + ')">' +
                        '<div class="cv-card-top">' +
                            '<span class="cv-card-name">' + escapeHtml(c.name) + '</span>' +
                            '<span class="cv-card-brand">' + escapeHtml(c.brand) + '</span>' +
                        '</div>' +
                        '<div class="cv-card-chip"><span></span></div>' +
                        '<div class="cv-card-number confidential-value" data-value="' + mask + '">' + mask + '</div>' +
                        '<div class="cv-card-bottom">' +
                            '<div><small>TITULAR</small><b>' + escapeHtml(holder) + '</b></div>' +
                            '<div><small>FECHA</small><b>Dia ' + (c.closeDay || 1) + '</b></div>' +
                            '<div><small>VENCE</small><b>Dia ' + (c.dueDay || 1) + '</b></div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="cv-card-stats">' +
                        '<div class="cv-stat-row">' +
                            '<div class="cv-stat"><p>Limite</p><strong class="confidential-value" data-value="' + limit + '">' + money(limit) + '</strong></div>' +
                            '<div class="cv-stat ' + (warn ? 'warn' : '') + '"><p>Fatura</p><strong class="confidential-value" data-value="' + fatura + '">' + money(fatura) + '</strong></div>' +
                            '<div class="cv-stat ok"><p>Disponível</p><strong class="confidential-value" data-value="' + disp + '">' + money(disp) + '</strong></div>' +
                        '</div>' +
                        '<div class="budget-bar"><div class="budget-fill ' + (warn ? 'bg-[#FFD166]' : 'bg-[#30A080]') + '" style="width:' + pctBar + '%"></div></div>' +
                        dueChip +
                        '<div class="cv-card-actions">' +
                            '<span class="text-[10px] text-[#6F807C] font-semibold">' + pct + '% do limite usado</span>' +
                            '<div class="flex items-center gap-1.5">' +
                                '<button type="button" class="goal-btn mini" title="Pagar fatura" aria-label="Pagar fatura" onclick="payCard(' + c.id + ')"><i class="fa-solid fa-money-bill-wave"></i></button>' +
                                '<button type="button" class="goal-btn mini" title="Editar cartão" aria-label="Editar cartão" onclick="openCardModal(' + c.id + ')"><i class="fa-solid fa-pen"></i></button>' +
                                '<button type="button" class="goal-btn mini danger" title="Excluir cartão" aria-label="Excluir cartão" onclick="deleteCard(' + c.id + ')"><i class="fa-solid fa-trash"></i></button>' +
                            '</div>' +
                        '</div>' +
                        (function(){
                            const vinc = transactions.filter(t => t.cardId != null && String(t.cardId) === String(c.id));
                            if (!vinc.length) return '';
                            const soma = round2(vinc.reduce((s, t) => s + (t.total != null ? Math.abs(Number(t.total)) : Math.abs(Number(t.amount) || 0)), 0));
                            return '<p class="text-[10px] text-[#70E0C0] font-semibold mt-1.5"><i class="fa-solid fa-link text-[9px]"></i> ' +
                                vinc.length + (vinc.length > 1 ? ' compras vinculadas · ' : ' compra vinculada · ') + money(soma) + '</p>';
                        })() +
                    '</div>' +
                '</div>';
            }).join('');

            applyPrivacyState();
        }

        function showCardError(msg){
            const el = document.getElementById('cardError');
            if (!el) return;
            el.textContent = msg || '';
            el.style.display = msg ? 'block' : 'none';
        }

        /* ===== FATURA DO CARTÃO: clique no cartão + antecipar faturas futuras ===== */

        /* --- fechamento / vencimento: próxima fatura a partir do calendário (sem data = hoje) --- */
        function refBase(base){
            if (base) return base;
            try { if (typeof dataReferencia === 'function') return dataReferencia(); } catch (e) {}
            return new Date();
        }
        function nextDueDate(c, base){
            const now = refBase(base);
            const due = Math.max(1, Math.min(28, Number(c.dueDay) || 1));
            const hoje = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            let d = new Date(now.getFullYear(), now.getMonth(), due);
            if (d < hoje) d = new Date(now.getFullYear(), now.getMonth() + 1, due);
            return d;
        }
        function daysUntil(d, base){
            const now = refBase(base);
            const h0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            return Math.round((d - h0) / 86400000);
        }
        function dueInfo(c, base){
            const b = refBase(base);
            const d = nextDueDate(c, b);
            const n = daysUntil(d, b);
            const data = pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1);
            let text;
            if (n <= 0) text = 'Vence hoje';
            else if (n === 1) text = 'Vence amanhã';
            else text = 'Vence em ' + n + ' dias';
            return { date: d, data: data, days: n, text: text, urgent: n <= 3, soon: n <= 7 };
        }
        function cardPayments(c){
            return Array.isArray(c.pagamentos) ? c.pagamentos : [];
        }

        /* ===== FATURA DO MÊS: o que a CONTA diz que vence em cada mês =====
           - as parcelas/compras de crédito daquele mês (o plano inteiro);
           - a fatura aberta entra quando o vencimento dela cai nesse mês;
           - pagamento lançado no mês desconta da fatura dele (fatura paga);
           - mês sem nada vencendo = R$ 0,00 (acabaram as parcelas → sem fatura). */
        function faturaDoMesAbs(c, abs, base){
            const ref = refBase(base);
            const aberta = Math.max(0, round2(Number(c.fatura) || 0));
            const d = nextDueDate(c, ref);
            const dueAbs = d.getFullYear() * 12 + d.getMonth();
            let dados = { grupos: [] };
            try { dados = cardInvoiceData(c.id, true); } catch (e) {}
            const g = dados.grupos.find(x => x.abs === abs) || null;
            if (!g){
                /* nada vence neste mês: com compras no cartão = sem fatura;
                   sem compras = só a fatura digitada, quando o vencimento cai aqui */
                if (dados.grupos.length) return 0;
                return dueAbs === abs ? aberta : 0;
            }
            let v = Math.max(0, round2(Number(g.pendente) || 0));
            if (dueAbs === abs) v = Math.max(v, aberta);
            const y = Math.floor(abs / 12), m = ((abs % 12) + 12) % 12;
            const chave = y + '-' + pad2(m + 1);
            const pago = round2(cardPayments(c).reduce((s, p) => {
                return String(p.data || '').slice(0, 7) === chave ? s + (Number(p.valor) || 0) : s;
            }, 0));
            if (pago > 0) v = Math.max(0, Math.min(round2(v - pago), aberta));
            return Math.max(0, round2(v));
        }
        /* fatura do mês apontado no calendário "Data das movimentações" */
        function faturaNoMes(c, base){
            const ref = refBase(base);
            return faturaDoMesAbs(c, ref.getFullYear() * 12 + ref.getMonth(), base);
        }

        /* valor da PRÓXIMA fatura: a do mês em que cai o próximo vencimento,
           seguindo o calendário e o que a conta tem em cada mês. */
        function proximaFatura(c, base){
            const ref = refBase(base);
            const d = nextDueDate(c, ref);
            const abs = d.getFullYear() * 12 + d.getMonth();
            return { valor: faturaDoMesAbs(c, abs, base), date: d };
        }

        let ciCardId = null;
        function cardKeyOpen(e, id){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCardInvoice(id); } }
        function closeCardInvoice(){ const m = document.getElementById('cardInvoiceModal'); if (m) m.classList.add('hidden'); ciCardId = null; }
        /* reabre o desenho da fatura quando o calendário muda a data de referência */
        function refreshCardInvoiceIfOpen(){
            const m = document.getElementById('cardInvoiceModal');
            if (!m || m.classList.contains('hidden') || ciCardId == null) return;
            try { renderCardInvoice(); } catch (e) {}
        }
        function openCardInvoice(id){
            const m = document.getElementById('cardInvoiceModal');
            if (!m) return;
            ciCardId = id;
            renderCardInvoice();
            m.classList.remove('hidden');
        }
        /* parcelas ainda por vencer das compras vinculadas ao cartão (parceladas
           e à vista), agrupadas por fatura (mês de vencimento) — contadas A PARTIR
           do calendário "Data das movimentações" (sem data = hoje).
           `comTudo = true` devolve o plano inteiro, inclusive o que já venceu,
           para calcular a fatura de qualquer mês. */
        function cardInvoiceData(cardId, comTudo){
            let now = refBase();   /* dia escolhido no calendário (sem data = hoje) */
            const nowAbs = now.getFullYear() * 12 + now.getMonth();
            const grupos = {};
            transactions.forEach(t => {
                if (t.pay !== 'credito') return;
                if (t.cardId == null || String(t.cardId) !== String(cardId)) return;
                const parc = parseInt(t.parcelas, 10) || 1;
                const parcela = round2(Math.abs(Number(t.amount) || 0));
                if (!(parcela > 0)) return;
                const iso = String(t.iso || '');
                const anoBase = iso ? parseInt(iso.slice(0, 4), 10) : now.getFullYear();
                const mesBase = iso ? (parseInt(iso.slice(5, 7), 10) - 1) : Math.max(0, monthsLabels.indexOf(txMonthLabel(t)));
                const ant = Array.isArray(t.antecipadas) ? t.antecipadas.map(Number) : [];
                for (let k = 1; k <= parc; k++){
                    const abs = anoBase * 12 + mesBase + (k - 1);
                    /* a parcela do mês escolhido no calendário continua aparecendo
                       (entra na lista da próxima fatura); só some o que já venceu antes */
                    if (!comTudo && abs < nowAbs) continue;
                    const isAnt = ant.indexOf(k) > -1;
                    const g = grupos[abs] || (grupos[abs] = { abs: abs, pendente: 0, antecipado: 0, itens: [] });
                    g.itens.push({ txId: t.id, k: k, parc: parc, desc: t.desc, parcela: parcela, antecipada: isAnt });
                    if (isAnt) g.antecipado = round2(g.antecipado + parcela);
                    else g.pendente = round2(g.pendente + parcela);
                }
            });
            return { grupos: Object.keys(grupos).map(k => grupos[k]).sort((a, b) => a.abs - b.abs) };
        }
        function ciMesRotulo(abs, nowYear){
            const y = Math.floor(abs / 12);
            const m = mesNomeCompleto(((abs % 12) + 12) % 12);
            return (y !== nowYear) ? (m + '/' + y) : m;
        }
        function renderCardInvoice(){
            const body = document.getElementById('ciBody');
            const title = document.getElementById('ciTitle');
            const c = cards.find(x => String(x.id) === String(ciCardId));
            if (!body) return;
            if (!c){ body.innerHTML = '<p class="text-xs text-[#6F807C]">Cartão não encontrado.</p>'; return; }
            if (title) title.innerText = 'Fatura · ' + c.name;

            const nowYear = refBase().getFullYear();
            const hojeAbs = new Date().getFullYear() * 12 + new Date().getMonth();
            const limit = Number(c.limit) || 0;
            const fatura = Math.max(0, round2(faturaNoMes(c)));      /* fatura do mês do calendário */
            const faturaAberta = Math.max(0, round2(Number(c.fatura) || 0));
            const disp = round2(limit - fatura);
            const pct = limit > 0 ? Math.min(100, Math.round(fatura / limit * 100)) : 0;
            const dados = cardInvoiceData(c.id);
            const di = dueInfo(c);
            const pendentes = dados.grupos.filter(g => g.pendente > 0);
            const antecipadas = dados.grupos.filter(g => g.antecipado > 0);
            const pendTotal = round2(pendentes.reduce((s, g) => s + g.pendente, 0));
            const antTotal = round2(antecipadas.reduce((s, g) => s + g.antecipado, 0));
            const visiveis = pendentes.slice(0, 12);
            const resto = pendentes.slice(12);

            let html = '';
            /* --- fatura atual --- */
            html += '<div class="bg-[#102020] rounded-2xl p-4 border border-white/5">' +
                '<div class="flex items-start justify-between gap-3">' +
                    '<div><p class="text-[11px] text-[#6F807C] uppercase tracking-wider">Fatura atual</p>' +
                    '<p class="text-2xl font-extrabold text-white mt-1 confidential-value" data-value="' + fatura + '">' + money(fatura) + '</p></div>' +
                    '<div class="text-right"><p class="text-[11px] text-[#6F807C]">Disponível</p>' +
                    '<p class="text-sm font-bold text-[#40C8A0] confidential-value" data-value="' + disp + '">' + money(disp) + '</p>' +
                    '<p class="text-[10px] text-[#6F807C] mt-1">limite ' + money(limit) + '</p></div>' +
                '</div>' +
                '<div class="budget-bar mt-3"><div class="budget-fill ' + (pct >= 90 ? 'bg-[#FFD166]' : 'bg-[#30A080]') + '" style="width:' + pct + '%"></div></div>' +
                '<div class="flex items-center justify-between text-[11px] text-[#6F807C] mt-2">' +
                    '<span><i class="fa-solid fa-lock mr-1"></i>Fechamento dia ' + (c.closeDay || 1) + '</span>' +
                    '<span class="' + (di.urgent ? 'text-[#ff8d9a] font-bold' : (di.soon ? 'text-[#FFD166] font-bold' : '')) + '">' + di.text + ' · dia ' + (c.dueDay || 1) + ' (' + di.data + ')</span>' +
                '</div>' +
            '</div>';

            /* --- próxima fatura (valor do mês do vencimento, seguindo o calendário) --- */
            const px = proximaFatura(c);
            html += '<div class="flex items-center justify-between gap-3 bg-[#102020] border border-white/5 rounded-xl px-3.5 py-2 mt-2">' +
                '<span class="text-[11px] text-[#A8B5B2]"><i class="fa-solid fa-arrow-right text-[#70E0C0] mr-1.5"></i>Próxima fatura · ' + pad2(px.date.getDate()) + '/' + pad2(px.date.getMonth() + 1) + '</span>' +
                '<b class="text-xs text-[#70E0C0] confidential-value" data-value="' + px.valor + '">' + money(px.valor) + '</b>' +
            '</div>';

            /* --- histórico de pagamentos --- */
            const pagamentos = cardPayments(c);
            if (pagamentos.length) {
                html += '<div><h4 class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-2"><i class="fa-solid fa-rotate text-[#70E0C0]"></i>Histórico de pagamentos</h4>';
                html += pagamentos.slice(0, 8).map(p => {
                    const d = String(p.data || '').split('-').reverse().join('/');
                    return '<div class="flex items-center justify-between gap-3 bg-[#102020] border border-white/5 rounded-xl px-3.5 py-2 mb-2">' +
                        '<span class="text-xs text-[#A8B5B2]"><i class="fa-solid fa-circle-check text-[#40C8A0] mr-1.5"></i>Fatura paga em ' + d + '</span>' +
                        '<span class="text-xs font-bold text-[#40C8A0] confidential-value" data-value="' + p.valor + '">' + money(p.valor) + '</span>' +
                    '</div>';
                }).join('');
                if (pagamentos.length > 8) html += '<p class="text-[11px] text-[#6F807C] text-center">+ ' + (pagamentos.length - 8) + ' pagamento(s) anterior(es)</p>';
                html += '</div>';
            }

            /* --- faturas futuras --- */
            html += '<div>' +
                '<div class="flex items-center justify-between mb-2 gap-2">' +
                    '<h4 class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2"><i class="fa-solid fa-clock-rotate-left text-[#70E0C0]"></i>Próximas faturas</h4>' +
                    (pendTotal > 0 ? '<span class="text-[11px] text-[#70E0C0] font-bold confidential-value" data-value="' + pendTotal + '">' + money(pendTotal) + '</span>' : '') +
                '</div>';

            if (!dados.grupos.length){
                html += '<div class="text-center py-5 text-xs text-[#6F807C]"><i class="fa-solid fa-credit-card text-xl block mb-2 text-[#30A080]"></i>Nenhuma compra de crédito vinculada a este cartão.</div>';
            } else if (!pendentes.length){
                html += '<div class="text-center py-4 text-xs text-[#6F807C]"><i class="fa-solid fa-circle-check text-xl block mb-2 text-[#40C8A0]"></i>Todas as faturas futuras já estão antecipadas.</div>';
            } else {
                visiveis.forEach(g => {
                    const rot = ciMesRotulo(g.abs, nowYear);
                    const compras = g.itens.filter(i => !i.antecipada).map(i => escapeHtml(i.desc) + ' (' + i.k + '/' + i.parc + ')').join(', ');
                    /* só dá para antecipar o que ainda não entrou na fatura de hoje;
                       a parcela do mês escolhido no calendário aparece mesmo assim */
                    const jaNaFatura = g.abs <= hojeAbs;
                    const marca = jaNaFatura
                        ? '<span class="text-[10px] text-[#6F807C] whitespace-nowrap">' + (g.abs === hojeAbs ? 'fatura atual' : 'já faturada') + '</span>'
                        : '<button type="button" class="text-[10px] bg-[#204040] hover:bg-[#30A080] text-white px-2.5 py-1.5 rounded-lg font-bold whitespace-nowrap transition" onclick="anticipateInvoice(' + g.abs + ')">Antecipar</button>';
                    html += '<div class="flex items-center justify-between gap-3 bg-[#102020] border border-white/5 rounded-xl px-3.5 py-2.5 mb-2">' +
                        '<div class="min-w-0">' +
                            '<p class="text-xs font-semibold text-white">' + rot + ' <span class="text-[#40C8A0] font-mono ml-1 confidential-value" data-value="' + g.pendente + '">' + money(g.pendente) + '</span></p>' +
                            '<p class="text-[10px] text-[#6F807C] truncate">' + compras + '</p>' +
                        '</div>' + marca +
                    '</div>';
                });
                if (resto.length){
                    const restoVal = round2(resto.reduce((s, g) => s + g.pendente, 0));
                    html += '<p class="text-[11px] text-[#6F807C] text-center">+ ' + resto.length + ' fatura(s) futura(s) · <span class="font-semibold">' + money(restoVal) + '</span></p>';
                }
            }
            html += '</div>';

            /* --- já antecipadas --- */
            if (antecipadas.length){
                html += '<div><h4 class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-2"><i class="fa-solid fa-circle-check text-[#70E0C0]"></i>Já antecipadas nesta fatura' + (antTotal ? ' · <span class="text-[#70E0C0]">' + money(antTotal) + '</span>' : '') + '</h4>';
                antecipadas.forEach(g => {
                    const rot = ciMesRotulo(g.abs, nowYear);
                    const podeDevolver = (faturaAberta + 0.001) >= g.antecipado;
                    const compras = g.itens.filter(i => i.antecipada).map(i => escapeHtml(i.desc) + ' (' + i.k + '/' + i.parc + ')').join(', ');
                    html += '<div class="flex items-center justify-between gap-3 bg-[#102020] border border-[#70E0C0]/20 rounded-xl px-3.5 py-2.5 mb-2">' +
                        '<div class="min-w-0">' +
                            '<p class="text-xs font-semibold text-white">' + rot + ' <span class="text-[#70E0C0] font-mono ml-1 confidential-value" data-value="' + g.antecipado + '">' + money(g.antecipado) + '</span></p>' +
                            '<p class="text-[10px] text-[#6F807C] truncate">' + compras + '</p>' +
                        '</div>' +
                        (podeDevolver
                            ? '<button type="button" class="text-[10px] bg-[#204040] hover:bg-[#FFB4A8] hover:text-[#102020] text-white px-2.5 py-1.5 rounded-lg font-bold whitespace-nowrap transition" onclick="undoAnticipation(' + g.abs + ')">Desfazer</button>'
                            : '<span class="text-[10px] text-[#6F807C] whitespace-nowrap">paga</span>') +
                    '</div>';
                });
                html += '</div>';
            }

            html += '<p class="text-[11px] text-[#6F807C]"><i class="fa-solid fa-circle-info mr-1"></i>Antecipar traz o valor da fatura futura para a fatura atual.</p>';
            html += '<button type="button" class="w-full text-xs bg-[#204040] hover:bg-[#30A080] text-white py-2.5 rounded-xl font-bold transition" onclick="ciPayCard()"><i class="fa-solid fa-money-bill-wave mr-1"></i>Pagar fatura de ' + escapeHtml(c.name) + '</button>';

            body.innerHTML = html;
            applyPrivacyState();
        }
        function ciPayCard(){ if (ciCardId == null) return; Promise.resolve(payCard(ciCardId)).then(renderCardInvoice); }
        function anticipateInvoice(abs){
            const c = cards.find(x => String(x.id) === String(ciCardId));
            if (!c) return;
            const g = cardInvoiceData(c.id).grupos.find(x => x.abs === abs);
            if (!g) return;
            const pend = g.itens.filter(i => !i.antecipada);
            if (!pend.length) return;
            pend.forEach(i => {
                const t = transactions.find(x => x.id === i.txId);
                if (!t) return;
                if (!Array.isArray(t.antecipadas)) t.antecipadas = [];
                if (t.antecipadas.indexOf(i.k) < 0) t.antecipadas.push(i.k);
            });
            const soma = round2(pend.reduce((s, i) => s + i.parcela, 0));
            c.fatura = round2(Math.max(0, (Number(c.fatura) || 0) + soma));
            persist(); renderCards(); renderCardInvoice();
            toast('Fatura antecipada: ' + money(soma) + ' entrou na fatura de ' + c.name + '.');
        }
        function undoAnticipation(abs){
            const c = cards.find(x => String(x.id) === String(ciCardId));
            if (!c) return;
            const g = cardInvoiceData(c.id).grupos.find(x => x.abs === abs);
            if (!g) return;
            const ant = g.itens.filter(i => i.antecipada);
            if (!ant.length) return;
            const soma = round2(ant.reduce((s, i) => s + i.parcela, 0));
            if ((Number(c.fatura) || 0) + 0.001 < soma){ toast('A fatura atual já não contém esse valor.'); return; }
            ant.forEach(i => {
                const t = transactions.find(x => x.id === i.txId);
                if (t && Array.isArray(t.antecipadas)) t.antecipadas = t.antecipadas.filter(k => Number(k) !== i.k);
            });
            c.fatura = round2(Math.max(0, (Number(c.fatura) || 0) - soma));
            persist(); renderCards(); renderCardInvoice();
            toast(money(soma) + ' devolvido para as faturas futuras de ' + c.name + '.');
        }

        function openCardModal(id){
            cardEditId = (id && cardById(id)) ? id : null;
            const editing = !!cardEditId;
            /* limite do plano Grátis: só na CRIAÇÃO */
            if (!editing && typeof cvGate === 'function' && !cvGate('cartoes')) { cardEditId = null; return; }
            const c = editing ? cardById(cardEditId) : null;
            const title = document.getElementById('cardModalTitle');
            if (title) title.innerHTML = '<i class="fa-solid fa-credit-card text-[#40C8A0]"></i> ' + (editing ? 'Editar cartão' : 'Novo cartão');
            const set = (field, val) => { const el = document.getElementById(field); if (el) el.value = val; };
            set('cardName', c ? c.name : '');
            set('cardBrand', c ? c.brand : 'Mastercard');
            set('cardLast4', c ? c.last4 : '');
            set('cardLimit', c ? c.limit : '');
            set('cardFatura', c ? c.fatura : '');
            set('cardClose', c ? c.closeDay : 1);
            set('cardDue', c ? c.dueDay : 1);
            /* cor: usa a salva no cartão; senão, a da bandeira */
            if (c && c.g1 && c.g2) {
                const padrao = CARD_BRANDS[c.brand];
                cardColorFromBrand = !!(padrao && padrao[0] === c.g1 && padrao[1] === c.g2);
                cardColorSel = [c.g1, c.g2];
            } else {
                cardColorFromBrand = true;
                cardColorSel = cardColorGet();
            }
            syncCardColorUI();
            const del = document.getElementById('cardDeleteBtn');
            if (del) del.classList.toggle('hidden', !editing);
            showCardError('');
            const modal = document.getElementById('cardModal');
            if (modal) modal.classList.remove('hidden');
            setTimeout(() => { const el = document.getElementById('cardName'); if (el) el.focus(); }, 60);
        }

        function closeCardModal(){
            const modal = document.getElementById('cardModal');
            if (modal) modal.classList.add('hidden');
            cardEditId = null;
        }

        function deleteCardFromModal(){
            const id = cardEditId;
            closeCardModal();
            if (id) deleteCard(id);
        }

        async function deleteCard(id){
            const c = cardById(id);
            if (!c) return;
            const ok = await cvConfirm({ titulo: 'Excluir o cartão “' + c.name + '”?', mensagem: 'O cartão sai da sua conta. As movimentações já lançadas nele continuam no histórico.', okLabel: 'Excluir cartão' });
            if (!ok) return;
            cards = cards.filter(x => x.id !== id);
            persist();
            renderCards();
            toast('Cartão “' + c.name + '” excluído.');
        }

        async function payCard(id){
            const c = cardById(id);
            if (!c) return;
            const aberta = Math.max(0, round2(Number(c.fatura) || 0));
            const doMes = Math.max(0, round2(faturaNoMes(c)));
            const devido = round2(Math.max(aberta, doMes));
            if (!(devido > 0)) { toast('“' + c.name + '” não tem fatura em aberto.'); return; }
            const ok = await cvConfirm({ titulo: 'Pagar a fatura?', mensagem: 'Confirmar o pagamento da fatura de “' + c.name + '” (' + money(devido) + ')?', okLabel: 'Confirmar pagamento', danger: false, icon: 'fa-credit-card' });
            if (!ok) return;
            /* a baixa cai no mês da fatura paga (calendário em outro mês = mês do plano) */
            const ref = refBase();
            const refMes = ref.getFullYear() * 12 + ref.getMonth();
            const hojeMes = new Date().getFullYear() * 12 + new Date().getMonth();
            const dataPg = (refMes === hojeMes)
                ? toIso(new Date())
                : ref.getFullYear() + '-' + pad2(ref.getMonth() + 1) + '-' + pad2(Math.max(1, Math.min(28, Number(c.dueDay) || 1)));
            c.fatura = round2(Math.max(0, aberta - devido));
            /* histórico de pagamentos (aparece na fatura do cartão) */
            if (!Array.isArray(c.pagamentos)) c.pagamentos = [];
            c.pagamentos.unshift({ id: Date.now(), data: dataPg, valor: devido });
            c.pagamentos = c.pagamentos.slice(0, 60);
            c.ultimaBaixa = dataPg;
            persist();
            renderCards();
            if (typeof buildNotifs === 'function') buildNotifs();
            toast('Fatura de ' + money(devido) + ' paga em “' + c.name + '”.');
        }

        function handleCardSubmit(event){
            event.preventDefault();
            const g = id => document.getElementById(id);
            const name = (g('cardName').value || '').trim();
            const brand = g('cardBrand').value;
            const last4 = (g('cardLast4').value || '').replace(/\D/g, '').slice(0, 4);
            const limit = parseFloat(g('cardLimit').value);
            const fatura = parseFloat(g('cardFatura').value);
            const closeDay = parseInt(g('cardClose').value, 10);
            const dueDay = parseInt(g('cardDue').value, 10);

            if (name.length < 2) { showCardError('Dê um apelido para o cartão (ex.: Nubank).'); g('cardName').focus(); return; }
            if (isNaN(limit) || limit < 0) { showCardError('Informe o limite do cartão.'); g('cardLimit').focus(); return; }
            if (isNaN(fatura) || fatura < 0) { showCardError('Informe a fatura atual (use 0 se não houver).'); g('cardFatura').focus(); return; }
            if (fatura > 0 && limit > 0 && fatura > limit) { showCardError('A fatura não pode ser maior que o limite.'); g('cardFatura').focus(); return; }
            if (isNaN(closeDay) || closeDay < 1 || closeDay > 28 || isNaN(dueDay) || dueDay < 1 || dueDay > 28) { showCardError('Os dias de fechamento e vencimento vão de 1 a 28.'); return; }
            /* limite do plano Grátis na criação */
            if (!cardEditId && typeof cvGate === 'function' && !cvGate('cartoes')) return;

            const data = { name: name, brand: brand, last4: last4 || '0000', limit: round2(limit), fatura: round2(fatura), closeDay: closeDay, dueDay: dueDay };
            const cor = (cardColorSel && cardColorSel[0]) ? cardColorSel : cardColorGet();
            data.g1 = cor[0];
            data.g2 = cor[1];
            if (cardEditId) {
                Object.assign(cardById(cardEditId), data);
                toast('Cartão atualizado.');
            } else {
                cards.push(Object.assign({ id: cardSeq++ }, data));
                toast('Cartão “' + name + '” adicionado.');
            }
            persist();
            renderCards();
            closeCardModal();
        }
