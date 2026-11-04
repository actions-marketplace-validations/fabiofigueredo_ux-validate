import { Link, usePath } from './router.jsx';
import Plans from './Plans.jsx';

// Problemas de propósito, para o ux-validate encontrar.
function Home() {
  return (
    <main>
      <h1>Loja Exemplo</h1>
      <p className="hero-text">Lorem ipsum dolor sit amet, compre agora.</p>
      <div className="cta" onClick={() => alert('ok')}>Comprar</div>
    </main>
  );
}

function Account() {
  // Erro de renderização sem Error Boundary: o React desmonta a árvore e a tela fica em branco.
  const user = null;
  return <main><h1>Olá, {user.name}</h1></main>;
}

function NotFound() {
  return <main><h1>Página não encontrada</h1></main>;
}

const ROUTES = { '/': Home, '/planos': Plans, '/conta': Account };

export default function App() {
  const path = usePath();
  const Page = ROUTES[path] ?? NotFound;
  return (
    <>
      <nav>
        <Link to="/">Início</Link> <Link to="/planos">Planos</Link> <Link to="/conta">Minha conta</Link>{' '}
        <Link to="/blog">Blog</Link>
      </nav>
      <Page />
    </>
  );
}
