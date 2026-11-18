---
name: ux-task
description: Cria tarefas para as personas simuladas tentarem na aplicação (objetivos sem passo a passo), conversando com o usuário, e grava em .ux-validate/tasks.yml.
shortDescription: Cria tarefas para as personas
argumentHint: "[o que os usuários vêm fazer, ex.: \"descobrir o preço e falar com o suporte\"]"
---

# /ux-task

Você vai ajudar o usuário a escrever as tarefas que as personas simuladas vão tentar na aplicação, como num teste de usabilidade por tarefas. O teste verifica se cada persona encontra o caminho **sem passo a passo**, então o jeito de escrever as tarefas importa.

Argumentos recebidos: `$ARGUMENTS` (opcional: o que os usuários vêm fazer na aplicação).

## Regras

1. **Objetivo, não caminho.** "Você quer saber quanto custa o plano mais barato", nunca "Clique em Planos e veja o primeiro card".
2. **Sem as palavras da interface.** Não use os rótulos exatos de menus, links e botões: a persona só procuraria a palavra. Use as palavras de quem usa.
3. **Um objetivo por tarefa**, com um motivo curto e realista quando ajudar ("Você tem uma dúvida sobre seu pedido…").
4. **Um fim claro:** proponha um critério de `success` (onde chegar, não como). Se o usuário não quiser, deixe de fora.
5. **Uma pergunta de cada vez**, em linguagem simples. Sugira; não decida pelo usuário.
6. Siga `{{REFERENCES_DIR}}/tasks-format.md`.

## Passos

1. Leia `{{REFERENCES_DIR}}/tasks-format.md` e o arquivo de tarefas definido no `ux-validate.config.yml` (padrão `{{WORK_DIR}}/tasks.yml`). Se já houver tarefas, mostre-as em uma linha cada: as novas devem cobrir outros objetivos.
2. Descubra o que as pessoas vêm fazer na aplicação: pelos argumentos ou perguntando ("Quais são as 3 a 5 coisas mais importantes que alguém vem fazer aqui?").
3. **Conheça as palavras da interface** para evitá-las: abra a `app.url` com as ferramentas de navegador (se disponíveis) e leia o menu, os links e os botões, ou leia a navegação no código. Não mostre o caminho ao usuário; use isso só para não entregar a resposta.
4. Para cada objetivo, escreva a tarefa como cenário e proponha um critério de `success`. Se a tarefa usar um rótulo da interface, reescreva com outras palavras e explique o motivo ao usuário.
5. Pergunte se alguma tarefa vale só para algumas personas (`personas`, com ids de `{{WORK_DIR}}/personas/`). Por padrão, vale para todas.
6. Mostre o YAML completo e peça confirmação. Ajuste o que o usuário pedir.
7. Grave no arquivo de tarefas, mantendo as que já existem e dando a cada nova um `id` único (letras minúsculas, números e hífen).
8. Valide:

```bash
{{TASK_VALIDATE_CMD}}
```

9. Diga ao usuário que as tarefas estão prontas e que o `/ux-test` vai fazer cada persona tentá-las.
