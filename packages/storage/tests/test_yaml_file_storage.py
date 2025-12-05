from collections.abc import Generator  # noqa: INP001
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import TypedDict

import pytest
import yaml
from storage import YamlFileStorage


class Animal(TypedDict):
    id: str
    name: str
    species: str
    age: int


animal_1: Animal = {"id": "a1", "name": "Bob", "species": "cat", "age": 5}
animal_2: Animal = {"id": "a2", "name": "Mike", "species": "dog", "age": 2}

type AnimalStorage = YamlFileStorage[Animal]


@pytest.fixture
def seeded_storage() -> Generator[AnimalStorage]:
    """Fixture to create a YamlFileStorage instance with pre-seeded YAML files."""
    with TemporaryDirectory() as temp_dir:
        # Create a storage instance
        storage = YamlFileStorage(root_path=temp_dir)

        # Seed the temp directory with pre-made YAML files
        test_files = {a["id"]: a for a in [animal_1, animal_2]}

        for filename, data in test_files.items():
            filepath = Path(temp_dir) / f"{filename}.yaml"
            with filepath.open("w") as file:
                yaml.dump(data, file)

        yield storage


def test_list_seeded_files(seeded_storage: AnimalStorage):
    """Test that `list()` returns the correct files after seeding."""
    files = seeded_storage.list_all()
    assert "a1" in files
    assert "a2" in files


def test_read_seeded_file(seeded_storage: AnimalStorage):
    """Test that `read()` returns the correct data for a pre-seeded file."""
    data = seeded_storage.read("a1")
    assert data == animal_1


def test_write_animal(seeded_storage: AnimalStorage):
    a3: Animal = {"id": "a3", "name": "Irma", "species": "dolphin", "age": 9}
    seeded_storage.write("a3", a3)
    assert seeded_storage.read("a3") == a3


def test_delete_animal(seeded_storage: AnimalStorage):
    seeded_storage.delete("a1")
    with pytest.raises(FileNotFoundError):
        seeded_storage.read("a1")
