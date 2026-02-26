from .assets_router import router as assets_router
from .devices_router import router as devices_router
from .drivers_router import router as drivers_router
from .roles_router import router as roles_router
from .timeseries_router import router as timeseries_router
from .transports_router import router as transports_router

__all__ = [
    "assets_router",
    "devices_router",
    "drivers_router",
    "roles_router",
    "timeseries_router",
    "transports_router",
]
