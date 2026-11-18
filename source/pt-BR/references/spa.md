# Aplicações React e outras SPAs

Use quando o `checks-brief.md` mostrar um framework (`react` ou `next`), ou quando a aplicação trocar de tela sem recarregar a página.

1. **Rotas que não são links.** Telas abertas por botão (`navigate()`), abas ou modais não entram no rastreamento automático. Se encontrar telas importantes assim, sugira ao usuário incluí-las em `crawl.routes` no `ux-validate.config.yml`.
2. **Troca de rota.** Ao navegar como a persona, confira o que o navegador faria numa página comum: o título da aba muda? O foco vai para o conteúdo novo ou fica perdido? Personas com leitor de tela precisam ouvir que a página mudou. A checagem `check:spa` testa uma troca; avalie as demais pelo caminho da persona.
3. **Estados assíncronos.** Carregando, vazio e erro: aparecem, são anunciados (`aria-busy`, `role="status"`) e não deixam a tela em branco? Botões ficam desabilitados durante o envio e voltam depois?
4. **Onde corrigir.** As checagens já trazem `react.components` (o componente que desenhou o elemento e os que estão acima dele) e, no servidor de desenvolvimento, `sourceHint` com arquivo e linha. Use isso nos seus achados: procure primeiro no arquivo do componente. Lembre que no JSX o atributo `class` é `className` e textos podem estar divididos em expressões (`{nome}`).
5. **Build de produção.** Se o `checks-brief.md` disser `production build`, não há nomes de componentes nem arquivos: diga ao usuário que rodar contra o servidor de desenvolvimento (ex.: `npm run dev`) melhora a indicação de onde corrigir.
