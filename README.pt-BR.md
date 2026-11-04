# ux-validate

[English](README.md) · **Português**

Testes de **conteúdo**, **navegação**, **interface** e **acessibilidade** de aplicações web, feitos do ponto de vista de **personas**, geradas por IA ou não, e executados pelo agente de IA que você já usa.

Em vez de só dizer "o contraste está abaixo de 4,5:1", o ux-validate responde: *a Dona Maria, de 68 anos, no celular, consegue descobrir quanto custa o seu produto?* E se não consegue, mostra onde ela travou, por quê e em qual arquivo corrigir.

![Relatório do ux-validate com notas por persona e objetivos cumpridos](docs/relatorio-exemplo.png)

> **Status:** versão inicial (0.1). Funciona com **Claude Code**, **Cursor**, **Codex CLI** e **Gemini CLI**.

## Como funciona

```
/persona-test
   │
   ├─ 1. Checagens fixas  (npx ux-validate check)
   │     axe-core, WAI-ARIA e teclado, links quebrados, erros de console,
   │     rolagem horizontal, ortografia, textos provisórios (lorem ipsum, NaN)…
   │     → mesmo resultado com qualquer modelo de linguagem
   │
   ├─ 2. Navegação como cada persona  (agente + Playwright MCP)
   │     tenta cumprir os objetivos dela, com as limitações dela,
   │     e avalia conteúdo, navegação, interface e acessibilidade
   │     pelo olhar dela; testa os widgets pelo teclado (padrões do APG)
   │     e revisa ortografia e gramática
   │
   ├─ 3. Aponta o arquivo provável de cada problema no seu código
   │
   └─ 4. Relatório  (npx ux-validate report)
         notas por persona, objetivos cumpridos, problemas com evidência
         e sugestão de correção → report.md + report.html

/persona-fix  ou  npx ux-validate fix
   └─ aplica as correções no código, mostrando cada mudança antes de gravar
```

O ux-validate roda **dentro da sua ferramenta de IA**: o modelo usado é o que ela estiver usando.

## Ferramentas de IA suportadas

O setup instala os mesmos comandos (`persona-test`, `persona-report`, `persona-fix`, `persona-new`) no formato de cada ferramenta, além do servidor MCP do Playwright, que o agente usa como navegador. Dá para escolher várias ferramentas de uma vez.

| Ferramenta | Comandos instalados em | Como chamar | Navegador (MCP) registrado em |
|---|---|---|---|
| **Claude Code** | `.claude/skills/<nome>/SKILL.md` | `/persona-test` | `.mcp.json` |
| **Cursor** | `.cursor/commands/<nome>.md` | `/persona-test` no chat do agente | `.cursor/mcp.json` |
| **Codex CLI** | `.agents/skills/<nome>/SKILL.md` (com `agents/openai.yaml`) | `$persona-test` | `.codex/config.toml` |
| **Gemini CLI** | `.gemini/commands/<nome>.toml` | `/persona-test` | `.gemini/settings.json` |

Observações:

- Os comandos só rodam quando você os chama: os testes abrem navegador e gastam tokens. No Claude Code isso é o `disable-model-invocation`; no Codex, `allow_implicit_invocation: false`.
- O Codex lê o `.codex/config.toml` e o Gemini lê o `.gemini/settings.json` só em pastas **confiáveis**; aceite a pergunta na primeira vez que abrir o projeto.
- Arquivos de configuração existentes são preservados: o setup só adiciona o servidor `playwright` se ele não estiver lá.
- O Gemini CLI também lê `.agents/skills/`. Se você instalar Codex e Gemini juntos, o Gemini pode listar as skills do Codex; use os comandos `/persona-…`, e o Gemini pede confirmação antes de ativar qualquer skill.
- Os argumentos vão depois do nome do comando em todas as ferramentas, ex.: `/persona-test dona-maria` ou `$persona-test dona-maria`.

## Idiomas

