# Formato de persona

Cada persona é um arquivo `.yml` na pasta de personas (padrão `.ux-validate/personas/`).

Para criar uma: `/ux-persona` no Claude Code (conversando) ou `npx ux-validate persona new` no terminal (assistente passo a passo). Para conferir os arquivos: `npx ux-validate persona validate`.

```yaml
id: dona-maria              # identificador curto, sem espaços (usado no relatório)
name: Dona Maria
description: >
  68 anos, aposentada. Usa o celular para WhatsApp e banco, com ajuda da neta.
  Desconfia de sites que pedem dados logo de cara.
viewport: mobile            # mobile | tablet | desktop
traits:
  tech_literacy: baixa      # baixa | média | alta
  vision: reduzida          # normal | reduzida | daltonismo | leitor-de-tela
  patience: baixa           # baixa | média | alta
  language: pt-BR
  reading_level: básico     # básico | intermediário | avançado
goals:
  - Descobrir quanto custa o plano mais barato
  - Falar com alguém do suporte
expectations:               # opcional: o que ela espera encontrar
  - Telefone ou WhatsApp visível
  - Letras grandes
```

Valores em inglês (`low`, `medium`, `high`, `reduced`, `color-blind`, `screen-reader`, `basic`…) também são aceitos.

## Como as características mudam o teste

| Característica | Efeito no comportamento | Efeito na avaliação |
|---|---|---|
| `tech_literacy: baixa` | Não usa busca avançada nem atalhos; ícones sem texto não significam nada para ela | Jargão, inglês e ícones sem rótulo ficam mais graves |
| `vision: reduzida` | Ignora textos pequenos ou de baixo contraste | Contraste e tamanho de fonte ficam mais graves |
| `vision: leitor-de-tela` | Usa só teclado e a árvore de acessibilidade (`browser_snapshot`), sem olhar o visual nem usar o mouse | Nomes acessíveis, ordem de foco, estados ARIA e mensagens anunciadas viram prioridade |
| `vision: daltonismo` | Não distingue informação passada só por cor | Estados e erros indicados só por cor ficam graves |
| `patience: baixa` | Desiste após 3 ou 4 passos sem progresso visível | Passos extras e carregamentos lentos ficam mais graves |
| `reading_level: básico` | Pula textos longos | Frases longas e termos técnicos ficam mais graves |

## Dicas para escrever boas personas

- Baseie-se em usuários reais do produto, não em estereótipos.
- Escreva objetivos como tarefas concretas e verificáveis ("descobrir o preço do plano X"), não como desejos vagos ("gostar do site").
- Três a cinco personas bem diferentes entre si cobrem mais problemas do que dez parecidas.
