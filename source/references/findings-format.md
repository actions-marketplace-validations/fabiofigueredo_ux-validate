# Formato do findings.json

Arquivo escrito pelo agente em `.persona-qa/runs/<execução>/findings.json`. O comando `persona-qa report` junta este arquivo com o `checks.json` para gerar o relatório.

```json
{
  "kind": "agent",
  "createdAt": "2026-11-03T14:32:00Z",
  "url": "http://localhost:3000",
  "agent": { "tool": "claude-code", "model": "nome do modelo, se souber" },
  "personas": [
    {
      "id": "dona-maria",
      "name": "Dona Maria",
      "viewport": "mobile",
      "summary": "Uma ou duas frases sobre a experiência geral dela, incluindo limitações do teste.",
      "goals": [
        {
          "goal": "Encontrar o preço do plano mais barato",
          "outcome": "success",
          "steps": 4,
          "path": ["http://localhost:3000/", "http://localhost:3000/planos"],
          "notes": "Achou pelo menu, mas hesitou porque o item se chama 'Pricing'.",
          "blockers": []
        }
      ]
    }
  ],
  "findings": [
    {
      "id": "A001",
      "category": "content",
      "severity": "medium",
      "title": "Menu usa 'Pricing' em vez de 'Preços'",
      "description": "O que acontece, para quem e por que atrapalha. Escreva para quem vai corrigir.",
      "personas": ["dona-maria"],
      "page": "http://localhost:3000/",
      "viewport": "mobile",
      "heuristic": "Nielsen #2: correspondência com o mundo real",
      "evidence": {
        "screenshot": "screenshots/dona-maria-menu-pricing.png",
        "selector": "nav a[href='/planos']",
        "snippet": "<a href=\"/planos\">Pricing</a>"
      },
      "suggestion": "Troque o rótulo por 'Preços' ou 'Planos e preços'.",
      "sourceHint": { "file": "src/components/Header.tsx", "line": 18 },
      "confidence": "confirmed",
      "relatedChecks": []
    }
  ]
}
```

## Campos

| Campo | Valores | Observação |
|---|---|---|
| `outcome` | `success`, `partial`, `fail` | `partial` = cumpriu com ajuda de sorte ou sem certeza de ter conseguido |
| `blockers` | ids de achados | Achados que impediram ou atrasaram o objetivo |
| `category` | `content`, `navigation`, `ui` | Uma por achado; se tocar duas, escolha a da causa |
| `severity` | `critical`, `high`, `medium`, `low` | Ver tabela abaixo |
| `personas` | ids das personas afetadas | Obrigatório e não vazio |
| `evidence.screenshot` | caminho relativo à pasta da execução | Ao menos um campo de `evidence` é obrigatório |
| `sourceHint` | `{ file, line? }` | Só quando houver segurança; caso contrário omita |
| `confidence` | `confirmed`, `likely` | `confirmed` = reproduzido no navegador |
| `relatedChecks` | ids do `checks.json` (ex.: `C004`) | Quando o achado explica o impacto de uma checagem fixa; o relatório deixa de mostrar a checagem duplicada |

Ids dos achados do agente começam com `A` (`A001`, `A002`…). Os das checagens fixas começam com `C`.

## Gravidade

| Gravidade | Quando usar |
|---|---|
| `critical` | Impede a persona de cumprir um objetivo principal, ou expõe dados/erros graves |
| `high` | Cumpre o objetivo só com muito esforço, ou a maioria das personas tropeça nisso |
| `medium` | Atrasa, confunde ou passa má impressão, mas a persona segue em frente |
| `low` | Detalhe de polimento; perceptível, mas não atrapalha |
