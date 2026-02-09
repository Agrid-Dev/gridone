from pydantic import BaseModel, Field


class DriverMetadata(BaseModel):
    id: str = Field(min_length=1)
    vendor: str | None = None
    model: str | None = None
    version: int | None = None

    @property
    def name(self) -> str:
        name = self.id
        for field, sep in [(self.vendor, " "), (self.model, "/"), (self.version, "@")]:
            if field is not None:
                name += f"{sep}{field}"
        return name
