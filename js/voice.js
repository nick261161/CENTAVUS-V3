/* ==========================================================================
   CENTAVUS — ASSISTENTE DE VOZ
   ---------------------------------------------------------------------------
   Fala e entende português do Brasil (Web Speech API), com campo de texto
   como alternativa quando o microfone não está disponível (ex.: file://,
   navegador sem suporte ou permissão negada).

   Comandos:
     • Navegação      — "abrir cartões", "ir para metas", "mostrar relatórios"
     • Lançar gasto   — "gastei cinquenta reais no almoço"
     • Lançar entrada — "recebi três mil de salário"
     • Resumos        — "quanto gastei este mês", "como está meu saldo"
     • Por categoria  — "quanto gastei em transporte"
     • Privacidade    — "mostrar valores" / "ocultar valores"
     • Notificações   — "ler notificações"
     • Ajuda          — "ajuda" / "comandos"
     • Silêncio       — "pare de falar" / "silêncio"
   Atalho de teclado: Alt+V abre/fecha e ouve.
   ========================================================================== */
'use strict';

(function () {

    /* ===================== ESTADO INTERNO ===================== */
    let cvvPanel = null, cvvLog = null, cvvInput = null, cvvStatus = null, cvvFab = null, cvvMicBtn = null;
    let cvvRec = null, cvvListening = false, cvvVoice = null, cvvInited = false, cvvDeniedLogged = false;
    let cvvMode = 'command';                /* 'command' (FAB) | 'dictation' (mic do campo de texto) */
    let cvvStream = null;
    /* captura de respostas (usada pelo Centavus Zap) + mute do falante */
    let cvvCaptureHook = null, cvvMute = false;

    /* ===================== UTIL ===================== */
    function cvv$(id) { return document.getElementById(id); }

    function cvvNorm(s) {
        return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    }

    function cvvMoneyWords(v) {
        const n = Math.abs(Number(v) || 0);
        const reais = Math.floor(n);
        const cent = Math.round((n - reais) * 100);
        let f = reais.toLocaleString('pt-BR') + (reais === 1 ? ' real' : ' reais');
        if (cent > 0) f += ' e ' + cent + (cent === 1 ? ' centavo' : ' centavos');
        return f;
    }

    /* fala com voz pt-BR, se disponível */
    function cvvSpeak(text) {
        if (cvvMute) return;                 /* modo Zap: só texto, sem falar */
        if (!('speechSynthesis' in window)) return;
        try {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(String(text));
            u.lang = 'pt-BR';
            u.rate = 1.04;
            u.pitch = 1;
            if (cvvVoice) u.voice = cvvVoice;
            window.speechSynthesis.speak(u);
        } catch (e) { /* silêncio: o app não pode quebrar por TTS */ }
    }

    function cvvPickVoice() {
        try {
            const vs = window.speechSynthesis.getVoices() || [];
            cvvVoice = vs.find(v => /^pt[-_]BR/i.test(v.lang))
                || vs.find(v => /^pt/i.test(v.lang))
                || null;
        } catch (e) { cvvVoice = null; }
    }

    /* ===================== LOG DA CONVERSA (XSS-safe) ===================== */
    function cvvLogAdd(who, text) {
        if (!cvvLog) return;
        const row = document.createElement('div');
        row.className = 'cvv-msg ' + who;
        const ic = document.createElement('i');
        ic.className = 'fa-solid ' + (who === 'user' ? 'fa-user' : 'fa-wand-magic-sparkles');
        const p = document.createElement('span');
        p.textContent = text;           /* sempre texto: nunca HTML do usuário */
        row.appendChild(ic);
        row.appendChild(p);
        cvvLog.appendChild(row);
        while (cvvLog.children.length > 24) cvvLog.removeChild(cvvLog.firstChild);
        cvvLog.scrollTop = cvvLog.scrollHeight;
        if (cvvCaptureHook) cvvCaptureHook(who, text);
    }

    function cvvSetStatus(text, listening) {
        if (!cvvStatus) return;
        cvvStatus.innerHTML = '';
        if (listening) {
            const wave = document.createElement('span');
            wave.className = 'cvv-wave';
            for (let i = 0; i < 3; i++) wave.appendChild(document.createElement('i'));
            cvvStatus.appendChild(wave);
        }
        const s = document.createElement('span');
        s.textContent = text;
        cvvStatus.appendChild(s);
    }

    /* ---------- microfone: validação com mensagem clara ---------- */
    /* Pede o microfone ANTES do reconhecimento só para detectar problema cedo
       (bloqueado, ausente, em uso) e dar instrução exata. Assim que valida,
       SOLTAMOS o aparelho — o SpeechRecognition precisa capturá-lo sozinho. */
    function cvvAskMic() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            return Promise.resolve({
                ok: false,
                msg: (location.protocol === 'file:'
                    ? 'Este navegador não libera o microfone em arquivos locais (file://). Abra pelo atalho "iniciar" ou via http://localhost/https — ou digite o comando abaixo.'
                    : 'Este navegador não expõe o microfone aqui. Digite o comando abaixo.')
            });
        }
        return navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            /* validou: solta na hora para não brigar com o reconhecimento */
            try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}
            return { ok: true };
        }).catch(err => {
            const n = (err && err.name) || '';
            let msg;
            if (n === 'NotAllowedError' || n === 'SecurityError' || (err && err.message && /denied/i.test(err.message))) {
                msg = 'Microfone bloqueado. Clique no cadeado 🔒 na barra de endereço → Microfone → “Permitir” e tente de novo.';
            } else if (n === 'NotFoundError' || n === 'DevicesNotFoundError') {
                msg = 'Nenhum microfone encontrado neste aparelho.';
            } else if (n === 'NotReadableError' || n === 'TrackStartError') {
                msg = 'O microfone está em uso por outro app (WhatsApp, Teams…). Feche e tente de novo.';
            } else {
                msg = 'Não consegui abrir o microfone' + (n ? ' (' + n + ')' : '') + '.';
            }
            if (location.protocol === 'file:') {
                msg += ' Dica: abrir o site via http://localhost ou https deixa o microfone bem mais estável.';
            }
            msg += ' Enquanto isso, você pode digitar o comando no campo abaixo.';
            return { ok: false, msg: msg };
        });
    }

    function cvvReleaseMic() {
        try { if (cvvStream) { cvvStream.getTracks().forEach(t => t.stop()); cvvStream = null; } } catch (e) {}
    }

    function cvvMicBtnState(active) {
        if (!cvvMicBtn) return;
        cvvMicBtn.classList.toggle('cvv-active', !!active);
        cvvMicBtn.innerHTML = '<i class="fa-solid ' + (active ? 'fa-microphone' : 'fa-microphone-slash') + '"></i>';
        cvvMicBtn.setAttribute('aria-label', active ? 'Parar de ditar' : 'Ditar comando por voz');
    }

    /* ===================== NÚMEROS POR EXTENSO ===================== */
    const CVV_ONES = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9 };
    const CVV_SPECIAL = { dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19 };
    const CVV_TENS = { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90 };
    const CVV_HUNDREDS = { cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300, quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900 };

    function cvvNumberFromWords(t) {
        let total = 0, cur = 0, any = false;
        const tokens = cvvNorm(t).replace(/[^a-z0-9\s,]/g, ' ').split(/\s+/);
        for (const w of tokens) {
            if (CVV_ONES[w] != null) { cur += CVV_ONES[w]; any = true; }
            else if (CVV_SPECIAL[w] != null) { cur += CVV_SPECIAL[w]; any = true; }
            else if (CVV_TENS[w] != null) { cur += CVV_TENS[w]; any = true; }
            else if (CVV_HUNDREDS[w] != null) { cur += CVV_HUNDREDS[w]; any = true; }
            else if (w === 'mil') { total += (cur || 1) * 1000; cur = 0; any = true; }
            else if (/^\d+([.,]\d+)?$/.test(w)) { total += parseFloat(w.replace(',', '.')); any = true; }
        }
        return any ? total + cur : NaN;
    }

    /* extrai o valor falado/digitado: dígitos ("50,00", "1.234", "3000") ou extenso.
       Corta em "vezes/parcelas": "duzentos em três vezes" = R$ 200 em 3x, não 203. */
    function cvvExtractNumber(t) {
        const cut = String(t).replace(/\b(em\s+)?(\d+|[a-zà-ú]+)\s*(vezes|vez|parcelas?)\b.*$/i, ' ');
        const m = /(\d[\d.,]*)/.exec(cut);
        if (m) {
            let raw = m[1].replace(/[^\d.,]/g, '');
            /* formato brasileiro: ponto = milhar, vírgula = decimal */
            if (raw.indexOf(',') > -1) raw = raw.replace(/\./g, '').replace(',', '.');
            else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, '');
            const n = parseFloat(raw);
            if (!isNaN(n) && n > 0) return n;
        }
        const byWord = cvvNumberFromWords(cut);
        return (!isNaN(byWord) && byWord > 0) ? byWord : NaN;
    }

    /* ===================== CATEGORIAS POR PALAVRA-CHAVE ===================== */
    const CVV_CATS = {
        'Alimentação': ['almoco', 'almocei', 'jantar', 'janta', 'mercado', 'comida', 'lanche', 'cafe', 'restaurante', 'pizza', 'ifood', 'padaria', 'acougue', 'feira', 'marmita', 'sushi', 'hamburguer', 'esfiha', 'cafezinho', 'lanche'],
        'Transporte': ['uber', 'taxi', 'onibus', 'metro', 'gasolina', 'combustivel', 'estacionamento', 'pedagio', 'passagem', 'corrida', 'alcool'],
        'Lazer': ['cinema', 'jogo', 'bar', 'cerveja', 'show', 'festa', 'netflix', 'spotify', 'streaming', 'viagem', 'passeio', 'balada', 'livro', 'parque'],
        'Roupas': ['roupa', 'camisa', 'calca', 'calcado', 'sapato', 'tenis', 'vestido', 'jaqueta', 'blusa', 'bota']
    };
    const CVV_VERBS_OUT = ['gastei', 'paguei', 'comprei', 'investi', 'doei', 'desembolsei', 'torrei', 'assinalei'];
    const CVV_VERBS_IN = ['recebi', 'ganhei', 'rendeu', 'entrou', 'depositaram', 'reembolsaram', 'reembolsei'];
    const CVV_FILLER = ['de', 'no', 'na', 'em', 'com', 'para', 'pra', 'pro', 'pelo', 'pela', 'o', 'a', 'os', 'as', 'do', 'da', 'dos', 'das', 'meu', 'minha', 'uns', 'umas', 'reais', 'real', 'brl', 'hoje', 'ontem', 'amanha', 'mes', 'mespassado', 'mil', 'e', 'cartao', 'credito', 'debito', 'pix', 'dinheiro', 'vezes', 'vez', 'parcela', 'parcelas'];

    /* remove uma palavra do texto ORIGINAL preservando acentos e maiúsculas:
       "gastei 45 no almoço" → remove "almoco" mesmo com o "ç"/"ã" do original */
    function cvvAccentRe(word) {
        const map = { a: '[aáàâãä]', e: '[eéèêë]', i: '[iíìîï]', o: '[oóòôõö]', u: '[uúùûü]', c: '[cç]' };
        return String(word).split('').map(ch => map[ch] || ch).join('');
    }
    function cvvStrip(text, word) {
        try {
            return text.replace(new RegExp('(^|\\s)' + cvvAccentRe(word) + '(?=\\s|$|[,.!?:;])', 'gi'), '$1');
        } catch (e) { return text; }
    }

    /* acha a palavra ORIGINAL (com acentos) que corresponde a uma forma normalizada:
       "almoco" → "almoço" (para a descrição não perder o acento do usuário) */
    function cvvOriginalWord(text, normWord) {
        const words = String(text || '').split(/\s+/);
        const hit = words.find(w => cvvNorm(w) === normWord);
        return hit || null;
    }

    /* ===================== PAINEL / FAB ===================== */
    function cvvBuildUI() {
        if (cvvInited || !document.body) return;
        cvvInited = true;

        cvvFab = document.createElement('button');
        cvvFab.id = 'cvVoiceFab';
        cvvFab.className = 'cvv-fab';
        cvvFab.type = 'button';
        cvvFab.setAttribute('aria-label', 'Assistente de voz (Alt+V)');
        cvvFab.title = 'Assistente de voz — Alt+V';
        cvvFab.innerHTML = '<i class="fa-solid fa-microphone-lines"></i><span class="cvv-fab-ring"></span><span class="cvv-fab-ring cvv-fab-ring2"></span>';
        cvvFab.addEventListener('click', cvvToggle);

        cvvPanel = document.createElement('div');
        cvvPanel.id = 'cvVoicePanel';
        cvvPanel.className = 'cvv-panel cvv-hidden';
        cvvPanel.setAttribute('role', 'dialog');
        cvvPanel.setAttribute('aria-label', 'Assistente de voz Centavus');

        const head = document.createElement('div');
        head.className = 'cvv-head';
        head.innerHTML = '<div class="cvv-title"><i class="fa-solid fa-wand-magic-sparkles"></i><span>Assistente Centavus</span></div>';
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'cvv-close';
        close.setAttribute('aria-label', 'Fechar assistente');
        close.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        close.addEventListener('click', cvvHide);
        head.appendChild(close);
        cvvPanel.appendChild(head);

        cvvStatus = document.createElement('div');
        cvvStatus.className = 'cvv-status';
        cvvPanel.appendChild(cvvStatus);

        cvvLog = document.createElement('div');
        cvvLog.className = 'cvv-log';
        cvvPanel.appendChild(cvvLog);

        const chipsWrap = document.createElement('div');
        chipsWrap.className = 'cvv-chips';
        ['Abrir cartões', 'Paguei a fatura do Nubank', 'Gastei 45 reais no almoço', 'Criar meta viagem com 500 de 5000', 'Guardar 200 no cofrinho', 'Transferir 100 da poupança para a corrente', 'Quanto tenho em cada conta?', 'Abrir Zap', 'Ver planos', 'Ajuda'].forEach(c => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'cvv-chip';
            chip.textContent = c;
            chip.addEventListener('click', () => cvvRun(c));
            chipsWrap.appendChild(chip);
        });
        cvvPanel.appendChild(chipsWrap);

        const row = document.createElement('form');
        row.className = 'cvv-input-row';
        cvvInput = document.createElement('input');
        cvvInput.type = 'text';
        cvvInput.placeholder = 'Digite ou dite um comando…';
        cvvInput.setAttribute('aria-label', 'Comando do assistente');
        /* microfone DENTRO do campo: dita o texto e envia como se fosse digitado */
        cvvMicBtn = document.createElement('button');
        cvvMicBtn.type = 'button';
        cvvMicBtn.className = 'cvv-mic-btn';
        cvvMicBtn.setAttribute('aria-label', 'Ditar comando por voz');
        cvvMicBtn.title = 'Ditar comando por voz';
        cvvMicBtn.innerHTML = '<i class="fa-solid fa-microphone-slash"></i>';
        cvvMicBtn.addEventListener('click', () => {
            if (cvvListening && cvvMode === 'dictation') { cvvStopListen(); return; }
            cvvStopListen();
            cvvStartListen('dictation');
        });
        const send = document.createElement('button');
        send.type = 'submit';
        send.className = 'cvv-send';
        send.setAttribute('aria-label', 'Enviar comando');
        send.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
        row.appendChild(cvvInput);
        row.appendChild(cvvMicBtn);
        row.appendChild(send);
        row.addEventListener('submit', e => {
            e.preventDefault();
            const v = cvvInput.value.trim();
            if (!v) return;
            cvvInput.value = '';
            cvvRun(v);
        });
        cvvPanel.appendChild(row);

        document.body.appendChild(cvvPanel);
        document.body.appendChild(cvvFab);

        cvvSetStatus('Toque no microfone e fale, ou digite aqui. Alt+V abre o assistente.', false);
    }

    function cvvShow() {
        cvvPanel.classList.remove('cvv-hidden');
        cvvFab.classList.add('cvv-open');
        setTimeout(() => cvvInput && cvvInput.focus(), 80);
    }
    function cvvHide() {
        cvvPanel.classList.add('cvv-hidden');
        cvvFab.classList.remove('cvv-open');
        cvvStopListen();
    }
    function cvvToggle() {
        if (cvvPanel.classList.contains('cvv-hidden')) { cvvShow(); cvvStartListen('command'); }
        else cvvHide();
    }

    /* ===================== RECONHECIMENTO DE VOZ ===================== */
    function cvvRecClass() {
        return window.SpeechRecognition || window.webkitSpeechRecognition || null;
    }

    /* mode: 'command' = executa direto (FAB) · 'dictation' = escreve no campo de texto */
    function cvvStartListen(mode) {
        cvvMode = mode || 'command';
        const Rec = cvvRecClass();
        if (!Rec) {
            cvvSetStatus('Reconhecimento de voz indisponível neste navegador — digite o comando abaixo.', false);
            return;
        }
        if (cvvListening) return;

        /* valida o microfone primeiro: mensagem clara se estiver bloqueado.
           IMPORTANTE: depois de validar, SOLTAMOS o stream antes de iniciar o
           reconhecimento — no Chromium, segurar o microfone aberto (getUserMedia)
           enquanto o SpeechRecognition tenta capturar faz ele receber SILÊNCIO
           e nunca transcrever nada. */
        cvvSetStatus('Preparando o microfone…', false);
        cvvAskMic().then(res => {
            if (!res.ok) {
                cvvSetStatus(res.msg, false);
                cvvLogAdd('bot', res.msg);
                return;
            }
            /* devolve o aparelho ao reconhecimento (a validação já provou que o mic funciona) */
            cvvReleaseMic();
            setTimeout(cvvBeginRecognition, 120);
        });
    }

    function cvvBeginRecognition() {
        const Rec = cvvRecClass();
        if (!Rec) return;
        try {
            cvvRec = new Rec();
            cvvRec.lang = 'pt-BR';
            cvvRec.interimResults = true;
            cvvRec.maxAlternatives = 1;
            cvvRec.continuous = false;

            cvvRec.onstart = () => {
                cvvListening = true;
                cvvFab.classList.add('cvv-listening');
                cvvMicBtnState(cvvMode === 'dictation');
                cvvSetStatus(cvvMode === 'dictation' ? 'Ditando… fale agora' : 'Ouvindo…', true);
            };
            cvvRec.onresult = (ev) => {
                let interim = '', final = '';
                for (let i = ev.resultIndex; i < ev.results.length; i++) {
                    const r = ev.results[i];
                    if (r.isFinal) final += r[0].transcript;
                    else interim += r[0].transcript;
                }
                const shown = (final || interim).trim();
                if (cvvMode === 'dictation') {
                    /* ditado: escreve no campo e envia ao final */
                    if (cvvInput) cvvInput.value = shown;
                    cvvSetStatus(shown ? '“' + shown + '”' : 'Ditando… fale agora', true);
                    if (final.trim()) {
                        const text = final.trim();
                        if (cvvInput) cvvInput.value = '';
                        cvvRun(text);
                    }
                } else {
                    if (shown) cvvSetStatus('“' + shown + '”', true);
                    if (final.trim()) cvvRun(final.trim());
                }
            };
            cvvRec.onerror = (ev) => {
                cvvListening = false;
                cvvFab.classList.remove('cvv-listening');
                cvvMicBtnState(false);
                if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
                    cvvSetStatus('Permissão de microfone negada. Libere o microfone (cadeado 🔒 na barra de endereço) ou digite abaixo.', false);
                    if (!cvvDeniedLogged) {
                        cvvDeniedLogged = true;
                        cvvLogAdd('bot', 'Permissão de microfone negada. Libere o microfone nas permissões do navegador ou use o campo de texto.');
                    }
                } else if (ev.error === 'network') {
                    cvvSetStatus('O reconhecimento de voz do Chrome/Edge precisa de internet. Verifique a conexão ou digite abaixo.', false);
                } else if (ev.error === 'audio-capture') {
                    cvvSetStatus('Não consegui capturar o áudio. Feche outros apps usando o microfone e tente de novo.', false);
                } else if (ev.error === 'no-speech') {
                    cvvSetStatus('Não captei sua voz. Toque no microfone e fale mais perto, com calma.', false);
                } else if (ev.error !== 'aborted') {
                    cvvSetStatus('Não consegui ouvir (' + ev.error + '). Tente de novo.', false);
                }
            };
            cvvRec.onend = () => {
                cvvListening = false;
                cvvFab.classList.remove('cvv-listening');
                cvvMicBtnState(false);
                if (cvvPanel && !cvvPanel.classList.contains('cvv-hidden')) cvvSetStatus('Toque no microfone para falar de novo, ou digite abaixo.', false);
            };
            cvvRec.start();
        } catch (e) {
            cvvSetStatus('Não consegui iniciar o microfone. Tente de novo.', false);
        }
    }

    function cvvStopListen() {
        try { if (cvvRec) cvvRec.stop(); } catch (e) {}
        cvvListening = false;
        if (cvvFab) cvvFab.classList.remove('cvv-listening');
        cvvMicBtnState(false);
        cvvReleaseMic();
    }

    /* ===================== RESPOSTAS DO APP ===================== */
    function cvvOnLoginScreen() {
        const ls = cvv$('loginScreen');
        return !!(ls && ls.offsetParent !== null);
    }

    function cvvFocusTx() {
        return (typeof txNoMesFoco === 'function') ? txNoMesFoco : null;
    }

    function cvvSumMonth(fn) {
        const dentro = cvvFocusTx();
        let inc = 0, out = 0;
        (Array.isArray(transactions) ? transactions : []).forEach(t => {
            const a = Number(t.amount) || 0;
            if (dentro && !dentro(t)) return;
            if (a > 0) inc += a; else out += Math.abs(a);
        });
        return { inc: inc, out: out, saldo: inc - out };
    }

    function cvvMonthName() {
        if (typeof selectedMonthIndex !== 'undefined' && selectedMonthIndex >= 0 && typeof monthsLabels !== 'undefined') {
            return monthsLabels[selectedMonthIndex];
        }
        return 'todos os meses';
    }

    function cvvSummary() {
        if (isPrivacyHidden) {
            const msg = 'Seus valores estão ocutos pelo modo de privacidade. Diga “mostrar valores” para eu ler os números.';
            cvvLogAdd('bot', msg); cvvSpeak(msg); return;
        }
        const t = cvvSumMonth();
        const mes = cvvMonthName();
        let txt = 'Em ' + mes + ': entradas de ' + cvvMoneyWords(t.inc) + ', saídas de ' + cvvMoneyWords(t.out) +
            ' e saldo de ' + cvvMoneyWords(t.saldo) + '.';

        const fat = (Array.isArray(cards) ? cards : []).reduce((s, c) => s + Math.max(0, Number(c.fatura) || 0), 0);
        if (fat > 0) txt += ' Cartões com fatura em aberto somam ' + cvvMoneyWords(fat) + '.';

        const cof = Number((typeof cofrinho !== 'undefined' && cofrinho) ? cofrinho.saldo : 0) || 0;
        if (cof > 0) txt += ' Cofrinho com ' + cvvMoneyWords(cof) + '.';

        const estourados = (typeof budgets !== 'undefined' ? budgets : []).filter(b => {
            const spent = transactions.filter(x => x.cat === b.name && x.amount < 0).reduce((s, x) => s + Math.abs(x.amount), 0);
            return b.limit > 0 && spent / b.limit >= 0.9;
        }).map(b => b.name);
        if (estourados.length) txt += ' Atenção: orçamento de ' + estourados.join(', ') + ' está quase no limite.';

        cvvLogAdd('bot', txt);
        cvvSpeak(txt);
    }

    function cvvCategoryQuery(text) {
        const nv = cvvNorm(text);
        const names = (typeof categoriesData !== 'undefined' ? categoriesData : []).map(c => c.name);
        let cat = names.find(n => nv.indexOf(cvvNorm(n)) >= 0);
        if (!cat && typeof budgets !== 'undefined') {
            const b = budgets.find(x => nv.indexOf(cvvNorm(x.name)) >= 0);
            if (b) cat = b.name;
        }
        if (!cat) return false;
        const dentro = cvvFocusTx();
        const sum = transactions.filter(t => {
            if (dentro && !dentro(t)) return false;
            if (cvvNorm(t.cat) !== cvvNorm(cat)) return false;
            return /quanto/.test(nv) ? (Number(t.amount) || 0) < 0 : true;
        }).reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
        const verb = /recebi|entradas|receita/.test(nv) ? 'entrou' : 'gastou';
        if (isPrivacyHidden) {
            const m = 'Valores ocultos pelo modo de privacidade. Diga “mostrar valores”.';
            cvvLogAdd('bot', m); cvvSpeak(m); return true;
        }
        const txt = 'Em ' + cat + ', ' + verb + ' ' + cvvMoneyWords(sum) + ' em ' + cvvMonthName() + '.';
        cvvLogAdd('bot', txt); cvvSpeak(txt);
        return true;
    }

    /* ===================== FATURAS DOS CARTÕES ===================== */
    /* acha o cartão pelo nome falado ("nubank", "cartão intermedium"…);
       com 1 cartão só, usa ele sem perguntar */
    function cvvFindCard(nv) {
        const list = (typeof cards !== 'undefined' && Array.isArray(cards)) ? cards : [];
        if (!list.length) return null;
        let hit = list.find(c => { const n = cvvNorm(c.name); return n.length > 1 && nv.indexOf(n) >= 0; });
        if (hit) return hit;
        hit = list.find(c => cvvNorm(c.name).split(/\s+/).some(w => w.length > 2 && nv.indexOf(w) >= 0));
        return hit || null;
    }

    function cvvCardByVoice(nv) {
        const list = (typeof cards !== 'undefined' && Array.isArray(cards)) ? cards : [];
        if (!list.length) {
            const msg = 'Você ainda não tem cartões cadastrados. Diga “novo cartão” para cadastrar.';
            cvvLogAdd('bot', msg); cvvSpeak(msg);
            return null;
        }
        let card = cvvFindCard(nv);
        if (!card && list.length === 1) card = list[0];
        if (!card) {
            const msg = 'Qual cartão? Você tem: ' + list.map(c => c.name).join(', ') + '.';
            cvvLogAdd('bot', msg); cvvSpeak(msg);
        }
        return card;
    }

    /* "paguei a fatura do Nubank" · "paguei 150 da fatura do Nubank" ·
       "quitei a fatura" · "baixei 200 na fatura do cartão" */
    function cvvPayInvoice(text) {
        const nv = cvvNorm(text);
        const card = cvvCardByVoice(nv);
        if (!card) return;
        const aberta = Math.max(0, round2(Number(card.fatura) || 0));
        const doMes = Math.max(0, round2((typeof faturaNoMes === 'function') ? faturaNoMes(card) : 0));
        const devido = round2(Math.max(aberta, doMes));
        if (!(devido > 0)) {
            const msg = '“' + card.name + '” não tem fatura em aberto. Tudo em dia por lá.';
            cvvLogAdd('bot', msg); cvvSpeak(msg);
            return;
        }
        /* valor falado = baixa parcial; sem valor = paga tudo */
        let valor = cvvExtractNumber(text);
        if (isNaN(valor)) valor = devido;
        valor = round2(Math.min(valor, devido));
        const restante = round2(devido - valor);

        /* mesma baixa do payCard(), só que com o valor dito (parcial permitida) */
        const ref = (typeof refBase === 'function') ? refBase() : new Date();
        const refMes = ref.getFullYear() * 12 + ref.getMonth();
        const hojeMes = new Date().getFullYear() * 12 + new Date().getMonth();
        const dataPg = (refMes === hojeMes)
            ? toIso(new Date())
            : ref.getFullYear() + '-' + pad2(ref.getMonth() + 1) + '-' + pad2(Math.max(1, Math.min(28, Number(card.dueDay) || 1)));
        card.fatura = round2(Math.max(0, aberta - valor));
        if (!Array.isArray(card.pagamentos)) card.pagamentos = [];
        card.pagamentos.unshift({ id: Date.now(), data: dataPg, valor: valor });
        card.pagamentos = card.pagamentos.slice(0, 60);
        card.ultimaBaixa = dataPg;
        persist();
        if (typeof renderCards === 'function') renderCards();
        if (typeof refreshCardInvoiceIfOpen === 'function') refreshCardInvoiceIfOpen();
        if (typeof buildNotifs === 'function') buildNotifs();
        if (typeof toast === 'function') toast((restante > 0 ? 'Baixa de ' : 'Fatura de ') + money(valor) + (restante > 0 ? ' na fatura de “' : ' paga em “') + card.name + '”.');
        const txt = (restante > 0)
            ? 'Baixa de ' + cvvMoneyWords(valor) + ' na fatura de ' + card.name + '. Restam ' + cvvMoneyWords(restante) + '.'
            : 'Fatura de ' + card.name + ' quitada: ' + cvvMoneyWords(valor) + '.';
        cvvLogAdd('bot', txt); cvvSpeak(txt);
    }

    /* "quanto devo nos cartões" · "quais faturas" · "status das faturas" */
    function cvvInvoiceStatus() {
        const list = (typeof cards !== 'undefined' && Array.isArray(cards)) ? cards : [];
        if (!list.length) {
            const msg = 'Você ainda não tem cartões cadastrados.';
            cvvLogAdd('bot', msg); cvvSpeak(msg);
            return;
        }
        const abertos = list.filter(c => {
            const v = Math.max(Number(c.fatura) || 0, (typeof faturaNoMes === 'function') ? faturaNoMes(c) : 0);
            return v > 0.005;
        });
        if (!isPrivacyHidden && abertos.length) {
            const linhas = abertos.map(c => {
                const v = Math.max(Number(c.fatura) || 0, (typeof faturaNoMes === 'function') ? faturaNoMes(c) : 0);
                let quando = '';
                try {
                    const di = (typeof dueInfo === 'function') ? dueInfo(c) : null;
                    if (di) quando = di.days <= 0 ? 'vence hoje' : (di.days === 1 ? 'vence amanhã' : 'vence em ' + di.days + ' dias');
                } catch (e) {}
                return c.name + ': ' + cvvMoneyWords(v) + (quando ? ', ' + quando : '');
            });
            const total = abertos.reduce((s, c) => s + Math.max(Number(c.fatura) || 0, (typeof faturaNoMes === 'function') ? faturaNoMes(c) : 0), 0);
            const txt = 'Faturas em aberto: ' + linhas.join('. ') + '. Total de ' + cvvMoneyWords(total) + '.';
            cvvLogAdd('bot', txt); cvvSpeak(txt);
        } else if (isPrivacyHidden) {
            const msg = 'Valores ocultos pelo modo de privacidade. Diga “mostrar valores”.';
            cvvLogAdd('bot', msg); cvvSpeak(msg);
        } else {
            const txt = 'Nenhuma fatura em aberto. Todos os cartões em dia.';
            cvvLogAdd('bot', txt); cvvSpeak(txt);
        }
    }

    /* ===================== LANÇAR MOVIMENTAÇÃO POR VOZ ===================== */
    function cvvAddTransaction(text) {
        const nv = cvvNorm(text);

        /* tipo: quem vem primeiro manda (recebi antes de gastei = entrada) */
        let iOut = Infinity, iIn = Infinity;
        CVV_VERBS_OUT.forEach(v => { const i = nv.indexOf(v); if (i >= 0) iOut = Math.min(iOut, i); });
        CVV_VERBS_IN.forEach(v => { const i = nv.indexOf(v); if (i >= 0) iIn = Math.min(iIn, i); });
        const isIncome = iIn < iOut;

        const val = cvvExtractNumber(text);
        if (isNaN(val)) {
            const msg = 'Não consegui identificar o valor. Diga, por exemplo: “gastei cinquenta reais no almoço”.';
            cvvLogAdd('bot', msg); cvvSpeak(msg);
            return;
        }

        /* categoria por palavra-chave (só para saída) */
        let cat = 'Outros', matched = null;
        if (!isIncome) {
            for (const name of Object.keys(CVV_CATS)) {
                matched = CVV_CATS[name].find(k => nv.indexOf(k) >= 0);
                if (matched) { cat = name; break; }
            }
        }

        /* descrição: remove verbos, valor, categoria e palavras de preenchimento
           do texto ORIGINAL (preserva acentos: "almoço" não vira "almoco") */
        let desc = text;
        CVV_VERBS_OUT.concat(CVV_VERBS_IN).forEach(v => { desc = cvvStrip(desc, v); });
        if (matched) desc = cvvStrip(desc, matched);
        desc = desc.replace(/\d[\d.,]*/g, ' ');
        /* também remove números por extenso usados no valor ("três mil" → desc só com "salário") */
        Object.keys(CVV_ONES).concat(Object.keys(CVV_SPECIAL), Object.keys(CVV_TENS), Object.keys(CVV_HUNDREDS), ['mil', 'centavos', 'centavo']).forEach(w => { desc = cvvStrip(desc, w); });
        CVV_FILLER.forEach(w => { desc = cvvStrip(desc, w); });
        desc = desc.replace(/\s+/g, ' ').replace(/^[\s,.:;]+|[\s,.:;]+$/g, '');
        /* sem descrição sobrando: usa a palavra que o usuário falou (com acento),
           ex.: "almoço" vira "Almoço" — não o nome genérico da categoria */
        if (!desc && matched) desc = cvvOriginalWord(text, matched) || cat;
        if (!desc) desc = isIncome ? 'Entrada' : cat;
        desc = desc.charAt(0).toUpperCase() + desc.slice(1).toLowerCase();

        /* preenche e submete o formulário real do app (mesmos efeitos colaterais) */
        try {
            const form = cvv$('transactionForm');
            if (!form) {
                const msg = 'O formulário de movimentação não está disponível agora.';
                cvvLogAdd('bot', msg); cvvSpeak(msg);
                return;
            }
            const typeRadio = document.querySelector('input[name="type"][value="' + (isIncome ? 'receita' : 'despesa') + '"]');
            if (typeRadio) typeRadio.checked = true;
            if (typeof updateCategoryOptions === 'function') updateCategoryOptions();

            cvv$('inputDesc').value = desc;
            cvv$('inputValue').value = String(val.toFixed(2));

            const sel = cvv$('inputCategory');
            if (sel) {
                if (isIncome) {
                    const opt = Array.prototype.find.call(sel.options, o => o.value === 'Receita');
                    if (opt) sel.value = 'Receita';
                } else if (Array.prototype.some.call(sel.options, o => o.value === cat)) {
                    sel.value = cat;
                }
            }

            /* mês/ano de referência = mês atual */
            const now = new Date();
            const mSel = cvv$('inputMonth');
            if (mSel && typeof MONTHS_SHORT !== 'undefined') {
                if (Array.prototype.some.call(mSel.options, o => o.value === MONTHS_SHORT[now.getMonth()])) {
                    mSel.value = MONTHS_SHORT[now.getMonth()];
                }
            }
            if (typeof fillYearSelect === 'function') fillYearSelect(toIso(now));
            const ySel = cvv$('inputYear');
            if (ySel && Array.prototype.some.call(ySel.options, o => Number(o.value) === now.getFullYear())) {
                ySel.value = String(now.getFullYear());
            }

            /* forma de pagamento detectada da fala: "no crédito", "no débito",
               "em dinheiro", "no pix", "no cartão" — só usa pix se nada foi dito */
            let pay = null;
            if (/\bcredit[oa]?\b|faturado|parcelad/.test(nv)) pay = 'credito';
            else if (/\bdebit[oa]?\b/.test(nv)) pay = 'debito';
            else if (/dinheiro|especie/.test(nv)) pay = 'dinheiro';
            else if (/\bpix\b/.test(nv)) pay = 'pix';
            else if (/cartao/.test(nv)) pay = 'credito';   /* "no cartão" sem especificar = crédito */
            const payRadio = pay ? document.querySelector('input[name="pay"][value="' + pay + '"]') : null;
            if (payRadio) {
                payRadio.checked = true;
                if (typeof updatePayFields === 'function') updatePayFields();
            }

            /* parcelas ditas: "em 3 vezes", "3x" — vale só para crédito */
            if (pay === 'credito') {
                const pm = /(\d+|em\s+\w+)\s*(x\b|vezes)/.exec(nv);
                if (pm) {
                    const nParc = Math.round(cvvExtractNumber(pm[1].replace(/^em\s+/, '') || text));
                    const ps = cvv$('inputParcelas');
                    if (nParc >= 2 && nParc <= 60 && ps && Array.prototype.some.call(ps.options, o => Number(o.value) === nParc)) {
                        ps.value = String(nParc);
                        if (typeof updateInstallHint === 'function') updateInstallHint();
                    }
                }
            }

            if (form.requestSubmit) form.requestSubmit();
            else handleAddTransaction(new Event('submit'));

            const payLabel = { credito: 'crédito', debito: 'débito', pix: 'pix', dinheiro: 'dinheiro' }[pay] || '';
            const parcTxt = (pay === 'credito' && Number(cvv$('inputParcelas') ? cvv$('inputParcelas').value : 1) > 1)
                ? (' em ' + cvv$('inputParcelas').value + ' vezes') : '';
            const txt = (isIncome ? 'Entrada registrada: ' : 'Gasto registrado: ') + desc + ', ' + cvvMoneyWords(val) +
                (!isIncome && cat !== 'Outros' && desc !== cat ? ', categoria ' + cat : '') +
                (payLabel ? ', pago no ' + payLabel : '') + parcTxt + '.';
            cvvLogAdd('bot', txt);
            cvvSpeak(txt);
        } catch (e) {
            const msg = 'Deu ruim ao registrar. Você pode lançar pela tela de nova transação.';
            cvvLogAdd('bot', msg); cvvSpeak(msg);
        }
    }

    /* ===================== NAVEGAÇÃO E MODAIS ===================== */
    const CVV_NAV = [
        { keys: ['dashboard', 'inicio', 'painel', 'resumo geral', 'home'], section: 'dashboard' },
        { keys: ['movimentacoes', 'transacoes', 'extrato', 'lancamentos', 'transactions'], section: 'movimentacoes' },
        { keys: ['cartoes', 'fatura', 'faturas'], section: 'cartoes' },
        { keys: ['contas', 'account'], section: 'contas' },
        { keys: ['cofrinho', 'poupanca', 'reserva'], section: 'cofrinho' },
        { keys: ['metas', 'objetivos', 'goal'], section: 'metas' },
        { keys: ['relatorios', 'analise', 'relatorio', 'graficos', 'reports'], section: 'relatorios' },
        { keys: ['zap', 'whatsapp', 'centavus zap'], section: 'zap' }
    ];

    function cvvGoto(section) {
        if (typeof setActiveNav === 'function') {
            setActiveNav(null, section);
            const txt = 'Abrindo ' + (section === 'zap' ? 'Centavus Zap' : section) + '.';
            cvvLogAdd('bot', txt);
            cvvSpeak(txt);
            return true;
        }
        return false;
    }

    function cvvHelp() {
        const txt = 'Posso fazer tudo pelo voz. Exemplos: “nova transação”, “gastei cinquenta reais no almoço”, ' +
            '“recebi três mil de salário”, “paguei a fatura do Nubank”, “paguei cento e cinquenta da fatura do Nubank”, ' +
            '“quanto devo nos cartões”, “criar meta viagem com quinhentos de cinco mil”, “guardar duzentos na meta viagem”, ' +
            '“excluir meta viagem” e depois “sim”, “criar cartão nubank com limite de cinco mil”, “transferir cem da poupança para a corrente”, ' +
            '“quanto tenho no cofrinho”, “definir CDI treze”, “criar renda fixa cdb de mil por doze meses”, ' +
            '“criar orçamento alimentação com oitocentos”, “quanto gastei este mês”, “próximo mês”, “buscar mercado”, ' +
            '“exportar csv”, “tema violeta”, “modo escuro”, “meu nome é João”, “limpar notificações”, “baixar backup”, ' +
            '“quanto vou gastar no fim do mês”, “tem vazamento?”, “mapa de calor”, ' +
            '“ver planos”, “meu plano”, “ativar código”, “abrir zap” ou “testar premium”.';
        cvvLogAdd('bot', txt);
        cvvSpeak('Posso lançar gastos, pagar faturas, criar metas, cartões, contas, cofrinho, renda fixa e orçamentos, transferir, abrir telas, resumir suas finanças, projetar o fim do mês, checar vazamentos e até mostrar os planos. Veja os exemplos na tela.');
    }

    /* ===================== PLANOS E ATIVAÇÃO ===================== */
    function cvvPlans(text, nv) {
        /* meu plano / uso atual */
        if (/meu plano|qual meu plano|plano atual|status do plano/.test(nv)) {
            const plano = (typeof cvPlanoAtual === 'function') ? cvPlanoAtual() : 'free';
            const nome = plano === 'premium' ? (cvPlanoLeia().plano === 'trial' ? 'Premium (teste de 7 dias)' : 'Premium') : plano === 'pro' ? 'Pro' : 'Grátis';
            let m = 'Seu plano atual é ' + nome + '.';
            if (plano === 'free' && typeof cvQuotaUsada === 'function') {
                m += ' Você já usou ' + cvQuotaUsada('voz') + ' de ' + cvQuotaMax('voz') + ' comandos de voz hoje.';
            }
            cvvSay(m);
            return;
        }
        /* ativar com código */
        if (/ativar|codigo|código/.test(nv)) {
            const cod = (String(text).toUpperCase().match(/CV-[A-Z0-9]+-[A-Z0-9]+-\d+-[A-Z0-9]+/) || [])[0];
            if (cod && typeof cvAtivarCodigo === 'function') {
                const ok = cvAtivarCodigo(cod);
                cvvSay(ok ? 'Código aceito! Plano ativado, pode usar sem limite.' : 'Esse código não passou na validação. Confira a mensagem do pagamento.');
            } else {
                if (typeof cvAbrirPlanos === 'function') cvAbrirPlanos();
                cvvSay('Abri os planos para você. Cole seu código de ativação no campo para liberar, ou escolha um plano.');
            }
            return;
        }
        /* teste grátis */
        if (/testar|teste|\btrial\b|gratuito por/.test(nv)) {
            if (typeof cvIniciarTrial === 'function' && cvIniciarTrial()) {
                cvvSay('Premium liberado por sete dias. Pode usar tudo, sem limite.');
            }
            return;
        }
        /* abrir o Zap */
        if (/zap|whatsapp/.test(nv)) { cvvGoto('zap'); return; }
        /* ver planos */
        if (typeof cvAbrirPlanos === 'function') cvAbrirPlanos();
        cvvSay('Os planos são: Grátis, com tudo do Centavus e 30 comandos por dia; Pro por 19,90 reais por mês, com 150 comandos, 10 metas, 6 contas, 5 cartões e exportação; e Premium por 39,90 reais, tudo sem limite. Diga “ativar código” ou “testar premium”.');
    }

    /* ===================== RECURSOS PREMIUM (VOZ) ===================== */
    /* projeção do fim de mês · detector de vazamentos · mapa de calor */
    function cvvExtras(text, nv) {
        const liberado = (typeof cvExtras === 'function') ? cvExtras() : false;

        /* mapa de calor / detector: navegação até os relatórios */
        if (/mapa de calor|calor dos gastos|abrir detector|abrir vazamento/.test(nv)) {
            if (typeof setActiveNav === 'function') setActiveNav(null, 'relatorios');
            const m = 'Abrindo os relatórios, onde ficam o mapa de calor e o detector de vazamentos.' +
                (liberado ? '' : ' No plano grátis eles aparecem borrados — diga “testar premium” para liberar sete dias.');
            cvvLogAdd('bot', m); cvvSpeak(m);
            return;
        }

        /* no plano grátis os valores ficam travados (mesma vitrine do site) */
        if (!liberado) {
            cvvSay('Esse recurso é do Pro e do Premium. Posso liberar sete dias de teste agora: diga “testar premium”. Ou “ver planos”.');
            return;
        }
        if (typeof isPrivacyHidden !== 'undefined' && isPrivacyHidden) {
            cvvSay('Valores ocultos pelo modo de privacidade. Diga “mostrar valores”.');
            return;
        }

        /* detector de vazamentos */
        if (/vazamento|cobranca duplicada|cobrança duplicada|gastos formiga|detector/.test(nv)) {
            const itens = (typeof cxVazamentosLista === 'function') ? cxVazamentosLista() : [];
            if (!itens.length) {
                cvvSay('Verifiquei seus lançamentos e não achei nada suspeito: sem cobrança duplicada, sem assinatura escondida e sem estouro de categoria. Tudo limpo.');
                return;
            }
            const titulos = itens.slice(0, 3).map(function (i) { return i.titulo.toLowerCase(); }).join('; ');
            cvvSay('Achei ' + itens.length + (itens.length > 1 ? ' pontos' : ' ponto') + ' de atenção: ' + titulos +
                '. O principal está na tela, nos relatórios. Confira se vale contestar.');
            if (typeof setActiveNav === 'function') setActiveNav(null, 'relatorios');
            return;
        }

        /* projeção de fim de mês */
        const p = (typeof cxProjecaoDados === 'function') ? cxProjecaoDados() : null;
        if (!p) { cvvSay('Ainda não há gastos neste mês para eu projetar o fim do mês. Registre uma movimentação e me pergunte de novo.'); return; }
        let m = 'No ritmo atual, você deve gastar ' + cvvMoneyWords(p.projecao) + ' até o fim do mês. ' +
            'Já gastou ' + cvvMoneyWords(p.ateAgora) + ', na média de ' + cvvMoneyWords(p.ritmo) + ' por dia, faltando ' + p.restante + ' dias.';
        if (p.dif !== null) {
            m += ' Isso é ' + Math.abs(p.dif).toFixed(0) + ' por cento ' + (p.dif > 0 ? 'a mais' : 'a menos') + ' que no mês passado.';
        }
        cvvSay(m);
    }

    /* ===================== TODAS AS FUNÇÕES DO SITE ===================== */

    function cvvSet(id, v) { const el = cvv$(id); if (!el) return false; el.value = String(v); return true; }

    function cvvSubmit(formId) {
        const f = cvv$(formId);
        if (!f) return false;
        if (f.requestSubmit) f.requestSubmit();
        else if (typeof f.onsubmit === 'function' || f.getAttribute('onsubmit')) f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        return true;
    }

    /* número que aparece logo APÓS uma palavra-chave ("limite 5 mil", "dia 10") */
    function cvvNumberAfter(text, kw) {
        const m = new RegExp(kw + '\\s*(?:de\\s+|em\\s+|e\\s+|com\\s+|a\\s+)?([^.,;!?]*)').exec(cvvNorm(text));
        if (!m) return NaN;
        const seg = String(m[1] || '').trim();
        /* "5 mil" / "cinquenta mil" → multiplica por mil */
        const km = /^([a-z0-9]+(?:\s+[a-z0-9]+)?)\s*mil\b/.exec(seg);
        if (km) {
            const base = cvvNumberFromWords(km[1]);
            if (!isNaN(base) && base > 0) return base * 1000;
        }
        return cvvExtractNumber(seg);
    }

    /* todos os números de uma frase, na ordem em que aparecem */
    function cvvAllNumbers(text) {
        const out = [];
        const tokens = cvvNorm(text).replace(/[^a-z0-9\s,]/g, ' ').split(/\s+/);
        let cur = 0, any = false, decOn = false, decFrac = false;
        const flush = () => {
            if (any) { let v = cur; if (decOn && !decFrac) v = v / 100; out.push(v); }
            cur = 0; any = false; decOn = false; decFrac = false;
        };
        for (let i = 0; i < tokens.length; i++) {
            const w = tokens[i], isLast = i === tokens.length - 1;
            if (CVV_ONES[w] != null) { cur += CVV_ONES[w]; any = true; if (!isLast) continue; flush(); continue; }
            if (CVV_SPECIAL[w] != null) { cur += CVV_SPECIAL[w]; any = true; decOn = true; if (!isLast) continue; flush(); continue; }
            if (CVV_TENS[w] != null) { cur += CVV_TENS[w]; any = true; if (!isLast) continue; flush(); continue; }
            if (CVV_HUNDREDS[w] != null) { cur += CVV_HUNDREDS[w]; any = true; if (!isLast) continue; flush(); continue; }
            if (w === 'mil') { cur = (cur || 1) * 1000; any = true; if (!isLast) continue; flush(); continue; }
            if (w === 'centavos' || w === 'centavo') { if (any && !decOn) cur = cur / 100; flush(); continue; }
            if (w === 'e') continue;
            if (/^\d+([.,]\d+)?$/.test(w)) {
                const hasSep = /[.,]\d+$/.test(w);
                cur += parseFloat(w.replace(',', '.'));
                any = true; if (hasSep) decFrac = true;
                if (!isLast) continue; flush(); continue;
            }
            flush();
        }
        flush();
        return out;
    }

    function cvvSay(msg) { cvvLogAdd('bot', msg); cvvSpeak(msg); }

    /* remove números e palavras de número de um texto ("5 mil" → "") */
    function cvvStripNumbers(text) {
        let t = String(text || '').replace(/\d[\d.,]*/g, ' ');
        Object.keys(CVV_ONES).concat(Object.keys(CVV_SPECIAL), Object.keys(CVV_TENS), Object.keys(CVV_HUNDREDS), ['mil', 'centavos', 'centavo']).forEach(w => { t = cvvStrip(t, w); });
        return t;
    }

    /* acha entidades pelo nome falado (metas, contas, orçamentos) */
    function cvvFindByName(list, nv) {
        if (!list || !list.length) return null;
        let hit = list.find(x => { const n = cvvNorm(x.name); return n.length > 1 && nv.indexOf(n) >= 0; });
        if (hit) return hit;
        hit = list.find(x => cvvNorm(x.name).split(/\s+/).some(w => w.length > 3 && nv.indexOf(w) >= 0));
        if (hit) return hit;
        return (list.length === 1 && !/(varios|todas|cada|quais|lista)/.test(nv)) ? list[0] : null;
    }

    /* ---------------- confirmação por VOZ do cvConfirm ----------------
       Quando uma ação destrutiva abre o diálogo de confirmação, o usuário
       pode dizer "sim" para confirmar ou "não" para cancelar. */
    function cvvTryConfirmVoice(nv) {
        const cm = document.getElementById('cvConfirmModal');
        if (!cm || cm.classList.contains('hidden')) return false;
        if (/^(sim|confirma|confirmar|pode|isso|isso mesmo|yes|s\b)/.test(nv)) {
            const ok = cm.querySelector('#cvConfirmOk');
            if (ok) { ok.click(); cvvSay('Confirmado.'); return true; }
        }
        if (/^(nao|não|cancela|cancelar|para|abortar|n\b)/.test(nv)) {
            const c = cm.querySelector('#cvConfirmCancel');
            if (c) { c.click(); cvvSay('Tudo bem, cancelei.'); return true; }
        }
        return false;
    }

    /* ===================== METAS ===================== */
    function cvvGoalsList() {
        const list = (typeof goals !== 'undefined' && Array.isArray(goals)) ? goals : [];
        if (!list.length) { cvvSay('Você ainda não tem metas. Diga “criar meta viagem com quinhentos de cinco mil”.'); return; }
        if (isPrivacyHidden) { cvvSay('Valores ocultos pelo modo de privacidade. Diga “mostrar valores”.'); return; }
        const linhas = list.map(g => {
            const pct = g.target > 0 ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0;
            const falta = Math.max(0, round2(g.target - g.current));
            const done = pct >= 100;
            return g.name + ': ' + pct + ' por cento' + (done ? ', meta concluída' : ', faltam ' + cvvMoneyWords(falta));
        });
        cvvSay('Suas metas: ' + linhas.join('. ') + '.');
    }

    /* "criar meta viagem com 500 de 5000" · "criar meta carro de 20 mil" */
    function cvvGoalCreate(text) {
        const nv = cvvNorm(text);
        if (typeof openGoalModal !== 'function') { cvvSay('Metas não disponíveis agora.'); return; }
        const nums = cvvAllNumbers(text);
        if (!nums.length) { cvvSay('Quanto essa meta vale? Diga, por exemplo: “criar meta viagem com quinhentos de cinco mil”.'); return; }
        const current = nums.length > 1 ? nums[0] : 0;
        const target = nums.length > 1 ? nums[1] : nums[0];
        if (!(target > 0)) { cvvSay('O valor da meta precisa ser maior que zero.'); return; }
        /* nome: texto após "meta", sem números nem preâmbulos */
        let nome = text;
        const mIdx = nv.indexOf('meta');
        if (mIdx >= 0) nome = text.slice(mIdx + 4);
        ['criar', 'nova', 'novo', 'adicionar', 'cadastrar', 'registrar', 'com', 'de', 'do', 'da', 'para', 'valendo', 'no', 'na', 'e'].forEach(w => { nome = cvvStrip(nome, w); });
        nome = cvvStripNumbers(nome);
        CVV_FILLER.forEach(w => { nome = cvvStrip(nome, w); });
        nome = nome.replace(/\s+/g, ' ').replace(/^[\s,.:;]+|[\s,.:;]+$/g, '');
        if (!nome) { cvvSay('Qual o nome da meta? Diga, por exemplo: “criar meta viagem com quinhentos de cinco mil”.'); return; }
        openGoalModal();
        cvvSet('goalTitle', nome.charAt(0).toUpperCase() + nome.slice(1));
        cvvSet('goalCurrent', current > 0 ? String(current.toFixed(2)) : '0');
        cvvSet('goalTarget', String(target.toFixed(2)));
        cvvSubmit('goalForm');
        if (isPrivacyHidden) cvvSay('Meta “' + nome + '” criada.');
        else cvvSay('Meta “' + nome + '” criada: ' + cvvMoneyWords(current) + ' de ' + cvvMoneyWords(target) + '.');
    }

    /* "guardar 200 na meta viagem" · "resgatar 100 da meta carro" */
    function cvvGoalValue(text, mode) {
        const nv = cvvNorm(text);
        const list = (typeof goals !== 'undefined' && Array.isArray(goals)) ? goals : [];
        if (!list.length) { cvvSay('Você ainda não tem metas cadastradas.'); return; }
        const g = cvvFindByName(list, nv);
        if (!g) { cvvSay('Qual meta? Suas metas são: ' + list.map(x => x.name).join(', ') + '.'); return; }
        let val = cvvExtractNumber(text);
        if (isNaN(val) || val <= 0) { cvvSay('Quanto você quer ' + (mode === 'add' ? 'guardar' : 'resgatar') + ' da meta ' + g.name + '?'); return; }
        if (mode === 'add' && g.current >= g.target) {
            cvvSay('A meta ' + g.name + ' já está concluída.');
            return;
        }
        if (mode === 'remove' && val > g.current + 0.001) {
            cvvSay('Só há ' + cvvMoneyWords(g.current) + ' guardados na meta ' + g.name + '.');
            return;
        }
        openGoalValue(g.id, mode);
        cvvSet('goalValueInput', val.toFixed(2));
        /* guarda o total ANTES da baixa (confirmGoalValue já muta g.current) */
        const antes = Number(g.current) || 0;
        confirmGoalValue();
        const novoTotal = (mode === 'add' ? antes + val : antes - val);
        cvvSay((mode === 'add' ? 'Guardei ' : 'Resgatei ') + cvvMoneyWords(val) + ' ' + (mode === 'add' ? 'na' : 'da') + ' meta ' + g.name + '. Novo total: ' + cvvMoneyWords(novoTotal) + ' de ' + cvvMoneyWords(g.target) + '.');
    }

    /* "editar meta viagem para 8000" · "aumentar meta carro em 2000" */
    function cvvGoalEdit(text) {
        const nv = cvvNorm(text);
        const list = (typeof goals !== 'undefined' && Array.isArray(goals)) ? goals : [];
        if (!list.length) { cvvSay('Você ainda não tem metas cadastradas.'); return; }
        const g = cvvFindByName(list, nv);
        if (!g) { cvvSay('Qual meta? Suas metas são: ' + list.map(x => x.name).join(', ') + '.'); return; }
        let val = cvvExtractNumber(text);
        if (isNaN(val) || val <= 0) { cvvSay('Para quanto quer ajustar a meta ' + g.name + '? Diga, por exemplo: “editar meta ' + cvvNorm(g.name) + ' para oitenta mil”.'); return; }
        if (/aumentar|acrescentar|mais/.test(nv) && !/para\b/.test(nv)) val = round2(g.target + val);
        openGoalModal(g);
        cvvSet('goalTarget', String(val.toFixed(2)));
        cvvSubmit('goalForm');
        cvvSay('Meta ' + g.name + ' ajustada para ' + cvvMoneyWords(val) + '.');
    }

    /* "excluir meta viagem" — abre o diálogo e espera "sim" */
    function cvvGoalDelete(text) {
        const nv = cvvNorm(text);
        const list = (typeof goals !== 'undefined' && Array.isArray(goals)) ? goals : [];
        if (!list.length) { cvvSay('Você ainda não tem metas cadastradas.'); return; }
        const g = cvvFindByName(list, nv);
        if (!g) { cvvSay('Qual meta? Suas metas são: ' + list.map(x => x.name).join(', ') + '.'); return; }
        cvvSay('Vou excluir a meta ' + g.name + '. Diga “sim” para confirmar.');
        deleteGoal(g.id);
    }

    /* ===================== CARTÕES ===================== */
    /* "criar cartão nubank com limite 5 mil vence dia 10 fecha dia 5" */
    function cvvCardCreate(text) {
        if (typeof openCardModal !== 'function') { cvvSay('Cartões não disponíveis agora.'); return; }
        openCardModal();
        /* nome: texto após "cartao", sem números nem campos */
        let nome = text;
        const mIdx = cvvNorm(text).indexOf('cartao');
        if (mIdx >= 0) nome = text.slice(mIdx + 6);
        ['criar', 'novo', 'novo cartao', 'cadastrar', 'adicionar', 'com', 'de', 'do', 'da', 'limite', 'vence', 'vencimento', 'venc', 'fecha', 'fechamento', 'fech', 'dia', 'fatura', 'final', 'bandeira', 'para'].forEach(w => { nome = cvvStrip(nome, w); });
        nome = cvvStripNumbers(nome);
        nome = nome.replace(/\s+/g, ' ').replace(/^[\s,.:;]+|[\s,.:;]+$/g, '');
        if (!nome) { cvvSay('Qual o apelido do cartão? Diga, por exemplo: “criar cartão nubank com limite de cinco mil”.'); closeCardModal(); return; }

        const limite = cvvNumberAfter(text, 'limite');
        if (isNaN(limite) || limite < 0) { cvvSay('Qual o limite do cartão ' + nome + '? Diga, por exemplo: “criar cartão ' + cvvNorm(nome) + ' com limite de cinco mil”.'); closeCardModal(); return; }
        const fatura = cvvNumberAfter(text, 'fatura');
        const venc = cvvNumberAfter(text, 'venc');
        const fech = cvvNumberAfter(text, 'fech');

        cvvSet('cardName', nome);
        cvvSet('cardLimit', String(limite));
        cvvSet('cardFatura', (!isNaN(fatura) && fatura >= 0) ? String(fatura) : '0');
        const vencDia = (!isNaN(venc) && venc >= 1 && venc <= 28) ? Math.round(venc) : 10;
        const fechDia = (!isNaN(fech) && fech >= 1 && fech <= 28) ? Math.round(fech) : 5;
        cvvSet('cardDue', String(vencDia));
        cvvSet('cardClose', String(fechDia));
        /* bandeira dita */
        const brandMap = [['visa', 'Visa'], ['master', 'Mastercard'], ['elo', 'Elo'], ['amex', 'American Express'], ['american', 'American Express'], ['hiper', 'Hipercard'], ['outro', 'Outro']];
        for (const [kw, val] of brandMap) {
            const sel = cvv$('cardBrand');
            if (nvContains(text, kw) && sel && Array.prototype.some.call(sel.options, o => o.value === val)) { cvvSet('cardBrand', val); break; }
        }
        cvvSubmit('cardForm');
        cvvSay('Cartão ' + nome + ' criado com limite de ' + cvvMoneyWords(limite) + ', vencendo dia ' + vencDia + '.');
    }
    function nvContains(text, kw) { return cvvNorm(text).indexOf(kw) >= 0; }

    /* "editar cartão nubank limite 8 mil" · "editar cartão nubank fatura 300" */
    function cvvCardEdit(text) {
        const nv = cvvNorm(text);
        const card = cvvCardByVoice(nv);
        if (!card) return;
        const limite = cvvNumberAfter(text, 'limite');
        const fatura = cvvNumberAfter(text, 'fatura');
        const venc = cvvNumberAfter(text, 'venc');
        const fech = cvvNumberAfter(text, 'fech');
        openCardModal(card.id);
        if (!isNaN(limite) && limite >= 0) cvvSet('cardLimit', String(limite));
        if (!isNaN(fatura) && fatura >= 0) cvvSet('cardFatura', String(fatura));
        if (!isNaN(venc) && venc >= 1 && venc <= 28) cvvSet('cardDue', String(Math.round(venc)));
        if (!isNaN(fech) && fech >= 1 && fech <= 28) cvvSet('cardClose', String(Math.round(fech)));
        cvvSubmit('cardForm');
        cvvSay('Cartão ' + card.name + ' atualizado.');
    }

    /* "excluir cartão nubank" — abre o diálogo e espera "sim" */
    function cvvCardDelete(text) {
        const nv = cvvNorm(text);
        const card = cvvCardByVoice(nv);
        if (!card) return;
        cvvSay('Vou excluir o cartão ' + card.name + '. Diga “sim” para confirmar.');
        deleteCard(card.id);
    }

    /* ===================== CONTAS ===================== */
    function cvvAccountsList() {
        const list = (typeof accounts !== 'undefined' && Array.isArray(accounts)) ? accounts : [];
        if (!list.length) { cvvSay('Você ainda não tem contas cadastradas. Diga “criar conta nubank com mil e quinhentos”.'); return; }
        if (isPrivacyHidden) { cvvSay('Valores ocultos pelo modo de privacidade. Diga “mostrar valores”.'); return; }
        const linhas = list.map(a => a.name + ': ' + cvvMoneyWords(accountBalance(a)));
        cvvSay('Suas contas: ' + linhas.join('. ') + '. Total: ' + cvvMoneyWords(totalAccountsBalance()) + '.');
    }

    function cvvAccountTypeName(nv) {
        if (/poupanc/.test(nv)) return 'poupanca';
        if (/corrent/.test(nv)) return 'corrente';
        if (/dinheiro|especie/.test(nv)) return 'dinheiro';
        if (/investiment/.test(nv)) return 'investimentos';
        if (/outro/.test(nv)) return 'outros';
        return null;
    }

    /* "criar conta nubank com 1500" · "criar conta poupança com dois mil" */
    function cvvAccountCreate(text) {
        const nv = cvvNorm(text);
        if (typeof openAccountModal !== 'function') { cvvSay('Contas não disponíveis agora.'); return; }
        const nums = cvvAllNumbers(text);
        if (!nums.length) { cvvSay('Qual o saldo inicial da conta? Diga, por exemplo: “criar conta nubank com mil e quinhentos”.'); return; }
        const saldo = nums[0];
        let nome = text;
        const mIdx = nv.indexOf('conta');
        if (mIdx >= 0) nome = text.slice(mIdx + 5);
        ['criar', 'nova', 'novo', 'cadastrar', 'adicionar', 'com', 'de', 'do', 'da', 'tipo', 'poupanca', 'poupança', 'corrente', 'dinheiro', 'especie', 'investimento', 'investimentos', 'outros', 'saldo'].forEach(w => { nome = cvvStrip(nome, w); });
        nome = cvvStripNumbers(nome);
        CVV_FILLER.forEach(w => { nome = cvvStrip(nome, w); });
        nome = nome.replace(/\s+/g, ' ').replace(/^[\s,.:;]+|[\s,.:;]+$/g, '');
        const tipo = cvvAccountTypeName(nv);
        /* "criar conta poupança com dois mil" → sem nome próprio: usa o tipo como nome */
        if (!nome && tipo) nome = { poupanca: 'Poupança', corrente: 'Conta corrente', dinheiro: 'Dinheiro', investimentos: 'Investimentos', outros: 'Outros' }[tipo];
        if (!nome) { cvvSay('Qual o nome da conta? Diga, por exemplo: “criar conta nubank com mil e quinhentos”.'); return; }
        openAccountModal();
        cvvSet('accountName', nome);
        if (tipo) cvvSet('accountType', tipo);
        cvvSet('accountBalanceInput', String(saldo.toFixed(2)));
        cvvSubmit('accountForm');
        cvvSay('Conta ' + nome + ' criada com saldo de ' + cvvMoneyWords(saldo) + '.');
    }

    /* "editar conta nubank com saldo 2000" */
    function cvvAccountEdit(text) {
        const nv = cvvNorm(text);
        const list = (typeof accounts !== 'undefined' && Array.isArray(accounts)) ? accounts : [];
        if (!list.length) { cvvSay('Você ainda não tem contas cadastradas.'); return; }
        const acc = cvvFindByName(list, nv);
        if (!acc) { cvvSay('Qual conta? Suas contas são: ' + list.map(x => x.name).join(', ') + '.'); return; }
        const nums = cvvAllNumbers(text);
        if (!nums.length) { cvvSay('Qual o novo saldo da conta ' + acc.name + '?'); return; }
        openAccountModal(acc.id);
        cvvSet('accountBalanceInput', String(nums[0].toFixed(2)));
        const tipo = cvvAccountTypeName(nv);
        if (tipo) cvvSet('accountType', tipo);
        cvvSubmit('accountForm');
        cvvSay('Saldo da conta ' + acc.name + ' ajustado para ' + cvvMoneyWords(nums[0]) + '.');
    }

    /* "excluir conta nubank" — espera "sim" */
    function cvvAccountDelete(text) {
        const nv = cvvNorm(text);
        const list = (typeof accounts !== 'undefined' && Array.isArray(accounts)) ? accounts : [];
        if (!list.length) { cvvSay('Você ainda não tem contas cadastradas.'); return; }
        const acc = cvvFindByName(list, nv);
        if (!acc) { cvvSay('Qual conta? Suas contas são: ' + list.map(x => x.name).join(', ') + '.'); return; }
        cvvSay('Vou excluir a conta ' + acc.name + '. Diga “sim” para confirmar.');
        deleteAccount(acc.id);
    }

    /* "transferir 100 da poupança para a corrente" */
    function cvvTransfer(text) {
        const nv = cvvNorm(text);
        const list = (typeof accounts !== 'undefined' && Array.isArray(accounts)) ? accounts : [];
        if (list.length < 2) { cvvSay('Crie pelo menos duas contas para transferir entre elas.'); return; }
        const val = cvvExtractNumber(text);
        if (isNaN(val) || val <= 0) {
            if (typeof openTransferModal === 'function') { openTransferModal(); cvvSay('Abrindo transferência. Diga, por exemplo: “transferir cem da poupança para a corrente”.'); }
            return;
        }
        /* casa por NOME ou por TIPO ("poupança", "corrente") e ordena pela
           posição em que a conta foi citada na frase */
        const typeRe = { poupanca: /poupanc/, corrente: /corrent/, dinheiro: /dinheiro|especie/, investimentos: /investiment/, outros: /outro/ };
        const menc = [];
        list.forEach(a => {
            const nomeNv = cvvNorm(a.name);
            let pos = nomeNv.length > 1 ? nv.indexOf(nomeNv) : -1;
            const re = typeRe[a.type];
            if (re) {
                const m = re.exec(nv);
                if (m && (pos < 0 || m.index < pos)) pos = m.index;
            }
            if (pos >= 0) menc.push({ acc: a, pos: pos });
        });
        menc.sort((x, y) => x.pos - y.pos);
        if (menc.length < 2) {
            cvvSay('De qual conta e para qual conta? Suas contas são: ' + list.map(x => x.name).join(', ') + '.');
            return;
        }
        const from = menc[0].acc, to = menc[1].acc;
        if (String(from.id) === String(to.id)) { cvvSay('Escolha duas contas diferentes.'); return; }
        openTransferModal();
        cvvSet('transferFrom', String(from.id));
        cvvSet('transferTo', String(to.id));
        cvvSet('transferValue', val.toFixed(2));
        cvvSet('transferDate', toIso(new Date()));
        cvvSubmit('transferForm');
        cvvSay(cvvMoneyWords(val) + ' transferidos de ' + from.name + ' para ' + to.name + '.');
    }

    /* ===================== COFRINHO ===================== */
    /* "guardar 500 no cofrinho" · "resgatar 100 do cofrinho" */
    function cvvCofrinhoValue(text, mode) {
        if (typeof openCofrinhoValue !== 'function') { cvvSay('Cofrinho não disponível agora.'); return; }
        const val = cvvExtractNumber(text);
        if (isNaN(val) || val <= 0) { cvvSay('Quanto você quer ' + (mode === 'add' ? 'guardar' : 'resgatar') + ' no cofrinho?'); return; }
        const c = (typeof cofrinho !== 'undefined') ? cofrinho : null;
        if (mode === 'remove' && c && val > c.saldo + 0.001) { cvvSay('Só há ' + cvvMoneyWords(c.saldo) + ' no cofrinho.'); return; }
        openCofrinhoValue(mode);
        cvvSet('goalValueInput', val.toFixed(2));
        confirmCofrinhoValue();
        const novo = c ? (mode === 'add' ? c.saldo : c.saldo) : null;
        cvvSay((mode === 'add' ? 'Guardei ' : 'Resgatei ') + cvvMoneyWords(val) + (mode === 'add' ? ' no cofrinho.' : ' do cofrinho.') + (novo != null ? ' Saldo: ' + cvvMoneyWords(novo) + '.' : ''));
    }

    /* "quanto tenho no cofrinho" · "quanto rende o cofrinho" · "status do cofrinho" */
    function cvvCofrinhoStatus() {
        const c = (typeof cofrinho !== 'undefined') ? cofrinho : null;
        if (!c) { cvvSay('Cofrinho não encontrado.'); return; }
        const cdi = Number(c.cdi) || 0;
        const mensal = Number(c.mensal) || 0;
        const rendMes = round2(c.saldo * (cdi / 100) / 12);
        const proj = (typeof cfProjection === 'function') ? cfProjection(c.saldo, mensal, 12) : null;
        if (isPrivacyHidden) {
            cvvSay('Cofrinho com CDI de ' + cdi.toFixed(2).replace('.', ',') + ' por cento ao ano. Valores ocultos. Diga “mostrar valores”.');
            return;
        }
        let txt = 'Cofrinho: ' + cvvMoneyWords(c.saldo) + ' guardados, CDI de ' + cdi.toFixed(2).replace('.', ',') + ' por cento ao ano';
        txt += rendMes > 0 ? ', rendendo cerca de ' + cvvMoneyWords(rendMes) + ' por mês' : '';
        txt += '.';
        if (proj != null && proj > c.saldo) txt += ' Em 12 meses, com ' + cvvMoneyWords(mensal) + ' por mês, você teria ' + cvvMoneyWords(proj) + '.';
        cvvSay(txt);
    }

    /* "definir CDI 13" · "CDI 13,5" */
    function cvvCofrinhoCdi(text) {
        const val = cvvNumberAfter(text, 'cdi');
        if (isNaN(val) || val < 0 || val > 100) { cvvSay('Qual o CDI em por cento ao ano? Diga, por exemplo: “definir CDI 13”.'); return; }
        cvvSet('cdiInput', String(val));
        setCdi();
        cvvSay('CDI definido em ' + val.toFixed(2).replace('.', ',') + ' por cento ao ano.');
    }

    /* "guardar 300 por mês" · "quanto guardar por mês" */
    function cvvCofrinhoMensal(text) {
        const val = cvvExtractNumber(text);
        if (isNaN(val) || val < 0) { cvvSay('Quanto você quer guardar por mês? Diga, por exemplo: “guardar trezentos por mês”.'); return; }
        const el = cvv$('simAporte');
        if (el) el.value = String(val);
        saveGuardadoMensal();
        cvvSay('Guardado mensal definido em ' + cvvMoneyWords(val) + ' por mês.');
    }

    /* ===================== RENDA FIXA ===================== */
    /* "criar renda fixa cdb de 1000 por 12 meses" */
    function cvvRfCreate(text) {
        const nv = cvvNorm(text);
        if (typeof openRendaFixa !== 'function') { cvvSay('Renda fixa não disponível agora.'); return; }
        const nums = cvvAllNumbers(text);
        if (!nums.length) { cvvSay('Qual o valor da renda fixa? Diga, por exemplo: “criar renda fixa cdb de mil por doze meses”.'); return; }
        const valor = nums[0];
        let prazo = 12;
        const pm = /(\d+|[a-zà-ú]+)\s*(meses|mes)\b/.exec(nv);
        if (pm) { const p = cvvExtractNumber(pm[1]); if (!isNaN(p) && p >= 1) prazo = Math.round(p); }
        else if (nums.length > 1) prazo = Math.max(1, Math.round(nums[1]));
        openRendaFixa();
        const sel = cvv$('rfTipo');
        const tipoMap = [['cdb', 'CDB'], ['lci', 'LCI'], ['lca', 'LCA'], ['tesouro', 'Tesouro Selic'], ['selic', 'Tesouro Selic'], ['cri', 'CRI'], ['cra', 'CRA'], ['debenture', 'Debênture'], ['debentura', 'Debênture']];
        for (const [kw, val] of tipoMap) {
            if (nv.indexOf(kw) >= 0 && sel && Array.prototype.some.call(sel.options, o => o.value === val)) { cvvSet('rfTipo', val); break; }
        }
        cvvSet('rfValor', String(valor));
        cvvSet('rfPrazo', String(prazo));
        const ini = cvv$('rfInicio');
        if (ini && !ini.value) cvvSet('rfInicio', toIso(new Date()));
        cvvSubmit('rfForm');
        const tipoSel = sel ? sel.value : 'Renda fixa';
        cvvSay(tipoSel + ' registrado: ' + cvvMoneyWords(valor) + ' por ' + prazo + ' meses.');
    }

    /* "quanto rende renda fixa" · "status da renda fixa" */
    function cvvRfStatus() {
        const rf = (typeof rendaFixa !== 'undefined') ? rendaFixa : null;
        if (!rf || !rf.itens || !rf.itens.length) { cvvSay('Você ainda não tem investimentos de renda fixa registrados.'); return; }
        if (isPrivacyHidden) { cvvSay('Valores ocultos pelo modo de privacidade. Diga “mostrar valores”.'); return; }
        const total = rf.itens.reduce((s, i) => s + (Number(i.valor) || 0), 0);
        const receita = (typeof rfReceitaFoco === 'function') ? rfReceitaFoco() : 0;
        cvvSay('Renda fixa: ' + rf.itens.length + ' registro(s), total investido de ' + cvvMoneyWords(total) + '. No mês focado rendeu ' + cvvMoneyWords(receita) + '.');
    }

    /* "excluir renda fixa cdb" */
    function cvvRfDelete(text) {
        const nv = cvvNorm(text);
        const rf = (typeof rendaFixa !== 'undefined') ? rendaFixa : null;
        if (!rf || !rf.itens || !rf.itens.length) { cvvSay('Você ainda não tem investimentos de renda fixa registrados.'); return; }
        let item = rf.itens.find(i => nv.indexOf(cvvNorm(i.tipo)) >= 0);
        if (!item && rf.itens.length === 1) item = rf.itens[0];
        if (!item) { cvvSay('Qual registro? Você tem: ' + rf.itens.map(i => i.tipo + ' de ' + money(i.valor)).join(', ') + '.'); return; }
        if (typeof rfLoadItem === 'function') rfLoadItem(item.id);
        cvvSay('Vou excluir o registro ' + item.tipo + ' de ' + cvvMoneyWords(item.valor) + '. Diga “sim” para confirmar.');
        deleteRfFromModal();
    }

    /* ===================== ORÇAMENTOS ===================== */
    /* "criar orçamento alimentação com 800" */
    function cvvBudgetCreate(text) {
        const nv = cvvNorm(text);
        const val = cvvExtractNumber(text);
        if (isNaN(val) || val <= 0) { cvvSay('Qual o limite mensal? Diga, por exemplo: “criar orçamento alimentação com oitocentos”.'); return; }
        const names = (typeof categoriesData !== 'undefined' ? categoriesData : []).map(c => c.name);
        const cat = names.find(n => nv.indexOf(cvvNorm(n)) >= 0)
            || ((typeof budgets !== 'undefined' && budgets) ? (budgets.find(b => nv.indexOf(cvvNorm(b.name)) >= 0) || {}).name : null);
        if (!cat) { cvvSay('De qual categoria? Categorias: ' + names.join(', ') + '.'); return; }
        if (typeof openBudgetModal === 'function') openBudgetModal();
        if (typeof pickBudget === 'function') pickBudget(cat);
        cvvSet('budgetLimit', String(val));
        cvvSubmit('budgetForm');
        cvvSay('Orçamento de ' + cat + ' definido: ' + cvvMoneyWords(val) + ' por mês.');
    }

    /* "excluir orçamento alimentação" — espera "sim" */
    function cvvBudgetDelete(text) {
        const nv = cvvNorm(text);
        const list = (typeof budgets !== 'undefined' && Array.isArray(budgets)) ? budgets : [];
        if (!list.length) { cvvSay('Você ainda não tem orçamentos definidos.'); return; }
        const b = cvvFindByName(list, nv);
        if (!b) { cvvSay('Qual orçamento? Você tem: ' + list.map(x => x.name).join(', ') + '.'); return; }
        cvvSay('Vou remover o orçamento de ' + b.name + '. Diga “sim” para confirmar.');
        removeBudget(b.name);
    }

    /* ===================== TRANSAÇÕES: excluir / editar ===================== */
    function cvvTxDelete(text) {
        const nv = cvvNorm(text);
        const list = (typeof transactions !== 'undefined' && Array.isArray(transactions)) ? transactions : [];
        if (!list.length) { cvvSay('Não há movimentações no extrato.'); return; }
        let tx = null;
        if (/ultima|ultimo/.test(nv)) tx = list[0];
        else {
            tx = list.find(t => { const d = cvvNorm(t.desc || ''); return d.length > 2 && nv.indexOf(d) >= 0; })
              || list.find(t => { const d = cvvNorm(t.desc || ''); return d.split(/\s+/).some(w => w.length > 3 && nv.indexOf(w) >= 0); });
        }
        if (!tx) { cvvSay('Não encontrei essa movimentação no extrato.'); return; }
        cvvSay('Vou excluir a movimentação “' + (tx.desc || 'sem descrição') + '” de ' + cvvMoneyWords(Math.abs(tx.amount)) + '. Diga “sim” para confirmar.');
        deleteTransaction(tx.id);
    }

    function cvvTxEdit(text) {
        const nv = cvvNorm(text);
        const list = (typeof transactions !== 'undefined' && Array.isArray(transactions)) ? transactions : [];
        if (!list.length) { cvvSay('Não há movimentações no extrato.'); return; }
        let tx = null;
        if (/ultima|ultimo/.test(nv)) tx = list[0];
        else {
            tx = list.find(t => { const d = cvvNorm(t.desc || ''); return d.length > 2 && nv.indexOf(d) >= 0; })
              || list.find(t => { const d = cvvNorm(t.desc || ''); return d.split(/\s+/).some(w => w.length > 3 && nv.indexOf(w) >= 0); });
        }
        if (!tx) { cvvSay('Não encontrei essa movimentação no extrato.'); return; }
        editTransaction(tx.id);
        cvvSay('Abri a movimentação “' + (tx.desc || 'sem descrição') + '” para edição. Ajuste e salve na tela.');
    }

    /* ===================== CALENDÁRIO, BUSCA E RELATÓRIOS ===================== */
    const CVV_MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    /* nome falado → índice do mês (0-11), tolerando a forma sem acento */
    function cvvMonthIndex(nv) {
        for (let i = 0; i < CVV_MONTHS.length; i++) {
            if (nv.indexOf(cvvNorm(CVV_MONTHS[i])) >= 0) return i;
        }
        return -1;
    }

    function cvvCalendar(text) {
        const nv = cvvNorm(text);
        if (/todos os meses|tudo|sem filtro/.test(nv) && typeof selectMonth === 'function') {
            selectMonth(-1);
            cvvSay('Mostrando todos os meses.');
            return true;
        }
        if (/(proximo|seguinte)/.test(nv) && /mes/.test(nv) && typeof selectMonth === 'function') {
            const cur = (typeof selectedMonthIndex !== 'undefined' && selectedMonthIndex >= 0) ? selectedMonthIndex : new Date().getMonth();
            const next = Math.min(11, cur + 1);
            selectMonth(next);
            cvvSay('Mudando para ' + CVV_MONTHS[next] + '.');
            return true;
        }
        if (/(anterior|passado)/.test(nv) && /mes/.test(nv) && typeof selectMonth === 'function') {
            const cur = (typeof selectedMonthIndex !== 'undefined' && selectedMonthIndex >= 0) ? selectedMonthIndex : new Date().getMonth();
            const prev = Math.max(0, cur - 1);
            selectMonth(prev);
            cvvSay('Mudando para ' + CVV_MONTHS[prev] + '.');
            return true;
        }
        const idx = cvvMonthIndex(nv);
        if (idx >= 0 && typeof selectMonth === 'function') {
            selectMonth(idx);
            cvvSay('Mostrando ' + CVV_MONTHS[idx] + '.');
            return true;
        }
        if (/limpar filtro|limpar filtros|resetar|voltar ao normal/.test(nv) && typeof resetAllFilters === 'function') {
            resetAllFilters();
            cvvSay('Filtros limpos.');
            return true;
        }
        if (/(buscar|procurar|pesquisar)/.test(nv)) {
            let q = text;
            ['buscar', 'procurar', 'pesquisar', 'por', 'no', 'na', 'extrato', 'movimentacoes', 'transacoes'].forEach(w => { q = cvvStrip(q, w); });
            q = q.replace(/\s+/g, ' ').replace(/^[\s,.:;]+|[\s,.:;]+$/g, '');
            if (!q) { cvvSay('O que você quer buscar no extrato?'); return true; }
            const inp = cvv$('searchInput');
            if (inp) { inp.value = q; if (typeof handleGlobalSearch === 'function') handleGlobalSearch(); }
            const sec = document.getElementById('movimentacoes');
            if (sec && sec.scrollIntoView) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
            cvvSay('Buscando “' + q + '” no extrato.');
            return true;
        }
        if (/(exportar|baixar|gerar).*(csv|planilha|extrato)|exportar csv/.test(nv)) {
            if (typeof exportToCSV === 'function') { exportToCSV(); cvvSay('Arquivo CSV do extrato baixado.'); }
            return true;
        }
        if (/imprimir|print|relatorio impresso/.test(nv)) {
            if (typeof printReport === 'function') { printReport(); cvvSay('Abrindo a impressão do relatório.'); }
            return true;
        }
        return false;
    }

    /* ===================== TEMA, PERFIL E CONTA ===================== */
    function cvvTheme(nv) {
        const map = [['esmerald', 'emerald'], ['verde', 'emerald'], ['violet', 'violet'], ['roxo', 'violet'], ['roxa', 'violet'], ['sol', 'sunset'], ['rosa', 'sunset'], ['laranja', 'sunset'], ['oceano', 'ocean'], ['azul', 'ocean']];
        for (const [kw, val] of map) {
            if (nv.indexOf(kw) >= 0 && typeof setTheme === 'function') {
                setTheme(val);
                cvvSay('Tema alterado.');
                return true;
            }
        }
        if (/modo escuro|escuro|dark/.test(nv) && typeof setMode === 'function') {
            setMode('dark');
            cvvSay('Modo escuro ativado.');
            return true;
        }
        if (/modo claro|claro|light/.test(nv) && typeof setMode === 'function') {
            setMode('light');
            cvvSay('Modo claro ativado.');
            return true;
        }
        return false;
    }

    function cvvProfile(text, nv) {
        const m = /(meu nome e|me chame de|pode me chamar de|chame me de|meu nome e)\s+(.+)/.exec(nv);
        if (m) {
            let nome = m[2];
            ['e', 'o', 'a'].forEach(w => { nome = cvvStrip(nome, w); });
            nome = nome.replace(/\s+/g, ' ').trim();
            if (!nome) return true;
            /* preserva acentuação do texto original na medida possível */
            const mOrig = /(meu nome é|me chame de|pode me chamar de|chame-me de|meu nome e)\s+(.+)/i.exec(text);
            const nomeFinal = (mOrig ? mOrig[2] : nome).replace(/\s+/g, ' ').trim();
            if (typeof saveProfileName === 'function' && cvv$('settingsNameInput')) {
                cvv$('settingsNameInput').value = nomeFinal.charAt(0).toUpperCase() + nomeFinal.slice(1);
                saveProfileName();
                cvvSay('Pronto, vou te chamar de ' + nomeFinal + '.');
            }
            return true;
        }
        if (/(baixar|fazer|gerar|salvar).*(backup|copia)/.test(nv) && typeof exportBackup === 'function') {
            exportBackup();
            cvvSay('Backup baixado.');
            return true;
        }
        if (/^(sair|sair da conta|deslogar|fazer logout|logout|encerrar sessao|encerrar sessão)/.test(nv) && typeof logoutCentavus === 'function') {
            cvvSay('Saindo da conta. Até logo!');
            setTimeout(() => { try { logoutCentavus(null); } catch (e) {} }, 350);
            return true;
        }
        return false;
    }

    /* ===================== ROTEADOR DE COMANDOS ===================== */
    function cvvRun(text) {
        if (!text) return;
        cvvLogAdd('user', text);
        const nv = cvvNorm(text);

        if (cvvOnLoginScreen()) {
            const msg = 'Entre na sua conta para usar o assistente.';
            cvvLogAdd('bot', msg); cvvSpeak(msg);
            return;
        }

        /* diálogo de confirmação aberto? A voz pode confirmar/cancelar */
        if (cvvTryConfirmVoice(nv)) return;

        /* silêncio */
        if (/(pare|cala|cala a boca|silencio|silenciar|nao fale|stop)/.test(nv) && !/valor/.test(nv)) {
            try { window.speechSynthesis.cancel(); } catch (e) {}
            cvvLogAdd('bot', 'Certo, em silêncio.');
            cvvSetStatus('Silêncio. Toque no microfone quando quiser.', false);
            return;
        }

        /* ajuda */
        if (/^(ajuda|help|comandos|o que voce faz|como funciona|comandos de voz)/.test(nv) || /\bajuda\b/.test(nv)) {
            cvvHelp(); return;
        }

        /* limite diário do plano (voz) — comandos de plano/ativação são livres
           e o Zap já cobra a cota própria dele */
        if (typeof cvQuotaUsar === 'function' && typeof cvQuotaLivre === 'function' && !window.__cvZapAtivo && !cvQuotaLivre(nv)) {
            if (!cvQuotaUsar('voz')) {
                const m = 'Você atingiu o limite de comandos de voz do plano Grátis hoje. O Pro custa 19,90 reais por mês e libera 150 por dia. Diga “ver planos” que eu abro para você.';
                cvvLogAdd('bot', m);
                cvvSpeak(m);
                if (typeof cvAbrirPlanos === 'function') cvAbrirPlanos();
                return;
            }
        }

        /* privacidade */
        if (/(mostrar|exibir|liberar|revelar).*(valores|numeros|saldos)/.test(nv)) {
            if (typeof togglePrivacyMode === 'function' && isPrivacyHidden) togglePrivacyMode();
            const m = 'Valores visíveis de novo.'; cvvLogAdd('bot', m); cvvSpeak(m); return;
        }
        if (/(ocultar|esconder|esconder|privacidade|modo privado).*(valores|numeros|saldos|tudo)|ocultar tudo/.test(nv)) {
            if (typeof togglePrivacyMode === 'function' && !isPrivacyHidden) togglePrivacyMode();
            const m = 'Valores ocultados.'; cvvLogAdd('bot', m); cvvSpeak(m); return;
        }

        /* notificações */
        if (/notificac|avisos|sino\b/.test(nv) && !/quanto/.test(nv)) {
            if (/limpar|apagar|zerar/.test(nv) && typeof clearNotifs === 'function') { clearNotifs(); cvvSay('Notificações limpas.'); return; }
            if (/marcar.*(lida|lidas)|marcar todas/.test(nv) && typeof markAllNotifsRead === 'function') { markAllNotifsRead(); cvvSay('Notificações marcadas como lidas.'); return; }
            if (typeof toggleNotifications === 'function') toggleNotifications();
            const unread = (typeof notifItems !== 'undefined' ? notifItems : []).length;
            const txt = unread ? 'Notificações abertas. Você tem ' + unread + ' avisos.' : 'Notificações abertas. Nenhuma novidade.';
            cvvLogAdd('bot', txt); cvvSpeak(txt);
            return;
        }

        /* ==================== COMANDOS COMPLETOS DO SITE ==================== */

        /* --- recursos premium: projeção, vazamentos, mapa de calor --- */
        if (/(proje|quanto vou gastar|quanto vai gastar|fim do mes|terminar o mes|ritmo de gasto|vazamento|cobranca duplicada|cobrança duplicada|gastos formiga|detector|mapa de calor|calor dos gastos)/.test(nv)) {
            cvvExtras(text, nv);
            return;
        }

        /* --- planos, assinatura e ativação (sempre livres, sem cota) --- */
        if (/(plano|assinatura|premium|\bpro\b|quanto custa|ativar|codigo|testar|\btrial\b|zap|whatsapp)/.test(nv)) {
            cvvPlans(text, nv);
            return;
        }

        /* tema e modo */
        if (/(tema|modo|dark|light|escuro|claro)/.test(nv) && cvvTheme(nv)) return;

        /* perfil, backup e sair */
        if (/(meu nome|me chame|chame me|chame-me|backup|sair da conta|deslogar|logout|encerrar sessao|encerrar sessão)/.test(nv) && cvvProfile(text, nv)) return;

        /* --- cofrinho --- */
        if (/cdi/.test(nv)) {
            if (/\d/.test(nv)) { cvvCofrinhoCdi(text); return; }
            cvvCofrinhoStatus(); return;
        }
        if (/cofrinho/.test(nv)) {
            if (/(guardar|depositar|aporte|guarda)\b/.test(nv) && /(por mes|mensal)/.test(nv)) { cvvCofrinhoMensal(text); return; }
            if (/(guardar|depositar|aportar)/.test(nv)) { cvvCofrinhoValue(text, 'add'); return; }
            if (/(resgatar|sacar|tirar|retirar)/.test(nv)) { cvvCofrinhoValue(text, 'remove'); return; }
            if (/cdi/.test(nv) && /(definir|mudar|alterar|colocar|ajustar|\d)/.test(nv)) { cvvCofrinhoCdi(text); return; }
            cvvCofrinhoStatus(); return;
        }
        if (/(guardar|guarda) .* (por mes|por mês|mensal)/.test(nv)) { cvvCofrinhoMensal(text); return; }

        /* --- metas --- */
        if (/meta/.test(nv)) {
            if (/(abrir|abre|ir para|vai para|mostrar|mostra|exibir|exibe)/.test(nv) && !/(criar|cria|nova|editar|guardar|excluir|resgatar)/.test(nv)) {
                if (cvvGoto('metas')) return;
            }
            if (/(criar|cria|nova|novo|adicionar|cadastrar|lancar|lançar)/.test(nv)) {
                if (cvvAllNumbers(text).length) { cvvGoalCreate(text); }
                else if (typeof openGoalModal === 'function') { openGoalModal(); cvvSay('Abrindo nova meta. Diga, por exemplo: “criar meta viagem com quinhentos de cinco mil”.'); }
                return;
            }
            if (/(guardar|depositar|aporte|juntar)/.test(nv)) { cvvGoalValue(text, 'add'); return; }
            if (/(resgatar|sacar|tirar)/.test(nv)) { cvvGoalValue(text, 'remove'); return; }
            if (/(editar|ajustar|mudar|alterar|aumentar|diminuir|aumenta)/.test(nv)) { cvvGoalEdit(text); return; }
            if (/(excluir|apagar|remover|deletar)/.test(nv)) { cvvGoalDelete(text); return; }
            cvvGoalsList(); return;
        }

        /* --- cartões: criar / editar / excluir com dados --- */
        if (/cart/.test(nv)) {
            if (/(criar|cria|novo|nova|cadastrar|adicionar)/.test(nv)) {
                if (cvvNumberAfter(text, 'limite') >= 0 && !isNaN(cvvNumberAfter(text, 'limite'))) { cvvCardCreate(text); }
                else if (typeof openCardModal === 'function') { openCardModal(); cvvSay('Abrindo novo cartão. Diga, por exemplo: “criar cartão nubank com limite de cinco mil”.'); }
                return;
            }
            if (/(editar|ajustar|mudar|alterar)/.test(nv)) { cvvCardEdit(text); return; }
            if (/(excluir|apagar|remover|deletar)/.test(nv)) { cvvCardDelete(text); return; }
            if (/(meus cartoes|meus cartões|lista|listar|quais|quanto tenho de limite|limites)/.test(nv)) {
                const list = (typeof cards !== 'undefined' && Array.isArray(cards)) ? cards : [];
                if (!list.length) { cvvSay('Você ainda não tem cartões cadastrados.'); return; }
                if (isPrivacyHidden) { cvvSay('Valores ocultos pelo modo de privacidade. Diga “mostrar valores”.'); return; }
                const linhas = list.map(c => c.name + ': limite de ' + cvvMoneyWords(c.limit));
                cvvSay('Seus cartões: ' + linhas.join('. ') + '.');
                return;
            }
        }

        /* --- contas: criar / editar / excluir / transferir --- */
        if (/transfer/.test(nv) || /transferir/.test(nv)) { cvvTransfer(text); return; }
        if (/conta/.test(nv) || /(quanto tenho em|em cada conta|saldos|minhas contas)/.test(nv)) {
            if (/(criar|cria|nova|novo|cadastrar|adicionar)/.test(nv)) {
                if (cvvAllNumbers(text).length) { cvvAccountCreate(text); }
                else if (typeof openAccountModal === 'function') { openAccountModal(); cvvSay('Abrindo nova conta. Diga, por exemplo: “criar conta nubank com mil e quinhentos”.'); }
                return;
            }
            if (/(editar|ajustar|mudar|alterar|saldo)/.test(nv) && cvvAllNumbers(text).length) { cvvAccountEdit(text); return; }
            if (/(excluir|apagar|remover|deletar)/.test(nv)) { cvvAccountDelete(text); return; }
            cvvAccountsList(); return;
        }

        /* --- renda fixa --- */
        if (/renda fixa|investimento|cdb|tesouro|lci|lca/.test(nv)) {
            if (/(criar|cria|novo|nova|cadastrar|registrar|adicionar)/.test(nv) && cvvAllNumbers(text).length) { cvvRfCreate(text); return; }
            if (/(excluir|apagar|remover|deletar)/.test(nv)) { cvvRfDelete(text); return; }
            if (/(quanto rende|quanto rendeu|status|quanto recebo|rendimento|rendimentos|quanto tenho)/.test(nv)) { cvvRfStatus(); return; }
            if (typeof openRendaFixa === 'function') { openRendaFixa(); cvvSay('Abrindo renda fixa.'); }
            return;
        }

        /* --- orçamentos --- */
        if (/(orcamento|orçamento|limite mensal)/.test(nv)) {
            if (/(criar|cria|novo|nova|definir|ajustar|criar limite)/.test(nv) && cvvAllNumbers(text).length) { cvvBudgetCreate(text); return; }
            if (/(excluir|apagar|remover|deletar)/.test(nv)) { cvvBudgetDelete(text); return; }
            if (typeof openBudgetModal === 'function') { openBudgetModal(); cvvSay('Abrindo orçamentos.'); }
            return;
        }

        /* --- transações: excluir / editar --- */
        if (/(excluir|apagar|remover|deletar)/.test(nv) && /(transacao|transação|movimentacao|movimentação|ultima|ultimo|lançamento|lancamento)/.test(nv)) { cvvTxDelete(text); return; }
        if (/(editar|ajustar|alterar)/.test(nv) && /(transacao|transação|movimentacao|movimentação|ultima|ultimo)/.test(nv)) { cvvTxEdit(text); return; }

        /* --- calendário, busca e relatórios (não intercepta lançamentos) --- */
        if (!CVV_VERBS_OUT.some(v => nv.indexOf(v) >= 0) && !CVV_VERBS_IN.some(v => nv.indexOf(v) >= 0) &&
            /(mes|janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|filtro|buscar|procurar|pesquisar|csv|exportar|baixar|imprimir|print|todos os meses)/.test(nv)) {
            if (cvvCalendar(text)) return;
        }

        /* resumos financeiros */
        if (/(quanto gastei|quanto recebi|quanto entrou|quanto saiu|saldo|resumo|como (estou|esta|estao|minhas financas)|minhas financas|fechamento|como esta a situacao|quanto tenho)/.test(nv)) {
            if (/\b(em|do|da)\s+[a-zà-ú\s]{2,20}$/.test(nv) && cvvCategoryQuery(nv)) return;
            cvvSummary(); return;
        }
        if (/quanto.*\b(em|no|na)\b/.test(nv) && cvvCategoryQuery(nv)) return;

        /* modais de cadastro */
        if (/(nova|novo|adicionar|cadastrar|criar|registrar).*(transacao|movimentacao|lancamento)/.test(nv)) {
            if (typeof openModal === 'function') { openModal(); const t = 'Abrindo nova transação.'; cvvLogAdd('bot', t); cvvSpeak(t); }
            return;
        }
        if (/(nova|novo|fazer|fazer transferencia|transferencia)/.test(nv) && /transfer/.test(nv)) {
            if (typeof openTransferModal === 'function') { openTransferModal(); const t = 'Abrindo transferência.'; cvvLogAdd('bot', t); cvvSpeak(t); }
            return;
        }
        if (/configurac|minha conta|meu perfil|perfil/.test(nv)) {
            if (typeof openSettings === 'function') { openSettings(); const t = 'Abrindo configurações.'; cvvLogAdd('bot', t); cvvSpeak(t); }
            return;
        }

        /* faturas de cartão — ANTES do fluxo de transação, senão "paguei a fatura"
           seria capturado como um gasto comum e dobraria o valor */
        if (/\bfatura\b|faturas/.test(nv) || /\bdevo\b|devendo/.test(nv)) {
            if (/(pague|pagar|baix|quit|diminu|abat)/.test(nv)) { cvvPayInvoice(text); return; }
            if (/(abrir|ver|mostrar|mostra|abre|qual|quais|quanto)/.test(nv)) { cvvInvoiceStatus(); return; }
            cvvInvoiceStatus(); return;
        }

        /* lançar movimentação por voz */
        if (CVV_VERBS_OUT.some(v => nv.indexOf(v) === 0) || CVV_VERBS_IN.some(v => nv.indexOf(v) === 0) ||
            CVV_VERBS_OUT.some(v => nv.indexOf(v) >= 0) || CVV_VERBS_IN.some(v => nv.indexOf(v) >= 0)) {
            cvvAddTransaction(text); return;
        }

        /* navegação com "abrir/ir para/mostrar" */
        if (/(abrir|abre|ir para|vai para|mostrar|mostra|exibir|exibe|ir em)/.test(nv)) {
            for (const item of CVV_NAV) {
                if (item.keys.some(k => nv.indexOf(k) >= 0)) { cvvGoto(item.section); return; }
            }
        }

        /* fallback amigável */
        const msg = 'Não entendi. Diga “ajuda” para ver exemplos do que posso fazer.';
        cvvLogAdd('bot', msg);
        cvvSpeak(msg);
    }

    /* ===================== BOOT ===================== */
    function cvvBoot() {
        cvvBuildUI();
        cvvPickVoice();
        if ('speechSynthesis' in window) {
            try { window.speechSynthesis.onvoiceschanged = cvvPickVoice; } catch (e) {}
        }
        if (!cvvRecClass()) {
            cvvFab.innerHTML = '<i class="fa-solid fa-keyboard"></i>';
            cvvFab.title = 'Assistente Centavus (texto — microfone não suportado aqui)';
            cvvSetStatus('Microfone não suportado neste navegador/página. Use os exemplos ou digite comandos.', false);
        }

        document.addEventListener('keydown', (ev) => {
            if (ev.altKey && (ev.key === 'v' || ev.key === 'V')) {
                ev.preventDefault();
                cvvToggle();
                return;
            }
            if (ev.key === 'Escape' && cvvPanel && !cvvPanel.classList.contains('cvv-hidden')) {
                const tag = (ev.target && ev.target.tagName) || '';
                if (tag !== 'INPUT' && tag !== 'TEXTAREA') cvvHide();
            }
        });

        /* bloqueio por limite do plano: fala o aviso quando veio do microfone
           (o Zap mostra no chat; cliques comuns já recebem o toast) */
        document.addEventListener('cv:gate', (ev) => {
            if (window.__cvZapAtivo) return;
            const msg = ev.detail && ev.detail.message;
            if (!msg) return;
            if (cvvPanel && !cvvPanel.classList.contains('cvv-hidden')) cvvSay(msg);
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cvvBoot);
    else cvvBoot();

    /* roda um comando SEM falar (voz desligada) e devolve as respostas do bot —
       é o que o Centavus Zap usa como "chat" */
    function cvvAskCapture(text) {
        const out = [];
        const prevHook = cvvCaptureHook;
        const prevMute = cvvMute;
        cvvMute = true;
        cvvCaptureHook = (who, t) => { if (who === 'bot') out.push(t); };
        try { cvvRun(text); } finally { cvvCaptureHook = prevHook; cvvMute = prevMute; }
        return out;
    }

    /* expõe o que a UI externa pode precisar */
    window.cvVoice = { open: cvvShow, hide: cvvHide, run: cvvRun, speak: cvvSpeak, ask: cvvAskCapture };

})();
