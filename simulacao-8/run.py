"""
Bootstrap portátil da Simulação 8.

Verifica as dependências (numpy, scipy, matplotlib); se faltarem, cria um
ambiente virtual local "venv" e as instala nele. Em seguida executa o
script do Tópico 8.
"""

import os
import sys
import subprocess

DEPENDENCIAS = ['numpy', 'scipy', 'matplotlib']
SCRIPT_ALVO = 'topico8_demodulacao.py'


def instala_dependencias(python_bin):
    print(f'Instalando {", ".join(DEPENDENCIAS)} com {python_bin}...')
    try:
        subprocess.run(
            [python_bin, '-m', 'pip', 'install', '--upgrade', 'pip'],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        subprocess.run(
            [python_bin, '-m', 'pip', 'install', *DEPENDENCIAS], check=True,
        )
        print('Dependências instaladas com sucesso.')
        return True
    except subprocess.CalledProcessError as erro:
        print(f'Falha na instalação automática: {erro}')
        return False


def main():
    try:
        import numpy  # noqa: F401
        import scipy  # noqa: F401
        import matplotlib  # noqa: F401
        print('Dependências já disponíveis no ambiente atual.')
        python_alvo = sys.executable
    except ImportError:
        print('Dependências faltando no ambiente atual.')
        dentro_de_venv = sys.prefix != sys.base_prefix

        if dentro_de_venv:
            python_alvo = sys.executable
            if not instala_dependencias(python_alvo):
                sys.exit(1)
        else:
            print('Criando ambiente virtual local "venv"...')
            subprocess.run([sys.executable, '-m', 'venv', 'venv'], check=True)
            if os.name == 'nt':
                python_alvo = os.path.join('venv', 'Scripts', 'python.exe')
            else:
                python_alvo = os.path.join('venv', 'bin', 'python')
            if not instala_dependencias(python_alvo):
                sys.exit(1)

    print(f'\nExecutando {SCRIPT_ALVO}...\n')
    subprocess.run([python_alvo, SCRIPT_ALVO], check=True)


if __name__ == '__main__':
    main()
