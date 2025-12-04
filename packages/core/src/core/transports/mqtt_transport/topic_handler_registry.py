import contextlib
from collections import defaultdict

from aiomqtt import Topic


class TopicHandlerRegistry:
    _registry: dict[str, set[str]]
    _cache: dict[str, set[str]]

    """ A registry mapping mqtt topics to handler ids and providing a matching utility.
    Implements a cache. Topics to register can be arbitrary and include wildcards
    (topics that can be subscribed). Topics to be matched in match_topic cannot have
    wildcards # or + (they represent topics for publishing)."""

    def __init__(self, default_values: dict[str, set[str]] | None = None) -> None:
        self._registry = defaultdict(set, default_values or {})
        self._cache = {}

    @property
    def empty(self) -> bool:
        return len(self._registry) == 0

    def register(self, topic: str, handler_id: str) -> None:
        self._registry[topic].add(handler_id)
        self._invalidate_cache(topic)

    def get_by_topic(self, topic: str) -> set[str]:
        """Returns what matches topic exactly (no recursive matching)."""
        if topic in self._registry:
            return self._registry[topic]
        return set()

    def _find_topic(self, handler_id: str) -> str:
        for topic in self._registry:
            if handler_id in self._registry[topic]:
                return topic
        msg = f"handler {handler_id} not found"
        raise KeyError(msg)

    def _invalidate_cache(self, topic: str) -> None:
        # When a registered topic filter is removed or changed, invalidate cached
        # published topics that previously matched that filter.
        keys_to_delete = []
        for cached_topic in list(self._cache.keys()):
            try:
                published = Topic(cached_topic)
                if published.matches(topic):
                    keys_to_delete.append(cached_topic)
            except Exception:  # noqa: BLE001
                # If a cached key is malformed, remove it defensively
                keys_to_delete.append(cached_topic)
        for k in keys_to_delete:
            self._cache.pop(k, None)

    def unregister(self, handler_id: str, topic: str | None = None) -> None:
        if not topic:
            try:
                topic = self._find_topic(handler_id)
            except KeyError:
                return  # handler_id was not registered
        with contextlib.suppress(KeyError):
            self._registry[topic].remove(handler_id)
            if len(self._registry.get(topic, ())) == 0:
                del self._registry[topic]
        self._invalidate_cache(topic)

    def _match_topic(self, topic: Topic) -> set[str]:
        """Return all handler ids whose registered topic filters matcthe given topic.

        Uses `aiomqtt.Topic.matches` to perform MQTT topic filter matching.
        The provided `topic` may be a `str` or an `aiomqtt.Topic` instance.
        Uses internal cache to avoid looping through registry everytime.
        """
        matched: set[str] = set()
        for registered_topic, handlers in self._registry.items():
            try:
                if topic.matches(registered_topic):
                    matched.update(handlers)
            except Exception:  # noqa: BLE001, S112
                continue
        return matched

    def match_topic(self, topic: Topic) -> set[str]:
        """Return all handler ids whose registered topic filters matcthe given topic.

        Uses `aiomqtt.Topic.matches` to perform MQTT topic filter matching.
        The provided `topic` may be a `str` or an `aiomqtt.Topic` instance.
        Uses internal cache to avoid looping through registry everytime.
        Wraps private _match_topic with cache.
        """
        if topic.value in self._cache:
            return self._cache[topic.value]
        matched: set[str] = self._match_topic(topic)
        self._cache[topic.value] = matched
        return matched
