/* Extraído de index.html — scripts clássicos, carregados na ordem abaixo. */
        /* ==========================================================================
           NOTIFICAÇÕES (geradas a partir dos dados reais do usuário)
           ========================================================================== */
        let notifItems = [];
        const notifReadIds = new Set();

        function toggleNotifications() {
            const box = document.getElementById('notifDropdown');
            const opening = box.classList.contains('hidden');
            box.classList.toggle('hidden');
            if (opening) renderNotifs();
        }

        function pushNotif(n) {
            if (notifItems.some(x => x.id === n.id)) notifItems = notifItems.filter(x => x.id !== n.id);
            notifItems.unshift(n);
            renderNotifs();
        }

        function buildNotifs() {
            const list = [];
            const name = (document.getElementById('userNameDisplay') || {}).textContent || 'Cliente';

            goals.forEach(g => {
                if (!g.target) return;
                if (goalDone(g)) list.push({ id: 'goal-' + g.id, icon: 'fa-trophy', title: 'Meta atingida', text: 'Você concluiu “' + g.name + '” — ' + money(g.current) + '. Parabéns!' });
                else list.push({ id: 'goalp-' + g.id, icon: 'fa-bullseye', title: g.name, text: Math.round(goalPct(g)) + '% do objetivo. Faltam ' + money(g.target - g.current) + '.' });
            });

            budgets.forEach(b => {
                /* limite é mensal: mede o mês focado, igual aos demais painéis */
                const spent = transactions.filter(t => t.cat === b.name && t.amount < 0 && txNoMesFoco(t)).reduce((s, t) => s + Math.abs(t.amount), 0);
                const pct = b.limit ? Math.min(999, Math.round(spent / b.limit * 100)) : 0;
                if (pct >= 90) list.push({ id: 'bud-' + b.name, icon: 'fa-triangle-exclamation', title: 'Atenção: ' + b.name, text: 'Você já usou ' + pct + '% do limite de ' + money(b.limit) + '.' });
                else list.push({ id: 'bud-' + b.name, icon: 'fa-wallet', title: 'Orçamento: ' + b.name, text: money(spent) + ' de ' + money(b.limit) + ' usados (' + pct + '%).' });
            });

            const last = transactions[0];
            if (last) list.push({ id: 'tx-' + last.id, icon: last.amount > 0 ? 'fa-arrow-trend-up' : 'fa-receipt', title: last.amount > 0 ? 'Entrada registrada' : 'Gasto recente', text: last.desc + ' — ' + money(Math.abs(last.amount)) + ' em ' + last.date + '.' });

            cards.forEach(c => {
                const limit = Number(c.limit) || 0, fatura = Math.max(0, round2((typeof faturaNoMes === 'function') ? faturaNoMes(c) : (Number(c.fatura) || 0)));
                if (fatura > 0) {
                    const di = (typeof dueInfo === 'function') ? dueInfo(c) : null;
                    const quando = di ? (di.days <= 0 ? 'vence hoje' : (di.days === 1 ? 'vence amanhã' : 'vence em ' + di.days + ' dias')) : ('vence no dia ' + c.dueDay);
                    list.push({ id: 'card-' + c.id, icon: 'fa-credit-card', urgent: !!(di && di.urgent), title: 'Fatura de ' + c.name, text: money(fatura) + ' ' + quando + ' (dia ' + (c.dueDay || 1) + ', ' + (di ? di.data : '') + ') · disponível ' + money(limit - fatura) + '.' });
                }
                else list.push({ id: 'card-' + c.id, icon: 'fa-credit-card', title: c.name, text: 'Sem fatura em aberto · limite disponível de ' + money(limit) + '.' });
            });

            list.push({ id: 'cofrinho', icon: 'fa-piggy-bank', title: 'Cofrinho rendendo o CDI', text: 'Saldo de ' + money(cofrinho.saldo) + ' rendendo ' + (Number(cofrinho.cdi) || 0).toFixed(2).replace('.', ',') + '% do CDI ao ano.' });

            list.push({ id: 'welcome', icon: 'fa-hand-sparkles', title: 'Olá, ' + name.trim(), text: 'Hoje é ' + new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }) + '. Confira seus painéis.' });

            notifItems = list;
            renderNotifs();
        }

        function renderNotifs() {
            const box = document.getElementById('notifList');
            if (!box) return;

            if (!notifItems.length) {
                box.innerHTML = '<div class="cv-notif-empty"><i class="fa-solid fa-bell-slash"></i>Nenhuma notificação no momento.</div>';
            } else {
                /* escape: title/texto interpolam desc de transação, nomes de meta/cartão — dados do usuário */
                const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
                box.innerHTML = notifItems.map(n => `
                    <div class="cv-notif-item ${notifReadIds.has(n.id) ? '' : 'unread'} ${n.urgent ? 'urgent' : ''}">
                        <div class="cv-notif-icon"><i class="fa-solid ${n.icon}"></i></div>
                        <div class="min-w-0">
                            <p class="text-white font-semibold">${esc(n.title)}</p>
                            <p class="text-[11px] text-[#6F807C] mt-0.5">${esc(n.text)}</p>
                        </div>
                    </div>`).join('');
            }

            const unread = notifItems.filter(n => !notifReadIds.has(n.id)).length;
            const badge = document.getElementById('notifBadge');
            const count = document.getElementById('notifCount');
            if (badge) {
                badge.textContent = unread > 9 ? '9+' : String(unread);
                badge.classList.toggle('hidden', unread === 0);
            }
            if (count) {
                count.textContent = unread === 0 ? 'tudo lido' : unread + (unread === 1 ? ' nova' : ' novas');
            }
        }

        function markAllNotifsRead() {
            notifItems.forEach(n => notifReadIds.add(n.id));
            renderNotifs();
            toast('Notificações marcadas como lidas.');
        }

        function clearNotifs() {
            notifItems = [];
            notifReadIds.clear();
            renderNotifs();
        }
