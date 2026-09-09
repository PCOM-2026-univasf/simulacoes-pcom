# Tema 3 — Algoritmo automático de verificação de sobremodulação

Esse repositório contém o código necessário para decidir programaticamente se um sinal AM pode ser demodulado por detecção de envoltório, e sugere o valor mínimo de portadora necessário.

---

## Estrutura

- `test_cases.json`: Arquivo de configuração flexível contendo os dados dos casos de teste (seno simples, soma de senos, sinal triangular, ruído aleatório e arquivo de áudio real) e as amplitudes $A$ a serem testadas.
- `signal_generator.py`: Módulo responsável por converter as definições de sinais do JSON em vetores de dados.
- `overmodulation_checker.py`: Script principal contendo a função de verificação matemática `verifica_envelope()` e a geração dos plots de análise.
- `run.py`: Script portátil utilitário de bootstrap.

---

## Executando

1. **Clone o repositório** e entre na pasta do projeto.
2. Execute o script inicializador:
   ```bash
   python3 run.py
   ```

---

## Discentes

- Paulo Henrique de Farias Martins
- Caua Tavares Nunes
- Vitor Rocha Machado
- Vitor Gonçalves dos Santos
- José Victor Cruz Rebouças
