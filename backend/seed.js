const { v4: uuid } = require('uuid');
const bcrypt = require('bcryptjs');
const { getDb, query, getOne, run } = require('./database');

async function seed() {
  await getDb();

  const properties = [
    { id: uuid(), title: 'Edifício Aurora — Cobertura Premium', location: 'Vila Madalena, São Paulo', type: 'residential', description: 'Cobertura de alto padrão com 3 suítes.', total_value: 4200000, token_price: 500, total_tokens: 8400, tokens_sold: 6048, yield_annual: 8.7, appreciation: 12, term_months: 36 },
    { id: uuid(), title: 'Torre Maracanã Apartments', location: 'Rio de Janeiro, RJ', type: 'residential', description: 'Residencial de 24 andares.', total_value: 8500000, token_price: 500, total_tokens: 17000, tokens_sold: 8500, yield_annual: 9.2, appreciation: 14, term_months: 36 },
    { id: uuid(), title: 'Batel Corporate Center', location: 'Curitiba, PR', type: 'commercial', description: 'Torre corporativa Classe A.', total_value: 15000000, token_price: 750, total_tokens: 20000, tokens_sold: 12000, yield_annual: 10.5, appreciation: 11, term_months: 48 },
    { id: uuid(), title: 'Galpão Logístico Viracopos', location: 'Campinas, SP', type: 'logistics', description: 'Galpão de 15.000m².', total_value: 22000000, token_price: 1000, total_tokens: 22000, tokens_sold: 15400, yield_annual: 11.8, appreciation: 9, term_months: 60 },
    { id: uuid(), title: 'Mall Norte Shopping', location: 'Manaus, AM', type: 'commercial', description: 'Shopping center com 120 lojas.', total_value: 35000000, token_price: 1500, total_tokens: 23333, tokens_sold: 7000, yield_annual: 12.5, appreciation: 15, term_months: 60 },
    { id: uuid(), title: 'Residencial Porto Seguro', location: 'Balneário Camboriú, SC', type: 'residential', description: 'Torre residencial de 40 andares.', total_value: 12000000, token_price: 800, total_tokens: 15000, tokens_sold: 4500, yield_annual: 7.8, appreciation: 18, term_months: 48 },
    { id: uuid(), title: 'Centro Logístico Guarulhos', location: 'Guarulhos, SP', type: 'logistics', description: 'Complexo logístico com 3 galpões.', total_value: 55000000, token_price: 2000, total_tokens: 27500, tokens_sold: 11000, yield_annual: 10.2, appreciation: 8, term_months: 72 },
    { id: uuid(), title: 'Hotel Fazenda Serra da Mantiqueira', location: 'Campos do Jordão, SP', type: 'premium', description: 'Resort boutique com 42 suítes.', total_value: 18000000, token_price: 3000, total_tokens: 6000, tokens_sold: 1800, yield_annual: 13.5, appreciation: 20, term_months: 60 }
  ];

  run('DELETE FROM properties');
  for (const p of properties) {
    run(`INSERT INTO properties (id, title, location, type, description, total_value, token_price, total_tokens, tokens_sold, yield_annual, appreciation, term_months) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.id, p.title, p.location, p.type, p.description, p.total_value, p.token_price, p.total_tokens, p.tokens_sold, p.yield_annual, p.appreciation, p.term_months]);
  }
  console.log(`${properties.length} imóveis inseridos com sucesso!`);

  const users = getOne('SELECT COUNT(*) as count FROM users');
  if (!users || users.count === 0) {
    const id = uuid();
    const hash = bcrypt.hashSync('123456', 10);
    run('INSERT INTO users (id, name, email, password, balance, is_admin) VALUES (?, ?, ?, ?, ?, ?)', [id, 'Investidor Teste', 'teste@invistatop.com', hash, 50000, 1]);
    console.log('Usuário admin criado: teste@invistatop.com / 123456');
  }
}

seed().catch(console.error);
