from core.types import AttributeValueType
from pydantic import BaseModel


class AttributeUpdate(BaseModel):
    value: AttributeValueType
