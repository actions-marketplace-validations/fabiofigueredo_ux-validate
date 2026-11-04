# Acessibilidade com WAI-ARIA

Guia para avaliar a categoria **Acessibilidade** (`accessibility`). Baseado na especificação [WAI-ARIA 1.2](https://www.w3.org/TR/wai-aria-1.2/) e no [ARIA Authoring Practices Guide (APG)](https://www.w3.org/WAI/ARIA/apg/).

As checagens fixas já cobrem a sintaxe do ARIA (axe-core) e parte do comportamento: foco invisível, armadilha de teclado, widgets sem foco, elementos clicáveis sem teclado, `aria-expanded` parado e campos só com placeholder. **Não repita esses achados.** Seu papel é testar o que exige interação e julgamento: se cada widget se comporta como o padrão do APG manda e se a experiência faz sentido para quem usa teclado ou leitor de tela.

## As 5 regras do uso de ARIA

1. **Use HTML nativo sempre que existir.** `<button>` em vez de `<div role="button">`; `<a href>` para navegar; `<input type="checkbox">` em vez de `role="checkbox"`.
2. **Não mude a semântica nativa sem necessidade.** Errado: `<h2 role="tab">`. Certo: `<div role="tab"><h2>…</h2></div>`.
3. **Todo controle ARIA interativo precisa funcionar pelo teclado.**
4. **Não use `role="presentation"` nem `aria-hidden="true"` em elementos que recebem foco.**
5. **Todo elemento interativo precisa de nome acessível.**

> "Nenhum ARIA é melhor que ARIA ruim": páginas com ARIA mal aplicado costumam ter mais erros de acessibilidade do que páginas sem ARIA.

## Árvore de acessibilidade

As checagens salvam em `<pasta da execução>/aria/<página>.yml` a árvore de acessibilidade de cada página: papéis, nomes e estados, que é o que um leitor de tela anuncia. Use-a para responder:

- Cada controle tem um **nome que faz sentido fora do contexto**? ("Saiba mais" repetido cinco vezes não serve.)
- O **papel** corresponde ao que o elemento faz? (Um link que abre um diálogo deveria ser `button`.)
- Os **estados** (`[expanded]`, `[selected]`, `[checked]`, `[pressed]`, `[disabled]`) batem com o que se vê na tela?
- Há **landmarks** (`banner`, `navigation`, `main`, `contentinfo`) e **títulos** em hierarquia lógica (h1 → h2 → h3)?
- Algum conteúdo importante aparece **só visualmente** e some na árvore, como texto em imagem ou informação passada só por cor?

No navegador, `browser_snapshot` mostra a mesma árvore da página atual.

## Testando pelo teclado

Use `browser_press_key` com `Tab`, `Shift+Tab`, `Enter`, ` ` (espaço), `Escape` e as setas. Depois de cada tecla, confira com `browser_snapshot` onde o foco está e o que mudou.

| Tecla | O que deve acontecer |
|---|---|
| `Tab` / `Shift+Tab` | Move o foco entre controles, na ordem visual de leitura |
| `Enter` | Aciona links e botões |
| `Espaço` | Aciona botões; marca checkbox; abre select |
| Setas | Movem **dentro** de widgets compostos (abas, menus, listas, radio group) |
| `Esc` | Fecha diálogos, menus e popovers, devolvendo o foco a quem os abriu |
| `Home` / `End` | Primeiro e último item em listas, abas e menus |

## Padrões do APG: o que verificar

### Botão (`button`)
- Aciona com `Enter` **e** `Espaço`.
- Botão de alternância usa `aria-pressed` (true/false) e o valor muda ao clicar.
- Botão só com ícone tem nome acessível (`aria-label` ou texto escondido visualmente).

### Link (`link`)
- Leva a outro lugar (URL). Se executa uma ação na mesma página, deveria ser `button`.
- O texto diz o destino; links que abrem em nova aba avisam isso.

### Disclosure e acordeão (mostrar/esconder)
- O controle é um `button` com `aria-expanded` que muda entre `true` e `false`.
- `aria-controls` aponta para o conteúdo controlado.
- No acordeão, cada cabeçalho é um botão dentro de um título (`<h3><button>…</button></h3>`).

### Diálogo modal (`dialog`, `alertdialog`)
- Ao abrir, o foco **entra** no diálogo (no primeiro controle ou no título).
- `Tab` **circula dentro** do diálogo; o conteúdo atrás fica inerte (`aria-modal="true"` ou `inert`).
- `Esc` fecha, e o foco **volta** ao elemento que abriu o diálogo.
- Tem nome (`aria-labelledby` apontando para o título).

### Abas (`tablist`, `tab`, `tabpanel`)
- Só a aba ativa está no `Tab`; as **setas** trocam de aba (roving tabindex: ativa `tabindex="0"`, demais `tabindex="-1"`).
- A aba ativa tem `aria-selected="true"`; cada aba tem `aria-controls` para seu painel.
- O painel tem `role="tabpanel"` e `aria-labelledby` apontando para a aba.

### Menu e menu button (`menu`, `menuitem`)
- Use `role="menu"` só para menus de **ações** no estilo de aplicativo, não para menus de navegação do site (esses são `nav` com links).
- O botão que abre tem `aria-haspopup="menu"` e `aria-expanded`.
- As setas navegam entre itens, `Esc` fecha e devolve o foco ao botão.

### Combobox, autocomplete e select customizado
- O campo tem `role="combobox"`, `aria-expanded` e `aria-controls` para a lista (`listbox`).
- As setas percorrem as opções e a opção ativa é indicada por `aria-activedescendant` (ou foco real).
- `Enter` escolhe, `Esc` fecha sem escolher.

### Checkbox, radio e switch customizados
- Têm `aria-checked` que muda ao acionar; `Espaço` alterna.
- Radios formam um grupo (`radiogroup`) e as setas trocam a opção.

### Carrossel
- Tem botão de pausar se roda sozinho (WCAG 2.2.2).
- Os controles de anterior e próximo são botões com nome; os slides não roubam o foco.

## Mensagens dinâmicas (live regions)

- Confirmações e resultados de ação ("Mensagem enviada", "3 resultados") ficam em uma região com `role="status"` (ou `aria-live="polite"`) que **já existe na página** antes da mensagem aparecer.
- Erros urgentes usam `role="alert"`.
- Teste: faça a ação e veja na árvore se a mensagem está dentro de uma região `status`/`alert`. Se não estiver, o leitor de tela não anuncia nada.

## Formulários

- Cada campo tem rótulo visível ligado ao campo (`<label for>`).
- Campos obrigatórios têm `required` ou `aria-required="true"`, e isso aparece no rótulo (não só com asterisco colorido).
- Erros: o campo recebe `aria-invalid="true"` e a mensagem fica ligada a ele por `aria-describedby`; ao enviar com erro, o foco vai para o primeiro campo inválido ou para um resumo dos erros.
- Instruções de formato ("DD/MM/AAAA") ficam ligadas por `aria-describedby`.

## Gravidade sugerida

| Situação | Gravidade |
|---|---|
| Controle essencial impossível de usar com teclado ou leitor de tela | `critical` |
| Diálogo sem gerenciamento de foco; erro de formulário não anunciado | `high` |
| Estado ARIA desatualizado; nome acessível vago; ordem de foco confusa | `medium` |
| ARIA redundante (ex.: `role="button"` em `<button>`) | `low` |

Use o campo `heuristic` com o critério WCAG e o padrão do APG, por exemplo: `"WCAG 2.1.2 · APG: Dialog (Modal)"`.
