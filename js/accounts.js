/* ==========================================================================
   CENTAVUS — CONTAS (item 7)
   Conta corrente, poupança, dinheiro, investimentos e outros.
   Saldo = saldo inicial + movimentações vinculadas ± transferências.
   ========================================================================== */

const ACCOUNT_TYPES = {
    corrente:     { label: 'Conta corrente', icon: 'fa-building-columns', color: '#40C8A0' },
    poupanca:     { label: 'Poupança',       icon: 'fa-piggy-bank',       color: '#70E0C0' },
    dinheiro:     { label: 'Dinheiro',       icon: 'fa-money-bill-wave',  color: '#FFD166' },
    investimentos:{ label: 'Investimentos',  icon: 'fa-chart-line',       color: '#8070F0' },
    outros:       { label: 'Outros',         icon: 'fa-box-archive',      color: '#A8B5B2' }
};

let accountEditId = null;

function accountTypeOf(type){ return ACCOUNT_TYPES[type] || ACCOUNT_TYPES.outros; }
function accountById(id){ return accounts.find(a => String(a.id) === String(id)); }

function accountBalance(acc){
    if(!acc) return 0;
    let balance = Number(acc.initial) || 0;
    for (const t of transactions) {
        if (t.accId != null && String(t.accId) === String(acc.id)) balance += Number(t.amount) || 0;
    }
    for (const tr of (transfers || [])) {
        if (String(tr.from) === String(acc.id)) balance -= Number(tr.value) || 0;
        if (String(tr.to) === String(acc.id)) balance += Number(tr.value) || 0;
    }
    return round2(balance);
}

function totalAccountsBalance(){ return round2(accounts.reduce((s, a) => s + accountBalance(a), 0)); }

function accountMoveCount(id){
    let n = 0;
    for (const t of transactions) if (t.accId != null && String(t.accId) === String(id)) n++;
    for (const tr of (transfers || [])) if (String(tr.from) === String(id) || String(tr.to) === String(id)) n++;
    return n;
}

function accountSharePct(acc){
    const total = accounts.reduce((s, a) => s + Math.max(0, accountBalance(a)), 0);
    const bal = Math.max(0, accountBalance(acc));
    return total > 0 ? Math.round((bal / total) * 100) : 0;
}

/* ---------------- resumo ---------------- */
function renderAccountsSummary(){
    const el = document.getElementById('accountsSummary');
    if (!el) return;
    const total = totalAccountsBalance();
    const biggest = accounts.slice().sort((a, b) => accountBalance(b) - accountBalance(a))[0];
    const card = (label, value, extra, color) => `
        <div class="bg-[#102020] rounded-2xl p-4 border border-white/5">
            <p class="text-[10px] text-[#6F807C] uppercase tracking-wider font-bold">${label}</p>
            <strong class="${extra} confidential-value block mt-1.5 text-base font-extrabold" data-value="${value}">${color ? '' : money(value)}</strong>
        </div>`;

    el.innerHTML = `
        <div class="bg-[#102020] rounded-2xl p-4 border border-white/5">
            <p class="text-[10px] text-[#6F807C] uppercase tracking-wider font-bold">Saldo total</p>
            <strong id="accountsTotal" class="block mt-1.5 text-base font-extrabold text-[#70E0C0] confidential-value" data-value="${total}">${money(total)}</strong>
        </div>
        <div class="bg-[#102020] rounded-2xl p-4 border border-white/5">
            <p class="text-[10px] text-[#6F807C] uppercase tracking-wider font-bold">Contas</p>
            <strong class="block mt-1.5 text-base font-extrabold text-white">${accounts.length}</strong>
        </div>
        <div class="bg-[#102020] rounded-2xl p-4 border border-white/5">
            <p class="text-[10px] text-[#6F807C] uppercase tracking-wider font-bold">Maior saldo</p>
            <strong class="block mt-1.5 text-base font-extrabold text-white truncate">${biggest ? escapeHtml(biggest.name) : '—'}</strong>
        </div>
        <div class="bg-[#102020] rounded-2xl p-4 border border-white/5">
            <p class="text-[10px] text-[#6F807C] uppercase tracking-wider font-bold">Movimentações vinculadas</p>
            <strong class="block mt-1.5 text-base font-extrabold text-white">${transactions.filter(t => t.accId != null).length}</strong>
        </div>`;
    if (isPrivacyHidden) applyPrivacyState();
}

