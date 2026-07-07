from pydantic import BaseModel

HOST_PATTERN = r"^[^\s:/]+(\.[^\s:/]+)*$"


class BaseTransportConfig(BaseModel):
    @classmethod
    def secret_field_names(cls) -> set[str]:
        """Names of fields declared with `json_schema_extra={"secret": True}`."""
        return {
            name
            for name, field in cls.model_fields.items()
            if isinstance(field.json_schema_extra, dict)
            and field.json_schema_extra.get("secret") is True
        }
