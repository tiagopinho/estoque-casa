# Estoque Casa PWA

Aplicação web estática para controle doméstico de alimentos, validade por unidade, histórico, lista de compras automática, notificações, backup e sincronização com `database.json` via GitHub REST API.

## Arquivos

- `index.html`: estrutura da aplicação.
- `styles.css`: interface responsiva inspirada em apps iPhone, com modo claro e escuro.
- `app.js`: regras de estoque, GitHub API, PWA, notificações, busca, filtros, importação e exportação.
- `sw.js`: Service Worker para funcionamento offline.
- `manifest.json`: instalação como PWA.
- `database.json`: banco inicial.
- `icons/`: ícones do app.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub, por exemplo `estoque-casa`.
2. Envie todos os arquivos deste projeto para a raiz do repositório.
3. Abra o repositório no GitHub.
4. Vá em `Settings` > `Pages`.
5. Em `Build and deployment`, selecione `Deploy from a branch`.
6. Escolha a branch `main` e pasta `/root`.
7. Salve e aguarde o link do GitHub Pages.

## Gerar Personal Access Token

1. No GitHub, clique na sua foto > `Settings`.
2. Acesse `Developer settings` > `Personal access tokens`.
3. Prefira `Fine-grained tokens`.
4. Selecione somente o repositório onde o app será hospedado.
5. Permita acesso de leitura e escrita em `Contents`.
6. Gere o token e copie.

Importante: o token fica salvo no navegador onde você configurou o app. Por segurança, use um token exclusivo para este app e com acesso apenas ao repositório necessário.

## Primeira configuração

Ao abrir o app pela primeira vez, informe:

- GitHub Personal Access Token
- Usuário GitHub
- Nome do repositório
- Branch, normalmente `main`

Depois clique em `Salvar e sincronizar`. Se o arquivo `database.json` ainda não existir, o sistema cria automaticamente.

## Uso diário

- Cadastre produtos em `Produtos`.
- Informe uma validade por linha para controlar cada unidade separadamente.
- Ao consumir, o sistema baixa automaticamente a unidade com vencimento mais próximo.
- Quando um produto chega a zero, ele entra na lista de compras.
- O Dashboard mostra total, próximos vencimentos, vencidos, em falta e consumidos no mês.
- Use exportar, importar, backup e restaurar para segurança extra.

## Observações técnicas

- Não há backend. Tudo roda no navegador.
- A sincronização usa diretamente a GitHub REST API.
- Em modo offline, alterações ficam salvas localmente e são sincronizadas quando a conexão voltar.
- A leitura de código de barras depende da API `BarcodeDetector`, que não existe em todos os navegadores. Quando não estiver disponível, cadastre o código manualmente.
- A busca por nome via código de barras consulta Open Food Facts quando possível.
