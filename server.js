const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3001;

const SHOPPUB_TOKEN = process.env.SHOPPUB_TOKEN || '3292785b35534db39cab83ef23bb477cb9ae08fb';
const SHOPPUB_LOJA  = process.env.SHOPPUB_LOJA  || 'www.grafittejalecos.com.br';

// Banco de dados PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:uapUChLQteysNxwouQdTUnHefZeWKMXv@postgres.railway.internal:5432/railway',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

app.use(cors());
app.use(express.json());

const hdrs = () => ({ 'authorization': `Token ${SHOPPUB_TOKEN}`, 'accept': 'application/json' });

// ============================================================
// INICIALIZAR BANCO DE DADOS
// ============================================================
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pedidos (
        id VARCHAR(50) PRIMARY KEY,
        numero VARCHAR(50),
        cliente VARCHAR(255),
        email VARCHAR(255),
        data_pagamento TIMESTAMP,
        status_site INTEGER,
        status_site_label VARCHAR(100),
        status_interno VARCHAR(50) DEFAULT 'separacao',
        itens JSONB,
        bordado JSONB,
        entrega JSONB,
        total DECIMAL(10,2),
        etapas JSONB,
        criado_em TIMESTAMP DEFAULT NOW(),
        atualizado_em TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS estoque (
        sku VARCHAR(100) PRIMARY KEY,
        saldo INTEGER DEFAULT 0,
        min_seguranca INTEGER DEFAULT 0,
        atualizado_em TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS estoque_movimentos (
        id SERIAL PRIMARY KEY,
        sku VARCHAR(100),
        tipo VARCHAR(20),
        quantidade INTEGER,
        observacao TEXT,
        pedido_id VARCHAR(50),
        criado_em TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS lotes (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(255),
        total_pecas INTEGER,
        itens JSONB,
        criado_em TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✓ Banco de dados inicializado');
  } catch(e) {
    console.error('Erro ao inicializar banco:', e.message);
  }
}

// ============================================================
// SAÚDE
// ============================================================
app.get('/', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', versao: '3.0.0', banco: 'conectado' });
  } catch(e) {
    res.json({ status: 'ok', versao: '3.0.0', banco: 'erro: ' + e.message });
  }
});

// ============================================================
// BUSCA TODAS AS PÁGINAS
// ============================================================
async function buscarPaginas(urlBase, delay = 250) {
  let todos = [], pagina = 1;
  while (true) {
    try {
      const r = await axios.get(`${urlBase}&page=${pagina}`, { headers: hdrs(), timeout: 20000 });
      if (!r.data?.results?.length) break;
      todos = todos.concat(r.data.results);
      const total = r.data.count || todos.length;
      console.log(`  pag ${pagina}: ${r.data.results.length} (${todos.length}/${total})`);
      if (!r.data.next || todos.length >= total) break;
      pagina++;
      await new Promise(x => setTimeout(x, delay));
    } catch(e) { console.log(`  erro pag ${pagina}: ${e.message}`); break; }
  }
  return todos;
}

