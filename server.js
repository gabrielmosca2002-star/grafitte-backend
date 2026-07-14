const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

const SHOPPUB_TOKEN = process.env.SHOPPUB_TOKEN || '3292785b35534db39cab83ef23bb477cb9ae08fb';
const SHOPPUB_LOJA  = process.env.SHOPPUB_LOJA  || 'www.grafittejalecos.com.br';

app.use(cors());
app.use(express.json());

const hdrs = () => ({ 'authorization': `Token ${SHOPPUB_TOKEN}`, 'accept': 'application/json' });

app.get('/', (req, res) => res.json({ status: 'ok', versao: '2.1.0' }));

// ============================================================
// BUSCA TODAS AS PÁGINAS DE UM ENDPOINT
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
// PEDIDOS ATIVOS — últimos 60 dias, todos os status relevantes
// O painel decide o que é ativo baseado no status_resumido
// ============================================================
app.get('/api/pedidos', async (req, res) => {
  try {
    const dias = parseInt(req.query.dias) || 60;
    const dataMin = new Date();
    dataMin.setDate(dataMin.getDate() - dias);
    const d = dataMin.toISOString().split('T')[0];

    console.log(`\nPedidos últimos ${dias} dias (desde ${d})...`);

    // Busca status relevantes:
    // 0=aberto, 1=pago, 6=em separação, 7=em produção, 12=preparando envio, 13=em customização
    // 4=despachado, 3=entregue (para histórico)
    const statusBuscar = [0, 1, 3, 4, 6, 7, 12, 13];
    let todosPedidos = [];

    for (const status of statusBuscar) {
      const url = `https://${SHOPPUB_LOJA}/api/v1/pedidos/?status_resumido=${status}&min_data=${d}`;
      console.log(`  Buscando status ${status}...`);
      const p = await buscarPaginas(url, 200);
      todosPedidos = todosPedidos.concat(p);
      if (p.length > 0) console.log(`  → ${p.length} pedidos`);
    }

    // Remove duplicatas
    const unicos = Array.from(new Map(todosPedidos.map(p => [p.id, p])).values());
    console.log(`\nTotal: ${unicos.length} pedidos`);

    res.json({
      sucesso: true,
      pedidos: unicos,
      total: unicos.length,
      periodo: `últimos ${dias} dias`
    });
  } catch(e) {
    console.error('Erro:', e.message);
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

// ============================================================
// HISTÓRICO — 9 meses para PCP e previsão
// ============================================================
app.get('/api/historico', async (req, res) => {
  try {
    const meses = parseInt(req.query.meses) || 9;
    const dataMin = new Date();
    dataMin.setMonth(dataMin.getMonth() - meses);
    const d = dataMin.toISOString().split('T')[0];

    console.log(`\nHistórico ${meses} meses (desde ${d})...`);

    // Busca pagos, entregues e despachados
    let todosPedidos = [];
    for (const status of [1, 3, 4]) {
      console.log(`  status ${status}...`);
      const p = await buscarPaginas(`https://${SHOPPUB_LOJA}/api/v1/pedidos/?status_resumido=${status}&min_data=${d}`, 200);
      todosPedidos = todosPedidos.concat(p);
    }

    const unicos = Array.from(new Map(todosPedidos.map(p => [p.id, p])).values());
    console.log(`Total histórico: ${unicos.length}`);

    res.json({
      sucesso: true,
      pedidos: unicos,
      total: unicos.length,
      periodo: `${meses} meses`
    });
  } catch(e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

// ============================================================
// TESTAR CONEXÃO
// ============================================================
app.get('/api/testar', async (req, res) => {
  try {
    const r = await axios.get(`https://${SHOPPUB_LOJA}/api/v1/pedidos/?page=1`, { headers: hdrs(), timeout: 10000 });
    res.json({
      sucesso: true,
      mensagem: 'Conexao com Shoppub OK!',
      loja: SHOPPUB_LOJA,
      total_pedidos: r.data?.count || 0
    });
  } catch(e) {
    res.json({ sucesso: false, mensagem: 'Falha', erro: e.message, loja: SHOPPUB_LOJA });
  }
});

// ============================================================
// START
// ============================================================
app.listen(PORT, () => {
  console.log(`\nGrafitte Backend v2.1 porta ${PORT}`);
  console.log(`Loja: ${SHOPPUB_LOJA}\n`);
});
