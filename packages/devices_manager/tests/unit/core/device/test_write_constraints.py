"""The pure enforcement of write constraints, exercised without a device."""

from collections.abc import Callable

import pytest

from devices_manager.core.device.attribute import Attribute
from devices_manager.core.device.write_constraints import check_write_constraints
from devices_manager.core.driver import AttributeRef, WriteConstraints
from devices_manager.types import AttributeValueType, DataType
from models.errors import InvalidError


def _attribute(
    constraints: WriteConstraints | None, data_type: DataType = DataType.FLOAT
) -> Attribute:
    return Attribute.create(
        "temperature_setpoint",
        data_type,
        {"read", "write"},
        write_constraints=constraints,
    )


def _resolver(
    **values: AttributeValueType | None,
) -> Callable[[str], AttributeValueType | None]:
    """A sibling-value resolver over the given attribute values."""

    def resolve(name: str) -> AttributeValueType | None:
        return values.get(name)

    return resolve


_NO_SIBLINGS = _resolver()


class TestConstantBounds:
    @pytest.mark.parametrize("value", [16, 16.0, 21.5, 30])
    def test_in_range_is_accepted(self, value):
        attribute = _attribute(WriteConstraints(minimum=16, maximum=30))
        check_write_constraints(attribute, value, _NO_SIBLINGS)

    @pytest.mark.parametrize(
        ("value", "message"),
        [
            (15.9, "below the minimum 16"),
            (-5, "below the minimum 16"),
            (30.1, "above the maximum 30"),
            (100, "above the maximum 30"),
        ],
    )
    def test_out_of_range_is_refused(self, value, message):
        attribute = _attribute(WriteConstraints(minimum=16, maximum=30))
        with pytest.raises(InvalidError, match=message):
            check_write_constraints(attribute, value, _NO_SIBLINGS)

    def test_single_bound_only_checks_that_side(self):
        attribute = _attribute(WriteConstraints(minimum=0))
        check_write_constraints(attribute, 1_000_000, _NO_SIBLINGS)
        with pytest.raises(InvalidError, match="below the minimum 0"):
            check_write_constraints(attribute, -1, _NO_SIBLINGS)


class TestStepGrid:
    @pytest.mark.parametrize(
        ("step", "value"),
        [
            (0.5, 21.5),
            (0.5, 21.0),
            (0.5, -0.5),
            (0.5, 0),
            (0.1, 0.3),  # 0.3 / 0.1 is 2.9999999999999996: within tolerance
            (2, 8),
            (0.25, 20.75),
        ],
    )
    def test_on_grid_is_accepted(self, step, value):
        attribute = _attribute(WriteConstraints(step=step))
        check_write_constraints(attribute, value, _NO_SIBLINGS)

    @pytest.mark.parametrize(
        ("step", "value"),
        [(0.5, 21.3), (0.5, 21.25), (2, 7), (0.1, 0.35)],
    )
    def test_off_grid_is_refused(self, step, value):
        attribute = _attribute(WriteConstraints(step=step))
        with pytest.raises(InvalidError, match=f"not a multiple of the step {step}"):
            check_write_constraints(attribute, value, _NO_SIBLINGS)

    def test_grid_is_anchored_at_zero_not_at_minimum(self):
        attribute = _attribute(WriteConstraints(step=0.5, minimum=16.25))
        with pytest.raises(InvalidError, match="not a multiple of the step"):
            check_write_constraints(attribute, 16.25, _NO_SIBLINGS)
        check_write_constraints(attribute, 16.5, _NO_SIBLINGS)


