---
name: persona-fix
description: Aplica no código as correções apontadas no último relatório do ux-validate, uma de cada vez, mostrando cada mudança e verificando o resultado.
shortDescription: Aplica as correções do relatório
argumentHint: "[ids, ex.: A001,C003] [--severity critical|high|medium|low] [--run <pasta>]"
---

# /persona-fix

Corrige no código os problemas do relatório do ux-validate. Você usa as suas próprias ferramentas de edição; o consumo é o da conta do usuário nesta ferramenta.

Argumentos recebidos: `$ARGUMENTS`
- Ids separados por vírgula (ex.: `A001,C003`) limitam a correção a esses problemas.
- `--severity <nível>` corrige do mais grave até esse nível. Padrão: `medium` (críticos, altos e médios).
- `--run <pasta>` escolhe a execução. Padrão: a mais recente em `{{WORK_DIR}}/runs/`.

## Regras

1. **Só corrija o que está no relatório.** Nada de refatorar, reformatar ou "melhorar" código que não tem relação com o problema.
2. **Mudança mínima**, no estilo do arquivo (indentação, aspas, convenções do framework).
3. **Prefira HTML nativo e semântico a ARIA** (`<button>` em vez de `<div role="button">`), seguindo `{{REFERENCES_DIR}}/wai-aria.md`.
4. **Nunca invente dados.** Telefones, preços, endereços, depoimentos, números de clientes e nomes vêm do usuário. Se a correção depende de algo assim, pergunte ou deixe o problema para ele.
5. **Não comite** nem faça push. O usuário revisa as mudanças.

## Passos

1. Descubra a pasta da execução e leia `checks.json` e `findings.json`. Monte a lista de problemas a corrigir conforme os argumentos, do mais grave para o menos grave. Os ids do agente começam com `A`; os das checagens fixas, com `C`. Um achado com `relatedChecks` já cobre essas checagens.
2. Se o projeto usa Git e há mudanças não commitadas nos arquivos que você vai tocar, avise o usuário antes de começar.
3. Mostre o plano: quais problemas, em quais arquivos (use `sourceHint`; sem ele, procure no código o texto, o seletor ou o trecho de `evidence`). Separe os que dependem de informação do usuário. Peça confirmação.
4. Corrija um problema de cada vez. Para cada um:
   - mostre o arquivo e a mudança em uma frase;
   - edite;
   - em problemas de ortografia (`check:spelling`), corrija só as palavras realmente erradas. Nomes próprios, marcas e termos técnicos corretos vão para `{{DICTIONARY}}` (uma palavra por linha), não para o código.
5. Ao terminar, rode as checagens de novo para confirmar:

```bash
{{CHECK_CMD}}
```

   Compare com a execução anterior: o que foi resolvido, o que continua e se algo novo apareceu por causa das mudanças. Se apareceu, corrija ou explique.
6. Responda com: problemas corrigidos (arquivo e mudança em uma linha cada), problemas que dependem do usuário (e o que falta), problemas que continuam e por quê, e a sugestão de revisar com `git diff`.
