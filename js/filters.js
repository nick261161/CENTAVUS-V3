/* Extraído de index.html — scripts clássicos, carregados na ordem abaixo. */
        /* ==========================================================================
           CONFIDENTIAL PRIVACY TOGGLE LOGIC
           ========================================================================== */

        function togglePrivacyMode() {
            isPrivacyHidden = !isPrivacyHidden;
            const icon = document.getElementById('privacyEyeIcon');

            if (isPrivacyHidden) {
                icon.className = 'fa-solid fa-eye-slash text-[#8070F0]';
            } else {
                icon.className = 'fa-solid fa-eye';
            }

            // Update all confidential value targets
            document.querySelectorAll('.confidential-value').forEach(el => {
                const rawVal = parseFloat(el.getAttribute('data-value'));
                const originalText = el.getAttribute('data-value');

                if (isPrivacyHidden) {
                    el.classList.add('value-hidden');
                    el.innerText = '••••••••';
                } else {
                    el.classList.remove('value-hidden');
                    if (!isNaN(rawVal)) {
                        el.innerText = `R$ ${rawVal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
                    } else {
                        el.innerText = originalText;
                    }
                }
            });

            if (barChartInstance) barChartInstance.update();
            if (donutChartInstance) donutChartInstance.update();
            if (expChartInstance) expChartInstance.update();
            /* a análise (patrimônio, comparativo, projeção) também nasce oculta/visível */
            if (typeof renderAnalysis === 'function') { try { renderAnalysis(); } catch (e) {} }
        }

        /* ==========================================================================
           FILTER & TABLE RENDERING ENGINE
           ========================================================================== */

        /* TOP GASTOS — ranking das maiores categorias do mês (barra de participação) */
        function renderCategoryLegends() {
            const container = document.getElementById('topGastosContainer');
            if (!container) return;

            const ranking = categoriesData
                .filter(cat => (Number(cat.val) || 0) > 0)
                .sort((a, b) => (Number(b.val) || 0) - (Number(a.val) || 0));
            const total = round2(ranking.reduce((s, cat) => s + (Number(cat.val) || 0), 0));

            if (!ranking.length) {
                container.innerHTML = '<div class="text-center py-8 px-2">' +
                    '<i class="fa-solid fa-arrow-trend-down text-2xl text-[#F7806E]/70"></i>' +
                    '<p class="text-xs text-[#A8B5B2] font-semibold mt-2">Nenhuma despesa neste período</p>' +
                    '<p class="text-[11px] text-[#6F807C] mt-1">Registre uma saída em Nova Transação para ver o ranking de gastos.</p>' +
                    '</div>';
                return;
            }

            container.innerHTML = ranking.map((cat, i) => {
                const val = Number(cat.val) || 0;
                const pct = total > 0 ? (val / total) * 100 : 0;
                const sel = selectedCategoryFilter === cat.name;
                const largura = Math.max(4, pct).toFixed(1);
                return '<button type="button" data-cat="' + escapeHtml(cat.name) + '" onclick="toggleCategoryFilter(this.dataset.cat)" ' +
                    'class="w-full text-left px-2 py-2 rounded-xl transition hover:bg-white/5 ' + (sel ? 'bg-[#204040] ring-1 ring-[#30A080]/40' : '') + '">' +
                        '<div class="flex items-center justify-between gap-2 mb-1.5">' +
                            '<span class="flex items-center gap-2 min-w-0">' +
                                '<span class="text-[10px] font-extrabold text-[#6F807C] w-3 text-center">' + (i + 1) + '</span>' +
                                '<span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:' + cat.color + ';box-shadow:0 0 8px ' + cat.color + '80"></span>' +
                                '<span class="text-xs font-semibold text-[#F5F7F6] truncate">' + escapeHtml(cat.name) + '</span>' +
                            '</span>' +
                            '<span class="text-xs font-bold text-white confidential-value shrink-0" data-value="' + val + '">' + (isPrivacyHidden ? '••••••' : money(val)) + '</span>' +
                        '</div>' +
                        '<div class="h-2 rounded-full bg-white/5 overflow-hidden">' +
                            '<div class="h-full rounded-full transition-all duration-500" style="width:' + largura + '%;background:linear-gradient(90deg,' + cat.color + ',' + cat.color + 'aa)"></div>' +
                        '</div>' +
                        '<div class="flex items-center justify-between mt-1 gap-2">' +
                            '<span class="text-[10px] text-[#6F807C]">' + pct.toFixed(0) + '% do período</span>' +
                            (sel ? '<span class="text-[10px] text-[#70E0C0] font-bold">filtrando o extrato</span>' : '') +
                        '</div>' +
                    '</button>';
            }).join('');
        }

        /* preenche os selects de categoria e cartão sem perder o que já está escolhido */
        function fillFilterSelects() {
            const cat = document.getElementById('filterCatSelect');
            if (cat) {
                const cur = cat.value;
                const cats = [...new Set(transactions.map(t => t.cat).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
                cat.innerHTML = '<option value="">Todas as categorias</option>' +
                    cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
                if (cats.includes(cur)) cat.value = cur;
            }
            const card = document.getElementById('filterCardSelect');
            if (card) {
                const cur = card.value;
                card.innerHTML = '<option value="">Todos os cartões</option>' +
                    cards.map(c => `<option value="c${escapeHtml(String(c.id))}">${escapeHtml(c.name)}</option>`).join('') +
                    '<option value="none">Sem cartão</option>';
                if ([...card.options].some(o => o.value === cur)) card.value = cur;
            }
        }

        function applyFilters() {
            fillFilterSelects();
            const typeFilter = document.getElementById('filterTypeSelect').value;
            const sortFilter = document.getElementById('filterSortSelect').value;
            const catFilter = (document.getElementById('filterCatSelect') || {}).value || '';
            const cardFilter = (document.getElementById('filterCardSelect') || {}).value || '';
            const fromVal = (document.getElementById('filterDateFrom') || {}).value || '';
            const toVal = (document.getElementById('filterDateTo') || {}).value || '';
            const searchEl = document.getElementById('searchInput');
            const searchVal = searchEl ? searchEl.value.trim().toLowerCase() : '';

            let result = [...transactions];

            // 0. Filtro do mês focado (o calendário "Data das movimentações" escolhe esse mês e o ano)
            if (selectedMonthIndex >= 0 && !fromVal && !toVal) {
                result = result.filter(t => txNoMesFoco(t));
            }

            // 1. Category Filter (Top gastos ou select)
            const cat = catFilter || selectedCategoryFilter;
            if (cat) {
                result = result.filter(t => t.cat === cat);
            }

            // 2. Type Filter
            if (typeFilter === 'ENTRADA') {
                result = result.filter(t => t.amount > 0);
            } else if (typeFilter === 'SAIDA') {
                result = result.filter(t => t.amount < 0);
            }

            // 3. Filtro por cartão
            if (cardFilter === 'none') {
                result = result.filter(t => t.cardId == null || t.cardId === '');
            } else if (cardFilter && cardFilter !== 'c' + 'undefined') {
                const wanted = cardFilter.slice(1);
                result = result.filter(t => String(t.cardId) === wanted);
            }

            // 4. Busca por descrição / categoria
            if (searchVal) {
                result = result.filter(t =>
                    (t.desc || '').toLowerCase().includes(searchVal) ||
                    (t.cat || '').toLowerCase().includes(searchVal)
                );
            }

            // 5. Período (de … até), quando usado substitui o filtro de mês
            if (fromVal || toVal) {
                result = result.filter(t => {
                    const iso = txIso(t);
                    if (fromVal && iso < fromVal) return false;
                    if (toVal && iso > toVal) return false;
                    return true;
                });
            }

            // 6. A data do calendário já virou o mês focado (passo 0) — nada a recortar aqui

            // 7. Sorting
            if (sortFilter === 'OLDEST') {
                result.sort((a, b) => a.id - b.id);
            } else if (sortFilter === 'HIGHEST') {
                result.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
            } else if (sortFilter === 'LOWEST') {
                result.sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));
            } else if (sortFilter === 'ALPHA') {
                result.sort((a, b) => String(a.desc || '').localeCompare(String(b.desc || ''), 'pt-BR'));
            } else {
                result.sort((a, b) => b.id - a.id);
            }

            updatePeriodHint(fromVal, toVal);
            renderTableRows(result);
        }

        function updatePeriodHint(fromVal, toVal) {
            const el = document.getElementById('periodHint');
            if (!el) return;
            if (!fromVal && !toVal) { el.textContent = ''; return; }
            const fmt = v => v.split('-').reverse().join('/');
            el.textContent = (!fromVal ? 'início' : fmt(fromVal)) + ' → ' + (!toVal ? 'hoje' : fmt(toVal));
        }

        function renderTableRows(items) {
            const tbody = document.getElementById('transactionsTableBody');
            tbody.innerHTML = '';

            if (items.length === 0) {
                const noData = transactions.length === 0;
                tbody.innerHTML = `
                    <tr>
                        <td colspan="4" class="py-8 text-center text-xs text-[#6F807C]">
                            ${noData
                                ? 'Nenhuma movimentação ainda — clique em <strong class="text-[#70E0C0]">Nova Transação</strong> para começar.'
                                : 'Nenhuma movimentação corresponde aos filtros selecionados.'}
                        </td>
                    </tr>
                `;
                document.getElementById('transactionCountText').innerText = '0 transações';
                return;
            }

            items.forEach(item => {
                const isIncome = item.amount > 0;
                const formattedAmount = isPrivacyHidden ? '••••••••' : `${isIncome ? '+' : ''} R$ ${Math.abs(item.amount).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
                const amountClass = isIncome ? 'text-[#40C8A0] font-bold' : 'text-white font-semibold';

                const acc = (item.accId != null && typeof accountById === 'function') ? accountById(item.accId) : null;

                const tr = document.createElement('tr');
                tr.className = 'hover:bg-white/[0.02] transition';
                tr.innerHTML = `
                    <td class="py-3.5 pr-3">
                        <div class="flex items-center gap-3">
                            <div class="w-9 h-9 rounded-xl flex items-center justify-center text-xs" style="background-color: ${item.color}15; color: ${item.color}">
                                <i class="fa-solid ${item.icon}"></i>
                            </div>
                            <div>
                                <p class="font-semibold text-white text-xs">${escapeHtml(item.desc)}${item.recorrente ? ' <i class="fa-solid fa-rotate text-[9px] text-[#70E0C0]" title="Repete todo mês"></i>' : ''}</p>
                                <span class="text-[10px] text-[#6F807C] font-medium">${escapeHtml(item.cat)}</span>${payBadge(item.pay, item)}${acc ? ` <span class="text-[9px] text-[#6F807C] bg-[#203030] px-1.5 py-0.5 rounded"><i class="fa-solid fa-wallet mr-0.5"></i>${escapeHtml(acc.name)}</span>` : ''}
                            </div>
                        </div>
                    </td>
                    <td class="py-3.5 text-xs text-[#A8B5B2] font-mono">${item.date}</td>
                    <td class="py-3.5 text-right ${amountClass} font-mono confidential-value" data-value="${item.amount}">${formattedAmount}</td>
                    <td class="py-3.5 pl-3 text-right whitespace-nowrap">
                        <div class="inline-flex gap-1.5">
                            <button type="button" class="goal-btn mini" title="Editar movimentação" aria-label="Editar movimentação" onclick="editTransaction(${item.id})"><i class="fa-solid fa-pen"></i></button>
                            <button type="button" class="goal-btn mini danger" title="Excluir movimentação" aria-label="Excluir movimentação" onclick="deleteTransaction(${item.id})"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            document.getElementById('transactionCountText').innerText = `Mostrando ${items.length} movimentação(ões)`;
        }

        function toggleCategoryFilter(catName) {
            if (selectedCategoryFilter === catName) {
                selectedCategoryFilter = null;
            } else {
                selectedCategoryFilter = catName;
            }
            updateFilterBadge();
            renderCategoryLegends();
            applyFilters();
        }

        /* rótulo do mês focado ('' quando "Todos os meses") */
        function mesFocadoCur(){ return (selectedMonthIndex >= 0 && monthsLabels[selectedMonthIndex]) ? monthsLabels[selectedMonthIndex] : ''; }
        /* a movimentação está no mês/ano focado? (em "Todos os meses" sempre vale) */
        function txNoMesFoco(t){
            const m = mesFocadoCur();
            if (!m) return true;
            return txNoMesAnoRef(t, selectedMonthIndex);
        }
        /* entradas/saídas do mês focado (ou o total geral quando é "Todos os meses")
           As entradas já incluem a Renda Fixa (salário) reconhecida como receita */
        function totaisDoMesFoco(){
            if (selectedMonthIndex < 0){
                let inc = 0, out = 0;
                transactions.forEach(t => { const a = Number(t.amount) || 0; if (a > 0) inc += a; else if (a < 0) out += Math.abs(a); });
                inc += rfReceitaTotal().valor;
                return { inc: round2(inc), out: round2(out) };
            }
            return { inc: round2(monthlyData[selectedMonthIndex] || 0), out: round2(monthlyOutData[selectedMonthIndex] || 0) };
        }
        /* preenche o seletor "Mês do painel" (12 meses + Todos os meses) */
        function fillMonthFocusSelect(){
            const sel = document.getElementById('monthFocusSelect');
            const src = document.getElementById('inputMonth');
            if (!sel || !src) return;
            if (!sel.options.length){
                let html = '<option value="-1">Todos os meses</option>';
                for (let i = 0; i < src.options.length; i++){
                    html += '<option value="' + MONTHS_SHORT.indexOf(src.options[i].value) + '">' + src.options[i].text + '</option>';
                }
                sel.innerHTML = html;
            }
            sel.value = String(selectedMonthIndex);
        }

        /* trocar o mês do painel: recalcula tudo o que depende do mês */
        function selectMonth(index) {
            selectedMonthIndex = Number(index);
            if (typeof syncCalendarToMonth === 'function') syncCalendarToMonth(); /* calendário manda */
            fillMonthFocusSelect();
            const cur = mesFocadoCur();
            const rotulo = cur || 'Todos os meses';
            const pt = document.getElementById('chartSelectedPeriodText');
            if (pt) pt.innerHTML = `Mês Focado: <strong class="text-[#8070F0]">${rotulo}</strong>`;
            const cb = document.getElementById('categoryBadgeText');
            if (cb) cb.innerText = cur || 'Todos';

            if (barChartInstance) {
                updateVisaoChart(); /* barras Receitas/Despesas/Saldo do mês */
            }
            refreshExpChartColors();
            updateSummaryCards(); // entradas/saídas + donut do mês
            updateV2();           // saldo, taxa, insights e selos do mês
            applyFilters();       // extrato do mês escolhido no calendário
            updateFilterBadge();
            if (typeof renderCards === 'function') { try { renderCards(); } catch (e) {} } /* vencimento/fatura acompanham a data */
            if (typeof refreshCardInvoiceIfOpen === 'function') { try { refreshCardInvoiceIfOpen(); } catch (e) {} }
            if (typeof renderAnalysis === 'function') { try { renderAnalysis(); } catch (e) {} }
        }

        function resetSelectedMonth() {
            /* "Exibir Histórico Completo" = limpar o calendário e contar todos os meses */
            if (typeof applyCalDate === 'function') applyCalDate(null);
            else selectMonth(-1);
        }

        function resetAllFilters() {
            selectedCategoryFilter = null;
            if (typeof applyCalDate === 'function') applyCalDate(null); /* sem data = todos os meses */
            else { selectedDate = null; selectMonth(-1); }
            const searchEl = document.getElementById('searchInput');
            if (searchEl) searchEl.value = '';
            document.getElementById('filterTypeSelect').value = 'ALL';
            document.getElementById('filterSortSelect').value = 'NEWEST';
            const cat = document.getElementById('filterCatSelect'); if (cat) cat.value = '';
            const card = document.getElementById('filterCardSelect'); if (card) card.value = '';
            const from = document.getElementById('filterDateFrom'); if (from) from.value = '';
            const to = document.getElementById('filterDateTo'); if (to) to.value = '';
            updateFilterBadge();
            renderCategoryLegends();
            applyFilters();
            const top = document.getElementById('secDashboard');
            if (top) top.scrollIntoView({behavior: 'smooth', block: 'start'});
        }

        function handleGlobalSearch() {
            applyFilters();
        }

        function updateSummaryCards() {
            recomputeChartTotals(); // garante que os totais reflitam as transações atuais
            const totalExp = categoriesData.reduce((acc, curr) => acc + curr.val, 0);
            const totalEl = document.getElementById('topGastosTotal');
            if (totalEl) {
                totalEl.setAttribute('data-value', totalExp);
                if (!isPrivacyHidden) totalEl.innerText = money(totalExp);
            }
            /* cartão "Saídas no Mês" segue o mês focado (em "Todos os meses" vira o total) */
            const expMes = (selectedMonthIndex < 0)
                ? transactions.filter(t => (Number(t.amount) || 0) < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
                : transactions.filter(t => (Number(t.amount) || 0) < 0 && txNoMesFoco(t)).reduce((s, t) => s + Math.abs(t.amount), 0);
            document.getElementById('totalExpenseDisplay').setAttribute('data-value', expMes);
            if (!isPrivacyHidden) {
                document.getElementById('totalExpenseDisplay').innerText = money(expMes);
            }
        }

        /* ==========================================================================
           EXPORT & UI MODALS LOGIC
           ========================================================================== */

        function exportToCSV() {
            /* recurso dos planos pagos (Pro/Premium) */
            if (typeof cvGateBool === 'function' && !cvGateBool('exportar')) return;
            /* escape de aspas/quebras de linha + BOM: sem isso o Excel corrompia o arquivo
               (acentos errados e linhas partidas com desc que contenha " ou quebra) */
            const cell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
            let csvContent = "ID,Descricao,Categoria,Forma de pagamento,Parcelas,Total,Cartão,Data,Valor\n";
            transactions.forEach(t => {
                const pay = (PAY_METHODS[t.pay] || {}).label || '';
                const parc = parseInt(t.parcelas, 10) || 1;
                const total = (t.total != null) ? Math.abs(Number(t.total)) : Math.abs(Number(t.amount) || 0);
                csvContent += [cell(t.id), cell(t.desc), cell(t.cat), cell(pay), parc + 'x', total, cell(t.cardNome || ''), cell(t.date), t.amount].join(',') + '\n';
            });

            const encodedUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\ufeff' + csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `centavus_extrato_${Date.now()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        function printReport() {
            /* recurso dos planos pagos (Pro/Premium) */
            if (typeof cvGateBool === 'function' && !cvGateBool('exportar')) return;
            /* layout de relatório premium (escolha "Salvar como PDF" na impressão) */
            if (typeof cvPrintReport === 'function') { cvPrintReport(); return; }
            window.print();
        }

        function toggleExportDropdown() {
            document.getElementById('exportDropdown').classList.toggle('hidden');
        }
