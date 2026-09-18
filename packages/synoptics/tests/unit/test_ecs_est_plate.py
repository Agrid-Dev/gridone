"""What the ECS Est drawing decides on its own: its bay.

``docs/specs/synoptic/ecs-est.json`` is not a fixture: it is the plate the
format spec produced, bound to the live installation, the one this package
must store and the renderer must draw. The probes every committed plate
shares are in ``test_plates.py``.
"""

from collections import Counter

import pytest

from synoptics.models import PortEndpoint, SynopticDocument


@pytest.fixture
def plate(ecs_est_raw):
    return SynopticDocument.model_validate(ecs_est_raw)


def test_the_bay_is_the_drawing_s(plate):
    """Seven 500 L ballons, two columns of three and one of one. The bay's
    single outlet leaves its bottom-right ballon, so that ballon is fed along
    the bottom row, drains to the return header, and takes no departure of
    its own."""
    tanks = [s for s in plate.symbols if s.type == "tank"]
    assert Counter(t.placement.cell.x for t in tanks) == {10: 3, 14: 3, 18: 1}
    pipes = {p.id: p for p in plate.pipes}
    assert pipes["b08-b09"].from_ == PortEndpoint(symbol="b08", port="dhw_out")
    assert pipes["b08-b09"].to == PortEndpoint(symbol="b09", port="primary_in")
    assert pipes["col-3-return"].from_ == PortEndpoint(symbol="b09", port="primary_out")
    assert not any(
        p.from_ == PortEndpoint(symbol="b09", port="dhw_out") for p in plate.pipes
    )
