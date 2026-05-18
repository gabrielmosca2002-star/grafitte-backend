const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

// Configurações da Shoppub (via variáveis de ambiente)
const SHOPPUB_TOKEN = process.env.SHOPPUB_TOKEN || '3292785b35534db39cab83ef23bb477cb9ae08fb';
const SHOPPUB_LOJA  = process.env.SHOPPUB_LOJA  || 'www.grafittejalecos.com.br';

app.use(cors()); // Permite o painel chamar este servidor
app.use(express.json());

// ============================================================
// ROTA DE SAÚDE — Railway usa isso para saber se o servidor está vivo
// ============================================================
app.get('/', (req, res) => {
  res.json({ status: 'ok', sistema: 'Grafitte Backend', versao: '1.0.0' });
});

// ============================================================
// BUSCAR PEDIDOS DA SHOPPUB
// GET /api/pedidos?pagina=1&limite=50&status=paid
// ============================================================
app.get('/api/pedidos', async (req, res) => {
  const { pagina = 1, limite = 50, status = 'paid,approved,processing' } = req.query;

  try {
    // Tenta diferentes formatos de endpoint da Shoppub
    let pedidos = [];
    let sucesso = false;

    // Endpoint correto da Shoppub conforme documentação oficial
    // Auth: header 'authorization: Token {token}' (não Bearer!)
    // Resposta: { count, next, previous, results: [...] }
    // Pedidos pagos = status_resumido=1
    const url = `https://${SHOPPUB_LOJA}/api/v1/pedidos/?page=${pagina}&status_resumido=1`;

    try {
      const response = await axios.get(url, {
        headers: {
          'authorization': `Token ${SHOPPUB_TOKEN}`,
          'accept': 'application/json',
          'content-type': 'application/json'
        },
        timeout: 15000
      });

      if (response.data && response.data.results) {
        pedidos = response.data.results;
        sucesso = true;
        console.log(`✓ Shoppub OK — ${pedidos.length} pedidos (total: ${response.data.count})`);
      }
    } catch (err) {
      console.log(`✗ Shoppub falhou: ${err.message}`);
    }

    if (sucesso) {
      res.json({ sucesso: true, pedidos, total: pedidos.length, fonte: 'shoppub' });
    } else {
      // Retorna dados de demonstração se a API não responder
      res.json({
        sucesso: false,
        pedidos: [],
        total: 0,
        mensagem: 'API Shoppub não respondeu. Verifique o token e a URL da loja.',
        fonte: 'erro'
      });
    }

  } catch (err) {
    console.error('Erro ao buscar pedidos:', err.message);
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
      `https://${SHOPPUB_LOJA}/api/v1/orders/${id}`,
      {
        headers: {
          'Authorization': `Bearer ${SHOPPUB_TOKEN}`,
          'Accept': 'application/json'
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
// ATUALIZAR STATUS DO PEDIDO NA SHOPPUB
// POST /api/pedidos/:id/status
// Body: { status: 'shipped', rastreamento: 'BR123456789' }
// ============================================================
app.post('/api/pedidos/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status, rastreamento } = req.body;

  try {
    const payload = { status };
    if (rastreamento) payload.tracking_code = rastreamento;

    const response = await axios.put(
      `https://${SHOPPUB_LOJA}/api/v1/orders/${id}`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${SHOPPUB_TOKEN}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
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
// TESTAR CONEXÃO COM SHOPPUB
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
      mensagem: 'Conexão com Shoppub OK!',
      loja: SHOPPUB_LOJA,
      total_pedidos: response.data?.count || 0,
      status_http: response.status
    });
  } catch (err) {
    res.json({
      sucesso: false,
      mensagem: 'Falha na conexão com Shoppub',
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
  console.log(`\n🟢 Grafitte Backend rodando na porta ${PORT}`);
  console.log(`   Loja: ${SHOPPUB_LOJA}`);
  console.log(`   Token: ${SHOPPUB_TOKEN.substring(0, 8)}...`);
  console.log(`   Teste: http://localhost:${PORT}/api/testar\n`);
});
