import { useCallback, useEffect, useRef, useState } from 'react'

type InitialValue<T> = T | (() => T)
type Updater<T> = T | ((previous: T) => T)

type StoredValue<T> = { value: T } | undefined

const memoryStore = new Map<string, unknown>()

function isFunction<T>(value: InitialValue<T>): value is () => T {
  return typeof value === 'function'
}

function resolveInitial<T>(value: InitialValue<T>): T {
  return isFunction(value) ? (value as () => T)() : value
}

function readStorage<T>(key: string): StoredValue<T> {
  if (typeof window === 'undefined') {
    if (memoryStore.has(key)) {
      return { value: memoryStore.get(key) as T }
    }
    return undefined
  }

  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) {
      return undefined
    }
    return { value: JSON.parse(raw) as T }
  } catch (error) {
    console.warn(`Failed to read persisted value for key "${key}"`, error)
    try {
      window.localStorage.removeItem(key)
    } catch (cleanupError) {
      console.warn(`Failed to clear corrupted storage key "${key}"`, cleanupError)
    }
    return undefined
  }
}

function persistValue<T>(key: string, value: T): void {
  memoryStore.set(key, value)

  if (typeof window === 'undefined') {
    return
  }

  try {
    if (value === undefined) {
      window.localStorage.removeItem(key)
    } else {
      window.localStorage.setItem(key, JSON.stringify(value))
    }
  } catch (error) {
    console.warn(`Failed to persist value for key "${key}"`, error)
  }
}

function loadInitialValue<T>(key: string, defaultValue: InitialValue<T>): T {
  const stored = readStorage<T>(key)
  if (stored) {
    memoryStore.set(key, stored.value)
    return stored.value
  }

  if (memoryStore.has(key)) {
    return memoryStore.get(key) as T
  }

  const resolved = resolveInitial(defaultValue)
  memoryStore.set(key, resolved)
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(key, JSON.stringify(resolved))
    } catch (error) {
      console.warn(`Failed to persist default value for key "${key}"`, error)
    }
  }
  return resolved
}

export function useKV<T>(key: string, defaultValue: InitialValue<T>): [T, (value: Updater<T>) => void] {
  const keyRef = useRef(key)
  keyRef.current = key

  const [value, setValue] = useState<T>(() => loadInitialValue(key, defaultValue))

  useEffect(() => {
    const nextValue = loadInitialValue(key, defaultValue)
    setValue(nextValue)
  }, [key, defaultValue])

  useEffect(() => {
    persistValue(keyRef.current, value)
  }, [value])

  const update = useCallback(
    (nextValue: Updater<T>) => {
      setValue(prev => {
        const resolved = typeof nextValue === 'function' ? (nextValue as (previous: T) => T)(prev) : nextValue
        persistValue(keyRef.current, resolved)
        return resolved
      })
    },
    []
  )

  return [value, update]
}

export function clearKVStore(): void {
  memoryStore.clear()
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.clear()
    } catch (error) {
      console.warn('Failed to clear persisted KV store', error)
    }
  }
}
