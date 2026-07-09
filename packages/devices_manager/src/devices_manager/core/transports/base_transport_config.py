from pydantic import BaseModel

HOST_PATTERN = r"^[^\s:/]+(\.[^\s:/]+)*$"


class BaseTransportConfig(BaseModel):
    @classmethod
    def secret_field_names(cls) -> set[str]:
        """Names of fields declared secret via ``json_schema_extra={"secret": True}``.

        The rest of the stack (API masking, write-only update semantics, UI)
        keys off this single declaration so a new secret field only has to be
        marked once, on the config that owns it.
        """
        return {
            name
            for name, field in cls.model_fields.items()
            if isinstance(field.json_schema_extra, dict)
            and field.json_schema_extra.get("secret") is True
        }
