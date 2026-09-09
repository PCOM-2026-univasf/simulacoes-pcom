"""
Bootstrap portátil da Simulação 8 — Tópico 8: Demodulação de FM e de PM.
========================================================================
Verifica as dependências (numpy, scipy, matplotlib), localiza o ambiente
virtual adequado e executa o script principal da Simulação 8:
`topico8_demodulacao.py`.
"""

import os
import sys
import subprocess

DEPENDENCIAS = ['numpy', 'scipy', 'matplotlib']


def busca_python_valido():
    """Tenta localizar um interpretador Python com as dependências instaladas."""
    # 1. Verifica o interpretador atual
    try:
        import numpy  # noqa: F401
        import scipy  # noqa: F401
        import matplotlib  # noqa: F401
        return sys.executable
    except ImportError:
        pass

    # 2. Verifica se existe .venv ou venv no diretório pai ou atual
    candidatos = [
        os.path.join('..', '.venv', 'bin', 'python3'),
        os.path.join('..', '.venv', 'bin', 'python'),
        os.path.join('..', 'venv', 'bin', 'python3'),
        os.path.join('.venv', 'bin', 'python3'),
        os.path.join('venv', 'bin', 'python3'),
        os.path.join('..', '.venv', 'Scripts', 'python.exe'),
        os.path.join('.venv', 'Scripts', 'python.exe'),
    ]
    for c in candidatos:
        if os.path.exists(c):
            try:
                res = subprocess.run([c, '-c', 'import numpy, scipy, matplotlib; print(1)'],
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                if res.returncode == 0:
                    return c
            except Exception:
                continue

    return None


def instala_dependencias(python_bin):
    """Instala dependências no ambiente virtual indicado."""
    print(f'Instalando {", ".join(DEPENDENCIAS)} via {python_bin}...')
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
    script_alvo = 'topico8_demodulacao.py'
    python_alvo = busca_python_valido()

    if not python_alvo:
        print('Dependências faltando. Criando ambiente virtual local "venv"...')
        subprocess.run([sys.executable, '-m', 'venv', 'venv'], check=True)
        if os.name == 'nt':
            python_alvo = os.path.join('venv', 'Scripts', 'python.exe')
        else:
            python_alvo = os.path.join('venv', 'bin', 'python')
        if not instala_dependencias(python_alvo):
            sys.exit(1)

    print(f'\nExecutando {script_alvo} com {python_alvo}...\n')
    subprocess.run([python_alvo, script_alvo], check=True)


if __name__ == '__main__':
    main()
