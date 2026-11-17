# Formato das tarefas

Arquivo `.ux-validate/tasks.yml` (caminho em `tasks` no `ux-validate.config.yml`). Cada persona simulada tenta todas as tarefas que valem para ela, como um participante num teste de usabilidade por tarefas.

```yaml
- id: preco-plano-barato
  task: Você quer saber quanto custa o plano mais barato.
  success: A página mostra o preço do plano mais barato.
- id: falar-com-alguem
  task: Você tem uma dúvida sobre seu pedido e quer falar com uma pessoa.
  success: Aparece na tela um telefone, chat ou e-mail.
  personas: [dona-maria]      # opcional: só estas personas
  start: /                    # opcional: página de partida (padrão: app.url)
```

| Campo | Obrigatório | Observações |
|---|---|---|
| `id` | sim | Letras minúsculas, números e hífen; único |
| `task` | sim | O objetivo, escrito como cenário, do ponto de vista de quem usa |
| `success` | não | Onde a persona precisa chegar, não como. Deixa o resultado objetivo |
| `personas` | não | Ids das personas; sem o campo, a tarefa vale para todas |
| `start` | não | Caminho ou URL de partida |

## Como escrever boas tarefas

1. **Objetivo, não caminho.** "Você quer saber quanto custa o plano mais barato", e não "Clique em Planos e veja o primeiro card".
2. **Sem as palavras da interface.** Evite os rótulos exatos de menus, links e botões ("Planos", "Fale conosco", "Minha conta"): a persona só procuraria a palavra. O `npx ux-validate check` avisa quando uma tarefa usa o rótulo exato de um link ou botão.
3. **Um motivo realista.** Um contexto curto ajuda: "Você tem uma dúvida sobre seu pedido…".
4. **Um objetivo por tarefa.** Divida "comparar os planos e se cadastrar" em duas tarefas.
5. **Um fim claro.** Se não dá para dizer qual é o `success`, a tarefa está vaga demais.

Confira o arquivo com `npx ux-validate task validate`.
