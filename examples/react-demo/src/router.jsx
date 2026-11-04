import { useEffect, useState } from 'react';

// Roteador mínimo com a History API, como o React Router faz: troca a tela sem recarregar a página.
export function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return path;
}

export function Link({ to, children, ...props }) {
  const go = (event) => {
    event.preventDefault();
    window.history.pushState({}, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
  return (
    <a href={to} onClick={go} {...props}>
      {children}
    </a>
  );
}
