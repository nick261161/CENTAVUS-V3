'use strict';
/* ==========================================================================
   CENTAVUS SERVER — API (mesmos formatos que o cliente do site já usa)
   --------------------------------------------------------------------------
   GET  /api/health            detecta o modo (ok → o site sai do modo local)
   GET  /api/auth/me           usuário da sessão (cookie cv_sessao)
   POST /api/auth/register     cria conta e abre sessão
   POST /api/auth/login        valida senha e abre sessão
   POST /api/auth/logout       fecha sessão
   POST /api/auth/password     troca a senha (pede a atual)
   POST /api/auth/forgot       gera link de recuperação (sem e-mail: devLink)
   POST /api/auth/reset        redefine pelo token do link
   GET  /api/me/state          dados financeiros da conta
   PUT  /api/me/state          grava dados financeiros (sync do site)
   PUT  /api/me/profile        avatar e preferências
   GET  /api/me/zap            telefone vinculado ao WhatsApp (ou null)
   POST /api/me/zap            {action:'codigo'} → código CVZ-XXXXXX p/ vincular
   ========================================================================== */

const crypto = require('crypto');
const store = require('./store');

const COOKIE = 'cv_sessao';
const EMAIL_RE = /^[A-Za-z0-9_%+-]+(?:\.[A-Za-z0-9_%+-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;
const MIN_SENHA = 8;
const MAX_ESTADO = 6 * 1024 * 1024;           /* snapshot do site (6 MB) */

/* --------- limite simples de tentativas de auth (30/min por IP) --------- */
const tentativas = {};
function podeTentar(ip) {
    const agora = Date.now();
    const t = tentativas[ip] || (tentativas[ip] = { ini: agora, n: 0 });
    if (agora - t.ini > 60000) { t.ini = agora; t.n = 0; }
    t.n++;
    return t.n <= 30;
}

/* ------------------------------ helpers -------------------------------- */
/* json/erro devolvem `true` → o roteador sabe que a resposta já foi enviada */
function json(res, status, obj) {
    const b = Buffer.from(JSON.stringify(obj));
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': b.length,
        'Cache-Control': 'no-store'
    });
    res.end(b);
    return true;
}
function erro(res, status, msg) { return json(res, status, { error: msg }); }

function lerCookies(req) {
    const out = {};
    String(req.headers.cookie || '').split(';').forEach(function (p) {
        const i = p.indexOf('=');
        if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
    });
    return out;
}
function cookieOpcoes(req) {
    const https = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
    return 'HttpOnly; Path=/; SameSite=Lax; Max-Age=' + (30 * 86400) + (https ? '; Secure' : '');
}
function sessaoAtual(req) {
    return store.sessaoDe(lerCookies(req)[COOKIE]);
}
function hostDe(req) {
    const proto = req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http');
    return proto + '://' + (req.headers.host || 'localhost');
}

