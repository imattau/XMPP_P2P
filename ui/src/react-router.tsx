import type { ComponentType, ReactNode } from 'react'
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

type RouteObject = {
  path?: string
  index?: boolean
  Component: ComponentType<any>
  children?: RouteObject[]
}

type Router = {
  routes: RouteObject[]
}

type RouterState = {
  pathname: string
  search: string
  hash: string
  params: Record<string, string>
  outlet: ReactNode
  navigate: (to: string | number, options?: { replace?: boolean }) => void
}

const RouterContext = createContext<RouterState | null>(null)

export function createBrowserRouter(routes: RouteObject[]) {
  return { routes }
}

function normalizePath(pathname: string) {
  if (!pathname.startsWith('/')) {
    return `/${pathname}`
  }
  return pathname
}

function splitPath(pathname: string) {
  return normalizePath(pathname).replace(/\/+$/, '') || '/'
}

function backFallback(pathname: string) {
  const path = splitPath(pathname)
  if (path.startsWith('/onboarding/')) {
    const previousStep: Record<string, string> = {
      '/onboarding/create': '/onboarding',
      '/onboarding/import': '/onboarding',
      '/onboarding/recovery': '/onboarding/create',
      '/onboarding/permissions': '/onboarding/recovery',
      '/onboarding/network': '/onboarding/recovery',
      '/onboarding/find-network': '/onboarding/network',
      '/onboarding/preferences': '/onboarding/find-network',
      '/onboarding/ready': '/onboarding/preferences',
    }
    return previousStep[path] ?? '/onboarding'
  }
  if (path === '/chats/new') return '/chats'
  if (path.startsWith('/chat/')) return '/chats'
  if (path === '/communities/new') return '/chats/new'
  if (path.startsWith('/article/')) return '/topics'
  if (path.startsWith('/topics/')) return '/topics'
  return '/'
}

function historyDepth(): number {
  const state = window.history.state as { __nexusHistoryDepth?: unknown } | null
  return Number.isSafeInteger(state?.__nexusHistoryDepth) && (state?.__nexusHistoryDepth as number) >= 0
    ? state?.__nexusHistoryDepth as number
    : 0
}

function matchPattern(pattern: string | undefined, pathname: string) {
  if (!pattern) {
    return null
  }

  const cleanPattern = splitPath(pattern)
  const cleanPath = splitPath(pathname)

  if (cleanPattern === cleanPath) {
    return {}
  }

  const patternParts = cleanPattern.split('/').filter(Boolean)
  const pathParts = cleanPath.split('/').filter(Boolean)

  if (patternParts.length !== pathParts.length) {
    return null
  }

  const params: Record<string, string> = {}

  for (let i = 0; i < patternParts.length; i += 1) {
    const patternPart = patternParts[i]
    const pathPart = pathParts[i]

    if (patternPart.startsWith(':')) {
      try {
        params[patternPart.slice(1)] = decodeURIComponent(pathPart)
      } catch {
        return null
      }
      continue
    }

    if (patternPart !== pathPart) {
      return null
    }
  }

  return params
}

function matchChildRoute(routes: RouteObject[], pathname: string) {
  const childRoutes = routes.flatMap(route => route.children ?? [])
  if (childRoutes.length === 0) {
    return null
  }

  const cleanPath = splitPath(pathname)

  if (cleanPath === '/') {
    const indexRoute = childRoutes.find(route => route.index)
    if (indexRoute) {
      return { route: indexRoute, params: {} }
    }
  }

  for (const route of childRoutes) {
    if (route.index || route.path === '*') {
      continue
    }

    const params = matchPattern(route.path, cleanPath)
    if (params) {
      return { route, params }
    }
  }

  const notFound = childRoutes.find(route => route.path === '*')
  return notFound ? { route: notFound, params: {} } : null
}

