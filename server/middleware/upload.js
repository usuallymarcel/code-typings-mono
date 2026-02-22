import multer from "multer"
import path from "path"

const storage = multer.memoryStorage()

const fileFilter = (_req, file, cb) => {
    const isText = 
        file.mimetype === "text/plain" && 
        path.extname(file.originalname).toLowerCase() === '.txt'

    if (!isText) {
        cb(new Error("Only .txt files are allowed"), false)
    } else {
        cb(null, true)
    }
}

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 1024 * 1024 }
})

export default upload