/* ------------------------------- rotas --------------------------------- */
/* body já vem parseado (objeto) de server.js; retorna true se tratou. */
function handleApi(rota, metodo, corpo, req, res) {
    corpo = corpo || {};

    /* ---------------------------- saúde ---------------------------- */
    if (rota === '/api/health' && metodo === 'GET') {
        json(res, 200, { ok: true, modo: 'servidor', v: '2.0', bot: true });
        return true;
    }

    /* ------------------------ sessão atual ------------------------- */
    /* o boot do site chama isto em toda abertura (401 = sem sessão) */
    if (rota === '/api/auth/me' && metodo === 'GET') {
        const conta = sessaoAtual(req);
        if (!conta) return erro(res, 401, 'Sessão não encontrada. Entre novamente.');
        return json(res, 200, { user: store.publica(conta) });
    }

    /* --------------------------- registro -------------------------- */
    if (rota === '/api/auth/register' && metodo === 'POST') {
        if (!podeTentar(req.ip || '?')) return erro(res, 429, 'Muitas tentativas. Aguarde um minuto.');
        const nome = String(corpo.name || '').trim().slice(0, 60);
        const email = String(corpo.email || '').trim().toLowerCase();
        const senha = String(corpo.password || '');
        if (nome.length < 2) return erro(res, 400, 'Digite seu nome completo.');
        if (email.length > 254 || !EMAIL_RE.test(email)) return erro(res, 400, 'Informe um e-mail válido.');
        if (senha.length < MIN_SENHA) return erro(res, 400, 'A senha precisa ter pelo menos ' + MIN_SENHA + ' caracteres.');
        const user = store.criarConta(nome, email, senha);
        if (!user) return erro(res, 409, 'Já existe uma conta com este e-mail.');
        const token = store.abrirSessao(user.id);
        res.setHeader('Set-Cookie', COOKIE + '=' + token + '; ' + cookieOpcoes(req));
        json(res, 200, { user: user });
        return true;
    }

    /* ---------------------------- login ---------------------------- */
    if (rota === '/api/auth/login' && metodo === 'POST') {
        if (!podeTentar(req.ip || '?')) return erro(res, 429, 'Muitas tentativas. Aguarde um minuto.');
        const email = String(corpo.email || '').trim().toLowerCase();
        const senha = String(corpo.password || '');
        const conta = store.contaByEmail(email);
        if (!conta || !store.conferirSenha(senha, conta.salt, conta.hash)) {
            return erro(res, 401, 'E-mail ou senha incorretos.');
        }
        const token = store.abrirSessao(conta.id);
        res.setHeader('Set-Cookie', COOKIE + '=' + token + '; ' + cookieOpcoes(req));
        json(res, 200, { user: store.publica(conta) });
        return true;
    }

    /* ---------------------------- logout --------------------------- */
    if (rota === '/api/auth/logout' && metodo === 'POST') {
        store.fecharSessao(lerCookies(req)[COOKIE]);
        res.setHeader('Set-Cookie', COOKIE + '=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
        json(res, 200, { ok: true });
        return true;
    }

    /* ------------------------ trocar a senha ----------------------- */
    if (rota === '/api/auth/password' && metodo === 'POST') {
        const conta = sessaoAtual(req);
        if (!conta) return erro(res, 401, 'Sua sessão expirou. Entre novamente.');
        if (!store.conferirSenha(String(corpo.current || ''), conta.salt, conta.hash)) {
            return erro(res, 400, 'A senha atual está incorreta.');
        }
        const nova = String(corpo.next || '');
        if (nova.length < MIN_SENHA) return erro(res, 400, 'A senha precisa ter pelo menos ' + MIN_SENHA + ' caracteres.');
        store.trocarSenha(conta.id, nova);
        const token = store.abrirSessao(conta.id);       /* reabre a sessão desta aba */
        res.setHeader('Set-Cookie', COOKIE + '=' + token + '; ' + cookieOpcoes(req));
        json(res, 200, { ok: true });
        return true;
    }

    /* ---------------------- esqueci a senha ------------------------ */
    if (rota === '/api/auth/forgot' && metodo === 'POST') {
        const email = String(corpo.email || '').trim().toLowerCase();
        const conta = store.contaByEmail(email);
        /* mesmo sem conta a resposta é a mesma (não vaza quem existe) */
        if (!conta) {
            return json(res, 200, { message: 'Se existir uma conta com este e-mail, o link apareceria aqui. Verifique o endereço digitado.' });
        }
        const token = store.criarReset(conta.id);
        json(res, 200, {
            message: 'Link de recuperação gerado (neste servidor não há envio de e-mail). Clique no botão abaixo em até 1 hora.',
            devLink: hostDe(req) + '/?reset=' + token
        });
        return true;
    }

    /* ---------------------- redefinir a senha ---------------------- */
    if (rota === '/api/auth/reset' && metodo === 'POST') {
        if (!podeTentar(req.ip || '?')) return erro(res, 429, 'Muitas tentativas. Aguarde um minuto.');
        const senha = String(corpo.password || '');
        if (senha.length < MIN_SENHA) return erro(res, 400, 'A senha precisa ter pelo menos ' + MIN_SENHA + ' caracteres.');
        const uid = store.usarReset(String(corpo.token || ''));
        if (!uid) return erro(res, 400, 'O link de recuperação é inválido ou expirou. Peça um novo.');
        store.trocarSenha(uid, senha);
        const token = store.abrirSessao(uid);
        res.setHeader('Set-Cookie', COOKIE + '=' + token + '; ' + cookieOpcoes(req));
        json(res, 200, { user: store.publica(store.contaById(uid)) });
        return true;
    }

    /* --------------------- dados financeiros ----------------------- */
    if (rota === '/api/me/state') {
        const conta = sessaoAtual(req);
        if (!conta) return erro(res, 401, 'Sua sessão expirou. Entre novamente.');
        if (metodo === 'PUT') {
            const estado = corpo.state;
            if (estado !== undefined && estado !== null && JSON.stringify(estado).length > MAX_ESTADO) {
                return erro(res, 413, 'Dados grandes demais para sincronizar.');
            }
            store.gravarEstado(conta.id, (estado && typeof estado === 'object') ? estado : null);
            return json(res, 200, { ok: true });
        }
        if (metodo === 'GET') return json(res, 200, { state: store.lerEstado(conta.id) });
        return erro(res, 405, 'Método não permitido.');
    }

    /* --------------------- avatar/preferências --------------------- */
    if (rota === '/api/me/profile' && metodo === 'PUT') {
        const conta = sessaoAtual(req);
        if (!conta) return erro(res, 401, 'Sua sessão expirou. Entre novamente.');
        const user = store.atualizarPerfil(conta.id, corpo);
        if (!user) return erro(res, 404, 'Conta não encontrada.');
        return json(res, 200, { ok: true, user: user });
    }

    /* ------------------- vínculo do WhatsApp (Zap) ------------------ */
    if (rota === '/api/me/zap') {
        const conta = sessaoAtual(req);
        if (!conta) return erro(res, 401, 'Sua sessão expirou. Entre novamente.');
        if (metodo === 'GET') {
            return json(res, 200, { numero: store.telefoneDoUid(conta.id) });
        }
        if (metodo === 'POST' && corpo.action === 'codigo') {
            const codigo = store.gerarCodigoZap(conta.id);
            return json(res, 200, { codigo: codigo, expiraMin: 20 });
        }
        return erro(res, 400, 'Ação desconhecida.');
    }

    return false;   /* não é da API */
}

module.exports = { handleApi };
