import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

const RouterContext = createContext(null);

export function useRouter() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used within RouterProvider');
  return ctx;
}

export function RouterProvider({ children }) {
  const [path, setPath] = useState(() => window.location.pathname || '/');
  const [search, setSearch] = useState(() => window.location.search || '');

  const navigateTo = useCallback((nextPath) => {
    if (!nextPath) return;
    const qIdx = nextPath.indexOf('?');
    const pathname = qIdx === -1 ? nextPath : nextPath.slice(0, qIdx);
    const newSearch = qIdx === -1 ? '' : nextPath.slice(qIdx);
    if (pathname === path && newSearch === search) return;
    window.history.pushState({}, '', nextPath);
    setPath(pathname || '/');
    setSearch(newSearch);
  }, [path, search]);

  useEffect(() => {
    const onPop = () => {
      setPath(window.location.pathname || '/');
      setSearch(window.location.search || '');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return (
    <RouterContext.Provider value={{ path, search, navigateTo }}>
      {children}
    </RouterContext.Provider>
  );
}
