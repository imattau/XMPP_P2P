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
  params: Record<string, string>
  outlet: ReactNode
  navigate: (to: string | number) => void
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
      params[patternPart.slice(1)] = decodeURIComponent(pathPart)
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
    if (route.index) {
      continue
    }

    const params = matchPattern(route.path, cleanPath)
    if (params) {
      return { route, params }
    }
  }

  const fallback = childRoutes.find(route => route.index) ?? childRoutes[0]
  return fallback ? { route: fallback, params: {} } : null
}

export function RouterProvider({ router }: { router: Router }) {
  const [pathname, setPathname] = useState(() => splitPath(window.location.pathname))

  useEffect(() => {
    const onPopState = () => setPathname(splitPath(window.location.pathname))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = (to: string | number) => {
    if (typeof to === 'number') {
      window.history.go(to)
      return
    }

    const nextPath = splitPath(to)
    window.history.pushState({}, '', nextPath)
    setPathname(nextPath)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  const rootRoute = router.routes[0]
  const childMatch = matchChildRoute(router.routes, pathname)
  const outlet = childMatch ? React.createElement(childMatch.route.Component) : null
  const params = childMatch?.params ?? {}
  const rootElement = rootRoute ? React.createElement(rootRoute.Component) : null

  const value = useMemo<RouterState>(() => ({
    pathname,
    params,
    outlet,
    navigate
  }), [pathname, params, outlet])

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

type NavLinkProps = {
  to: string
  end?: boolean
  className?: string | ((props: { isActive: boolean }) => string)
  children: ReactNode
}

export function NavLink({ to, end = false, className, children }: NavLinkProps) {
  const context = useContext(RouterContext)
  if (!context) {
    throw new Error('NavLink must be used inside RouterProvider')
  }

  const active = end ? context.pathname === splitPath(to) : context.pathname === splitPath(to) || context.pathname.startsWith(`${splitPath(to)}/`)
  const classes = typeof className === 'function' ? className({ isActive: active }) : className

  return (
    <a
      href={splitPath(to)}
      onClick={(event) => {
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
