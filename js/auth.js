/* Extraído de index.html — scripts clássicos, carregados na ordem abaixo.
   ==========================================================================
   CENTAVUS — AUTENTICAÇÃO (conta real no servidor)
   • login / cadastro / logout / recuperação de senha → API Node (SQLite)
   • a sessão vive em um cookie httpOnly guardado no servidor
   • a senha nunca chega ao navegador depois de enviada (bcrypt no servidor)
   ========================================================================== */
        // ===== LOGIN EXPERIENCE =====
        const loginQuotes = [
            ['“Organizar o dinheiro hoje é abrir espaço para realizar amanhã.”','Tenha clareza sobre seus gastos, metas e escolhas.'],
            ['“Pequenas decisões financeiras constroem grandes resultados.”','Acompanhe cada passo e transforme intenção em hábito.'],
            ['“Seu orçamento não limita seus sonhos. Ele ajuda a planejá-los.”','Saiba para onde seu dinheiro está indo e decida para onde ele deve ir.'],
            ['“Controle financeiro começa com clareza.”','Visualize sua rotina, defina metas e acompanhe sua evolução.']
        ];
        let loginQuoteIndex=0;
        // e-mail bem formado: parte local com pontos simples, domínio com pelo menos um ponto e TLD de letras
        const EMAIL_RE=/^[A-Za-z0-9_%+-]+(?:\.[A-Za-z0-9_%+-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;
        const MIN_PASSWORD=8;
        const SESSION_KEY='centavus_logged_in';
        const SESSION_CACHE='centavus_session';
        let loginBusy=false;
        let resetToken=null;

        function getCentavusSession(){try{return JSON.parse(localStorage.getItem(SESSION_CACHE)||'null')}catch(e){return null}}
        function setCentavusSession(s){try{ if(s) localStorage.setItem(SESSION_CACHE,JSON.stringify(s)); else localStorage.removeItem(SESSION_CACHE);}catch(e){}}
        function cacheProfile(p){
            if(!p)return;
            setCentavusSession({id:p.id,name:p.name,email:p.email,at:Date.now()});
            try{ localStorage.setItem('centavus_last_uid',String(p.id)); }catch(e){}
            if(p.avatar){ try{localStorage.setItem(AVATAR_KEY,p.avatar);}catch(e){} }
            if(p.settings){
                try{ localStorage.setItem('centavus_settings',JSON.stringify(p.settings)); }catch(e){}
                if(p.settings.theme&&typeof setTheme==='function'&&p.settings.theme!==localStorage.getItem('centavus_theme')) setTheme(p.settings.theme);
                if(p.settings.mode&&typeof setMode==='function'&&p.settings.mode!==localStorage.getItem('centavus_mode')) setMode(p.settings.mode);
            }
        }

        function showLoginError(msg,type,action){
            const el=document.getElementById('loginError');
            if(!el)return;
            el.className='login-error'+(type==='info'?' info':'');
            el.textContent=msg||'';
            if(action&&action.label){
                const sep=document.createTextNode(' ');
                const a=document.createElement('a');
                a.href='#';
                a.className='login-link';
                a.style.marginLeft='4px';
                a.style.fontWeight='700';
                a.textContent=action.label;
                a.addEventListener('click',function(ev){
                    ev.preventDefault();
                    showLoginError('');
                    if(typeof action.fn==='function')action.fn();
                });
                el.appendChild(sep);
                el.appendChild(a);
            }
            el.style.display=msg?'block':'none';
        }

        function nameFromEmail(email){
            const raw=String(email||'').split('@')[0]||'cliente';
            const words=raw.replace(/[._\-+0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);
            if(!words.length)return 'Cliente';
            return words.map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
        }

        function initialsOf(name){
            const parts=String(name||'').split(/\s+/).filter(Boolean);
            return (parts.slice(0,2).map(w=>w.charAt(0).toUpperCase()).join(''))||'CV';
        }

        function applyUserToUI(){
            const session=getCentavusSession();
            if(!session)return;
            /* nome editado nas Configurações > nome da conta > nome derivado do e-mail */
            const editado=(typeof perfil!=='undefined'&&perfil&&perfil.nome)?String(perfil.nome).trim():'';
            const daConta=session.name?String(session.name).trim():'';
            const nome=editado||(daConta&&daConta.indexOf('@')<0?daConta:nameFromEmail(session.email));
            const set=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val;};
            set('userNameDisplay',nome);
            set('userAvatarInitials',initialsOf(nome));
            set('settingsName',nome);
            set('settingsEmail',session.email||'—');
            set('settingsInitials',initialsOf(nome));
            const inp=document.getElementById('settingsNameInput');
            if(inp&&document.activeElement!==inp) inp.value=nome;
            applyAvatar();
        }

        /* Configurações → salvar o nome que aparece no topo do painel */
        function saveProfileName(){
            const el=document.getElementById('settingsNameInput');
            if(!el) return;
            const v=String(el.value||'').replace(/\s+/g,' ').trim().slice(0,40);
            if(v.length<2){ toast('Digite um nome com pelo menos 2 letras.','error'); el.focus(); return; }
            perfil={nome:v};
            if(typeof persist==='function'){ try{persist();}catch(e){} }
            applyUserToUI();
            try{ if(typeof renderCards==='function') renderCards(); }catch(e){} /* titular dos cartões */
            toast('Nome atualizado: '+v+'.');
        }

        function setLoginScreen(open){
            const ls=document.getElementById('loginScreen');
            if(!ls)return;
            document.body.classList.toggle('no-scroll',open);
            if(open){
                ls.style.display='flex';
                requestAnimationFrame(()=>requestAnimationFrame(()=>ls.classList.remove('login-leaving')));
            }else{
                ls.classList.add('login-leaving');
                setTimeout(()=>{ls.style.display='none';},350);
            }
        }

        function setSubmitLoading(loading){
            const btn=document.getElementById('loginSubmit');
            if(!btn)return;
            btn.disabled=loading;
            btn.style.opacity=loading?'.75':'';
            btn.style.cursor=loading?'wait':'';
            btn.innerHTML=loading
                ? '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i> Entrando...'
                : '<i class="fa-solid fa-right-to-bracket mr-2"></i> Entrar no Centavus';
        }

        /* ---------- entrada no painel (com sessão já aberta no servidor) ---------- */
        async function enterWithProfile(user,opts){
            opts=opts||{};
            cacheProfile(user);
            applyUserToUI();
            setSubmitLoading(false);
            try{ await syncAfterLogin(); }
            catch(err){ if(!err||!err.network) console.warn('[centavus] dados:',err&&err.message); }
            setLoginScreen(false);
            closeRegister(); closeResetModal();
            const pass=document.getElementById('loginPassword'); if(pass)pass.value='';
            if(typeof toast==='function' && opts.silent!==true){
                toast(opts.message||('Bem-vindo(a) de volta, '+(user.name||'')+'!'));
            }
        }

        async function enterCentavus(e){
            if(e)e.preventDefault();
            if(loginBusy)return;
            const emailInput=document.getElementById('loginEmail');
            const passInput=document.getElementById('loginPassword');
            const email=emailInput.value.trim().toLowerCase();
            const password=passInput.value;

            if(!email||!password){showLoginError('Preencha seu e-mail e sua senha para continuar.');return;}
            if(email.length>254||!EMAIL_RE.test(email)){showLoginError('Informe um e-mail válido (ex.: voce@email.com).');emailInput.focus();return;}
            if(password.length<MIN_PASSWORD){showLoginError('A senha precisa ter pelo menos '+MIN_PASSWORD+' caracteres.');passInput.focus();return;}

            loginBusy=true;
            setSubmitLoading(true);
            showLoginError('');
            try{
                const remember=!!(document.getElementById('rememberLogin')&&document.getElementById('rememberLogin').checked);
                if(remember)localStorage.setItem('centavus_remember_email',email);
                else localStorage.removeItem('centavus_remember_email');
                const data=await apiPost('/api/auth/login',{email:email,password:password,remember:remember});
                loginBusy=false;
                passInput.value='';
                await enterWithProfile(data.user);
            }catch(err){
                loginBusy=false;
                setSubmitLoading(false);
                showLoginError(err&&err.message?err.message:'Não foi possível entrar. Tente novamente.');
                passInput.value='';passInput.focus();
            }
        }

        function logoutCentavus(e){
            if(e&&e.preventDefault)e.preventDefault();
            apiPost('/api/auth/logout').catch(()=>{});
            try{ localStorage.removeItem(SESSION_KEY); }catch(err){}
            setCentavusSession(null);
            closeSettings(); closeRegister(); closeResetModal();
            const pass=document.getElementById('loginPassword');
            if(pass)pass.value='';
            showLoginError('');
            updateDemoHint();
            setLoginScreen(true);
            setTimeout(()=>{const em=document.getElementById('loginEmail');if(em)em.focus();},400);
            return false;
        }

        /* ---------- recuperação de senha ---------- */
        function forgotPassword(e){
            if(e&&e.preventDefault)e.preventDefault();
            const email=document.getElementById('loginEmail').value.trim().toLowerCase();
            if(!email){
                showLoginError('Informe seu e-mail no campo acima para continuar.','info');
                return false;
            }
            if(email.length>254||!EMAIL_RE.test(email)){
                showLoginError('Informe um e-mail válido (ex.: voce@email.com).');
                document.getElementById('loginEmail').focus();
                return false;
            }
            apiPost('/api/auth/forgot',{email:email}).then(data=>{
                showLoginError(data.message||'Se existir uma conta com este e-mail, enviaremos as instruções.','info',
                    data.devLink?{label:'Abrir o link de recuperação',fn:function(){window.location.href=data.devLink;}}:null);
            }).catch(err=>{
                showLoginError(err&&err.message?err.message:'Não foi possível solicitar a recuperação agora.');
            });
            return false;
        }

        /* ---------- redefinir senha (link no ?reset=TOKEN) ---------- */
        function openResetModal(token){
            resetToken=token||null;
            const m=document.getElementById('resetModal');
            if(!m)return;
            m.classList.add('show');
            showResetError('');
            setTimeout(()=>{const el=document.getElementById('resetPassword');if(el)el.focus();},60);
        }
        function closeResetModal(){
            resetToken=null;
            const m=document.getElementById('resetModal');
            if(m)m.classList.remove('show');
        }
        function showResetError(msg){
            const el=document.getElementById('resetError');
            if(!el)return;
            el.textContent=msg||'';
            el.style.display=msg?'block':'none';
        }
        async function handleResetSubmit(e){
            e.preventDefault();
            const pw=document.getElementById('resetPassword').value;
            const pw2=document.getElementById('resetConfirm').value;
            if(pw.length<MIN_PASSWORD){showResetError('A senha precisa ter pelo menos '+MIN_PASSWORD+' caracteres.');return;}
            if(pw!==pw2){showResetError('As senhas não coincidem.');return;}
            try{
                const data=await apiPost('/api/auth/reset',{token:resetToken,password:pw});
                document.getElementById('resetForm').reset();
                closeResetModal();
                try{ history.replaceState(null,'',window.location.pathname); }catch(err){}
                await enterWithProfile(data.user,{message:'Senha redefinida! Já pode entrar com a nova senha.'});
            }catch(err){
                showResetError(err&&err.message?err.message:'Não foi possível redefinir a senha.');
            }
        }

        function updateDemoHint(){
            const el=document.getElementById('loginDemoHint');
            if(!el)return;
            const local=(typeof cvIsLocal==='function')&&cvIsLocal();
            el.innerHTML=local
                ? 'Modo teste (sem servidor): <span>contas e dados ficam só neste navegador</span>'
                : 'Conta protegida no servidor: <span>senha com hash e sessão segura</span>';
        }

        function updateHeaderDate(){
            const now = new Date();
            const weekday = now.toLocaleDateString('pt-BR',{weekday:'long'});       // sexta-feira
            const full    = now.toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'}); // 01 de outubro de 2026
            document.querySelectorAll('.js-weekday').forEach(el => el.textContent = weekday);
            document.querySelectorAll('.js-date-full').forEach(el => { el.textContent = full; el.title = weekday.charAt(0).toUpperCase()+weekday.slice(1)+', '+full; });
        }

        function openSettings(){
            applyUserToUI();
            document.getElementById('settingsModal').classList.add('show');
        }
        function closeSettings(){document.getElementById('settingsModal').classList.remove('show');}

        /* ---------------- Foto de perfil (cache local + perfil na conta) ---------------- */
        const AVATAR_KEY = 'centavus_avatar';

        function applyAvatar(){
            const data = localStorage.getItem(AVATAR_KEY);
            const pairs = [['userAvatarImg', 'userAvatarInitials'], ['settingsAvatarImg', 'settingsInitials']];
            pairs.forEach(([imgId, initialsId]) => {
                const img = document.getElementById(imgId);
                const ini = document.getElementById(initialsId);
                if (!img) return;
                if (data) {
                    img.src = data;
                    img.classList.remove('hidden');
                    if (ini) ini.classList.add('hidden');
                } else {
                    img.removeAttribute('src');
                    img.classList.add('hidden');
                    if (ini) ini.classList.remove('hidden');
                }
            });
            const rm = document.getElementById('avatarRemoveBtn');
            if (rm) rm.disabled = !data;
            if (rm) rm.style.opacity = data ? '1' : '.45';
        }

        function handleAvatarUpload(event){
            const input = event.target;
            const file = input.files && input.files[0];
            if (!file) return;
            if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { toast('Escolha uma imagem PNG, JPG ou WEBP.', 'error'); input.value = ''; return; }
            if (file.size > 4 * 1024 * 1024) { toast('A imagem precisa ter no máximo 4 MB.', 'error'); input.value = ''; return; }

            const reader = new FileReader();
            reader.onerror = function(){ toast('Não foi possível ler esse arquivo.', 'error'); input.value = ''; };
            reader.onload = function(){
                const probe = new Image();
                probe.onerror = function(){ toast('Arquivo de imagem inválido.', 'error'); input.value = ''; };
                probe.onload = function(){
                    try {
                        const max = 320;
                        let w = probe.naturalWidth, h = probe.naturalHeight;
                        const scale = Math.min(1, max / Math.max(w, h));
                        w = Math.max(1, Math.round(w * scale));
                        h = Math.max(1, Math.round(h * scale));
                        const canvas = document.createElement('canvas');
                        canvas.width = w; canvas.height = h;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(probe, 0, 0, w, h);
                        const url = canvas.toDataURL('image/jpeg', 0.85);
                        localStorage.setItem(AVATAR_KEY, url);
                        applyAvatar();
                        apiPut('/api/me/profile',{avatar:url})
                            .then(()=>toast('Foto de perfil atualizada.'))
                            .catch(err=>toast(err&&err.network?'Foto salva neste dispositivo (sem conexão).':'Foto atualizada neste dispositivo.','error'));
                    } catch (err) {
                        toast('Não foi possível processar essa imagem.', 'error');
                    }
                    input.value = '';
                };
                probe.src = reader.result;
            };
            reader.readAsDataURL(file);
        }

        function removeAvatar(){
            localStorage.removeItem(AVATAR_KEY);
            applyAvatar();
            apiPut('/api/me/profile',{avatar:null}).catch(()=>{});
            toast('Foto de perfil removida.');
        }

        /* ---------------- preferências da conta (tema, modo, salário…) ---------------- */
        function saveProfileSettings(patch,silent){
            if(!patch)return;
            let current={};
            try{ current=JSON.parse(localStorage.getItem('centavus_settings')||'{}'); }catch(e){}
            current=Object.assign(current,patch);
            try{ localStorage.setItem('centavus_settings',JSON.stringify(current)); }catch(e){}
            clearTimeout(saveProfileSettings._t);
            saveProfileSettings._t=setTimeout(()=>{
                apiPut('/api/me/profile',{settings:patch}).catch(()=>{});
            },silent?0:700);
        }

        /* ---------------- trocar a senha (dentro de Conta & Configurações) ---------------- */
        function showPasswordMsg(msg,type){
            const el=document.getElementById('passwordMsg');
            if(!el)return;
            el.textContent=msg||'';
            el.className='register-msg'+(msg?(type==='error'?' error':' success'):'');
            el.style.display=msg?'block':'none';
        }
        async function handleChangePassword(e){
            e.preventDefault();
            const cur=document.getElementById('currentPassword').value;
            const nw=document.getElementById('newPassword').value;
            const cf=document.getElementById('confirmPassword').value;
            if(!cur){showPasswordMsg('Informe sua senha atual.','error');return;}
            if(nw.length<MIN_PASSWORD){showPasswordMsg('A nova senha precisa ter pelo menos '+MIN_PASSWORD+' caracteres.','error');return;}
            if(nw!==cf){showPasswordMsg('A confirmação não confere.','error');return;}
            try{
                await apiPost('/api/auth/password',{current:cur,next:nw});
                document.getElementById('changePasswordForm').reset();
                showPasswordMsg('Senha alterada com sucesso.','success');
            }catch(err){
                showPasswordMsg(err&&err.message?err.message:'Não foi possível alterar a senha.','error');
            }
        }

        function toggleLoginPassword(){toggleRegisterPassword('loginPassword','loginPasswordIcon');}
        function toggleRegisterPassword(inputId,iconId){const i=document.getElementById(inputId),icon=document.getElementById(iconId);const show=i.type==='password';i.type=show?'text':'password';icon.className=show?'fa-solid fa-eye-slash':'fa-solid fa-eye';}

        function createCentavusAccount(msg){
            const m=document.getElementById('registerMessage');
            if(m){
                m.className='register-msg info';
                m.textContent=msg||'Crie sua conta no Centavus: nome, e-mail e uma senha forte. Seus dados passam a ficar salvos na sua conta.';
            }
            document.getElementById('registerModal').classList.add('show');
            setTimeout(()=>document.getElementById('registerName').focus(),50);
        }
        function closeRegister(){document.getElementById('registerModal').classList.remove('show')}

        async function registerCentavus(e){
            e.preventDefault();
            const name=document.getElementById('registerName').value.trim();
            const email=document.getElementById('registerEmail').value.trim().toLowerCase();
            const password=document.getElementById('registerPassword').value;
            const confirm=document.getElementById('registerConfirm').value;
            const msg=document.getElementById('registerMessage');
            const fail=t=>{msg.className='register-msg error';msg.textContent=t;};
            if(name.length<2){fail('Informe seu nome completo.');return;}
            if(email.length>254||!EMAIL_RE.test(email)){fail('Informe um e-mail válido (ex.: voce@email.com).');return;}
            if(password.length<MIN_PASSWORD){fail('A senha precisa ter pelo menos '+MIN_PASSWORD+' caracteres.');return;}
            if(password!==confirm){fail('As senhas não coincidem.');return;}
            try{
                const data=await apiPost('/api/auth/register',{name:name,email:email,password:password});
                document.getElementById('registerForm').reset();
                document.getElementById('loginEmail').value=email;
                msg.className='register-msg success';
                msg.textContent='Conta criada com sucesso! Já está conectado ao Centavus.';
                updateDemoHint();
                showLoginError('');
                /* a sessão já foi aberta pelo servidor */
                await enterWithProfile(data.user,{message:'Conta criada — bem-vindo(a) ao Centavus, '+(name.split(' ')[0]||'')+'!'});
            }catch(err){
                fail(err&&err.message?err.message:'Não foi possível criar a conta agora.');
            }
        }

        /* ---------- sessão existente: entra sozinho ---------- */
        async function bootSession(){
            try{
                const data=await apiGet('/api/auth/me');
                if(data&&data.user){ await enterWithProfile(data.user,{silent:true}); }
            }catch(err){
                if(err&&err.status===401){
                    updateDemoHint();
                }else if(err&&err.network){
                    showLoginError('O servidor do Centavus está indisponível. Tente de novo em instantes.','info');
                }
            }
        }

        document.addEventListener('DOMContentLoaded',()=>{
            const saved=localStorage.getItem('centavus_remember_email');
            if(saved){document.getElementById('loginEmail').value=saved;document.getElementById('rememberLogin').checked=true;}
            if(getCentavusSession())applyUserToUI();
            applyAvatar();
            updateDemoHint();
            showLoginError('');
            updateHeaderDate();
            setInterval(updateHeaderDate, 30000);

            /* link de recuperação: index.html?reset=TOKEN */
            try{
                const p=new URLSearchParams(window.location.search);
                const token=p.get('reset');
                if(token){ openResetModal(token); try{history.replaceState(null,'',window.location.pathname);}catch(e){} }
            }catch(e){}

            document.getElementById('registerModal')?.addEventListener('click',ev=>{if(ev.target.id==='registerModal')closeRegister()});
            document.getElementById('resetModal')?.addEventListener('click',ev=>{if(ev.target.id==='resetModal')closeResetModal()});
            document.getElementById('settingsModal')?.addEventListener('click',ev=>{if(ev.target.id==='settingsModal')closeSettings()});
            document.getElementById('goalValueModal')?.addEventListener('click',ev=>{if(ev.target.id==='goalValueModal')closeGoalValue()});
            document.getElementById('budgetModal')?.addEventListener('click',ev=>{if(ev.target.id==='budgetModal')closeBudgetModal()});
            document.getElementById('infoModal')?.addEventListener('click',ev=>{if(ev.target.id==='infoModal')closeInfo()});
            document.getElementById('cardModal')?.addEventListener('click',ev=>{if(ev.target.id==='cardModal')closeCardModal()});
            // fecha a caixa de notificações e o calendário ao clicar fora
            document.addEventListener('click',ev=>{
                if(!ev.target||!ev.target.closest)return;
                const box=document.getElementById('notifDropdown');
                if(box&&!box.classList.contains('hidden')&&!ev.target.closest('#notifDropdown')&&!ev.target.closest('[aria-label="Notificações"]')) box.classList.add('hidden');
                const calBox=document.getElementById('calPopover');
                if(calBox&&!calBox.classList.contains('hidden')&&!ev.target.closest('#calWrap')) closeCalendar();
            });
            document.addEventListener('keydown',ev=>{
                if(ev.key==='Escape'){closeRegister();closeSettings();closeRendaFixa();closeGoalValue();closeBudgetModal();closeInfo();closeCardModal();closeCardInvoice();closeCalendar();closeResetModal();}
                if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='b'){ev.preventDefault();openModal();}
            });
            /* sessão de verdade: cookie httpOnly + estado do usuário no servidor */
            bootSession();
            setInterval(rotateLoginQuote,5000);
        });
        /* sessão caiu no meio do uso → volta para a tela de acesso */
        document.addEventListener('cv:unauthorized',()=>{
            if(document.getElementById('loginScreen')&&document.getElementById('loginScreen').style.display!=='none')return;
            setCentavusSession(null);
            showLoginError('Sua sessão expirou. Entre novamente para continuar.','info');
            setLoginScreen(true);
        });
        function rotateLoginQuote(){const el=document.getElementById('loginQuote');if(!el)return;el.style.opacity='0';setTimeout(()=>{loginQuoteIndex=(loginQuoteIndex+1)%loginQuotes.length;el.innerHTML='<strong>'+loginQuotes[loginQuoteIndex][0]+'</strong><br>'+loginQuotes[loginQuoteIndex][1];el.style.opacity='1'},220)}
