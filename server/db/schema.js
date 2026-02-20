import { execute } from './sql.js'
import sqlite3 from 'sqlite3'

const db = new sqlite3.Database('typings.db', sqlite3.OPEN_CREATE | sqlite3.OPEN_READWRITE, (err) => {
    if (err) return console.log(err.message)
})

async function createTable() {
    const sql = `CREATE TABLE IF NOT EXISTS text (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        text TEXT NOT NULL
    )`
    try {
        execute(db, sql)
    } catch (error) {
        console.log(error)
    } finally {
        db.close()
    }
}

export async function initialiseDb() {
    await createTable()
}

process.on('exit', () => {
    db.close((err) => {
        if (err) console.error(err.message)
    })
})
