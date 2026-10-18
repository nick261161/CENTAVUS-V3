'use strict';
/* ==========================================================================
   CENTAVUS SERVER — camada de dados (arquivo JSON, sem dependências)
   --------------------------------------------------------------------------
   Tudo que é persistente mora em data/centavus_db.json:
     contas    { id → {name,email,salt,hash,avatar,settings,createdAt} }
     sessoes   { token → {uid,exp} }
     estados   { uid → stateSnapshot do site (transações, metas, cartões…) }
     resets    { token → {uid,exp} }
     zapLinks  { telefone → uid }     vínculo WhatsApp ↔ conta
     zapCodes  { CVZ-XXXXXX → {uid,exp} }  códigos de vinculação (20 min)
   Gravação síncrona e atômica (tmp + rename): arquivos pequenos, escrita a
   cada mutação — nada se perde se o processo cair no meio.
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'centavus_db.json');

const SCRYPT_OPS = { N: 16384, r: 8, p: 1 };   /* custo do hash da senha */

let _db = null;

function _vazio() {
    return { contas: {}, sessoes: {}, estados: {}, resets: {}, zapLinks: {}, zapCodes: {} };
}

function db() {
    if (_db) return _db;
    try {
        _db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        _db = _vazio();
    }
    ['contas', 'sessoes', 'estados', 'resets', 'zapLinks', 'zapCodes'].forEach(function (k) {
        if (!_db[k] || typeof _db[k] !== 'object') _db[k] = {};
    });
    return _db;
}

function salvar() {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        const tmp = DB_FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(_db || db()), 'utf8');
        fs.renameSync(tmp, DB_FILE);           /* atômico no mesmo volume */
    } catch (e) {
        console.error('[store] falha ao gravar:', e.message);
    }
}

/* =============================== senhas =============================== */
function hashSenha(senha, salt) {
    salt = salt || crypto.randomBytes(16).toString('hex');
    const h = crypto.scryptSync(String(senha), salt, 32, SCRYPT_OPS).toString('hex');
    return { salt: salt, hash: h };
}
function conferirSenha(senha, salt, hash) {
    try {
        const h = crypto.scryptSync(String(senha), salt, 32, SCRYPT_OPS);
        const e = Buffer.from(hash, 'hex');
        return h.length === e.length && crypto.timingSafeEqual(h, e);
    } catch (err) { return false; }
}

