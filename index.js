const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = 4000;

app.use(cors());
app.use(bodyParser.json());

// In-memory order book
const orderBook = { buy: [], sell: [] };

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const TOKEN_ABI = ["function transferFrom(address from,address to,uint256 amount) returns (bool)"];

app.post('/orders', async (req, res) => {
  const { type, price, amount, wallet, token } = req.body;

  if (!type || !price || !amount || !wallet || !token) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const newOrder = {
    type,
    price: parseFloat(price),
    amount: parseFloat(amount),
    wallet,
    token
  };

  const opposite = type === 'buy' ? 'sell' : 'buy';
  const matchIndex = orderBook[opposite].findIndex(o =>
    (type === 'buy' && newOrder.price >= o.price) ||
    (type === 'sell' && newOrder.price <= o.price)
  );

  if (matchIndex !== -1) {
    const match = orderBook[opposite].splice(matchIndex, 1)[0];
    const buyer = type === 'buy' ? wallet : match.wallet;
    const seller = type === 'sell' ? wallet : match.wallet;
    const executionPrice = match.price;
    const tokenContract = new ethers.Contract(token, TOKEN_ABI, signer);
    const qty = ethers.parseUnits(amount.toString(), 18);

    try {
      const tx = await tokenContract.transferFrom(buyer, seller, qty);
      await tx.wait();
      console.log(`✔️ Trade Executed: ${buyer} → ${seller} @ ${executionPrice} for ${amount}`);
      return res.json({ matched: true, tx: tx.hash });
    } catch (err) {
      console.error('❌ On-chain transfer failed:', err.message);
      return res.status(500).json({ error: 'On-chain settlement failed' });
    }
  }

  orderBook[type].push(newOrder);
  console.log(`📥 Order Stored: ${type.toUpperCase()} ${amount} @ ${price} from ${wallet}`);
  return res.json({ matched: false, order: newOrder });
});

app.get('/orderbook', (req, res) => {
  const sortedBids = [...orderBook.buy].sort((a, b) => b.price - a.price);
  const sortedAsks = [...orderBook.sell].sort((a, b) => a.price - b.price);
  res.json({ bids: sortedBids, asks: sortedAsks });
});

app.listen(PORT, () => {
  console.log(`🧠 CLOB backend running at http://localhost:${PORT}`);
});
