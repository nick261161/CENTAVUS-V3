/* Extraído de index.html — scripts clássicos, carregados na ordem abaixo. */
        /* =======================================================================
           METAS FINANCEIRAS — render, valores guardados, resgates, edição e celebração
           ======================================================================= */
        function goalById(id){ return goals.find(g => g.id === id); }
        function goalPct(g){ return g.target > 0 ? (g.current / g.target) * 100 : 0; }
        function goalDone(g){ return g.target > 0 && g.current >= g.target; }
        function goalPercentLabel(g){ const p = goalPct(g); return (p >= 100 ? Math.floor(p) : Math.round(p)) + '%'; }
        function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

        function renderGoals(){
            const container = document.getElementById('goalsGridContainer');
            if (!container) return;

            const invested = goals.reduce((s, g) => s + g.current, 0);
            const doneCount = goals.filter(goalDone).length;
            const summary = document.getElementById('goalsSummary');
            if (summary) {
                summary.textContent = goals.length
                    ? `${goals.length} meta(s) · ${money(invested)} guardados · ${doneCount} concluída(s)`
                    : 'Crie sua primeira meta e acompanhe o progresso por aqui.';
            }

            if (!goals.length){
                container.innerHTML = `<div class="col-span-full text-center py-8 text-xs text-[#6F807C]">
                    <i class="fa-solid fa-bullseye text-2xl block mb-3 text-[#30A080]"></i>
                    Você ainda não tem metas. Clique em “+ Nova Meta” para começar.</div>`;
                return;
            }

            container.innerHTML = goals.map(g => {
                const pct = goalPct(g);
                const done = goalDone(g);
                const width = Math.min(100, pct);
                const rest = g.target - g.current;
                const valueText = isPrivacyHidden ? '••••••••' : money(g.current);
                const bar = done ? 'linear-gradient(90deg,#FFD166,#40C8A0)'
                                 : `linear-gradient(90deg,${g.color},#70E0C0)`;
                return `
                <div class="goal-card ${done ? 'is-done' : ''}" data-goal="${g.id}">
                    <div class="flex items-center justify-between gap-2">
                        <div class="goal-title"><i class="cv-tint fa-solid ${g.icon}" style="--c:${g.color}"></i><span>${escapeHtml(g.name)}</span></div>
                        <span class="goal-pct ${done ? 'done' : ''}">${goalPercentLabel(g)}</span>
                    </div>
                    ${done ? `<div class="goal-chip-done"><i class="fa-solid fa-trophy"></i> Meta atingida — parabéns!</div>` : ''}
                    <div class="goal-bar"><div class="goal-fill" style="width:${width}%;background:${bar}"></div></div>
                    <div class="goal-values">
                        <span class="now confidential-value" data-value="${g.current}">${valueText}</span>
                        <span class="target">Meta: ${money(g.target)}</span>
                    </div>
                    <div class="goal-rest ${done ? 'done' : ''}">
                        <i class="fa-solid ${done ? 'fa-circle-check' : 'fa-hourglass-half'}"></i>
                        ${done ? ('Meta atingida!' + (rest < 0 ? ' (+' + money(Math.abs(rest)) + ' acima)' : ''))
                              : ('Faltam ' + money(rest))}
                    </div>
                    <div class="goal-actions">
                        <button type="button" class="goal-btn add" onclick="openGoalValue(${g.id},'add')"><i class="fa-solid fa-plus"></i> Guardar</button>
                        <button type="button" class="goal-btn out" onclick="openGoalValue(${g.id},'remove')"><i class="fa-solid fa-minus"></i> Resgatar</button>
                        <button type="button" class="goal-btn mini" title="Editar meta" aria-label="Editar meta" onclick="editGoal(${g.id})"><i class="fa-solid fa-pen"></i></button>
                        <button type="button" class="goal-btn mini danger" title="Excluir meta" aria-label="Excluir meta" onclick="deleteGoal(${g.id})"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>`;
            }).join('');
        }

        /* ---------- Guardar / Resgatar valores ---------- */
        function openGoalValue(id, mode){
            const g = goalById(id);
            if (!g) return;
            goalValueCtx = {id: id, mode: mode};
            const isAdd = mode === 'add';
            document.getElementById('goalValueTitle').innerHTML = isAdd
                ? '<i class="fa-solid fa-circle-plus text-[#40C8A0]"></i> Guardar na meta'
                : '<i class="fa-solid fa-circle-minus text-[#A090FF]"></i> Resgatar da meta';
            document.getElementById('goalValueConfirmBtn').textContent = isAdd ? 'Confirmar guarda' : 'Confirmar resgate';
            document.getElementById('goalValueGoalName').textContent = g.name;
            document.getElementById('goalValueCurrent').textContent = money(g.current);
            const rest = g.target - g.current;
            document.getElementById('goalValueRestLabel').textContent = rest >= 0 ? 'Faltam' : 'Excedente';
            document.getElementById('goalValueRest').textContent = money(Math.abs(rest));
            document.getElementById('goalValueRest').className = 'text-sm font-bold font-mono mt-1 ' + (rest >= 0 ? 'text-[#70E0C0]' : 'text-[#FFD166]');
            const input = document.getElementById('goalValueInput');
            input.value = '';
            showGoalValueError('');
            document.getElementById('goalValueModal').classList.remove('hidden');
            setTimeout(() => input.focus(), 60);
        }

        function closeGoalValue(){
            document.getElementById('goalValueModal').classList.add('hidden');
            goalValueCtx = {id: null, mode: 'add'};
        }

        function quickGoalAmount(v){
            const input = document.getElementById('goalValueInput');
            /* parseValorBR: aceita "1.234,56" e "1234.56" sem virar R$ 1,23 */
            input.value = ((parseValorBR(input.value) || 0) + v).toFixed(2);
            input.focus();
        }

        function showGoalValueError(msg){
            const el = document.getElementById('goalValueError');
            if (!el) return;
            el.textContent = msg || '';
            el.style.display = msg ? 'block' : 'none';
        }

        /* registra um ponto no histórico da meta (alimenta o gráfico de evolução) */
        function goalHistPush(g){
            if (!g) return;
            if (!Array.isArray(g.hist)) g.hist = [];
            const pct = g.target > 0 ? Math.min(100, Math.round((g.current / g.target) * 1000) / 10) : 0;
            const hoje = toIso(new Date());
            const ultimo = g.hist[g.hist.length - 1];
            if (ultimo && ultimo.d === hoje) ultimo.pct = pct;   /* mesmo dia: sobrescreve */
            else g.hist.push({ d: hoje, pct: pct });
            if (g.hist.length > 60) g.hist = g.hist.slice(-60);  /* mantém leve */
        }

        function confirmGoalValue(){
            if (goalValueCtx.kind === 'cofrinho') { confirmCofrinhoValue(); return; }
            const g = goalById(goalValueCtx.id);
            if (!g) { closeGoalValue(); return; }
            const input = document.getElementById('goalValueInput');
            const value = parseValorBR(input.value);
            const mode = goalValueCtx.mode;

            if (!value || value <= 0 || isNaN(value)) { showGoalValueError('Informe um valor maior que zero.'); input.focus(); return; }
            if (mode === 'remove' && value > g.current + 0.001) {
                showGoalValueError('Você só pode resgatar até ' + money(g.current) + '.');
                input.focus();
                return;
            }

            const wasDone = goalDone(g);
            g.current = mode === 'add' ? (g.current + value) : Math.max(0, g.current - value);
            g.current = Math.round(g.current * 100) / 100;
            const isDone = goalDone(g);
            goalHistPush(g);

            persist();
            renderGoals();
            closeGoalValue();
            toast((mode === 'add' ? 'Guardou ' : 'Resgate de ') + money(value) + ' em “' + g.name + '”.');

            const card = document.querySelector('[data-goal="' + g.id + '"]');
            if (card) { card.classList.add('pop'); setTimeout(() => card.classList.remove('pop'), 600); }

            if (!wasDone && isDone) celebrateGoal(g);
        }

        /* ---------- Editar / Excluir ---------- */
        function editGoal(id){
            const g = goalById(id);
            if (g) openGoalModal(g);
        }

        async function deleteGoal(id){
            const g = goalById(id);
            if (!g) return;
            const ok = await cvConfirm({ titulo: 'Excluir a meta “' + g.name + '”?', mensagem: 'O progresso guardado nesta meta também será apagado.', okLabel: 'Excluir meta' });
            if (!ok) return;
            goals = goals.filter(x => x.id !== id);
            persist();
            renderGoals();
            toast('Meta excluída.');
        }

        function handleAddGoal(event) {
            event.preventDefault();
            const name = document.getElementById('goalTitle').value.trim();
            const current = parseValorBR(document.getElementById('goalCurrent').value);
            const target = parseValorBR(document.getElementById('goalTarget').value);

            if (!name) { toast('Informe o título da meta.', 'error'); return; }
            if (isNaN(target) || target <= 0) { toast('O valor objetivo precisa ser maior que zero.', 'error'); return; }
            if (isNaN(current) || current < 0) { toast('Informe um valor atual válido.', 'error'); return; }

            if (goalModalMode === 'edit') {
                const g = goalById(goalEditId);
                if (!g) { closeGoalModal(); return; }
                const wasDone = goalDone(g);
                g.name = name; g.current = current; g.target = target;
                goalHistPush(g);
                persist();
                renderGoals();
                closeGoalModal();
                toast('Meta atualizada.');
                if (!wasDone && goalDone(g)) celebrateGoal(g);
                return;
            }

            /* limite do plano Grátis na criação */
            if (typeof cvGate === 'function' && !cvGate('metas')) return;

            const idx = goals.length;
            const goal = {
                id: goalSeq++,
                name: name,
                icon: goalIcons[idx % goalIcons.length],
                color: goalColors[idx % goalColors.length],
                current: current,
                target: target
            };
            goals.push(goal);
            goalHistPush(goal);
            persist();
            renderGoals();
            closeGoalModal();
            document.getElementById('goalForm').reset();
            toast('Meta criada: ' + name + '.');
            if (goalDone(goal)) celebrateGoal(goal);
        }

        /* ---------- Parabéns: meta atingida ---------- */
        function celebrateGoal(g){
            document.getElementById('congratsGoalName').textContent = g.name;
            document.getElementById('congratsGoalValue').textContent = money(g.current);
            document.getElementById('congratsGoalMsg').textContent =
                'Você juntou ' + money(g.current) + ' e concluiu 100% da meta “' + g.name + '”. Agora é só escolher o próximo objetivo!';
            launchConfetti();
            const overlay = document.getElementById('congratsOverlay');
            overlay.classList.remove('hidden');
            overlay.classList.add('flex');
            pushNotif({ id: 'goal-' + g.id, icon: 'fa-trophy', title: 'Meta atingida', text: 'Você concluiu “' + g.name + '” — ' + money(g.current) + '. Parabéns!' });
        }

        function closeCongrats(){
            const overlay = document.getElementById('congratsOverlay');
            overlay.classList.add('hidden');
            overlay.classList.remove('flex');
            const box = document.getElementById('congratsConfetti');
            if (box) box.innerHTML = '';
        }

        function launchConfetti(){
            const box = document.getElementById('congratsConfetti');
            if (!box) return;
            const colors = ['#40C8A0', '#70E0C0', '#A090FF', '#8070F0', '#FFD166', '#ff8e9b'];
            let html = '';
            for (let i = 0; i < 46; i++) {
                const left = Math.round(Math.random() * 100);
                const delay = (Math.random() * 2.5).toFixed(2);
                const dur = (2.4 + Math.random() * 1.8).toFixed(2);
                html += `<span style="left:${left}%;background:${colors[i % colors.length]};animation-delay:${delay}s;animation-duration:${dur}s"></span>`;
            }
            box.innerHTML = html;
        }

