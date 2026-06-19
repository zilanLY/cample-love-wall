// 通用工具函数

// 生成 UUID
export function generateId(prefix = '') {
  return prefix + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// 简单哈希（用于 IP 等敏感数据脱敏）
export async function simpleHash(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str + 'salt_wish_wall_2024');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
}

// XSS 转义
export function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 服务端 XSS 转义
export function escapeHtmlServer(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\//g, '&#x2F;');
}

// 统一响应格式
export function successResponse(data, message = 'success') {
  return Response.json({
    success: true,
    code: 0,
    message,
    data
  }, {
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

export function errorResponse(message, code = -1, status = 400) {
  return Response.json({
    success: false,
    code,
    message,
    data: null
  }, {
    status,
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

// 解析请求体
export async function parseBody(request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await request.json();
    }
    return {};
  } catch (e) {
    return {};
  }
}

// 获取客户端 IP
export function getClientIP(request) {
  return request.headers.get('cf-connecting-ip') || 
         request.headers.get('x-forwarded-for') || 
         request.headers.get('x-real-ip') || 
         '127.0.0.1';
}

// 简单的 JWT 实现（HS256）
export async function generateJWT(payload, secret, expiresIn = 86400) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const tokenPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn
  };

  const base64Header = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const base64Payload = btoa(JSON.stringify(tokenPayload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const signature = await hmacSign(`${base64Header}.${base64Payload}`, secret);
  const base64Signature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${base64Header}.${base64Payload}.${base64Signature}`;
}

export async function verifyJWT(token, secret) {
  try {
    const [header, payload, signature] = token.split('.');
    if (!header || !payload || !signature) return null;

    const expectedSignature = await hmacSign(`${header}.${payload}`, secret);
    const expectedBase64 = btoa(String.fromCharCode(...new Uint8Array(expectedSignature)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    if (signature !== expectedBase64) return null;

    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    const now = Math.floor(Date.now() / 1000);
    
    if (decoded.exp && decoded.exp < now) return null;
    
    return decoded;
  } catch (e) {
    return null;
  }
}

async function hmacSign(message, secret) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  return await crypto.subtle.sign('HMAC', cryptoKey, messageData);
}

// 简单密码哈希（SHA-256 + salt）
export async function hashPassword(password) {
  const salt = 'wish_wall_salt_2024_secure';
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 分页参数解析
export function parsePagination(query) {
  const page = parseInt(query.page) || 1;
  const pageSize = Math.min(parseInt(query.pageSize) || 20, 100);
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

// 内容类型验证
export const POST_TYPES = ['wish', 'confession', 'daily', 'rant'];

export function isValidPostType(type) {
  return POST_TYPES.includes(type);
}

// 内容类型中文名
export const POST_TYPE_NAMES = {
  wish: '心愿',
  confession: '表白',
  daily: '日常',
  rant: '吐槽'
};
