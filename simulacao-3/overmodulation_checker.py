"""
Tema 3 — Algoritmo automático de verificação de sobremodulação

DISCUSSÃO TÉCNICA E ENGENHARIA DO SISTEMA REAL (Item 6 do Roteiro):
================================================================
Por que a verificação automática de sobremodulação é indispensável em um transmissor AM real?

1. Garantia da Demodulação Sem Distorção por Detecção de Envoltório:
   A detecção por diodo/envoltório baseia-se na premissa física de que o envelope (A + m(t))
   é estritamente não-negativo (A + m(t) >= 0). Caso m(t) apresente picos negativos menores que -A,
   ocorre inversão de fase na portadora nos cruzamentos de zero e ceifamento do envelope recuperado.
   Isso destrói a fidelidade do áudio transmitido, gerando distorção harmônica e de intermodulação.

2. Ajuste Automático de Ganho (CAG / AGC) e Nível de Portadora:
   Em um transmissor digital/SDR (Software Defined Radio) ou analógico moderno, o cálculo em tempo real
   de a_min = max(-m(t)) permite alimentar uma malha de controle automático. O sistema pode ajustar 
   dinamicamente o ganho do sinal de áudio m(t) antes da modulação ou ajustar a amplitude A da portadora
   para manter o índice de modulação (μ = m_max / A) o mais próximo possível de 1.0 (máxima eficiência
   de potência transmitida) sem ultrapassar o limite crítico (μ > 1).

3. Contenção de Espectro RF (Prevenção de 'Splatter' / Transbordamento Espectral):
   A sobremodulação provoca descontinuidades abruptas de fase e ceifamento da onda modulada. No domínio
   da frequência, isso se traduz por um enorme espalhamento espectral (RF splatter), gerando harmônicos
   e interferência em canais adjacentes, o que viola severamente as regulamentações de telecomunicações (ex: ANATEL/FCC).

4. Proteção de Hardware e Amplificadores de Potência (PA):
   Sinais sobremodulados impõem excursões de tensão e corrente imprevisíveis nos estágios finais de RF,
   podendo levar os transistores de potência a regiões de saturação severa ou superaquecimento por
   dissipação térmica excessiva.
"""

import json;
import numpy as np;
import pandas as pd;
import matplotlib.pyplot as plt;
from signal_generator import generate_signal;

def verifica_envelope(m, A):
    # Condição de sobremodulação: A + m(t) deve ser maior ou igual a 0 para todo instante t
    ok = np.min(A + m) >= 0.0;
    a_min = np.max(-m);
    return bool(ok), float(a_min);

def run_simulation(config_path):
    # Carrega as configurações de teste a partir do arquivo JSON
    with open(config_path, 'r') as f:
        config = json.load(f);

    results = [];

    for case in config['test_cases']:
        print(f'Processando caso de teste: {case["name"]}...');
        try:
            m = generate_signal(case);
            for A in case['A_values']:
                ok, a_min = verifica_envelope(m, A);
                results.append({
                    'Caso de Teste': case['name'],
                    'A Testado': A,
                    'a_min Sugerido': a_min,
                    'Resultado': 'OK' if ok else 'Sobremodulado',
                });
        except Exception as e:
            # Exibe erro amigável caso o áudio real ainda não tenha sido fornecido
            print(f'Erro ao processar o caso "{case["name"]}": {e}');

    if not results:
        print('Nenhum resultado gerado.');
        return;

    # Cria o DataFrame para exibição dos dados de forma estruturada
    df = pd.DataFrame(results);
    # Gera o gráfico tipo semáforo
    plot_semaphore(df);
    return df;

def plot_semaphore(df):
    # Cria uma figura com dois subplots lado a lado (1 linha, 2 colunas)
    fig, (ax_graph, ax_table) = plt.subplots(1, 2, figsize=(16, 7), gridspec_kw={'width_ratios': [1.8, 1.2]});

    # Desenha o Gráfico Semáforo no ax_graph
    colors = ['green' if r == 'OK' else 'red' for r in df['Resultado']];
    x_positions = range(len(df));

    # Desenha os pontos de teste (Semáforo verde/vermelho)
    ax_graph.scatter(x_positions, df['A Testado'], c=colors, s=150, zorder=3, edgecolors='black');

    # Desenha a marca do a_min mínimo sugerido
    ax_graph.scatter(x_positions, df['a_min Sugerido'], c='blue', marker='x', s=100, label='a_min Mínimo Necessário', zorder=2);

    # Configura os eixos e o título do gráfico
    ax_graph.set_xticks(x_positions);
    ax_graph.set_xticklabels([f'{row["Caso de Teste"]}\n(A={row["A Testado"]})' for _, row in df.iterrows()], rotation=45, ha='right');
    ax_graph.set_ylabel('Amplitude da Portadora');
    ax_graph.set_title('Visualização Tipo Semáforo: Verificação de Modulação');

    from matplotlib.lines import Line2D;
    legend_elements = [
        Line2D([0], [0], marker='o', color='w', label='OK (Sem sobremodulação)', markerfacecolor='green', markersize=12, markeredgecolor='black'),
        Line2D([0], [0], marker='o', color='w', label='Sobremodulado', markerfacecolor='red', markersize=12, markeredgecolor='black'),
        Line2D([0], [0], marker='x', color='blue', label='a_min Sugerido (Limite)', linestyle='None', markersize=10),
    ];
    ax_graph.legend(handles=legend_elements, loc='upper left');
    ax_graph.grid(True, linestyle='--', alpha=0.5);

    # Desenha a Tabela de Dados no ax_table
    ax_table.axis('off'); # Oculta os eixos do plot da tabela
    ax_table.set_title('Tabela Resumo dos Testes', fontsize=12, fontweight='bold', pad=10);

    # Arredonda valores numéricos para melhor apresentação gráfica
    df_rounded = df.copy();
    df_rounded['A Testado'] = df_rounded['A Testado'].round(4);
    df_rounded['a_min Sugerido'] = df_rounded['a_min Sugerido'].round(4);

    # Plota a tabela do matplotlib
    table = ax_table.table(
        cellText=df_rounded.values,
        colLabels=df_rounded.columns,
        loc='center',
        cellLoc='center',
    );

    # Estiliza a tabela gráfica
    table.auto_set_font_size(False);
    table.set_fontsize(10);
    table.scale(1.0, 1.8); # Escala horizontal e vertical para espaçamento interno

    # Pinta o cabeçalho e estiliza as células
    for (row, col), cell in table.get_celld().items():
        if row == 0:
            cell.set_text_props(weight='bold', color='white');
            cell.set_facecolor('#4F81BD'); # Azul clássico
        else:
            if row % 2 == 0:
                cell.set_facecolor('#DCE6F1');
            else:
                cell.set_facecolor('#FFFFFF');

    plt.tight_layout();
    plt.savefig('visualizacao_semaforo.png');
    print('\nGráfico semáforo com tabela integrada salvo como "visualizacao_semaforo.png".');
    plt.show();

if __name__ == '__main__':
    run_simulation('test_cases.json');
