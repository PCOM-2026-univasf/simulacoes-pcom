"""
Simulação 8 — Modulação Angular (FM e PM)
Geração dos sinais base e dos sinais modulados.

Parâmetros do roteiro
---------------------
    fs = 200 kHz   -> frequência de amostragem
    fc = 10 kHz    -> frequência da portadora
    Ac = 1 V       -> amplitude da portadora
    fm = 500 Hz    -> frequência da mensagem
    Am = 1 V       -> amplitude da mensagem
    PM: kp = desvio_fase / Am          (desvio de fase de pico ~ 2 rad)
    FM: kf = delta_f / Am, delta_f = 5 kHz  (desvio de frequência de pico)

Escolha de fs
-------------
A maior frequência presente no sinal FM é, aproximadamente,
fc + delta_f = 15 kHz. Com fs = 200 kHz o sobreamostramento é de ~13x
(Nyquist exigiria apenas 30 kHz), o que dá folga confortável para a
transformada de Hilbert e para a derivada numérica usadas na demodulação.
"""

from dataclasses import dataclass

import numpy as np
from scipy.integrate import cumulative_trapezoid


@dataclass
class Parametros:
    fs: float = 200_000.0     # Hz  - frequência de amostragem
    fc: float = 10_000.0      # Hz  - frequência da portadora
    ac: float = 1.0           # V   - amplitude da portadora
    fm: float = 500.0         # Hz  - frequência da mensagem
    am: float = 1.0           # V   - amplitude da mensagem
    duracao: float = 0.05     # s   - 25 períodos de fm
    delta_f: float = 5_000.0  # Hz  - desvio de frequência de pico desejado (FM)
    desvio_fase: float = 2.0  # rad - desvio de fase de pico desejado (PM)

    @property
    def kp(self) -> float:
        """Sensibilidade de fase: pico de kp*m(t) igual a `desvio_fase` rad."""
        return self.desvio_fase / self.am

    @property
    def kf(self) -> float:
        """Sensibilidade de frequência: pico de kf*m(t) igual a `delta_f` Hz."""
        return self.delta_f / self.am


def vetor_tempo(p: Parametros) -> np.ndarray:
    """Vetor de tempo uniformemente amostrado a fs, começando em t = 0."""
    n_amostras = int(round(p.fs * p.duracao))
    return np.arange(n_amostras) / p.fs


def portadora(t: np.ndarray, p: Parametros) -> np.ndarray:
    """c(t) = Ac * cos(2*pi*fc*t)."""
    return p.ac * np.cos(2.0 * np.pi * p.fc * t)


def mensagem(t: np.ndarray, p: Parametros) -> np.ndarray:
    """m(t) = Am * cos(2*pi*fm*t)."""
    return p.am * np.cos(2.0 * np.pi * p.fm * t)


def modula_pm(t: np.ndarray, m: np.ndarray, p: Parametros) -> np.ndarray:
    """
    s_PM(t) = Ac * cos(2*pi*fc*t + kp*m(t))

    Implementada diretamente pela definição, sem funções prontas de
    modulação de bibliotecas externas.
    """
    return p.ac * np.cos(2.0 * np.pi * p.fc * t + p.kp * m)


def modula_fm(t: np.ndarray, m: np.ndarray, p: Parametros) -> np.ndarray:
    """
    s_FM(t) = Ac * cos(2*pi*fc*t + 2*pi*kf * integral(m(tau) dtau))

    A integral de m(t) é calculada numericamente pela regra do trapézio
    acumulada (scipy.integrate.cumulative_trapezoid), com o primeiro
    valor forçado a zero (initial=0.0).
    """
    integral_m = cumulative_trapezoid(m, t, initial=0.0)
    fase = 2.0 * np.pi * p.fc * t + 2.0 * np.pi * p.kf * integral_m
    return p.ac * np.cos(fase)
