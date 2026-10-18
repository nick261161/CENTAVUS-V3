# 🤖 Centavus Server — site + contas na nuvem + bot de WhatsApp

Um único serviço (Node 18+, **zero dependências npm**) que faz **tudo**:

1. **Hospeda o site Centavus** — o endereço do servidor vira o endereço do produto;
2. **Guarda os dados na nuvem** — login, sync entre aparelhos, recuperação de senha;
3. **Roda o bot Centavus Zap** — o cliente manda mensagem no WhatsApp e o
   lançamento cai **dentro da conta dele, no painel, na hora**.

```
Cliente (WhatsApp): gastei 45,90 no almoço
Bot:                💸 Gasto registrado!
                    Almoço — R$ 45,90
                    📅 17/10
                    ✅ Já aparece no seu painel Centavus.

Cliente (site):     …e o lançamento aparece no dashboard sem F5 em nenhum aparelho.
```

**Requisitos:** Node 18+, um número de WhatsApp e uma conta gratuita no
Meta for Developers.

**Arquivos desta pasta:**

| Arquivo | O que faz |
|---|---|
| `server.js` | entrada: servidor HTTP, site estático, API e webhook |
| `api.js` | contas, sessão, dados financeiros, código de vínculo do Zap |
| `bot.js` | comandos do WhatsApp (português) e envio de respostas |
| `store.js` | persistência em `data/centavus_db.json` (contas + estados) |
| `README.md` | este guia |

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

## Passo 3 — Subir

```bash
cd bot-whatsapp
node server.js
```

- Se existir `index.html` **na pasta acima** (o pacote completo do Centavus),
  ele serve **o site inteiro** + a API + o bot nesse mesmo endereço.
- Se não, serve só a API + o bot (o site continua funcionando em qualquer
  hospedagem estática — ele detecta `/api/health` e escolhe o modo sozinho).

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

### Já está no ar no Render? (atualização)

Se o seu serviço já roda este bot, a atualização é só **subir os arquivos
novos** (`server.js`, `api.js`, `bot.js`, `store.js`, `README.md`):

- **Repositório Git ligado ao Render:** `git add . && git commit -m "server" && git push`.
- **Deploy manual:** suba a pasta inteira de novo (mesmo Root Directory e
  Start Command `node server.js` — nada muda).

Depois do deploy, `GET /status` mostra `contas` e `vinculados` — e o
endereço do Render passa a servir o **site** também (se o repositório tiver o
pacote completo). É só abrir `https://SEU-SERVIDOR/` e criar a conta.

## Passo 4 — Deixar acessível na internet

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
  pm2 start server.js --name centavus
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

## Passo 6 — Vincular o número do cliente (1 vez por número)

Sem vínculo o bot funciona em **modo demonstração** (guarda por número, isolado).
Com vínculo, os comandos entram **na conta do site**:

1. Abra o site pelo endereço do servidor e entre na conta.
2. Seção **Centavus Zap → “Vincular meu número”** (ou diga **“vincular meu
   número no zap”** para a voz) — aparece um código `CVZ-XXXXXX` (vale 20 min).
3. Mande pro bot: `vincular CVZ-XXXXXX`.

Pronto. Se o cliente já tinha lançamentos de demonstração, eles são
**levados para a conta** junto no mesmo passo. Para desfazer: `desvincular`.

## Passo 7 — Testar

Mande pro bot: `ajuda`, depois `gastei 40 no almoço`, depois `resumo` — e
olhe o dashboard do site: o lançamento está lá.

---

## Comandos entendidos pelo bot

