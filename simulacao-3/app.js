/* ==========================================================================
   SOBREMODULAÇÃO AM — Verificador Automático
   App Engine (Monochrome & Red Highlight Theme)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  // ------------------------------------------------------------------------
  // 1. Data Definitions & Test Cases (3 A values per test case)
  // ------------------------------------------------------------------------
  const TEST_CASES = [
    {
      id: 'sine',
      name: 'Seno simples',
      type: 'sine',
      params: { freq: 5.0, amp: 2.0 },
      A_values: [1.0, 2.0, 3.0]
    },
    {
      id: 'dual_sine',
      name: 'Soma de dois senos',
      type: 'dual_sine',
      params: { freq1: 5.0, amp1: 1.5, freq2: 15.0, amp2: 0.8 },
      A_values: [1.5, 2.4, 3.2]
    },
    {
      id: 'triangular',
      name: 'Sinal triangular',
      type: 'triangular',
      params: { freq: 5.0, amp: 3.0, width: 0.5 },
      A_values: [2.0, 3.0, 4.0]
    },
    {
      id: 'noise',
      name: 'Ruído aleatório',
      type: 'noise',
      params: { scale: 1.0, seed: 42 },
      A_values: [1.8, 3.2, 4.5]
    },
    {
      id: 'audio',
      name: 'Sinal de Áudio Real',
      type: 'audio',
      params: { filePath: 'xaropinho-rapaz.wav' },
      A_values: [0.10, 0.25, 0.50]
    }
  ];

  // Global State
  let currentCaseId = 'sine';
  let isAnimRunning = true;
  let animFrameId = null;
  let timeOffset = 0;
  let loadedAudioData = null;

  // DOM Element References
  const caseSelector = document.getElementById('caseSelector');
  const carrierAmpInput = document.getElementById('carrierAmp');
  const carrierFreqInput = document.getElementById('carrierFreq');
  const modFreqInput = document.getElementById('modFreq');
  const modAmpInput = document.getElementById('modAmp');

  const valCarrierAmp = document.getElementById('valCarrierAmp');
  const valCarrierFreq = document.getElementById('valCarrierFreq');
  const valModFreq = document.getElementById('valModFreq');
  const valModAmp = document.getElementById('valModAmp');
  const valAMin = document.getElementById('valAMin');
  const valModIndex = document.getElementById('valModIndex');
  const cardModIndex = document.getElementById('cardModIndex');

  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const canvasTagOsc = document.getElementById('canvasTagOsc');
  const btnToggleAnim = document.getElementById('btnToggleAnim');
  const btnExportOsc = document.getElementById('btnExportOsc');
  const btnExportSem = document.getElementById('btnExportSem');
  const btnExportCSV = document.getElementById('btnExportCSV');
  const btnExportJSON = document.getElementById('btnExportJSON');

  const oscilloscopeCanvas = document.getElementById('oscilloscopeCanvas');
  const semaphoreCanvas = document.getElementById('semaphoreCanvas');
  const summaryTableBody = document.getElementById('summaryTableBody');

  const ctxOsc = oscilloscopeCanvas.getContext('2d');
  const ctxSem = semaphoreCanvas.getContext('2d');

  // ------------------------------------------------------------------------
  // 2. Core Envelope Verification Algorithm (verifica_envelope)
  // ------------------------------------------------------------------------
  function verificaEnvelope(m, A) {
    let minEnvelope = Infinity;
    let maxNeg = -Infinity;

    for (let i = 0; i < m.length; i++) {
      const envelope = A + m[i];
      if (envelope < minEnvelope) minEnvelope = envelope;
      
      const neg = -m[i];
      if (neg > maxNeg) maxNeg = neg;
    }

    const ok = minEnvelope >= 0.0;
    const a_min = maxNeg;
    return { ok, a_min };
  }

  // ------------------------------------------------------------------------
  // 3. Signal Generators
  // ------------------------------------------------------------------------
  function generateSignalVector(caseObj, numSamples = 1000, duration = 1.0) {
    const m = new Float32Array(numSamples);
    const dt = duration / numSamples;
    const ampScale = parseFloat(modAmpInput.value);
    const freqScale = parseFloat(modFreqInput.value) / 5.0;

    if (caseObj.type === 'sine') {
      const f = caseObj.params.freq * freqScale;
      for (let i = 0; i < numSamples; i++) {
        const t = i * dt;
        m[i] = ampScale * Math.sin(2 * Math.PI * f * t);
      }
    } else if (caseObj.type === 'dual_sine') {
      const f1 = caseObj.params.freq1 * freqScale;
      const f2 = caseObj.params.freq2 * freqScale;
      const a1 = (caseObj.params.amp1 / 2.0) * ampScale;
      const a2 = (caseObj.params.amp2 / 2.0) * ampScale;
      for (let i = 0; i < numSamples; i++) {
        const t = i * dt;
        m[i] = a1 * Math.sin(2 * Math.PI * f1 * t) + a2 * Math.sin(2 * Math.PI * f2 * t);
      }
    } else if (caseObj.type === 'triangular') {
      const f = caseObj.params.freq * freqScale;
      const period = 1.0 / f;
      for (let i = 0; i < numSamples; i++) {
        const t = i * dt;
        const phase = (t % period) / period;
        let val = 0;
        if (phase < 0.5) {
          val = -1.0 + 4.0 * phase;
        } else {
          val = 3.0 - 4.0 * phase;
        }
        m[i] = ampScale * val;
      }
    } else if (caseObj.type === 'noise') {
      let seed = caseObj.params.seed || 42;
      function pseudoRandom() {
        const x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
      }
      for (let i = 0; i < numSamples; i++) {
        const u1 = Math.max(0.0001, pseudoRandom());
        const u2 = pseudoRandom();
        const randG = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
        m[i] = ampScale * 0.6 * randG;
      }
    } else if (caseObj.type === 'audio') {
      if (loadedAudioData) {
        const step = Math.floor(loadedAudioData.length / numSamples);
        for (let i = 0; i < numSamples; i++) {
          const idx = Math.min(loadedAudioData.length - 1, i * step);
          m[i] = ampScale * 0.2 * loadedAudioData[idx];
        }
      } else {
        for (let i = 0; i < numSamples; i++) {
          const t = i * dt;
          m[i] = 0.2 * Math.sin(2 * Math.PI * 10 * t);
        }
      }
    }

    return m;
  }

  // Fetch & Decode Real Audio File
  async function loadAudioFile() {
    try {
      const response = await fetch('xaropinho-rapaz.wav');
      const arrayBuffer = await response.arrayBuffer();
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      loadedAudioData = audioBuffer.getChannelData(0);
      updateDashboard();
    } catch (err) {
      console.warn('Não foi possível carregar o arquivo de áudio:', err);
    }
  }
  loadAudioFile();

  // ------------------------------------------------------------------------
  // 4. Canvas Rendering — Animated Oscilloscope with Distinct Legend Colors
  // ------------------------------------------------------------------------
  function resizeCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
    }
  }

  function drawOscilloscope() {
    resizeCanvas(oscilloscopeCanvas);
    const width = oscilloscopeCanvas.width;
    const height = oscilloscopeCanvas.height;
    const dpr = window.devicePixelRatio || 1;

    ctxOsc.clearRect(0, 0, width, height);

    // Background Grid
    ctxOsc.strokeStyle = '#18181b';
    ctxOsc.lineWidth = 1 * dpr;
    const gridSize = 40 * dpr;
    ctxOsc.beginPath();
    for (let x = 0; x < width; x += gridSize) {
      ctxOsc.moveTo(x, 0); ctxOsc.lineTo(x, height);
    }
    for (let y = 0; y < height; y += gridSize) {
      ctxOsc.moveTo(0, y); ctxOsc.lineTo(width, y);
    }
    ctxOsc.stroke();

    // Center Zero Line
    const centerY = height / 2;
    ctxOsc.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctxOsc.lineWidth = 1.5 * dpr;
    ctxOsc.beginPath();
    ctxOsc.moveTo(0, centerY);
    ctxOsc.lineTo(width, centerY);
    ctxOsc.stroke();

    // Current Parameters
    const caseObj = TEST_CASES.find(c => c.id === currentCaseId);
    const A = parseFloat(carrierAmpInput.value);
    const fc = parseFloat(carrierFreqInput.value);

    const numPoints = 800;
    const m = generateSignalVector(caseObj, numPoints, 1.0);

    const maxVal = Math.max(A + 3.0, 5.0);
    const scaleY = (height / 2 - 20 * dpr) / maxVal;

    // 1. Highlight Overmodulation Danger Zones (A + m(t) < 0) IN VIVID RED
    ctxOsc.fillStyle = 'rgba(239, 68, 68, 0.3)';
    for (let i = 0; i < numPoints - 1; i++) {
      const envelopeUpper = A + m[i];
      if (envelopeUpper < 0) {
        const x1 = (i / numPoints) * width;
        const x2 = ((i + 1) / numPoints) * width;
        ctxOsc.fillRect(x1, 0, x2 - x1, height);
      }
    }

    // 2. Draw Modulated Carrier s(t) in Indigo (#818cf8)
    ctxOsc.strokeStyle = '#818cf8';
    ctxOsc.lineWidth = 1.2 * dpr;
    ctxOsc.beginPath();
    for (let i = 0; i < numPoints; i++) {
      const x = (i / numPoints) * width;
      const t = (i / numPoints) + timeOffset;
      const envelope = A + m[i];
      const s = envelope * Math.cos(2 * Math.PI * fc * t);
      const y = centerY - s * scaleY;
      if (i === 0) ctxOsc.moveTo(x, y);
      else ctxOsc.lineTo(x, y);
    }
    ctxOsc.stroke();

    // 3. Draw Upper & Lower Envelopes +[A + m(t)] and -[A + m(t)] in Amber (#f59e0b)
    ctxOsc.setLineDash([5 * dpr, 5 * dpr]);
    ctxOsc.strokeStyle = '#f59e0b';
    ctxOsc.lineWidth = 2 * dpr;

    // Upper Envelope
    ctxOsc.beginPath();
    for (let i = 0; i < numPoints; i++) {
      const x = (i / numPoints) * width;
      const envelopeUpper = A + m[i];
      const y = centerY - envelopeUpper * scaleY;
      if (i === 0) ctxOsc.moveTo(x, y);
      else ctxOsc.lineTo(x, y);
    }
    ctxOsc.stroke();

    // Lower Envelope
    ctxOsc.strokeStyle = 'rgba(245, 158, 11, 0.6)';
    ctxOsc.beginPath();
    for (let i = 0; i < numPoints; i++) {
      const x = (i / numPoints) * width;
      const envelopeLower = -(A + m[i]);
      const y = centerY - envelopeLower * scaleY;
      if (i === 0) ctxOsc.moveTo(x, y);
      else ctxOsc.lineTo(x, y);
    }
    ctxOsc.stroke();
    ctxOsc.setLineDash([]);

    // 4. Draw Modulating Signal m(t) in Cyan (#38bdf8)
    ctxOsc.strokeStyle = '#38bdf8';
    ctxOsc.lineWidth = 2.5 * dpr;
    ctxOsc.beginPath();
    for (let i = 0; i < numPoints; i++) {
      const x = (i / numPoints) * width;
      const y = centerY - m[i] * scaleY;
      if (i === 0) ctxOsc.moveTo(x, y);
      else ctxOsc.lineTo(x, y);
    }
    ctxOsc.stroke();
  }

  // ------------------------------------------------------------------------
  // 5. Canvas Rendering — Semaphore Scatter Plot (Verde / Vermelho / Azul)
  // ------------------------------------------------------------------------
  function drawSemaphorePlot() {
    resizeCanvas(semaphoreCanvas);
    const width = semaphoreCanvas.width;
    const height = semaphoreCanvas.height;
    const dpr = window.devicePixelRatio || 1;

    ctxSem.clearRect(0, 0, width, height);

    const paddingLeft = 50 * dpr;
    const paddingBottom = 40 * dpr;
    const paddingTop = 20 * dpr;
    const paddingRight = 20 * dpr;

    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;

    // Axes
    ctxSem.strokeStyle = '#27272a';
    ctxSem.lineWidth = 1.5 * dpr;
    ctxSem.beginPath();
    ctxSem.moveTo(paddingLeft, paddingTop);
    ctxSem.lineTo(paddingLeft, height - paddingBottom);
    ctxSem.lineTo(width - paddingRight, height - paddingBottom);
    ctxSem.stroke();

    // Y Axis Scale
    const maxY = 5.0;
    ctxSem.fillStyle = '#71717a';
    ctxSem.font = `${10 * dpr}px Inter, sans-serif`;
    ctxSem.textAlign = 'right';
    for (let a = 0; a <= maxY; a += 1.0) {
      const y = height - paddingBottom - (a / maxY) * plotHeight;
      ctxSem.fillText(a.toFixed(1), paddingLeft - 8 * dpr, y + 3 * dpr);
      ctxSem.strokeStyle = '#18181b';
      ctxSem.beginPath();
      ctxSem.moveTo(paddingLeft, y);
      ctxSem.lineTo(width - paddingRight, y);
      ctxSem.stroke();
    }

    // X Axis Labels & Points
    const numCases = TEST_CASES.length;
    const stepX = plotWidth / numCases;

    TEST_CASES.forEach((cObj, idx) => {
      const x = paddingLeft + (idx + 0.5) * stepX;
      
      ctxSem.fillStyle = (cObj.id === currentCaseId) ? '#ffffff' : '#71717a';
      ctxSem.font = `${(cObj.id === currentCaseId ? 'bold ' : '')}${9 * dpr}px Inter, sans-serif`;
      ctxSem.textAlign = 'center';
      const labelText = cObj.name.length > 12 ? cObj.name.substring(0, 10) + '...' : cObj.name;
      ctxSem.fillText(labelText, x, height - paddingBottom + 18 * dpr);

      const m = generateSignalVector(cObj, 500, 1.0);

      // Draw tested A values (VERDE = OK, VERMELHO = SOBREMODULADO)
      cObj.A_values.forEach(A_test => {
        const { ok } = verificaEnvelope(m, A_test);
        const y = height - paddingBottom - (A_test / maxY) * plotHeight;

        ctxSem.beginPath();
        ctxSem.arc(x, y, 6 * dpr, 0, 2 * Math.PI);
        ctxSem.fillStyle = ok ? '#10b981' : '#ef4444'; // Green if OK, Red if Overmodulated
        ctxSem.fill();
        ctxSem.strokeStyle = '#09090b';
        ctxSem.lineWidth = 2 * dpr;
        ctxSem.stroke();
      });

      // Draw a_min threshold marker (Blue X)
      const { a_min } = verificaEnvelope(m, 1.0);
      const yMin = height - paddingBottom - (Math.min(a_min, maxY) / maxY) * plotHeight;
      const sizeX = 5 * dpr;
      ctxSem.strokeStyle = '#38bdf8'; // Blue X for threshold
      ctxSem.lineWidth = 2.5 * dpr;
      ctxSem.beginPath();
      ctxSem.moveTo(x - sizeX, yMin - sizeX); ctxSem.lineTo(x + sizeX, yMin + sizeX);
      ctxSem.moveTo(x + sizeX, yMin - sizeX); ctxSem.lineTo(x - sizeX, yMin + sizeX);
      ctxSem.stroke();
    });
  }

  // ------------------------------------------------------------------------
  // 6. Animation Loop
  // ------------------------------------------------------------------------
  function animLoop() {
    if (isAnimRunning) {
      timeOffset += 0.005;
    }
    drawOscilloscope();
    drawSemaphorePlot();
    animFrameId = requestAnimationFrame(animLoop);
  }

  // ------------------------------------------------------------------------
  // 7. Dynamic UI & Dashboard Updates
  // ------------------------------------------------------------------------
  function updateDashboard() {
    const caseObj = TEST_CASES.find(c => c.id === currentCaseId);
    const A = parseFloat(carrierAmpInput.value);
    
    valCarrierAmp.textContent = A.toFixed(2);
    valCarrierFreq.textContent = `${carrierFreqInput.value} Hz`;
    valModFreq.textContent = `${modFreqInput.value} Hz`;
    valModAmp.textContent = parseFloat(modAmpInput.value).toFixed(2);

    const m = generateSignalVector(caseObj, 1000, 1.0);
    const { ok, a_min } = verificaEnvelope(m, A);

    valAMin.textContent = a_min.toFixed(2);
    const modIndex = a_min > 0 ? (a_min / A) : 0;
    valModIndex.textContent = modIndex.toFixed(2);

    if (ok) {
      statusBadge.className = 'status-semaphore ok';
      statusText.textContent = 'VERIFICAÇÃO: OK (Sem Sobremodulação)';
      canvasTagOsc.className = 'canvas-tag';
      valModIndex.className = 'metric-value';
      cardModIndex.className = 'metric-card';
    } else {
      statusBadge.className = 'status-semaphore overmodulated';
      statusText.textContent = 'VERIFICAÇÃO: SOBREMODULADO!';
      canvasTagOsc.className = 'canvas-tag alert-tag';
      valModIndex.className = 'metric-value alert-text';
      cardModIndex.className = 'metric-card alert-border';
    }

    renderSummaryTable();
  }

  function renderSummaryTable() {
    summaryTableBody.innerHTML = '';
    
    TEST_CASES.forEach(cObj => {
      const m = generateSignalVector(cObj, 500, 1.0);
      
      cObj.A_values.forEach(A_test => {
        const { ok, a_min } = verificaEnvelope(m, A_test);
        const tr = document.createElement('tr');
        
        const isCurrentActive = (cObj.id === currentCaseId && Math.abs(A_test - parseFloat(carrierAmpInput.value)) < 0.2);
        if (isCurrentActive) {
          tr.className = ok ? 'active-row' : 'active-row-alert';
        }

        tr.innerHTML = `
          <td><strong>${cObj.name}</strong></td>
          <td>${A_test.toFixed(2)}</td>
          <td style="font-weight: 600;">${a_min.toFixed(2)}</td>
          <td>
            <span class="status-pill ${ok ? 'ok' : 'sobremodulado'}">
              ${ok ? 'OK' : 'Sobremodulado'}
            </span>
          </td>
        `;

        tr.addEventListener('click', () => {
          currentCaseId = cObj.id;
          caseSelector.value = cObj.id;
          carrierAmpInput.value = A_test;
          updateDashboard();
        });

        summaryTableBody.appendChild(tr);
      });
    });
  }

  // ------------------------------------------------------------------------
  // 8. Event Listeners & Export Utilities
  // ------------------------------------------------------------------------
  caseSelector.addEventListener('change', (e) => {
    currentCaseId = e.target.value;
    const cObj = TEST_CASES.find(c => c.id === currentCaseId);
    carrierAmpInput.value = cObj.A_values[1];
    updateDashboard();
  });

  [carrierAmpInput, carrierFreqInput, modFreqInput, modAmpInput].forEach(elem => {
    elem.addEventListener('input', updateDashboard);
  });

  btnToggleAnim.addEventListener('click', () => {
    isAnimRunning = !isAnimRunning;
    btnToggleAnim.textContent = isAnimRunning ? 'Pausar Animação' : 'Continuar Animação';
  });

  function exportCanvasImage(canvas, filename) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  btnExportOsc.addEventListener('click', () => exportCanvasImage(oscilloscopeCanvas, 'osciloscopio_am.png'));
  btnExportSem.addEventListener('click', () => exportCanvasImage(semaphoreCanvas, 'semaforo_am.png'));

  btnExportCSV.addEventListener('click', () => {
    let csv = 'Caso de Teste,A Testado,a_min Sugerido,Resultado\n';
    TEST_CASES.forEach(cObj => {
      const m = generateSignalVector(cObj, 500, 1.0);
      cObj.A_values.forEach(A_test => {
        const { ok, a_min } = verificaEnvelope(m, A_test);
        csv += `"${cObj.name}",${A_test.toFixed(4)},${a_min.toFixed(4)},${ok ? 'OK' : 'Sobremodulado'}\n`;
      });
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'tabela_resumo_sobremodulacao.csv';
    link.click();
  });

  btnExportJSON.addEventListener('click', () => {
    const results = [];
    TEST_CASES.forEach(cObj => {
      const m = generateSignalVector(cObj, 500, 1.0);
      cObj.A_values.forEach(A_test => {
        const { ok, a_min } = verificaEnvelope(m, A_test);
        results.push({
          caso: cObj.name,
          A_testado: A_test,
          a_min_sugerido: a_min,
          resultado: ok ? 'OK' : 'Sobremodulado'
        });
      });
    });

    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'tabela_resumo_sobremodulacao.json';
    link.click();
  });

  updateDashboard();
  animLoop();

});
