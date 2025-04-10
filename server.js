const express = require('express');
const cors = require('cors');
const axios = require('axios');
const technicalindicators = require('technicalindicators');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/.well-known', express.static('.well-known'));
app.use('/', express.static('.'));

// Helper to fetch historical candles
async function getCandles(ticker, apiKey) {
  const to = new Date().toISOString().split("T")[0];
  const from = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`;
  const { data } = await axios.get(url, { params: { apiKey } });
  return data.results || [];
}

// Endpoint: Trade Analytics
app.get('/trade-analytics/:ticker', async (req, res) => {
  const { ticker } = req.params;
  const { apiKey } = req.query;
  try {
    const candles = await getCandles(ticker, apiKey);
    if (!candles.length) return res.status(404).json({ error: 'No price data found' });

    const closes = candles.map(c => c.c);
    const highs = candles.map(c => c.h);
    const lows = candles.map(c => c.l);
    const volumes = candles.map(c => c.v);

    const rsi = technicalindicators.RSI.calculate({ period: 14, values: closes });
    const latestRSI = rsi[rsi.length - 1];

    const typicalPrices = candles.map(c => (c.h + c.l + c.c) / 3);
    let cumTPV = 0, cumVolume = 0;
    for (let i = 0; i < typicalPrices.length; i++) {
      cumTPV += typicalPrices[i] * volumes[i];
      cumVolume += volumes[i];
    }
    const vwap = cumTPV / cumVolume;

    const macdInput = {
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    };
    const macdValues = technicalindicators.MACD.calculate(macdInput);
    const latestMACD = macdValues[macdValues.length - 1];

    res.json({
      ticker,
      latest_close: closes[closes.length - 1],
      indicators: {
        RSI: latestRSI,
        VWAP: vwap,
        MACD: latestMACD
      },
      recommendation: latestRSI > 70
        ? "SELL"
        : latestRSI < 30
        ? "BUY"
        : "HOLD"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Polygon analytics server running on port ${PORT}`);
});
