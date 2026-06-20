// 图片存储工具 - 支持双存储策略（默认存储 + Telegram 存储）
const IMG_SCDN_IO_URL = 'https://img.scdn.io/api/v1.php';

/**
 * 上传图片到默认存储（img.scdn.io）
 * @param {ArrayBuffer} imageData - 图片二进制数据
 * @param {string} filename - 文件名
 * @param {string} storageDestination - 存储位置：local（默认）、telegram、r2
 * @returns {Promise<string>} 图片 URL
 */
export async function uploadToDefaultStorage(imageData, filename, storageDestination = 'local') {
  try {
    const formData = new FormData();
    const blob = new Blob([imageData], { type: 'image/jpeg' });
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
    
    // 根据 img.scdn.io 的返回格式提取 URL
    if (result.url) {
      return result.url;
    } else if (result.data && result.data.url) {
      return result.data.url;
    }
    
    throw new Error('图床返回格式异常，未找到图片 URL');
  } catch (error) {
    console.error('默认存储上传失败:', error);
    throw error;
  }
}

/**
 * 上传图片到 Telegram 存储（使用 img.scdn.io 的 telegram 存储后端）
 * @param {ArrayBuffer} imageData - 图片二进制数据
 * @param {string} filename - 文件名
 * @param {object} env - 环境变量（保留参数，用于兼容）
 * @returns {Promise<string>} 图片 URL
 */
export async function uploadToTelegramStorage(imageData, filename, env) {
  try {
    // 使用 img.scdn.io 的 telegram 存储后端
    return await uploadToDefaultStorage(imageData, filename, 'telegram');
  } catch (error) {
    console.error('Telegram 存储上传失败:', error);
    throw error;
  }
}

/**
 * 双存储上传 - 同时上传到默认存储和 Telegram 存储
 * @param {ArrayBuffer} imageData - 图片二进制数据
 * @param {string} filename - 文件名
 * @param {object} env - 环境变量
 * @returns {Promise<object>} 包含两个存储 URL 的对象
 */
export async function uploadImageDualStorage(imageData, filename, env) {
  const result = {
    defaultUrl: null,
    telegramUrl: null,
    primaryUrl: null
  };
  
  const errors = [];
  
  // 并行上传到两个存储
  const promises = [];
  
  // 默认存储（local）
  promises.push(
    uploadToDefaultStorage(imageData, filename, 'local')
      .then(url => {
        result.defaultUrl = url;
        result.primaryUrl = url; // 默认存储作为主 URL
      })
      .catch(err => {
        console.warn('默认存储上传失败:', err.message);
        errors.push(`默认存储: ${err.message}`);
      })
  );
  
  // Telegram 存储
  promises.push(
    uploadToTelegramStorage(imageData, filename, env)
      .then(url => {
        result.telegramUrl = url;
        // 如果默认存储失败，使用 Telegram 存储作为主 URL
        if (!result.primaryUrl) {
          result.primaryUrl = url;
        }
      })
      .catch(err => {
        console.warn('Telegram 存储上传失败:', err.message);
        errors.push(`Telegram存储: ${err.message}`);
      })
  );
  
  await Promise.allSettled(promises);
  
  // 检查是否至少有一个存储成功
  if (!result.primaryUrl) {
    throw new Error(`所有存储方式都失败了 [${errors.join('; ')}]`);
  }
  
  return result;
}

/**
 * 验证图片文件
 * @param {ArrayBuffer} imageData - 图片二进制数据
 * @param {number} maxSize - 最大大小（字节）
 * @returns {object} 验证结果
 */
export function validateImage(imageData, maxSize = 5 * 1024 * 1024) {
  // 检查大小
  if (imageData.byteLength > maxSize) {
    return {
      valid: false,
      message: `图片大小不能超过 ${maxSize / 1024 / 1024}MB`
    };
  }
  
  // 检查是否为图片（简单的 magic number 检查）
  const uint8 = new Uint8Array(imageData);
  
  // JPEG: FF D8 FF
  const isJpeg = uint8[0] === 0xFF && uint8[1] === 0xD8 && uint8[2] === 0xFF;
  
  // PNG: 89 50 4E 47
  const isPng = uint8[0] === 0x89 && uint8[1] === 0x50 && uint8[2] === 0x4E && uint8[3] === 0x47;
  
  // GIF: 47 49 46
  const isGif = uint8[0] === 0x47 && uint8[1] === 0x49 && uint8[2] === 0x46;
  
  // WebP: 52 49 46 46 ... 57 45 42 50
  const isWebp = uint8[0] === 0x52 && uint8[1] === 0x49 && uint8[2] === 0x46 && uint8[3] === 0x46 &&
                 uint8[8] === 0x57 && uint8[9] === 0x45 && uint8[10] === 0x42 && uint8[11] === 0x50;
  
  if (!isJpeg && !isPng && !isGif && !isWebp) {
    return {
      valid: false,
      message: '不支持的图片格式，仅支持 JPG、PNG、GIF、WebP'
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
