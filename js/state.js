/* Extraído de index.html — scripts clássicos, carregados na ordem abaixo. */
        /* ==========================================================================
           CENTAVUS APPLICATION STATE
           ========================================================================== */
        
        let isPrivacyHidden = false;

        let transactions = []; // site zerado: o usuário cadastra as próprias movimentações

        let categoriesData = [
            { name: 'Alimentação', val: 0, color: '#8070F0', icon: 'fa-utensils' },
            { name: 'Roupas', val: 0, color: '#70E0C0', icon: 'fa-shirt' },
            { name: 'Transporte', val: 0, color: '#40C8A0', icon: 'fa-car' },
            { name: 'Lazer', val: 0, color: '#30A080', icon: 'fa-gamepad' },
            { name: 'Outros', val: 0, color: '#A8B5B2', icon: 'fa-box-archive' }
        ];

        const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
        // todos os meses do ano corrente: qualquer "Mês de Referência" escolhido na Nova Transação tem barra no gráfico
        const monthsLabels = MONTHS_SHORT.slice();
        let monthlyData = monthsLabels.map(() => 0);
        let monthlyOutData = monthsLabels.map(() => 0); // despesas/gastos por mês (colunas)
        let selectedMonthIndex = new Date().getMonth(); // mês atual
        let selectedCategoryFilter = null;

        let barChartInstance = null;
        let donutChartInstance = null;
        let expChartInstance = null;

        /* ==========================================================================
           LIFECYCLE HOOKS & CHARTS
           ========================================================================== */
