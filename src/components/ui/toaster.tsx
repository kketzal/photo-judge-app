"use client"

import { useRef, useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { Toast, ToastProvider, ToastViewport } from "@/components/ui/toast"

export function Toaster() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const prevThemeRef = useRef(resolvedTheme)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Only apply theme change effect after initial mount
  useEffect(() => {
    if (mounted && prevThemeRef.current !== resolvedTheme) {
      // Force a re-render when theme changes
      prevThemeRef.current = resolvedTheme
    }
  }, [resolvedTheme, mounted])

  if (!mounted) return null

  return (
    <ToastProvider>
      <ToastViewport />
    </ToastProvider>
  )
}
