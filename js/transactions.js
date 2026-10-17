/* Extraído de index.html — scripts clássicos, carregados na ordem abaixo. */
        /* seletor de ANO da movimentação (permite lançar o plano do ano que vem) */
        function fillYearSelect(iso) {
            const sel = document.getElementById('inputYear');
            if (!sel) return;
            const agora = new Date().getFullYear();
            const alvo = iso ? parseInt(String(iso).slice(0, 4), 10) : agora;
            const anos = [];
            for (let y = agora - 1; y <= agora + 3; y++) anos.push(y);
            if (alvo && anos.indexOf(alvo) < 0) anos.push(alvo);
            anos.sort((a, b) => a - b);
            sel.innerHTML = anos.map(y => '<option value="' + y + '">' + y + '</option>').join('');
            sel.value = String((alvo && anos.indexOf(alvo) >= 0) ? alvo : agora);
        }

        function openModal() {
            /* uma nova transação nunca herda o id de uma edição anterior cancelada */
            const form = document.getElementById('transactionForm');
            if (form) delete form.dataset.editId;
            /* parcelamento volta ao padrão à vista e o cartão é reavaliado */
            const ps = document.getElementById('inputParcelas');
            if (ps) ps.value = '1';
            updatePayFields();
            /* mês de referência abre no mês atual (o form é resetado após salvar) */
            const sel = document.getElementById('inputMonth');
            if (sel) {
                const cur = MONTHS_SHORT[new Date().getMonth()];
                for (let i = 0; i < sel.options.length; i++) {
                    if (sel.options[i].value === cur) { sel.value = cur; break; }
                }
            }
            fillYearSelect();   /* ano de referência também é escolhível (2025–2029) */
            const rec = document.getElementById('inputRecorrente');
            if (rec) rec.checked = false;
            if (typeof fillAccountsSelect === 'function') fillAccountsSelect('');
            document.getElementById('transactionModal').classList.remove('hidden');
        }

        function closeModal() {
            document.getElementById('transactionModal').classList.add('hidden');
        }

        function openGoalModal(goal) {
            const editing = !!goal;
            /* limite do plano Grátis: só na CRIAÇÃO (edita/exclui quem já tem) */
            if (!editing && typeof cvGate === 'function' && !cvGate('metas')) return;
            goalModalMode = editing ? 'edit' : 'create';
            goalEditId = editing ? goal.id : null;
            document.getElementById('goalModalTitle').textContent = editing ? 'Editar Meta' : 'Nova Meta Financeira';
            document.getElementById('goalSubmitBtn').textContent = editing ? 'Salvar alterações' : 'Criar Meta';
            document.getElementById('goalTitle').value = editing ? goal.name : '';
            document.getElementById('goalCurrent').value = editing ? goal.current : '';
            document.getElementById('goalTarget').value = editing ? goal.target : '';
            document.getElementById('goalModal').classList.remove('hidden');
            setTimeout(() => document.getElementById('goalTitle').focus(), 50);
        }

        function closeGoalModal() {
            document.getElementById('goalModal').classList.add('hidden');
        }

        function updateCategoryOptions() {
            const isIncome = document.querySelector('input[name="type"]:checked').value === 'receita';
            const select = document.getElementById('inputCategory');
            const keep = select.value; // preserva a categoria ao reescrever as opções
            if (isIncome) {
                select.innerHTML = `
                    <option value="Receita">Investimentos / Rendimentos</option>
                    <option value="Receita">Salário / Job Freelance</option>
                `;
            } else {
                select.innerHTML = `
                    <option value="Alimentação">Alimentação</option>
                    <option value="Roupas">Roupas</option>
                    <option value="Transporte">Transporte</option>
                    <option value="Lazer">Lazer</option>
                    <option value="Outros">Outros</option>
                `;
            }
            if (Array.prototype.some.call(select.options, o => o.value === keep)) select.value = keep;
        }

        /* formas de pagamento aceitas na Nova Transação */
        const PAY_METHODS = {
            credito:  { label: 'Cartão de crédito', icon: 'fa-credit-card',     color: '#A090FF' },
            debito:   { label: 'Cartão de débito',  icon: 'fa-money-check',     color: '#70E0C0' },
            pix:      { label: 'Pix',               icon: 'fa-bolt',            color: '#40C8A0' },
            dinheiro: { label: 'Dinheiro',          icon: 'fa-money-bill-wave', color: '#FFD166' }
        };
        function payChip(color, icon, text){
            return '<span class="cv-pay-chip inline-flex items-center gap-1 ml-1.5 text-[9px] font-bold px-1.5 py-[1px] rounded-md align-middle" style="--c:' + color + '"><i class="fa-solid ' + icon + '"></i>' + text + '</span>';
        }
        function payBadge(pay, item){
            const m = PAY_METHODS[pay];
            if (!m) return '';
            /* escape: cardNome é nome digitado pelo usuário (vem do cartão) e o chip entra em innerHTML */
            const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
            const nome = (item && item.cardNome) ? ' · ' + esc(item.cardNome) : '';
            let html = payChip(m.color, m.icon, m.label + nome);
            const parc = (item && parseInt(item.parcelas, 10)) || 1;
            if (parc > 1) {
                const total = (item && item.total != null) ? Math.abs(Number(item.total)) : Math.abs(Number(item.amount)) * parc;
                html += payChip('#FFD166', 'fa-arrows-rotate', parc + 'x · total ' + money(total));
            }
            return html;
        }

        /* ================= parcelamento (até 60x) e vínculo com cartão ================= */
        function fillParcelas(){
            const sel = document.getElementById('inputParcelas');
            if (!sel || sel.options.length) return;
            let html = '';
            for (let i = 1; i <= 60; i++) html += '<option value="' + i + '">' + i + 'x' + (i === 1 ? ' (à vista)' : '') + '</option>';
            sel.innerHTML = html;
            sel.value = '1';
        }
        function fillCardsSelect(selectedId){
            const sel = document.getElementById('inputCard');
            if (!sel) return;
            if (!cards.length){
                sel.innerHTML = '<option value="">— nenhum cartão cadastrado —</option>';
                sel.disabled = true;
                return;
            }
            sel.disabled = false;
            sel.innerHTML = cards.map(c => '<option value="' + c.id + '">' + escapeHtml(c.name) + ' •••• ' + String(c.last4 || '0000').replace(/\D/g, '').padEnd(4, '0').slice(-4) + '</option>').join('');
            const id = (selectedId != null && cards.some(c => String(c.id) === String(selectedId))) ? String(selectedId) : String(cards[0].id);
            sel.value = id;
        }
        function selectedCard(){
            const sel = document.getElementById('inputCard');
            if (!sel || sel.disabled || !sel.value) return null;
            return cards.find(c => String(c.id) === String(sel.value)) || null;
        }
        function updatePayFields(){
            const pay = (document.querySelector('input[name="pay"]:checked') || {}).value || 'pix';
            const isCard = pay === 'credito' || pay === 'debito';
            const wrap = document.getElementById('cardFields');
            if (!wrap) return;
            wrap.classList.toggle('hidden', !isCard);
            if (!isCard) return;
            fillParcelas();
            const pw = document.getElementById('parcelasWrap');
            if (pw) pw.classList.toggle('hidden', pay !== 'credito');
            const ps = document.getElementById('inputParcelas');
            if (ps && pay !== 'credito') ps.value = '1';
            const sel = document.getElementById('inputCard');
            fillCardsSelect(sel && sel.value ? sel.value : null);
            updateInstallHint();
        }
        function updateInstallHint(){
            const el = document.getElementById('cardHint');
            if (!el) return;
            const clear = function(){ el.textContent = ''; el.className = 'text-[11px] mt-2 leading-relaxed'; };
            const wrap = document.getElementById('cardFields');
            if (!wrap || wrap.classList.contains('hidden')) { clear(); return; }
            if (!cards.length){
                el.innerHTML = '<i class="fa-solid fa-circle-info mr-1"></i>Você ainda não tem cartão cadastrado — a compra fica registrada sem vínculo. Cadastre em <b>Meus Cartões</b>.';
                el.className = 'text-[11px] mt-2 leading-relaxed text-[#FFD166]';
                return;
            }
            const pay = (document.querySelector('input[name="pay"]:checked') || {}).value || 'pix';
            if (pay !== 'credito') { clear(); return; }
            const n = parseInt((document.getElementById('inputParcelas') || {}).value, 10) || 1;
            const total = Math.abs(parseFloat((document.getElementById('inputValue') || {}).value) || 0);
            if (n < 2 || total <= 0) { clear(); return; }
            const parc = round2(total / n);
            el.innerHTML = '<i class="fa-solid fa-arrows-rotate mr-1"></i>' + n + 'x de <b>' + money(parc) + '</b> — total <b>' + money(total) + '</b>. A parcela entra no saldo do mês e na fatura do cartão.';
            el.className = 'text-[11px] mt-2 leading-relaxed text-[#40C8A0]';
        }

        function handleAddTransaction(event) {
            event.preventDefault();

            const desc = document.getElementById('inputDesc').value;
            const val = parseFloat(document.getElementById('inputValue').value);
            const cat = document.getElementById('inputCategory').value;
            const type = document.querySelector('input[name="type"]:checked').value;
            const isIncome = type === 'receita';
            const payEl = document.querySelector('input[name="pay"]:checked');
            const pay = payEl ? payEl.value : 'pix';

            /* cartão vinculado + parcelamento (até 60x: só no crédito, só em saída) */
            const card = (pay === 'credito' || pay === 'debito') ? selectedCard() : null;
            let parcelas = 1;
            if (!isIncome && pay === 'credito') {
                const ps = document.getElementById('inputParcelas');
                parcelas = Math.max(1, Math.min(60, parseInt(ps ? ps.value : '1', 10) || 1));
            }
            const totalCompra = round2(Math.abs(val));
            /* parcelado: o que entra no mês (e na fatura) é a PARCELA */
            const amountFinal = (!isIncome && parcelas > 1) ? -round2(totalCompra / parcelas) : (isIncome ? val : -val);

            const now = new Date();
            /* o mês escolhido em "Mês de Referência" vale para a movimentação */
            const refMonth = (document.getElementById('inputMonth').value || '').trim();
            const mIdx = MONTHS_SHORT.indexOf(refMonth) >= 0 ? MONTHS_SHORT.indexOf(refMonth) : now.getMonth();
            /* ano escolhido no formulário (permite lançar o plano de 2027 em diante) */
            const anoSel = parseInt((document.getElementById('inputYear') || {}).value, 10);
            const anoRef = (anoSel > 1900) ? anoSel : now.getFullYear();
            const lastDay = new Date(anoRef, mIdx + 1, 0).getDate();
            const when = new Date(anoRef, mIdx, Math.min(now.getDate(), lastDay));
            const accSel = document.getElementById('inputAccount');
            const accId = (accSel && accSel.value) ? accSel.value : null;
            const recEl = document.getElementById('inputRecorrente');
            const recorrente = !!(recEl && recEl.checked);

            const newTx = {
                id: Date.now(),
                desc: desc,
                cat: isIncome ? 'Receita' : cat,
                pay: pay,
                parcelas: parcelas,
                total: totalCompra,
                cardId: card ? card.id : null,
                cardNome: card ? card.name : null,
                month: MONTHS_SHORT[mIdx],
                iso: toIso(when),
                date: pad2(when.getDate()) + ' ' + MONTHS_SHORT[mIdx],
                amount: amountFinal,
                icon: isIncome ? 'fa-arrow-down' : 'fa-basket-shopping',
                color: isIncome ? '#40C8A0' : '#8070F0',
                accId: accId
            };
            if (recorrente) {
                newTx.recorrente = true;
                newTx.proxIso = nextMonthIso(newTx.iso);
            }

            transactions.unshift(newTx);

            /* compra no crédito soma na fatura do cartão escolhido */
            if (pay === 'credito' && card && amountFinal < 0) {
                card.fatura = round2((Number(card.fatura) || 0) + Math.abs(amountFinal));
                renderCards();
            }

            if (!isIncome) {
                const targetCat = categoriesData.find(c => c.name === cat);
                const catVal = Math.abs(amountFinal);
                if (targetCat) {
                    targetCat.val += catVal;
                } else {
                    categoriesData[0].val += catVal;
                }
            }

            renderCategoryLegends();
            applyFilters();
            updateSummaryCards();
            if (document.getElementById('calGrid')) renderCalendar();
            if (typeof renderAccounts === 'function') renderAccounts();
            if (typeof renderTransfers === 'function') renderTransfers();
            if (selectedDate && String(txIso(newTx) || '').slice(0, 7) !== selectedDate.slice(0, 7)) {
                toast('Movimentação registrada em ' + calShortDate(txIso(newTx)) + '.');
            }
            closeModal();
            document.getElementById('transactionForm').reset();
            if (newTx.recorrente) toast('Movimentação criada — ela se repete todo mês.');
        }

        /* ---------- recorrência mensal: gera as próximas ocorrências ---------- */
        function nextTxId(){
            let id = Date.now();
            while (transactions.some(t => t.id === id)) id++;
            return id;
        }

        function nextMonthIso(iso){
            const d = isoToDate(iso);
            const day = d.getDate();
            const alvo = new Date(d.getFullYear(), d.getMonth() + 1, 1);
            const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
            alvo.setDate(Math.min(day, ultimo));
            return toIso(alvo);
        }

        /* cria as movimentações recorrentes cujo mês já chegou (executa no boot e a cada sync).
           A CÓPIA não herda recorrente/proxIso: só o ORIGINAL gera as próximas ocorrências
           (antes, a cópia virava "recorrente" também e duplicava lançamentos mês a mês).
           O loop percorre uma FOTOGRAFIA do array: push em array sendo iterado visitava
           as cópias recém-criadas no mesmo passeio. */
        function generateRecurring(){
            if (!Array.isArray(transactions)) return;
            let changed = false, guard = 0;
            const hoje = toIso(new Date());
            for (const t of transactions.slice()) {
                if (!t || !t.recorrente || !t.proxIso) continue;
                let n = 0;
                while (t.proxIso <= hoje && n < 24 && guard < 500) {
                    guard++; n++;
                    const iso = t.proxIso;
                    const d = isoToDate(iso);
                    const copia = Object.assign({}, t, {
                        id: nextTxId(),
                        iso: iso,
                        month: MONTHS_SHORT[d.getMonth()],
                        date: pad2(d.getDate()) + ' ' + MONTHS_SHORT[d.getMonth()],
                        proxIso: undefined
                    });
                    delete copia.recorrente;
                    transactions.push(copia);
                    t.proxIso = nextMonthIso(iso);
                    changed = true;
                }
            }
            if (changed) persist();
        }
