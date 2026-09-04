"""FastAPI dependencies wiring app state and query params into routes."""

from automations import AutomationsServiceInterface
from dashboards import DashboardsServiceInterface
from fastapi import Depends, Query, Request
from starlette.requests import HTTPConnection

from api.targets import CompositeTargetResolver
from apps import AppsService
from assets import AssetsService
from commands import CommandsServiceInterface
from devices_manager import DevicesServiceInterface
from models.pagination import PaginationParams
from notifications import NotificationsServiceInterface
from timeseries import TimeSeriesService
from users import UsersService
from users.auth import AuthService


def get_device_manager(request: Request) -> DevicesServiceInterface:
    return request.app.state.device_manager


def get_target_resolver(
    dm: DevicesServiceInterface = Depends(get_device_manager),
) -> CompositeTargetResolver:
    return CompositeTargetResolver(dm)


def get_ts_service(request: Request) -> TimeSeriesService:
    return request.app.state.ts_service


def get_users_service(request: HTTPConnection) -> UsersService:
    return request.app.state.users_service


def get_commands_service(request: Request) -> CommandsServiceInterface:
    return request.app.state.commands_service


def get_apps_service(request: Request) -> AppsService:
    return request.app.state.apps_service


def get_automations_service(request: Request) -> AutomationsServiceInterface:
    return request.app.state.automations_service


def get_notifications_service(request: Request) -> NotificationsServiceInterface:
    return request.app.state.notifications_service


def get_assets_service(request: Request) -> AssetsService:
    return request.app.state.assets_service


def get_dashboards_service(request: Request) -> DashboardsServiceInterface:
    return request.app.state.dashboards_service


def get_auth_service(request: HTTPConnection) -> AuthService:
    return request.app.state.auth_service


def get_pagination_params(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
) -> PaginationParams:
    return PaginationParams(page=page, size=size)
