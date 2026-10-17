/* Extraído de index.html — scripts clássicos, carregados na ordem abaixo. */
        function budgetIconOf(name) { return BUDGET_ICONS[name] || 'fa-wallet'; }

        function showBudgetError(msg) {
            const el = document.getElementById('budgetError');
            if (!el) return;
            el.textContent = msg || '';
            el.style.display = msg ? 'block' : 'none';
        }

        function openBudgetModal() {
            const cats = BUDGET_CATS.slice();
            budgets.forEach(b => { if (!cats.includes(b.name)) cats.push(b.name); });
            const sel = document.getElementById('budgetCat');
            sel.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
            if (budgets[0]) sel.value = budgets[0].name;
            document.getElementById('budgetLimit').value = '';
            showBudgetError('');
            renderBudgetList();
            document.getElementById('budgetModal').classList.remove('hidden');
            setTimeout(() => document.getElementById('budgetLimit').focus(), 60);
        }

        function closeBudgetModal() { document.getElementById('budgetModal').classList.add('hidden'); }

        function handleBudgetSubmit(event) {
            event.preventDefault();
            const name = document.getElementById('budgetCat').value;
            /* parseValorBR: Number("1.500") virava 1,5 e gravava limite de R$ 1,50 na surdina */
            const limit = parseValorBR(document.getElementById('budgetLimit').value);
            if (!name) { showBudgetError('Escolha uma categoria.'); return; }
            if (!limit || limit <= 0) { showBudgetError('Informe um limite maior que zero.'); return; }

            const ex = budgets.find(b => b.name === name);
            if (ex) ex.limit = limit; else budgets.push({ name: name, limit: limit, icon: budgetIconOf(name) });

            persist();
            updateV2();
            renderBudgetList();
            document.getElementById('budgetLimit').value = '';
            toast((ex ? 'Limite atualizado: ' : 'Orçamento criado: ') + name + ' — ' + money(limit) + '/mês.');
            pushNotif({ id: 'bud-' + name, icon: 'fa-wallet', title: 'Orçamento: ' + name, text: 'Novo limite de ' + money(limit) + ' por mês.' });
        }

        function pickBudget(name) {
            const sel = document.getElementById('budgetCat');
            if (![...sel.options].some(o => o.value === name)) {
                sel.insertAdjacentHTML('beforeend', `<option value="${name}">${name}</option>`);
            }
            sel.value = name;
            const b = budgets.find(x => x.name === name);
            document.getElementById('budgetLimit').value = b ? b.limit : '';
            showBudgetError('');
            document.getElementById('budgetLimit').focus();
        }

        async function removeBudget(name) {
            const ok = await cvConfirm({ titulo: 'Remover este limite?', mensagem: 'O limite de “' + name + '” será apagado. Suas movimentações continuam intactas.', okLabel: 'Remover' });
            if (!ok) return;
            budgets = budgets.filter(b => b.name !== name);
            persist();
            updateV2();
            renderBudgetList();
            toast('Limite removido: ' + name + '.');
        }

        function renderBudgetList() {
            const el = document.getElementById('budgetList');
            if (!el) return;
            if (!budgets.length) { el.innerHTML = '<div class="cv-notif-empty">Nenhum limite definido ainda.</div>'; return; }

            el.innerHTML = budgets.map(b => {
                /* limite é MENSAL: conta só o mês focado (antes somava todos os tempos
                   e todo orçamento "estourava sozinho" com o tempo) */
                const spent = transactions.filter(t => t.cat === b.name && t.amount < 0 && txNoMesFoco(t)).reduce((s, t) => s + Math.abs(t.amount), 0);
                const pct = b.limit ? Math.min(999, Math.round(spent / b.limit * 100)) : 0;
                return `
                <div class="flex items-center gap-3 p-2.5 rounded-xl bg-[#102020] border border-white/5">
                    <div class="cv-notif-icon"><i class="fa-solid ${b.icon || 'fa-wallet'}"></i></div>
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between text-xs gap-2">
                            <span class="font-semibold text-white truncate">${b.name}</span>
                            <span class="font-mono ${pct >= 90 ? 'text-[#ff8e9b]' : 'text-[#70E0C0]'}">${pct}%</span>
                        </div>
                        <div class="text-[10px] text-[#6F807C] mt-0.5 font-mono">${money(spent)} de ${money(b.limit)}</div>
                    </div>
                    <button type="button" class="goal-btn mini" title="Editar limite" aria-label="Editar limite" data-name="${b.name}" onclick="pickBudget(this.dataset.name)"><i class="fa-solid fa-pen"></i></button>
                    <button type="button" class="goal-btn mini danger" title="Excluir limite" aria-label="Excluir limite" data-name="${b.name}" onclick="removeBudget(this.dataset.name)"><i class="fa-solid fa-trash"></i></button>
                </div>`;
            }).join('');
        }
