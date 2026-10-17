// Evita "flash" da tela do dashboard e da cor de destaque: aplica antes da pintura.
(function () {
            try {
                document.documentElement.setAttribute('data-theme', localStorage.getItem('centavus_theme') || 'emerald');
                var ls = document.getElementById('loginScreen');
                /* Toda abertura do site começa NA TELA DE LOGIN — não precisa sair da conta.
                   A sessão (nome, e-mail lembrado e foto) fica guardada nos bastidores; o acesso é pedido sempre. */
                ls.style.display = 'flex';
                ls.classList.remove('login-leaving');
                document.body.classList.add('no-scroll');
            } catch (e) { document.body.classList.add('no-scroll'); }
            // rede de segurança: o splash nunca pode travar a tela
            setTimeout(function () {
                var s = document.getElementById('cvSplash');
                if (s && !s.classList.contains('hide')) {
                    s.classList.add('hide');
                    setTimeout(function () { if (s && s.parentNode) s.parentNode.removeChild(s); }, 750);
                }
            }, 4000);
})();
