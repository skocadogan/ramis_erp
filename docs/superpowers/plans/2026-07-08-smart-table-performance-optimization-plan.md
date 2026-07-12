# Smart Table Performans Optimizasyonu — Implementasyon Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Smart Table uygulamasının veri, UI ve build katmanlarında performans optimizasyonu.

**Architecture:** Uc katmanli iyilestirme: (1) Veri Katmani — menu normalizasyonu, derived state, WS stabilizasyonu; (2) UI Katmani — FlatList optimizasyonu, CartSheet parcalama, lazy load; (3) Build — Hermes flags, bundle analizi, performans izleme.

**Tech Stack:** React Native 0.86 (Expo SDK 57), Zustand 5.x, Reanimated 4.5, TypeScript 5, Hermes, Jest.

## Global Constraints

- Tum degisiklikler `perf/smart-table-optimization` branch'inde yapilir
- Her task sonunda `npm test -- --passWithNoTests` gecmeli (calisma dizini: `mobile_app/smart_table/`)
- `tsc --noEmit` her Task icin hatasiz olmali
- Mevcut davranis bozulmamali — mevcut hook'lar deprecated edilir ama silinmez

---
