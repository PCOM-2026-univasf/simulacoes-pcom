/* ==========================================================================
   Simulação 8 — Modulação Angular (FM / PM)
   Relação e Equivalência entre Moduladores:
     1. Integrador + Modulador PM ⟶ Modulador FM (Geração Indireta de FM)
     2. Diferenciador + Modulador FM ⟶ Modulador PM (Geração Indireta de PM)
     3. Validação Numérica e Demodulação pela Fase Instantânea

   Implementação em JavaScript puro sem dependências externas.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // --------------------------------------------------------------------------
  // 1. Constantes e Parâmetros Numéricos
  // --------------------------------------------------------------------------
  const FS = 200_000;           // Hz  - Taxa de amostragem (sobreamostragem de ~13x)
  const N = 8192;               // Amostras para a simulação (potência de 2 para FFT)
  const DURACAO = N / FS;       // Duração temporal total (~40.96 ms)
  const MARGEM_BORDA = 0.08;    // Fração descartada das pontas para o cálculo do miolo

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
    snr: el('valSnr'),
    mseFmEq: el('valMseFmEq'),
    msePmEq: el('valMsePmEq'),
    kpEq: el('valKpEq'),
    kfEq: el('valKfEq'),
    tableEqBody: el('tableEqBody'),
  };

  const canvasPlot1 = el('canvasPlot1');
  const canvasPlot2 = el('canvasPlot2');
  const canvasPlot3 = el('canvasPlot3');

  const titles = {
    p1: el('titlePlot1'),
    p2: el('titlePlot2'),
    p3: el('titlePlot3'),
  };

  const tags = {
    p1: el('tagPlot1'),
    p2: el('tagPlot2'),
    p3: el('tagPlot3'),
  };

  const legends = {
    p1: el('legendPlot1'),
    p2: el('legendPlot2'),
    p3: el('legendPlot3'),
  };

  // Botões de modo de visualização
  const viewBtns = {
    fm: el('viewBtnFm'),
    pm: el('viewBtnPm'),
    demod: el('viewBtnDemod'),
  };

  let modoAtual = 'fm'; // 'fm', 'pm' ou 'demod'

  // --------------------------------------------------------------------------
  // 3. Controle das Abas dos Diagramas de Blocos
  // --------------------------------------------------------------------------
  const tabBtns = document.querySelectorAll('.diagram-tabs .tab-btn');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      if (!targetId) return;

      tabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.diagram-panel').forEach((panel) => {
        panel.classList.remove('active');
      });

      const targetPanel = el(targetId);
      if (targetPanel) targetPanel.classList.add('active');
    });
  });

  // Alternância dos Modos de Visualização dos Gráficos
  viewBtns.fm.addEventListener('click', () => setModo('fm'));
  viewBtns.pm.addEventListener('click', () => setModo('pm'));
  viewBtns.demod.addEventListener('click', () => setModo('demod'));

  function setModo(modo) {
    modoAtual = modo;
    Object.values(viewBtns).forEach((b) => b.classList.remove('active'));
    viewBtns[modo].classList.add('active');
    recalcula();
  }

  // --------------------------------------------------------------------------
  // 4. Funções Matemáticas: FFT, Hilbert, Unwrap e Derivada
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
          re[b] = re[a] - vRe; im[b] = im[a] - vIm;
          re[a] += vRe;        im[a] += vIm;
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

  // Sinal Analítico e Fase Instantânea via Hilbert
  function faseInstantanea(x) {
    const n = x.length;
    const re = Float64Array.from(x);
    const im = new Float64Array(n);

    fft(re, im, false);

    // Multiplicador do sinal analítico: dobra frequências positivas, zera negativas
    const h = new Float64Array(n);
    h[0] = 1;
    h[n / 2] = 1;
    for (let i = 1; i < n / 2; i++) h[i] = 2;
    for (let i = 0; i < n; i++) {
      re[i] *= h[i];
      im[i] *= h[i];
    }

    fft(re, im, true);

    const fase = new Float64Array(n);
    for (let i = 0; i < n; i++) fase[i] = Math.atan2(im[i], re[i]);
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
  // 5. Geração dos Sinais e Modulação Direta vs Indireta
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
    p.kf = p.deltaF / p.am;            // Sensibilidade nominal de FM
    p.kpEq = 2 * Math.PI * p.kf;      // kp equivalente para transformar PM em FM
    p.kfEq = p.kp / (2 * Math.PI);    // kf equivalente para transformar FM em PM
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
        // Onda triangular simétrica com amplitude p.am
        const ciclo = (t[i] * p.fm) % 1;
        m[i] = p.am * (4 * Math.abs(ciclo - 0.5) - 1);
      } else if (p.tipo === 'square') {
        // Onda quadrada simétrica
        m[i] = Math.sin(faseMsg) >= 0 ? p.am : -p.am;
      } else {
        // Senoidal padrão
        m[i] = p.am * Math.cos(faseMsg);
      }
    }

    // 1. Sinal Integrado: x(t) = ∫₀ᵗ m(τ) dτ (regra do trapézio acumulada)
    const intM = new Float64Array(N);
    for (let i = 1; i < N; i++) {
      intM[i] = intM[i - 1] + 0.5 * (m[i] + m[i - 1]) * dt;
    }

    // 2. Sinal Diferenciado: y(t) = dm(t)/dt
    const derM = derivaCentral(m, dt);

    // ------------------------------------------------------------------------
    // Caso 1: FM Direto vs FM Indireto (Integrador + PM)
    // ------------------------------------------------------------------------
    // FM Direto: s_FM,dir(t) = Ac * cos(2π fc t + 2π kf ∫m dt)
    const sFmDireto = new Float64Array(N);
    // FM Indireto: Integrador + Modulador PM com kp_eq = 2π kf
    // s_FM,ind(t) = Ac * cos(2π fc t + kp_eq * x(t))
    const sFmIndireto = new Float64Array(N);

    for (let i = 0; i < N; i++) {
      const thetaPortadora = wc * t[i];
      sFmDireto[i] = Math.cos(thetaPortadora + 2 * Math.PI * p.kf * intM[i]);
      sFmIndireto[i] = Math.cos(thetaPortadora + p.kpEq * intM[i]);
    }

    // ------------------------------------------------------------------------
    // Caso 2: PM Direto vs PM Indireto (Diferenciador + FM)
    // ------------------------------------------------------------------------
    // PM Direto: s_PM,dir(t) = Ac * cos(2π fc t + kp m(t))
    const sPmDireto = new Float64Array(N);

    // PM Indireto: Diferenciador + Modulador FM com kf_eq = kp / (2π)
    // Integral de y(t) = dm/dt é m(t) - m(0). Ajustando a referência inicial m[0]:
    const intDerM = new Float64Array(N);
    for (let i = 1; i < N; i++) {
      intDerM[i] = intDerM[i - 1] + 0.5 * (derM[i] + derM[i - 1]) * dt;
    }
    const sPmIndireto = new Float64Array(N);

    for (let i = 0; i < N; i++) {
      const thetaPortadora = wc * t[i];
      sPmDireto[i] = Math.cos(thetaPortadora + p.kp * m[i]);
      sPmIndireto[i] = Math.cos(thetaPortadora + 2 * Math.PI * p.kfEq * (intDerM[i] + m[0]));
    }

    // Aplicação opcional de ruído AWGN
    if (p.noiseOn) {
      adicionaRuido(sFmDireto, p.snrDb, 101);
      adicionaRuido(sFmIndireto, p.snrDb, 101);
      adicionaRuido(sPmDireto, p.snrDb, 202);
      adicionaRuido(sPmIndireto, p.snrDb, 202);
    }

    return {
      t, m, intM, derM,
      sFmDireto, sFmIndireto,
      sPmDireto, sPmIndireto,
    };
  }

  // Cálculo de Métricas e MSE entre dois sinais
  function calculaMse(sig1, sig2) {
    const k = Math.floor(N * MARGEM_BORDA);
    let seTot = 0, seCen = 0, maxDiff = 0;
    for (let i = 0; i < N; i++) {
      const diff = sig1[i] - sig2[i];
      seTot += diff * diff;
      const absDiff = Math.abs(diff);
      if (absDiff > maxDiff) maxDiff = absDiff;
      if (i >= k && i < N - k) {
        seCen += diff * diff;
      }
    }
    return {
      mseTotal: seTot / N,
      mseCentral: seCen / (N - 2 * k),
      maxDiff,
    };
  }

  // --------------------------------------------------------------------------
  // 6. Desenho Gráfico em Canvas
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

    const padL = 60 * dpr, padR = 20 * dpr, padT = 18 * dpr, padB = 36 * dpr;
    const pw = W - padL - padR, ph = H - padT - padB;
    const escala = opts.escalaY || 1;

    // Limites dos dados
    const nAmostrasVis = opts.nPontos || opts.t.length;
    let yMin = Infinity, yMax = -Infinity;
    for (const s of opts.series) {
      for (let i = 0; i < nAmostrasVis; i++) {
        const v = s.data[i] * escala;
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      }
    }
    if (!isFinite(yMin) || yMin === yMax) {
      yMin -= 1; yMax += 1;
    }
    const folga = (yMax - yMin) * 0.1;
    yMin -= folga; yMax += folga;

    const tMaxMs = opts.t[nAmostrasVis - 1] * 1000;
    const xPix = (i) => padL + (i / (nAmostrasVis - 1)) * pw;
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
      ctx.lineWidth = (s.largura || 1.8) * dpr;
      ctx.setLineDash(s.traco ? [6 * dpr, 4 * dpr] : []);
      ctx.beginPath();
      for (let i = 0; i < nAmostrasVis; i++) {
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
  // 7. Atualização do Dashboard e Renderização
  // --------------------------------------------------------------------------
  let ultimoCalculo = null;
  const css = (nome) => getComputedStyle(document.body).getPropertyValue(nome).trim();

  function recalcula() {
    const p = lerParametros();

    // Rótulos dos controles
    displays.fc.textContent = (p.fc / 1000).toFixed(1) + ' kHz';
    displays.fm.textContent = p.fm + ' Hz';
    displays.am.textContent = p.am.toFixed(2) + ' V';
    displays.df.textContent = (p.deltaF / 1000).toFixed(1) + ' kHz';
    displays.kp.textContent = p.kp.toFixed(2) + ' rad/V';
    displays.snr.textContent = p.snrDb + ' dB';
    inputs.snr.disabled = !p.noiseOn;

    displays.kpEq.textContent = p.kpEq.toFixed(1) + ' rad/V';
    displays.kfEq.textContent = p.kfEq.toFixed(2) + ' Hz/V';

    // Executa simulação
    const dados = gerarSinais(p);

    // Métricas de equivalência entre direto e indireto
    const mseFm = calculaMse(dados.sFmDireto, dados.sFmIndireto);
    const msePm = calculaMse(dados.sPmDireto, dados.sPmIndireto);

    displays.mseFmEq.textContent = mseFm.mseCentral.toExponential(2);
    displays.msePmEq.textContent = msePm.mseCentral.toExponential(2);

    // Tabela de Validação de Equivalência
    displays.tableEqBody.innerHTML = `
      <tr>
        <td class="tag-fm">FM Direto &times; Integrador + PM</td>
        <td>k_p = 2&pi; k_f &rArr; s_FM,dir(t) &equiv; s_FM,ind(t)</td>
        <td>${mseFm.mseTotal.toExponential(2)}</td>
        <td>${mseFm.mseCentral.toExponential(2)}</td>
        <td>${mseFm.maxDiff.toExponential(2)}</td>
        <td class="tag-ok">&check; IDÊNTICOS</td>
      </tr>
      <tr>
        <td class="tag-pm">PM Direto &times; Diferenciador + FM</td>
        <td>k_f = k_p / (2&pi;) &rArr; s_PM,dir(t) &equiv; s_PM,ind(t)</td>
        <td>${msePm.mseTotal.toExponential(2)}</td>
        <td>${msePm.mseCentral.toExponential(2)}</td>
        <td>${msePm.maxDiff.toExponential(2)}</td>
        <td class="tag-ok">&check; IDÊNTICOS</td>
      </tr>
    `;

    // Extrai fase e frequência instantânea para os gráficos
    const faseFmDir = faseInstantanea(dados.sFmDireto);
    const fiFmDir = derivaCentral(faseFmDir, 1 / FS);
    for (let i = 0; i < N; i++) fiFmDir[i] /= (2 * Math.PI);

    const faseFmInd = faseInstantanea(dados.sFmIndireto);
    const fiFmInd = derivaCentral(faseFmInd, 1 / FS);
    for (let i = 0; i < N; i++) fiFmInd[i] /= (2 * Math.PI);

    const fasePmDir = faseInstantanea(dados.sPmDireto);
    const desvioPmDir = new Float64Array(N);
    const fasePmInd = faseInstantanea(dados.sPmIndireto);
    const desvioPmInd = new Float64Array(N);
    let somaDir = 0, somaInd = 0;
    for (let i = 0; i < N; i++) {
      desvioPmDir[i] = fasePmDir[i] - 2 * Math.PI * p.fc * dados.t[i];
      desvioPmInd[i] = fasePmInd[i] - 2 * Math.PI * p.fc * dados.t[i];
      somaDir += desvioPmDir[i];
      somaInd += desvioPmInd[i];
    }
    const medDir = somaDir / N, medInd = somaInd / N;
    for (let i = 0; i < N; i++) {
      desvioPmDir[i] -= medDir;
      desvioPmInd[i] -= medInd;
    }

    // Demodulação para o modo demod
    const mRecFm = new Float64Array(N);
    const mRecPm = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      mRecFm[i] = (fiFmInd[i] - p.fc) / p.kf;
      mRecPm[i] = desvioPmInd[i] / p.kp;
    }

    ultimoCalculo = {
      p, dados,
      fiFmDir, fiFmInd,
      desvioPmDir, desvioPmInd,
      mRecFm, mRecPm,
    };

    redesenha();
  }

  function redesenha() {
    if (!ultimoCalculo) return;
    const { p, dados, fiFmDir, fiFmInd, desvioPmDir, desvioPmInd, mRecFm, mRecPm } = ultimoCalculo;
    const t = dados.t;

    // Número de amostras visíveis para zoom nos gráficos de RF (~3 períodos de fm)
    const nZoom = Math.min(N, Math.round((3.0 / p.fm) * FS));

    if (modoAtual === 'fm') {
      // ----------------------------------------------------------------------
      // Modo Equivalência FM: Integrador + Modulador PM ⟶ FM
      // ----------------------------------------------------------------------
      titles.p1.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> Entrada: Mensagem m(t) e Sinal Integrado x(t) = &int; m(&tau;) d&tau;`;
      tags.p1.textContent = 'm(t) e ∫m dt × tempo [ms]';
      legends.p1.innerHTML = `
        <span style="color: var(--signal)"><span class="swatch" style="background: var(--signal)"></span> m(t) Mensagem original</span>
        <span style="color: var(--processed)"><span class="swatch dashed"></span> x(t) = &int; m(&tau;) d&tau; (Entrada do Modulador PM)</span>
      `;

      titles.p2.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12h3l3-9 6 18 3-9h4"/></svg> RF: s_FM Direto &times; s_FM Indireto (Integrador + PM)`;
      tags.p2.textContent = 's_FM(t) [V] × tempo [ms]';
      legends.p2.innerHTML = `
        <span style="color: var(--direct)"><span class="swatch" style="background: var(--direct)"></span> s_FM Direto (m(t) &rarr; Modulador FM)</span>
        <span style="color: var(--indirect)"><span class="swatch dashed"></span> s_FM Indireto (&int;m &rarr; Modulador PM) [Sobreposto]</span>
      `;

      titles.p3.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Frequência Instantânea f_i(t) = f_c + k_f &middot; m(t)`;
      tags.p3.textContent = 'f_i(t) [kHz] × tempo [ms]';
      legends.p3.innerHTML = `
        <span style="color: var(--direct)"><span class="swatch" style="background: var(--direct)"></span> f_i(t) Medida (FM Direto)</span>
        <span style="color: var(--indirect)"><span class="swatch dashed"></span> f_i(t) Medida (FM Indireto via PM)</span>
        <span style="color: var(--signal)"><span class="swatch dashed"></span> f_c + k_f &middot; m(t) (Teórica)</span>
      `;

      // Plot 1: m(t) e integral de m(t) normalizada
      const escalaInt = p.am / (Math.max(...dados.intM.map(Math.abs)) || 1);
      const intNorm = dados.intM.map((v) => v * escalaInt);
      desenhaGrafico(canvasPlot1, {
        t,
        nPontos: nZoom,
        series: [
          { data: dados.m, color: css('--signal'), largura: 2.2 },
          { data: intNorm, color: css('--processed'), largura: 1.8, traco: true },
        ],
      });

      // Plot 2: Formas de onda moduladas sobrepostas
      desenhaGrafico(canvasPlot2, {
        t,
        nPontos: nZoom,
        series: [
          { data: dados.sFmDireto, color: css('--direct'), largura: 2.5 },
          { data: dados.sFmIndireto, color: css('--indirect'), largura: 1.6, traco: true },
        ],
      });

      // Plot 3: Frequência instantânea f_i(t)
      const fiTeorica = new Float64Array(N);
      for (let i = 0; i < N; i++) fiTeorica[i] = p.fc + p.kf * dados.m[i];

      desenhaGrafico(canvasPlot3, {
        t,
        nPontos: nZoom,
        escalaY: 1 / 1000, // kHz
        series: [
          { data: fiFmDir, color: css('--direct'), largura: 2.2 },
          { data: fiFmInd, color: css('--indirect'), largura: 1.8, traco: true },
          { data: fiTeorica, color: css('--signal'), largura: 1.4, traco: true },
        ],
        linhasRef: [{ y: p.fc, cor: 'rgba(255,255,255,0.3)' }],
      });

    } else if (modoAtual === 'pm') {
      // ----------------------------------------------------------------------
      // Modo Equivalência PM: Diferenciador + Modulador FM ⟶ PM
      // ----------------------------------------------------------------------
      titles.p1.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> Entrada: Mensagem m(t) e Sinal Diferenciado y(t) = dm(t)/dt`;
      tags.p1.textContent = 'm(t) e dm/dt × tempo [ms]';
      legends.p1.innerHTML = `
        <span style="color: var(--signal)"><span class="swatch" style="background: var(--signal)"></span> m(t) Mensagem original</span>
        <span style="color: var(--processed)"><span class="swatch dashed"></span> y(t) = dm/dt (Entrada do Modulador FM)</span>
      `;

      titles.p2.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12h3l3-9 6 18 3-9h4"/></svg> RF: s_PM Direto &times; s_PM Indireto (Diferenciador + FM)`;
      tags.p2.textContent = 's_PM(t) [V] × tempo [ms]';
      legends.p2.innerHTML = `
        <span style="color: var(--direct)"><span class="swatch" style="background: var(--direct)"></span> s_PM Direto (m(t) &rarr; Modulador PM)</span>
        <span style="color: var(--indirect)"><span class="swatch dashed"></span> s_PM Indireto (dm/dt &rarr; Modulador FM) [Sobreposto]</span>
      `;

      titles.p3.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Desvio de Fase Instantâneo &phi;(t) = k_p &middot; m(t)`;
      tags.p3.textContent = 'ϕ(t) [rad] × tempo [ms]';
      legends.p3.innerHTML = `
        <span style="color: var(--direct)"><span class="swatch" style="background: var(--direct)"></span> &phi;(t) Medida (PM Direto)</span>
        <span style="color: var(--indirect)"><span class="swatch dashed"></span> &phi;(t) Medida (PM Indireto via FM)</span>
        <span style="color: var(--signal)"><span class="swatch dashed"></span> k_p &middot; m(t) (Teórica)</span>
      `;

      // Plot 1: m(t) e dm/dt normalizada
      const escalaDer = p.am / (Math.max(...dados.derM.map(Math.abs)) || 1);
      const derNorm = dados.derM.map((v) => v * escalaDer);
      desenhaGrafico(canvasPlot1, {
        t,
        nPontos: nZoom,
        series: [
          { data: dados.m, color: css('--signal'), largura: 2.2 },
          { data: derNorm, color: css('--processed'), largura: 1.8, traco: true },
        ],
      });

      // Plot 2: Formas de onda moduladas sobrepostas
      desenhaGrafico(canvasPlot2, {
        t,
        nPontos: nZoom,
        series: [
          { data: dados.sPmDireto, color: css('--direct'), largura: 2.5 },
          { data: dados.sPmIndireto, color: css('--indirect'), largura: 1.6, traco: true },
        ],
      });

      // Plot 3: Desvio de fase instantâneo
      const faseTeorica = new Float64Array(N);
      for (let i = 0; i < N; i++) faseTeorica[i] = p.kp * dados.m[i];

      desenhaGrafico(canvasPlot3, {
        t,
        nPontos: nZoom,
        series: [
          { data: desvioPmDir, color: css('--direct'), largura: 2.2 },
          { data: desvioPmInd, color: css('--indirect'), largura: 1.8, traco: true },
          { data: faseTeorica, color: css('--signal'), largura: 1.4, traco: true },
        ],
      });

    } else {
      // ----------------------------------------------------------------------
      // Modo Demodulação e Recuperação
      // ----------------------------------------------------------------------
      titles.p1.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> Validação: Mensagem Original &times; Recuperada da Geração Indireta`;
      tags.p1.textContent = 'm(t) [V] × tempo [ms]';
      legends.p1.innerHTML = `
        <span style="color: var(--signal)"><span class="swatch" style="background: var(--signal)"></span> m(t) Original</span>
        <span style="color: var(--direct)"><span class="swatch dashed"></span> m(t) Recuperado (FM Indireto)</span>
        <span style="color: var(--indirect)"><span class="swatch dashed"></span> m(t) Recuperado (PM Indireto)</span>
      `;

      titles.p2.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12h3l3-9 6 18 3-9h4"/></svg> Sinais Modulados RF Recebidos no Demodulador`;
      tags.p2.textContent = 's(t) [V] × tempo [ms]';
      legends.p2.innerHTML = `
        <span style="color: var(--direct)"><span class="swatch" style="background: var(--direct)"></span> s_FM Indireto</span>
        <span style="color: var(--indirect)"><span class="swatch dashed"></span> s_PM Indireto</span>
      `;

      titles.p3.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Frequência Instantânea f_i(t) Medida do Sinal FM`;
      tags.p3.textContent = 'f_i(t) [kHz] × tempo [ms]';
      legends.p3.innerHTML = `
        <span style="color: var(--direct)"><span class="swatch" style="background: var(--direct)"></span> f_i(t) do FM Indireto</span>
        <span style="color: var(--signal)"><span class="swatch dashed"></span> Referência Teórica f_c + k_f &middot; m(t)</span>
      `;

      // Plot 1: Mensagens recuperadas
      desenhaGrafico(canvasPlot1, {
        t,
        nPontos: nZoom,
        series: [
          { data: dados.m, color: css('--signal'), largura: 2.5 },
          { data: mRecFm, color: css('--direct'), largura: 1.8, traco: true },
          { data: mRecPm, color: css('--indirect'), largura: 1.8, traco: true },
        ],
      });

      // Plot 2: Sinais modulados
      desenhaGrafico(canvasPlot2, {
        t,
        nPontos: nZoom,
        series: [
          { data: dados.sFmIndireto, color: css('--direct'), largura: 1.8 },
          { data: dados.sPmIndireto, color: css('--indirect'), largura: 1.8, traco: true },
        ],
      });

      // Plot 3: Frequência instantânea FM
      const fiTeorica = new Float64Array(N);
      for (let i = 0; i < N; i++) fiTeorica[i] = p.fc + p.kf * dados.m[i];

      desenhaGrafico(canvasPlot3, {
        t,
        nPontos: nZoom,
        escalaY: 1 / 1000,
        series: [
          { data: fiFmInd, color: css('--direct'), largura: 2.2 },
          { data: fiTeorica, color: css('--signal'), largura: 1.4, traco: true },
        ],
        linhasRef: [{ y: p.fc, cor: 'rgba(255,255,255,0.3)' }],
      });
    }
  }

  // --------------------------------------------------------------------------
  // 8. Eventos de Entrada e Exportação
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

  el('btnPngPlot1').addEventListener('click', () => exportaPng(canvasPlot1, 'simulacao8_grafico1.png'));
  el('btnPngPlot2').addEventListener('click', () => exportaPng(canvasPlot2, 'simulacao8_grafico2_rf.png'));
  el('btnPngPlot3').addEventListener('click', () => exportaPng(canvasPlot3, 'simulacao8_grafico3_inst.png'));

  const resizeObs = new ResizeObserver(() => redesenha());
  resizeObs.observe(canvasPlot1);
  resizeObs.observe(canvasPlot2);
  resizeObs.observe(canvasPlot3);

  // Inicialização
  recalcula();
});
