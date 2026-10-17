/* ==========================================================================
   CENTAVUS — BACKEND LOCAL (modo teste, SEM servidor)
   ---------------------------------------------------------------------------
   Antes de qualquer chamada, o cliente pergunta em /api/health se existe API.
   Se não houver (hospedagem estática tipo Netlify/Vercel, porta servindo só o
   front ou página aberta em file://), todo o acesso passa a este arquivo:
   contas, sessão e dados financeiros ficam no localStorage deste navegador.

   Com o servidor rodando (npm start → localhost:3000) nada muda: o cliente
   continua falando com a API Node/SQLite de sempre.

   Endpoints espelhados (mesmos formatos de resposta da API real):
     GET    /api/health            → detecta o modo
     GET    /api/auth/me           → usuário da sessão (401 se não houver)
     POST   /api/auth/register     → cria conta local e abre sessão
     POST   /api/auth/login        → valida senha e abre sessão
     POST   /api/auth/logout       → fecha sessão
     POST   /api/auth/password     → troca a senha (pede a atual)
     POST   /api/auth/forgot       → aviso: sem e-mail no modo teste
     POST   /api/auth/reset        → indisponível sem servidor
     GET    /api/me/state          → dados da conta
     PUT    /api/me/state          → grava dados da conta
     PUT    /api/me/profile        → foto e preferências
   ========================================================================== */
'use strict';

const CV_LOCAL_KEYS = {
    accounts: 'cv_local_accounts',
    session:  'cv_local_session',
    state:    'cv_local_state_'
};

/* ===================== DETECÇÃO DE MODO ===================== */
let cvModeState = null;
let cvModePromise = null;

function cvIsLocal(){ return cvModeState === 'local'; }

/* textos da tela que mudam conforme existe servidor ou não */
function applyCvModeText(){
    if (typeof document === 'undefined') return;
    const local = cvIsLocal();
    if (typeof updateDemoHint === 'function'){ try{ updateDemoHint(); }catch(e){} }
    const sec = document.querySelector('.login-security');
    if (sec) sec.innerHTML = local
        ? '<i class="fa-solid fa-shield-halved"></i> Conta protegida: senha com hash e dados guardados neste navegador'
        : '<i class="fa-solid fa-shield-halved"></i> Conta protegida: senha com hash e sessão segura no servidor';
    const note = document.getElementById('settingsDataNote');
    if (note) note.textContent = local
        ? 'Modo teste (sem servidor): seus dados ficam salvos neste navegador. Publique junto com o servidor (npm start) para valer contas reais e sincronização entre aparelhos.'
        : 'Seus dados ficam salvos na sua conta Centavus (servidor + SQLite) e são sincronizados a cada alteração. Neste aparelho fica apenas uma cópia de cache, para abrir rápido e funcionar offline.';
}

async function cvDetectMode(){
    let local = true;
    try{
        const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const timer = ctrl ? setTimeout(function(){ try{ ctrl.abort(); }catch(e){} }, 2500) : null;
        const res = await fetch('/api/health', {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            signal: ctrl ? ctrl.signal : undefined
        });
        if (timer) clearTimeout(timer);
        const ct = String((res.headers && res.headers.get('content-type')) || '');
        /* precisa ser JSON de verdade: hospedagem estática devolve HTML (200 ou 404) */
        if (res.ok && ct.indexOf('application/json') > -1){
            const json = await res.json();
            local = !(json && json.ok);
        }
    } catch(err){ local = true; }
    cvModeState = local ? 'local' : 'server';
    try{ applyCvModeText(); }catch(e){}
    return cvModeState;
}

function cvApiMode(){
    if (cvModeState) return Promise.resolve(cvModeState);
    if (!cvModePromise) cvModePromise = cvDetectMode();
    return cvModePromise;
}

