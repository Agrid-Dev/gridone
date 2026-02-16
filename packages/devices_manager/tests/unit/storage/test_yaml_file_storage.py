from collections.abc import Generator
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
import yaml
from devices_manager.storage.yaml.yaml_dm_storage import YamlFileStorage
from pydantic import BaseModel


class Animal(BaseModel):
    id: str
    name: str
    species: str
    age: int


animal_1 = Animal(id="a1", name="Bob", species="cat", age=5)
animal_2 = Animal(id="a2", name="Mike", species="dog", age=2)

type AnimalStorage = YamlFileStorage[Animal]


@pytest.fixture(params=["model_cls", "factory"])
def storage(request) -> Generator[AnimalStorage]:
    with TemporaryDirectory() as temp_dir:
        if request.param == "model_cls":
            storage = YamlFileStorage[Animal](root_path=temp_dir, model_cls=Animal)
        else:

            def animal_factory(data: dict) -> Animal:
                return Animal(**data)

            storage = YamlFileStorage[Animal](
                root_path=temp_dir, factory=animal_factory
            )

        # Seed the temp directory with pre-made YAML files
        test_data_json = {a.id: a.model_dump(mode="json") for a in [animal_1, animal_2]}
        for filename, data in test_data_json.items():
            filepath = Path(temp_dir) / f"{filename}.yaml"
            with filepath.open("w") as file:
                yaml.dump(data, file)

        yield storage


@pytest.mark.asyncio
async def test_list_seeded_files(storage: AnimalStorage):
    """Test that `list()` returns the correct files after seeding."""
    files = await storage.list_all()
    assert "a1" in files
    assert "a2" in files


@pytest.mark.asyncio
async def test_read_seeded_file(storage: AnimalStorage):
    """Test that `read()` returns the correct data for a pre-seeded file."""
    data = await storage.read("a1")
    assert data == animal_1


@pytest.mark.asyncio
async def test_write_animal(storage: AnimalStorage):
    a3 = Animal(id="a3", name="Irma", species="dolphin", age=9)
    await storage.write("a3", a3)
    assert await storage.read("a3") == a3


@pytest.mark.asyncio
async def test_delete_animal(storage: AnimalStorage):
    await storage.delete("a1")
    with pytest.raises(FileNotFoundError):
        await storage.read("a1")


def test_create_root_dir_if_not_existing():
    with TemporaryDirectory() as temp_dir:
        target = Path(temp_dir) / "subdir"
        _ = YamlFileStorage(target, model_cls=Animal)
        assert target.is_dir()


def test_cannot_create_without_builder():
    with pytest.raises(ValueError):  # noqa: PT011
        _ = YamlFileStorage("test")


def test_cannot_create_with_mode_than_one_builder():
    def animal_factory(data: dict) -> Animal:
        return Animal.model_validate(data)

    with pytest.raises(ValueError):  # noqa: PT011
        _ = YamlFileStorage("test", model_cls=Animal, factory=animal_factory)
