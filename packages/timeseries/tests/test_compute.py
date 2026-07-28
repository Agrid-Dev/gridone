import sys
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "fixtures"))
import compute

_UTC = UTC


def _dt(iso: str) -> datetime:
    return datetime.fromisoformat(iso).astimezone(_UTC)


def _pts(*pairs: tuple[str, float]) -> list[compute.Point]:
    return [(_dt(ts), v) for ts, v in pairs]


class TestApply:
    def test_avg_two_points(self) -> None:
        pts = _pts(
            ("2025-01-01T01:00:00+00:00", 10.0), ("2025-01-01T02:00:00+00:00", 20.0)
        )
        val, dt = compute.apply(
            "avg",
            pts,
            _dt("2025-01-01T00:00:00+00:00"),
            _dt("2025-01-02T00:00:00+00:00"),
            None,
            "float",
        )
        assert val == 15.0
        assert dt == "float"

    def test_avg_single_point(self) -> None:
        pts = _pts(("2025-01-01T01:00:00+00:00", 30.0))
        val, _ = compute.apply(
            "avg",
            pts,
            _dt("2025-01-01T00:00:00+00:00"),
            _dt("2025-01-02T00:00:00+00:00"),
            None,
            "float",
        )
        assert val == 30.0

    def test_count_empty_bin_is_zero(self) -> None:
        val, dt = compute.apply(
            "count",
            [],
            _dt("2025-01-01T00:00:00+00:00"),
            _dt("2025-01-02T00:00:00+00:00"),
            99.0,
            "float",
        )
        assert val == 0
        assert dt == "int"

    def test_sum_empty_bin_is_zero(self) -> None:
        val, _ = compute.apply(
            "sum",
            [],
            _dt("2025-01-01T00:00:00+00:00"),
            _dt("2025-01-02T00:00:00+00:00"),
            5.0,
            "float",
        )
        assert val == 0

    def test_first_locf_carries_to_empty_bin(self) -> None:
        val, _ = compute.apply(
            "first",
            [],
            _dt("2025-01-01T00:00:00+00:00"),
            _dt("2025-01-02T00:00:00+00:00"),
            "carried",
            "str",
        )
        assert val == "carried"

    def test_last_locf_carries_to_empty_bin(self) -> None:
        val, _ = compute.apply(
            "last",
            [],
            _dt("2025-01-01T00:00:00+00:00"),
            _dt("2025-01-02T00:00:00+00:00"),
            7.0,
            "float",
        )
        assert val == 7.0

    def test_min_max(self) -> None:
        pts = _pts(
            ("2025-01-01T01:00:00+00:00", 3.0),
            ("2025-01-01T02:00:00+00:00", 1.0),
            ("2025-01-01T03:00:00+00:00", 2.0),
        )
        s, e = _dt("2025-01-01T00:00:00+00:00"), _dt("2025-01-02T00:00:00+00:00")
        assert compute.apply("min", pts, s, e, None, "float")[0] == 1.0
        assert compute.apply("max", pts, s, e, None, "float")[0] == 3.0

    def test_sum(self) -> None:
        pts = _pts(
            ("2025-01-01T01:00:00+00:00", 4.0), ("2025-01-01T02:00:00+00:00", 6.0)
        )
        val, _ = compute.apply(
            "sum",
            pts,
            _dt("2025-01-01T00:00:00+00:00"),
            _dt("2025-01-02T00:00:00+00:00"),
            None,
            "float",
        )
        assert val == 10.0


class TestDelta:
    _BIN_START = "2025-01-01T00:00:00+00:00"
    _BIN_END = "2025-01-02T00:00:00+00:00"

    def _apply(self, pts: list[compute.Point], locf: float | None) -> float | None:
        val, _ = compute.apply(
            "delta", pts, _dt(self._BIN_START), _dt(self._BIN_END), locf, "float"
        )
        return val

    def test_carries_previous_bucket_last_value(self) -> None:
        # counter went 100 -> 130 during the bin, but the bin opened at 90
        pts = _pts(
            ("2025-01-01T01:00:00+00:00", 100.0),
            ("2025-01-01T02:00:00+00:00", 130.0),
        )
        assert self._apply(pts, 90.0) == 40.0

    def test_single_point_bucket_uses_carry(self) -> None:
        # a meter reporting once per bucket: in-bucket last-first would give 0
        pts = _pts(("2025-01-01T01:00:00+00:00", 100.0))
        assert self._apply(pts, 90.0) == 10.0

    def test_no_carry_falls_back_to_in_bucket(self) -> None:
        pts = _pts(
            ("2025-01-01T01:00:00+00:00", 100.0),
            ("2025-01-01T02:00:00+00:00", 130.0),
        )
        assert self._apply(pts, None) == 30.0

    def test_empty_bucket_has_no_value(self) -> None:
        # not 0: nothing was read, so no consumption can be attributed here
        assert self._apply([], 90.0) is None
        assert self._apply([], None) is None

    def test_counter_reset_passes_through_as_negative(self) -> None:
        # meter replaced: index restarts near 0 while the carry is still high
        pts = _pts(("2025-01-01T01:00:00+00:00", 5.0))
        assert self._apply(pts, 90.0) == -85.0

    def test_int_series_stays_int(self) -> None:
        pts = _pts(("2025-01-01T01:00:00+00:00", 130))
        val, agg_dt = compute.apply(
            "delta", pts, _dt(self._BIN_START), _dt(self._BIN_END), 100, "int"
        )
        assert val == 30
        assert isinstance(val, int)
        assert agg_dt == "int"

    def test_buckets_tile_across_an_empty_one(self) -> None:
        # the gap bucket has no value; the next one still bills the whole increase
        points = [
            (datetime(2025, 1, 1, 0, 30, tzinfo=UTC), 100.0),
            (datetime(2025, 1, 1, 2, 15, tzinfo=UTC), 160.0),
        ]
        expected = compute.compute_expected(
            points,
            "float",
            datetime(2025, 1, 1, tzinfo=UTC),
            datetime(2025, 1, 1, 3, tzinfo=UTC),
            "1h",
            "UTC",
            "delta",
        )
        assert [e["value"] for e in expected] == [0.0, None, 60.0]

    def test_deltas_sum_to_the_total_increase(self) -> None:
        points = [
            (datetime(2025, 1, 1, 0, 30, tzinfo=UTC), 100.0),
            (datetime(2025, 1, 1, 1, 30, tzinfo=UTC), 140.0),
            (datetime(2025, 1, 1, 2, 30, tzinfo=UTC), 175.0),
        ]
        expected = compute.compute_expected(
            points,
            "float",
            datetime(2025, 1, 1, tzinfo=UTC),
            datetime(2025, 1, 1, 3, tzinfo=UTC),
            "1h",
            "UTC",
            "delta",
        )
        values = [e["value"] for e in expected if e["value"] is not None]
        assert sum(values) == 175.0 - 100.0


