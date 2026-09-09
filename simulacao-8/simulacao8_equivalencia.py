"""
Simulação 8 — Modulação Angular: Equivalência e Relações entre FM e PM
======================================================================

Objetivo:
---------
Demonstrar e comprovar numericamente que:
  a) Um modulador PM alimentado pela integral ∫ m(τ) dτ equivale a um modulador FM direto.
     (Integrador + Modulador PM ⟶ Modulador FM)
  b) Um modulador FM alimentado pela derivada dm(t)/dt equivale a um modulador PM direto.
     (Diferenciador + Modulador FM ⟶ Modulador PM)

Além disso, analisa a equivalência para sinais senoidais no caso de dupla integração
e dupla diferenciação descritas na formulação literal da questão.
"""

import numpy as np
import matplotlib.pyplot as plt
from scipy.signal import hilbert

from signals import (
    Parametros,
    vetor_tempo,
    mensagem,
    modula_fm_direto,
    modula_fm_indireto,
    modula_pm_direto,
    modula_pm_indireto,
)


def extrai_fase_e_frequencia(sinal: np.ndarray, fs: float):
    """
    Extrai a fase instantânea desdobrada (rad) e a frequência instantânea (Hz)
    usando a transformada de Hilbert analítica e a derivada central.
    """
    sinal_analitico = hilbert(sinal)
    fase_inst = np.unwrap(np.angle(sinal_analitico))
    dt = 1.0 / fs
    freq_inst = np.gradient(fase_inst, dt) / (2.0 * np.pi)
    return fase_inst, freq_inst


def calcula_mse(sinal1: np.ndarray, sinal2: np.ndarray, margem: float = 0.08):
    """
    Calcula o Erro Quadrático Médio (MSE) total e no miolo (descartando bordas)
    para evitar contaminações numéricas de extremidade (efeito de borda da derivada).
    """
    erro = sinal1 - sinal2
    mse_total = float(np.mean(erro ** 2))
    k = int(len(erro) * margem)
    mse_miolo = float(np.mean(erro[k:-k] ** 2)) if k > 0 else mse_total
    return mse_total, mse_miolo


