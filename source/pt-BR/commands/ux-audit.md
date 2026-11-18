---
name: ux-audit
description: Audita um site já publicado (sem precisar do código) como cada persona, com as checagens automáticas, e gera um relatório com um plano para quem mantém o site.
shortDescription: Auditar um site publicado como cada persona
argumentHint: "<URL do site> [persona] [--only content|navigation|ui|accessibility]"
---

# /ux-audit

Você vai auditar um site **já publicado**, a partir da URL, sem o código: as checagens automáticas e um teste **como se você fosse cada persona**, tentando as tarefas e os objetivos no site no ar. No fim, gera um relatório com evidências e um plano para quem mantém o site.

Argumentos recebidos: `$ARGUMENTS`
- A URL do site (ex.: `https://www.exemplo.com.br`). Se faltar, pergunte.
- O nome de uma persona (o `id`) limita o teste a ela. Sem nome, teste todas.
- `--only content|navigation|ui|accessibility` limita a avaliação a uma categoria.

Escreva tudo (achados, resumos, sua resposta) em português do Brasil.

## Regras para a auditoria inteira

1. **Só sites pelos quais o usuário responde ou que ele tem autorização para testar.** Antes de qualquer coisa, pergunte: "Você é responsável por este site ou tem autorização para testá-lo?" Se a resposta não for um sim claro, pare.
2. **É um site no ar, com pessoas e dados reais.** Nunca envie formulários, não faça login, não crie contas, não compre, não agende, não assine, não envie mensagens e não clique em sair, excluir, cancelar ou descadastrar. A persona vai até o botão final e você avalia o caminho até ele. Para ver as mensagens de erro de um formulário, deixe um campo obrigatório vazio e passe para o próximo (isso mostra a validação na hora, sem enviar); não aperte o botão de envio.
3. **Pare no login.** Uma página que pede login ou pagamento é um limite da auditoria, não um problema do site: registre em `limits` (Passo 5) e siga.
4. **Todo problema precisa de evidência**: screenshot, trecho do DOM ou o texto exato da página. **Não invente.**
5. **Fique no lugar da persona.** Ela não digita URLs, não abre o DevTools e não conhece rotas escondidas. Só usa o que está visível na tela.
6. **Pegue leve com o servidor.** Navegue no ritmo de uma pessoa e só pelas páginas públicas do próprio site. Não visite as páginas que a auditoria automática deixou de fora (listadas no `checks-brief.md`).
7. **Economize tokens sem pular nada.** Leia cada arquivo de referência uma vez, só quando começar o passo que precisa dele. Cada ação no navegador já devolve o snapshot da página: não chame `browser_snapshot` de novo logo depois de uma. Tire screenshots só como evidência de um problema ou de onde a persona se perdeu, da área visível (não `fullPage`) ou só do elemento (`target`), com `scale: "css"`.

## Passo 1: preparar

Cada site tem uma pasta própria, `ux-validate-audits/<domínio>/` (ex.: `ux-validate-audits/www.exemplo.com.br/`), com as personas (`personas/`), as tarefas (`tasks.yml`) e uma pasta por execução. Se ela já existir, reaproveite as personas e as tarefas e avise o usuário.

1. **Personas.** Se a pasta não tiver nenhuma, rode `{{PERSONA_EXAMPLES_CMD}}` e mostre ao usuário as personas pré-definidas com as características de cada uma (quem é, dispositivo, familiaridade com tecnologia, visão, paciência, leitura, objetivos). Pergunte se ele quer **as pré-definidas** (todas ou algumas), **as dele** ou **as duas coisas**, e espere a resposta. As pré-definidas entram no Passo 2 (`--personas`). Para criar uma, siga o fluxo do `/ux-persona` e salve o arquivo em `ux-validate-audits/<domínio>/personas/` (formato em `{{REFERENCES_DIR}}/persona-format.md`).
2. **Tarefas (obrigatório).** Se a pasta não tiver tarefas, pergunte ao usuário o que as pessoas vêm fazer no site e escreva as tarefas seguindo `{{REFERENCES_DIR}}/tasks-format.md`: objetivos em forma de cenário, sem passo a passo, sem as palavras dos menus e botões do site (abra a página inicial e leia o menu para evitá-las), com critério de sucesso quando possível. Mostre e peça confirmação.

## Passo 2: auditoria automática

Rode, com as personas e tarefas do Passo 1 (cada tarefa nova num `--task`):

```bash
{{AUDIT_CMD}} <url> --yes --personas <ids> --task "<tarefa 1>" --task "<tarefa 2>"
```

Use `--yes` só porque o usuário já confirmou a autorização na regra 1. Deixe `--personas` e `--task` de fora quando a pasta já as tiver. O comando cria a pasta, respeita o robots.txt, espera entre as páginas, não segue links de sair/excluir e grava uma pasta de execução `ux-validate-audits/<domínio>/<data-hora>/` com `checks-brief.md`, `checks.json`, screenshots, `color-vision/` e `aria/`. Se você criou personas ou escreveu tarefas à mão, confira com `{{PERSONA_VALIDATE_CMD}} --dir ux-validate-audits/<domínio>` e `{{TASK_VALIDATE_CMD}} --dir ux-validate-audits/<domínio>`.

Leia o `checks-brief.md` (não o `checks.json`; abra-o só para os detalhes de um id específico). Esses problemas **já estão registrados**: não os repita como achados seus. Quando um deles atrapalhar uma persona de um jeito específico, crie um achado próprio explicando o impacto e cite o id em `relatedChecks`.

## Passo 3: navegar como cada persona

