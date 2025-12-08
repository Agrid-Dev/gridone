from api import create_app
from logging_config import LOGGING_CONFIG  # ty: ignore[unresolved-import]

app = create_app(logging_dict_config=LOGGING_CONFIG)
