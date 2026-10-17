/* Extraído de index.html — scripts clássicos, carregados na ordem abaixo. */
        /* ==========================================================================
           CALENDÁRIO DE DATAS (substitui os filtros 7D / 1M / 6M / 1Y)
           ========================================================================== */
        const CAL_MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
        const CAL_MONTHS_FULL = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
        const CAL_WEEKDAYS = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];

        let calView = new Date();          // primeiro dia do mês exibido
        calView.setDate(1);
        /* abre no dia de hoje: o painel (cartões, gráficos, extrato e parcelas)
           conta a partir do calendário "Data das movimentações" */
        let selectedDate = toIso(new Date());   // 'YYYY-MM-DD' ou null ("todas as datas")
        let calYearOpen = false;           // grade de ANOS aberta no lugar dos dias

        function pad2(n){ return String(n).padStart(2, '0'); }
        function toIso(d){ return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
        function isoToDate(iso){ const p = String(iso).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }

        /* data de referência do painel, das faturas e das parcelas:
           o dia escolhido no calendário "Data das movimentações" (sem data = hoje) */
        function dataReferencia(){
            if (typeof selectedDate !== 'undefined' && selectedDate){
                const d = isoToDate(selectedDate);
                if (!isNaN(d.getTime())) return d;
            }
            return new Date();
        }

        /* ano de referência do painel = ano do dia escolhido no calendário */
        function anoReferencia(){
            try { return dataReferencia().getFullYear(); } catch (e) { return new Date().getFullYear(); }
        }

        /* a movimentação cai no mês (0-11) do ANO de referência?
           sem data conhecida, vale a comparação pelo nome do mês (dados antigos) */
        function txNoMesAnoRef(t, m){
            if (m == null || m < 0) return true;
            const iso = typeof txIso === 'function' ? txIso(t) : null;
            if (!iso){
                const lbl = (typeof txMonthLabel === 'function') ? txMonthLabel(t) : t.month;
                return lbl === (typeof monthsLabels !== 'undefined' ? monthsLabels[m] : '');
            }
            const mm = parseInt(iso.slice(5, 7), 10) - 1;
            if (mm !== m) return false;
            return parseInt(iso.slice(0, 4), 10) === anoReferencia();
        }

        // Data de uma movimentação no padrão YYYY-MM-DD (também entende dados antigos)
        function txIso(t){
            if (t.iso) return t.iso;
            if (t.date === 'Hoje') return toIso(new Date());
            const m = /^(\d{1,2})\s+([A-Za-z]{3})$/.exec(String(t.date || '').trim());
            if (!m) return null;
            const mi = CAL_MONTHS_SHORT.findIndex(x => x.toLowerCase() === m[2].toLowerCase());
            if (mi < 0) return null;
            const day = parseInt(m[1], 10);
            const now = new Date();
            const probe = new Date(now.getFullYear(), mi, day);
            const year = probe > now ? now.getFullYear() - 1 : now.getFullYear();
            return year + '-' + pad2(mi + 1) + '-' + pad2(day);
        }

        function txDateSet(){
            const s = new Set();
            transactions.forEach(t => { const iso = txIso(t); if (iso) s.add(iso); });
            return s;
        }

        function calLongDate(iso){
            const d = isoToDate(iso);
            return CAL_WEEKDAYS[d.getDay()] + ', ' + d.getDate() + ' de ' + CAL_MONTHS_FULL[d.getMonth()] + ' de ' + d.getFullYear();
        }
        function calShortDate(iso){
            const d = isoToDate(iso);
            return pad2(d.getDate()) + ' ' + CAL_MONTHS_SHORT[d.getMonth()] + ' ' + d.getFullYear();
        }

        function renderCalendar(){
            const grid = document.getElementById('calGrid');
            if (!grid) return;
            const title = document.getElementById('calMonthLabel');
            if (title) {
                /* mês sozinho em cima, ano embaixo — dá para trocar os dois */
                title.textContent = CAL_MONTHS_FULL[calView.getMonth()].replace(/^./, c => c.toUpperCase());
            }
            const yearEl = document.getElementById('calYearLabel');
            if (yearEl) yearEl.innerHTML = calView.getFullYear() + '<i class="fa-solid fa-caret-down"></i>';
            const week = document.querySelector('#calPopover .cv-cal-week');
            if (week) week.classList.toggle('hidden', calYearOpen);

            if (calYearOpen) {
                grid.className = 'cv-cal-grid cv-cal-years';
                grid.innerHTML = calYearsHtml();
                updateCalFooter();
                return;
            }
            grid.className = 'cv-cal-grid';

            const todayIso = toIso(new Date());
            const start = new Date(calView.getFullYear(), calView.getMonth(), 1).getDay(); // 0 = domingo
            const daysInMonth = new Date(calView.getFullYear(), calView.getMonth() + 1, 0).getDate();
            const marked = txDateSet();

            let html = '';
            for (let i = 0; i < start; i++) html += '<span class="cv-cal-day muted"></span>';
            for (let day = 1; day <= daysInMonth; day++) {
                const iso = calView.getFullYear() + '-' + pad2(calView.getMonth() + 1) + '-' + pad2(day);
                const cls = ['cv-cal-day'];
                if (iso === todayIso) cls.push('today');
                if (iso === selectedDate) cls.push('selected');
                html += '<button type="button" class="' + cls.join(' ') + '" onclick="calPick(\'' + iso + '\')" aria-label="' + calLongDate(iso) + '">' +
                        day + (marked.has(iso) ? '<span class="dot"></span>' : '') + '</button>';
            }
            grid.innerHTML = html;
            updateCalFooter();
        }

        /* situação das faturas do mês/ano exibido: muda junto quando o usuário
           navega o calendário (setas do mês, seletor de ano) */
        function calFaturasTexto(){
            try {
                if (typeof cards === 'undefined' || !Array.isArray(cards) || !cards.length) return '';
                const y = calView.getFullYear();
                const m = calView.getMonth();
                const anoAtual = new Date().getFullYear();
                const partes = cards.slice(0, 3).map(function (c) {
                    const dia = Math.max(1, Math.min(28, Number(c.dueDay) || 1));
                    const nome = String(c.name || 'Cartão');
                    const safe = (typeof escapeHtml === 'function') ? escapeHtml(nome) : nome;
                    /* fatura do mês exibido: sem parcela/compra = "sem fatura" */
                    let v = 0;
                    try {
                        if (typeof faturaDoMesAbs === 'function') v = faturaDoMesAbs(c, y * 12 + m, new Date(y, m, 1));
                    } catch (e) { v = 0; }
                    if (!(v > 0)) return safe + ' sem fatura';
                    return safe + ' vence ' + pad2(dia) + '/' + pad2(m + 1) + (y !== anoAtual ? '/' + y : '');
                });
                if (cards.length > 3) partes.push('+' + (cards.length - 3));
                return 'Faturas: ' + partes.join(' · ');
            } catch (e) { return ''; }
        }

        function updateCalFooter(){
            const foot = document.getElementById('calSelectedText');
            if (foot) {
                const fat = calYearOpen ? '' : calFaturasTexto();
                const cola = fat ? '<span class="cv-cal-fat">' + fat + '</span>' : '';
                if (calYearOpen) {
                    foot.innerHTML = '<b>Escolha o ano de ' + calView.getFullYear() + '</b>Clique num ano para voltar aos dias do mês';
                } else if (selectedDate) {
                    const d = isoToDate(selectedDate);
                    const prefix = selectedDate.slice(0, 7);
                    /* a data escolhida vale como MÊS: o painel conta o mês inteiro */
                    const count = transactions.filter(t => { const i = txIso(t); return !!i && i.slice(0, 7) === prefix; }).length;
                    foot.innerHTML = '<b>' + calLongDate(selectedDate) + '</b>' +
                        count + ' movimentação(ões) em ' + CAL_MONTHS_FULL[d.getMonth()] + ' de ' + d.getFullYear() + cola;
                } else {
                    foot.innerHTML = '<b>Nenhuma data selecionada</b>Mostrando todas as movimentações' + cola;
                }
            }
            const btn = document.getElementById('calBtnValue');
            if (btn) btn.textContent = selectedDate ? calShortDate(selectedDate) : 'Todas as datas';
            /* setas do DIA: mostram o dia escolhido mesmo com a grade fechada */
            const dia = document.getElementById('calDayValue');
            if (dia){
                if (selectedDate){
                    const dd = isoToDate(selectedDate);
                    dia.textContent = CAL_WEEKDAYS[dd.getDay()] + ', ' + pad2(dd.getDate());
                    dia.title = calLongDate(selectedDate);
                } else {
                    dia.textContent = 'Escolha um dia';
                    dia.title = 'Use as setas do dia ou abra o calendário';
                }
            }
        }

        function toggleCalendar(){
            const box = document.getElementById('calPopover');
            const btn = document.getElementById('calToggleBtn');
            if (!box) return;
            const opening = box.classList.contains('hidden');
            box.classList.toggle('hidden');
            if (btn) btn.setAttribute('aria-expanded', opening ? 'true' : 'false');
            if (opening) { calYearOpen = false; renderCalendar(); }
        }

        function closeCalendar(){
            const box = document.getElementById('calPopover');
            if (!box || box.classList.contains('hidden')) return;
            box.classList.add('hidden');
            const btn = document.getElementById('calToggleBtn');
            if (btn) btn.setAttribute('aria-expanded', 'false');
        }

        function calStep(delta){
            calView = new Date(calView.getFullYear(), calView.getMonth() + delta, 1);
            renderCalendar();
        }

        /* --- setas FORA da grade: andam no MÊS e no DIA sem abrir o calendário --- */
        function calNavMonth(delta){
            const base = selectedDate ? isoToDate(selectedDate) : new Date();
            const alvo = new Date(base.getFullYear(), base.getMonth() + delta, 1);
            const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
            calView = new Date(alvo.getFullYear(), alvo.getMonth(), 1);
            applyCalDate(alvo.getFullYear() + '-' + pad2(alvo.getMonth() + 1) + '-' + pad2(Math.min(base.getDate(), ultimo)));
        }
        function calNavDay(delta){
            const base = selectedDate ? isoToDate(selectedDate) : new Date();
            const alvo = new Date(base.getFullYear(), base.getMonth(), base.getDate() + delta);
            calView = new Date(alvo.getFullYear(), alvo.getMonth(), 1);
            applyCalDate(toIso(alvo));
        }

        /* --- o calendário também anda no ANO (e deixa escolher) --- */
        function calYearStep(delta){
            calView = new Date(calView.getFullYear() + delta, calView.getMonth(), 1);
            renderCalendar();
        }
        function calToggleYears(){
            calYearOpen = !calYearOpen;
            renderCalendar();
        }
        function calSetYear(yy){
            calView = new Date(yy, calView.getMonth(), 1);
            calYearOpen = false;
            renderCalendar();
        }
        function calYearsHtml(){
            const y = calView.getFullYear();
            let html = '';
            for (let i = -5; i <= 6; i++) {
                const yy = y + i;
                html += '<button type="button" class="cv-cal-day year' + (yy === y ? ' on' : '') + '" onclick="calSetYear(' + yy + ')" aria-label="Ano ' + yy + '">' + yy + '</button>';
            }
            return html;
        }

        function calPick(iso){ applyCalDate(selectedDate === iso ? null : iso); }

        function calSelectToday(){
            const now = new Date();
            calView = new Date(now.getFullYear(), now.getMonth(), 1);
            calYearOpen = false;
            applyCalDate(toIso(now));
        }

        function calClear(){ applyCalDate(null); }

        /* o calendário acompanha o mês focado do painel:
           sem mês focado = "todas as datas" (conta tudo) */
        function syncCalendarToMonth(){
            if (typeof selectedMonthIndex === 'undefined') return;
            if (selectedMonthIndex < 0){
                selectedDate = null;
            } else {
                const ref = selectedDate ? isoToDate(selectedDate) : new Date();
                const y = ref.getFullYear();
                const ultimo = new Date(y, selectedMonthIndex + 1, 0).getDate();
                selectedDate = y + '-' + pad2(selectedMonthIndex + 1) + '-' + pad2(Math.min(ref.getDate(), ultimo));
                calView = new Date(y, selectedMonthIndex, 1);
            }
            if (document.getElementById('calGrid')) renderCalendar();
        }

        function applyCalDate(iso){
            selectedDate = iso;
            /* a data escolhida define o mês do painel; "Limpar" volta a contar todos os meses */
            const idx = iso ? monthsLabels.indexOf(CAL_MONTHS_SHORT[isoToDate(iso).getMonth()]) : -1;
            if (typeof selectMonth === 'function'){
                selectMonth(idx);   /* recalcula cartões, gráficos, taxa, extrato e parcelas */
            } else {
                if (document.getElementById('calGrid')) renderCalendar();
                applyFilters();
                updateFilterBadge();
            }
        }

        function updateFilterBadge(){
            const el = document.getElementById('transactionFilterBadge');
            if (!el) return;
            const parts = [];
            if (selectedMonthIndex >= 0) parts.push('Mês: ' + (mesFocadoCur() || '—'));
            if (selectedCategoryFilter) parts.push('Categoria: ' + selectedCategoryFilter);
            if (selectedDate) parts.push('Data: ' + calLongDate(selectedDate));
            el.innerText = parts.length ? 'Filtrado por ' + parts.join(' · ') : 'Exibindo todas as movimentações';
        }

        function setActiveNav(element, section) {
            // Configurações abre o painel da conta (não troca de seção)
            if (section === 'config') {
                openSettings();
                return false;
            }
            // Planos abre o modal de assinatura (não troca de seção)
            if (section === 'planos') {
                if (typeof cvAbrirPlanos === 'function') cvAbrirPlanos();
                return false;
            }

            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.mobile-nav-item').forEach(el => el.classList.remove('active'));
            document.querySelectorAll(`[data-section="${section}"]`).forEach(el => el.classList.add('active'));

            const targets = {
                dashboard: 'secDashboard',
                movimentacoes: 'secMovimentacoes',
                cartoes: 'secCartoes',
                contas: 'secContas',
                cofrinho: 'secCofrinho',
                metas: 'secMetas',
                relatorios: 'secRelatorios',
                zap: 'secZap'
            };
            const target = document.getElementById(targets[section]);
            if (target) target.scrollIntoView({behavior: 'smooth', block: 'start'});
            return false;
        }
