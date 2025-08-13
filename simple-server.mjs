import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('🚀 Backend is working!');
});

app.get('/api/templates', (req, res) => {
  res.json({ message: 'Templates endpoint working!', templates: [] });
});

app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