| Você digita | Ele faz |
|---|---|
| `gastei 45,90 no almoço` | registra gasto + mostra o total do mês |
| `paguei 30 de uber` | idem |
| `recebi 3000 de salário` | registra receita |
| `3 mil de freela entrou` | registra receita |
| `1.200,55 na farmácia` | registra gasto (aceita `1.200,55`, `2 mil`, `R$ 30`) |
| `resumo` | gastos, receitas e saldo do mês atual |
| `resumo do mês passado` | idem do mês anterior |
| `quanto gastei este mês` | resumo |
| `vincular CVZ-XXXXXX` | liga o número à conta do site |
| `desvincular` | solta o número da conta |
| `limpar` → `limpar sim` | apaga o histórico |
| `ajuda` | lista os comandos |

**Onde ficam os dados:** com vínculo, em `data/centavus_db.json` (conta + estados,
mesmos formatos que o site usa — id, iso, month, date, amount…). Sem vínculo,
`data/<numero>.json`. Tudo **no seu servidor**, sem vazar para ninguém.

## Segurança e contas

- **Senhas:** `scrypt` com salt (mesmo método dos servidores grandes) + cookie
  de sessão `HttpOnly`. Limite de 30 tentativas de login por minuto por IP.
- **Assinatura do webhook:** exporte `APP_SECRET` (do app Meta) para o bot
  validar a assinatura `X-Hub-Signature-256` de toda mensagem recebida.
- **Rate limit do bot:** 20 mensagens por minuto por número.
- **Recuperação de senha:** `POST /api/auth/forgot` devolve um `devLink`
  (neste servidor não há envio de e-mail — o link aparece na própria tela).
- Nunca deixe tokens no código: sempre por variável de ambiente.

## Rotas do servidor

| Rota | Uso |
|---|---|
| `GET /` | o site Centavus (se `index.html` estiver na raiz do repo) |
| `GET /api/health` | o site detecta que existe servidor (sai do modo local) |
| `POST /api/auth/register` `login` `logout` `password` `forgot` `reset` | contas |
| `GET /api/auth/me` | sessão atual (cookie `cv_sessao`) |
| `GET/PUT /api/me/state` | sync dos dados financeiros |
| `PUT /api/me/profile` | avatar e preferências |
| `GET/POST /api/me/zap` | status do vínculo / gerar código `CVZ-` |
| `POST /webhook` · `GET /webhook` | WhatsApp Cloud API |
| `GET /status` | saúde: contas, vinculados, memória conectada à Meta |

## ⚠️ Aviso de dados no Render (plano grátis)

O plano **grátis do Render tem disco efêmero**: o arquivo
`data/centavus_db.json` (contas, senhas, lançamentos, vínculos) **pode ser
apagado** a cada novo deploy, reinício ou hibernação do serviço. Para testes
não tem problema — mas com **clientes reais**, escolha uma das opções:

1. **Render com disco persistente** (pago, ~US$7/mês + disco) — é só ligar o
   volume na configuração do serviço apontando para `./data`.
2. **Banco de dados externo** (Supabase/Postgres ou Upstash — grátis) — o jeito
   profissional; pede um ajuste pequeno no `store.js`.
3. **Backup periódico:** `GET /status` mostra os totais; baixar `data/`
   de vez em quando também funciona no começo.

Enquanto isso não for resolvido, trate o `data/` como **modo demonstração**.

## Perguntas frequentes

**"Os lançamentos do bot aparecem no site Centavus?"**
Sim — **é o mesmo dado**. Com o número vinculado, o bot grava no
`/api/me/state` da conta; ao abrir (ou recarregar) o site, o painel mostra o
lançamento. Entre aparelhos também: login em outro celular e os dados estão lá.

**"Funciona no WhatsApp Web/Business?"**
Funciona em qualquer WhatsApp (pessoal, Business ou o número que você migrar
para o app), desde que ele esteja conectado ao app Meta.

**"Custa alguma coisa?"**
O app Meta e a Cloud API têm **camada grátis** (1.000 conversas de serviço por
mês). Depois disso a Meta cobra por conversa — cheque a tabela atual deles.

**"Quero trocar as respostas."**
Estão em `bot.js`: as mensagens em português estão nas funções `processar()` e
na constante `AJUDA`.
