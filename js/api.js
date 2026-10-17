/* ==========================================================================
   CENTAVUS — cliente de API
   Todo acesso ao servidor passa por aqui (mesma origem, cookie de sessão).
   ========================================================================== */
'use strict';

async function api(path, options) {
    const opts = Object.assign({ method: 'GET', headers: {} }, options || {});

    /* sem servidor no ar (hospedagem estática, file://, front solto) → backend local */
    const mode = await cvApiMode();
    if (mode === 'local') return localApi(path, opts);

    if (opts.body !== undefined && typeof opts.body !== 'string') {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(opts.body);
    }
    opts.credentials = 'same-origin';

    let res;
    try {
        res = await fetch(path, opts);
    } catch (err) {
        const e = new Error('Não foi possível falar com o servidor. Verifique sua conexão.');
        e.network = true;
        throw e;
    }

    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }

    if (!res.ok) {
        const e = new Error((data && data.error) || ('Erro ' + res.status));
        e.status = res.status;
        if (res.status === 401) document.dispatchEvent(new CustomEvent('cv:unauthorized'));
        throw e;
    }
    return data;
}

const apiGet = (p) => api(p);
const apiPost = (p, body) => api(p, { method: 'POST', body: body });
const apiPut = (p, body) => api(p, { method: 'PUT', body: body });