/* ---------------- lista de contas ---------------- */
function renderAccounts(){
    renderAccountsSummary();

    const grid = document.getElementById('accountsGrid');
    const empty = document.getElementById('accountsEmpty');
    if (!grid) return;

    if (empty) empty.classList.toggle('hidden', accounts.length > 0);
    grid.classList.toggle('hidden', accounts.length === 0);

    grid.innerHTML = accounts.map(acc => {
        const type = accountTypeOf(acc.type);
        const bal = accountBalance(acc);
        const share = accountSharePct(acc);
        const moves = accountMoveCount(acc.id);
        const negative = bal < 0;
        return `
        <div class="cv-account-item bg-[#102020] rounded-2xl p-4 border border-white/5 flex flex-col gap-3">
            <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style="background:${type.color}18;color:${type.color}">
                        <i class="fa-solid ${type.icon}"></i>
                    </div>
                    <div class="min-w-0">
                        <p class="text-sm font-bold text-white truncate">${escapeHtml(acc.name)}</p>
                        <p class="text-[10px] text-[#6F807C] uppercase tracking-wider font-bold">${type.label}</p>
                    </div>
                </div>
                <div class="flex gap-1.5 shrink-0">
                    <button type="button" class="goal-btn mini" title="Editar conta" aria-label="Editar conta" onclick="openAccountModal('${acc.id}')"><i class="fa-solid fa-pen"></i></button>
                    <button type="button" class="goal-btn mini danger" title="Excluir conta" aria-label="Excluir conta" onclick="deleteAccount('${acc.id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>

            <div>
                <p class="text-[10px] text-[#6F807C]">Saldo atual</p>
                <strong class="confidential-value block text-lg font-extrabold ${negative ? 'text-[#ff8d9a]' : 'text-white'}" data-value="${bal}">${money(bal)}</strong>
            </div>

            <div class="budget-bar"><div class="budget-fill ${negative ? 'bg-[#ff5064]' : 'bg-[#30A080]'}" style="width:${share}%"></div></div>
            <div class="flex justify-between text-[10px] text-[#6F807C]">
                <span>${share}% do saldo total</span>
                <span>${moves} movimentação(ões)</span>
            </div>
        </div>`;
    }).join('');

    renderTransfers();
    if (isPrivacyHidden) applyPrivacyState();
}

