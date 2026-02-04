const express = require('express');
const cors = require('cors');

require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// app.use(express.static(path.resolve(__dirname, '../client/dist')));

app.get('/text', (_req, res) => {
    res.json({ message: "sample text from server"});
});

app.listen(PORT, () => console.log(`Running on port ${PORT}`))