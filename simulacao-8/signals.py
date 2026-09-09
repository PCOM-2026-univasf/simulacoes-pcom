"""
Simulação 8 — Modulação Angular (FM e PM)
=========================================
Geração dos sinais base, modulações angulares diretas e modulações equivalentes
(geração indireta: Integrador + PM -> FM; Diferenciador + FM -> PM).

Equivalências fundamentais de modulação angular:
------------------------------------------------
1. Geração de FM via modulador de fase (PM):
   m(t) -> [ Integrador ∫ ] -> x(t) = ∫m(τ)dτ -> [ Modulador PM (kp = 2π kf) ] -> s_FM(t)
   Fase gerada: θ(t) = 2π fc t + kp ∫m(τ)dτ = 2π fc t + 2π kf ∫m(τ)dτ
   Frequência instantânea: fi(t) = fc + (kp / 2π) m(t) = fc + kf m(t) (FM exato).

2. Geração de PM via modulador de frequência (FM):
   m(t) -> [ Diferenciador d/dt ] -> y(t) = dm/dt -> [ Modulador FM (kf = kp / 2π) ] -> s_PM(t)
   Fase gerada: θ(t) = 2π fc t + 2π kf ∫ (dm/dτ) dτ = 2π fc t + 2π kf m(t) = 2π fc t + kp m(t) (PM exato).
"""

from dataclasses import dataclass
import numpy as np
from scipy.integrate import cumulative_trapezoid


@dataclass
class Parametros:
    """
    Parâmetros padrão da simulação com sobreamostragem adequada.
    
    fs: Frequência de amostragem (200 kHz)
    fc: Frequência da portadora (10 kHz)
    ac: Amplitude da portadora (1 V)
    fm: Frequência do sinal mensagem (500 Hz)
    am: Amplitude da mensagem (1 V)
    duracao: Duração do sinal em segundos (50 ms -> 25 ciclos de fm)
    delta_f: Desvio de frequência de pico desejado para FM (5 kHz)
    desvio_fase: Desvio de fase de pico desejado para PM (2.0 rad)
    """
    fs: float = 200_000.0     # Hz  - frequência de amostragem
    fc: float = 10_000.0      # Hz  - frequência da portadora
    ac: float = 1.0           # V   - amplitude da portadora
    fm: float = 500.0         # Hz  - frequência da mensagem
    am: float = 1.0           # V   - amplitude da mensagem
    duracao: float = 0.05     # s   - duração total
    delta_f: float = 5_000.0  # Hz  - desvio de frequência de pico (FM)
    desvio_fase: float = 2.0  # rad - desvio de fase de pico (PM)

    @property
    def kp(self) -> float:
        """Sensibilidade de fase (rad/V): desvio_fase / am."""
        return self.desvio_fase / self.am

    @property
    def kf(self) -> float:
        """Sensibilidade de frequência (Hz/V): delta_f / am."""
        return self.delta_f / self.am


def vetor_tempo(p: Parametros) -> np.ndarray:
    """Retorna o vetor de tempo discretizado uniformemente a partir de t = 0."""
    n_amostras = int(round(p.fs * p.duracao))
    return np.arange(n_amostras) / p.fs


def portadora(t: np.ndarray, p: Parametros) -> np.ndarray:
    """Gera a portadora pura c(t) = Ac * cos(2*pi*fc*t)."""
    return p.ac * np.cos(2.0 * np.pi * p.fc * t)


def mensagem(t: np.ndarray, p: Parametros) -> np.ndarray:
    """Gera o sinal mensagem senoidal m(t) = Am * cos(2*pi*fm*t)."""
    return p.am * np.cos(2.0 * np.pi * p.fm * t)


def integra_sinal(sinal: np.ndarray, t: np.ndarray) -> np.ndarray:
    """
    Calcula a integral acumulada de um sinal discreto usando a regra do trapézio.
    Condição inicial fixada em 0 (initial=0.0).
    """
    return cumulative_trapezoid(sinal, t, initial=0.0)


