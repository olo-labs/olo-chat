/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * WebSocket URL for the olo backend (/ws). Uses VITE_API_BASE (e.g. http://localhost:7080) → ws://localhost:7080/ws
 * Pass accessToken to validate with backend (sent as query param; backend accepts accessToken or token).
 */
export function getWebSocketUrl(accessToken?: string | null): string | null {
  const base = import.meta.env.VITE_API_BASE
  if (!base || typeof base !== 'string') return null
  const wsBase = base.trim().replace(/^http/, 'ws').replace(/\/$/, '')
  let url = `${wsBase}/ws`
  if (accessToken && accessToken.trim()) {
    url += (url.includes('?') ? '&' : '?') + 'accessToken=' + encodeURIComponent(accessToken.trim())
  }
  return url
}

/** Reads access token for WebSocket: sessionStorage.accessToken or VITE_WS_ACCESS_TOKEN. Set token before connecting (e.g. after login). */
export function getWsAccessToken(): string | null {
  try {
    const fromStorage = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('accessToken') : null
    if (fromStorage) return fromStorage
    const fromEnv = import.meta.env.VITE_WS_ACCESS_TOKEN
    return typeof fromEnv === 'string' && fromEnv ? fromEnv : null
  } catch {
    return null
  }
}
