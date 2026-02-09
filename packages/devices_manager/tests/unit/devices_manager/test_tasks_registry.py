import asyncio

import pytest
from devices_manager.devices_manager.tasks_registry import TasksRegistry


@pytest.mark.asyncio
async def test_add_get_has_and_remove():
    registry = TasksRegistry()
    key = ("device", "task1")

    ev = asyncio.Event()

    async def long_running() -> None:
        # waits until event is set (so it won't complete unless explicitly allowed)
        await ev.wait()

    # Add the task as a callable (TasksRegistry will call it)
    registry.add(key, long_running)
    assert registry.has(key) is True

    task = registry.get(key)
    assert task is not None
    assert not task.done()

    # Remove should cancel the task and return True
    removed = await registry.remove(key)
    assert removed is True
    assert registry.has(key) is False
    assert registry.get(key) is None

    # The task should have been cancelled
    assert task.cancelled() is True


@pytest.mark.asyncio
async def test_adding_duplicate_key_raises():
    registry = TasksRegistry()
    key = ("device", "dup")

    async def noop() -> None:
        await asyncio.sleep(0)

    registry.add(key, noop)

    with pytest.raises(ValueError):  # noqa: PT011
        registry.add(key, noop)

    await registry.shutdown()


@pytest.mark.asyncio
async def test_shutdown_cancels_all_tasks():
    registry = TasksRegistry()
    keys = [("d", str(i)) for i in range(3)]
    events = [asyncio.Event() for _ in keys]

    async def waiter(ev: asyncio.Event) -> None:
        await ev.wait()

    for key, ev in zip(keys, events, strict=False):
        # add callable that will wait on its event
        registry.add(key, lambda ev=ev: waiter(ev))

    # Ensure tasks are present
    for key in keys:
        assert registry.has(key) is True
        t = registry.get(key)
        assert t is not None
        assert not t.done()

    # Shutdown should cancel all tasks
    await registry.shutdown()

    for key in keys:
        assert registry.has(key) is False
        assert registry.get(key) is None


@pytest.mark.asyncio
async def test_get_length():
    registry = TasksRegistry()
    keys = [("d", str(i)) for i in range(3)]
    events = [asyncio.Event() for _ in keys]

    async def waiter(ev: asyncio.Event) -> None:
        await ev.wait()

    for key, ev in zip(keys, events, strict=False):
        # add callable that will wait on its event
        registry.add(key, lambda ev=ev: waiter(ev))

    assert len(registry) == 3
    await registry.shutdown()
    assert len(registry) == 0
