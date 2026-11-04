---
name: ux-persona
description: Cria uma persona para os testes do ux-validate conversando com o usuário sobre quem usa a aplicação, e grava o arquivo em .ux-validate/personas/.
shortDescription: Cria uma nova persona
argumentHint: "[descrição livre, ex.: \"cliente idoso que compra pelo celular\"]"
---

# /ux-persona

Você vai ajudar o usuário a criar uma persona: um tipo real de usuário da aplicação, com características que mudam como os testes do `/ux-test` são feitos. Converse, proponha e só grave depois da confirmação.

Argumentos recebidos: `$ARGUMENTS` (uma descrição livre da persona, opcional).

## Regras

1. **Baseie-se em usuários reais.** Pergunte quem realmente usa a aplicação (dados de suporte, analytics, pesquisas). Evite estereótipos: idade não define habilidade com tecnologia.
2. **Objetivos concretos e verificáveis**, que o agente consiga tentar cumprir no navegador: "descobrir o preço do plano básico", não "gostar do site".
3. **Uma pergunta de cada vez**, em linguagem simples. Quando o usuário não souber responder, sugira um valor razoável e diga que dá para mudar depois.
4. **Não sobrescreva** uma persona existente sem perguntar.
5. Siga o formato de `{{REFERENCES_DIR}}/persona-format.md`.

## Passos

1. Leia `{{REFERENCES_DIR}}/persona-format.md` e liste as personas que já existem na pasta configurada em `ux-validate.config.yml` (padrão `{{WORK_DIR}}/personas/`). Se houver, mostre um resumo de uma linha de cada uma: a nova persona deve ser **diferente** delas. Se o usuário ainda não conhece as pré-definidas, mostre-as com `{{PERSONA_EXAMPLES_CMD}}`: talvez uma delas já sirva (`{{PERSONA_ADD_CMD}} <id>`).
2. Se os argumentos já descrevem a persona, parta deles. Senão, pergunte quem é a pessoa.
3. Descubra, conversando, o que falta:
   - quem é (idade aproximada, ocupação, contexto de uso) → `description`;
   - em qual aparelho usa a aplicação → `viewport` (`mobile`, `tablet`, `desktop`);
   - familiaridade com tecnologia, visão, paciência e nível de leitura → `traits` (valores em `persona-format.md`);
   - em que idioma lê → `traits.language`;
   - o que vem fazer na aplicação → `goals` (2 a 4 objetivos);
   - o que espera encontrar → `expectations` (opcional).
4. **Sugira objetivos a partir da aplicação**, se ajudar: abra a `app.url` do `ux-validate.config.yml` com as ferramentas de navegador (se disponíveis) ou leia as rotas e páginas do código, e proponha objetivos que façam sentido para essa persona. Diga que são sugestões.
5. Mostre o arquivo YAML completo e peça confirmação. Ajuste o que o usuário pedir.
6. Grave em `<pasta de personas>/<id>.yml`, com `id` em letras minúsculas e hífen (ex.: `dona-maria`), igual ao nome do arquivo.
7. Valide:

```bash
{{PERSONA_VALIDATE_CMD}} <caminho do arquivo>
```

   Corrija os erros, se houver.
8. Responda com um resumo de uma linha da persona e o próximo passo: `/ux-test <id>`. Se as personas do projeto forem parecidas entre si, sugira criar outra bem diferente (outro aparelho, outra limitação, outro objetivo).
