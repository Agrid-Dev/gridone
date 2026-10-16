from api.devices_filter import with_asset_tag


class TestWithAssetTag:
    def test_no_asset_id_returns_the_tags_as_is(self):
        tags = {"zone": ["north"]}
        assert with_asset_tag(tags, None) is tags

    def test_no_asset_id_and_no_tags_is_no_filter(self):
        assert with_asset_tag(None, None) is None

    def test_asset_id_becomes_a_tag(self):
        assert with_asset_tag(None, "a1") == {"asset_id": ["a1"]}

    def test_asset_id_merges_into_existing_tags(self):
        assert with_asset_tag({"asset_id": ["a1"], "zone": ["north"]}, "a2") == {
            "asset_id": ["a1", "a2"],
            "zone": ["north"],
        }

    def test_duplicate_asset_id_not_reappended(self):
        assert with_asset_tag({"asset_id": ["a1"]}, "a1") == {"asset_id": ["a1"]}

    def test_input_tags_not_mutated(self):
        original = {"asset_id": ["a0"]}
        with_asset_tag(original, "a1")
        assert original == {"asset_id": ["a0"]}
