const PLANS = [
  { name: 'Básico', price: 'R$ 19' },
  { name: 'Pro', price: 'R$ 49' },
];

export default function Plans() {
  return (
    <main>
      <h1>Planos</h1>
      <ul>
        {/* Sem a prop "key": o React avisa no console em modo de desenvolvimento. */}
        {PLANS.map((p) => (
          <li>
            {p.name}: {p.price}
          </li>
        ))}
      </ul>
      <button className="assinar" style={{ color: '#bbb', background: '#fff' }}>Assinar</button>
    </main>
  );
}
