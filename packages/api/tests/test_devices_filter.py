from api.devices_filter import to_list_devices_kwargs


class TestToListDevicesKwargs:
    def test_no_asset_id_passthrough(self):
        assert to_list_devices_kwargs({"types": ["thermostat"]}) == {
            "types": ["thermostat"]
        }

    def test_asset_id_translated_to_tag(self):
        assert to_list_devices_kwargs({"asset_id": "a1"}) == {
            "tags": {"asset_id": ["a1"]}
        }

    def test_asset_id_merges_into_existing_tags(self):
        assert to_list_devices_kwargs(
            {"asset_id": "a2", "tags": {"asset_id": ["a1"], "zone": ["north"]}}
        ) == {"tags": {"asset_id": ["a1", "a2"], "zone": ["north"]}}

    def test_duplicate_asset_id_not_reappended(self):
        assert to_list_devices_kwargs(
            {"asset_id": "a1", "tags": {"asset_id": ["a1"]}}
        ) == {"tags": {"asset_id": ["a1"]}}

    def test_none_asset_id_stripped(self):
        assert to_list_devices_kwargs({"asset_id": None, "types": ["t"]}) == {
            "types": ["t"]
        }

    def test_input_dict_not_mutated(self):
        original = {"asset_id": "a1", "tags": {"asset_id": ["a0"]}}
        to_list_devices_kwargs(original)
        assert original == {"asset_id": "a1", "tags": {"asset_id": ["a0"]}}
