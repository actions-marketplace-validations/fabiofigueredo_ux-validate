# Heurísticas de avaliação

Cite o critério usado no campo `heuristic` de cada achado (ex.: "Nielsen #4" ou "WCAG 1.4.3").

## As 10 heurísticas de Nielsen

| # | Heurística | O que procurar |
|---|---|---|
| 1 | Visibilidade do estado do sistema | Feedback após clicar/enviar, indicadores de carregamento, página atual destacada no menu |
| 2 | Correspondência com o mundo real | Palavras do usuário, não do sistema; nada de termos internos ou inglês desnecessário |
| 3 | Controle e liberdade | Voltar, cancelar e desfazer sempre possíveis; nada de becos sem saída |
| 4 | Consistência e padrões | Mesmo nome e aparência para a mesma ação; convenções da web respeitadas |
| 5 | Prevenção de erros | Confirmação antes de ações destrutivas, validação antes de enviar, campos com formato claro |
| 6 | Reconhecer em vez de lembrar | Opções visíveis; o usuário não precisa memorizar informações entre telas |
| 7 | Flexibilidade e eficiência | Caminhos curtos para tarefas frequentes |
| 8 | Estética e design minimalista | Sem informação irrelevante competindo com a principal |
| 9 | Ajudar a reconhecer e corrigir erros | Mensagens de erro em linguagem simples, dizendo o que fazer |
| 10 | Ajuda e documentação | Ajuda fácil de achar quando necessária |

## WCAG essenciais (nível AA)

| Critério | Resumo |
|---|---|
| 1.1.1 | Imagens informativas têm texto alternativo |
| 1.3.1 | Estrutura (títulos, listas, rótulos) está no código, não só no visual |
| 1.4.1 | Informação não é passada só por cor |
| 1.4.3 | Contraste mínimo de 4,5:1 para texto (3:1 para texto grande) |
| 1.4.4 | Texto pode ser ampliado a 200% sem quebrar |
| 1.4.10 | Sem rolagem horizontal em 320px de largura |
| 2.1.1 | Tudo funciona pelo teclado |
| 2.4.3 | Ordem de foco faz sentido |
| 2.4.4 | O texto do link diz para onde ele leva |
| 2.4.7 | Foco do teclado é visível |
| 2.5.8 | Alvos de toque com pelo menos 24×24px |
| 3.3.1 / 3.3.3 | Erros de formulário identificados e com sugestão de correção |
| 4.1.2 | Componentes têm nome, função e estado acessíveis |

## Sinais típicos de aplicações geradas por IA

Vale procurar ativamente:

- Botões e links que parecem funcionar mas não fazem nada (sem handler, `href="#"`).
- Páginas listadas no menu que não existem ou estão vazias.
- Formulários que mostram "sucesso" sem enviar nada, ou que não validam nada.
- Textos genéricos de marketing ("Soluções inovadoras para o seu negócio") sem informação concreta.
- Números, depoimentos e logos de clientes inventados.
- Mistura de idiomas (interface em português com trechos em inglês).
- Estados de vazio, carregamento e erro ausentes (a tela fica em branco).
- Visual inconsistente entre páginas (cada uma com espaçamentos, botões e fontes diferentes).
