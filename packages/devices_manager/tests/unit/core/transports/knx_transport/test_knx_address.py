from devices_manager.core.transports.knx_transport import KNXAddress


class TestKNXAddress:
    def test_from_str(self) -> None:
        addr = KNXAddress.from_str("1/0/0")
        assert addr.topic == "1/0/0"

    def test_from_dict(self) -> None:
        addr = KNXAddress.from_dict({"topic": "2/1/3"})
        assert addr.topic == "2/1/3"

    def test_from_raw_str(self) -> None:
        addr = KNXAddress.from_raw("3/2/1")
        assert addr.topic == "3/2/1"

    def test_from_raw_dict(self) -> None:
        addr = KNXAddress.from_raw({"topic": "3/2/1"})
        assert addr.topic == "3/2/1"

    def test_id_differs_by_topic(self) -> None:
        assert KNXAddress(topic="1/0/0").id != KNXAddress(topic="1/0/1").id

    def test_id_is_deterministic(self) -> None:
        assert KNXAddress(topic="1/0/0").id == KNXAddress(topic="1/0/0").id

    def test_id_stable_across_construction_methods(self) -> None:
        a = KNXAddress.from_raw("1/0/0")
        b = KNXAddress.from_raw({"topic": "1/0/0"})
        assert a.id == b.id
