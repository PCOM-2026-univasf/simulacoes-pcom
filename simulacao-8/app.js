/* ==========================================================================
   Simulação 8 — Modulação Angular (FM / PM)
   Tópico 8 · Demodulação pela fase instantânea

   Pipeline (o mesmo do script Python topico8_demodulacao.py):
     1. gera m(t), s_PM(t) e s_FM(t) pela definição;
     2. sinal analítico via Hilbert (FFT: zera frequências negativas);
     3. fase instantânea = unwrap(angle(analítico));
     4. FM  -> deriva a fase -> frequência instantânea -> (f_i - fc) / kf;
        PM  -> fase - 2*pi*fc*t -> divide por kp;
     5. compara com m(t) original (MSE total e em janela central).
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  'use strict';

  // ------------------------------------------------------------------------
  // 0. Constantes de simulação
  // ------------------------------------------------------------------------
  const FS = 200_000;          // Hz  - frequência de amostragem (Tópico 1)
  const N = 8192;              // amostras (potência de 2 exigida pela FFT)
  const DURACAO = N / FS;      // s   - ~40,96 ms
  const MARGEM_BORDA = 0.05;   // fração descartada em cada ponta (janela central)

  // ------------------------------------------------------------------------
  // 1. Referências de DOM
  // ------------------------------------------------------------------------
  const el = (id) => document.getElementById(id);

  const inputs = {
    fc: el('fc'), fm: el('fm'), am: el('am'), df: el('df'), kp: el('kp'),
    noiseOn: el('noiseOn'), snr: el('snr'),
  };

  const out = {
    fc: el('valFc'), fm: el('valFm'), am: el('valAm'), df: el('valDf'),
    kp: el('valKp'), snr: el('valSnr'), beta: el('valBeta'),
    pkPhase: el('valPkPhase'), mseFm: el('valMseFm'), msePm: el('valMsePm'),
    cardMseFm: el('cardMseFm'), cardMsePm: el('cardMsePm'),
    errTableBody: el('errTableBody'),
  };

  const canvasMsg = el('canvasMsg');
  const canvasFi = el('canvasFi');

  // ------------------------------------------------------------------------
  // 2. FFT iterativa (Cooley-Tukey, radix-2, in-place)
  //    `re`/`im` são modificados no lugar. `inverso` aplica a IFFT (com 1/N).
  // ------------------------------------------------------------------------
  function fft(re, im, inverso) {
    const n = re.length;

    // Reordenação bit-reversa
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
      for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
    }
  }

  // ------------------------------------------------------------------------
  // 3. Fase instantânea via sinal analítico (equivalente a scipy.signal.hilbert)
  // ------------------------------------------------------------------------
  function faseInstantanea(x) {
    const n = x.length;
    const re = Float64Array.from(x);
    const im = new Float64Array(n);

    fft(re, im, false);

    // Multiplicador de Hilbert: mantém DC e Nyquist, dobra as positivas,
    // zera as negativas.
    const h = new Float64Array(n);
    h[0] = 1;
    h[n / 2] = 1;
    for (let i = 1; i < n / 2; i++) h[i] = 2;
    for (let i = 0; i < n; i++) { re[i] *= h[i]; im[i] *= h[i]; }

    fft(re, im, true);

    const fase = new Float64Array(n);
    for (let i = 0; i < n; i++) fase[i] = Math.atan2(im[i], re[i]);
    return desdobra(fase);
  }

  // Remove os saltos de +-2*pi (equivalente a np.unwrap)
  function desdobra(fase) {
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

  // Derivada por diferença finita central (equivalente a np.gradient)
  function gradiente(y, dt) {
    const n = y.length;
    const g = new Float64Array(n);
    g[0] = (y[1] - y[0]) / dt;
    g[n - 1] = (y[n - 1] - y[n - 2]) / dt;
    for (let i = 1; i < n - 1; i++) g[i] = (y[i + 1] - y[i - 1]) / (2 * dt);
    return g;
  }

  // ------------------------------------------------------------------------
  // 4. Gerador de ruído gaussiano branco com potência controlada por SNR
  // ------------------------------------------------------------------------
  function rngMulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function adicionaRuido(sinal, snrDb, seed) {
    let pot = 0;
    for (let i = 0; i < sinal.length; i++) pot += sinal[i] * sinal[i];
    pot /= sinal.length;

    const sigma = Math.sqrt(pot / Math.pow(10, snrDb / 10));
    const rand = rngMulberry32(seed);
    for (let i = 0; i < sinal.length; i += 2) {
      // Box-Muller: dois valores gaussianos por iteração
      const u1 = Math.max(1e-12, rand());
      const u2 = rand();
      const r = sigma * Math.sqrt(-2 * Math.log(u1));
      sinal[i] += r * Math.cos(2 * Math.PI * u2);
      if (i + 1 < sinal.length) sinal[i + 1] += r * Math.sin(2 * Math.PI * u2);
    }
  }

  // ------------------------------------------------------------------------
  // 5. Geração dos sinais e demodulação
  // ------------------------------------------------------------------------
  function lerParametros() {
    const p = {
      fc: +inputs.fc.value,
      fm: +inputs.fm.value,
      am: +inputs.am.value,
      deltaF: +inputs.df.value,
      kp: +inputs.kp.value,
      noiseOn: inputs.noiseOn.checked,
      snrDb: +inputs.snr.value,
    };
    p.kf = p.deltaF / p.am;          // pico de kf*m(t) = deltaF  (Tópico 3)
    return p;
  }

  function gerarSinais(p) {
    const t = new Float64Array(N);
    const m = new Float64Array(N);
    const wc = 2 * Math.PI * p.fc;
    const wm = 2 * Math.PI * p.fm;
    for (let i = 0; i < N; i++) {
      t[i] = i / FS;
      m[i] = p.am * Math.cos(wm * t[i]);
    }

    // Integral de m(t) pela regra do trapézio acumulada (Tópico 3)
    const intM = new Float64Array(N);
    for (let i = 1; i < N; i++) intM[i] = intM[i - 1] + 0.5 * (m[i] + m[i - 1]) / FS;

    const sPM = new Float64Array(N);
    const sFM = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      sPM[i] = Math.cos(wc * t[i] + p.kp * m[i]);
      sFM[i] = Math.cos(wc * t[i] + 2 * Math.PI * p.kf * intM[i]);
    }

    if (p.noiseOn) {
      adicionaRuido(sFM, p.snrDb, 12345);
      adicionaRuido(sPM, p.snrDb, 67890);
    }

    return { t, m, sPM, sFM };
  }

  // FM: m(t) ~ (f_i(t) - fc) / kf, com f_i vinda da derivada da fase
  function demodulaFM(sFM, p) {
    const fase = faseInstantanea(sFM);
    const freqInst = gradiente(fase, 1 / FS);
    const mRec = new Float64Array(N);
    const fiHz = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      fiHz[i] = freqInst[i] / (2 * Math.PI);
      mRec[i] = (fiHz[i] - p.fc) / p.kf;
    }
    return { mRec, fiHz };
  }

  // PM: m(t) ~ (fase(t) - 2*pi*fc*t) / kp, sem derivar
  function demodulaPM(sPM, t, p) {
    const fase = faseInstantanea(sPM);
    const desvio = new Float64Array(N);
    let soma = 0;
    for (let i = 0; i < N; i++) {
      desvio[i] = fase[i] - 2 * Math.PI * p.fc * t[i];
      soma += desvio[i];
    }
    const media = soma / N;                 // remove a constante residual
    const mRec = new Float64Array(N);
    for (let i = 0; i < N; i++) mRec[i] = (desvio[i] - media) / p.kp;

    // f_i apenas para o gráfico comparativo
    const freqInst = gradiente(fase, 1 / FS);
    const fiHz = new Float64Array(N);
    for (let i = 0; i < N; i++) fiHz[i] = freqInst[i] / (2 * Math.PI);

    return { mRec, fiHz };
  }

  // Erro total, erro na janela central e |erro| máximo por região
  function metricasErro(orig, rec) {
    const k = Math.floor(N * MARGEM_BORDA);
    let seTot = 0, seCen = 0, maxBorda = 0, maxCentro = 0;
    for (let i = 0; i < N; i++) {
      const e = orig[i] - rec[i];
      seTot += e * e;
      const ae = Math.abs(e);
      if (i < k || i >= N - k) {
        if (ae > maxBorda) maxBorda = ae;
      } else {
        seCen += e * e;
        if (ae > maxCentro) maxCentro = ae;
      }
    }
    return {
      mseTotal: seTot / N,
      mseCentral: seCen / (N - 2 * k),
      maxBorda,
      maxCentro,
    };
  }

  // ------------------------------------------------------------------------
  // 6. Desenho dos gráficos em canvas
  // ------------------------------------------------------------------------
  function ajustaCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    return dpr;
  }

  // opts: { t, series:[{data,color,largura,traco}], eixoY, linhasRef:[{y,cor,rotulo}], escalaY }
  function desenhaGrafico(canvas, opts) {
    const dpr = ajustaCanvas(canvas);
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const padL = 58 * dpr, padR = 16 * dpr, padT = 16 * dpr, padB = 34 * dpr;
    const pw = W - padL - padR, ph = H - padT - padB;
    const escala = opts.escalaY || 1;

    // Limites do eixo Y a partir dos dados, ignorando 4 % de amostras em cada
    // ponta: os picos de borda (ringing da Hilbert + derivada) fariam a escala
    // explodir e achatar a parte útil do sinal. Esses picos apenas saem do
    // quadro (clip mais abaixo).
    const ign = Math.floor(N * 0.04);
    let yMin = Infinity, yMax = -Infinity;
    for (const s of opts.series) {
      for (let i = ign; i < s.data.length - ign; i++) {
        const v = s.data[i] * escala;
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      }
    }
    for (const l of opts.linhasRef || []) {
      yMin = Math.min(yMin, l.y * escala);
      yMax = Math.max(yMax, l.y * escala);
    }
    if (!isFinite(yMin) || yMin === yMax) { yMin -= 1; yMax += 1; }
    const folga = (yMax - yMin) * 0.08;
    yMin -= folga; yMax += folga;

    const tMs = opts.t[opts.t.length - 1] * 1000;
    const xPix = (i) => padL + (i / (opts.t.length - 1)) * pw;
    const yPix = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * ph;

    // Grade + rótulos
    ctx.font = `${11 * dpr}px Inter, sans-serif`;
    ctx.fillStyle = '#71717a';
    ctx.strokeStyle = '#18181b';
    ctx.lineWidth = 1 * dpr;

    ctx.textAlign = 'right';
    for (let g = 0; g <= 4; g++) {
      const v = yMin + (g / 4) * (yMax - yMin);
      const y = yPix(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillText(v.toFixed(2), padL - 8 * dpr, y + 4 * dpr);
    }

    ctx.textAlign = 'center';
    for (let g = 0; g <= 5; g++) {
      const x = padL + (g / 5) * pw;
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke();
      ctx.fillText(((g / 5) * tMs).toFixed(1), x, H - padB + 18 * dpr);
    }

    // Linhas de referência (ex.: f_c)
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

    // Séries (recortadas na área do gráfico para os picos de borda não
    // pintarem sobre os eixos e rótulos)
    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, padT, pw, ph);
    ctx.clip();
    for (const s of opts.series) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = (s.largura || 1.5) * dpr;
      ctx.setLineDash(s.traco ? [6 * dpr, 5 * dpr] : []);
      ctx.beginPath();
      for (let i = 0; i < s.data.length; i++) {
        const x = xPix(i);
        const y = yPix(s.data[i] * escala);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
    ctx.setLineDash([]);
  }

  // ------------------------------------------------------------------------
  // 7. Atualização do painel
  // ------------------------------------------------------------------------
  let ultimo = null;   // guarda o último resultado para redesenhar no resize

  const css = (nome) => getComputedStyle(document.body).getPropertyValue(nome).trim();

  function recalcula() {
    const p = lerParametros();

    // Rótulos dos controles
    out.fc.textContent = (p.fc / 1000).toFixed(1) + ' kHz';
    out.fm.textContent = p.fm + ' Hz';
    out.am.textContent = p.am.toFixed(2) + ' V';
    out.df.textContent = (p.deltaF / 1000).toFixed(1) + ' kHz';
    out.kp.textContent = p.kp.toFixed(2) + ' rad/V';
    out.snr.textContent = p.snrDb + ' dB';
    inputs.snr.disabled = !p.noiseOn;

    out.beta.textContent = (p.deltaF / p.fm).toFixed(2);
    out.pkPhase.textContent = (p.kp * p.am).toFixed(2) + ' rad';

    // Sinais + demodulação
    const { t, m, sPM, sFM } = gerarSinais(p);
    const fm = demodulaFM(sFM, p);
    const pm = demodulaPM(sPM, t, p);

    const errFm = metricasErro(m, fm.mRec);
    const errPm = metricasErro(m, pm.mRec);

    // Cartões de MSE (com destaque quando o erro passa de 1e-2)
    const LIMITE = 1e-2;
    out.mseFm.textContent = errFm.mseCentral.toExponential(2);
    out.msePm.textContent = errPm.mseCentral.toExponential(2);
    out.cardMseFm.className = 'metric-card' + (errFm.mseCentral > LIMITE ? ' alert-border' : '');
    out.cardMsePm.className = 'metric-card' + (errPm.mseCentral > LIMITE ? ' alert-border' : '');
    out.mseFm.className = 'metric-value ' + (errFm.mseCentral > LIMITE ? 'alert-text' : 'fm');
    out.msePm.className = 'metric-value ' + (errPm.mseCentral > LIMITE ? 'alert-text' : 'pm');

    // Tabela de erro por região
    const linha = (nome, classe, e) => `
      <tr>
        <td class="${classe}">${nome}</td>
        <td>${e.mseTotal.toExponential(2)}</td>
        <td>${e.mseCentral.toExponential(2)}</td>
        <td>${e.maxBorda.toExponential(2)}</td>
        <td>${e.maxCentro.toExponential(2)}</td>
      </tr>`;
    out.errTableBody.innerHTML =
      linha('FM', 'tag-fm', errFm) + linha('PM', 'tag-pm', errPm);

    // f_i teórica da FM: fc + kf*m(t)
    const fiTeoricaFM = new Float64Array(N);
    for (let i = 0; i < N; i++) fiTeoricaFM[i] = p.fc + p.kf * m[i];

    ultimo = { t, m, fm, pm, fiTeoricaFM, fc: p.fc };
    redesenha();
  }

  function redesenha() {
    if (!ultimo) return;
    const { t, m, fm, pm, fiTeoricaFM, fc } = ultimo;

    desenhaGrafico(canvasMsg, {
      t,
      series: [
        { data: m, color: css('--signal'), largura: 2.5 },
        { data: fm.mRec, color: css('--fm'), largura: 1.6, traco: true },
        { data: pm.mRec, color: css('--pm'), largura: 1.6, traco: true },
      ],
    });

    desenhaGrafico(canvasFi, {
      t,
      escalaY: 1 / 1000,        // Hz -> kHz
      series: [
        { data: fm.fiHz, color: css('--fm'), largura: 2 },
        { data: fiTeoricaFM, color: css('--signal'), largura: 1.4, traco: true },
        { data: pm.fiHz, color: css('--pm'), largura: 1.6 },
      ],
      linhasRef: [{ y: fc, cor: 'rgba(255,255,255,0.35)' }],
    });
  }

  // ------------------------------------------------------------------------
  // 8. Eventos
  // ------------------------------------------------------------------------
  Object.values(inputs).forEach((elem) => {
    elem.addEventListener('input', recalcula);
    elem.addEventListener('change', recalcula);
  });

  function exportaPNG(canvas, nome) {
    const link = document.createElement('a');
    link.download = nome;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }
  el('btnPngMsg').addEventListener('click', () => exportaPNG(canvasMsg, 'topico8_mensagem_recuperada.png'));
  el('btnPngFi').addEventListener('click', () => exportaPNG(canvasFi, 'topico8_frequencia_instantanea.png'));

  const ro = new ResizeObserver(() => redesenha());
  ro.observe(canvasMsg);
  ro.observe(canvasFi);

  recalcula();

});
