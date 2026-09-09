"""
Simulação 8 — Tópico 8: Demodulação de FM e de PM
=================================================

Objetivo
--------
Recuperar a mensagem m(t) a partir dos sinais modulados s_FM(t) e s_PM(t)
usando apenas a fase instantânea obtida do sinal analítico.

Roteiro de demodulação
----------------------
1. Sinal analítico:  z(t) = hilbert(s(t))               (scipy.signal.hilbert)
2. Fase instantânea: phi(t) = unwrap(angle(z(t)))       (np.unwrap)
3. PM:  phi(t) = 2*pi*fc*t + kp*m(t)
        -> subtrai a rampa da portadora e divide por kp  (sem derivar).
4. FM:  (1/2*pi) * dphi/dt = fc + kf*m(t)  = frequência instantânea
        -> diferença finita da fase, subtrai fc e divide por kf.

Artefatos de borda
------------------
- A transformada de Hilbert numérica distorce as extremidades do sinal.
- A diferença finita (derivada) usada na FM realça ainda mais as bordas.
Por isso o MSE é reportado duas vezes: sobre todo o sinal e sobre uma
janela central, com as bordas descartadas.
"""

import numpy as np
import matplotlib.pyplot as plt
from scipy.signal import hilbert

from signals import Parametros, vetor_tempo, mensagem, modula_pm, modula_fm


def fase_instantanea(s: np.ndarray) -> np.ndarray:
    """Fase instantânea desdobrada (em rad) do sinal real s(t)."""
    return np.unwrap(np.angle(hilbert(s)))


def demodula_pm(s_pm: np.ndarray, t: np.ndarray, p: Parametros) -> np.ndarray:
    """
    Recupera m(t) a partir de um sinal PM.

    phi(t) = 2*pi*fc*t + kp*m(t)  ->  m(t) = (phi(t) - 2*pi*fc*t) / kp

    O termo constante residual da fase é removido subtraindo a média
    (a mensagem cossenoidal tem valor médio nulo).
    """
    phi = fase_instantanea(s_pm)
    desvio_fase = phi - 2.0 * np.pi * p.fc * t
    desvio_fase = desvio_fase - np.mean(desvio_fase)
    return desvio_fase / p.kp


def demodula_fm(s_fm: np.ndarray, t: np.ndarray, p: Parametros) -> np.ndarray:
    """
    Recupera m(t) a partir de um sinal FM.

    f_i(t) = (1/2*pi) * dphi/dt = fc + kf*m(t)  ->  m(t) = (f_i(t) - fc) / kf

    A derivada é feita por diferença finita central (np.gradient), que
    mantém o comprimento do vetor.
    """
    phi = fase_instantanea(s_fm)
    freq_inst = np.gradient(phi, t) / (2.0 * np.pi)
    return (freq_inst - p.fc) / p.kf


def mse(original: np.ndarray, recuperado: np.ndarray, margem: float = 0.05):
    """
    Erro quadrático médio entre `original` e `recuperado`.

    Retorna (mse_total, mse_centro). Em `mse_centro` é descartada uma
    fração `margem` das amostras em cada extremidade, isolando o efeito
    dos artefatos de borda.
    """
    erro = original - recuperado
    mse_total = float(np.mean(erro ** 2))
    k = int(len(erro) * margem)
    mse_centro = float(np.mean(erro[k:-k] ** 2)) if k > 0 else mse_total
    return mse_total, mse_centro


def _relata_bordas(nome, original, recuperado, margem=0.05):
    """Compara o |erro| máximo nas bordas com o do miolo do sinal."""
    erro = np.abs(original - recuperado)
    k = int(len(erro) * margem)
    bordas = max(erro[:k].max(), erro[-k:].max())
    centro = erro[k:-k].max()
    print(f'  {nome} : bordas = {bordas:.3e} | centro = {centro:.3e}')


def main():
    p = Parametros()
    t = vetor_tempo(p)

    # Sinais de referência (mesma mensagem para FM e PM).
    m = mensagem(t, p)
    s_pm = modula_pm(t, m, p)
    s_fm = modula_fm(t, m, p)

    # Demodulação.
    m_rec_pm = demodula_pm(s_pm, t, p)
    m_rec_fm = demodula_fm(s_fm, t, p)

    mse_pm = mse(m, m_rec_pm)
    mse_fm = mse(m, m_rec_fm)

    print('Parâmetros')
    print(f'  fs = {p.fs:.0f} Hz | fc = {p.fc:.0f} Hz | fm = {p.fm:.0f} Hz')
    print(f'  kp = {p.kp:.4f} rad/V | kf = {p.kf:.1f} Hz/V (delta_f = {p.delta_f:.0f} Hz)')
    print()
    print('MSE entre m(t) original e recuperado')
    print(f'  FM : total = {mse_fm[0]:.3e} | janela central = {mse_fm[1]:.3e}')
    print(f'  PM : total = {mse_pm[0]:.3e} | janela central = {mse_pm[1]:.3e}')
    print()
    print('Artefatos de borda (|erro| máximo nas bordas x no centro)')
    _relata_bordas('FM', m, m_rec_fm)
    _relata_bordas('PM', m, m_rec_pm)
    print()
    print('Sem ruído, com mensagem senoidal pura e janela contendo um número')
    print('inteiro de períodos, o erro é ínfimo em todo o sinal. O resíduo que')
    print('sobra (ordem de 1e-9 na FM, contra ~1e-23 na PM) vem da derivada')
    print('numérica: ela não tem solução fechada exata e é mais sensível nas')
    print('extremidades, onde np.gradient usa diferença lateral em vez de central.')
    print('A PM não deriva a fase, por isso chega ao limite da precisão de máquina.')

    _plota(t, m, m_rec_fm, m_rec_pm, mse_fm, mse_pm)


def _plota(t, m, m_rec_fm, m_rec_pm, mse_fm, mse_pm):
    t_ms = t * 1e3
    fig, axs = plt.subplots(2, 1, figsize=(11, 7), sharex=True)

    axs[0].plot(t_ms, m, linewidth=2, label='m(t) original')
    axs[0].plot(t_ms, m_rec_fm, '--', label='m(t) recuperado (FM)')
    axs[0].set_title(f'Demodulação FM  —  MSE total = {mse_fm[0]:.2e}  |  '
                     f'central = {mse_fm[1]:.2e}')
    axs[0].set_ylabel('Amplitude [V]')
    axs[0].legend(loc='upper right')
    axs[0].grid(True, linestyle='--', alpha=0.5)

    axs[1].plot(t_ms, m, linewidth=2, label='m(t) original')
    axs[1].plot(t_ms, m_rec_pm, '--', label='m(t) recuperado (PM)')
    axs[1].set_title(f'Demodulação PM  —  MSE total = {mse_pm[0]:.2e}  |  '
                     f'central = {mse_pm[1]:.2e}')
    axs[1].set_xlabel('Tempo [ms]')
    axs[1].set_ylabel('Amplitude [V]')
    axs[1].legend(loc='upper right')
    axs[1].grid(True, linestyle='--', alpha=0.5)

    fig.tight_layout()
    fig.savefig('topico8_demodulacao.png', dpi=120)
    print('\nGráfico salvo em "topico8_demodulacao.png".')
    plt.show()


if __name__ == '__main__':
    main()