**Uma persona por vez, cada uma num contexto limpo.** Se a sua ferramenta puder delegar a um subagente com as mesmas ferramentas de navegador (ex.: a ferramenta Agent/Task do Claude Code), entregue cada persona a um subagente, **uma depois da outra, nunca em paralelo**. Passe a ele: o arquivo da persona, as tarefas, a pasta da execução, o caminho destas instruções (regras e Passo 3), as referências de que ele precisa e uma faixa de ids para os achados (primeira persona `A101`–`A199`, segunda `A201`–`A299`…). Ele responde só com a entrada dele em `personas`, os `findings` e os `limits` dele. Sem subagentes, faça tudo aqui, em ordem.

Para cada persona, com as ferramentas de navegador do Playwright MCP:

1. Ajuste a janela ao viewport da persona: mobile 390×844, tablet 768×1024, desktop 1440×900.
2. **Primeiro as tarefas.** Para cada tarefa que vale para a persona (sem o campo `personas`, ou com o id dela), comece pelo `start` da tarefa (padrão: a URL do site):
   - Leia só o texto de `task`, como a persona ouviria. Nada de digitar URLs, nada de busca no site a menos que a persona pensasse nisso, nada de atalhos do que você viu com outras personas.
   - Anote o **primeiro clique** e se ele levou na direção do objetivo (`onPath`); conte os passos e as **voltas**; pare no `success`, em 15 passos ou antes, se a persona desistiria (ex.: `patience: baixa` após 3 ou 4 passos sem progresso).
   - Onde ela se perdeu ou desistiu, tire um screenshot (`lostAt`) e registre o motivo em `notes`. Crie achados para as causas e liste-os em `blockers`.
   - Se a tarefa só termina enviando um formulário, fazendo login ou pagando, pare no botão final: o resultado é `success` se ela chegou lá sem dificuldade, e o limite vai para `limits`.
3. Depois, os **objetivos** da persona, do mesmo jeito, a partir da página inicial.
4. Ao longo do caminho, avalie pelo olhar da persona, usando `{{REFERENCES_DIR}}/heuristics.md` e `{{REFERENCES_DIR}}/content-guidelines.md`: **conteúdo** (ela entende?), **navegação** (sabe onde está e como voltar?), **interface** (consegue ver e usar?) e **acessibilidade** (com as ferramentas e limitações dela).
5. **Banners de cookies e pop-ups:** se um deles cobrir o conteúdo, isso é um achado (quanto atrapalha e para quem). Feche como uma pessoa fecharia (o botão visível) e siga.

Personas com `vision: leitor-de-tela` navegam **sem olhar a tela**: só o teclado (`browser_press_key`) e a árvore de acessibilidade. Personas com `vision: daltonismo` (ou `color-blind`): leia `{{REFERENCES_DIR}}/color-vision.md` e simule o tipo delas no navegador; abra as imagens de `color-vision/` só das páginas com problemas `check:color` ou com informação diferenciada pela cor, e só a `normal` e a do tipo da persona. Ajuste o rigor às características da persona (valores em inglês como `low`, `reduced`, `screen-reader` valem como `baixa`, `reduzida`, `leitor-de-tela`).

## Passo 4: auditoria de acessibilidade e ortografia

Uma vez por auditoria (não por persona), a menos que `--only` as exclua:

1. **WAI-ARIA**, seguindo `{{REFERENCES_DIR}}/wai-aria.md`: nas páginas visitadas, use o snapshot que você já tem (ou o arquivo em `aria/` para páginas que nenhuma persona visitou). Teste cada tipo de widget (diálogos, abas, acordeões, menus, combobox, carrosséis) pelo teclado, com o padrão do APG, usando `browser_snapshot` limitado ao widget (`target`); `browser_find` ajuda a localizar um widget, mas só aqui, nunca ao navegar como persona. Registre com `category: "accessibility"`, o critério WCAG e o padrão do APG em `heuristic`.
2. **Ortografia e gramática:** separe os falsos positivos do `check:spelling` (nomes, marcas, termos técnicos corretos; liste-os na resposta), avalie as palavras estrangeiras pelo olhar de cada persona e revise a gramática das páginas visitadas (`category: "content"`, `heuristic: "Gramática"`).

## Passo 5: registrar e gerar o relatório

1. Escreva `findings.json` na pasta da execução, seguindo `{{REFERENCES_DIR}}/findings-format.md`, com duas diferenças: **não preencha `sourceHint`** (não há código; `page`, `evidence.selector` e o screenshot dizem onde está o problema), e acrescente `limits`, uma lista de frases com o que não pôde ser testado (ex.: "Checkout: exige login", "Formulário de contato: não enviado, como em toda auditoria"). Se usou subagentes, junte todas as `personas`, os `findings` e os `limits` deles.
2. Gere o relatório:

```bash
{{REPORT_CMD}} --dir ux-validate-audits/<domínio>
```

3. Se a pasta tiver uma execução anterior, compare: leia o `findings.json` e o `checks-brief.md` dela e mostre o que foi **resolvido**, o que **continua** e o que é **novo** (pelo título, página e elemento, não pelo id).
4. Responda ao usuário com:
   - a tabela de notas por persona e a tabela de tarefas (tarefa × persona), com onde as personas se perderam;
   - os limites da auditoria;
   - o começo do "Plano para quem mantém o site": o que impede as personas, depois os problemas críticos e altos;
   - o caminho do `report.html`, que ele pode compartilhar com quem mantém o site.

Não ofereça o `/ux-fix`: uma auditoria não tem código para alterar.
