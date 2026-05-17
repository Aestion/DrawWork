export function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.random() * 16 | 0
    const value = char === 'x' ? random : (random & 0x3 | 0x8)
    return value.toString(16)
  })
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

function createCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, width)
  canvas.height = Math.max(1, height)
  return canvas
}

function drawToCanvas(source, width, height) {
  const canvas = createCanvas(width, height)
  const context = canvas.getContext('2d')
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

function clampDimensions(width, height, maxDimension = 1440) {
  let ratio = 1

  if (width > maxDimension || height > maxDimension) {
    ratio = Math.min(maxDimension / width, maxDimension / height)
  }

  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio))
  }
}

function compressCanvas(canvas, maxBytes, preferredMimeType) {
  let scale = 1
  let mimeType = preferredMimeType
  let quality = mimeType === 'image/png' ? undefined : 0.9

  while (scale >= 0.35) {
    const width = Math.max(1, Math.round(canvas.width * scale))
    const height = Math.max(1, Math.round(canvas.height * scale))
    const scaledCanvas = scale === 1 ? canvas : drawToCanvas(canvas, width, height)

    if (mimeType === 'image/png') {
      const pngDataURL = scaledCanvas.toDataURL('image/png')
      if (pngDataURL.length <= maxBytes) {
        return { dataURL: pngDataURL, mimeType: 'image/png', width, height }
      }
      mimeType = 'image/jpeg'
      quality = 0.9
    }

    while (quality >= 0.35) {
      const jpegDataURL = scaledCanvas.toDataURL('image/jpeg', quality)
      if (jpegDataURL.length <= maxBytes) {
        return { dataURL: jpegDataURL, mimeType: 'image/jpeg', width, height }
      }
      quality -= 0.15
    }

    scale *= 0.85
    quality = 0.9
  }

  throw new Error('Preview still exceeds the Excalidraw embedded file limit.')
}

function createImagePreview(image, fileType, maxBytes) {
  const { width, height } = clampDimensions(image.width, image.height)
  const canvas = drawToCanvas(image, width, height)
  const preferredMimeType = fileType === 'image/png' ? 'image/png' : 'image/jpeg'
  return compressCanvas(canvas, maxBytes, preferredMimeType)
}

async function createVideoPreview(file, maxBytes) {
  const objectUrl = URL.createObjectURL(file)

  try {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.src = objectUrl
    video.load()

    await new Promise((resolve, reject) => {
      const onLoadedData = () => {
        cleanup()
        resolve()
      }
      const onError = () => {
        cleanup()
        reject(new Error('Unable to decode the selected video file.'))
      }
      const cleanup = () => {
        video.removeEventListener('loadeddata', onLoadedData)
        video.removeEventListener('error', onError)
      }

      video.addEventListener('loadeddata', onLoadedData)
      video.addEventListener('error', onError)
    })

    const duration = Number.isFinite(video.duration) ? video.duration : 0
    const captureTime = duration > 0 ? Math.min(0.1, Math.max(duration - 0.05, 0)) : 0

    if (captureTime > 0) {
      await new Promise((resolve, reject) => {
        const onSeeked = () => {
          cleanup()
          resolve()
        }
        const onError = () => {
          cleanup()
          reject(new Error('Unable to capture a video preview frame.'))
        }
        const cleanup = () => {
          video.removeEventListener('seeked', onSeeked)
          video.removeEventListener('error', onError)
        }

        video.addEventListener('seeked', onSeeked)
        video.addEventListener('error', onError)
        try {
          video.currentTime = captureTime
        } catch {
          cleanup()
          resolve()
        }
      })
    }

    const rawWidth = video.videoWidth || 1280
    const rawHeight = video.videoHeight || 720
    const { width, height } = clampDimensions(rawWidth, rawHeight)
    const canvas = drawToCanvas(video, width, height)
    const preview = compressCanvas(canvas, maxBytes, 'image/jpeg')

    return {
      ...preview,
      previewMode: 'poster'
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export async function prepareMediaForExcalidraw(file, maxBytes = 1.5 * 1024 * 1024) {
  if (file.type.startsWith('image/')) {
    const dataURL = await readFileAsDataURL(file)

    if (file.type === 'image/gif') {
      const image = await loadImage(dataURL)
      const preview = createImagePreview(image, 'image/png', maxBytes)
      return {
        ...preview,
        previewMode: 'animated'
      }
    }

    const image = await loadImage(dataURL)
    if (dataURL.length <= maxBytes) {
      return {
        dataURL,
        mimeType: file.type,
        width: image.width,
        height: image.height,
        previewMode: 'original'
      }
    }

    return {
      ...createImagePreview(image, file.type, maxBytes),
      previewMode: 'compressed'
    }
  }

  if (file.type.startsWith('video/')) {
    return createVideoPreview(file, maxBytes)
  }

  throw new Error('Only image and video files are supported.')
}

export function createExcalidrawImageElement({ x, y, width, height, fileId, link = null, customData = null }) {
  const now = Date.now()
  return {
    id: generateId(),
    type: 'image',
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: 'transparent',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: Math.floor(Math.random() * 2 ** 31),
    version: 1,
    versionNonce: now,
    isDeleted: false,
    boundElements: null,
    updated: now,
    link,
    locked: false,
    fileId,
    scale: [1, 1],
    crop: null,
    status: 'saved',
    customData
  }
}
