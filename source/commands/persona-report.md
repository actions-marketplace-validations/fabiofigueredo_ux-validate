---
name: persona-report
description: Gera ou atualiza o relatório da última execução do ux-validate e resume as prioridades de correção (opcionalmente comparando com a execução anterior).
argumentHint: "[pasta da execução] [--compare]"
---

# /persona-report

Monta o relatório de uma execução do ux-validate e explica ao usuário o que corrigir primeiro.

Argumentos recebidos: `$ARGUMENTS`
- Uma pasta de execução (ex.: `{{WORK_DIR}}/runs/2026-11-03T14-20-00`). Sem pasta, use a mais recente em `{{WORK_DIR}}/runs/`.
- `--compare` compara com a execução anterior.

## Passos

1. Descubra a pasta da execução. Se `{{WORK_DIR}}/runs/` estiver vazia, diga ao usuário para rodar `/persona-test` primeiro e pare.
2. Gere o relatório:

```bash
{{REPORT_CMD}} --run <pasta da execução>
```

   Se a pasta só tiver `checks.json` (sem `findings.json`), o relatório sai sem notas por persona. Avise o usuário e sugira `/persona-test` para a avaliação completa.
3. Leia o `report.md` gerado e responda com:
   - a tabela de notas por persona;
   - os objetivos que falharam e por quê;
   - um **plano de correção em ordem**: primeiro o que bloqueia objetivos, depois críticos e altos que afetam mais personas, depois o resto agrupado por arquivo (para corrigir vários de uma vez);
   - o caminho do `report.html`.
4. Com `--compare`: leia o `findings.json` e o `checks.json` da execução anterior e mostre o que foi **resolvido**, o que **continua** e o que é **novo** (compare pelo título, página e elemento, não pelo id). Mostre também como as notas mudaram.

Não altere o código da aplicação neste comando.