// ============================================================
// PEDIDOS DA SHOPPUB — últimos 60 dias
// ============================================================
app.get('/api/pedidos', async (req, res) => {
  try {
    const dias = parseInt(req.query.dias) || 60;
    const dataMin = new Date();
    dataMin.setDate(dataMin.getDate() - dias);
    const d = dataMin.toISOString().split('T')[0];

    console.log(`\nPedidos últimos ${dias} dias (desde ${d})...`);

    const statusBuscar = [0, 1, 3, 4, 6, 7, 12, 13];
    let todosPedidos = [];

    for (const status of statusBuscar) {
      const url = `https://${SHOPPUB_LOJA}/api/v1/pedidos/?status_resumido=${status}&min_data=${d}`;
      const p = await buscarPaginas(url, 200);
      if (p.length > 0) {
        todosPedidos = todosPedidos.concat(p);
        console.log(`  status ${status}: ${p.length} pedidos`);
      }
    }

    const unicos = Array.from(new Map(todosPedidos.map(p => [p.id, p])).values());
    console.log(`Total: ${unicos.length} pedidos`);

    res.json({ sucesso: true, pedidos: unicos, total: unicos.length });
  } catch(e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

// ============================================================
// HISTÓRICO — 9 meses para PCP
// ============================================================
app.get('/api/historico', async (req, res) => {
  try {
    const meses = parseInt(req.query.meses) || 9;
    const dataMin = new Date();
    dataMin.setMonth(dataMin.getMonth() - meses);
    const d = dataMin.toISOString().split('T')[0];

    console.log(`\nHistórico ${meses} meses (desde ${d})...`);

    let todosPedidos = [];
    for (const status of [1, 3, 4]) {
      const p = await buscarPaginas(`https://${SHOPPUB_LOJA}/api/v1/pedidos/?status_resumido=${status}&min_data=${d}`, 200);
      todosPedidos = todosPedidos.concat(p);
    }

    const unicos = Array.from(new Map(todosPedidos.map(p => [p.id, p])).values());
    console.log(`Total histórico: ${unicos.length}`);

    res.json({ sucesso: true, pedidos: unicos, total: unicos.length });
  } catch(e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

// ============================================================
// SALVAR ESTADO DO PAINEL NO BANCO
// POST /api/estado
// ============================================================
app.post('/api/estado', async (req, res) => {
  try {
    const { pedidos, estoque } = req.body;
    let salvos = 0;

    // Salva pedidos
    for (const p of (pedidos || [])) {
      await pool.query(`
        INSERT INTO pedidos (id, numero, cliente, email, data_pagamento, status_site, status_site_label, status_interno, itens, bordado, entrega, total, etapas, atualizado_em)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
        ON CONFLICT (id) DO UPDATE SET
          status_interno = EXCLUDED.status_interno,
          etapas = EXCLUDED.etapas,
          atualizado_em = NOW()
      `, [
        p.id, p.numero, p.cliente, p.email,
        p.createdAt, p.statusSite, p.statusSiteLabel,
        p.status, JSON.stringify(p.itens), JSON.stringify(p.bordado),
        JSON.stringify(p.entrega), p.total, JSON.stringify(p.etapas)
      ]);
      salvos++;
    }

    // Salva estoque
    for (const [sku, dados] of Object.entries(estoque || {})) {
      await pool.query(`
        INSERT INTO estoque (sku, saldo, min_seguranca, atualizado_em)
        VALUES ($1,$2,$3,NOW())
        ON CONFLICT (sku) DO UPDATE SET
          saldo = EXCLUDED.saldo,
          min_seguranca = EXCLUDED.min_seguranca,
          atualizado_em = NOW()
      `, [sku, dados.saldo, dados.minSeguranca || 0]);
    }

    res.json({ sucesso: true, salvos });
  } catch(e) {
    console.error('Erro ao salvar estado:', e.message);
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

// ============================================================
// CARREGAR ESTADO DO BANCO
// GET /api/estado
// ============================================================
app.get('/api/estado', async (req, res) => {
  try {
    const pedidosRes = await pool.query('SELECT * FROM pedidos ORDER BY data_pagamento DESC');
    const estoqueRes = await pool.query('SELECT * FROM estoque');

    const pedidos = pedidosRes.rows.map(p => ({
      id: p.id,
      numero: p.numero,
      cliente: p.cliente,
      email: p.email,
      createdAt: p.data_pagamento,
      statusSite: p.status_site,
      statusSiteLabel: p.status_site_label,
      status: p.status_interno,
      itens: p.itens,
      bordado: p.bordado,
      entrega: p.entrega,
      total: parseFloat(p.total),
      etapas: p.etapas,
      prazoMaxDias: p.bordado?.temBordado ? 5 : 3
    }));

    const estoque = {};
    estoqueRes.rows.forEach(e => {
      estoque[e.sku] = { saldo: e.saldo, minSeguranca: e.min_seguranca, entradas: [], saidas: [] };
    });

    res.json({ sucesso: true, pedidos, estoque, total: pedidos.length });
  } catch(e) {
    console.error('Erro ao carregar estado:', e.message);
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

// ============================================================
// SALVAR LOTE DE ESTOQUE
// POST /api/estoque/lote
// ============================================================
app.post('/api/estoque/lote', async (req, res) => {
  try {
    const { nome, itens } = req.body;
    let total = 0;

    for (const item of (itens || [])) {
      // Atualiza saldo
      await pool.query(`
        INSERT INTO estoque (sku, saldo, atualizado_em)
        VALUES ($1, $2, NOW())
        ON CONFLICT (sku) DO UPDATE SET
          saldo = estoque.saldo + $2,
          atualizado_em = NOW()
      `, [item.sku, item.qtd]);

      // Registra movimento
      await pool.query(`
        INSERT INTO estoque_movimentos (sku, tipo, quantidade, observacao)
        VALUES ($1, 'entrada', $2, $3)
      `, [item.sku, item.qtd, nome || 'Lote']);

      total += item.qtd;
    }

    // Salva lote
    await pool.query(`
      INSERT INTO lotes (nome, total_pecas, itens) VALUES ($1, $2, $3)
    `, [nome || 'Lote', total, JSON.stringify(itens)]);

    res.json({ sucesso: true, total, itens: itens?.length });
  } catch(e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

// ============================================================
// TESTAR
// ============================================================
app.get('/api/testar', async (req, res) => {
  try {
    const r = await axios.get(`https://${SHOPPUB_LOJA}/api/v1/pedidos/?page=1`, { headers: hdrs(), timeout: 10000 });
    let bancook = false;
    try { await pool.query('SELECT 1'); bancook = true; } catch(e) {}
    res.json({
      sucesso: true,
      mensagem: 'Conexao com Shoppub OK!',
      loja: SHOPPUB_LOJA,
      total_pedidos: r.data?.count || 0,
      banco: bancook ? 'conectado' : 'erro'
    });
  } catch(e) {
    res.json({ sucesso: false, mensagem: 'Falha', erro: e.message });
  }
});

// ============================================================
// START
// ============================================================
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\nGrafitte Backend v3.0 porta ${PORT}`);
    console.log(`Loja: ${SHOPPUB_LOJA}`);
    console.log(`Banco: conectado\n`);
  });
});
