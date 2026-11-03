# persona-qa

Testes de **conteúdo**, **navegação** e **interface** de aplicações web, feitos do ponto de vista de **personas**, geradas por IA ou não, e executados pelo agente de IA que você já usa.

Em vez de só dizer "o contraste está abaixo de 4,5:1", o persona-qa responde: *a Dona Maria, de 68 anos, no celular, consegue descobrir quanto custa o seu produto?* E se não consegue, mostra onde ela travou, por quê e em qual arquivo corrigir.

## Como funciona

```
/persona-test
   │
   ├─ 1. Checagens fixas  (npx persona-qa check)
   │     axe-core, links quebrados, erros de console, rolagem horizontal,
   │     textos provisórios (lorem ipsum, TODO, NaN, {{variáveis}})…
   │     → mesmo resultado com qualquer modelo de linguagem
   │
   ├─ 2. Navegação como cada persona  (agente + Playwright MCP)
   │     tenta cumprir os objetivos dela, com as limitações dela,
   │     e avalia conteúdo, navegação e interface pelo olhar dela
   │
   ├─ 3. Aponta o arquivo provável de cada problema no seu código
   │
   └─ 4. Relatório  (npx persona-qa report)
         notas por persona, objetivos cumpridos, problemas com evidência
         e sugestão de correção → report.md + report.html
```

O persona-qa roda **dentro da sua ferramenta de IA**: o modelo usado é o que ela estiver usando.

## Instalação

```bash
npx persona-qa init
```

O setup pergunta:

- **Em qual ferramenta de IA** você vai usar os comandos (hoje: Claude Code; Cursor, Codex e Gemini CLI em breve);
- a **URL** da aplicação e, opcionalmente, o comando para subi-la;
- os **tamanhos de tela** (mobile, tablet, desktop);
- se quer configurar o **modo standalone** (CLI/CI sem ferramenta de IA), escolhendo **provedor** (Anthropic, OpenAI, Google, Ollama) e **modelo**;
- se quer criar **personas de exemplo**.

E cria:

| Arquivo | Para quê |
|---|---|
| `persona-qa.config.yml` | Configuração |
| `.persona-qa/personas/*.yml` | Suas personas |
| `.persona-qa/references/` | Heurísticas e formatos que o agente consulta |
| `.claude/skills/persona-test/`, `persona-report/` | Comandos do Claude Code |
| `.mcp.json` | Registra o Playwright MCP (o navegador do agente) |

Use `--yes` para aceitar os padrões sem perguntas e `--force` para sobrescrever arquivos existentes.

## Uso

No Claude Code, dentro do seu projeto:

| Comando | O que faz |
|---|---|
| `/persona-test` | Testa com todas as personas e gera o relatório |
| `/persona-test dona-maria` | Testa com uma persona só |
| `/persona-test --only content` | Avalia só uma categoria (`content`, `navigation`, `ui`) |
| `/persona-report` | Refaz o relatório da última execução e monta um plano de correção |
| `/persona-report --compare` | Mostra o que foi resolvido, o que continua e o que é novo |

Pelo terminal (útil no CI):

```bash
npx persona-qa check            # só as checagens fixas
npx persona-qa report           # relatório da execução mais recente
```

Os resultados ficam em `.persona-qa/runs/<data-hora>/` (já incluído no `.gitignore`).

## Personas

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

Formato completo e efeito de cada característica: [`source/references/persona-format.md`](source/references/persona-format.md).

## Experimente com o site de demonstração

`examples/demo-site` é um site com problemas plantados de propósito (links quebrados, lorem ipsum, layout que estoura no celular, formulário inacessível…).

```bash
npm install
npm run demo:serve        # serve em http://localhost:4321
```

Em outro terminal, num projeto de teste:

```bash
npx persona-qa init --yes
```

Troque `app.url` em `persona-qa.config.yml` por `http://localhost:4321/index.html` e rode `/persona-test` no Claude Code. `examples/sample-findings.json` mostra o tipo de resultado que o agente produz.

## Estrutura do projeto

```
bin/persona-qa.js        CLI (init, check, report)
src/init.js              setup interativo
src/checks.js            checagens determinísticas (Playwright + axe-core)
src/report.js            notas e relatório (Markdown + HTML)
src/adapters/            um adapter por ferramenta de IA
source/commands/         comandos escritos uma vez, independentes da ferramenta
source/references/       heurísticas, guia de conteúdo, formatos de persona e de achados
source/personas/         personas de exemplo
examples/                site de demonstração e resultado de exemplo
test/                    testes (npm test)
```

### Adicionando uma ferramenta de IA

Os comandos em `source/commands/` usam placeholders (`{{WORK_DIR}}`, `{{CHECK_CMD}}`…) e não dependem de ferramenta. Para suportar uma nova, crie `src/adapters/<ferramenta>.js` com `{ id, label, available: true, install({ cwd, commands, force }) }`, gravando os comandos no formato que ela entende, e registre-o em `src/adapters/index.js`.

## Roadmap

- [x] Setup interativo, adapter do Claude Code, `/persona-test` e `/persona-report`
- [x] Checagens fixas e relatório com notas por persona
- [ ] Adapters para Cursor, Codex CLI e Gemini CLI
- [ ] `/persona-new` (criar persona conversando) e `/persona-fix` (aplicar correções)
- [ ] Modo standalone (agente próprio via AI SDK, com o provedor e o modelo escolhidos no setup)
- [ ] GitHub Action com comentário no PR e saída SARIF
- [ ] Repetir a navegação e só confirmar problemas que aparecem em mais de uma execução

## Variáveis de ambiente

| Variável | Uso |
|---|---|
| `PERSONA_QA_CHROMIUM` | Caminho de um Chromium já instalado, se não quiser usar o do Playwright |
| `DEBUG` | Mostra o erro completo quando um comando falha |
