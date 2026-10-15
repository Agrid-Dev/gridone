from collections import defaultdict

from aiomqtt import Topic


class TopicHandlerRegistry:
    _registry: dict[str, set[str]]
    _cache: dict[str, tuple[str, ...]]

    """ A registry mapping mqtt topics to handler ids and providing a matching utility.
    Topics to register can be arbitrary and include wildcards (topics that can be
    subscribed). Topics to be matched in match_topic cannot have wildcards # or +
    (they represent topics for publishing).

    The cache maps a published topic to the registered topics that match it, not to
    handler ids: a device registers and drops one handler per attribute on the same
    topic, and only a registered topic that appears or disappears invalidates it."""

    def __init__(self, default_values: dict[str, set[str]] | None = None) -> None:
        self._registry = defaultdict(set, default_values or {})
        self._cache = {}

    @property
    def empty(self) -> bool:
        return len(self._registry) == 0

    def register(self, topic: str, handler_id: str) -> None:
        if topic not in self._registry:
            self._invalidate_cache(topic)
        self._registry[topic].add(handler_id)

    def list_topics(self) -> list[str]:
        return list(self._registry.keys())

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
        # When a registered topic filter appears or disappears, invalidate cached
        # published topics that match that filter.
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
        handlers = self._registry.get(topic)
        if handlers is None:
            return
        handlers.discard(handler_id)
        if not handlers:
            del self._registry[topic]
            self._invalidate_cache(topic)

    def _match_topic(self, topic: Topic) -> tuple[str, ...]:
        """Return the registered topic filters that match the given topic.

        Uses `aiomqtt.Topic.matches` to perform MQTT topic filter matching.
        """
        matched: list[str] = []
        for registered_topic in self._registry:
            try:
                if topic.matches(registered_topic):
                    matched.append(registered_topic)
            except Exception:  # noqa: BLE001, S112
                continue
        return tuple(matched)

    def match_topic(self, topic: Topic) -> set[str]:
        """Return all handler ids whose registered topic filters match the given topic.

        Uses `aiomqtt.Topic.matches` to perform MQTT topic filter matching.
        Wraps private _match_topic with the cache of matching filters, then
        reads their handlers as they are now.
        """
        registered_topics = self._cache.get(topic.value)
        if registered_topics is None:
            registered_topics = self._match_topic(topic)
            self._cache[topic.value] = registered_topics
        matched: set[str] = set()
        for registered_topic in registered_topics:
            matched.update(self._registry.get(registered_topic, ()))
        return matched
