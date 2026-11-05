# Color vision (color blindness)

About 1 in 12 men and 1 in 200 women have some form of color blindness. The most common types:

| Type | What changes |
|---|---|
| Deuteranopia | No green cones: red and green look alike (brownish yellow) |
| Protanopia | No red cones: red and green look alike, and red looks much darker |
| Tritanopia | No blue cones (rare): blue and green, and yellow and pink, look alike |

## What `npx ux-validate check` already does

- Screenshots of each page as seen with each type, in `<run folder>/color-vision/`.
- `check:color` findings: text that loses contrast (`cvd-contrast`), indicators without text that look the same (`cvd-indicators`) and a selected/active state shown only by color (`cvd-state`). They count only for personas with `vision: color-blind`.

## Testing as a color-blind persona

1. Compare `color-vision/<page>-normal.jpg` with the simulated images. Anything that disappears or looks the same is information the persona loses.
2. Simulate in the browser while navigating: run this with `browser_evaluate`, changing `type` (`protanopia`, `deuteranopia`, `tritanopia`), then use `browser_take_screenshot`:

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

To turn it off: `document.documentElement.style.filter = ''`.

3. Look for what the checks can't catch: charts and maps (series told apart only by color), form errors shown only as a red border, required fields marked only by a red asterisk, links inside text shown only by color, success/error messages in green/red without an icon or words.
4. Record findings with `category: "accessibility"`, `heuristic: "WCAG 1.4.1 (Use of Color)"` and, in `evidence.screenshot`, the simulated image.
