# Frontend Best Practices

> Guide de référence pour l'agent frontend — UX, Performance, Accessibilité

## 🎯 Responsabilités de l'agent frontend

- Implémentation d'interfaces utilisateur React/TypeScript
- Respect des standards d'accessibilité WCAG 2.1 AA
- Optimisation des performances (Core Web Vitals)
- Code maintenable, testable et documenté
- Intégration avec APIs backend

---

## 🎨 Best Practices UX

### États utilisateur

Toujours gérer les 5 états principaux :

1. **Loading** — Skeleton screens, spinners, progressive rendering
2. **Error** — Messages clairs, actions de récupération, retry
3. **Success** — Feedback visuel, confirmation, next steps
4. **Empty** — Illustrations, CTAs, onboarding
5. **Disabled** — Curseur, opacité, tooltip explicatif

### Interaction design

- **Touch targets** : Minimum 44×44px (WCAG 2.5.5)
- **Focus management** : Outline visible, ordre logique, trap dans modals
- **Transitions** : 200-300ms, easing naturel, respect `prefers-reduced-motion`
- **Feedback immédiat** : Hover, active, loading states
- **Gestuelle** : Support touch, swipe, pinch-to-zoom si pertinent

### Accessibilité (WCAG 2.1 AA)

- **Semantic HTML** : `<button>`, `<nav>`, `<main>`, `<article>`, etc.
- **ARIA** : Labels, roles, states (aria-label, aria-describedby, aria-live)
- **Contraste** : 4.5:1 pour texte normal, 3:1 pour texte large
- **Keyboard navigation** : Tab, Enter, Escape, Arrow keys
- **Screen readers** : Annonces, landmarks, skip links

### Formulaires UX

- **Validation inline** : Feedback immédiat après blur/input
- **Labels clairs** : Toujours visibles, pas de placeholder-only
- **Error messages** : Spécifiques, constructifs, près du champ
- **Auto-save** : Drafts, localStorage, confirmation avant quitter
- **Progressive disclosure** : Étapes, accordéons, conditional fields

---

## ⚡ Best Practices Performance

### Core Web Vitals (cibles)

- **LCP (Largest Contentful Paint)** : < 2.5s
- **FID (First Input Delay)** : < 100ms
- **CLS (Cumulative Layout Shift)** : < 0.1

### React Performance

- **Code splitting** : `React.lazy()`, dynamic imports, route-based
- **Memoization** : `useMemo`, `useCallback`, `React.memo`
- **Virtual scrolling** : `react-window`, `react-virtualized` pour listes longues
- **Debounce/Throttle** : Inputs, scroll, resize handlers
- **Éviter re-renders** : Context splitting, state colocation, immutabilité

### Bundle Optimization

- **Tree shaking** : Imports nommés, side-effects: false
- **Dynamic imports** : Lazy load routes, modals, heavy components
- **Compression** : Gzip/Brotli, minification
- **Analyze bundle** : `webpack-bundle-analyzer`, `source-map-explorer`

### Images

- **Formats modernes** : WebP, AVIF avec fallback
- **Lazy loading** : `loading="lazy"`, Intersection Observer
- **Responsive images** : `srcset`, `sizes`, `picture`
- **Dimensions fixes** : `width` + `height` pour éviter CLS
- **Compression** : ImageOptim, Squoosh, CDN auto-optimization

### Network

- **HTTP/2** : Multiplexing, server push
- **Prefetch/Preload** : `<link rel="prefetch">`, `<link rel="preload">`
- **Service Workers** : Offline-first, cache strategies
- **API caching** : React Query, SWR, stale-while-revalidate
- **Compression** : Gzip/Brotli headers

---

## 🛠️ Stack Recommandé

### Core

- **React 18+** : Concurrent features, Suspense, Transitions
- **TypeScript** : Strict mode, type safety
- **Tailwind CSS** : Utility-first, JIT, design system

### State & Data

- **React Hook Form** : Performance, validation, DX
- **React Query / TanStack Query** : Server state, caching, mutations
- **Zustand / Jotai** : Client state (si besoin)

### Testing

- **Vitest** : Fast, ESM-native, compatible Jest
- **Testing Library** : User-centric, accessibilité
- **Playwright** : E2E cross-browser

### Tooling

- **Vite** : Dev server rapide, HMR, build optimisé
- **ESLint + Prettier** : Linting, formatting
- **Lighthouse** : Performance audit
- **Web Vitals** : Monitoring production

---

## 🚨 Red Flags à Éviter

### UX

- ❌ Pas de loading states → utilisateur perdu
- ❌ Pas d'error handling → frustration
- ❌ Formulaires inaccessibles → exclusion
- ❌ Modals sans focus trap → navigation cassée
- ❌ Pas de feedback visuel → incertitude

### Performance

- ❌ Layout shifts → CLS élevé
- ❌ Blocking main thread → FID élevé
- ❌ Images non optimisées → LCP lent
- ❌ Bundle > 500KB → TTI lent
- ❌ Re-renders inutiles → lag UI

### Code Quality

- ❌ Prop drilling excessif → refactor avec Context/Zustand
- ❌ Inline styles partout → utiliser Tailwind/CSS Modules
- ❌ Pas de TypeScript → bugs runtime
- ❌ Pas de tests → régression
- ❌ Composants > 300 lignes → split

---

## 📚 Ressources

- [Web Vitals](https://web.dev/vitals/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [React Performance](https://react.dev/learn/render-and-commit)
- [Tailwind Best Practices](https://tailwindcss.com/docs/reusing-styles)
- [Testing Library Guiding Principles](https://testing-library.com/docs/guiding-principles/)

---

**Dernière mise à jour** : 2025-02-20