O ux-validate fala **português** e **inglês**: mensagens do terminal, setup, relatório, achados das checagens e instruções do agente.

- O setup detecta o idioma do sistema e pergunta qual usar. A escolha fica em `locale` no `ux-validate.config.yml`.
- Para trocar só num comando: `npx ux-validate check --lang en`.
- O **idioma da ferramenta** (`locale`) é separado do **idioma do conteúdo** da aplicação (`language`), usado pela ortografia. Dá para usar a ferramenta em português testando um site em inglês, e vice-versa.

## Acessibilidade e WAI-ARIA

A categoria **Acessibilidade** combina três camadas:

| Camada | O que verifica |
|---|---|
| **axe-core** | Sintaxe do ARIA (papéis, atributos e valores válidos), nomes acessíveis, contraste, textos alternativos e demais regras WCAG 2.2 AA |
| **Checagens ARIA de comportamento** | Percorre cada página com `Tab` e encontra: armadilha de teclado, foco invisível, foco em elemento escondido, widgets com `role` que não recebem foco, elementos clicáveis sem acesso pelo teclado (`<div onclick>`), `aria-expanded` que não muda ao abrir e fechar, campos identificados só pelo placeholder |
| **Agente** | Testa cada widget pelo teclado seguindo o [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/) (diálogos, abas, acordeões, menus, combobox…), verifica se mensagens dinâmicas são anunciadas (`role="status"`/`alert`) e navega como uma pessoa que usa leitor de tela |

Cada execução salva também a **árvore de acessibilidade** de cada página em `.ux-validate/runs/<data-hora>/aria/`: papéis, nomes e estados, ou seja, o que um leitor de tela anuncia. O relatório liga cada problema de acessibilidade à árvore da página.

## Verificação ortográfica

A ortografia é verificada **offline**, com o Hunspell e os dicionários do LibreOffice (em português, o VERO). Nenhum texto sai da sua máquina. Idiomas: português do Brasil, inglês e espanhol (`language` no `ux-validate.config.yml`).

- Aponta palavras desconhecidas com sugestões de correção (`excessão` → `exceção`) e palavras em inglês no meio de um texto em português.
- Ignora nomes próprios, marcas (`WhatsApp`), siglas, URLs, e-mails e variáveis de template.
- Palavras corretas que o dicionário não conhece (nome da empresa, termos técnicos) vão em `.ux-validate/dicionario.txt` (ou `dictionary.txt`, se a ferramenta estiver em inglês; os dois são lidos), uma por linha, ou em `spelling.ignore` na configuração.
- No `/persona-test`, o agente revisa esses achados, descarta os falsos positivos e revisa a **gramática** (concordância, crase, "mas" × "mais"…), que o dicionário não pega.

## Aplicando as correções

Depois do relatório, o ux-validate pode corrigir o código para você, de dois jeitos:

| | `/persona-fix` (no Claude Code) | `npx ux-validate fix` (no terminal) |
|---|---|---|
| **Modelo** | O que o Claude Code estiver usando | O provedor e o modelo escolhidos no setup: Anthropic, OpenAI, Google ou Ollama (local) |
| **Custo** | Consumo da sua conta no Claude Code | Tokens cobrados na **sua** conta do provedor, com a **sua** API key |
| **Como funciona** | O agente corrige um problema de cada vez e roda as checagens de novo para confirmar | Envia cada arquivo com os problemas dele ao modelo, recebe as trocas de texto propostas e mostra o diff antes de gravar |

Os dois corrigem só o que está no relatório, preferem HTML semântico a ARIA e **nunca inventam dados** (telefone, preço, depoimento): quando falta informação, avisam o que é preciso.

```bash
npx ux-validate fix                       # problemas críticos, altos e médios da última execução
npx ux-validate fix --ids A001,C003       # só esses problemas
npx ux-validate fix --severity high       # só críticos e altos
npx ux-validate fix --dry-run             # mostra as correções sem gravar
```