/* ===================== LEITURA/GRAVAÇÃO LOCAL ===================== */
function cvLocalGet(key, fallback){
    try{
        const raw = localStorage.getItem(key);
        if (raw === null || raw === undefined || raw === '') return fallback;
        const value = JSON.parse(raw);
        return (value === null || value === undefined) ? fallback : value;
    } catch(e){ return fallback; }
}
function cvLocalSet(key, value){
    try{ localStorage.setItem(key, JSON.stringify(value)); return true; } catch(e){ return false; }
}
function cvLocalRemove(key){
    try{ localStorage.removeItem(key); return true; } catch(e){ return false; }
}
function cvLocalAccounts(){
    const all = cvLocalGet(CV_LOCAL_KEYS.accounts, {});
    return (all && typeof all === 'object' && !Array.isArray(all)) ? all : {};
}
function cvLocalSession(){
    const s = cvLocalGet(CV_LOCAL_KEYS.session, null);
    return (s && typeof s === 'object' && s.id) ? s : null;
}
function cvLocalAccountById(id){
    if (!id) return null;
    const all = cvLocalAccounts();
    const keys = Object.keys(all);
    for (let i = 0; i < keys.length; i++){
        const acc = all[keys[i]];
        if (acc && acc.id === id) return acc;
    }
    return null;
}
function cvLocalCurrentAccount(){
    const session = cvLocalSession();
    if (!session) return null;
    const acc = cvLocalAccountById(session.id);
    if (!acc || acc.token !== session.token) return null;   /* senha trocada ou sessão antiga */
    return acc;
}
function cvLocalStateKey(id){ return CV_LOCAL_KEYS.state + id; }

/* ===================== SENHA (hash local) ===================== */
/* FNV-1a duplo: usado quando o navegador não expõe WebCrypto (file:// antigo) */
function cvLocalHashSync(text){
    let h1 = 0x811c9dc5, h2 = 0x1b873593;
    for (let i = 0; i < text.length; i++){
        const c = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
        h2 = Math.imul(h2 + c, 2654435761) >>> 0;
        h2 = ((h2 << 13) | (h2 >>> 19)) >>> 0;
    }
    return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
}
function cvLocalHash(password, salt){
    const text = String(salt) + '|' + String(password);
    if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined'){
        try{
            return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function(buf){
                return Array.prototype.map.call(new Uint8Array(buf), function(b){
                    return ('0' + b.toString(16)).slice(-2);
                }).join('');
            }).catch(function(){ return cvLocalHashSync(text); });
        } catch(e){ return Promise.resolve(cvLocalHashSync(text)); }
    }
    return Promise.resolve(cvLocalHashSync(text));
}
function cvLocalSalt(){ return Math.random().toString(36).slice(2,10) + Date.now().toString(36); }
function cvLocalToken(){ return 't' + Math.random().toString(36).slice(2,12) + Date.now().toString(36); }

function cvLocalUser(acc){
    if (!acc) return null;
    return { id: acc.id, name: acc.name, email: acc.email, avatar: acc.avatar || null, settings: acc.settings || null };
}
function cvLocalError(message, status){
    const e = new Error(message);
    e.status = status || 400;
    if (e.status === 401 && typeof document !== 'undefined'){
        try{ document.dispatchEvent(new CustomEvent('cv:unauthorized')); }catch(err){}
    }
    return e;
}

