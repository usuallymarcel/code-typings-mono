import express from 'express'
import cors from 'cors'
import { initialiseDb } from './db/schema.js';
import dotenv from 'dotenv'

dotenv.config()

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

await initialiseDb()

// app.use(express.static(path.resolve(__dirname, '../client/dist')));

app.get('/text', (_req, res) => {
    res.json({ message: "This is longer sample text coming from the server to make sure that the front is equipped to handle such a case blah blah blah this is sample text from server"});
    // res.json({ message: "this is sample text from server"});
});

app.listen(PORT, () => console.log(`Running on port ${PORT}`))