class TestTwAvg:
    def test_with_locf(self) -> None:
        # LOCF 20 for first 30 min, point 40 for last 30 min → weighted avg 30.0
        bin_start = _dt("2025-01-01T00:00:00+00:00")
        bin_end = _dt("2025-01-01T01:00:00+00:00")
        pts = _pts(("2025-01-01T00:30:00+00:00", 40.0))
        val, _ = compute.apply("tw_avg", pts, bin_start, bin_end, 20.0, "float")
        assert val == 30.0

    def test_fill_backwards_no_locf(self) -> None:
        # no LOCF, point at 30min fills entire bin backwards → tw_avg == point value
        bin_start = _dt("2025-01-01T00:00:00+00:00")
        bin_end = _dt("2025-01-01T01:00:00+00:00")
        pts = _pts(("2025-01-01T00:30:00+00:00", 50.0))
        val, _ = compute.apply("tw_avg", pts, bin_start, bin_end, None, "float")
        assert val == 50.0

    def test_null_when_no_data(self) -> None:
        bin_start = _dt("2025-01-01T00:00:00+00:00")
        bin_end = _dt("2025-01-01T01:00:00+00:00")
        val, _ = compute.apply("tw_avg", [], bin_start, bin_end, None, "float")
        assert val is None


class TestBinBoundaries:
    def test_dst_spring_forward_paris_hourly(self) -> None:
        # 2026-03-29: clocks spring forward at 02:00 → 03:00 (23 UTC hours in day)
        start = _dt("2026-03-28T23:00:00+00:00")
        end = _dt("2026-03-29T22:00:00+00:00")
        bins = compute.bin_boundaries(start, end, "1h", "Europe/Paris")
        assert len(bins) == 23

    def test_dst_fall_back_paris_hourly(self) -> None:
        # 2026-10-25: clocks fall back at 03:00 → 02:00 (25 UTC hours in day)
        start = _dt("2026-10-24T22:00:00+00:00")
        end = _dt("2026-10-25T23:00:00+00:00")
        bins = compute.bin_boundaries(start, end, "1h", "Europe/Paris")
        assert len(bins) == 25

    def test_dst_spring_forward_paris_daily(self) -> None:
        start = _dt("2026-03-28T23:00:00+00:00")
        end = _dt("2026-03-29T22:00:00+00:00")
        bins = compute.bin_boundaries(start, end, "1d", "Europe/Paris")
        assert len(bins) == 1

    def test_dst_fall_back_paris_daily(self) -> None:
        start = _dt("2026-10-24T22:00:00+00:00")
        end = _dt("2026-10-25T23:00:00+00:00")
        bins = compute.bin_boundaries(start, end, "1d", "Europe/Paris")
        assert len(bins) == 1


class TestComputeExpected:
    def test_avg_1h_hand_verified(self) -> None:
        points = [
            (datetime(2025, 1, 1, 0, 0, tzinfo=UTC), 10.0),
            (datetime(2025, 1, 1, 0, 30, tzinfo=UTC), 20.0),
            (datetime(2025, 1, 1, 1, 15, tzinfo=UTC), 30.0),
        ]
        expected = compute.compute_expected(
            points,
            "float",
            datetime(2025, 1, 1, tzinfo=UTC),
            datetime(2025, 1, 1, 2, tzinfo=UTC),
            "1h",
            "UTC",
            "avg",
        )
        assert expected[0]["value"] == 15.0  # (10+20)/2
        assert expected[1]["value"] == 30.0

    def test_count_1h_hand_verified(self) -> None:
        points = [
            (datetime(2025, 1, 1, 0, 0, tzinfo=UTC), 10.0),
            (datetime(2025, 1, 1, 0, 30, tzinfo=UTC), 20.0),
            (datetime(2025, 1, 1, 1, 15, tzinfo=UTC), 30.0),
        ]
        expected = compute.compute_expected(
            points,
            "float",
            datetime(2025, 1, 1, tzinfo=UTC),
            datetime(2025, 1, 1, 2, tzinfo=UTC),
            "1h",
            "UTC",
            "count",
        )
        assert expected[0]["value"] == 2
        assert expected[1]["value"] == 1


class TestMode:
    def test_most_frequent(self) -> None:
        assert compute.mode([1, 2, 2, 3]) == 2

    def test_tie_broken_by_smallest(self) -> None:
        assert compute.mode([3, 1, 3, 1]) == 1
