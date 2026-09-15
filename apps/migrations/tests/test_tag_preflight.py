from migrations.tag_preflight import audit_snapshot


def test_snapshot_checks_saved_targets_without_reading_unrelated_config_tags():
    snapshot = {
        "devices": [
            {"id": "a", "tags": {"Étage": "2"}, "config": {"tags": "unrelated"}}
        ],
        "command_templates": [{"target": {"tags": {"Étage": ["2"]}}}],
        "dashboards": [
            {
                "widgets": [
                    {
                        "config": {
                            "target": {
                                "devices": {"tags": {"floor": ["2"]}},
                                "attribute": "temperature",
                            }
                        }
                    }
                ]
            }
        ],
    }
    assert audit_snapshot(snapshot) == []


def test_invalid_saved_filter_and_device_collision_are_both_reported():
    snapshot = {
        "devices": [
            {"id": "a", "tags": {"Floor": "2"}},
            {"id": "b", "tags": {"floor": "2"}},
        ],
        "command_templates": [{"target": {"tags": {"floor": ["bad value"]}}}],
        "dashboards": [{"group_by": "bad key"}],
    }
    findings = audit_snapshot(snapshot)
    assert len(findings) == 3
    assert "collision" in findings[0]
    assert "command_templates[0].target" in findings[1]
    assert "grouping key" in findings[2]
