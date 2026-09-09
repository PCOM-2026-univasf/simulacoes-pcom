"""
Simulação 8 — Modulação Angular (FM e PM)
=========================================
Tópico 8 — Demodulação de FM e de PM: parâmetros e sinais base.

Parâmetros e sinais de referência:
  - Portadora:  c(t) = Ac * cos(2*pi*fc*t)
  - Mensagem:   m(t) = Am * cos(2*pi*fm*t)
  - Modulação de Fase (PM):
      s_PM(t) = Ac * cos(2*pi*fc*t + kp * m(t))
  - Modulação de Frequência (FM):
      s_FM(t) = Ac * cos(2*pi*fc*t + 2*pi*kf * integral_0^t m(tau) dtau)

A taxa de amostragem fs = 200 kHz sobreamostra confortavelmente tanto a
portadora (fc = 10 kHz) quanto a largura de faixa de Carson da modulação
FM (~ 2*(delta_f + fm) = 11 kHz), garantindo suporte numérico adequado para
a transformada de Hilbert e para a diferenciação finita na demodulação.
"""

from dataclasses import dataclass
import numpy as np
from scipy.integrate import cumulative_trapezoid


@dataclass
class Parametros:
    """
    Parâmetros da simulação da modulação angular.
    
    fs: Frequência de amostragem (200 kHz)
    fc: Frequência da portadora (10 kHz)
    ac: Amplitude da portadora (1.0 V)
    fm: Frequência do sinal mensagem (500 Hz)
    am: Amplitude do sinal mensagem (1.0 V)
    duracao: Duração temporal da análise (50 ms -> 25 ciclos completos da mensagem)
    delta_f: Desvio de frequência de pico FM (5 kHz)
    desvio_fase: Desvio de fase de pico PM (2.0 rad)
    """
    fs: float = 200_000.0     # Hz  - taxa de amostragem
    fc: float = 10_000.0      # Hz  - frequência da portadora
    ac: float = 1.0           # V   - amplitude da portadora
    fm: float = 500.0         # Hz  - frequência do tom modulante
    am: float = 1.0           # V   - amplitude do tom modulante
    duracao: float = 0.05     # s   - duração total (50 ms)
    delta_f: float = 5_000.0  # Hz  - desvio de frequência de pico para FM
    desvio_fase: float = 2.0  # rad - desvio de fase de pico para PM

    @property
    def kp(self) -> float:
        """Sensibilidade de fase: kp = desvio_fase / am [rad/V]."""
        return self.desvio_fase / self.am

    @property
    def kf(self) -> float:
        """Sensibilidade de frequência: kf = delta_f / am [Hz/V]."""
        return self.delta_f / self.am


def vetor_tempo(p: Parametros) -> np.ndarray:
    """Retorna o vetor de tempo uniformemente amostrado a fs, partindo de t = 0."""
    n_amostras = int(round(p.fs * p.duracao))
    return np.arange(n_amostras) / p.fs


def portadora(t: np.ndarray, p: Parametros) -> np.ndarray:
    """Gera a portadora pura c(t) = Ac * cos(2*pi*fc*t)."""
    return p.ac * np.cos(2.0 * np.pi * p.fc * t)


def mensagem(t: np.ndarray, p: Parametros) -> np.ndarray:
    """Gera o sinal mensagem senoidal m(t) = Am * cos(2*pi*fm*t)."""
    return p.am * np.cos(2.0 * np.pi * p.fm * t)


def modula_pm(t: np.ndarray, m: np.ndarray, p: Parametros) -> np.ndarray:
    """
    Modulação em Fase (PM):
    s_PM(t) = Ac * cos(2*pi*fc*t + kp * m(t))
    """
    fase_total = 2.0 * np.pi * p.fc * t + p.kp * m
    return p.ac * np.cos(fase_total)


def modula_fm(t: np.ndarray, m: np.ndarray, p: Parametros) -> np.ndarray:
    """
    Modulação em Frequência (FM):
    s_FM(t) = Ac * cos(2*pi*fc*t + 2*pi*kf * integral_0^t m(tau) dtau)

    A integral acumulada de m(t) é calculada numericamente pela regra do trapézio,
    com a condição inicial forçada em zero (initial=0.0).
    """
    integral_m = cumulative_trapezoid(m, t, initial=0.0)
    fase_total = 2.0 * np.pi * p.fc * t + 2.0 * np.pi * p.kf * integral_m
    return p.ac * np.cos(fase_total)
