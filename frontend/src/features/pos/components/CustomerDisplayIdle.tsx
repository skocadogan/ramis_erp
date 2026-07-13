"use client"

import React, { useState, useEffect, useRef } from "react"
import { Clock as ClockIcon, Sparkles } from "lucide-react"
import api from "@/lib/api"
import { useMatchMedia } from "@/hooks/useMatchMedia"
import { useTranslations, useLocale } from "next-intl"

interface PromotionSlide {
  id: number
  type: 'IMAGE' | 'TEXT'
  title: string
  sub_title: string
  description: string
  image: string
  duration: number
}

interface DisplaySettings {
  show_clock: boolean
  transition_speed: number
  welcome_title: string
  welcome_subtitle: string
}

export function CustomerDisplayIdle({ branchId, terminalCode }: { branchId?: string; terminalCode?: string }) {
  const [slides, setSlides] = useState<PromotionSlide[]>([])
  const [settings, setSettings] = useState<DisplaySettings | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const t = useTranslations("pos.display")

  const reduceMotion = useMatchMedia("(prefers-reduced-motion: reduce)", false)

  useEffect(() => {
    if (!branchId) {
      setIsLoading(false)
      return
    }
    const fetchData = async () => {
      try {
        const params: Record<string, string> = { branch_id: branchId }
        if (terminalCode) params.terminal_code = terminalCode
        const [slidesRes, settingsRes] = await Promise.all([
          api.get("/pos-display/slides/active/", { params }),
          api.get("/pos-display/settings/", { params }),
        ])

        setSlides(Array.isArray(slidesRes.data) ? slidesRes.data : [])

        const sd = settingsRes.data as { results?: DisplaySettings[] } | DisplaySettings[]
        const settingsData = Array.isArray(sd) ? sd[0] : sd.results?.[0]
        setSettings(settingsData ?? null)
      } catch (error) {
        console.error("Idle mode fetch error:", error)
      } finally {
        setIsLoading(false)
      }
    }
    void fetchData()
  }, [branchId, terminalCode])

  // Carousel Logic
  useEffect(() => {
    if (slides.length <= 1) return

    const currentSlide = slides[currentIndex]
    const baseMs = (currentSlide?.duration || 5) * 1000
    const timer = setTimeout(() => {
      setCurrentIndex((prev: number) => (prev + 1) % slides.length)
    }, reduceMotion ? baseMs * 2 : baseMs)

    return () => clearTimeout(timer)
  }, [currentIndex, slides, reduceMotion])

  if (isLoading) {
    return (
      <div className="h-screen w-full bg-card flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-blue-200/50 font-medium tracking-widest uppercase text-xs">{t("loading")}</p>
        </div>
      </div>
    )
  }

  // Fallback if no slides
  if (slides.length === 0) {
    return (
      <div className="h-screen w-full bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 to-indigo-600/10" />
        <div className="relative z-10 text-center space-y-6">
          <div className="animate-in rounded-5xl border border-white/10 bg-slate-900/85 p-12 shadow-2xl zoom-in duration-1000">
            <h1 className="text-6xl font-bold text-white tracking-tighter">
              {settings?.welcome_title || t("welcomeDefault")}
            </h1>
            <p className="text-muted-foreground mt-4 text-xl">
              {settings?.welcome_subtitle || t("subtitleDefault")}
            </p>
          </div>
        </div>
        {settings?.show_clock ? <IdleClock /> : null}
      </div>
    )
  }

  const currentSlide = slides[currentIndex]

  return (
    <div className="h-screen w-full bg-black relative overflow-hidden font-sans">
      {/* Slide Rendering */}
      {currentSlide.type === 'IMAGE' ? (
        <div className="absolute inset-0 z-0 animate-in fade-in duration-1000">
          <div
            className="customer-display-kenburns-bg h-full w-full bg-cover bg-center will-change-transform"
            style={{ backgroundImage: `url(${currentSlide.image})` }}
          />
          <div className="absolute inset-0 bg-black/45" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/30" />
        </div>
      ) : (
        <div className="absolute inset-0 z-0 bg-slate-950 flex items-center justify-center animate-in fade-in zoom-in-95 duration-1000">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 via-slate-900 to-purple-900/40" />
          <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-from)_0%,_transparent_70%)] from-blue-500" />
          
          {/* Central Typography for Text Slide */}
          <div className="relative z-10 text-center max-w-5xl px-20 space-y-8 animate-in slide-in-from-bottom-12 duration-1000">
            <div className="flex items-center justify-center gap-3 text-blue-400 font-bold uppercase tracking-[0.4em] text-sm mb-4">
              <Sparkles className="h-5 w-5" />
              <span>{t("announcement")}</span>
            </div>
            
            <h1 className="text-9xl font-bold text-white leading-[0.9] tracking-tighter drop-shadow-2xl">
              {currentSlide.title}
            </h1>
            
            {currentSlide.sub_title && (
              <h2 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-200 to-indigo-100 leading-tight">
                {currentSlide.sub_title}
              </h2>
            )}
            
            {currentSlide.description && (
              <div className="w-24 h-1 bg-blue-500/50 mx-auto my-8 rounded-full" />
            )}

            {currentSlide.description && (
              <p className="text-2xl text-slate-300 max-w-3xl mx-auto leading-relaxed font-medium">
                {currentSlide.description}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Content Overlay for Image Slides */}
      {currentSlide.type === 'IMAGE' && (
        <div className="relative z-10 h-full flex flex-col justify-end p-20 pb-24">
          <div className="max-w-4xl space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <div className="flex items-center gap-3 text-blue-400 font-bold uppercase tracking-[0.3em] text-sm">
              <Sparkles className="h-5 w-5" />
              <span>{t("deal")}</span>
            </div>
            
            <h1 className="text-8xl font-bold text-white leading-none tracking-tighter">
              {currentSlide.title}
            </h1>
            
            {currentSlide.sub_title && (
              <h2 className="text-4xl font-bold text-blue-200/80 leading-tight">
                {currentSlide.sub_title}
              </h2>
            )}
            
            {currentSlide.description && (
              <p className="text-xl text-slate-300 max-w-2xl leading-relaxed">
                {currentSlide.description}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Indicators */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-3 z-20">
        {slides.map((_: PromotionSlide, idx: number) => (
          <div 
            key={idx}
            className={`h-1.5 transition-all duration-500 rounded-full ${idx === currentIndex ? "w-12 bg-blue-500" : "w-1.5 bg-white/20"}`}
          />
        ))}
      </div>

      {/* Clock Component */}
      {settings?.show_clock ? <IdleClock /> : null}
    </div>
  )
}

function IdleClock() {
  const locale = useLocale()

  // Optimizasyon: setState yerine doğrudan DOM manipülasyonu — her saniye React render döngüsünü atlar
  const timeRef = useRef<HTMLSpanElement>(null)
  const dateRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const update = () => {
      const now = new Date()
      if (timeRef.current) {
        timeRef.current.textContent = now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
      }
      if (dateRef.current) {
        dateRef.current.textContent = now.toLocaleDateString(locale, { day: "numeric", month: "long", weekday: "long" })
      }
    }
    update() // İlk render'da hemen göster
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [locale])

  return (
    <div className="absolute right-10 top-10 z-30 flex items-center gap-4 rounded-3xl border border-white/10 bg-black/55 px-8 py-4 text-white shadow-2xl">
      <ClockIcon className="h-6 w-6 text-blue-400" />
      <div className="flex flex-col">
        <span ref={timeRef} className="text-3xl font-bold leading-none tracking-tighter" />
        <span ref={dateRef} className="mt-1 text-2xs font-bold uppercase tracking-widest text-muted-foreground" />
      </div>
    </div>
  )
}
