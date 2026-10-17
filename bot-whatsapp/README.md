# 🤖 Centavus Zap — bot de WhatsApp (passo a passo)

Este bot faz o seu número de WhatsApp responder comandos de finanças na hora:

```
Cliente: gastei 45,90 no almoço
Bot:     💸 Gasto registrado!
         Almoço — R$ 45,90
         📅 17/10
         📊 Você já gastou R$ 312,40 em outubro (7 lançamentos)

Cliente: resumo
Bot:     📊 Resumo de outubro/2026 ...
```

**Requisitos:** Node 18+ (grátis), um número de WhatsApp e uma conta gratuita no
Meta for Developers. **Não tem nenhuma dependência npm** — é só 1 arquivo.

---

## Passo 1 — Criar o app no Meta (5 minutos, grátis)

1. Entre em <https://developers.facebook.com> com a sua conta Facebook.
2. **Meus apps → Criar app → Empresa → Avançar**. Nome sugerido: `Centavus Zap`.
3. No painel do app, clique em **Adicionar produto → WhatsApp → Configurar**.
4. Ele cria um **número de teste** (55 + um número da Meta, vale por 24h).
   Para usar o **seu número de verdade**: em *WhatsApp → Configurações da API →
   número de telefone*, clique em **Adicionar número** e siga a migração
   (ele envia um código pelo WhatsApp e troca o número para o app — leva ~5 min).

> 💡 Dica: durante os testes, use o número de teste da Meta e adicione
> **2 números de teste** em *WhatsApp → API Setup → Adicionar número de teste*
> (os números dos seus clientes que vão conversar com o bot).

## Passo 2 — Pegar os dois dados que o bot precisa

No painel, em **WhatsApp → API Setup**, copie:

| O que é | Onde aparece | Variável |
|---|---|---|
| Token de acesso permanente | botão **Gerar token de acesso** (escolha *Temporário* e depois **Gerar**; para permanente, crie um System User em Business Settings) | `META_TOKEN` |
| ID do número | logo abaixo de "Número de WhatsApp" | `PHONE_NUMBER_ID` |

## Passo 3 — Subir o bot

```bash
cd bot-whatsapp
node server.js
```

Sem token ele sobe mesmo assim (modo teste: mostra as respostas no console).

Para conectar à Meta, exporte as variáveis antes de rodar:

**Windows (PowerShell):**
```powershell
$env:VERIFY_TOKEN="um-segredo-qualquer"
$env:META_TOKEN="EAAG..."
$env:PHONE_NUMBER_ID="123456789"
node server.js
```

**Linux/Mac:**
```bash
export VERIFY_TOKEN="um-segredo-qualquer"
export META_TOKEN="EAAG..."
export PHONE_NUMBER_ID="123456789"
node server.js
```

**Node 20.6+ (mais fácil):** copie `.env.exemplo` para `.env`, preencha e rode:
```bash
node --env-file=.env server.js
```

## Passo 4 — Deixar o bot acessível na internet

A Meta precisa alcançar `http://SEU-SERVIDOR/webhook`. Duas opções:

### A) Testando agora mesmo (grátis, temporário)
```bash
npx ngrok http 3000
```
Ele mostra algo como `https://abc123.ngrok-free.app` — use esse endereço.

### B) Produção (sempre no ar)
- **Render / Railway / Fly.io (camada grátis):** "New Web Service" → aponte para
  esta pasta → Start command `node server.js` → coloque as variáveis em *Env*.
- **VPS (Hostinger, Contabo, DigitalOcean ~R$30/mês):**
  ```bash
  npm i -g pm2
  pm2 start server.js --name centavus-zap
  pm2 save && pm2 startup
  ```

## Passo 5 — Ligar o webhook na Meta

Em **WhatsApp → Configurações da API → Webhook → Configurar** (ou em
*Configuration → Webhook*):

- **URL de retorno (callback):** `https://SEU-SERVIDOR/webhook`
- **Token de verificação:** o mesmo do `VERIFY_TOKEN`
- Marque o evento **messages** → Salvar.

A Meta manda um teste na hora — se os dados estiverem certos, ela confirma e o
bot já responde.

## Passo 6 — Testar

Mande pro bot (pelo seu número ou o de teste): `ajuda`, depois
`gastei 40 no almoço`, depois `resumo`.

---

## Comandos entendidos pelo bot

| Você digita | Ele faz |
|---|---|
| `gastei 45,90 no almoço` | registra gasto + mostra o total do mês |
| `paguei 30 de uber` | idem |
| `recebi 3000 de salário` | registra receita |
| `3 mil de freela entrou` | registra receita |
| `resumo` | gastos, receitas e saldo do mês atual |
| `resumo do mês passado` | idem do mês anterior |
| `quanto gastei este mês` | resumo |
| `limpar` → `limpar sim` | apaga o histórico daquele número |
| `ajuda` | lista os comandos |

Cada cliente tem o arquivo dele em `data/<numero>.json` (os dados ficam **no seu
servidor**, sem vazar para ninguém).

## Segurança e limites

- **Assinatura do webhook:** exporte `APP_SECRET` (do app Meta) para o bot
  validar a assinatura `X-Hub-Signature-256` de toda mensagem recebida.
- **Rate limit:** máximo de 20 mensagens por minuto por número (além disso ele
  fica quieto 1 minuto).
- Não deixe o token no código: sempre por variável de ambiente.

## Perguntas frequentes

**"Os lançamentos do bot aparecem no site Centavus?"**
Ainda não — o bot guarda por número no servidor e o site guarda no navegador.
A próxima etapa é o site passar a usar o servidor (`/api/me/state` já existe no
código) para os dois falarem do mesmo lugar. Deixei anotado no roadmap.

**"Funciona no WhatsApp Web/Business?"**
Funciona em qualquer WhatsApp (pessoal, Business ou o número que você migrar
para o app), desde que ele esteja conectado ao app Meta.

**"Custa alguma coisa?"**
O app Meta e a Cloud API têm **camada grátis** (1.000 conversas de serviço por
mês). Depois disso a Meta cobra por conversa — cheque a tabela atual deles.

**"Quero trocar as respostas."**
Tudo está em `server.js`: as mensagens em português estão direto nas funções
`processar()` e na constante `AJUDA`.
