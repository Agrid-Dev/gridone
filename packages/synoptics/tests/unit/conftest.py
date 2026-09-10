"""A small valid plate the rule tests mutate one field at a time.

It is deliberately the smallest document that still exercises a port endpoint,
an inline symbol, a tag riding a run and a free label, the shapes most rules
are about.
"""

import copy

import pytest

BASE_DOCUMENT = {
    "version": 1,
    "name": "Test plate",
    "projection": "isometric",
    "symbols": [
        {
            "id": "pac-01",
            "type": "heat_pump",
            "placement": {"kind": "cell", "cell": {"x": 0, "y": 0}, "rotation": 0},
            "label": "PAC 01",
            "bindings": {
                "state": {
                    "kind": "attribute",
                    "target": {
                        "devices": {"ids": ["dev-1"]},
                        "attribute": "onoff_state",
                    },
                }
            },
        },
        {
            "id": "v-01",
            "type": "valve_isolation",
            "placement": {"kind": "pipe", "pipe": "supply", "cell": {"x": 3, "y": 1}},
        },
    ],
    "pipes": [
        {
            "id": "supply",
            "fluid": "primary_supply",
            "from": {"kind": "port", "symbol": "pac-01", "port": "supply"},
            "to": {"kind": "cell", "cell": {"x": 5, "y": 1}},
            "waypoints": [],
            "tags": [
                {
                    "id": "tt-01",
                    "at": {"x": 2, "y": 1},
                    "label": "TT-01",
                    "value": {"kind": "text", "text": "54,1 °C"},
                }
            ],
        }
    ],
    "labels": [
        {"id": "title", "at": {"x": 0, "y": -3}, "text": "TEST", "role": "title"}
    ],
}


@pytest.fixture
def document() -> dict:
    """A fresh deep copy, so a test that mutates one cannot affect another."""
    return copy.deepcopy(BASE_DOCUMENT)
