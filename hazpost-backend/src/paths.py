import os

_DEFAULT_DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')


def get_data_dir() -> str:
    return os.environ.get('DATA_DIR', _DEFAULT_DATA_DIR)


def data_path(*parts) -> str:
    return os.path.join(get_data_dir(), *parts)
