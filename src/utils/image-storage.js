// 媒体存储工具 - GitHub 多仓库存储

/**
 * GitHub 仓库配置类型
 * @typedef {Object} GitHubRepoConfig
 * @property {string} id - 仓库唯一标识
 * @property {string} name - 仓库名称（显示用）
 * @property {string} token - GitHub Token
 * @property {string} owner - 仓库所有者
 * @property {string} repo - 仓库名称
 * @property {string} branch - 分支名称
 * @property {string} path - 存储路径前缀
 * @property {boolean} useJsDelivr - 是否使用 jsDelivr CDN
 * @property {number} weight - 权重（用于加权随机）
 * @property {boolean} enabled - 是否启用
 */

/**
 * 仓库选择策略
 * @type {'round_robin'|'random'|'weighted_random'}
 */
const REPO_SELECTION_STRATEGY = 'round_robin';

// 轮询计数器（内存级，Worker 重启后重置）
let roundRobinIndex = 0;

/**
 * 上传文件到单个 GitHub 仓库
 * @param {ArrayBuffer} fileData - 文件二进制数据
 * @param {string} filename - 文件名
 * @param {GitHubRepoConfig} repoConfig - GitHub 仓库配置
 * @returns {Promise<{url: string, repoId: string}>} 文件访问 URL 和仓库 ID
 */
async function uploadToGitHubRepo(fileData, filename, repoConfig) {
  const { 
    id, 
    token, 
    owner, 
    repo, 
    branch = 'main', 
    path = 'images', 
    useJsDelivr = true 
  } = repoConfig;
  
  if (!token || !owner || !repo) {
    throw new Error('GitHub 仓库配置不完整：缺少 token、owner 或 repo');
  }
  
  try {
    // 构造文件路径（按日期分目录）
    const date = new Date();
    const datePath = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
    const cleanPath = path.replace(/^\/+|\/+$/g, '');
    const filePath = cleanPath ? `${cleanPath}/${datePath}/${filename}` : `${datePath}/${filename}`;
    
    // 将 ArrayBuffer 转为 base64
    const base64Content = arrayBufferToBase64(fileData);
    
    // GitHub API URL
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
    
    // 提交信息
    const message = `Upload image: ${filename}`;
    
    const response = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'campus-wish-wall'
      },
      body: JSON.stringify({
        message,
        content: base64Content,
        branch
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      let errorMsg = `GitHub 仓库 ${repoConfig.name || id} 上传失败 (HTTP ${response.status})`;
      
      // 尝试解析错误信息
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.message) {
          errorMsg += `: ${errorData.message}`;
        }
      } catch (e) {}
      
      throw new Error(errorMsg);
    }
    
    const result = await response.json();
    
    // 返回访问 URL
    let url;
    if (useJsDelivr) {
      // 使用 jsDelivr CDN 加速
      url = `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${filePath}`;
    } else {
      // 使用 GitHub 原始地址
      url = result.content.download_url || result.content.html_url;
    }
    
    return { url, repoId: id };
  } catch (error) {
    console.error(`GitHub 仓库 ${repoConfig.name || id} 上传失败:`, error);
    throw error;
  }
}

/**
 * 选择一个可用的仓库
 * @param {GitHubRepoConfig[]} repos - 仓库配置列表
 * @param {'round_robin'|'random'|'weighted_random'} strategy - 选择策略
 * @returns {GitHubRepoConfig} 选中的仓库配置
 */
function selectRepo(repos, strategy = REPO_SELECTION_STRATEGY) {
  // 过滤出启用的仓库
  const enabledRepos = repos.filter(r => r.enabled !== false);
  
  if (enabledRepos.length === 0) {
    throw new Error('没有可用的 GitHub 仓库');
  }
  
  switch (strategy) {
    case 'random':
      // 随机选择
      return enabledRepos[Math.floor(Math.random() * enabledRepos.length)];
      
    case 'weighted_random':
      // 加权随机
      const totalWeight = enabledRepos.reduce((sum, r) => sum + (r.weight || 1), 0);
      let random = Math.random() * totalWeight;
      for (const repo of enabledRepos) {
        random -= repo.weight || 1;
        if (random <= 0) {
          return repo;
        }
      }
      return enabledRepos[enabledRepos.length - 1];
      
    case 'round_robin':
    default:
      // 轮询
      const repo = enabledRepos[roundRobinIndex % enabledRepos.length];
      roundRobinIndex = (roundRobinIndex + 1) % enabledRepos.length;
      return repo;
  }
}

/**
 * 上传媒体文件（统一入口 - GitHub 多仓库存储）
 * @param {ArrayBuffer} fileData - 文件二进制数据
 * @param {string} filename - 文件名
 * @param {Object|GitHubRepoConfig[]} storageConfig - 存储配置（仓库列表或配置对象）
 * @returns {Promise<string>} 文件 URL
 */