/* =============================== contas =============================== */
function novoId() { return 'L' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'); }

function criarConta(nome, email, senha) {
    const d = db();
    if (d.contas[email]) return null;
    const s = hashSenha(senha);
    const conta = {
        id: novoId(), name: String(nome || '').trim().slice(0, 60), email: email,
        salt: s.salt, hash: s.hash, avatar: null, settings: null, createdAt: Date.now()
    };
    d.contas[email] = conta;
    salvar();
    return publica(conta);
}
function contaByEmail(email) { return db().contas[email] || null; }
function contaById(id) {
    const c = db().contas;
    const k = Object.keys(c);
    for (let i = 0; i < k.length; i++) if (c[k[i]].id === id) return c[k[i]];
    return null;
}
function publica(c) {
    return c ? { id: c.id, name: c.name, email: c.email, avatar: c.avatar || null, settings: c.settings || null } : null;
}

/* =============================== sessões =============================== */
const TTL_SESSAO = 30 * 86400;                  /* 30 dias */

function abrirSessao(uid) {
    const token = crypto.randomBytes(24).toString('hex');
    db().sessoes[token] = { uid: uid, exp: Date.now() + TTL_SESSAO * 1000 };
    salvar();
    return token;
}
function sessaoDe(token) {
    if (!token) return null;
    const s = db().sessoes[token];
    if (!s) return null;
    if (s.exp < Date.now()) { delete db().sessoes[token]; salvar(); return null; }
    return contaById(s.uid);
}
function fecharSessao(token) {
    if (token && db().sessoes[token]) { delete db().sessoes[token]; salvar(); }
}

/* ========================= troca/redefinição ========================== */
function trocarSenha(uid, nova) {
    const c = contaById(uid);
    if (!c) return false;
    const s = hashSenha(nova);
    c.salt = s.salt; c.hash = s.hash;
    /* senha trocada → derruba as outras sessões (menos a atual é quem chama) */
    Object.keys(db().sessoes).forEach(function (t) {
        if (db().sessoes[t].uid === uid) delete db().sessoes[t];
    });
    salvar();
    return true;
}

function criarReset(uid) {
    const token = crypto.randomBytes(18).toString('hex');
    db().resets[token] = { uid: uid, exp: Date.now() + 3600 * 1000 };   /* 1 hora */
    salvar();
    return token;
}
function usarReset(token) {
    const r = token && db().resets[token];
    if (!r || r.exp < Date.now()) { if (token) delete db().resets[token]; salvar(); return null; }
    delete db().resets[token];
    salvar();
    return r.uid;
}

/* ========================== estados do site =========================== */
function lerEstado(uid) { return db().estados[uid] || null; }
function gravarEstado(uid, estado) {
    if (estado === null || estado === undefined || typeof estado !== 'object') delete db().estados[uid];
    else db().estados[uid] = estado;
    salvar();
}

function atualizarPerfil(uid, patch) {
    const c = contaById(uid);
    if (!c) return null;
    if (Object.prototype.hasOwnProperty.call(patch, 'avatar')) c.avatar = patch.avatar || null;
    if (patch.settings && typeof patch.settings === 'object') {
        c.settings = Object.assign({}, c.settings || {}, patch.settings);
    }
    salvar();
    return publica(c);
}

/* ====================== vínculo WhatsApp ↔ conta ====================== */
/* código curto gerado DENTRO da sessão do site (prova de posse) */
const ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';     /* sem 0/O/1/I */
const TTL_CODIGO = 20 * 60 * 1000;                    /* 20 minutos */

function gerarCodigoZap(uid) {
    const d = db();
    /* um código ativo por vez por conta */
    Object.keys(d.zapCodes).forEach(function (k) {
        if (d.zapCodes[k].uid === uid) delete d.zapCodes[k];
    });
    let codigo = '';
    do {
        codigo = 'CVZ-';
        for (let i = 0; i < 6; i++) codigo += ALFA[crypto.randomInt(ALFA.length)];
    } while (d.zapCodes[codigo]);
    d.zapCodes[codigo] = { uid: uid, exp: Date.now() + TTL_CODIGO };
    salvar();
    return codigo;
}
function usarCodigoZap(codigo) {
    const d = db();
    const c = codigo && d.zapCodes[codigo];
    if (!c || c.exp < Date.now()) { if (codigo) delete d.zapCodes[codigo]; salvar(); return null; }
    delete d.zapCodes[codigo];
    salvar();
    return c.uid;      /* o vínculo em si (com o telefone) é feito por vincularZap() */
}
function vincularZap(telefone, uid) {
    const d = db();
    const telAntigo = telefoneDoUid(uid);
    if (telAntigo && telAntigo !== telefone) delete d.zapLinks[telAntigo];
    Object.keys(d.zapLinks).forEach(function (t) {
        if (d.zapLinks[t] === uid && t !== telefone) delete d.zapLinks[t];   /* outra conta no mesmo telefone sai */
    });
    d.zapLinks[telefone] = uid;
    salvar();
}
function desvincularZap(telefone) {
    const d = db();
    if (d.zapLinks[telefone]) { delete d.zapLinks[telefone]; salvar(); return true; }
    return false;
}
function uidDoZap(telefone) { return db().zapLinks[telefone] || null; }
function telefoneDoUid(uid) {
    const l = db().zapLinks;
    const ks = Object.keys(l);
    for (let i = 0; i < ks.length; i++) if (l[ks[i]] === uid) return ks[i];
    return null;
}

/* ============================ utilidades ============================== */
function limparCodigos() {                     /* varre expirados (chamado no boot) */
    const d = db(); const agora = Date.now(); let n = 0;
    Object.keys(d.zapCodes).forEach(function (k) { if (d.zapCodes[k].exp < agora) { delete d.zapCodes[k]; n++; } });
    Object.keys(d.resets).forEach(function (k) { if (d.resets[k].exp < agora) { delete d.resets[k]; n++; } });
    if (n) salvar();
}

module.exports = {
    db, salvar, hashSenha, conferirSenha,
    criarConta, contaByEmail, contaById, publica,
    abrirSessao, sessaoDe, fecharSessao, trocarSenha,
    criarReset, usarReset,
    lerEstado, gravarEstado, atualizarPerfil,
    gerarCodigoZap, usarCodigoZap, vincularZap, desvincularZap, uidDoZap, telefoneDoUid,
    limparCodigos
};
