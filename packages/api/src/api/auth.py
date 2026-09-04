"""Authentication and authorization dependencies.

`authenticate` is the transport-agnostic core: it turns a bearer credential into
a validated identity. Everything around it is one controller's way of finding
that credential and of rendering the two refusals `authenticate` can reach for.
"""

from collections.abc import Callable

from fastapi import (
    Depends,
    HTTPException,
    Request,
    WebSocket,
    WebSocketException,
    status,
)
from fastapi.security import OAuth2PasswordBearer
from starlette.status import WS_1008_POLICY_VIOLATION

from api.dependencies import get_auth_service, get_users_service
from api.permissions import Permission, get_permissions_for_role
from models.errors import BlockedUserError
from users import UsersService
from users.auth import AuthService, InvalidTokenError, TokenPayload
from users.models import Role

_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token", auto_error=False)

_WS_BEARER_SUBPROTOCOL_PREFIX = "gridone.auth.bearer."

_NOT_AUTHENTICATED = "Not authenticated"
_BLOCKED = "Account is blocked"


type Denial = Callable[[str], Exception]


async def authenticate(
    token: str | None,
    auth_service: AuthService,
    users_service: UsersService,
    *,
    unauthenticated: Denial,
    blocked: Denial,
) -> TokenPayload:
    """Validate a bearer credential and return the identity behind it.

    Transport-agnostic. Finding the credential and refusing a caller are the
    controller's job, so it supplies both refusals as constructors: an HTTP route
    wants a 401 or a 403 response, a WebSocket wants a 1008 close.
    """
    if token is None:
        raise unauthenticated(_NOT_AUTHENTICATED)

    try:
        payload = auth_service.decode_token(token, expected_type="access")
    except InvalidTokenError as e:
        raise unauthenticated(_NOT_AUTHENTICATED) from e

    if await users_service.is_blocked(payload.sub):
        raise blocked(_BLOCKED)

    return payload


async def get_current_token_payload(
    request: Request,
    token: str | None = Depends(_oauth2_scheme),
    auth_service: AuthService = Depends(get_auth_service),
    users_service: UsersService = Depends(get_users_service),
) -> TokenPayload:
    """Authenticate an HTTP request.

    The same generic 401 whatever failed, so the response never says which
    credential check did. A blocked account keeps its own 403, rendered by the
    `BlockedUserError` handler in `exception_handlers`.
    """
    return await authenticate(
        token or request.cookies.get("access_token"),
        auth_service,
        users_service,
        unauthenticated=lambda reason: HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=reason,
            headers={"WWW-Authenticate": "Bearer"},
        ),
        blocked=BlockedUserError,
    )


async def get_current_user_id(
    payload: TokenPayload = Depends(get_current_token_payload),
) -> str:
    return payload.sub


def _websocket_credential(websocket: WebSocket) -> str | None:
    """Read the access token offered by a WebSocket handshake.

    A browser cannot set headers on a `WebSocket`, so the token rides in a
    `gridone.auth.bearer.<jwt>` subprotocol offer — a JWT is made only of
    characters RFC 6455 allows in a subprotocol name. Other clients may send
    `Authorization: Bearer <jwt>` instead.
    """
    for offer in websocket.scope.get("subprotocols", []):
        if offer.startswith(_WS_BEARER_SUBPROTOCOL_PREFIX):
            return offer.removeprefix(_WS_BEARER_SUBPROTOCOL_PREFIX)

    scheme, _, token = websocket.headers.get("authorization", "").partition(" ")
    return token if scheme.lower() == "bearer" and token else None


def _websocket_denial(reason: str) -> Exception:
    return WebSocketException(code=WS_1008_POLICY_VIOLATION, reason=reason)


async def get_websocket_token_payload(
    websocket: WebSocket,
    auth_service: AuthService = Depends(get_auth_service),
    users_service: UsersService = Depends(get_users_service),
) -> TokenPayload:
    """Authenticate a WebSocket handshake.

    Refusals are `WebSocketException`, never `HTTPException`, which would write an
    HTTP response into a WebSocket scope. Starlette closes with the code before
    `accept()`, and uvicorn renders that as an HTTP 403 handshake rejection.

    No permission check: the feed carries device reads, and `viewer` — the lowest
    role — already holds `devices:read`, so being a user is the whole gate. Should
    the feed ever narrow per user, the check belongs here.
    """
    return await authenticate(
        _websocket_credential(websocket),
        auth_service,
        users_service,
        unauthenticated=_websocket_denial,
        blocked=_websocket_denial,
    )


def require_permission(perm: Permission) -> Callable:
    """Factory that returns a FastAPI dependency enforcing *perm*."""

    async def _check(
        payload: TokenPayload = Depends(get_current_token_payload),
    ) -> str:
        allowed = get_permissions_for_role(Role(payload.role))
        if perm not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: requires {perm}",
            )
        return payload.sub

    return _check
