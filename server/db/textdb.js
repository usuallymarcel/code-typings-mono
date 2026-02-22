import { run, get, all } from './sql.js'
import sqlite3 from 'sqlite3'

const db = new sqlite3.Database('typings.db', sqlite3.OPEN_CREATE | sqlite3.OPEN_READWRITE, (err) => {
    if (err) return console.log(err.message)
})

async function createTable() {
    const sql = `CREATE TABLE IF NOT EXISTS texts (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        text TEXT NOT NULL
    )`
    try {
        await run(db, sql)
    } catch (error) {
        console.log(error)
    }
}

export async function getTextByName(name) {
    const sql = `SELECT * FROM texts WHERE name = ?`

    try {
        const row = await get(db, sql, [name])
        return row
    } catch (error){
        console.log(error.message)
    }
}

export async function getAllText() {
    try {
        const rows = await all(db, `SELECT * FROM texts`)
        return rows
    } catch (error) {
        console.log(error.message)
    }
}

export async function initialiseDb() {
    await createTable()
}

export async function insertText(filename, content) {

    await run(
        db, 
        `INSERT INTO texts (name, text) VALUES (?, ?)`,
        [filename, content]
    )
}

process.on('exit', () => {
    db.close((err) => {
        if (err) console.error(err.message)
    })
})
