const router = require('express').Router()
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { promisify } = require('util')
const { v4: uuidv4 } = require('uuid')
const { authMiddleware } = require('../middleware/auth')
const { getBoardPermission, hasPermission } = require('../middleware/permission')
const { minioClient, bucketName } = require('../config/minio')
const { File } = require('../models')

const MAX_UPLOAD_SIZE = parseInt(process.env.UPLOAD_MAX_SIZE, 10) || 100 * 1024 * 1024
// 允许的 MIME 类型白名单（精确匹配，不使用前缀）
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/ogg'
]

// 文件头魔数（用于验证文件类型，防止扩展名伪造）
const FILE_SIGNATURES = {
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
  'video/mp4': [[0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]],
  'video/webm': [[0x1A, 0x45, 0xDF, 0xA3]],
  'video/ogg': [[0x4F, 0x67, 0x67, 0x53]]
}

/**
 * 验证文件魔数签名
 */
function verifyFileMagicNumber(buffer, mimeType) {
  const signatures = FILE_SIGNATURES[mimeType]
  if (!signatures) return false

  return signatures.some(signature => {
    if (buffer.length < signature.length) return false
    return signature.every((byte, i) => buffer[i] === byte)
  })
}

// 旧的前缀匹配方式已废弃 - 使用精确白名单
const allowedMimePrefixes = (process.env.UPLOAD_ALLOWED_TYPES || 'image/*,video/*,audio/*')
  .split(',')
  .map((type) => type.trim().replace('*', ''))
  .filter(Boolean)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_SIZE,
    files: 1
  },
  fileFilter: (req, file, callback) => {
    // 使用精确 MIME 类型匹配（非前缀匹配）
    const allowed = ALLOWED_MIME_TYPES.includes(file.mimetype)
    if (!allowed) {
      console.warn(`[Upload] Rejected: MIME type "${file.mimetype}" not in whitelist. Filename: ${file.originalname}`)
    }
    callback(allowed ? null : new Error(`不支持的文件类型: ${file.mimetype}. 仅支持: ${ALLOWED_MIME_TYPES.join(', ')}`), allowed)
  }
})

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads')

async function ensureLocalDir(filepath) {
  const dir = path.join(UPLOAD_DIR, path.dirname(filepath))
  await promisify(fs.mkdir)(dir, { recursive: true })
}

async function storagePut(filename, buffer, mimetype) {
  try {
    await minioClient.putObject(bucketName, filename, buffer, buffer.length, { 'Content-Type': mimetype })
    return { ok: true, local: false }
  } catch (err) {
    await ensureLocalDir(filename)
    await promisify(fs.writeFile)(path.join(UPLOAD_DIR, filename), buffer)
    return { ok: true, local: true }
  }
}

async function storageGet(record) {
  try {
    const stream = await minioClient.getObject(record.bucket, record.filename)
    return { stream }
  } catch (err) {
    const localPath = path.join(UPLOAD_DIR, record.filename)
    try {
      const buffer = await promisify(fs.readFile)(localPath)
      return { buffer }
    } catch (fsErr) {
      if (fsErr.code === 'ENOENT') {
        const notFound = new Error('File not found.')
        notFound.status = 404
        throw notFound
      }
      throw fsErr
    }
  }
}

function uploadSingleFile(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (error) {
      return res.status(400).json({ error: error.message || 'Upload failed.' })
    }
    next()
  })
}

router.post('/', authMiddleware, uploadSingleFile, async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Missing file payload.' })
    }

    // 额外验证：检查文件头魔数
    if (!verifyFileMagicNumber(req.file.buffer, req.file.mimetype)) {
      console.warn(`[Upload] Rejected: File signature mismatch for MIME type "${req.file.mimetype}". Filename: ${req.file.originalname}`)
      return res.status(400).json({ error: '文件格式与声明的类型不匹配，可能存在伪造。' })
    }

    const boardId = req.body.board_id || req.query.board_id
    if (!boardId) {
      return res.status(400).json({ error: 'Missing board_id.' })
    }

    const { board, permission } = await getBoardPermission(boardId, req.user.id)
    if (!board) {
      return res.status(404).json({ error: 'Board not found.' })
    }
    if (!hasPermission(permission, 'editor')) {
      return res.status(403).json({ error: 'Editor permission required.' })
    }

    const ext = path.extname(req.file.originalname).toLowerCase()
    const filename = `${boardId}/${uuidv4()}${ext}`

    await storagePut(filename, req.file.buffer, req.file.mimetype)

    const recordId = uuidv4()
    const record = await File.create({
      id: recordId,
      filename,
      original_name: req.file.originalname,
      mime_type: req.file.mimetype,
      size: req.file.size,
      url: `/api/upload/${recordId}`,
      bucket: bucketName,
      board_id: boardId,
      uploaded_by: req.user.id
    })

    res.status(201).json(record)
  } catch (error) {
    next(error)
  }
})

router.get('/:id', authMiddleware, async (req, res, next) => {
  try {
    const record = await File.findByPk(req.params.id)
    if (!record) {
      return res.status(404).json({ error: 'File not found.' })
    }

    const { board, permission } = await getBoardPermission(record.board_id, req.user.id)
    if (!board || !hasPermission(permission, 'viewer')) {
      return res.status(403).json({ error: 'Viewer permission required.' })
    }

    const fileResult = await storageGet(record)
    res.setHeader('Content-Type', record.mime_type)
    res.setHeader('Cache-Control', 'private, max-age=3600')
    if (fileResult.buffer) {
      res.setHeader('Content-Length', fileResult.buffer.length)
      res.send(fileResult.buffer)
    } else if (fileResult.stream) {
      fileResult.stream.on('error', next)
      fileResult.stream.pipe(res)
    }
  } catch (error) {
    next(error)
  }
})

module.exports = router