export function RouterProvider({ router }: { router: Router }) {
  const [location, setLocation] = useState(() => ({
    pathname: splitPath(window.location.pathname),
    search: window.location.search,
    hash: window.location.hash,
  }))

  useEffect(() => {
    const state = window.history.state
    if (!Number.isSafeInteger(state?.__nexusHistoryDepth)) {
      window.history.replaceState({ ...(state && typeof state === 'object' ? state : {}), __nexusHistoryDepth: 0 }, '')
    }
  }, [])

  useEffect(() => {
    const onPopState = () => setLocation({
      pathname: splitPath(window.location.pathname),
      search: window.location.search,
      hash: window.location.hash,
    })
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = (to: string | number, options?: { replace?: boolean }) => {
    if (typeof to === 'number') {
      if (to < 0 && historyDepth() < Math.abs(to)) {
        const path = backFallback(location.pathname)
        const fallback = new URL(path, window.location.origin)
        const state = window.history.state
        window.history.replaceState({ ...(state && typeof state === 'object' ? state : {}), __nexusHistoryDepth: 0 }, '', path)
        setLocation({ pathname: splitPath(fallback.pathname), search: fallback.search, hash: fallback.hash })
        return
      }
      window.history.go(to)
      return
    }

    const next = new URL(to, window.location.origin)
    const nextLocation = {
      pathname: splitPath(next.pathname),
      search: next.search,
      hash: next.hash,
    }
    const nextUrl = `${nextLocation.pathname}${nextLocation.search}${nextLocation.hash}`
    if (options?.replace) {
      window.history.replaceState(window.history.state, '', nextUrl)
    } else {
      window.history.pushState({ __nexusHistoryDepth: historyDepth() + 1 }, '', nextUrl)
    }
    setLocation(nextLocation)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  const rootRoute = router.routes[0]
  const childMatch = matchChildRoute(router.routes, location.pathname)
  const outlet = childMatch ? React.createElement(childMatch.route.Component) : null
  const params = childMatch?.params ?? {}
  const rootElement = rootRoute ? React.createElement(rootRoute.Component) : null

  const value = useMemo<RouterState>(() => ({
    ...location,
    params,
    outlet,
    navigate
  }), [location, params, outlet])

  return (
    <RouterContext.Provider value={value}>
      {rootElement}
    </RouterContext.Provider>
  )
}

export function Outlet() {
  const context = useContext(RouterContext)
  return <>{context?.outlet ?? null}</>
}

export function useNavigate() {
  const context = useContext(RouterContext)
  if (!context) {
    throw new Error('useNavigate must be used inside RouterProvider')
  }
  return context.navigate
}

export function useParams<T extends Record<string, string> = Record<string, string>>() {
  const context = useContext(RouterContext)
  if (!context) {
    throw new Error('useParams must be used inside RouterProvider')
  }
  return context.params as T
}

export function useLocation() {
  const context = useContext(RouterContext)
  if (!context) {
    throw new Error('useLocation must be used inside RouterProvider')
  }
  return { pathname: context.pathname, search: context.search, hash: context.hash }
}

type NavLinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className' | 'onClick'> & {
  to: string
  end?: boolean
  className?: string | ((props: { isActive: boolean }) => string)
  onClick?: React.MouseEventHandler<HTMLAnchorElement>
}

export function NavLink({ to, end = false, className, onClick, children, target, ...anchorProps }: NavLinkProps) {
  const context = useContext(RouterContext)
  if (!context) {
    throw new Error('NavLink must be used inside RouterProvider')
  }

  const active = end ? context.pathname === splitPath(to) : context.pathname === splitPath(to) || context.pathname.startsWith(`${splitPath(to)}/`)
  const classes = typeof className === 'function' ? className({ isActive: active }) : className

  return (
    <a
      href={splitPath(to)}
      target={target}
      {...anchorProps}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        if (target && target !== '_self') return
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        context.navigate(to)
      }}
      className={classes}
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </a>
  )
}
