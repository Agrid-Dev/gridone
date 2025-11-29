import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useApiConfig } from '@/contexts/ApiConfigContext'

const AutomationContext = createContext(null)

function isFn(apiClient, method) {
  return apiClient && typeof apiClient[method] === 'function'
}

export function AutomationProvider({ children }) {
  const { apiClient } = useApiConfig()
  const [schedules, setSchedules] = useState([])
  const [scenes, setScenes] = useState([])
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [mutations, setMutations] = useState({})
  const [lastUpdated, setLastUpdated] = useState(null)

  const refresh = useCallback(async () => {
    if (!isFn(apiClient, 'getSchedules')) {
      setSchedules([])
      setScenes([])
      setRules([])
      setLoading(false)
      setError(null)
      return
    }
    try {
      setLoading(true)
      setError(null)
      const [scheduleData, sceneData, ruleData] = await Promise.all([
        apiClient.getSchedules?.() ?? Promise.resolve([]),
        apiClient.getScenes?.() ?? Promise.resolve([]),
        apiClient.getAutomationRules?.() ?? Promise.resolve([]),
      ])
      setSchedules(scheduleData || [])
      setScenes(sceneData || [])
      setRules(ruleData || [])
      setLastUpdated(new Date())
    } catch (err) {
      console.error(err)
      setError(err.message || 'Unable to load automation data')
    } finally {
      setLoading(false)
    }
  }, [apiClient])

  useEffect(() => {
    refresh()
  }, [refresh])

  const runMutation = useCallback(async (key, fn) => {
    setMutations((prev) => ({ ...prev, [key]: true }))
    try {
      const result = await fn()
      setLastUpdated(new Date())
      return result
    } finally {
      setMutations((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }, [])

  const createSchedule = useCallback(
    (payload) =>
      runMutation('schedule:create', async () => {
        if (!isFn(apiClient, 'createSchedule')) {
          throw new Error('Schedules API unavailable')
        }
        const created = await apiClient.createSchedule(payload)
        setSchedules((prev) => [created, ...prev.filter((schedule) => schedule.id !== created.id)])
        return created
      }),
    [apiClient, runMutation],
  )

  const updateSchedule = useCallback(
    (scheduleId, updates) =>
      runMutation(`schedule:update:${scheduleId}`, async () => {
        if (!isFn(apiClient, 'updateSchedule')) {
          throw new Error('Schedules API unavailable')
        }
        const updated = await apiClient.updateSchedule(scheduleId, updates)
        setSchedules((prev) => prev.map((schedule) => (schedule.id === scheduleId ? updated : schedule)))
        return updated
      }),
    [apiClient, runMutation],
  )

  const toggleSchedule = useCallback(
    (scheduleId, enabled) =>
      runMutation(`schedule:toggle:${scheduleId}`, async () => {
        if (!isFn(apiClient, 'toggleSchedule')) {
          throw new Error('Schedules API unavailable')
        }
        const updated = await apiClient.toggleSchedule(scheduleId, enabled)
        setSchedules((prev) => prev.map((schedule) => (schedule.id === scheduleId ? updated : schedule)))
        return updated
      }),
    [apiClient, runMutation],
  )

  const overrideSchedule = useCallback(
    (scheduleId, override) =>
      runMutation(`schedule:override:${scheduleId}`, async () => {
        if (!isFn(apiClient, 'overrideSchedule')) {
          throw new Error('Schedules API unavailable')
        }
        const updated = await apiClient.overrideSchedule(scheduleId, override)
        setSchedules((prev) => prev.map((schedule) => (schedule.id === scheduleId ? updated : schedule)))
        return updated
      }),
    [apiClient, runMutation],
  )

  const createScene = useCallback(
    (payload) =>
      runMutation('scene:create', async () => {
        if (!isFn(apiClient, 'createScene')) {
          throw new Error('Scenes API unavailable')
        }
        const created = await apiClient.createScene(payload)
        setScenes((prev) => [created, ...prev.filter((scene) => scene.id !== created.id)])
        return created
      }),
    [apiClient, runMutation],
  )

  const updateScene = useCallback(
    (sceneId, updates) =>
      runMutation(`scene:update:${sceneId}`, async () => {
        if (!isFn(apiClient, 'updateScene')) {
          throw new Error('Scenes API unavailable')
        }
        const updated = await apiClient.updateScene(sceneId, updates)
        setScenes((prev) => prev.map((scene) => (scene.id === sceneId ? updated : scene)))
        return updated
      }),
    [apiClient, runMutation],
  )

  const activateScene = useCallback(
    (sceneId, options = {}) =>
      runMutation(`scene:activate:${sceneId}`, async () => {
        if (!isFn(apiClient, 'activateScene')) {
          throw new Error('Scenes API unavailable')
        }
        const activated = await apiClient.activateScene(sceneId, options)
        setScenes((prev) => prev.map((scene) => (scene.id === sceneId ? activated : scene)))
        if (options?.scheduleId) {
          const timestamp = new Date().toISOString()
          setSchedules((prev) =>
            prev.map((schedule) =>
              schedule.id === options.scheduleId
                ? { ...schedule, lastTriggered: timestamp, nextRun: options.nextRun || schedule.nextRun }
                : schedule,
            ),
          )
        }
        return activated
      }),
    [apiClient, runMutation],
  )

  const createRule = useCallback(
    (payload) =>
      runMutation('rule:create', async () => {
        if (!isFn(apiClient, 'createAutomationRule')) {
          throw new Error('Automation rules API unavailable')
        }
        const created = await apiClient.createAutomationRule(payload)
        setRules((prev) => {
          const filtered = prev.filter((rule) => rule.id !== created.id)
          return [...filtered, created].sort((a, b) => a.priority - b.priority)
        })
        return created
      }),
    [apiClient, runMutation],
  )

  const updateRule = useCallback(
    (ruleId, updates) =>
      runMutation(`rule:update:${ruleId}`, async () => {
        if (!isFn(apiClient, 'updateAutomationRule')) {
          throw new Error('Automation rules API unavailable')
        }
        const updated = await apiClient.updateAutomationRule(ruleId, updates)
        setRules((prev) =>
          prev
            .map((rule) => (rule.id === ruleId ? updated : rule))
            .sort((a, b) => a.priority - b.priority),
        )
        return updated
      }),
    [apiClient, runMutation],
  )

  const toggleRule = useCallback(
    (ruleId, enabled) =>
      runMutation(`rule:toggle:${ruleId}`, async () => {
        if (!isFn(apiClient, 'toggleAutomationRule')) {
          throw new Error('Automation rules API unavailable')
        }
        const updated = await apiClient.toggleAutomationRule(ruleId, enabled)
        setRules((prev) => prev.map((rule) => (rule.id === ruleId ? updated : rule)))
        return updated
      }),
    [apiClient, runMutation],
  )

  const reorderRules = useCallback(
    (ruleId, options) =>
      runMutation(`rule:reorder:${ruleId}`, async () => {
        if (!isFn(apiClient, 'reorderAutomationRules')) {
          throw new Error('Automation rules API unavailable')
        }
        const ordered = await apiClient.reorderAutomationRules(ruleId, options)
        setRules(ordered || [])
        return ordered
      }),
    [apiClient, runMutation],
  )

  const contextValue = useMemo(
    () => ({
      schedules,
      scenes,
      rules,
      loading,
      error,
      refresh,
      lastUpdated,
      pendingKeys: mutations,
      isMutating: Object.keys(mutations).length > 0,
      createSchedule,
      updateSchedule,
      toggleSchedule,
      overrideSchedule,
      createScene,
      updateScene,
      activateScene,
      createRule,
      updateRule,
      toggleRule,
      reorderRules,
    }),
    [
      schedules,
      scenes,
      rules,
      loading,
      error,
      refresh,
      lastUpdated,
      mutations,
      createSchedule,
      updateSchedule,
      toggleSchedule,
      overrideSchedule,
      createScene,
      updateScene,
      activateScene,
      createRule,
      updateRule,
      toggleRule,
      reorderRules,
    ],
  )

  return <AutomationContext.Provider value={contextValue}>{children}</AutomationContext.Provider>
}

export function useAutomation() {
  const ctx = useContext(AutomationContext)
  if (!ctx) {
    throw new Error('useAutomation must be used within an AutomationProvider')
  }
  return ctx
}
