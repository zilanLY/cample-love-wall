// 鉴权中间件
import { verifyJWT } from '../utils/helpers.js';
import { errorResponse } from '../utils/helpers.js';

export async function authMiddleware(request, env) {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse('未授权，请先登录', 401, 401);
  }

  const token = authHeader.substring(7);
  const secret = env.JWT_SECRET || 'default-jwt-secret-change-in-production';
  const payload = await verifyJWT(token, secret);

  if (!payload) {
    return errorResponse('Token 无效或已过期', 401, 401);
  }

  // 将用户信息附加到 request 上
  request.admin = payload;
  return null; // 返回 null 表示继续执行
}

// 限流中间件（基于 KV）
export async function rateLimitMiddleware(request, env, key, limit, windowSeconds = 3600) {
  const ip = request.headers.get('cf-connecting-ip') || '127.0.0.1';
  const kvKey = `rate_limit:${key}:${ip}`;
  
  try {
    const current = await env.KV.get(kvKey, { type: 'json' });
    const now = Date.now();
    
    if (!current || now - current.timestamp > windowSeconds * 1000) {
      // 重置计数
      await env.KV.put(kvKey, JSON.stringify({
        count: 1,
        timestamp: now
      }), { expirationTtl: windowSeconds });
      return { allowed: true, remaining: limit - 1 };
    }
    
    if (current.count >= limit) {
      return { 
        allowed: false, 
        remaining: 0,
        message: `操作过于频繁，请稍后再试（每${windowSeconds/3600}小时最多${limit}次）`
      };
    }
    
    current.count++;
    await env.KV.put(kvKey, JSON.stringify(current), { expirationTtl: windowSeconds });
    
    return { allowed: true, remaining: limit - current.count };
  } catch (e) {
    // KV 出错时放行，避免影响正常使用
    console.error('限流检查失败:', e);
    return { allowed: true, remaining: limit };
  }
}

// CORS 中间件
export function corsMiddleware(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
      }
    });
  }
  return null;
}
