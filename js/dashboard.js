/* Extraído de index.html — scripts clássicos, carregados na ordem abaixo. */
        async function deleteTransaction(id){
            const item=transactions.find(x=>x.id===id);
            if(!item)return;
            const ok=await cvConfirm({titulo:'Excluir esta movimentação?',mensagem:'“'+item.desc+'” será apagada do seu histórico. Essa ação não pode ser desfeita.',okLabel:'Excluir'});
            if(!ok)return;
            if(item.pay==='credito'&&item.cardId!=null){const c=cards.find(x=>String(x.id)===String(item.cardId));if(c){const parc=Math.abs(Number(item.amount)||0);const mult=1+(Array.isArray(item.antecipadas)?item.antecipadas.length:0);c.fatura=Math.max(0,round2((Number(c.fatura)||0)-parc*mult));}}
            transactions=transactions.filter(x=>x.id!==id);
            persist();
            applyFilters();
            updateSummaryCards();
            updateV2();
            renderCards();
            if(typeof renderAccounts==='function')renderAccounts();
            if(document.getElementById('calGrid'))renderCalendar();
            toast('Transação excluída.')
        }
        function editTransaction(id){const item=transactions.find(x=>x.id===id);if(!item)return;openModal();const parc=(parseInt(item.parcelas,10)||1);document.getElementById('inputDesc').value=item.desc;document.getElementById('inputValue').value=(parc>1&&item.total!=null)?Math.abs(item.total):Math.abs(item.amount);document.getElementById('inputCategory').value=item.cat==='Receita'?'Outros':item.cat;document.getElementById('inputMonth').value=item.month;if(typeof fillYearSelect==='function')fillYearSelect(item.iso);document.getElementById('transactionForm').dataset.editId=id;document.querySelector(`input[name="type"][value="${item.amount>0?'receita':'despesa'}"]`).checked=true;updateCategoryOptions();const payVal=(item.pay&&PAY_METHODS[item.pay])?item.pay:'pix';const payRadio=document.querySelector(`input[name="pay"][value="${payVal}"]`);if(payRadio)payRadio.checked=true;updatePayFields();const ps=document.getElementById('inputParcelas');if(ps)ps.value=String(parc);const cs=document.getElementById('inputCard');if(cs&&item.cardId!=null&&Array.prototype.some.call(cs.options,o=>o.value===String(item.cardId)))cs.value=String(item.cardId);updateInstallHint();const acc=document.getElementById('inputAccount');if(acc)acc.value=(item.accId!=null&&acc.querySelector(`option[value="${String(item.accId)}"]`))?String(item.accId):'';const rec=document.getElementById('inputRecorrente');if(rec)rec.checked=!!item.recorrente;}
        function renderBudgets(){const el=document.getElementById('budgetGrid');if(!el)return;if(!budgets.length){el.innerHTML=`<div class="col-span-full text-center py-6 text-xs text-[#6F807C]"><i class="fa-solid fa-chart-simple text-2xl block mb-2 text-[#30A080]"></i>Você ainda não definiu orçamentos. Clique em “Editar orçamento” para começar.</div>`;return;}el.innerHTML=budgets.map(b=>{const spent=transactions.filter(t=>t.cat===b.name&&t.amount<0&&txNoMesFoco(t)).reduce((s,t)=>s+Math.abs(t.amount),0);const lim=Number(b.limit)||0;const pct=lim>0?Math.min(100,spent/lim*100):0;return `<div class="bg-[#102020] rounded-2xl p-4 border border-white/5"><div class="flex justify-between"><span class="text-xs font-semibold"><i class="fa-solid ${b.icon} text-[#70E0C0] mr-2"></i>${b.name}</span><span class="text-[11px] text-[#A8B5B2]">${Math.round(pct)}%</span></div><div class="budget-bar mt-3"><div class="budget-fill ${pct>=90?'bg-[#8070F0]':'bg-[#30A080]'}" style="width:${pct}%"></div></div><div class="flex justify-between mt-2 text-[11px]"><span>${money(spent)}</span><span class="text-[#6F807C]">de ${money(lim)}</span></div></div>`}).join('')}
        function renderInsights(){
            const cur=mesFocadoCur();
            const dentro=txNoMesFoco;
            const tot=totaisDoMesFoco();
            const inc=tot.inc, /* entradas do mês focado, já com a Renda Fixa (salário) */
                  out=tot.out;
            const top=[...transactions.filter(t=>dentro(t)&&t.amount<0)].sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount))[0];
            const onde=cur?('em '+cur):'no total';
            document.getElementById('insights').innerHTML=
              `<div class="p-3 rounded-xl bg-[#102020]"><p class="text-xs font-semibold">${inc>out?'Boa margem de caixa':'Atenção ao caixa'} <span class="text-[#6F807C] font-normal">· ${cur||'Todos os meses'}</span></p><p class="text-[11px] text-[#6F807C] mt-1">Você tem ${money(Math.abs(inc-out))} de diferença entre entradas e saídas ${onde}.</p></div>`+
              `<div class="p-3 rounded-xl bg-[#102020]"><p class="text-xs font-semibold">Maior gasto ${onde}</p><p class="text-[11px] text-[#6F807C] mt-1">${top?((typeof escapeHtml==='function'?escapeHtml:String(top.desc))+' — '+money(Math.abs(top.amount))):'Nenhum gasto registrado'+(cur?' em '+cur:'')+'.'}</p></div>`+
              `<div class="p-3 rounded-xl bg-[#102020]"><p class="text-xs font-semibold">Dica</p><p class="text-[11px] text-[#6F807C] mt-1">Troque o mês do painel para ver entradas, gastos e saldo mês a mês.</p></div>`;
        }
        /* rótulo do mês ('Jan'...'Dez') de uma movimentação */
        function txMonthLabel(t){
            const iso=txIso(t);
            if(iso){const m=parseInt(iso.slice(5,7),10)-1;if(m>=0&&m<12) return MONTHS_SHORT[m];}
            return t.month;
        }
        /* selos dos cartões-herói: mostram o que existe de verdade no mês focado */
        function updateHeroBadges(){
            const set=(id,html)=>{const el=document.getElementById(id);if(el) el.innerHTML=html;};
            const cur=mesFocadoCur();
            const count=dir=>transactions.filter(t=>((Number(t.amount)||0)*dir)>0&&txNoMesFoco(t)).length;
            const rfR=rfReceitaFoco();
            const incN=count(1)+rfR.qtd, outN=count(-1);
            const chip=(cls,icon,label)=>`<span class="inline-flex items-center gap-1 text-xs font-semibold ${cls} px-2.5 py-0.5 rounded-full"><i class="fa-solid ${icon} text-[10px]"></i> ${label}</span>`;
            const suffix=`<span class="text-xs text-[#6F807C]">${cur?('em '+cur):'todos os meses'}</span>`;
            set('badgeBalance', chip('text-[#40C8A0] bg-[#30A080]/15','fa-wallet','Consolidado')+'<span class="text-xs text-[#6F807C]">extrato + cofrinho</span>');
            set('badgeIncome', incN
                ? chip('text-[#40C8A0] bg-[#30A080]/15','fa-arrow-down',incN+(incN===1?' receita':' receitas'))+suffix
                : chip('text-[#A8B5B2] bg-[#203030]','fa-circle-minus','sem receitas')+suffix);
            set('badgeExpense', outN
                ? chip('text-[#A090FF] bg-[#8070F0]/15','fa-arrow-up',outN+(outN===1?' despesa':' despesas'))+suffix
                : chip('text-[#A8B5B2] bg-[#203030]','fa-circle-minus','sem despesas')+suffix);
        }
        /* recalcula gráfico de categorias, gráfico de receitas por mês e totais do topo
           a partir das transações reais (mantém os gráficos reativos a altas/exclusões) */
        function recomputeChartTotals(){
            categoriesData.forEach(c=>{c.val=0});
            transactions.forEach(t=>{
                const amount=Number(t.amount)||0;
                if(amount>=0) return;
                if(!txNoMesFoco(t)) return; /* distribuição por categoria do mês focado */
                const target=categoriesData.find(c=>c.name===t.cat)||categoriesData[categoriesData.length-1];
                if(target) target.val=Math.round((target.val+Math.abs(amount))*100)/100;
            });
            monthlyData=monthsLabels.map(()=>0);
            transactions.forEach(t=>{
                const amount=Number(t.amount)||0;
                if(amount<=0) return;
                const idx=monthsLabels.indexOf(txMonthLabel(t));
                if(idx>-1 && txNoMesAnoRef(t,idx)) monthlyData[idx]=Math.round((monthlyData[idx]+amount)*100)/100;
            });
            /* Renda Fixa reconhecida como RECEITA: o salário entra em cada mês do período dele */
            monthsLabels.forEach((_,i)=>{
                const r=rfReceitaNoMes(i);
                if(r.valor>0) monthlyData[i]=round2(monthlyData[i]+r.valor);
            });
            /* despesas/gastos por mês (alimenta as colunas do gráfico de gastos) */
            monthlyOutData=monthsLabels.map(()=>0);
            transactions.forEach(t=>{
                const amount=Number(t.amount)||0;
                if(amount>=0) return;
                const idx=monthsLabels.indexOf(txMonthLabel(t));
                if(idx>-1 && txNoMesAnoRef(t,idx)) monthlyOutData[idx]=Math.round((monthlyOutData[idx]+Math.abs(amount))*100)/100;
            });
            updateVisaoChart();
            if(expChartInstance){
                const ds=expChartInstance.data.datasets;
                if(ds[0])ds[0].data=monthlyData;      /* coluna verde = entradas (com salário) */
                if(ds[1])ds[1].data=monthlyOutData;   /* coluna coral = saídas */
                expChartInstance.update();
            }
            renderCategoryLegends();
            const incEl=document.getElementById('totalIncomeDisplay');
            const inc=totaisDoMesFoco().inc;
            if(incEl){incEl.dataset.value=inc;if(!isPrivacyHidden)incEl.innerText=money(inc)}
            updateHeroBadges();
            updateExpSummary();
        }
        /* nome do mês por extenso (0-11) */
        function mesNomeCompleto(i){
            const b = (typeof CAL_MONTHS_FULL !== 'undefined' && CAL_MONTHS_FULL[i]) ? CAL_MONTHS_FULL[i] : '';
            return b ? b.charAt(0).toUpperCase() + b.slice(1) : '';
        }
        function updateV2(){
            recomputeChartTotals();
            fillMonthFocusSelect();
            /* saldo = movimentação acumulada ATÉ o mês focado (em "Todos os meses" = tudo)
               A Renda Fixa já entra como RECEITA (monthlyData / rfReceitaTotal) */
            let incAte = 0, outAte = 0;
            if (selectedMonthIndex < 0){
                transactions.forEach(t => { const a = Number(t.amount) || 0; if (a > 0) incAte += a; else if (a < 0) outAte += Math.abs(a); });
                incAte += rfReceitaTotal().valor;
            } else {
                for (let i = 0; i <= selectedMonthIndex; i++){ incAte += monthlyData[i] || 0; outAte += monthlyOutData[i] || 0; }
            }
            incAte = round2(incAte); outAte = round2(outAte);
            const cof = Number(cofrinho.saldo) || 0;
            countUpTo(document.getElementById('availableBalance'), incAte-outAte, money);
            countUpTo(document.getElementById('totalBalanceDisplay'), incAte-outAte+cof, money);
            /* taxa de economia do mês focado */
            const tot = totaisDoMesFoco();
            countUpTo(document.getElementById('savingRate'), (tot.inc ? 100*(tot.inc-tot.out)/tot.inc : 0), v=>v.toFixed(1).replace('.',',')+'%');
            const hSaldo = document.getElementById('availableBalanceHint');
            if (hSaldo) hSaldo.innerText = (selectedMonthIndex < 0 || selectedMonthIndex === new Date().getMonth())
                ? 'Entradas − saídas (com salário)'
                : 'Extrato até ' + mesNomeCompleto(selectedMonthIndex) + ' + cofrinho';
            const hTaxa = document.getElementById('savingRateHint');
            if (hTaxa) hTaxa.innerText = (selectedMonthIndex < 0) ? 'Do total recebido' : ('Em ' + (mesFocadoCur() || ''));
            const totalBudget=budgets.reduce((s,b)=>s+b.limit,0);
            countUpTo(document.getElementById('budgetUsed'), (totalBudget?100*tot.out/totalBudget:0), v=>Math.round(v)+'%');
            const hint=document.getElementById('budgetUsedHint');
            if(hint) hint.innerText = totalBudget ? ('Meta mensal de '+money(totalBudget)) : 'Nenhum orçamento definido';
            renderBudgets(); renderInsights(); applyPrivacyState();
        }
        /* números animados (contador crescente) nos indicadores */
        function countUpTo(el, target, fmt){
            if(!el) return;
            if(isPrivacyHidden && el.classList.contains('confidential-value')){ el.classList.add('value-hidden'); el.innerText='••••••••'; return; }
            const prev=parseFloat(el.dataset.cvNum);
            const start=isNaN(prev)?0:prev;
            el.dataset.cvNum=target;
            if(Math.abs(target-start)<0.005){ el.textContent=fmt(target); return; }
            if(!('requestAnimationFrame' in window)||window.matchMedia('(prefers-reduced-motion: reduce)').matches){ el.textContent=fmt(target); return; }
            if(el._cvRaf) cancelAnimationFrame(el._cvRaf);
            const dur=700, t0=performance.now();
            const step=now=>{
                const p=Math.min(1,(now-t0)/dur);
                const eased=1-Math.pow(1-p,3);
                el.textContent=fmt(start+(target-start)*eased);
                if(p<1) el._cvRaf=requestAnimationFrame(step);
            };
            el._cvRaf=requestAnimationFrame(step);
        }
        /* mantém a privacidade visível mesmo após recálculos */
        function applyPrivacyState(){
            if(!isPrivacyHidden) return;
            document.querySelectorAll('.confidential-value').forEach(el=>{
                if(el.innerText!=='••••••••'){ el.classList.add('value-hidden'); el.innerText='••••••••'; }
            });
        }
        const _oldLoad=window.onload;window.onload=function(){restore();renderAllData();if(_oldLoad)_oldLoad();setTimeout(updateV2,50);setTimeout(initExperience,60)};
        const _oldAdd=window.handleAddTransaction;window.handleAddTransaction=function(e){const form=e.currentTarget,id=form.dataset.editId; if(id){e.preventDefault();const item=transactions.find(x=>x.id==id);if(!item){delete form.dataset.editId;closeModal();return}
            /* efeito antigo na fatura (compra no crédito já vinculada) */
            const oldCard=(item.pay==='credito'&&item.cardId!=null)?cards.find(c=>String(c.id)===String(item.cardId)):null;
            const oldEff=oldCard?Math.abs(Number(item.amount)||0)*(1+(Array.isArray(item.antecipadas)?item.antecipadas.length:0)):0;
            if(oldCard)oldCard.fatura=Math.max(0,round2((Number(oldCard.fatura)||0)-oldEff));
            const type=document.querySelector('input[name="type"]:checked').value;
            const isIncome=type==='receita';
            item.desc=document.getElementById('inputDesc').value;
            const payEl=document.querySelector('input[name="pay"]:checked');if(payEl)item.pay=payEl.value;
            /* cartão + parcelamento recalculados */
            const card=(!isIncome&&(item.pay==='credito'||item.pay==='debito'))?selectedCard():null;
            let parcelas=1;
            if(!isIncome&&item.pay==='credito'){const ps=document.getElementById('inputParcelas');parcelas=Math.max(1,Math.min(60,parseInt(ps?ps.value:'1',10)||1));}
            const val=Math.abs(Number(document.getElementById('inputValue').value)||0);
            item.parcelas=parcelas;item.total=round2(val);
            item.cardId=card?card.id:null;item.cardNome=card?card.name:null;
            item.amount=isIncome?val:(parcelas>1?-round2(val/parcelas):-val);
            item.cat=document.getElementById('inputCategory').value;
            const mSel=document.getElementById('inputMonth').value;item.month=mSel;const mIdx=MONTHS_SHORT.indexOf(mSel);if(mIdx>=0){const base=item.iso?new Date(item.iso+'T00:00:00'):new Date();const baseOk=!isNaN(base.getTime());const ySel=parseInt((document.getElementById('inputYear')||{}).value,10);const y=(ySel>1900)?ySel:(baseOk?base.getFullYear():new Date().getFullYear());const dOld=baseOk?base.getDate():new Date().getDate();const d=new Date(y,mIdx,Math.min(dOld,new Date(y,mIdx+1,0).getDate()));item.iso=toIso(d);item.date=pad2(d.getDate())+' '+mSel;}
            /* a edição invalida antecipações feitas (o plano de parcelas pode ter mudado) */
            item.antecipadas=[];
            /* conta vinculada + recorrência mensal */
            const accEl=document.getElementById('inputAccount');
            item.accId=(accEl&&accEl.value)?accEl.value:null;
            const recEl=document.getElementById('inputRecorrente');
            const querRec=!!(recEl&&recEl.checked);
            if(querRec){ if(!item.recorrente||!item.proxIso){ item.recorrente=true; item.proxIso=nextMonthIso(item.iso||toIso(new Date())); } }
            else { delete item.recorrente; delete item.proxIso; }
            /* efeito novo na fatura */
            const newCard=(item.pay==='credito'&&item.cardId!=null)?cards.find(c=>String(c.id)===String(item.cardId)):null;
            const newEff=newCard?Math.abs(Number(item.amount)||0):0;
            if(newCard)newCard.fatura=round2((Number(newCard.fatura)||0)+newEff);
            delete form.dataset.editId;closeModal();persist();applyFilters();updateSummaryCards();updateV2();renderCards();if(typeof renderAccounts==='function')renderAccounts();toast('Transação atualizada.');return}if(_oldAdd)_oldAdd(e);setTimeout(()=>{persist();updateV2();},50)};
        /* ==========================================================================
           ORÇAMENTO — modal real (sem prompts) com lista editável
           ========================================================================== */
        const BUDGET_CATS = ['Alimentação', 'Roupas', 'Transporte', 'Lazer', 'Outros'];
        const BUDGET_ICONS = { 'Alimentação': 'fa-utensils', 'Roupas': 'fa-shirt', 'Transporte': 'fa-car', 'Lazer': 'fa-gamepad', 'Outros': 'fa-box-open' };

