// 媒体存储工具 - 简化版，统一使用 Telegram 存储后端
const IMG_SCDN_IO_URL = 'https://img.scdn.io/api/v1.php';

// 默认存储后端
const DEFAULT_STORAGE = 'telegram';

/**
 * 上传媒体文件到图床
 * @param {ArrayBuffer} fileData - 文件二进制数据
 * @param {string} filename - 文件名
 * @param {string} storageDestination - 存储位置：telegram（默认）、local、r2
 * @returns {Promise<string>} 文件 URL
 */
export async function uploadMedia(fileData, filename, storageDestination = DEFAULT_STORAGE) {
  try {
    const formData = new FormData();
    const blob = new Blob([fileData]);
    formData.append('image', blob, filename);
    formData.append('storage_destination', storageDestination);
    
    const response = await fetch(IMG_SCDN_IO_URL, {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`图床服务请求失败 (HTTP ${response.status})${errorText ? ': ' + errorText : ''}`);
    }
    
    const result = await response.json();
    
    // 检查业务层面是否成功
    if (result.success === false) {
      throw new Error(result.message || '图床服务返回失败');
    }
    
    // 根据返回格式提取 URL
    if (result.url) {
      return result.url;
    } else if (result.data && result.data.url) {
      return result.data.url;
    }
    
    throw new Error('图床返回格式异常，未找到文件 URL');
  } catch (error) {
    console.error('媒体上传失败:', error);
    throw error;
  }
}

/**
 * 验证图片文件
 * @param {ArrayBuffer} fileData - 文件二进制数据
 * @param {number} maxSize - 最大大小（字节），默认 5MB
 * @returns {object} 验证结果
 */
export function validateImage(fileData, maxSize = 5 * 1024 * 1024) {
  // 检查大小
  if (fileData.byteLength > maxSize) {
    return {
      valid: false,
      message: `图片大小不能超过 ${maxSize / 1024 / 1024}MB`
    };
  }
  
  // 检查是否为图片（magic number 检查）
  const uint8 = new Uint8Array(fileData);
  
  // JPEG: FF D8 FF
  const isJpeg = uint8[0] === 0xFF && uint8[1] === 0xD8 && uint8[2] === 0xFF;
  
  // PNG: 89 50 4E 47
  const isPng = uint8[0] === 0x89 && uint8[1] === 0x50 && uint8[2] === 0x4E && uint8[3] === 0x47;
  
  // GIF: 47 49 46
  const isGif = uint8[0] === 0x47 && uint8[1] === 0x49 && uint8[2] === 0x46;
  
  // WebP: 52 49 46 46 ... 57 45 42 50
  const isWebp = uint8[0] === 0x52 && uint8[1] === 0x49 && uint8[2] === 0x46 && uint8[3] === 0x46 &&
                 uint8[8] === 0x57 && uint8[9] === 0x45 && uint8[10] === 0x42 && uint8[11] === 0x50;
  
  // BMP: 42 4D
  const isBmp = uint8[0] === 0x42 && uint8[1] === 0x4D;
  
  if (!isJpeg && !isPng && !isGif && !isWebp && !isBmp) {
    return {
      valid: false,
      message: '不支持的图片格式，仅支持 JPG、PNG、GIF、WebP、BMP'
    };
  }
  
  return { valid: true };
}

/**
 * 验证视频文件
 * @param {ArrayBuffer} fileData - 文件二进制数据
 * @param {number} maxSize - 最大大小（字节），默认 15MB
 * @returns {object} 验证结果
 */
export function validateVideo(fileData, maxSize = 15 * 1024 * 1024) {
  // 检查大小
  if (fileData.byteLength > maxSize) {
    return {
      valid: false,
      message: `视频大小不能超过 ${maxSize / 1024 / 1024}MB`
    };
  }
  
  // 检查是否为视频（简单的 magic number 检查）
  const uint8 = new Uint8Array(fileData);
  
  // MP4 / MOV: 前 4 字节是 box size，第 4-8 字节是 'ftyp'
  const hasFtyp = uint8[4] === 0x66 && uint8[5] === 0x74 && uint8[6] === 0x79 && uint8[7] === 0x70;
  
  // WebM / MKV: 1A 45 DF A3 (EBML header)
  const isWebm = uint8[0] === 0x1A && uint8[1] === 0x45 && uint8[2] === 0xDF && uint8[3] === 0xA3;
  
  // AVI: 52 49 46 46 ... 41 56 49 20
  const isAvi = uint8[0] === 0x52 && uint8[1] === 0x49 && uint8[2] === 0x46 && uint8[3] === 0x46 &&
                uint8[8] === 0x41 && uint8[9] === 0x56 && uint8[10] === 0x49;
  
  if (!hasFtyp && !isWebm && !isAvi) {
    return {
      valid: false,
      message: '不支持的视频格式，仅支持 MP4、WebM、AVI、MOV'
    };
  }
  
  return { valid: true };
}

/**
 * 生成随机文件名
 * @param {string} extension - 文件扩展名
 * @returns {string} 随机文件名
 */
export function generateFilename(extension = 'jpg') {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `wish_${timestamp}_${random}.${extension}`;
}

// ========== 向后兼容 ==========

export async function uploadToDefaultStorage(imageData, filename, storageDestination = DEFAULT_STORAGE) {
  return uploadMedia(imageData, filename, storageDestination);
}

export async function uploadToTelegramStorage(imageData, filename, env) {
  return uploadMedia(imageData, filename, 'telegram');
}

export async function uploadImageDualStorage(imageData, filename, env) {
  const url = await uploadMedia(imageData, filename, DEFAULT_STORAGE);
  return {
    defaultUrl: url,
    telegramUrl: url,
    primaryUrl: url
  };
}
