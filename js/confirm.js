/* ==========================================================================
   CENTAVUS — confirmação em modal próprio (substitui confirm() do navegador)
   Uso:  await cvConfirm({ titulo, mensagem, okLabel, danger })
   ========================================================================== */
'use strict';

function cvConfirm(options) {
    const o = Object.assign({
        titulo: 'Você tem certeza?',
        mensagem: '',
        okLabel: 'Confirmar',
        cancelLabel: 'Cancelar',
        danger: true,
        icon: 'fa-triangle-exclamation'
    }, options || {});

    return new Promise((resolve) => {
        let overlay = document.getElementById('cvConfirmModal');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'cvConfirmModal';
            overlay.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[10070] hidden items-center justify-center p-4';
            overlay.innerHTML = `
                <div class="centavus-card p-6 w-full max-w-sm border border-white/10 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="cvConfirmTitle">
                    <div class="flex items-start gap-3.5">
                        <div id="cvConfirmIconWrap" class="w-11 h-11 rounded-2xl shrink-0 flex items-center justify-center text-lg">
                            <i id="cvConfirmIcon" class="fa-solid"></i>
                        </div>
                        <div class="min-w-0">
                            <h3 id="cvConfirmTitle" class="text-base font-extrabold text-white leading-snug"></h3>
                            <p id="cvConfirmMsg" class="text-xs text-[#A8B5B2] mt-1.5 leading-relaxed"></p>
                        </div>
                    </div>
                    <div class="flex gap-2.5 mt-6">
                        <button type="button" id="cvConfirmCancel" class="flex-1 py-2.5 rounded-xl bg-[#102020] hover:bg-[#204040] border border-white/5 text-xs font-bold text-[#A8B5B2] transition"></button>
                        <button type="button" id="cvConfirmOk" class="flex-1 py-2.5 rounded-xl text-xs font-extrabold text-white transition"></button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
        }

        const okBtn = overlay.querySelector('#cvConfirmOk');
        const cancelBtn = overlay.querySelector('#cvConfirmCancel');
        const iconWrap = overlay.querySelector('#cvConfirmIconWrap');

        overlay.querySelector('#cvConfirmTitle').textContent = o.titulo;
        overlay.querySelector('#cvConfirmMsg').textContent = o.mensagem;
        overlay.querySelector('#cvConfirmIcon').className = 'fa-solid ' + o.icon;
        okBtn.textContent = o.okLabel;
        cancelBtn.textContent = o.cancelLabel;
        okBtn.className = 'flex-1 py-2.5 rounded-xl text-xs font-extrabold text-white transition ' +
            (o.danger ? 'bg-[#ff5064] hover:bg-[#ff7080]' : 'bg-[#30A080] hover:bg-[#40C8A0]');
        iconWrap.className = 'w-11 h-11 rounded-2xl shrink-0 flex items-center justify-center text-lg ' +
            (o.danger ? 'bg-[#ff5064]/15 text-[#ff8d9a]' : 'bg-[#30A080]/15 text-[#70E0C0]');

        overlay.classList.remove('hidden');
        overlay.classList.add('flex');

        let done = false;
        const prevFocus = document.activeElement;
        const finish = (value) => {
            if (done) return;
            done = true;
            document.removeEventListener('keydown', onKey, true);
            overlay.classList.add('hidden');
            overlay.classList.remove('flex');
            if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) {}
            resolve(value);
        };
        const onKey = (ev) => {
            if (ev.key === 'Escape') { ev.stopPropagation(); finish(false); }
            if (ev.key === 'Tab') { ev.preventDefault(); (document.activeElement === okBtn ? cancelBtn : okBtn).focus(); }
        };

        okBtn.onclick = () => finish(true);
        cancelBtn.onclick = () => finish(false);
        overlay.onclick = (ev) => { if (ev.target === overlay) finish(false); };
        document.addEventListener('keydown', onKey, true);
        setTimeout(() => okBtn.focus(), 30);
    });
}
