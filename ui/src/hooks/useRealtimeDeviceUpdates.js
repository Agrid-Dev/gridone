import { useEffect, useRef } from 'react'
import { generateMockRealtimeMessage } from '@/services/apiClient'

export function useRealtimeDeviceUpdates({ mode, wsUrl, onMessage, onStatusChange }) {
  const messageRef = useRef(onMessage)
  const statusRef = useRef(onStatusChange)

  useEffect(() => {
    messageRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    statusRef.current = onStatusChange
  }, [onStatusChange])

  useEffect(() => {
    let socket
    let reconnectTimer
    let mockInterval
    let isActive = true

    const updateStatus = (nextStatus) => statusRef.current?.(nextStatus)

    if (mode === 'mock') {
      updateStatus('connected')
      mockInterval = setInterval(() => {
        const payload = generateMockRealtimeMessage()
        if (payload) {
          messageRef.current?.(payload)
        }
      }, 4000)
      return () => clearInterval(mockInterval)
    }

    if (!wsUrl) {
      updateStatus('disconnected')
      return
    }

    const connect = () => {
      updateStatus('connecting')
      socket = new WebSocket(wsUrl)
      socket.onopen = () => updateStatus('connected')
      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data)
          messageRef.current?.(parsed)
        } catch (error) {
          console.error('Failed to parse WebSocket message', error)
        }
      }
      socket.onerror = () => updateStatus('error')
      socket.onclose = () => {
        updateStatus('disconnected')
        if (isActive) {
          reconnectTimer = setTimeout(connect, 3000)
        }
      }
    }

    connect()

    return () => {
      isActive = false
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close()
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
      }
    }
  }, [mode, wsUrl])
}
