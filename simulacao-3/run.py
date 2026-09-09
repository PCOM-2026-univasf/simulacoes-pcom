import os;
import sys;
import subprocess;

def check_file_exists(filename):
    return os.path.exists(filename);

def install_dependencies(python_bin):
    print(f'Instalando dependências (numpy, scipy, pandas, matplotlib) usando {python_bin}...');
    try:
        # Tenta atualizar o pip de forma silenciosa
        subprocess.run([python_bin, '-m', 'pip', 'install', '--upgrade', 'pip'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL);
        # Instala as dependências necessárias
        subprocess.run([
            python_bin,
            '-m',
            'pip',
            'install',
            'numpy',
            'scipy',
            'pandas',
            'matplotlib',
        ], check=True);
        print('Dependências instaladas com sucesso!');
        return True;
    except subprocess.CalledProcessError as e:
        print(f'Falha na instalação automática de dependências: {e}');
        return False;

def main():
    # Determina o ambiente e a instalação das dependências
    in_venv = (sys.prefix != sys.base_prefix);
    python_to_run = sys.executable;
    dependencies_ok = False;

    # Tenta importar para verificar se já estão disponíveis no sistema
    try:
        import numpy;
        import scipy;
        import pandas;
        import matplotlib;
        dependencies_ok = True;
        print('\nTodas as dependências (numpy, scipy, pandas, matplotlib) já estão instaladas.');
    except ImportError:
        print('\nAlgumas dependências estão faltando no ambiente atual.');

    if not dependencies_ok:
        if in_venv:
            # Se já estiver dentro de um venv ativo, instala diretamente nele
            dependencies_ok = install_dependencies(sys.executable);
        else:
            # Cria um venv local para isolar as dependências
            print('Criando um ambiente virtual local "venv" para isolar as dependências...');
            try:
                subprocess.run([sys.executable, '-m', 'venv', 'venv'], check=True);
                
                # Localiza o executável do Python correto dentro do venv
                if os.name == 'nt':
                    python_to_run = os.path.join('venv', 'Scripts', 'python.exe');
                else:
                    python_to_run = os.path.join('venv', 'bin', 'python');
                    
                dependencies_ok = install_dependencies(python_to_run);
            except Exception as e:
                print(f'\nNão foi possível criar o ambiente virtual automaticamente: {e}');
                print('\nPara rodar em sistemas Debian/Ubuntu, recomendamos instalar as dependências globais ou os pacotes de venv rodando:');
                print('sudo apt update && sudo apt install -y python3-numpy python3-scipy python3-pandas python3-matplotlib python3-tk python3-venv');
                sys.exit(1);

    # 3. Executa a simulação principal
    print('\nIniciando a simulação de sobremodulação AM...');
    try:
        subprocess.run([python_to_run, 'overmodulation_checker.py'], check=True);
    except Exception as e:
        print(f'Erro ao executar a simulação: {e}');
        sys.exit(1);

if __name__ == '__main__':
    main();
