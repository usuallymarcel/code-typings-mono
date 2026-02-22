import { insertText } from "../db/textdb.js"


const upload = async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({message: "No file uploaded"})
            return
        }

        const filename = req.file.originalname
        const content = req.file.buffer.toString("utf-8")

        await insertText(filename, content)

        res.status(200).json({
            message: "file uploaded"
        })
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT') {
            return res.status(409).json(
                { message: 'Duplicate file name'})
        }
        return res.status(500).json({message: error.message})
    }
}

export default upload 