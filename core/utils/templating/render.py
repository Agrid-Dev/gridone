import re
from typing import TypedDict, TypeVar, Unpack

DEFAULT_TEMPLATE_PATTERN = r"\$\{(\w+)\}"

type TemplatingContext = dict[str, str | float | bool]


class RenderStrKwargs(TypedDict, total=False):
    template_pattern: str
    raise_for_missing_context: bool


def render_str(
    template: str,
    context: TemplatingContext,
    *,
    template_pattern: str = DEFAULT_TEMPLATE_PATTERN,
    raise_for_missing_context: bool = False,
) -> str:
    """Renders a template string using a data dictionary.
    Matches field names to dictionary keys and replaces by values."""

    def replacer(match: re.Match) -> str:
        key = match.group(1)
        return str(context.get(key, match.group(0)))

    result = re.sub(template_pattern, replacer, template)
    if raise_for_missing_context:
        remaining = re.findall(template_pattern, result)
        if remaining:
            msg = f"Missing context for keys: {remaining}"
            raise ValueError(msg)
    return result


Struct = TypeVar("Struct", bound=dict | list | str)


def render_struct[Struct: dict | list | str](
    struct: Struct,
    context: TemplatingContext,
    **kwargs: Unpack[RenderStrKwargs],
) -> Struct:
    """Recursively renders strings within a nested structure using a data dictionary.
    Matches field names to dictionary keys and replaces by values."""
    if isinstance(struct, str):
        return render_str(struct, context, **kwargs)  # ty: ignore[invalid-return-type]
    if isinstance(struct, list):
        return [render_struct(item, context, **kwargs) for item in struct]  # ty: ignore[invalid-return-type]
    if isinstance(struct, dict):
        return {  # ty: ignore[invalid-return-type]
            render_str(key, context, **kwargs): render_struct(value, context, **kwargs)
            for key, value in struct.items()
        }
    return struct
