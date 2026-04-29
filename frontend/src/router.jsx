import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

const RouterContext = createContext(null);

export function useRouter() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used within RouterProvider');
  return ctx;
}

export function RouterProvider({ children }) {
  const [path, setPath] = useState(window.location.pathname || '/');

  const navigateTo = useCallback((nextPath) => {
    if (!nextPath || nextPath === path) return;
    window.history.pushState({}, '', nextPath);
    setPath(nextPath);
  }, [path]);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname || '/');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return (
    <RouterContext.Provider value={{ path, navigateTo }}>
      {children}
    </RouterContext.Provider>
  );
}
