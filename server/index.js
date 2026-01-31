const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// mongoose.connect(process.env.MONGO_URI, {useNewUrlParser: true, useUnifiedTopology: true})
// .then(() => console.log('MongoDB connected'))
// .catch(err => console.log(err));

// app.use(express.static(path.resolve(__dirname, '../client/dist')));

app.get('/api', (req, res) => {
    res.json({ message: "Hello from server "});
});

app.listen(PORT, () => console.log(`Running on port ${PORT}`))