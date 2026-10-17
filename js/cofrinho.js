/* Extraído de index.html — scripts clássicos, carregados na ordem abaixo. */
        /* ==========================================================================
           COFRINHO COM CDI — saldo, rendimento automático e simulador
           ========================================================================== */
        function cfDaysAgo(n){ const d = new Date(); d.setDate(d.getDate() - n); return toIso(d); }

        // ===== RENDA FIXA (estado) =====
        let rendaFixa = { itens: [], seq: 1 }; // primeira vez: nenhuma aplicação
        let rfEditId = null;

        let cofrinho = (function(){
            const today = new Date();
            return {
                saldo: 0,        // primeira vez: cofrinho zerado
                cdi: 14.90,      // CDI de referência (padrão do app)
                mensal: 300,     // "guardado mensal" que alimenta a projeção e o simulador
                lastYieldAt: toIso(today),
                hist: []
            };
        })();

        function cfMonthlyRate(){ return Math.pow(1 + (Number(cofrinho.cdi) || 0) / 100, 1 / 12) - 1; }

        function cfProjection(saldo, mensal, meses){
            const i = cfMonthlyRate();
            /* CDI 0% → i = 0: sem guarda, (f-1)/i virava 0/0 = NaN na tela */
            if (!(i > 0)) return (Number(saldo) || 0) + (Number(mensal) || 0) * meses;
            const f = Math.pow(1 + i, meses);
            return (Number(saldo) || 0) * f + (Number(mensal) || 0) * (f - 1) / i;
        }

        // Credita o rendimento mês a mês desde a última competência
        function accrueCofrinho(){
            if (!cofrinho.lastYieldAt) cofrinho.lastYieldAt = toIso(new Date());
            if (!(cofrinho.saldo > 0)) return;
            const i = cfMonthlyRate();
            if (!(i > 0)) return;
            const now = new Date();
            let d = isoToDate(cofrinho.lastYieldAt);
            let changed = false, guard = 0;
            while (guard++ < 120) {
                const next = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate());
                if (next > now) break;
                const rend = round2(cofrinho.saldo * i);
                cofrinho.saldo = round2(cofrinho.saldo + rend);
                if (rend > 0) cofrinho.hist.unshift({ id: Date.now() + guard, tipo: 'rendimento', valor: rend, data: toIso(next) });
                d = next;
                cofrinho.lastYieldAt = toIso(next);
                changed = true;
            }
            if (changed && typeof persist === 'function') persist();
        }

        function renderCofrinho(){
            const saldo = round2(cofrinho.saldo);
            const guardadoMensal = Math.max(0, round2(Number(cofrinho.mensal) || 0));
            const aportado = round2(
                cofrinho.hist.filter(h => h.tipo === 'aporte').reduce((s, h) => s + (Number(h.valor) || 0), 0) -
                cofrinho.hist.filter(h => h.tipo === 'resgate').reduce((s, h) => s + (Number(h.valor) || 0), 0)
            );
            const rend = round2(cofrinho.hist.filter(h => h.tipo === 'rendimento').reduce((s, h) => s + (Number(h.valor) || 0), 0));
            /* projeção de 12 meses = saldo de hoje + o que você guarda por mês */
            const proj = round2(cfProjection(saldo, guardadoMensal, 12));
            const mes = round2(saldo * cfMonthlyRate());

            setText('cofrinhoSaldo', money(saldo), saldo);
            setText('cofrinhoAportado', money(aportado), aportado);
            setText('cofrinhoRendimento', money(rend), rend);
            setText('cofrinhoProjecao', money(proj), proj);
            setText('cofrinhoMeta', 'Neste mês rendeu ' + money(mes) + ' · CDI ' + (Number(cofrinho.cdi) || 0).toFixed(2).replace('.', ',') + '% a.a.');

            const cdiInput = document.getElementById('cdiInput');
            if (cdiInput && document.activeElement !== cdiInput) cdiInput.value = (Number(cofrinho.cdi) || 0).toFixed(2);

            /* o campo "Guardado mensal" do simulador é a mesma referência da projeção */
            const simInput = document.getElementById('simAporte');
            if (simInput && document.activeElement !== simInput) simInput.value = String(guardadoMensal);

            const histBox = document.getElementById('cofrinhoHist');
            if (histBox) {
                const icones = { aporte: ['fa-circle-arrow-down', 'in', 'rgba(64,200,160,.15)', '#40C8A0'], resgate: ['fa-circle-arrow-up', 'out', 'rgba(128,112,240,.15)', '#A090FF'], rendimento: ['fa-sack-dollar', 'yield', 'rgba(255,209,102,.14)', '#FFD166'] };
                const rotulos = { aporte: 'Guardado', resgate: 'Resgate', rendimento: 'Rendimento do CDI' };
                const items = cofrinho.hist.slice(0, 8);
                histBox.innerHTML = items.length ? items.map(h => {
                    const ic = icones[h.tipo] || icones.aporte;
                    const d = isoToDate(h.data);
                    const quando = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
                    const sinal = h.tipo === 'resgate' ? '−' : '+';
                    return '<div class="cf-hist">' +
                        '<div class="cf-ico" style="background:' + ic[2] + ';--c:' + ic[3] + '"><i class="fa-solid ' + ic[0] + '"></i></div>' +
                        '<div class="min-w-0 flex-1"><p class="cf-t">' + rotulos[h.tipo] + '</p><p class="cf-d">' + quando + '</p></div>' +
                        '<span class="cf-v confidential-value ' + ic[1] + '" data-value="' + (Number(h.valor) || 0) + '">' + sinal + ' ' + money(h.valor) + '</span>' +
                        '</div>';
                }).join('') : '<p class="text-xs text-[#6F807C] py-3 text-center">Nenhum lançamento ainda. Guarde o primeiro valor!</p>';
            }

            const cdiBtn = document.getElementById('simNota');
            if (cdiBtn) cdiBtn.textContent = 'Cálculo sobre o guardado mensal de ' + money(guardadoMensal) + ', com juros compostos ao mês, a 100% do CDI (' + (Number(cofrinho.cdi) || 0).toFixed(2).replace('.', ',') + '% a.a.). Valores estimados, sem impostos.';
            try { runCdiSimulator(); } catch (e) {}
            applyPrivacyState();
        }

        function setCdi(){
            const input = document.getElementById('cdiInput');
            const v = parseValorBR(input ? input.value : '');
            if (isNaN(v) || v < 0 || v > 100) { toast('Informe um CDI entre 0 e 100 (% ao ano).', 'error'); if (input) input.value = (Number(cofrinho.cdi) || 0).toFixed(2); return; }
            cofrinho.cdi = round2(v);
            persist();
            renderCofrinho();
            runCdiSimulator();
            toast('CDI atualizado para ' + cofrinho.cdi.toFixed(2).replace('.', ',') + '% a.a.');
        }

        function openCofrinhoValue(mode){
            goalValueCtx = { id: null, mode: mode, kind: 'cofrinho' };
            const isAdd = mode === 'add';
            document.getElementById('goalValueTitle').innerHTML = isAdd
                ? '<i class="fa-solid fa-piggy-bank text-[#40C8A0]"></i> Guardar no cofrinho'
                : '<i class="fa-solid fa-piggy-bank text-[#A090FF]"></i> Resgatar do cofrinho';
            document.getElementById('goalValueConfirmBtn').textContent = isAdd ? 'Confirmar guarda' : 'Confirmar resgate';
            document.getElementById('goalValueCtxLabel').textContent = 'Cofrinho · 100% do CDI';
            document.getElementById('goalValueGoalName').textContent = 'Cofrinho Centavus';
            document.getElementById('goalValueCurrent').textContent = money(cofrinho.saldo);
            document.getElementById('goalValueRestLabel').textContent = 'Rende ao mês';
            const rest = document.getElementById('goalValueRest');
            rest.textContent = money(cofrinho.saldo * cfMonthlyRate());
            rest.className = 'text-sm font-bold font-mono mt-1 text-[#70E0C0]';
            const input = document.getElementById('goalValueInput');
            input.value = '';
            showGoalValueError('');
            document.getElementById('goalValueModal').classList.remove('hidden');
            setTimeout(() => input.focus(), 60);
        }

        function confirmCofrinhoValue(){
            const input = document.getElementById('goalValueInput');
            const value = parseFloat(input.value);
            const mode = goalValueCtx.mode;
            if (!value || value <= 0 || isNaN(value)) { showGoalValueError('Informe um valor maior que zero.'); input.focus(); return; }
            if (mode === 'remove' && value > cofrinho.saldo + 0.001) { showGoalValueError('Você só pode resgatar até ' + money(cofrinho.saldo) + '.'); input.focus(); return; }

            cofrinho.saldo = round2(mode === 'add' ? cofrinho.saldo + value : cofrinho.saldo - value);
            cofrinho.hist.unshift({ id: Date.now(), tipo: mode === 'add' ? 'aporte' : 'resgate', valor: round2(value), data: toIso(new Date()) });
            if (cofrinho.hist.length > 80) cofrinho.hist.length = 80;
            persist();
            renderCofrinho();
            closeGoalValue();
            toast((mode === 'add' ? 'Guardou ' : 'Resgate de ') + money(value) + ' no cofrinho.');
        }

        /* guarda o "guardado mensal" digitado: passa a valer para a projeção de
           12 meses e para o simulador. Aceita vírgula ("300,50") e um campo vazio
           não zera o que você já tinha definido. */
        function saveGuardadoMensal(){
            const input = document.getElementById('simAporte');
            const v = parseValorBR(input ? input.value : '');
            if (isNaN(v) || v < 0){
                if (input) input.value = String(Number(cofrinho.mensal) || 0);
                toast('Informe o quanto você guarda por mês (ex.: 300 ou 300,00).', 'error');
                runCdiSimulator();
                return;
            }
            cofrinho.mensal = round2(v);
            if (input) input.value = String(cofrinho.mensal);
            if (typeof persist === 'function') persist();
            renderCofrinho();
            runCdiSimulator();
            toast('Guardado mensal: ' + money(cofrinho.mensal) + ' por mês.');
        }

        /* Total investido = guardado mensal × prazo (a conta fica visível) */
        function runCdiSimulator(){
            const input = document.getElementById('simAporte');
            const digitado = parseValorBR(input ? input.value : '');
            const aporte = (isNaN(digitado) || digitado < 0)
                ? Math.max(0, round2(Number(cofrinho.mensal) || 0))
                : round2(digitado);
            const meses = parseInt((document.getElementById('simPrazo') || {}).value, 10) || 12;
            const investido = round2(aporte * meses);
            const finais = round2(cfProjection(0, aporte, meses));
            const rend = round2(finais - investido);
            setText('simInvestido', money(investido), investido);
            setText('simRendimento', money(rend), rend);
            setText('simFinal', money(finais), finais);
            setText('simFormula', money(aporte) + ' × ' + meses + ' meses = ' + money(investido), investido);
            return finais;
        }