/* ===================== ROTAS ===================== */
async function localApi(path, options){
    const opts = Object.assign({ method: 'GET' }, options || {});
    let body = opts.body;
    if (body && typeof body === 'string'){ try{ body = JSON.parse(body); }catch(e){ body = null; } }
    body = body || {};
    const method = String(opts.method || 'GET').toUpperCase();
    const accounts = cvLocalAccounts();
    const account = cvLocalCurrentAccount();

    /* ---- saúde: só confirma que o modo local responde ---- */
    if (path === '/api/health') return { ok: true, local: true };

    /* ---- sessão ---- */
    if (path === '/api/auth/me' && method === 'GET'){
        if (!account) throw cvLocalError('Faça entrar para continuar.', 401);
        return { user: cvLocalUser(account) };
    }

    if (path === '/api/auth/register' && method === 'POST'){
        const email = String(body.email || '').trim().toLowerCase();
        const name = String(body.name || '').trim();
        const password = String(body.password || '');
        if (accounts[email]) throw cvLocalError('Já existe uma conta com este e-mail.', 409);
        const salt = cvLocalSalt();
        const hash = await cvLocalHash(password, salt);
        const id = 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
        const token = cvLocalToken();
        accounts[email] = {
            id: id, name: name, email: email, salt: salt, hash: hash,
            token: token, avatar: null, settings: null, createdAt: Date.now()
        };
        cvLocalSet(CV_LOCAL_KEYS.accounts, accounts);
        cvLocalSet(CV_LOCAL_KEYS.session, { id: id, token: token });
        return { user: cvLocalUser(accounts[email]) };
    }

    if (path === '/api/auth/login' && method === 'POST'){
        const email = String(body.email || '').trim().toLowerCase();
        const acc = accounts[email];
        const erro = cvLocalError('E-mail ou senha incorretos.', 401);
        if (!acc) throw erro;
        const hash = await cvLocalHash(String(body.password || ''), acc.salt);
        if (hash !== acc.hash) throw erro;
        const token = cvLocalToken();
        acc.token = token;
        cvLocalSet(CV_LOCAL_KEYS.accounts, accounts);
        cvLocalSet(CV_LOCAL_KEYS.session, { id: acc.id, token: token });
        return { user: cvLocalUser(acc) };
    }

    if (path === '/api/auth/logout' && method === 'POST'){
        cvLocalRemove(CV_LOCAL_KEYS.session);
        return { ok: true };
    }

    if (path === '/api/auth/password' && method === 'POST'){
        if (!account) throw cvLocalError('Sua sessão expirou. Entre novamente.', 401);
        const atual = await cvLocalHash(String(body.current || ''), account.salt);
        if (atual !== account.hash) throw cvLocalError('A senha atual está incorreta.', 400);
        const salt = cvLocalSalt();
        account.salt = salt;
        account.hash = await cvLocalHash(String(body.next || ''), salt);
        const token = cvLocalToken();
        account.token = token;
        cvLocalSet(CV_LOCAL_KEYS.accounts, accounts);
        cvLocalSet(CV_LOCAL_KEYS.session, { id: account.id, token: token });
        return { ok: true };
    }

    if (path === '/api/auth/forgot' && method === 'POST'){
        return { message: 'Modo teste (sem servidor): não há envio de e-mail aqui. Se esqueceu a senha, crie uma conta nova neste navegador.' };
    }

    if (path === '/api/auth/reset' && method === 'POST'){
        throw cvLocalError('Modo teste (sem servidor): redefinição por link indisponível.', 400);
    }

    /* ---- dados financeiros ---- */
    if (path === '/api/me/state'){
        if (!account) throw cvLocalError('Sua sessão expirou. Entre novamente.', 401);
        if (method === 'PUT'){
            cvLocalSet(cvLocalStateKey(account.id), body.state || null);
            return { ok: true };
        }
        return { state: cvLocalGet(cvLocalStateKey(account.id), null) };
    }

    if (path === '/api/me/profile' && method === 'PUT'){
        if (!account) throw cvLocalError('Sua sessão expirou. Entre novamente.', 401);
        if (Object.prototype.hasOwnProperty.call(body, 'avatar')) account.avatar = body.avatar || null;
        if (body.settings && typeof body.settings === 'object'){
            account.settings = Object.assign({}, account.settings || {}, body.settings);
        }
        cvLocalSet(CV_LOCAL_KEYS.accounts, accounts);
        return { ok: true, user: cvLocalUser(account) };
    }

    throw cvLocalError('Requisição local não reconhecida: ' + method + ' ' + path, 404);
}