/* ---------------- transferências ---------------- */
function renderTransfers(){
    const wrap = document.getElementById('transfersWrap');
    const list = document.getElementById('transfersList');
    if (!wrap || !list) return;
    const items = (transfers || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id).slice(0, 20);
    wrap.classList.toggle('hidden', items.length === 0);

    list.innerHTML = items.map(tr => {
        const from = accountById(tr.from), to = accountById(tr.to);
        const date = String(tr.date || '').split('-').reverse().join('/');
        return `
        <div class="flex items-center justify-between gap-3 bg-[#0d1615] border border-white/5 rounded-xl px-3 py-2.5">
            <div class="flex items-center gap-2.5 min-w-0">
                <i class="fa-solid fa-right-left text-[#70E0C0] text-xs"></i>
                <div class="min-w-0">
                    <p class="text-xs text-white font-semibold truncate">${escapeHtml(from ? from.name : '—')} <span class="text-[#6F807C]">→</span> ${escapeHtml(to ? to.name : '—')}</p>
                    <p class="text-[10px] text-[#6F807C] truncate">${date}${tr.desc ? ' · ' + escapeHtml(tr.desc) : ''}</p>
                </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <span class="text-xs font-bold confidential-value" data-value="${tr.value}">${money(tr.value)}</span>
                <button type="button" class="goal-btn mini danger" title="Excluir transferência" aria-label="Excluir transferência" onclick="deleteTransfer(${tr.id})"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

/* select "Conta" dentro da Nova Transação */
function fillAccountsSelect(selectedId){
    const sel = document.getElementById('inputAccount');
    if (!sel) return;
    const current = selectedId !== undefined ? String(selectedId || '') : String(sel.value || '');
    sel.innerHTML = '<option value="">Sem conta vinculada</option>' +
        accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)} (${accountTypeOf(a.type).label})</option>`).join('');
    if ([...sel.options].some(o => o.value === current)) sel.value = current;
}

/* ---------------- modal de conta ---------------- */
function showAccountError(msg){
    const el = document.getElementById('accountError');
    if (!el) return;
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
}

function openAccountModal(id){
    accountEditId = id != null && id !== '' ? id : null;
    const editing = accountEditId != null;
    /* limite do plano Grátis: só na CRIAÇÃO */
    if (!editing && typeof cvGate === 'function' && !cvGate('contas')) { accountEditId = null; return; }
    const acc = editing ? accountById(accountEditId) : null;
    if (editing && !acc) return;

    const title = document.getElementById('accountModalTitle');
    const del = document.getElementById('accountDeleteBtn');
    const balLabel = document.getElementById('accountBalanceLabel');
    if (title) title.textContent = editing ? 'Editar conta' : 'Nova conta';
    if (del) del.classList.toggle('hidden', !editing);
    if (balLabel) balLabel.textContent = editing ? 'Saldo atual (R$)' : 'Saldo inicial (R$)';

    document.getElementById('accountName').value = acc ? acc.name : '';
    document.getElementById('accountType').value = acc ? (acc.type || 'corrente') : 'corrente';
    document.getElementById('accountBalanceInput').value = acc ? (Number(acc.initial) || 0) : '';
    showAccountError('');
    const m = document.getElementById('accountModal');
    m.classList.remove('hidden');
    setTimeout(() => document.getElementById('accountName').focus(), 60);
}

function closeAccountModal(){
    const m = document.getElementById('accountModal');
    if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
    accountEditId = null;
}

function handleAccountSubmit(event){
    event.preventDefault();
    const name = document.getElementById('accountName').value.trim();
    const type = document.getElementById('accountType').value;
    const initial = parseValorBR(document.getElementById('accountBalanceInput').value);

    if (name.length < 2) { showAccountError('Dê um nome para a conta (mínimo de 2 caracteres).'); return; }
    if (name.length > 40) { showAccountError('O nome pode ter no máximo 40 caracteres.'); return; }
    if (isNaN(initial)) { showAccountError('Informe o saldo da conta (use 0 se for novo).'); return; }
    /* limite do plano Grátis na criação */
    if (accountEditId == null && typeof cvGate === 'function' && !cvGate('contas')) return;

    if (accountEditId != null) {
        const acc = accountById(accountEditId);
        if (acc) {
            /* o campo mostra o saldo ATUAL: recalcula o saldo inicial para bater com ele */
            const movimentos = round2(accountBalance(acc) - (Number(acc.initial) || 0));
            acc.name = name;
            acc.type = type;
            acc.initial = round2(initial - movimentos);
        }
    } else {
        accounts.push({
            id: (accountSeq = (Number(accountSeq) || 0) + 1),
            name: name, type: type, initial: round2(initial),
            createdAt: new Date().toISOString()
        });
    }

    const wasEditing = accountEditId != null;
    persist();
    renderAccounts();
    fillAccountsSelect();
    closeAccountModal();
    toast(wasEditing ? 'Conta atualizada.' : 'Conta criada.');
}

async function deleteAccount(id){
    const acc = accountById(id);
    if (!acc) return;
    const linked = transactions.filter(t => t.accId != null && String(t.accId) === String(id));
    const ok = await cvConfirm({
        titulo: 'Excluir a conta “' + acc.name + '”?',
        mensagem: linked.length
            ? 'Esta conta tem ' + linked.length + ' movimentação(ões) vinculadas. Elas continuam no extrato, mas deixam de ter conta.'
            : 'A conta será removida. As movimentações continuam no seu histórico.',
        okLabel: 'Excluir conta'
    });
    if (!ok) return;
    transactions.forEach(t => { if (t.accId != null && String(t.accId) === String(id)) delete t.accId; });
    accounts = accounts.filter(a => String(a.id) !== String(id));
    transfers = (transfers || []).filter(t => String(t.from) !== String(id) && String(t.to) !== String(id));
    persist();
    renderAccounts();
    applyFilters();
    fillAccountsSelect();
    closeAccountModal();
    toast('Conta excluída.');
}

/* ---------------- modal de transferência ---------------- */
function showTransferError(msg){
    const el = document.getElementById('transferError');
    if (!el) return;
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
}

function openTransferModal(){
    const from = document.getElementById('transferFrom');
    const to = document.getElementById('transferTo');
    if (!from || !to) return;
    if (accounts.length < 2) {
        toast('Crie pelo menos duas contas para transferir entre elas.', 'error');
        if (accounts.length === 0) openAccountModal();
        return;
    }
    const opts = accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)} · ${money(accountBalance(a))}</option>`).join('');
    from.innerHTML = opts; to.innerHTML = opts;
    from.selectedIndex = 0; to.selectedIndex = 1;
    document.getElementById('transferValue').value = '';
    document.getElementById('transferDesc').value = '';
    document.getElementById('transferDate').value = toIso(new Date());
    showTransferError('');
    const m = document.getElementById('transferModal');
    m.classList.remove('hidden'); m.classList.add('flex');
    setTimeout(() => document.getElementById('transferValue').focus(), 60);
}

function closeTransferModal(){
    const m = document.getElementById('transferModal');
    if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
}

function handleTransferSubmit(event){
    event.preventDefault();
    const from = document.getElementById('transferFrom').value;
    const to = document.getElementById('transferTo').value;
    const value = parseValorBR(document.getElementById('transferValue').value);
    const date = document.getElementById('transferDate').value || toIso(new Date());
    const desc = document.getElementById('transferDesc').value.trim();

    if (String(from) === String(to)) { showTransferError('Escolha contas diferentes para origem e destino.'); return; }
    if (isNaN(value) || value <= 0) { showTransferError('Informe um valor maior que zero.'); return; }
    const accFrom = accountById(from), accTo = accountById(to);
    if (!accFrom || !accTo) { showTransferError('Conta não encontrada.'); return; }

    transfers.push({
        id: Date.now(), from: from, to: to, value: round2(value), date: date, desc: desc
    });

    persist();
    renderAccounts();
    closeTransferModal();
    toast(`${money(value)} transferidos de ${accFrom.name} para ${accTo.name}.`);
}

async function deleteTransfer(id){
    const ok = await cvConfirm({ titulo: 'Excluir esta transferência?', mensagem: 'Os saldos das duas contas voltam ao valor anterior.', okLabel: 'Excluir' });
    if (!ok) return;
    transfers = (transfers || []).filter(t => t.id !== id);
    persist();
    renderAccounts();
    toast('Transferência excluída.');
}
