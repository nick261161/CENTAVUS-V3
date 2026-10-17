// Aplica cor de destaque e MODO (escuro/claro) antes da primeira pintura — sem "flash".
        try {
            document.documentElement.setAttribute('data-theme', localStorage.getItem('centavus_theme') || 'emerald');
            document.documentElement.setAttribute('data-mode', localStorage.getItem('centavus_mode') || 'dark');
        } catch (e) {}