def deriva_sinal(sinal: np.ndarray, t: np.ndarray) -> np.ndarray:
    """
    Calcula a derivada numérica temporal de um sinal discreto por diferença finita central.
    """
    return np.gradient(sinal, t)


# =============================================================================
# Modulação de Fase (PM): Direta e Indireta (via Diferenciador + Modulador FM)
# =============================================================================

def modula_pm_direto(t: np.ndarray, m: np.ndarray, p: Parametros) -> np.ndarray:
    """
    Modulador PM Direto:
    s_PM(t) = Ac * cos(2*pi*fc*t + kp * m(t))
    """
    fase_total = 2.0 * np.pi * p.fc * t + p.kp * m
    return p.ac * np.cos(fase_total)


def modula_pm_indireto(t: np.ndarray, m: np.ndarray, p: Parametros) -> np.ndarray:
    """
    Geração Indireta de PM: Diferenciador + Modulador FM
    Diagrama de blocos:
      m(t) -> [ Diferenciador d/dt ] -> y(t) = dm/dt -> [ Modulador FM ] -> s_PM(t)

    Formalismo matemático:
      Se o modulador FM tem sensibilidade kf_eq = kp / (2*pi), sua saída é:
      s(t) = Ac * cos(2*pi*fc*t + 2*pi*kf_eq * ∫ y(τ) dτ)
           = Ac * cos(2*pi*fc*t + kp * ∫ (dm/dτ) dτ)
           = Ac * cos(2*pi*fc*t + kp * m(t))  [identicamente PM direto!]
    """
    # 1. Diferenciação da mensagem
    dm_dt = deriva_sinal(m, t)

    # 2. Modulação em frequência do sinal diferenciado com kf_eq = kp / (2*pi)
    kf_eq = p.kp / (2.0 * np.pi)
    integral_dm = integra_sinal(dm_dt, t)

    # Subtrai o valor inicial para manter a referência m(t) - m(0)
    integral_dm_alinhada = integral_dm + m[0]

    fase_total = 2.0 * np.pi * p.fc * t + 2.0 * np.pi * kf_eq * integral_dm_alinhada
    return p.ac * np.cos(fase_total)


# =============================================================================
# Modulação de Frequência (FM): Direta e Indireta (via Integrador + Modulador PM)
# =============================================================================

def modula_fm_direto(t: np.ndarray, m: np.ndarray, p: Parametros) -> np.ndarray:
    """
    Modulador FM Direto:
    s_FM(t) = Ac * cos(2*pi*fc*t + 2*pi*kf * ∫₀ᵗ m(τ) dτ)
    """
    integral_m = integra_sinal(m, t)
    fase_total = 2.0 * np.pi * p.fc * t + 2.0 * np.pi * p.kf * integral_m
    return p.ac * np.cos(fase_total)


def modula_fm_indireto(t: np.ndarray, m: np.ndarray, p: Parametros) -> np.ndarray:
    """
    Geração Indireta de FM: Integrador + Modulador PM
    Diagrama de blocos:
      m(t) -> [ Integrador ∫ ] -> x(t) = ∫m(τ)dτ -> [ Modulador PM ] -> s_FM(t)

    Formalismo matemático:
      Se o modulador PM tem sensibilidade kp_eq = 2*pi*kf, sua saída é:
      s(t) = Ac * cos(2*pi*fc*t + kp_eq * x(t))
           = Ac * cos(2*pi*fc*t + 2*pi*kf * ∫₀ᵗ m(τ) dτ)  [identicamente FM direto!]
    """
    # 1. Integração da mensagem
    int_m = integra_sinal(m, t)

    # 2. Modulação em fase com kp_eq = 2*pi*kf
    kp_eq = 2.0 * np.pi * p.kf
    fase_total = 2.0 * np.pi * p.fc * t + kp_eq * int_m
    return p.ac * np.cos(fase_total)


# Aliases para retrocompatibilidade
modula_pm = modula_pm_direto
modula_fm = modula_fm_direto
