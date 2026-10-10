import { useLayoutEffect, useState } from "react";

const RATIO = 16 / 9;
const GAP = 16;
/** Abaixo disso a grade não encolhe mais: passa a rolar */
const MIN_WIDTH = 200;
/** Quadros não passam disso (um só quadro numa tela grande vira um painel enorme) */
const MAX_WIDTH = 960;
const MAX_WIDTH_SOLO = 720;

export interface FitGrid {
  columns: number;
  width: number;
  height: number;
}

/**
 * Grade de quadros 16:9 que cabe na área (como Meet/Teams): testa de 1 a N
 * colunas e fica com a que deixa cada quadro maior sem passar da altura.
 */
export function useFitGrid(el: HTMLElement | null, count: number): FitGrid | null {
  const [fit, setFit] = useState<FitGrid | null>(null);

  useLayoutEffect(() => {
    if (!el || count === 0) return;
    const compute = () => {
      const style = getComputedStyle(el);
      const W = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const H = el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      if (W <= 0 || H <= 0) return;
      let best: FitGrid = { columns: 1, width: 0, height: 0 };
      for (let columns = 1; columns <= count; columns++) {
        const rows = Math.ceil(count / columns);
        const byWidth = (W - GAP * (columns - 1)) / columns;
        const byHeight = ((H - GAP * (rows - 1)) / rows) * RATIO;
        const width = Math.min(byWidth, byHeight);
        if (width > best.width) best = { columns, width, height: width / RATIO };
      }
      // Área pequena demais: mantém um tamanho mínimo e deixa rolar
      if (best.width < MIN_WIDTH) {
        const columns = Math.max(1, Math.floor((W + GAP) / (MIN_WIDTH + GAP)));
        const width = Math.min(MIN_WIDTH, (W - GAP * (columns - 1)) / columns);
        best = { columns, width, height: width / RATIO };
      }
      const max = count === 1 ? MAX_WIDTH_SOLO : MAX_WIDTH;
      if (best.width > max) best = { ...best, width: max, height: max / RATIO };
      setFit({ columns: best.columns, width: Math.floor(best.width), height: Math.floor(best.height) });
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, count]);

  return fit;
}
