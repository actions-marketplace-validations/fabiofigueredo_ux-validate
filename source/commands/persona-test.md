---
name: persona-test
description: Testa conteúdo, navegação e interface da aplicação web do ponto de vista de cada persona e gera um relatório com os problemas e como corrigi-los.
argumentHint: "[persona] [--only content|navigation|ui]"
---

# /persona-test

Você vai testar a aplicação **como se fosse cada persona**: tentar cumprir os objetivos dela no navegador, com as limitações dela, e avaliar conteúdo, navegação e interface pelo ponto de vista dela. No fim, gera um relatório com evidências e sugestões de correção.

Argumentos recebidos: `$ARGUMENTS`
- Um nome de persona (o `id` ou o nome do arquivo) limita o teste a ela. Sem nome, teste todas.
- `--only content|navigation|ui` limita a avaliação a uma categoria.

## Regras que valem o teste inteiro

1. **Todo problema precisa de evidência**: screenshot, trecho do DOM ou texto exato da página. Sem evidência, não registre.
2. **Não invente.** Se não deu para verificar algo (login, pagamento, área bloqueada), registre como limitação no resumo da persona, não como problema da aplicação.
3. **Fique na pele da persona.** Ela não lê o código, não digita URLs na barra de endereço, não abre o DevTools e não conhece rotas escondidas. Só usa o que está visível na tela.
4. **Não altere o código da aplicação** durante o teste. Este comando só diagnostica. Correções vêm depois, se o usuário pedir.
5. **Não use dados reais.** Em formulários, use dados de teste óbvios (ex.: `teste+persona@example.com`). Não finalize pagamentos nem envie mensagens a terceiros.

## Passo 1: preparar

1. Leia `ux-validade.config.yml`. Ele traz a `app.url`, o comando `app.start` (opcional), os `viewports`, a pasta de personas e `agent.maxStepsPerGoal`.
2. Leia as personas na pasta configurada (padrão `{{WORK_DIR}}/personas/*.yml`). O formato está em `{{REFERENCES_DIR}}/persona-format.md`. Se não houver nenhuma, pare e sugira criar uma a partir de `{{REFERENCES_DIR}}/persona-format.md`.
3. Verifique se a aplicação responde na `app.url`. Se não responder e houver `app.start`, suba-a em segundo plano e espere ficar disponível (até ~60s). Se continuar fora do ar, pare e explique ao usuário.

## Passo 2: checagens fixas

Rode:

```bash
{{CHECK_CMD}}
```

Isso cria uma pasta de execução em `{{WORK_DIR}}/runs/<data-hora>/` com `checks.json` (acessibilidade via axe-core, links quebrados, erros de console, rolagem horizontal, textos provisórios) e screenshots. Anote o caminho da pasta: tudo desta execução vai para lá.

Leia o `checks.json`. Esses problemas **já estão registrados**: não os repita como achados seus. Quando um deles atrapalhar uma persona de um jeito específico, crie um achado próprio explicando o impacto para ela e cite o id da checagem em `relatedChecks`.

## Passo 3: navegar como cada persona

Para cada persona, use as ferramentas de navegador do Playwright MCP (`browser_resize`, `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_take_screenshot` etc.):

1. Ajuste a janela ao viewport da persona: mobile 390×844, tablet 768×1024, desktop 1440×900.
2. Abra a `app.url`. Para **cada objetivo** da persona:
   - Tente cumpri-lo partindo da página inicial, como ela faria. Use `browser_snapshot` para ler a página e decidir o próximo passo.
   - Conte cada ação (clique, digitação, rolagem para procurar algo) como um passo. Pare quando cumprir o objetivo, quando chegar a `maxStepsPerGoal` ou antes, se o comportamento da persona indicar que ela desistiria (ex.: `patience: baixa` desiste após 3 ou 4 passos sem progresso visível).
   - Registre o caminho (URLs visitadas), o resultado (`success`, `partial` ou `fail`) e, em `notes`, o momento exato em que hesitou ou travou e por quê.
   - Em cada ponto de atrito, tire um screenshot com `browser_take_screenshot` e salve-o em `<pasta da execução>/screenshots/` com nome descritivo (ex.: `ana-checkout-botao-escondido.png`).
3. Ao longo do caminho, avalie as três categorias pelo olhar da persona, usando `{{REFERENCES_DIR}}/heuristics.md` e `{{REFERENCES_DIR}}/content-guidelines.md`:
   - **Conteúdo**: ela entende os textos? Jargão, termos em inglês sem explicação, tom inadequado, informação que ela procura e não acha, textos contraditórios ou genéricos demais.
   - **Navegação**: ela sabe onde está e como voltar? Menus claros, rótulos que dizem para onde levam, becos sem saída, passos desnecessários, feedback após ações.
   - **Interface**: ela consegue ver e usar? Contraste e tamanho para a visão dela, alvos de toque no celular, estados de carregamento e erro, consistência visual, elementos que parecem clicáveis e não são (ou o contrário).

Ajuste o rigor às características da persona (ex.: `vision: reduzida` aumenta a gravidade de contraste e fontes pequenas; `tech_literacy: baixa` aumenta a de jargão e ícones sem rótulo).

## Passo 4: apontar onde corrigir

Para cada achado seu, procure no código do projeto o arquivo provável. Busque o texto exato visível na página, o nome do componente ou a rota. Preencha `sourceHint` com `file` (caminho relativo) e `line` quando tiver segurança. Se não achar, deixe `sourceHint` de fora; não chute.

## Passo 5: registrar e gerar o relatório

1. Escreva `<pasta da execução>/findings.json` seguindo exatamente `{{REFERENCES_DIR}}/findings-format.md`. Classifique a gravidade com a tabela daquele arquivo. Use `confidence: "confirmed"` só quando reproduziu o problema; caso contrário, `"likely"`.
2. Gere o relatório:

```bash
{{REPORT_CMD}} --run <pasta da execução>
```

3. Responda ao usuário com:
   - a tabela de notas por persona (está no topo do `report.md`);
   - os objetivos que falharam e o motivo, em uma linha cada;
   - os 5 problemas mais importantes, com o arquivo provável de correção;
   - o caminho do `report.html` para ver tudo com screenshots;
   - a oferta de corrigir os problemas, começando pelos críticos.
