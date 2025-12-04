from unittest.mock import patch

from aiomqtt import Topic

from core.transports.mqtt_transport.topic_handler_registry import TopicHandlerRegistry


def test_init_empty() -> None:
    registry = TopicHandlerRegistry()
    assert isinstance(registry, TopicHandlerRegistry)
    assert registry.empty


DEFAULT_VALUES = {"topicA": {"handler1", "handler2"}, "topicB": {"handler3"}}


def test_init_with_default_values() -> None:
    registry = TopicHandlerRegistry(DEFAULT_VALUES)
    assert not registry.empty
    assert len(registry.get_by_topic("topicA")) == 2


def test_register() -> None:
    registry = TopicHandlerRegistry()
    registry.register("topicA", "handler1")
    handlers = registry.get_by_topic("topicA")
    assert len(handlers) == 1
    assert "handler1" in handlers


def test_register_with_wildcard() -> None:
    registry = TopicHandlerRegistry()
    registry.register("sensors/#", "handler1")
    registry.register("sensors/+/temperature", "handler1")
    assert registry.get_by_topic("sensors/#") == {"handler1"}
    assert registry.get_by_topic("sensors/+/temperature") == {"handler1"}


def test_get_not_existing_topic() -> None:
    registry = TopicHandlerRegistry()
    assert len(registry.get_by_topic("not-existing-topic")) == 0


def test_unregister_existing_topic() -> None:
    registry = TopicHandlerRegistry(DEFAULT_VALUES)
    assert len(registry.get_by_topic("topicA")) == 2
    registry.unregister("handler1", "topicA")
    assert len(registry.get_by_topic("topicA")) == 1
    registry.unregister("handler-not-existing", "topicA")
    assert len(registry.get_by_topic("topicA")) == 1
    registry.unregister("handler2")
    assert len(registry.get_by_topic("topicA")) == 0
    registry.unregister("handler3")
    assert registry.empty


def test_match_exact() -> None:
    registry = TopicHandlerRegistry()
    registry.register("home/kitchen/temperature", "h1")
    assert registry.match_topic(Topic("home/kitchen/temperature")) == {"h1"}


def test_match_single_level_wildcard() -> None:
    registry = TopicHandlerRegistry()
    registry.register("home/+/temperature", "h1")
    registry.register("home/kitchen/temperature", "h2")

    # '+' should match a single level
    assert registry.match_topic(Topic("home/living/temperature")) == {"h1"}
    assert registry.match_topic(Topic("home/kitchen/temperature")) == {"h1", "h2"}


def test_match_multi_level_wildcard() -> None:
    registry = TopicHandlerRegistry()
    registry.register("sensors/#", "s1")
    registry.register("sensors/temperature", "s2")

    assert registry.match_topic(Topic("sensors/temperature")) == {"s1", "s2"}
    assert registry.match_topic(Topic("sensors/temperature/room1")) == {"s1"}


def test_match_wildcards_edge_cases() -> None:
    registry = TopicHandlerRegistry()
    registry.register("#", "root")
    registry.register("+/status", "s1")

    # '#' matches everything
    assert registry.match_topic(Topic("anything/here")) == {"root"}
    # both '#' and '+/status' should match this topic
    assert registry.match_topic(Topic("node/status")) == {"root", "s1"}


def test_cache_hit() -> None:
    registry = TopicHandlerRegistry()
    registry.register("home/+/temperature", "h1")
    registry.register("home/kitchen/temperature", "h2")
    # First call. Cold cache.
    assert len(registry._cache) == 0
    matches = registry.match_topic(Topic("home/kitchen/temperature"))
    assert matches == {"h1", "h2"}
    # Second call. Should hit cache.
    assert len(registry._cache) == 1
    with patch.object(registry, "_match_topic", wraps=registry._match_topic) as spy:
        matches = registry.match_topic(Topic("home/kitchen/temperature"))
        spy.assert_not_called()
    assert matches == {"h1", "h2"}


def test_invalidate_cache_on_unregister() -> None:
    registry = TopicHandlerRegistry()
    registry.register("home/+/temperature", "h1")
    registry.register("home/kitchen/temperature", "h2")
    registry.register("home/bathroom/temperature", "h3")
    registry.match_topic(Topic("home/kitchen/temperature"))
    registry.match_topic(Topic("home/bathroom/temperature"))
    assert len(registry._cache) == 2
    registry.unregister("h2")
    assert "home/kitchen/temperature" not in registry._cache
    assert "home/bathroom/temperature" in registry._cache


def test_invalidate_cache_on_register() -> None:
    registry = TopicHandlerRegistry()
    registry.register("home/+/temperature", "h1")
    registry.register("home/kitchen/temperature", "h2")
    registry.register("home/bathroom/temperature", "h3")
    registry.match_topic(Topic("home/kitchen/temperature"))
    registry.match_topic(Topic("home/bathroom/temperature"))
    assert len(registry._cache) == 2
    registry.register("home/kitchen/temperature", "h4")
    matched_topics = registry.match_topic(Topic("home/kitchen/temperature"))
    assert "h1" in matched_topics
    assert "h2" in matched_topics
    assert "h4" in matched_topics  # would not be returned if hit cache
    assert "h3" not in matched_topics


def test_invalidate_cache_on_unregister_wildcard() -> None:
    registry = TopicHandlerRegistry()
    registry.register("home/+/temperature", "h1")
    registry.register("home/kitchen/temperature", "h2")
    registry.register("home/bathroom/temperature", "h3")
    registry.match_topic(Topic("home/kitchen/temperature"))
    registry.match_topic(Topic("home/bathroom/temperature"))
    assert len(registry._cache) == 2
    registry.unregister("h1")
    assert len(registry._cache) == 0
