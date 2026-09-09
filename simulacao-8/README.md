# Simulação 8 — Modulação Angular (FM e PM)

## Tópico 8 — Demodulação de FM e de PM

Recupera o sinal mensagem `m(t)` a partir dos sinais modulados `s_FM(t)` e
`s_PM(t)` usando técnicas baseadas na **fase instantânea** obtida do sinal
analítico.

---

## Estrutura

- `signals.py`: parâmetros do roteiro (`Parametros`) e geração dos sinais —
  portadora, mensagem, `s_PM(t)` e `s_FM(t)` (integração numérica da
  mensagem via `scipy.integrate.cumulative_trapezoid`).
- `topico8_demodulacao.py`: script principal do Tópico 8.
  - `fase_instantanea()` — `unwrap(angle(hilbert(s)))`.
  - `demodula_pm()` — usa a fase diretamente: `m ≈ (φ(t) − 2π f_c t) / k_p`.
  - `demodula_fm()` — deriva a fase (diferença finita central) para obter a
    frequência instantânea: `m ≈ (f_i(t) − f_c) / k_f`.
  - `mse()` — erro quadrático médio, total e em janela central.
  - Gera `topico8_demodulacao.png` (original × recuperado, FM e PM).
- `run.py`: bootstrap portátil (cria `venv` e instala dependências se preciso).
- `requirements.txt`: `numpy`, `scipy`, `matplotlib`.
- `index.html` + `app.js` + `styles.css`: **simulação web interativa** do
  mesmo Tópico 8. Sliders para `f_c`, `f_m`, `A_m`, `Δf` e `k_p`, com o
  pipeline reimplementado em JavaScript puro (FFT radix-2 própria para a
  Hilbert). Mostra a mensagem original × recuperada, a frequência
  instantânea `f_i(t)` e uma tabela de erro por região (borda × centro).
  Há ainda um toggle de ruído AWGN como prévia do Tópico 9.

---

## Executando

### Script Python

```bash
python3 run.py
```

ou, com as dependências já instaladas:

```bash
python3 topico8_demodulacao.py
```

### Simulação web

Abra `index.html` direto no navegador (não faz requisições, funciona em
`file://`).

---

## Método

| Etapa | FM | PM |
|-------|----|----|
| Sinal analítico | `hilbert(s_FM)` | `hilbert(s_PM)` |
| Fase instantânea | `unwrap(angle(·))` | `unwrap(angle(·))` |
| Remoção da portadora | derivada da fase − `f_c` | fase − `2π f_c t` |
| Recuperação de `m(t)` | `(f_i − f_c) / k_f` | `desvio_fase / k_p` |

`k_p = 2 / A_m` (desvio de fase de pico ≈ 2 rad) e
`k_f = Δf / A_m` com `Δf = 5 kHz` (desvio de frequência de pico).

## Resultado esperado

Sem ruído, a mensagem é recuperada com MSE muito baixo nos dois casos. O
erro residual da FM (ordem de `1e-9`) vem da **derivada numérica** da fase,
que é aproximada e mais sensível nas **bordas** do sinal (onde `np.gradient`
troca a diferença central pela lateral). A PM não deriva a fase e chega ao
limite da precisão de máquina. O script imprime o `|erro|` máximo nas bordas
e no centro para tornar esse efeito explícito.

---

## Discentes

- Paulo Henrique de Farias Martins
- Caua Tavares Nunes
- Vitor Rocha Machado
- Vitor Gonçalves dos Santos
- José Victor Cruz Rebouças
