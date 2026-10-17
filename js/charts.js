/* Extraído de index.html — scripts clássicos, carregados na ordem abaixo. */
        window.onload = function() {
            recomputeChartTotals(); // gráficos nascem com os totais reais (inicialmente zerados)
            initBarChart();
            initExpChart();
            selectMonth(selectedMonthIndex);
            renderCategoryLegends();
            applyFilters();
            updateSummaryCards();
            if (document.getElementById('calGrid')) renderCalendar();
            applyAvatar();
            applyModeUI();      // botão/seção do modo claro-escuro
            applyChartTheme();  // eixos e dicas dos gráficos acompanham o modo
            refreshExpChartColors();
            if (typeof renderAnalysis === 'function') renderAnalysis(); // item 4
        };

                /* rótulo com o valor no topo de cada barra */
        const valorNoTopo = {
            id: 'valorNoTopo',
            afterDatasetsDraw: function(chart){
                const meta = chart.getDatasetMeta(0);
                if (!meta || !meta.data || !meta.data.length) return;
                const ctx = chart.ctx;
                ctx.save();
                if (isPrivacyHidden) { ctx.restore(); return; } /* valores ocultos pelo olho da privacidade */
                ctx.font = '700 12px Inter, sans-serif';
                ctx.textAlign = 'center';
                chart.data.datasets[0].data.forEach(function(v, i){
                    const bar = meta.data[i];
                    if (!bar) return;
                    const val = Number(v) || 0;
                    const neg = val < 0;
                    ctx.fillStyle = isPrivacyHidden ? '#6F807C' : (neg ? chartLabelColor(1) : chartLabelColor(i));
                    ctx.textBaseline = neg ? 'top' : 'bottom';
                    ctx.fillText(money(val), bar.x, neg ? bar.y + 8 : bar.y - 8);
                });
                ctx.restore();
            }
        };

        function initBarChart() {
            const canvas = document.getElementById('monthlyBarChart');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            barChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Receitas', 'Despesas', 'Saldo'],
                    datasets: [{
                        label: 'Valor no mês',
                        data: [0, 0, 0],
                        backgroundColor: ['rgba(48,160,128,0.85)', 'rgba(247,128,110,0.85)', 'rgba(128,112,240,0.85)'],
                        borderColor: ['#30A080', '#F7806E', '#8070F0'],
                        borderWidth: 1.5,
                        borderRadius: 12,
                        borderSkipped: false,
                        maxBarThickness: 120,
                        hoverBackgroundColor: ['#40C8A0', '#FFB4A8', '#A090FF']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 700, easing: 'easeOutQuart' },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: '#203030',
                            titleColor: '#F5F7F6',
                            bodyColor: '#70E0C0',
                            borderColor: 'rgba(255,255,255,0.1)',
                            borderWidth: 1,
                            padding: 12,
                            displayColors: false,
                            callbacks: {
                                label: function(context){
                                    return isPrivacyHidden ? ' •••••••' : ' ' + money(Number(context.raw) || 0);
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { color: '#A8B5B2', font: { family: 'Inter', size: 13, weight: '600' } }
                        },
                        y: {
                            grid: { color: 'rgba(255, 255, 255, 0.04)' },
                            ticks: {
                                color: '#6F807C',
                                font: { family: 'Inter', size: 11 },
                                callback: function(value){ return 'R$ ' + (Number(value) || 0).toLocaleString('pt-BR'); }
                            }
                        }
                    }
                },
                plugins: [valorNoTopo]
            });
        }

        /* barras Receitas / Despesas / Saldo do mês focado (atualizam sozinhas) */
        function updateVisaoChart(){
            const sub = document.getElementById('visaoSubtitle');
            if (sub) {
                sub.textContent = (selectedMonthIndex < 0)
                    ? ('Receitas, despesas e saldo em ' + new Date().getFullYear() + ' · todos os meses')
                    : ('Receitas, despesas e saldo em ' + mesNomeCompleto(selectedMonthIndex) + ' de ' + new Date().getFullYear());
            }
            if (!barChartInstance) return;
            const tot = totaisDoMesFoco();
            barChartInstance.data.datasets[0].data = [round2(tot.inc), round2(tot.out), round2(tot.inc - tot.out)];
            barChartInstance.update();
        }

        /* ===================== GASTOS/DESPESAS POR MÊS (COLUNAS) ===================== */
        function expBarColors(){
            const light = document.documentElement.getAttribute('data-mode') === 'light';
            return monthsLabels.map((_, i) => i === selectedMonthIndex
                ? (light ? '#F0705C' : '#FFB4A8')
                : (light ? 'rgba(226, 84, 63, 0.55)' : 'rgba(247, 128, 110, 0.55)'));
        }
        function expBarBorders(){
            const light = document.documentElement.getAttribute('data-mode') === 'light';
            return monthsLabels.map((_, i) => i === selectedMonthIndex
                ? (light ? '#E2543F' : '#FFE4DD')
                : (light ? '#E2543F' : '#F7806E'));
        }
        /* cores das colunas de ENTRADA (Receitas) — mesmas séries do gráfico anual */
        function incBarColors(){
            const light = document.documentElement.getAttribute('data-mode') === 'light';
            return monthsLabels.map((_, i) => i === selectedMonthIndex
                ? (light ? '#0F8C7E' : '#70E0C0')
                : (light ? 'rgba(11, 122, 98, 0.55)' : 'rgba(64, 200, 160, 0.55)'));
        }
        function incBarBorders(){
            const light = document.documentElement.getAttribute('data-mode') === 'light';
            return monthsLabels.map((_, i) => i === selectedMonthIndex
                ? (light ? '#0B7A62' : '#B9F5E4')
                : (light ? '#0B7A62' : '#40C8A0'));
        }
        function refreshExpChartColors(){
            if (!expChartInstance) return;
            const ds = expChartInstance.data.datasets;
            if (ds[0]) { ds[0].backgroundColor = incBarColors(); ds[0].borderColor = incBarBorders(); }
            if (ds[1]) { ds[1].backgroundColor = expBarColors(); ds[1].borderColor = expBarBorders(); }
            expChartInstance.update();
        }

        /* Cores de rótulo/valor do gráfico do mês conforme o modo claro/escuro */
        function chartLabelColor(i){
            const light = document.documentElement.getAttribute('data-mode') === 'light';
            if (i === 0) return light ? '#0B7A62' : '#70E0C0';
            if (i === 1) return light ? '#D2452E' : '#FFB4A8';
            return light ? '#6247D9' : '#A090FF';
        }

        /* Ajusta eixos, grade e dicas dos gráficos ao modo claro/escuro */
        function applyChartTheme(){
            const light = document.documentElement.getAttribute('data-mode') === 'light';
            const grid   = light ? 'rgba(11,18,17,.08)'   : 'rgba(255,255,255,0.04)';
            const tickX  = light ? '#46554F'              : '#A8B5B2';
            const tickY  = light ? '#61716D'              : '#6F807C';
            const tipBg  = light ? '#FFFFFF'              : '#203030';
            const tipTtl = light ? '#0B1211'              : '#F5F7F6';
            const tipBrd = light ? 'rgba(11,18,17,.12)'   : 'rgba(255,255,255,0.1)';
            const tipBodyMain = light ? '#0B7A62'         : '#70E0C0';
            const tipBodyExp  = light ? '#D2452E'         : '#FFB4A8';

            if (barChartInstance && barChartInstance.options) {
                const o = barChartInstance.options;
                o.plugins.tooltip.backgroundColor = tipBg;
                o.plugins.tooltip.titleColor = tipTtl;
                o.plugins.tooltip.bodyColor = tipBodyMain;
                o.plugins.tooltip.borderColor = tipBrd;
                o.scales.x.ticks.color = tickX;
                o.scales.y.ticks.color = tickY;
                o.scales.y.grid.color = grid;
                barChartInstance.update('none');
            }
            if (expChartInstance && expChartInstance.options) {
                const o = expChartInstance.options;
                o.plugins.tooltip.backgroundColor = tipBg;
                o.plugins.tooltip.titleColor = tipTtl;
                o.plugins.tooltip.bodyColor = tipBodyExp;
                o.plugins.tooltip.borderColor = tipBrd;
                o.scales.x.ticks.color = tickX;
                o.scales.y.ticks.color = tickY;
                o.scales.y.grid.color = grid;
                expChartInstance.update('none');
            }
        }

        function initExpChart() {
            const canvas = document.getElementById('expenseBarChart');
            if (!canvas) return;
            expChartInstance = new Chart(canvas.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: monthsLabels,
                    datasets: [{
                        label: 'Receitas (R$)',
                        data: monthlyData,
                        backgroundColor: incBarColors(),
                        borderColor: incBarBorders(),
                        borderWidth: 1.5,
                        borderRadius: 12,
                        borderSkipped: false,
                        hoverBackgroundColor: '#B9F5E4'
                    }, {
                        label: 'Despesas (R$)',
                        data: monthlyOutData,
                        backgroundColor: expBarColors(),
                        borderColor: expBarBorders(),
                        borderWidth: 1.5,
                        borderRadius: 12,
                        borderSkipped: false,
                        hoverBackgroundColor: '#FFE4DD'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: '#203030',
                            titleColor: '#F5F7F6',
                            bodyColor: '#FFB4A8',
                            borderColor: 'rgba(255,255,255,0.1)',
                            borderWidth: 1,
                            padding: 12,
                            displayColors: false,
                            callbacks: {
                                label: function (context) {
                                    const nome = String(context.dataset.label || '').replace(' (R$)', '');
                                    if (isPrivacyHidden) return ' ' + nome + ': •••••••';
                                    const v = Number(context.raw || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2});
                                    return ' ' + nome + ': R$ ' + v;
                                },
                                labelTextColor: function (context) {
                                    const light = document.documentElement.getAttribute('data-mode') === 'light';
                                    if (context.datasetIndex === 0) return light ? '#0B7A62' : '#70E0C0';
                                    return light ? '#D2452E' : '#FFB4A8';
                                }
                            }
                        }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { color: '#A8B5B2', font: { family: 'Inter', size: 11 } } },
                        y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(255, 255, 255, 0.04)' },
                            ticks: {
                                color: '#6F807C',
                                font: { family: 'Inter', size: 11 },
                                callback: function (value) {
                                    const v = Math.abs(Number(value) || 0);
                                    return 'R$ ' + (v >= 1000 ? (v / 1000).toLocaleString('pt-BR') + 'k' : value);
                                }
                            }
                        }
                    },
                    onClick: (e, elements) => {
                        if (elements.length > 0) selectMonth(elements[0].index);
                    }
                }
            });
        }

        /* rodapé do gráfico + card "Resumo de Gastos" */
        function updateExpSummary(){
            const total = round2(monthlyOutData.reduce((s, v) => s + (Number(v) || 0), 0));
            const max = Math.max.apply(null, monthlyOutData.map(v => Number(v) || 0));
            const worstIdx = max > 0 ? monthlyOutData.indexOf(max) : -1;
            const cur = (selectedMonthIndex >= 0 && monthsLabels[selectedMonthIndex]) ? monthsLabels[selectedMonthIndex] : 'Todos os meses';
            const focused = round2(selectedMonthIndex < 0 ? total : (monthlyOutData[selectedMonthIndex] || 0));

            const totEl = document.getElementById('expTotalYear');
            if (totEl) {
                totEl.dataset.value = total;
                if (!isPrivacyHidden) totEl.innerText = money(total);
                else totEl.innerText = '••••••••';
            }
            const worstEl = document.getElementById('expWorstMonth');
            if (worstEl) worstEl.innerText = worstIdx > -1 ? monthsLabels[worstIdx] : '—';
            const focEl = document.getElementById('expFocusedMonth');
            if (focEl) focEl.innerText = cur ? cur : '—';

            const temReceita = monthlyData.some(v => Number(v) > 0);
            const empty = document.getElementById('expChartEmpty');
            if (empty) empty.classList.toggle('hidden', total > 0 || temReceita);

            const incYear = round2(monthlyData.reduce((s, v) => s + (Number(v) || 0), 0));
            const incYearEl = document.getElementById('expIncomeYear');
            if (incYearEl) {
                incYearEl.dataset.value = incYear;
                incYearEl.innerText = !isPrivacyHidden ? money(incYear) : '••••••••';
            }

            const box = document.getElementById('expSummary');
            if (!box) return;
            if (total <= 0) {
                box.innerHTML =
                    '<div class="text-center py-7">' +
                    '<i class="fa-solid fa-chart-column text-2xl text-[#F7806E]/70"></i>' +
                    '<p class="text-sm text-[#A8B5B2] mt-2 font-semibold">Sem gastos lançados</p>' +
                    '<p class="text-[11px] text-[#6F807C] mt-1">Registre uma saída em <b>Nova Transação</b> e o resumo aparece aqui.</p>' +
                    '</div>';
                return;
            }
            const mesesComGasto = monthlyOutData.filter(v => v > 0).length;
            const media = round2(total / Math.max(1, mesesComGasto));
            const hidden = !!isPrivacyHidden;
            const row = (icon, color, label, raw) =>
                '<div class="flex items-center justify-between gap-3 bg-[#102020] border border-white/5 rounded-xl px-3.5 py-3">' +
                '<span class="text-xs text-[#A8B5B2] flex items-center gap-2 min-w-0"><i class="fa-solid ' + icon + ' ' + color + '"></i> ' + label + '</span>' +
                '<strong class="text-sm text-white font-mono shrink-0 confidential-value' + (hidden ? ' value-hidden' : '') + '" data-value="' + raw + '">' +
                (hidden ? '••••••••' : money(raw)) + '</strong>' +
                '</div>';
            box.innerHTML =
                row('fa-wallet', 'text-[#F7806E]', 'Total no ano', total) +
                row('fa-chart-line', 'text-[#70E0C0]', 'Média por mês <span class="text-[10px] text-[#6F807C]">(' + mesesComGasto + ' ' + (mesesComGasto === 1 ? 'mês' : 'meses') + ')</span>', media) +
                row('fa-triangle-exclamation', 'text-[#FFD166]', 'Mês mais caro <b class="text-[#FFB4A8]">' + monthsLabels[worstIdx] + '</b>', max) +
                row('fa-calendar-day', 'text-[#A090FF]', 'Mês focado <b class="text-[#A090FF]">' + cur + '</b>', focused);
        }

        
