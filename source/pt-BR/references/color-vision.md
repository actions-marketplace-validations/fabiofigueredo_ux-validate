# Visão de cores (daltonismo)

Cerca de 1 em cada 12 homens e 1 em cada 200 mulheres têm algum tipo de daltonismo. Os tipos mais comuns:

| Tipo | O que muda |
|---|---|
| Deuteranopia | Sem cones do verde: vermelho e verde ficam parecidos (amarelo amarronzado) |
| Protanopia | Sem cones do vermelho: vermelho e verde ficam parecidos, e o vermelho fica bem mais escuro |
| Tritanopia | Sem cones do azul (raro): azul e verde, e amarelo e rosa, ficam parecidos |

## O que o `npx ux-validate check` já faz

- Capturas de cada página como cada tipo a enxerga, em `<pasta da execução>/color-vision/`.
- Achados `check:color`: texto que perde contraste (`cvd-contrast`), indicadores sem texto que ficam iguais (`cvd-indicators`) e estado selecionado/ativo mostrado só pela cor (`cvd-state`). Eles contam só para as personas com `vision: daltonismo` (ou `color-blind`).

## Testando como uma persona daltônica

1. Compare `color-vision/<página>-normal.jpg` com as imagens simuladas. O que some ou fica igual é informação que a persona perde.
2. Simule no navegador enquanto navega: rode isto com `browser_evaluate`, trocando `type` (`protanopia`, `deuteranopia`, `tritanopia`), e depois use `browser_take_screenshot`:

```js
(() => {
  const type = 'deuteranopia';
  const M = {
    protanopia: '0.152286 1.052583 -0.204868 0 0 0.114503 0.786281 0.099216 0 0 -0.003882 -0.048116 1.051998 0 0 0 0 0 1 0',
    deuteranopia: '0.367322 0.860646 -0.227968 0 0 0.280085 0.672501 0.047413 0 0 -0.01182 0.04294 0.968881 0 0 0 0 0 1 0',
    tritanopia: '1.255528 -0.076749 -0.178779 0 0 -0.078411 0.930809 0.147602 0 0 0.004733 0.691367 0.3039 0 0 0 0 0 1 0',
  };
  document.getElementById('uxv-cvd')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<svg id="uxv-cvd" style="position:absolute;width:0;height:0"><filter id="uxv-cvd-f"><feColorMatrix type="matrix" values="${M[type]}"/></filter></svg>`);
  document.documentElement.style.filter = 'url(#uxv-cvd-f)';
})();
```

Para desligar: `document.documentElement.style.filter = ''`.

3. Procure o que as checagens não pegam: gráficos e mapas (séries diferenciadas só pela cor), erros de formulário mostrados só com borda vermelha, campos obrigatórios marcados só com asterisco vermelho, links no meio do texto destacados só pela cor, mensagens de sucesso/erro em verde/vermelho sem ícone nem palavra.
4. Registre os achados com `category: "accessibility"`, `heuristic: "WCAG 1.4.1 (Uso de cor)"` e, em `evidence.screenshot`, a imagem simulada.