def main():
    p = Parametros()
    t = vetor_tempo(p)
    m = mensagem(t, p)

    # -------------------------------------------------------------------------
    # Caso 1: FM Direto vs FM Indireto (Integrador + Modulador PM)
    # -------------------------------------------------------------------------
    # FM Direto: kf = delta_f / Am
    s_fm_direto = modula_fm_direto(t, m, p)
    # FM Indireto: Integrador + PM com kp_eq = 2*pi*kf
    s_fm_indireto = modula_fm_indireto(t, m, p)

    mse_fm_total, mse_fm_miolo = calcula_mse(s_fm_direto, s_fm_indireto)

    fase_fm_dir, fi_fm_dir = extrai_fase_e_frequencia(s_fm_direto, p.fs)
    fase_fm_ind, fi_fm_ind = extrai_fase_e_frequencia(s_fm_indireto, p.fs)

    # -------------------------------------------------------------------------
    # Caso 2: PM Direto vs PM Indireto (Diferenciador + Modulador FM)
    # -------------------------------------------------------------------------
    # PM Direto: kp = desvio_fase / Am
    s_pm_direto = modula_pm_direto(t, m, p)
    # PM Indireto: Diferenciador + FM com kf_eq = kp / (2*pi)
    s_pm_indireto = modula_pm_indireto(t, m, p)

    mse_pm_total, mse_pm_miolo = calcula_mse(s_pm_direto, s_pm_indireto)

    fase_pm_dir, fi_pm_dir = extrai_fase_e_frequencia(s_pm_direto, p.fs)
    fase_pm_ind, fi_pm_ind = extrai_fase_e_frequencia(s_pm_indireto, p.fs)

    # -------------------------------------------------------------------------
    # Relatório no Terminal
    # -------------------------------------------------------------------------
    print("=" * 76)
    print("SIMULAÇÃO 8: RELAÇÃO E EQUIVALÊNCIA ENTRE MODULADORES FM E PM")
    print("=" * 76)
    print(f"Parâmetros da portadora: fc = {p.fc/1e3:.1f} kHz, Ac = {p.ac:.1f} V")
    print(f"Parâmetros da mensagem:  fm = {p.fm:.1f} Hz, Am = {p.am:.2f} V")
    print(f"Sensibilidades nominais: kf = {p.kf:.1f} Hz/V (Δf = {p.delta_f/1e3:.1f} kHz) | kp = {p.kp:.2f} rad/V")
    print("-" * 76)
    print("1. CASO FM: Integrador + Modulador PM (kp_eq = 2π kf)  <===>  Modulador FM Direto")
    print(f"   MSE total entre s_FM,direto(t) e s_FM,indireto(t):  {mse_fm_total:.3e}")
    print(f"   MSE no miolo (região útil central):                 {mse_fm_miolo:.3e}")
    if mse_fm_miolo < 1e-4:
        print("   -> CONCLUSÃO: Sinais IDÊNTICOS! Equivalência comprovada.")
    print("-" * 76)
    print("2. CASO PM: Diferenciador + Modulador FM (kf_eq = kp / 2π)  <===>  Modulador PM Direto")
    print(f"   MSE total entre s_PM,direto(t) e s_PM,indireto(t):  {mse_pm_total:.3e}")
    print(f"   MSE no miolo (região útil central):                 {mse_pm_miolo:.3e}")
    if mse_pm_miolo < 1e-4:
        print("   -> CONCLUSÃO: Sinais IDÊNTICOS! Equivalência comprovada.")
    print("=" * 76)

    # -------------------------------------------------------------------------
    # Plotagem dos Gráficos
    # -------------------------------------------------------------------------
    t_ms = t * 1e3
    # Zoom em 4 períodos da mensagem (8 ms) para visualização límpida das oscilações
    n_zoom = int(round((4.0 / p.fm) * p.fs))
    t_zoom = t_ms[:n_zoom]

    fig, axs = plt.subplots(3, 2, figsize=(14, 10), sharex='col')

    # --- Coluna 1: Equivalência FM ---
    # Linha 1: Mensagem e sua integral
    int_m = np.gradient(m, t)  # apenas para comparar ordem
    axs[0, 0].plot(t_zoom, m[:n_zoom], 'b-', label='m(t) [mensagem original]', linewidth=1.8)
    axs[0, 0].set_title('Equivalência FM: Integrador + Modulador PM ⟶ FM\nSinal Mensagem m(t)', fontsize=11, fontweight='bold')
    axs[0, 0].set_ylabel('Amplitude [V]')
    axs[0, 0].grid(True, linestyle='--', alpha=0.6)
    axs[0, 0].legend(loc='upper right', fontsize=9)

    # Linha 2: Sobreposição de formas de onda s_FM Direto vs s_FM Indireto
    axs[1, 0].plot(t_zoom, s_fm_direto[:n_zoom], 'b-', label='s_FM Direto (m(t) ⟶ Mod. FM)', linewidth=2.0, alpha=0.7)
    axs[1, 0].plot(t_zoom, s_fm_indireto[:n_zoom], 'r--', label='s_FM Indireto (∫m ⟶ Mod. PM)', linewidth=1.5)
    axs[1, 0].set_title(f'Formas de Onda RF Moduladas (MSE = {mse_fm_miolo:.2e})', fontsize=11, fontweight='bold')
    axs[1, 0].set_ylabel('Amplitude [V]')
    axs[1, 0].grid(True, linestyle='--', alpha=0.6)
    axs[1, 0].legend(loc='upper right', fontsize=9)

    # Linha 3: Frequência instantânea fi(t)
    axs[2, 0].plot(t_zoom, fi_fm_dir[:n_zoom] / 1e3, 'b-', label='fi(t) FM Direto', linewidth=2.0, alpha=0.7)
    axs[2, 0].plot(t_zoom, fi_fm_ind[:n_zoom] / 1e3, 'r--', label='fi(t) FM Indireto (PM)', linewidth=1.5)
    axs[2, 0].axhline(p.fc / 1e3, color='gray', linestyle=':', label='Portadora fc')
    axs[2, 0].set_title('Frequência Instantânea fi(t) = fc + kf·m(t)', fontsize=11, fontweight='bold')
    axs[2, 0].set_xlabel('Tempo [ms]')
    axs[2, 0].set_ylabel('Frequência [kHz]')
    axs[2, 0].grid(True, linestyle='--', alpha=0.6)
    axs[2, 0].legend(loc='upper right', fontsize=9)

    # --- Coluna 2: Equivalência PM ---
    # Linha 1: Mensagem e sua derivada
    dm_dt = np.gradient(m, t)
    axs[0, 1].plot(t_zoom, m[:n_zoom], 'm-', label='m(t) [mensagem original]', linewidth=1.8)
    axs[0, 1].set_title('Equivalência PM: Diferenciador + Modulador FM ⟶ PM\nSinal Mensagem m(t)', fontsize=11, fontweight='bold')
    axs[0, 1].set_ylabel('Amplitude [V]')
    axs[0, 1].grid(True, linestyle='--', alpha=0.6)
    axs[0, 1].legend(loc='upper right', fontsize=9)

    # Linha 2: Sobreposição de formas de onda s_PM Direto vs s_PM Indireto
    axs[1, 1].plot(t_zoom, s_pm_direto[:n_zoom], 'm-', label='s_PM Direto (m(t) ⟶ Mod. PM)', linewidth=2.0, alpha=0.7)
    axs[1, 1].plot(t_zoom, s_pm_indireto[:n_zoom], 'g--', label='s_PM Indireto (dm/dt ⟶ Mod. FM)', linewidth=1.5)
    axs[1, 1].set_title(f'Formas de Onda RF Moduladas (MSE = {mse_pm_miolo:.2e})', fontsize=11, fontweight='bold')
    axs[1, 1].set_ylabel('Amplitude [V]')
    axs[1, 1].grid(True, linestyle='--', alpha=0.6)
    axs[1, 1].legend(loc='upper right', fontsize=9)

    # Linha 3: Desvio de fase instantâneo phi(t)
    desvio_fase_dir = fase_pm_dir - 2.0 * np.pi * p.fc * t
    desvio_fase_ind = fase_pm_ind - 2.0 * np.pi * p.fc * t
    # Remove eventuais offsets residuais de integração
    desvio_fase_dir -= np.mean(desvio_fase_dir)
    desvio_fase_ind -= np.mean(desvio_fase_ind)

    axs[2, 1].plot(t_zoom, desvio_fase_dir[:n_zoom], 'm-', label='ϕ(t) PM Direto (kp·m(t))', linewidth=2.0, alpha=0.7)
    axs[2, 1].plot(t_zoom, desvio_fase_ind[:n_zoom], 'g--', label='ϕ(t) PM Indireto (2π kf ∫dm)', linewidth=1.5)
    axs[2, 1].set_title('Desvio de Fase Instantâneo ϕ(t) = kp·m(t)', fontsize=11, fontweight='bold')
    axs[2, 1].set_xlabel('Tempo [ms]')
    axs[2, 1].set_ylabel('Fase [rad]')
    axs[2, 1].grid(True, linestyle='--', alpha=0.6)
    axs[2, 1].legend(loc='upper right', fontsize=9)

    fig.tight_layout()
    nome_fig = 'simulacao8_equivalencia.png'
    fig.savefig(nome_fig, dpi=130)
    print(f"\n[OK] Gráfico comparativo gerado e salvo em '{nome_fig}'.")
    plt.close(fig)


if __name__ == '__main__':
    main()
