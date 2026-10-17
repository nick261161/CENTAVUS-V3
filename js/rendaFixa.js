/* Extraído de index.html — scripts clássicos, carregados na ordem abaixo. */
        /* ==========================================================================
           RENDA FIXA — cálculo, simulação e carteira de aplicações
           ========================================================================== */
        /* Renda Fixa das Configurações: sem CDI, juros ou IR — só registra o valor informado. */
        /* data final = início + prazo em meses */
        function rfEndDate(iso, prazo){
            const start = new Date(String(iso || '') + 'T00:00:00');
            if (isNaN(start.getTime())) return '';
            const p = Math.max(1, Math.round(Number(prazo) || 1));
            const end = new Date(start.getFullYear(), start.getMonth() + p, start.getDate());
            return toIso(end);
        }

        /* Só o valor digitado — sem rendimento, sem CDI, sem IR. */
        function rfCalc(item){
            const prazo = Math.max(1, Math.round(Number(item.prazo) || 1));
            const valor = round2(Number(item.valor) || 0);
            const inicio = String(item.dataIni || '');
            return {
                prazo: prazo, valor: valor, inicio: inicio, fim: rfEndDate(inicio, prazo),
                aplicado: valor, aplicadoHoje: valor,
                fvHoje: valor, rendHoje: 0, rend: 0
            };
        }
        function rfTotals(){
            let aplicado = 0, atual = 0;
            rendaFixa.itens.forEach(it => { const c = rfCalc(it); aplicado += c.aplicadoHoje; atual += c.fvHoje; });
            return { aplicado: round2(aplicado), atual: round2(atual), rend: round2(atual - aplicado) };
        }

        /* ==========================================================================
           RENDA FIXA COMO RECEITA — o valor do salário conta como entrada no painel
           (gráfico "Visão financeira do mês", Entradas no Mês, taxa de economia e saldo)
           ========================================================================== */
        /* O salário fica FIXO pelo prazo cadastrado (padrão 12 meses) a partir da
           data inicial: ele é reconhecido como ENTRADA em cada mês desse período,
           alimentando os gráficos, os cartões do topo e a taxa do mês. */
        function rfNoJanela(y, m){
            let valor = 0, qtd = 0;
            (rendaFixa.itens || []).forEach(it => {
                const d = new Date(String(it.dataIni || '') + 'T00:00:00');
                if (isNaN(d.getTime())) return;
                const prazo = Math.max(1, Math.round(Number(it.prazo) || 12));
                const ini = d.getFullYear() * 12 + d.getMonth();
                const alvo = y * 12 + m;
                if (alvo < ini || alvo >= ini + prazo) return;
                const v = round2(Number(it.valor) || 0);
                if (v > 0){ valor = round2(valor + v); qtd++; }
            });
            return { valor: valor, qtd: qtd };
        }
        /* Receita do registro no mês 0-11 do ano de referência do calendário */
        function rfReceitaNoMes(idx){
            return rfNoJanela(anoReferencia(), idx);
        }
        /* Receita acumulada até o mês de referência — visão "Todos os meses" */
        function rfReceitaTotal(){
            const y = anoReferencia();
            const ref = (typeof dataReferencia === 'function') ? dataReferencia() : new Date();
            let valor = 0, qtd = 0;
            for (let m = 0; m <= ref.getMonth(); m++){
                const r = rfNoJanela(y, m);
                valor = round2(valor + r.valor);
                qtd += r.qtd;
            }
            return { valor: valor, qtd: qtd };
        }
        /* Receita de Renda Fixa do mês focado (mês 0-11, ou o total quando é "Todos os meses") */
        function rfReceitaFoco(){
            return (typeof selectedMonthIndex !== 'undefined' && selectedMonthIndex < 0)
                ? rfReceitaTotal()
                : rfReceitaNoMes(typeof selectedMonthIndex !== 'undefined' ? selectedMonthIndex : new Date().getMonth());
        }
        function rfShowError(msg){ const el = document.getElementById('rfError'); if (!el) return; el.textContent = msg || ''; el.style.display = msg ? 'block' : 'none'; }
        function rfReadForm(){
            const tipo = document.getElementById('rfTipo').value;
            const valor = parseValorBR(document.getElementById('rfValor').value);
            const prazo = parseInt(document.getElementById('rfPrazo').value, 10);
            const dataIni = document.getElementById('rfInicio').value;
            if (isNaN(valor) || valor <= 0) return { err: 'Informe o valor do salário (maior que zero — aceita 3000 ou 3.000,00).' };
            if (isNaN(prazo) || prazo < 1) return { err: 'Informe por quantos meses o salário vale (mínimo 1).' };
            if (!dataIni) return { err: 'Informe a data de início.' };
            return { item: { tipo: tipo, valor: round2(valor), prazo: prazo, dataIni: dataIni } };
        }
        function clearRfForm(){
            const form = document.getElementById('rfForm');
            if (!form) return;
            form.reset();
            document.getElementById('rfPrazo').value = 12;
            document.getElementById('rfInicio').value = toIso(new Date());
            rfEditId = null;
            document.getElementById('rfDeleteBtn').classList.add('hidden');
            rfShowError('');
        }
        function handleRfSubmit(ev){
            ev.preventDefault();
            const r = rfReadForm();
            if (r.err){ rfShowError(r.err); return; }
            rfShowError('');
            const editing = rfEditId;
            if (editing){
                const it = rendaFixa.itens.find(x => x.id === editing);
                if (it) Object.assign(it, r.item);
                toast('Registro atualizado.');
            } else {
                const id = Number(rendaFixa.seq) || 1;
                rendaFixa.seq = id + 1;
                rendaFixa.itens.push(Object.assign({ id: id }, r.item));
                toast('Valor salvo na Renda Fixa.');
            }
            persist();
            clearRfForm();
            rfRenderList();
            updateV2();
        }
        async function deleteRfFromModal(){
            if (!rfEditId) return;
            const ok = await cvConfirm({ titulo: 'Excluir este registro?', mensagem: 'O investimento de Renda Fixa será removido da sua carteira.', okLabel: 'Excluir registro' });
            if (!ok) return;
            rendaFixa.itens = rendaFixa.itens.filter(x => x.id !== rfEditId);
            persist();
            clearRfForm();
            rfRenderList();
            updateV2();
            toast('Registro excluído.');
        }
        function rfLoadItem(id){
            const it = rendaFixa.itens.find(x => x.id === id);
            if (!it) return;
            rfEditId = it.id;
            document.getElementById('rfTipo').value = it.tipo;
            document.getElementById('rfValor').value = it.valor;
            document.getElementById('rfPrazo').value = it.prazo;
            document.getElementById('rfInicio').value = it.dataIni;
            document.getElementById('rfDeleteBtn').classList.remove('hidden');
            rfShowError('');
        }
        function rfRenderList(){
            const list = document.getElementById('rfList');
            const count = document.getElementById('rfCount');
            const totals = document.getElementById('rfTotals');
            if (!list) return;
            if (count) count.textContent = rendaFixa.itens.length + (rendaFixa.itens.length === 1 ? ' registro' : ' registros');
            if (!rendaFixa.itens.length){
                list.innerHTML = '<p class="text-center text-xs text-[#6F807C] py-4">Nenhum registro ainda — digite o valor do salário acima e clique em <b class="text-[#70E0C0]">Salvar</b>.</p>';
                if (totals) totals.innerHTML = '';
                return;
            }
            const brl = iso => String(iso || '').split('-').reverse().join('/');
            list.innerHTML = rendaFixa.itens.map(it => {
                const c = rfCalc(it);
                const periodo = brl(c.inicio) + (c.fim ? ' → ' + brl(c.fim) : '');
                return '<div class="bg-[#102020] border border-white/5 rounded-xl p-3 flex items-center justify-between gap-3 cursor-pointer hover:border-[#30A080]/40 transition" onclick="rfLoadItem(' + it.id + ')">' +
                    '<div class="min-w-0"><p class="text-xs font-bold text-[#F5F7F6] truncate"><span class="text-[#70E0C0]">' + escapeHtml(it.tipo) + '</span>' +
                    ' <span class="text-[#6F807C] font-normal">' + periodo + '</span></p>' +
                    '<p class="text-[10px] text-[#6F807C] mt-0.5">' + c.prazo + ' meses · registro de salário</p></div>' +
                    '<div class="text-right shrink-0"><p class="text-sm font-bold text-[#40C8A0]">' + money(c.valor) + '</p></div></div>';
            }).join('');
            const tt = rfTotals();
            if (totals) totals.innerHTML =
                '<div class="bg-[#102020] rounded-xl p-2.5 border border-white/5 text-center"><p class="text-[10px] text-[#6F807C]">Salário</p><strong class="text-xs text-[#F5F7F6]">' + money(tt.aplicado) + '</strong></div>' +
                '<div class="bg-[#102020] rounded-xl p-2.5 border border-white/5 text-center"><p class="text-[10px] text-[#6F807C]">Registros</p><strong class="text-xs text-[#70E0C0]">' + rendaFixa.itens.length + '</strong></div>';
        }
        function openRendaFixa(){
            closeSettings();
            const modal = document.getElementById('rfModal');
            if (!modal) return;
            if (!document.getElementById('rfInicio').value) document.getElementById('rfInicio').value = toIso(new Date());
            rfRenderList();
            modal.classList.remove('hidden');
        }
        function closeRendaFixa(){ const m = document.getElementById('rfModal'); if (m) m.classList.add('hidden'); }
        /* Clique no card "Saldo disponível" → abre a Renda Fixa com o campo do salário pronto */
        function openSalaryFromBalance(){
            openRendaFixa();
            const el = document.getElementById('rfValor');
            if (!el) return;
            try { el.scrollIntoView({ block: 'center' }); } catch(e){}
            el.focus();
            if (el.select) el.select();
        }

        async function resetDemoData() {
            const ok = await cvConfirm({
                titulo: 'Limpar os dados desta conta?',
                mensagem: 'Transações, metas, cartões, cofrinho e orçamentos serão apagados do servidor e deste aparelho. Essa ação não pode ser desfeita.',
                okLabel: 'Limpar tudo'
            });
            if (!ok) return;
            transactions=[]; budgets=[]; goals=[]; goalSeq=1;
            cards=[]; cardSeq=1; accounts=[]; accountSeq=1;
            cofrinho={saldo:0,cdi:Number(cofrinho.cdi)||14.9,lastYieldAt:cofrinho.lastYieldAt||null,hist:[]};
            rendaFixa={itens:[],seq:1};
            try { localStorage.removeItem(stateKeyFor(lastUid())); } catch (e) {}
            persist();
            renderAllData();
            refreshDashboard();
            toast('Dados da conta apagados.');
        }

        function initExperience() {
            initTheme();
            initMode();
            buildNotifs();
            initReveal();
            hideSplash();
        }