export async function uploadMedia(fileData, filename, storageConfig) {
  let repos = [];
  
  // 兼容不同的配置格式
  if (Array.isArray(storageConfig)) {
    repos = storageConfig;
  } else if (storageConfig && storageConfig.repos) {
    repos = storageConfig.repos;
  } else if (storageConfig && storageConfig.github) {
    // 兼容旧的单仓库格式
    repos = [{
      id: 'default',
      name: '默认仓库',
      ...storageConfig.github,
      enabled: true
    }];
  } else {
    throw new Error('无效的存储配置：请提供 GitHub 仓库配置列表');
  }
  
  if (repos.length === 0) {
    throw new Error('未配置任何 GitHub 仓库');
  }
  
  // 获取选择策略
  const strategy = storageConfig?.strategy || REPO_SELECTION_STRATEGY;
  
  // 尝试上传，失败则尝试下一个仓库
  const enabledRepos = repos.filter(r => r.enabled !== false);
  const shuffledRepos = [...enabledRepos];
  
  // 如果是轮询或随机策略，先尝试选中的仓库
  let firstRepo;
  try {
    firstRepo = selectRepo(shuffledRepos, strategy);
  } catch (e) {
    throw new Error('选择仓库失败：' + e.message);
  }
  
  // 把选中的仓库放到最前面
  const otherRepos = shuffledRepos.filter(r => r.id !== firstRepo.id);
  const tryOrder = [firstRepo, ...otherRepos];
  
  // 依次尝试上传
  let lastError = null;
  for (const repo of tryOrder) {
    try {
      const result = await uploadToGitHubRepo(fileData, filename, repo);
      console.log(`图片上传成功，使用仓库：${repo.name || repo.id}`);
      return result.url;
    } catch (error) {
      console.warn(`仓库 ${repo.name || repo.id} 上传失败，尝试下一个...`, error.message);
      lastError = error;
    }
  }
  
  // 所有仓库都失败
  throw new Error(`所有 GitHub 仓库都上传失败。最后错误：${lastError?.message || '未知错误'}`);
}

/**
 * ArrayBuffer 转 Base64
 * @param {ArrayBuffer} buffer 
 * @returns {string} base64 字符串
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * 验证图片文件
 * @param {ArrayBuffer} fileData - 文件二进制数据
 * @param {number} maxSize - 最大大小（字节），默认 5MB
 * @returns {object} 验证结果
 */
export function validateImage(fileData, maxSize = 5 * 1024 * 1024) {
  if (!fileData || fileData.byteLength === 0) {
    return {
      valid: false,
      message: '文件为空或无效'
    };
  }
  
  if (fileData.byteLength > maxSize) {
    return {
      valid: false,
      message: `图片大小不能超过 ${maxSize / 1024 / 1024}MB`
    };
  }
  
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
  if (!fileData || fileData.byteLength === 0) {
    return {
      valid: false,
      message: '文件为空或无效'
    };
  }
  
  if (fileData.byteLength > maxSize) {
    return {
      valid: false,
      message: `视频大小不能超过 ${maxSize / 1024 / 1024}MB`
    };
  }
  
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

/**
 * 测试单个 GitHub 仓库配置
 * @param {GitHubRepoConfig} repoConfig - GitHub 仓库配置
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function testGitHubRepo(repoConfig) {
  const { token, owner, repo, branch = 'main' } = repoConfig;
  
  if (!token || !owner || !repo) {
    return { success: false, message: '配置不完整：缺少 token、owner 或 repo' };
  }
  
  try {
    // 测试获取仓库信息
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${token}`,
        'User-Agent': 'campus-wish-wall'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      let message = `连接失败 (HTTP ${response.status})`;
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.message) {
          message = errorData.message;
        }
      } catch (e) {}
      return { success: false, message };
    }
    
    const data = await response.json();
    
    // 检查是否有推送权限
    if (data.permissions && data.permissions.push === false) {
      return { success: false, message: 'Token 没有仓库写入权限' };
    }
    
    return { 
      success: true, 
      message: `连接成功！仓库：${data.full_name}，默认分支：${data.default_branch}` 
    };
  } catch (error) {
    console.error('测试 GitHub 仓库失败:', error);
    return { success: false, message: error.message || '连接失败' };
  }
}

/**
 * 测试 GitHub 配置（向后兼容）
 * @param {Object} githubConfig - GitHub 配置
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function testGitHubConfig(githubConfig) {
  return testGitHubRepo(githubConfig);
}

// ========== 向后兼容函数 ==========

export async function uploadToDefaultStorage(imageData, filename) {
  // 这个函数需要外部传入配置，这里只是占位
  throw new Error('请使用 uploadMedia 并传入 GitHub 仓库配置');
}

export async function uploadToTelegramStorage(imageData, filename) {
  throw new Error('请使用 uploadMedia 并传入 GitHub 仓库配置');
}

export async function uploadImageDualStorage(imageData, filename, env) {
  // 从环境或配置中获取仓库列表
  throw new Error('请使用 uploadMedia 并传入 GitHub 仓库配置');
}

// 导出常量
export const STORAGE_STRATEGIES = {
  ROUND_ROBIN: 'round_robin',
  RANDOM: 'random',
  WEIGHTED_RANDOM: 'weighted_random'
};
