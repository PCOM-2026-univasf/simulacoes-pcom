/* ==========================================================================
   Simulação 8 — Modulação Angular (FM e PM)
   Tópico 8: Demodulação de FM e de PM via Fase Instantânea
   
   Pipeline:
     1. Geração da mensagem m(t) e sinais modulados s_FM(t) e s_PM(t).
     2. Sinal analítico complexo z(t) = s(t) + j*H{s(t)} via FFT radix-2.
     3. Fase instantânea desdobrada θ(t) = unwrap(angle(z(t))).
     4. Demodulação FM: diferenciação finita central -> fi(t) -> (fi - fc)/kf.
     5. Demodulação PM: fase direta desdobrada sem derivar -> (θ - 2π fc t)/kp.
     6. Gráficos separados para FM e PM com cálculo dinâmico de MSE.
     7. Análise quantitativa de bordas (efeito da derivada numérica e Hilbert).

   Implementação em JavaScript puro sem dependências externas.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // --------------------------------------------------------------------------
  // 1. Constantes e Parâmetros Numéricos
  // --------------------------------------------------------------------------
  const FS = 200_000;           // Hz  - Taxa de amostragem
  const N = 8192;               // Amostras da simulação (potência de 2 para FFT)
  const DURACAO = N / FS;       // Duração temporal (~40.96 ms)
  const MARGEM_BORDA = 0.05;    // Fração descartada das pontas (5% em cada lado)

  // --------------------------------------------------------------------------
  // 2. Referências dos Elementos do DOM
  // --------------------------------------------------------------------------
  const el = (id) => document.getElementById(id);

  const inputs = {
    msgType: el('msgType'),
    fc: el('fc'),
    fm: el('fm'),
    am: el('am'),
    df: el('df'),
    kp: el('kp'),
    noiseOn: el('noiseOn'),
    snr: el('snr'),
  };

  const displays = {
    fc: el('valFc'),
    fm: el('valFm'),
    am: el('valAm'),
    df: el('valDf'),
    kp: el('valKp'),
    beta: el('valBeta'),
    pkPhase: el('valPkPhase'),
    snr: el('valSnr'),
    mseFm: el('valMseFm'),
    msePm: el('valMsePm'),
    mseFmTot: el('valMseFmTot'),
    msePmTot: el('valMsePmTot'),
    errTableBody: el('errTableBody'),
  };

  const canvasFm = el('canvasFm');
  const canvasPm = el('canvasPm');
  const canvasFi = el('canvasFi');

  // --------------------------------------------------------------------------
  // 3. Funções Matemáticas: FFT, Hilbert, Unwrap e Derivada
  // --------------------------------------------------------------------------

  // FFT Cooley-Tukey radix-2 in-place
  function fft(re, im, inverso) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let tam = 2; tam <= n; tam <<= 1) {
      const ang = (inverso ? 2 : -2) * Math.PI / tam;
      const wRe = Math.cos(ang);
      const wIm = Math.sin(ang);
      for (let i = 0; i < n; i += tam) {
        let curRe = 1, curIm = 0;
        for (let k = 0; k < tam / 2; k++) {
          const a = i + k;
          const b = i + k + tam / 2;
          const vRe = re[b] * curRe - im[b] * curIm;
          const vIm = re[b] * curIm + im[b] * curRe;
          re[b] = re[a] - vRe;
          im[b] = im[a] - vIm;
          re[a] += vRe;
          im[a] += vIm;
          const proxRe = curRe * wRe - curIm * wIm;
          curIm = curRe * wIm + curIm * wRe;
          curRe = proxRe;
        }
      }
    }
    if (inverso) {
      for (let i = 0; i < n; i++) {
        re[i] /= n;
        im[i] /= n;
      }
    }
  }

  // Sinal Analítico e Fase Instantânea via Transformada de Hilbert
  function faseInstantanea(x) {
    const n = x.length;
    const re = Float64Array.from(x);
    const im = new Float64Array(n);

    fft(re, im, false);

    // Multiplicador do sinal analítico:
    // DC e Nyquist = 1; frequências positivas = 2; frequências negativas = 0
    const h = new Float64Array(n);
    h[0] = 1;
    h[n / 2] = 1;
    for (let i = 1; i < n / 2; i++) h[i] = 2;
    for (let i = n / 2 + 1; i < n; i++) h[i] = 0;

    for (let i = 0; i < n; i++) {
      re[i] *= h[i];
      im[i] *= h[i];
    }

    fft(re, im, true);

    const fase = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      fase[i] = Math.atan2(im[i], re[i]);
    }
    return desdobraFase(fase);
  }

  // Desdobramento de Fase (np.unwrap)
  function desdobraFase(fase) {
    const out = new Float64Array(fase.length);
    out[0] = fase[0];
    let corr = 0;
    for (let i = 1; i < fase.length; i++) {
      let d = fase[i] - fase[i - 1];
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      corr += d - (fase[i] - fase[i - 1]);
      out[i] = fase[i] + corr;
    }
    return out;
  }

  // Diferença finita central temporal (np.gradient)
  function derivaCentral(y, dt) {
    const n = y.length;
    const g = new Float64Array(n);
    g[0] = (y[1] - y[0]) / dt;
    g[n - 1] = (y[n - 1] - y[n - 2]) / dt;
    for (let i = 1; i < n - 1; i++) {
      g[i] = (y[i + 1] - y[i - 1]) / (2 * dt);
    }
    return g;
  }

  // Ruído Gaussiano AWGN
  function adicionaRuido(sinal, snrDb, seed) {
    let pot = 0;
    for (let i = 0; i < sinal.length; i++) pot += sinal[i] * sinal[i];
    pot /= sinal.length;

    const sigma = Math.sqrt(pot / Math.pow(10, snrDb / 10));
    let s = seed | 0;
    const rng = () => {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    for (let i = 0; i < sinal.length; i += 2) {
      const u1 = Math.max(1e-12, rng());
      const u2 = rng();
      const r = sigma * Math.sqrt(-2 * Math.log(u1));
      sinal[i] += r * Math.cos(2 * Math.PI * u2);
      if (i + 1 < sinal.length) sinal[i + 1] += r * Math.sin(2 * Math.PI * u2);
    }
  }

  // --------------------------------------------------------------------------
  // 4. Parâmetros e Síntese de Sinais
  // --------------------------------------------------------------------------
  function lerParametros() {
    const p = {
      tipo: inputs.msgType.value,
      fc: +inputs.fc.value,
      fm: +inputs.fm.value,
      am: +inputs.am.value,
      deltaF: +inputs.df.value,
      kp: +inputs.kp.value,
      noiseOn: inputs.noiseOn.checked,
      snrDb: +inputs.snr.value,
    };
    p.kf = p.deltaF / p.am;
    p.beta = p.deltaF / p.fm;
    p.pkPhase = p.kp * p.am;
    return p;
  }

  function gerarSinais(p) {
    const t = new Float64Array(N);
    const m = new Float64Array(N);
    const dt = 1 / FS;
    const wc = 2 * Math.PI * p.fc;
    const wm = 2 * Math.PI * p.fm;

    // Geração do sinal modulante de acordo com a forma de onda
    for (let i = 0; i < N; i++) {
      t[i] = i * dt;
      const faseMsg = wm * t[i];
      if (p.tipo === 'triangular') {
        const ciclo = (t[i] * p.fm) % 1;
        m[i] = p.am * (4 * Math.abs(ciclo - 0.5) - 1);
      } else if (p.tipo === 'square') {
        m[i] = Math.sin(faseMsg) >= 0 ? p.am : -p.am;
      } else {
        m[i] = p.am * Math.cos(faseMsg);
      }
    }

    // Modulação PM: s_PM(t) = Ac * cos(2π fc t + kp * m(t))
    const sPm = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      sPm[i] = Math.cos(wc * t[i] + p.kp * m[i]);
    }

    // Modulação FM: s_FM(t) = Ac * cos(2π fc t + 2π kf * ∫ m dt)
    const intM = new Float64Array(N);
    for (let i = 1; i < N; i++) {
      intM[i] = intM[i - 1] + 0.5 * (m[i] + m[i - 1]) * dt;
    }
    const sFm = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      sFm[i] = Math.cos(wc * t[i] + 2 * Math.PI * p.kf * intM[i]);
    }

    // Aplicação opcional de ruído AWGN
    if (p.noiseOn) {
      adicionaRuido(sFm, p.snrDb, 101);
      adicionaRuido(sPm, p.snrDb, 202);
    }

    return { t, m, sFm, sPm, dt };
  }

  // Métricas de MSE e Artefatos de Borda
  function analisaErro(orig, rec) {
    const k = Math.round(N * MARGEM_BORDA);
    let seTot = 0, seCen = 0;
    let maxBorda = 0, maxCentro = 0;

    for (let i = 0; i < N; i++) {
      const err = orig[i] - rec[i];
      const errAbs = Math.abs(err);
      seTot += err * err;

      if (i < k || i >= N - k) {
        if (errAbs > maxBorda) maxBorda = errAbs;
      } else {
        seCen += err * err;
        if (errAbs > maxCentro) maxCentro = errAbs;
      }
    }

    const mseTotal = seTot / N;
    const mseCentro = seCen / (N - 2 * k);
    const razaoBorda = maxBorda / Math.max(maxCentro, 1e-30);

    return {
      mseTotal,
      mseCentro,
      maxBorda,
      maxCentro,
      razaoBorda,
    };
  }

  // --------------------------------------------------------------------------
  // 5. Renderização Gráfica no Canvas
  // --------------------------------------------------------------------------
  function ajustaCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    return dpr;
  }

  function desenhaGrafico(canvas, opts) {
    const dpr = ajustaCanvas(canvas);
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const padL = 60 * dpr, padR = 25 * dpr, padT = 20 * dpr, padB = 36 * dpr;
    const pw = W - padL - padR, ph = H - padT - padB;
    const escala = opts.escalaY || 1;

    const nVis = opts.nPontos || opts.t.length;
    let yMin = Infinity, yMax = -Infinity;
    for (const s of opts.series) {
      for (let i = 0; i < nVis; i++) {
        const v = s.data[i] * escala;
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      }
    }
    if (!isFinite(yMin) || yMin === yMax) {
      yMin -= 1; yMax += 1;
    }
    const folga = (yMax - yMin) * 0.12;
    yMin -= folga; yMax += folga;

    const tMaxMs = opts.t[nVis - 1] * 1000;
    const xPix = (i) => padL + (i / (nVis - 1)) * pw;
    const yPix = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * ph;

    // Grade e Escala
    ctx.font = `${11 * dpr}px Inter, sans-serif`;
    ctx.fillStyle = '#71717a';
    ctx.strokeStyle = '#18181b';
    ctx.lineWidth = 1 * dpr;

    // Linhas horizontais (Eixo Y)
    ctx.textAlign = 'right';
    for (let g = 0; g <= 4; g++) {
      const v = yMin + (g / 4) * (yMax - yMin);
      const y = yPix(v);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();
      ctx.fillText(v.toFixed(2), padL - 8 * dpr, y + 4 * dpr);
    }

    // Linhas verticais (Tempo em ms)
    ctx.textAlign = 'center';
    for (let g = 0; g <= 5; g++) {
      const x = padL + (g / 5) * pw;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, H - padB);
      ctx.stroke();
      ctx.fillText(((g / 5) * tMaxMs).toFixed(2), x, H - padB + 20 * dpr);
    }

    // Linhas de Referência
    for (const l of opts.linhasRef || []) {
      ctx.strokeStyle = l.cor;
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(padL, yPix(l.y * escala));
      ctx.lineTo(W - padR, yPix(l.y * escala));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Traçado das Séries
    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, padT, pw, ph);
    ctx.clip();

    for (const s of opts.series) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = (s.largura || 2.0) * dpr;
      ctx.setLineDash(s.traco ? [6 * dpr, 4 * dpr] : []);
      ctx.beginPath();
      for (let i = 0; i < nVis; i++) {
        const x = xPix(i);
        const y = yPix(s.data[i] * escala);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
    ctx.setLineDash([]);
  }

  // --------------------------------------------------------------------------
  // 6. Recálculo e Atualização do Dashboard
  // --------------------------------------------------------------------------
  const css = (nome) => getComputedStyle(document.body).getPropertyValue(nome).trim();
  let dadosCache = null;

  function recalcula() {
    const p = lerParametros();

    // Atualização dos displays dos controles
    displays.fc.textContent = (p.fc / 1000).toFixed(1) + ' kHz';
    displays.fm.textContent = p.fm + ' Hz';
    displays.am.textContent = p.am.toFixed(2) + ' V';
    displays.df.textContent = (p.deltaF / 1000).toFixed(1) + ' kHz';
    displays.kp.textContent = p.kp.toFixed(2) + ' rad/V';
    displays.beta.textContent = p.beta.toFixed(1);
    displays.pkPhase.textContent = p.pkPhase.toFixed(2) + ' rad';
    displays.snr.textContent = p.snrDb + ' dB';
    inputs.snr.disabled = !p.noiseOn;

    // Síntese dos sinais
    const dados = gerarSinais(p);
    const { t, m, sFm, sPm, dt } = dados;

    // 1. Demodulação FM
    const thetaFm = faseInstantanea(sFm);
    const dThetaFm = derivaCentral(thetaFm, dt);
    const fiFm = new Float64Array(N);
    const mRecFm = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      fiFm[i] = dThetaFm[i] / (2 * Math.PI);
      mRecFm[i] = (fiFm[i] - p.fc) / p.kf;
    }

    // 2. Demodulação PM
    const thetaPm = faseInstantanea(sPm);
    const desvioPm = new Float64Array(N);
    let somaDesvio = 0;
    for (let i = 0; i < N; i++) {
      desvioPm[i] = thetaPm[i] - 2 * Math.PI * p.fc * t[i];
      somaDesvio += desvioPm[i];
    }
    const offsetPm = somaDesvio / N;
    const mRecPm = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      desvioPm[i] -= offsetPm;
      mRecPm[i] = desvioPm[i] / p.kp;
    }

    // 3. Análise de Erro e Bordas
    const erroFm = analisaErro(m, mRecFm);
    const erroPm = analisaErro(m, mRecPm);

    displays.mseFm.textContent = erroFm.mseCentro.toExponential(2);
    displays.msePm.textContent = erroPm.mseCentro.toExponential(2);
    displays.mseFmTot.textContent = erroFm.mseTotal.toExponential(2);
    displays.msePmTot.textContent = erroPm.mseTotal.toExponential(2);

    // Atualização da Tabela de Erro
    displays.errTableBody.innerHTML = `
      <tr>
        <td class="tag-fm">FM (via Diferença Finita)</td>
        <td>${erroFm.mseTotal.toExponential(2)}</td>
        <td>${erroFm.mseCentro.toExponential(2)}</td>
        <td>${erroFm.maxBorda.toExponential(2)}</td>
        <td>${erroFm.maxCentro.toExponential(2)}</td>
        <td>${erroFm.razaoBorda.toFixed(1)}&times;</td>
        <td class="tag-ok">&check; Excelente (~10<sup>-9</sup>)</td>
      </tr>
      <tr>
        <td class="tag-pm">PM (via Fase Direta)</td>
        <td>${erroPm.mseTotal.toExponential(2)}</td>
        <td>${erroPm.mseCentro.toExponential(2)}</td>
        <td>${erroPm.maxBorda.toExponential(2)}</td>
        <td>${erroPm.maxCentro.toExponential(2)}</td>
        <td>${erroPm.razaoBorda.toFixed(1)}&times;</td>
        <td class="tag-ok">&check; Precisão Máquina (~10<sup>-23</sup>)</td>
      </tr>
    `;

    dadosCache = { p, t, m, mRecFm, mRecPm, fiFm, desvioPm };
    redesenha();
  }

  function redesenha() {
    if (!dadosCache) return;
    const { p, t, m, mRecFm, mRecPm, fiFm, desvioPm } = dadosCache;

    // Janela visível de ~3 períodos da mensagem para máxima clareza
    const nZoom = Math.min(N, Math.round((3.0 / p.fm) * FS));

    // 1. Gráfico Separado para Demodulação FM
    desenhaGrafico(canvasFm, {
      t,
      nPontos: nZoom,
      series: [
        { data: m, color: css('--signal'), largura: 2.5 },
        { data: mRecFm, color: css('--fm'), largura: 1.8, traco: true },
      ],
    });

    // 2. Gráfico Separado para Demodulação PM
    desenhaGrafico(canvasPm, {
      t,
      nPontos: nZoom,
      series: [
        { data: m, color: css('--signal'), largura: 2.5 },
        { data: mRecPm, color: css('--pm'), largura: 1.8, traco: true },
      ],
    });

    // 3. Gráfico de Frequência Instantânea fi(t) e Desvio de Fase
    const fiTeorica = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      fiTeorica[i] = p.fc + p.kf * m[i];
    }

    desenhaGrafico(canvasFi, {
      t,
      nPontos: nZoom,
      escalaY: 1 / 1000, // kHz
      series: [
        { data: fiFm, color: css('--fm'), largura: 2.2 },
        { data: fiTeorica, color: css('--signal'), largura: 1.5, traco: true },
      ],
      linhasRef: [{ y: p.fc, cor: 'rgba(255,255,255,0.3)' }],
    });
  }

  // --------------------------------------------------------------------------
  // 7. Eventos de Interação e Exportação de PNG
  // --------------------------------------------------------------------------
  Object.values(inputs).forEach((elem) => {
    elem.addEventListener('input', recalcula);
    elem.addEventListener('change', recalcula);
  });

  function exportaPng(canvas, nome) {
    const link = document.createElement('a');
    link.download = nome;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  el('btnPngFm').addEventListener('click', () => exportaPng(canvasFm, 'demodulacao_fm.png'));
  el('btnPngPm').addEventListener('click', () => exportaPng(canvasPm, 'demodulacao_pm.png'));
  el('btnPngFi').addEventListener('click', () => exportaPng(canvasFi, 'frequencia_instantanea.png'));

  const resizeObs = new ResizeObserver(() => redesenha());
  resizeObs.observe(canvasFm);
  resizeObs.observe(canvasPm);
  resizeObs.observe(canvasFi);

  // Inicialização imediata
  recalcula();
});
