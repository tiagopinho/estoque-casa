# Estoque Casa

PWA doméstica para controlar produtos, quantidades e validades. A versão 2 usa uma API privada na Vercel e PostgreSQL no Neon. Alterações feitas sem internet ficam em uma fila no aparelho e são enviadas automaticamente quando a conexão retorna.

## O que mudou

- O token do GitHub e a gravação em `database.json` não são mais usados.
- A senha é validada no servidor e a sessão usa cookie `HttpOnly` assinado.
- Produtos, histórico, compras e operações processadas ficam em tabelas no Neon.
- Cada alteração possui um identificador único; reenvios não duplicam consumo ou entradas.
- Quantidade é o total disponível. Validades identificam unidades/lotes dentro desse total.
- Backup, importação, datas locais, câmera e campos exibidos em HTML foram corrigidos.

O arquivo `database.json` permanece somente como exemplo/migração. Ele não é acessado pela aplicação em produção.

## Criar os projetos sem afetar os existentes

### 1. Neon

1. No painel Neon, escolha **New project**.
2. Dê um nome como `estoque-casa`.
3. Copie a connection string do novo projeto. Ela começa com `postgresql://`.

Não reutilize a connection string do outro projeto. As tabelas desta aplicação são criadas automaticamente no primeiro acesso.

### 2. GitHub

Crie um repositório novo para esta versão ou envie estes arquivos ao repositório do Estoque Casa. Não envie `.env` ou `.env.local`.

### 3. Vercel

1. No painel da Vercel, clique em **Add New > Project** e importe o repositório.
2. Não é necessário escolher framework ou comando de build.
3. Em **Environment Variables**, cadastre:

   - `DATABASE_URL`: connection string do novo projeto Neon.
   - `APP_PASSWORD`: senha que será usada na tela de entrada.
   - `SESSION_SECRET`: texto aleatório longo, diferente da senha.
   - `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`: chaves das notificações Web Push.
   - `CRON_SECRET`: outro texto aleatório longo, usado para proteger a tarefa diária.

4. Faça o deploy. Todas essas variáveis devem estar habilitadas para **Production**.

Para gerar `SESSION_SECRET` no PowerShell:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

Gere as chaves Web Push uma única vez, depois copie os dois valores para a Vercel:

```sh
npx web-push generate-vapid-keys
```

O mesmo comando de chave aleatória pode ser usado para criar `CRON_SECRET`.

## Migrar dados do arquivo antigo

1. Entre no aplicativo novo.
2. Clique em **Importar JSON**.
3. Selecione seu `database.json` ou um backup exportado pelo aplicativo antigo.
4. Confirme a substituição.

Faça uma exportação antes da migração. A importação substitui todo o conteúdo do banco novo, mas não toca em nenhum outro projeto Neon.

## Desenvolvimento local

Copie `.env.example` para `.env.local`, preencha as variáveis e execute:

```sh
npm install
npm run dev
```

O comando de desenvolvimento baixa a CLI atual da Vercel quando necessário; ela não fica incluída nas dependências de produção.

Validação de sintaxe:

```sh
npm run check
```

## Notificações

Depois do deploy, abra o aplicativo em cada aparelho e toque no sino para autorizar. Uma tarefa diária da Vercel verifica as validades às 09:00 no horário de Brasília e envia Web Push mesmo com a PWA fechada. No iPhone, instale a PWA pela opção **Adicionar à Tela de Início** antes de ativar notificações.
