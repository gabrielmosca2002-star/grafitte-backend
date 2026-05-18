# Grafitte Backend

Servidor intermediário entre o painel de produção e a API da Shoppub.

## Rotas disponíveis

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/` | Status do servidor |
| GET | `/api/testar` | Testa conexão com Shoppub |
| GET | `/api/pedidos` | Busca pedidos da Shoppub |
| GET | `/api/pedidos/:id` | Busca pedido específico |
| POST | `/api/pedidos/:id/status` | Atualiza status do pedido |

## Variáveis de ambiente (Railway)

```
SHOPPUB_TOKEN=3292785b35534db39cab83ef23bb477cb9ae08fb
SHOPPUB_LOJA=www.grafittejalecos.com.br
PORT=3001
```
