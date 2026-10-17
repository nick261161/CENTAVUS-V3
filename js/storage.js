/* Extraído de index.html — scripts clássicos, carregados na ordem abaixo.
   ==========================================================================
   CENTAVUS — CAMADA DE DADOS (item 2 e 3)
   • fonte de verdade: banco do servidor, separado por usuário
   • cache local (localStorage) para abrir rápido e funcionar sem conexão
   • toda alteração é salva localmente na hora e sincronizada em seguida
   ========================================================================== */
        const STORAGE_KEY='centavus_v2_state';
        const LEGACY_STORAGE_KEY='centavus_v2_state';
        let budgets=[]; // primeira vez: nenhum orçamento definido

        // ===== METAS FINANCEIRAS (estado) =====
        let goals=[]; // primeira vez: nenhuma meta criada
        let goalSeq=1;
        const goalIcons=['fa-flag','fa-star','fa-gem','fa-bullseye','fa-car','fa-house','fa-graduation-cap','fa-gift'];
        const goalColors=['#30A080','#8070F0','#40C8A0','#70E0C0','#A090FF','#FFD166'];
        let goalModalMode='create';   // 'create' | 'edit'
        let goalEditId=null;
        let goalValueCtx={id:null,mode:'add'};

        // ===== CONTAS (item 7: corrente, poupança, dinheiro, investimentos…) =====
        let accounts=[];
        let accountSeq=1;
        let transfers=[]; // transferências entre contas (não entram em entradas/saídas)

        /* Lê valor digitado no padrão brasileiro (aceita "1.234,56", "1234,56",
           "1234.56" e "500") — evita que a vírgula vire campo vazio e zere tudo. */
        function parseValorBR(v){
            if(typeof v==='number') return isNaN(v)?NaN:v;
            let t=String(v==null?'':v).replace(/[R$\s]/gi,'');
            if(!t) return NaN;
            const virg=t.indexOf(',')>-1, ponto=t.indexOf('.')>-1;
            if(virg&&ponto) t=t.replace(/\./g,'').replace(',','.');
            else if(virg) t=t.replace(',','.');
            else if(ponto){
                const partes=t.split('.');
                const casas=partes[partes.length-1].length;
                const unico=partes.length===2;
                if(!unico||casas===3) t=t.replace(/\./g,'');
            }
            const n=parseFloat(t);
            return isNaN(n)?NaN:n;
        }

        function money(v){const n=Number(v);if(!isFinite(n))return 'R$ 0,00';return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}

        // ===== SEU NOME (Configurações) =====
        let perfil={ nome:'' }; // primeira vez: sem nome editado

        /* snapshot do que é sincronizado com o servidor */
        function stateSnapshot(){
            return {
                transactions:transactions,budgets:budgets,goals:goals,goalSeq:goalSeq,
                cards:cards,cardSeq:cardSeq,cofrinho:cofrinho,rendaFixa:rendaFixa,
                accounts:accounts,accountSeq:accountSeq,transfers:transfers,perfil:perfil
            };
        }

        /* aplica um estado vindo do servidor (ou do cache) sobre a memória */
        function applyState(x){
            if(!x||typeof x!=='object')return false;
            if(x.transactions) transactions=x.transactions;
            if(x.budgets) budgets=x.budgets;
            if(Array.isArray(x.goals)) goals=x.goals;
            if(x.goalSeq) goalSeq=x.goalSeq;
            if(Array.isArray(x.cards)) cards=x.cards;
            if(x.cardSeq) cardSeq=x.cardSeq;
            if(x.cofrinho&&typeof x.cofrinho==='object'){cofrinho=Object.assign(cofrinho,x.cofrinho);if(!Array.isArray(cofrinho.hist))cofrinho.hist=[];}
            if(x.rendaFixa&&Array.isArray(x.rendaFixa.itens)){rendaFixa=x.rendaFixa;if(!Number(rendaFixa.seq))rendaFixa.seq=1;}
            if(Array.isArray(x.accounts)) accounts=x.accounts;
            if(x.accountSeq) accountSeq=x.accountSeq;
            if(Array.isArray(x.transfers)) transfers=x.transfers;
            if(x.perfil&&typeof x.perfil==='object') perfil=Object.assign({nome:''},x.perfil);
            /* o nome editado nas Configurações reflete no topo e no modal */
            if(typeof applyUserToUI==='function'){ try{applyUserToUI();}catch(e){} }
            return true;
        }

        function hasData(x){
            if(!x)return false;
            return !!((x.transactions&&x.transactions.length)||(x.goals&&x.goals.length)||(x.cards&&x.cards.length)||
                (x.budgets&&x.budgets.length)||(x.accounts&&x.accounts.length)||
                (x.cofrinho&&(Number(x.cofrinho.saldo)||0))||(x.rendaFixa&&x.rendaFixa.itens&&x.rendaFixa.itens.length));
        }

        function stateKeyFor(uid){return uid?STORAGE_KEY+'_u'+uid:STORAGE_KEY;}
        function lastUid(){try{return localStorage.getItem('centavus_last_uid')||''}catch(e){return ''}}

        /* grava localmente (cache) e agenda a sincronização com o servidor */
        function persist(){
            const json=JSON.stringify(stateSnapshot());
            try{
                localStorage.setItem(stateKeyFor(lastUid()),json);
                if(lastUid())localStorage.setItem(LEGACY_STORAGE_KEY,json); /* espelho p/ versões antigas */
            }catch(e){}
            scheduleServerSync();
            if(typeof renderAnalysis==='function'){try{renderAnalysis();}catch(e){}}
        }

        function restore(){
            const keys=[stateKeyFor(lastUid()),LEGACY_STORAGE_KEY];
            for(const k of keys){
                try{
                    const x=JSON.parse(localStorage.getItem(k)||'null');
                    if(x&&typeof x==='object'){applyState(x);return;}
                }catch(e){}
            }
        }

        /* ---------- sincronização com o servidor ---------- */
        let syncTimer=null, syncInFlight=false, syncPending=false, offlineWarned=false;

        function scheduleServerSync(){
            if(!lastUid())return;                       /* ainda não entrou em conta nenhuma */
            clearTimeout(syncTimer);
            syncTimer=setTimeout(pushState,700);
        }

        async function pushState(){
            if(!lastUid())return;
            if(syncInFlight){syncPending=true;return;}
            syncInFlight=true;
            try{
                await apiPut('/api/me/state',{state:stateSnapshot()});
                offlineWarned=false;
            }catch(err){
                if(err&&err.network){
                    if(!offlineWarned){offlineWarned=true;toast('Sem conexão: suas alterações ficaram salvas neste dispositivo e serão sincronizadas depois.','error');}
                    syncPending=true;
                }else if(err&&err.status===401){ /* sessão expirou: o login avisa */ }
                else{ console.warn('[centavus] sync:',err&&err.message); }
            }finally{
                syncInFlight=false;
                if(syncPending){syncPending=false;setTimeout(pushState,4000);}
            }
        }

        /* após entrar: servidor manda; se a conta estiver vazia, enviamos o que existe no aparelho.
           ATENÇÃO: nunca cair na chave "legada" aqui — ela é um espelho escrito pela conta ANTERIOR
           e faria uma conta nova herdar as finanças de quem usou o navegador antes. */
        async function syncAfterLogin(){
            const local=JSON.parse(localStorage.getItem(stateKeyFor(lastUid()))||'null');
            const data=await apiGet('/api/me/state');
            const remote=data&&data.state;
            if(hasData(remote)){
                applyState(remote);
                try{localStorage.setItem(stateKeyFor(lastUid()),JSON.stringify(stateSnapshot()));}catch(e){}
            }else if(hasData(local)){
                applyState(local);
                await pushState();
            }
            renderAllData();
            refreshDashboard();
        }

        /* renders de dados (usado no boot e a cada troca de conta) */
        function renderAllData(){ if(typeof generateRecurring==='function')generateRecurring(); renderGoals(); renderCards(); accrueCofrinho(); renderCofrinho(); runCdiSimulator(); rfRenderList(); if(typeof renderAccounts==='function')renderAccounts(); if(typeof fillAccountsSelect==='function')fillAccountsSelect(); }
        function refreshDashboard(){
            try{
                applyFilters();
                updateSummaryCards();
                recomputeChartTotals();
                if(document.getElementById('calGrid'))renderCalendar();
                updateV2();
                renderBudgets();
                if(typeof renderAnalysis==='function')renderAnalysis();
                if(typeof renderPremiumExtras==='function')renderPremiumExtras();
            }catch(e){console.warn('[centavus] refresh:',e&&e.message);}
        }

        /* flush ao sair da página: garante que nada fique só na memória */
        window.addEventListener('beforeunload',()=>{
            const local=(typeof cvIsLocal==='function')&&cvIsLocal();
            if(syncTimer&&lastUid()&&!local){clearTimeout(syncTimer);syncTimer=null;
                try{fetch('/api/me/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:stateSnapshot()}),credentials:'same-origin',keepalive:true});}catch(e){}
            }
        });

        function toast(msg,type='success'){
            let t=document.getElementById('cvToast');
            if(!t){t=document.createElement('div');t.id='cvToast';t.className='toast';document.body.appendChild(t)}
            /* seguro contra XSS: o ícone vira elemento e a mensagem entra como TEXTO
               (vários avisos interpolem nomes digitados pelo usuário) */
            const box=document.createElement('div');
            box.className='centavus-card px-4 py-3 border border-white/10 text-sm';
            const ic=document.createElement('i');
            ic.className='fa-solid '+(type==='error'?'fa-circle-exclamation':'fa-circle-check')+' text-[#40C8A0] mr-2';
            const span=document.createElement('span');
            span.textContent=String(msg);
            box.appendChild(ic);box.appendChild(span);
            t.innerHTML='';t.appendChild(box);
            t.classList.add('show');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove('show'),2500)}