Antes de chamar o modelo, o `fix` mostra quais arquivos vai enviar e uma estimativa de tokens, e pede confirmação. Cada troca proposta precisa bater exatamente com um trecho único do arquivo; as que não batem são descartadas. Os arquivos originais ficam salvos em `.ux-validate/runs/<data-hora>/fixes/backup/`, e o resultado de cada problema (com os tokens usados) em `fixes/fixes.json`.

> **Privacidade:** no `fix` pelo terminal, o conteúdo dos arquivos corrigidos é enviado ao provedor escolhido. Com o Ollama, tudo roda na sua máquina.

A API key nunca fica no `ux-validate.config.yml`, que guarda só o nome da variável de ambiente. Defina a chave antes de rodar:

```powershell
$env:ANTHROPIC_API_KEY="sua-chave"
```

```bash
export ANTHROPIC_API_KEY=sua-chave
```

## Instalação

Pré-requisitos: **Node.js 20+** e uma das ferramentas de IA suportadas: **Claude Code**, **Cursor**, **Codex CLI** ou **Gemini CLI**.

No projeto que você quer testar:

```bash
npm install -D ux-validate
```

```bash
npx playwright install chromium
```

```bash
npx ux-validate init
```

O setup pergunta:

- o **idioma da ferramenta** (português ou inglês);
- **em quais ferramentas de IA** você vai usar os comandos (Claude Code, Cursor, Codex CLI, Gemini CLI; uma ou mais);
- a **URL** da aplicação e, opcionalmente, o comando para subi-la;
- os **tamanhos de tela** (mobile, tablet, desktop);
- o **idioma do conteúdo**, para a verificação ortográfica;
- se quer configurar um **modelo para aplicar correções pelo terminal** (`npx ux-validate fix`), escolhendo **provedor** (Anthropic, OpenAI, Google, Ollama), **modelo** e o nome da variável de ambiente com a sua API key;
- se quer criar **personas de exemplo**.

E cria:

| Arquivo | Para quê |
|---|---|
| `ux-validate.config.yml` | Configuração |
| `.ux-validate/personas/*.yml` | Suas personas |
| `.ux-validate/references/` | Heurísticas e formatos que o agente consulta |
| `.ux-validate/dicionario.txt` | Palavras corretas que o dicionário não conhece |
| Os comandos e o MCP de cada ferramenta escolhida | Veja [Ferramentas de IA suportadas](#ferramentas-de-ia-suportadas) |

Use `--yes` para aceitar os padrões sem perguntas, `--tools claude-code,cursor,codex,gemini` para escolher as ferramentas sem perguntas e `--force` para sobrescrever arquivos existentes.

## Uso

Na sua ferramenta de IA, dentro do seu projeto (no Codex, use `$` no lugar de `/`):

| Comando | O que faz |
|---|---|
| `/persona-new` | Cria uma persona conversando com você sobre quem usa a aplicação |
| `/persona-test` | Testa com todas as personas e gera o relatório |
| `/persona-test dona-maria` | Testa com uma persona só |
| `/persona-test --only accessibility` | Avalia só uma categoria (`content`, `navigation`, `ui`, `accessibility`) |
| `/persona-report` | Refaz o relatório da última execução e monta um plano de correção |
| `/persona-report --compare` | Mostra o que foi resolvido, o que continua e o que é novo |
| `/persona-fix` | Aplica as correções do relatório (críticos, altos e médios) |
| `/persona-fix A001,C003` | Aplica só as correções desses problemas |

Pelo terminal (útil no CI):

```bash
npx ux-validate persona new      # cria uma persona com um assistente passo a passo
npx ux-validate persona validate # confere os arquivos de persona
npx ux-validate check            # só as checagens fixas
npx ux-validate report           # relatório da execução mais recente
npx ux-validate fix              # aplica as correções com o modelo configurado no setup
```

Os resultados ficam em `.ux-validate/runs/<data-hora>/` (já incluído no `.gitignore`).

## Personas

Uma persona é um tipo real de usuário da sua aplicação, escrito como um arquivo YAML em `.ux-validate/personas/`. O setup cria três exemplos; para criar as suas:

- **`/persona-new` no Claude Code:** o agente entrevista você sobre o usuário real (quem é, que aparelho usa, limitações, o que vem fazer), pode olhar a aplicação para sugerir objetivos, mostra o arquivo e grava depois da sua confirmação. Dá para começar com uma descrição: `/persona-new cliente idoso que compra pelo celular`.
- **`npx ux-validate persona new` no terminal:** um assistente passo a passo, com perguntas de múltipla escolha para cada característica. Não usa modelo de linguagem.

Os dois conferem o arquivo com `npx ux-validate persona validate`, que você também pode rodar a qualquer momento para checar todas as personas do projeto (campos obrigatórios, valores válidos, ids repetidos).

```yaml
id: dona-maria
name: Dona Maria
description: 68 anos, aposentada, usa o celular com ajuda da neta.
viewport: mobile
traits:
  tech_literacy: baixa      # aumenta o peso de jargão e ícones sem rótulo
  vision: reduzida          # aumenta o peso de contraste e fontes pequenas
  patience: baixa           # desiste após poucos passos sem progresso
  language: pt-BR
  reading_level: básico
goals:
  - Descobrir quanto custa
  - Encontrar um telefone ou WhatsApp
```

Formato completo e efeito de cada característica: [`source/pt-BR/references/persona-format.md`](source/pt-BR/references/persona-format.md). Os valores das características podem estar em português ou em inglês (`low`, `reduced`, `screen-reader`…).

## Experimente com o site de demonstração

`examples/demo-site` é um site com problemas plantados de propósito (links quebrados, lorem ipsum, layout que estoura no celular, formulário inacessível, abas e acordeão com ARIA errado…). Ótimo para ver a ferramenta funcionando antes de usar no seu projeto.

**1. Clone e suba o site** (deixe este terminal aberto):

```bash
git clone https://github.com/fabiofigueredo/ux-validate.git
```

```bash
cd ux-validate && npm install && npx playwright install chromium
```

```bash
npm run demo:serve
```

O site fica em http://localhost:4321/index.html.

**2. Crie um projeto de teste** em outro terminal, ao lado da pasta `ux-validate`:

```bash
mkdir projeto-teste && cd projeto-teste && npm init -y
```

```bash
npm install -D ../ux-validate
```

```bash
npx ux-validate init
```

Quando o setup pedir a URL, informe `http://localhost:4321/index.html`.

> Também dá para testar arquivos HTML direto do disco, sem servidor, usando uma URL `file://` (ex.: `file:///C:/projetos/meu-site/index.html`). Prefira `http://` sempre que a aplicação tiver um servidor: é como o usuário real vai acessá-la.

**3. Rode as checagens fixas:**

```bash
npx ux-validate check
```

```bash
npx ux-validate report
```

Abra o `report.html` em `.ux-validate/runs/<data-hora>/`.

**4. Rode o teste com personas:** abra a pasta `projeto-teste` no VS Code, abra o Claude Code, aprove o servidor MCP `playwright` (ou ative-o com `/mcp`) e digite `/persona-test dona-maria`.

`examples/sample-findings.json` mostra o tipo de resultado que o agente produz.

### Problemas comuns

| Sintoma | Solução |
|---|---|
| `/persona-test` não aparece | A pasta aberta precisa ser a do projeto onde você rodou o `init` (a que tem `.claude/`, `.cursor/`, `.agents/` ou `.gemini/`). No Gemini CLI, rode `/commands reload` |
| O agente não tem as ferramentas de navegador | Aprove ou ative o servidor MCP `playwright` na sua ferramenta; no Codex e no Gemini, marque a pasta do projeto como confiável |
| Erro dizendo que o navegador não foi encontrado | Rode `npx playwright install chromium` no projeto |
| "A página inicial não abre" | Confira se a aplicação está no ar e se `app.url` está certa |
| Quer mudar a URL depois do setup | Edite `app.url` em `ux-validate.config.yml` |

## Estrutura do projeto

```
bin/ux-validate.js       CLI (init, check, report, fix, persona)
src/init.js              setup interativo
src/checks.js            checagens determinísticas (Playwright + axe-core)
src/aria.js              checagens de WAI-ARIA e teclado
src/spelling.js          verificação ortográfica (Hunspell)
src/fix.js               correção automática a partir do relatório
src/llm.js               clientes dos provedores (Anthropic, OpenAI, Google, Ollama)
src/persona.js           assistente e validação de personas
src/report.js            notas e relatório (Markdown + HTML)
src/i18n.js              idioma da ferramenta
src/locales/             mensagens em inglês (en.js) e português (pt-BR.js)
src/adapters/            um adapter por ferramenta de IA
source/<idioma>/commands/    comandos escritos uma vez, independentes da ferramenta
source/<idioma>/references/  heurísticas, guia de conteúdo, guia WAI-ARIA, formatos de persona e de achados
source/<idioma>/personas/    personas de exemplo
examples/                site de demonstração e resultados de exemplo
test/                    testes (npm test)
```

### Adicionando uma ferramenta de IA

Os comandos em `source/<idioma>/commands/` usam placeholders (`{{WORK_DIR}}`, `{{CHECK_CMD}}`…) e não dependem de ferramenta. Para suportar uma nova, crie `src/adapters/<ferramenta>.js` com `{ id, label, available: true, invoke(name), install({ cwd, commands, force }) }`, gravando os comandos no formato que ela entende (`src/adapters/shared.js` tem funções para adaptar o marcador de argumentos e registrar o servidor MCP), registre-o em `src/adapters/index.js` e adicione a linha de próximos passos em `init.next.tools` nos catálogos de mensagens.

## Roadmap

- [x] Setup interativo, adapter do Claude Code, `/persona-test` e `/persona-report`
- [x] Checagens fixas e relatório com notas por persona
- [x] Acessibilidade com WAI-ARIA e verificação ortográfica
- [x] `/persona-fix` e `npx ux-validate fix` (aplicar correções com o modelo do usuário)
- [x] Inglês e português
- [x] Adapters para Cursor, Codex CLI e Gemini CLI
- [x] `/persona-new` e `npx ux-validate persona new` (criar personas)
- [ ] Navegação com personas pelo terminal (sem ferramenta de IA), com o modelo escolhido no setup
- [ ] GitHub Action com comentário no PR e saída SARIF
- [ ] Repetir a navegação e só confirmar problemas que aparecem em mais de uma execução

### Adicionando um idioma

1. Copie `src/locales/en.js` para `src/locales/<idioma>.js`, traduza e registre em `src/i18n.js`.
2. Copie `source/en/` para `source/<idioma>/` e traduza comandos, referências e personas.
3. Rode `npm test`: um teste confere que todos os catálogos têm as mesmas chaves.

## Contribuindo

Sugestões e PRs são bem-vindos. Antes de abrir um PR, rode `npm test`. Para mudar o comportamento do agente, edite os comandos em `source/<idioma>/commands/` e as referências em `source/<idioma>/references/` (mantenha os dois idiomas em sincronia): eles valem para todas as ferramentas.

## Variáveis de ambiente

| Variável | Uso |
|---|---|
| `UX_VALIDATE_CHROMIUM` | Caminho de um Chromium já instalado, se não quiser usar o do Playwright |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` | API key usada pelo `npx ux-validate fix` (o nome da variável é configurável no setup) |
| `UX_VALIDATE_LOCALE` | Idioma da ferramenta (`en` ou `pt-BR`) quando não há `locale` na configuração |
| `DEBUG` | Mostra o erro completo quando um comando falha |

## Licença

[MIT](LICENSE) © Fabio Figueredo
