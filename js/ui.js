/* Extraído de index.html — scripts clássicos, carregados na ordem abaixo. */
        /* ==========================================================================
           MODAL INFORMATIVO (substitui alert)
           ========================================================================== */
        function showInfo(title, text, icon) {
            document.getElementById('infoModalTitle').textContent = title;
            document.getElementById('infoModalText').textContent = text;
            document.getElementById('infoModalIcon').className = 'fa-solid ' + (icon || 'fa-circle-info');
            document.getElementById('infoModal').classList.remove('hidden');
        }
        function closeInfo() { document.getElementById('infoModal').classList.add('hidden'); }

        /* ==========================================================================
           EXCLUSIVO 3.0 — TEMAS, SPLASH, REVELAR AO ROLAR E BACKUP
           ========================================================================== */
        const THEMES = { emerald: 'Esmeralda', violet: 'Violeta', sunset: 'Pôr do sol', ocean: 'Oceano' };

        /* Encerra na hora as transições de cor — evita "cor presa" com "reduzir movimento" */
        function finishColorTransitions() {
            try {
                const props = ['all', 'background-color', 'color', 'border-color', 'fill', 'stroke'];
                document.getAnimations().forEach(a => {
                    if (a.transitionProperty && props.indexOf(a.transitionProperty) > -1) { try { a.finish(); } catch (e) {} }
                });
            } catch (e) {}
        }

        function applyTheme(name) {
            if (!THEMES[name]) name = 'emerald';
            document.documentElement.setAttribute('data-theme', name);
            document.querySelectorAll('#themeSwatches .cv-swatch').forEach(b => b.classList.toggle('active', b.dataset.theme === name));
            const label = document.getElementById('themeName');
            if (label) label.textContent = THEMES[name];
            // conclui instantaneamente as transições de cor (evita travamento em telas com "reduzir movimento")
            finishColorTransitions();
        }

        function initTheme() {
            let saved = 'emerald';
            try { saved = localStorage.getItem('centavus_theme') || 'emerald'; } catch (e) {}
            applyTheme(saved);
        }

        function setTheme(name) {
            if (!THEMES[name]) name = 'emerald';
            try { localStorage.setItem('centavus_theme', name); } catch (e) {}
            applyTheme(name);
            toast('Cor de destaque: ' + THEMES[name] + '.');
        }

        /* ---------- MODO CLARO / ESCURO ---------- */
        const MODES = { dark: 'Escuro', light: 'Claro' };

        function isLightMode() {
            return document.documentElement.getAttribute('data-mode') === 'light';
        }

        function applyModeUI() {
            const light = isLightMode();
            const ic = document.getElementById('modeIcon');
            if (ic) ic.className = 'fa-solid ' + (light ? 'fa-moon' : 'fa-sun');
            const tb = document.getElementById('modeToggleBtn');
            if (tb) tb.title = light ? 'Ativar o modo escuro' : 'Ativar o modo claro';
            const label = document.getElementById('modeName');
            if (label) label.textContent = MODES[light ? 'light' : 'dark'];
            const d = document.getElementById('modeDarkBtn');
            const l = document.getElementById('modeLightBtn');
            if (d) d.classList.toggle('active', !light);
            if (l) l.classList.toggle('active', light);
        }

        function initMode() {
            let saved = 'dark';
            try { saved = localStorage.getItem('centavus_mode') || 'dark'; } catch (e) {}
            document.documentElement.setAttribute('data-mode', saved === 'light' ? 'light' : 'dark');
            applyModeUI();
        }

        function setMode(mode) {
            const m = mode === 'light' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-mode', m);
            try { localStorage.setItem('centavus_mode', m); } catch (e) {}
            applyModeUI();
            applyChartTheme();
            refreshExpChartColors();
            finishColorTransitions();   // cor troca na hora, sem ficar "presa"
            if (typeof toast === 'function') toast(m === 'light' ? 'Modo claro ativado.' : 'Modo escuro ativado.');
        }

        function toggleMode() { setMode(isLightMode() ? 'dark' : 'light'); }

        function hideSplash() {
            const s = document.getElementById('cvSplash');
            if (!s || s.classList.contains('hide')) return;
            s.classList.add('hide');
            setTimeout(() => { if (s && s.parentNode) s.parentNode.removeChild(s); }, 750);
        }

        function initReveal() {
            if (!('IntersectionObserver' in window)) return;
            /* inclui também os elementos que já vêm com cv-reveal no HTML e que
               NÃO são .centavus-card (ex.: #secCofrinho) — sem isso eles nunca
               recebiam .cv-in e ficavam invisíveis (opacity:0) para sempre */
            const els = Array.from(document.querySelectorAll('main .centavus-card, main .stat-mini, main .cv-reveal'));
            if (!els.length) return;
            els.forEach((el, i) => {
                el.classList.add('cv-reveal');
                el.style.transitionDelay = Math.min((i % 5) * 70, 280) + 'ms';
            });
            const io = new IntersectionObserver(entries => {
                entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('cv-in'); io.unobserve(en.target); } });
            }, { rootMargin: '0px 0px -6% 0px', threshold: 0.05 });
            els.forEach(el => io.observe(el));
            setTimeout(() => els.forEach(el => { if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('cv-in'); }), 90);
        }

        function exportBackup() {
            const data = {
                app: 'Centavus', version: 3, exportedAt: new Date().toISOString(),
                theme: document.documentElement.getAttribute('data-theme') || 'emerald',
                avatar: localStorage.getItem('centavus_avatar') || null,
                transactions: transactions, budgets: budgets, goals: goals, goalSeq: goalSeq,
                cards: cards, cardSeq: cardSeq, cofrinho: cofrinho, rendaFixa: rendaFixa
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'centavus-backup-' + new Date().toISOString().slice(0, 10) + '.json';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1500);
            toast('Backup baixado com sucesso.');
        }

        function importBackup(event) {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async function () {
                try {
                    const data = JSON.parse(reader.result);
                    if (!data || !Array.isArray(data.transactions)) throw new Error('formato inválido');
                    const ok = await cvConfirm({ titulo: 'Restaurar este backup?', mensagem: 'Os dados atuais da sua conta serão substituídos pelos do arquivo selecionado.', okLabel: 'Restaurar backup', danger: false, icon: 'fa-file-import' });
                    if (!ok) { event.target.value = ''; return; }
                    transactions = data.transactions;
                    if (Array.isArray(data.budgets)) budgets = data.budgets;
                    if (Array.isArray(data.goals)) goals = data.goals;
                    if (data.goalSeq) goalSeq = data.goalSeq;
                    if (Array.isArray(data.cards)) cards = data.cards;
                    if (data.cardSeq) cardSeq = data.cardSeq;
                    if (data.cofrinho && typeof data.cofrinho === 'object') { cofrinho = Object.assign(cofrinho, data.cofrinho); if (!Array.isArray(cofrinho.hist)) cofrinho.hist = []; }
                    if (data.rendaFixa && Array.isArray(data.rendaFixa.itens)) { rendaFixa = data.rendaFixa; if (!Number(rendaFixa.seq)) rendaFixa.seq = 1; }
                    persist();
                    applyTheme(data.theme || 'emerald');
                    try { localStorage.setItem('centavus_theme', data.theme || 'emerald'); } catch (e) {}
                    if (typeof data.avatar === 'string' && data.avatar) { try { localStorage.setItem('centavus_avatar', data.avatar); } catch (e) {} }
                    else if ('avatar' in data) { try { localStorage.removeItem('centavus_avatar'); } catch (e) {} }
                    applyAvatar();
                    if (document.getElementById('calGrid')) renderCalendar();
                    renderCards(); renderCofrinho(); rfRenderList();
                    applyFilters(); updateSummaryCards(); updateV2(); renderGoals(); buildNotifs();
                    toast('Backup restaurado.');
                } catch (e) {
                    toast('Arquivo de backup inválido.', 'error');
                } finally {
                    event.target.value = '';
                }
            };
            reader.readAsText(file);
        }
