import numpy as np;
from scipy import signal;
from scipy.io import wavfile;

def generate_signal(config):
    # Gera o sinal com base no tipo especificado na configuração
    sig_type = config['type'];
    params = config['params'];

    if sig_type == 'sine':
        t = np.linspace(0.0, params['duration'], int(params['sample_rate'] * params['duration']), endpoint=False);
        return params['amplitude'] * np.sin(2.0 * np.pi * params['frequency'] * t);

    elif sig_type == 'dual_sine':
        t = np.linspace(0.0, params['duration'], int(params['sample_rate'] * params['duration']), endpoint=False);
        sig = params['amp1'] * np.sin(2.0 * np.pi * params['freq1'] * t) + params['amp2'] * np.sin(2.0 * np.pi * params['freq2'] * t);
        return sig;

    elif sig_type == 'sawtooth' or sig_type == 'triangular':
        t = np.linspace(0.0, params['duration'], int(params['sample_rate'] * params['duration']), endpoint=False);
        width = params.get('width', 0.5); # width=0.5 gera onda triangular simétrica
        return params['amplitude'] * signal.sawtooth(2.0 * np.pi * params['frequency'] * t, width=width);

    elif sig_type == 'noise':
        np.random.seed(params.get('seed', 42));
        num_samples = int(params['sample_rate'] * params['duration']);
        return params['scale'] * np.random.randn(num_samples);

    elif sig_type == 'audio':
        # Lê o arquivo de áudio real do caminho configurado
        sample_rate, data = wavfile.read(params['file_path']);

        # Converte para mono caso o áudio seja estéreo
        if len(data.shape) > 1:
            data = data[:, 0];

        # Normaliza a amplitude para floats na faixa de -1.0 a 1.0 se for inteiro
        if data.dtype == np.int16:
            data = data / 32768.0;
        elif data.dtype == np.int32:
            data = data / 2147483648.0;

        return data;

    else:
        raise ValueError(f'Unknown signal type: {sig_type}');
