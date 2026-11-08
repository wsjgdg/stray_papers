'use client'

/**
 * Hook for browser notifications.
 * Usage: const { notify, requestPermission, hasPermission } = useBrowserNotification()
 * notify('Title', { body: 'Message' })
 */
import { useState, useEffect, useCallback } from 'react'

export function useBrowserNotification() {
  const [hasPermission, setHasPermission] = useState<NotificationPermission>('default')

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setHasPermission(Notification.permission)
    }
  }, [])

  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return false
    const result = await Notification.requestPermission()
    setHasPermission(result)
    return result === 'granted'
  }, [])

  const notify = useCallback((title: string, options?: NotificationOptions) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body: options?.body || '',
          icon: 'https://z-cdn.chatglm.cn/z-ai/static/logo.svg',
          ...options,
        })
      } catch {
        // ignore
      }
    }
  }, [])

  return { hasPermission, requestPermission, notify }
}