class TestReferencedBounds:
    _CONSTRAINTS = WriteConstraints(
        minimum=AttributeRef(attribute="setpoint_min"),
        maximum=AttributeRef(attribute="setpoint_max"),
    )

    def test_bounds_are_read_from_the_resolver(self):
        attribute = _attribute(self._CONSTRAINTS)
        resolve = _resolver(setpoint_min=16, setpoint_max=30.0)
        check_write_constraints(attribute, 22.0, resolve)
        with pytest.raises(InvalidError, match="below the minimum 16"):
            check_write_constraints(attribute, 15, resolve)
        with pytest.raises(InvalidError, match=r"above the maximum 30\.0"):
            check_write_constraints(attribute, 31, resolve)

    def test_bounds_follow_the_live_values(self):
        attribute = _attribute(self._CONSTRAINTS)
        check_write_constraints(
            attribute, 22.0, _resolver(setpoint_min=16, setpoint_max=30)
        )
        with pytest.raises(InvalidError, match="above the maximum 20"):
            check_write_constraints(
                attribute, 22.0, _resolver(setpoint_min=16, setpoint_max=20)
            )

    @pytest.mark.parametrize(
        ("siblings", "unknown"),
        [
            ({"setpoint_max": 30}, "setpoint_min"),  # referenced attribute missing
            ({"setpoint_min": None, "setpoint_max": 30}, "setpoint_min"),  # no value
            (
                {"setpoint_min": 16, "setpoint_max": "high"},
                "setpoint_max",
            ),  # not numeric
            ({"setpoint_min": True, "setpoint_max": 30}, "setpoint_min"),  # a bool
        ],
    )
    def test_unknown_bound_refuses_the_write(self, siblings, unknown):
        attribute = _attribute(self._CONSTRAINTS)
        with pytest.raises(
            InvalidError,
            match=f"bound '{unknown}' of 'temperature_setpoint' is unknown; "
            "write refused",
        ):
            check_write_constraints(attribute, 22.0, _resolver(**siblings))


class TestReferencedStep:
    """The grid can be a sibling attribute's live value (a device precision)."""

    _constraints = WriteConstraints(step=AttributeRef(attribute="precision"))

    @pytest.mark.parametrize(
        ("precision", "value"), [(0.5, 21.5), (1, 22), (0.1, 21.4)]
    )
    def test_on_grid_of_the_live_step_is_accepted(self, precision, value):
        check_write_constraints(
            _attribute(self._constraints), value, _resolver(precision=precision)
        )

    @pytest.mark.parametrize(("precision", "value"), [(0.5, 21.3), (1, 21.5)])
    def test_off_grid_of_the_live_step_is_refused(self, precision, value):
        with pytest.raises(InvalidError, match="is not a multiple of the step"):
            check_write_constraints(
                _attribute(self._constraints), value, _resolver(precision=precision)
            )

    @pytest.mark.parametrize(
        "siblings", [{}, {"precision": None}, {"precision": "fine"}]
    )
    def test_unknown_step_refuses_the_write(self, siblings):
        with pytest.raises(
            InvalidError,
            match="step 'precision' of 'temperature_setpoint' is unknown; "
            "write refused",
        ):
            check_write_constraints(
                _attribute(self._constraints), 21.5, _resolver(**siblings)
            )

    @pytest.mark.parametrize("precision", [0, -0.5])
    def test_non_positive_step_refuses_the_write(self, precision):
        with pytest.raises(
            InvalidError, match="step of 'temperature_setpoint' resolved to"
        ):
            check_write_constraints(
                _attribute(self._constraints), 21.5, _resolver(precision=precision)
            )


class TestGuards:
    @pytest.mark.parametrize("value", [float("nan"), float("inf"), -float("inf")])
    @pytest.mark.parametrize(
        "constraints", [WriteConstraints(minimum=0), WriteConstraints(step=0.5)]
    )
    def test_non_finite_write_is_refused(self, value, constraints):
        with pytest.raises(InvalidError, match="must be finite"):
            check_write_constraints(_attribute(constraints), value, _NO_SIBLINGS)

    @pytest.mark.parametrize("value", [float("nan"), float("inf"), -float("inf")])
    @pytest.mark.parametrize("bound", ["minimum", "maximum", "step"])
    def test_non_finite_reference_refuses_the_write(self, value, bound):
        constraints = WriteConstraints.model_validate({bound: {"attribute": "limit"}})
        with pytest.raises(InvalidError, match="is unknown; write refused"):
            check_write_constraints(_attribute(constraints), 1, _resolver(limit=value))

    def test_step_division_overflow_is_refused(self):
        with pytest.raises(InvalidError, match="not a multiple of the step"):
            check_write_constraints(
                _attribute(WriteConstraints(step=1e-308)), 1e308, _NO_SIBLINGS
            )

    @pytest.mark.parametrize("value", [0, -273.15, "hot", True])
    def test_no_constraints_accepts_anything(self, value):
        check_write_constraints(_attribute(None), value, _NO_SIBLINGS)

    @pytest.mark.parametrize("value", ["21.5", True])
    def test_non_numeric_value_is_a_programming_error(self, value):
        attribute = _attribute(WriteConstraints(minimum=16))
        with pytest.raises(TypeError, match="apply to numeric values"):
            check_write_constraints(attribute, value, _NO_SIBLINGS)
