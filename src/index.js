// 主入口文件
import { Router } from 'itty-router';
import publicRouter from './api/public.js';
import adminRouter from './api/admin.js';
import { corsMiddleware } from './middleware/auth.js';
import { errorResponse } from './utils/helpers.js';
import { INDEX_HTML } from './pages/index.html.js';
import { ADMIN_HTML } from './pages/admin.html.js';
import { IMAGES_HTML } from './pages/images.html.js';

// 创建主路由
const router = Router();

// CORS 处理
router.all('*', (request) => {
  const corsResult = corsMiddleware(request);
  if (corsResult) return corsResult;
});

// API 路由 - 管理后台 API 要放在前面，避免被 public 路由匹配
router.all('/api/admin/*', (request, env, ctx) => {
  return adminRouter.handle(request, env, ctx);
});

router.all('/api/*', (request, env, ctx) => {
  return publicRouter.handle(request, env, ctx);
});

// 管理后台页面
router.get('/admin', () => {
  return new Response(ADMIN_HTML, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8'
    }
  });
});

router.get('/admin/', () => {
  return new Response(ADMIN_HTML, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8'
    }
  });
});

// 用户端首页
router.get('/', () => {
  return new Response(INDEX_HTML, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8'
    }
  });
});

// 图片预加载页面
router.get('/images', () => {
  return new Response(IMAGES_HTML, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8'
    }
  });
});

// 404
router.all('*', () => {
  return errorResponse('Not Found', 404, 404);
});

// Worker 入口
export default {
  async fetch(request, env, ctx) {
    try {
      return router.handle(request, env, ctx);
    } catch (error) {
      console.error('Unhandled error:', error);
      return errorResponse('Internal Server Error', 500, 500);
    }
  }
};
