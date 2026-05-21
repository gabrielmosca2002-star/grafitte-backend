const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

const SHOPPUB_TOKEN = process.env.SHOPPUB_TOKEN || '3292785b35534db39cab83ef23bb477cb9ae08fb';
const SHOPPUB_LOJA  = process.env.SHOPPUB_LOJA  || 'www.grafittejalecos.com.br';

app.use(cors());
app.use(express.json());

// ============================================================
// ROTA DE SAÚDE
// ============================================================
app.get('/', (req, res) => {
  res.json({ status: 'ok', sistema: 'Grafitte Backend', versao: '1.1.0' });
});

// ============================================================
// BUSCAR TODOS OS PEDIDOS DOS ÚLTIMOS 30 DIAS (com paginação automática)
// GET /api/pedidos
// ============================================================
app.get('/api/pedidos', async (req, res) => {
  try {
    let todosPedidos = [];
    let sucesso = false;

    // Últimos 30 dias
    const dataMin = new Date();
    dataMin.setDate(dataMin.getDate() - 30);
    const dataMinStr = dataMin.toISOString().split('T')[0];

    const headers = {
      'authorization': `Token ${SHOPPUB_TOKEN}`,
      'accept': 'application/json',
      'content-type': 'application/json'
    };

    let paginaAtual = 1;
    let temProxima = true;
    let totalShoppub = 0;

    console.log(`\nIniciando importacao - desde ${dataMinStr}`);

    while (temProxima) {
      const url = `https://${SHOPPUB_LOJA}/api/v1/pedidos/?page=${paginaAtual}&status_resumido=1&min_data=${dataMinStr}`;

      try {
        const response = await axios.get(url, { headers, timeout: 20000 });

        if (response.data && response.data.results) {
          const resultados = response.data.results;
          todosPedidos = todosPedidos.concat(resultados);
          totalShoppub = response.data.count || todosPedidos.length;
          sucesso = true;

          console.log(`Pagina ${paginaAtual}: ${resultados.length} pedidos (${todosPedidos.length}/${totalShoppub})`);

          if (response.data.next && resultados.length > 0 && todosPedidos.length < totalShoppub) {
            paginaAtual++;
            await new Promise(r => setTimeout(r, 250));
          } else {
            temProxima = false;
          }
        } else {
          temProxima = false;
        }
      } catch (err) {
        console.log(`Erro pagina ${paginaAtual}: ${err.message}`);
        temProxima = false;
      }
    }

    if (sucesso) {
      console.log(`Importacao completa: ${todosPedidos.length} pedidos`);
      res.json({
        sucesso: true,
        pedidos: todosPedidos,
        total: todosPedidos.length,
        total_shoppub: totalShoppub,
        fonte: 'shoppub',
        periodo: `ultimos 30 dias desde ${dataMinStr}`
      });
    } else {
      res.json({ sucesso: false, pedidos: [], total: 0, mensagem: 'API Shoppub nao respondeu.', fonte: 'erro' });
    }

  } catch (err) {
    console.error('Erro geral:', err.message);
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// ============================================================
// BUSCAR PEDIDO ESPECÍFICO
// GET /api/pedidos/:id
// ============================================================
app.get('/api/pedidos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const response = await axios.get(
      `https://${SHOPPUB_LOJA}/api/v1/pedido/${id}/`,
      {
        headers: {
          'authorization': `Token ${SHOPPUB_TOKEN}`,
          'accept': 'application/json'
        },
        timeout: 10000
      }
    );
    res.json({ sucesso: true, pedido: response.data });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// ============================================================
// ATUALIZAR STATUS DO PEDIDO
// POST /api/pedidos/:id/status
// ============================================================
app.post('/api/pedidos/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status, rastreamento } = req.body;
  try {
    const payload = { status };
    if (rastreamento) payload.tracking_code = rastreamento;
    const response = await axios.put(
      `https://${SHOPPUB_LOJA}/api/v1/pedido/${id}/`,
      payload,
      {
        headers: {
          'authorization': `Token ${SHOPPUB_TOKEN}`,
          'accept': 'application/json',
          'content-type': 'application/json'
        },
        timeout: 10000
      }
    );
    res.json({ sucesso: true, resposta: response.data });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});


// ============================================================
// BUSCAR PRODUTOS
// GET /api/produtos
// ============================================================
app.get('/api/produtos', async (req, res) => {
  try {
    let todos = [];
    let pagina = 1;
    let temProxima = true;
    const headers = { 'authorization': `Token ${SHOPPUB_TOKEN}`, 'accept': 'application/json' };

    while (temProxima) {
      const url = `https://${SHOPPUB_LOJA}/api/v1/produtos/?page=${pagina}`;
      try {
        const r = await axios.get(url, { headers, timeout: 15000 });
        if (r.data && r.data.results) {
          todos = todos.concat(r.data.results);
          console.log(`Produtos pagina ${pagina}: ${r.data.results.length} (${todos.length}/${r.data.count})`);
          if (r.data.next && todos.length < r.data.count) { pagina++; await new Promise(x => setTimeout(x, 200)); }
          else temProxima = false;
        } else temProxima = false;
      } catch(e) { console.log(`Erro: ${e.message}`); temProxima = false; }
    }

    const produtos = todos.map(p => ({
      id: p.id, nome: p.nome || p.name || '', sku: p.sku || p.codigo || String(p.id),
      ativo: p.ativo !== false, is_wrapper: p.is_wrapper || false, parent: p.parent || null,
      atributo_label: p.atributo_label || '', atributo_valor: p.atributo_valor || ''
    }));

    res.json({ sucesso: true, produtos, total: produtos.length });
  } catch(err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// ============================================================
// TESTAR CONEXÃO
// GET /api/testar
// ============================================================
app.get('/api/testar', async (req, res) => {
  try {
    const response = await axios.get(
      `https://${SHOPPUB_LOJA}/api/v1/pedidos/?page=1`,
      {
        headers: {
          'authorization': `Token ${SHOPPUB_TOKEN}`,
          'accept': 'application/json'
        },
        timeout: 10000
      }
    );
    res.json({
      sucesso: true,
      mensagem: 'Conexao com Shoppub OK!',
      loja: SHOPPUB_LOJA,
      total_pedidos: response.data?.count || 0,
      status_http: response.status
    });
  } catch (err) {
    res.json({
      sucesso: false,
      mensagem: 'Falha na conexao com Shoppub',
      erro: err.response?.data || err.message,
      status_http: err.response?.status,
      loja: SHOPPUB_LOJA
    });
  }
});

// ============================================================
// START
// ============================================================
app.listen(PORT, () => {
  console.log(`Grafitte Backend rodando na porta ${PORT}`);
  console.log(`Loja: ${SHOPPUB_LOJA}`);
});
