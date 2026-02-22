import { getAllText, getTextByName } from "../db/textdb.js"

export async function getText(req, res) {
    const { name } = req.query
    
    if (!name) {
        return res.status(400).send({ message: 'Missing name from query'})
    }
    
    const row = await getTextByName(name)

    if (!row) {
        return res.status(404).json({ message: 'Not found'})
    }

    res.status(200).json(row)
}

export async function getTexts(req, res) {
    
    const rows = await getAllText()

    if (!rows) {
        return res.status(404).json({ message: 'Not found' })
    }

    res.status(200).json(rows)
}
