// 公开 API 路由
import { Router } from 'itty-router';
import {
  successResponse,
  errorResponse,
  parseBody,
  getClientIP,
  simpleHash,
  parsePagination,
  isValidPostType,
  escapeHtmlServer
} from '../utils/helpers.js';
import {
  getPosts,
  getPostById,
  createPost,
  getCategories,
  getStats,
  likePost,
  hasLiked,
  checkSensitiveWords,
  getSetting,
  getComments,
  createComment,
  getCommentById,
  likeComment,
  hasLikedComment,
  getCommentCount,
  createImage,
  getImagesByPostId,
  getAllImages,
  updateImage
} from '../db/database.js';
import {
  uploadMedia,
  validateImage,
  validateVideo,
  generateFilename,
  uploadImageDualStorage // 向后兼容
} from '../utils/image-storage.js';
import { aiReview } from '../utils/ai-review.js';
import { rateLimitMiddleware } from '../middleware/auth.js';

const router = Router({ base: '/api' });

// 获取内容列表
router.get('/posts', async (request, env) => {
  const { query } = request;
  const { page, pageSize } = parsePagination(query);
  
  const options = {
    status: 'approved',
    postType: query.type || null,
    categoryId: query.categoryId ? parseInt(query.categoryId) : null,
    search: query.search || null,
    page,
    pageSize,
    sortBy: query.sortBy || 'created_at',
    sortOrder: query.sortOrder || 'DESC'
  };

  try {
    const result = await getPosts(env.DB, options);
    return successResponse(result);
  } catch (e) {
    console.error('获取内容列表失败:', e);
    return errorResponse('获取内容列表失败');
  }
});

// 获取单条内容
router.get('/posts/:id', async (request, env) => {
  const { id } = request.params;
  
  try {
    const post = await getPostById(env.DB, parseInt(id));
    
    if (!post || post.status !== 'approved') {
      return errorResponse('内容不存在', 404, 404);
    }

    // 检查是否已点赞
    const ip = getClientIP(request);
    const ipHash = await simpleHash(ip);
    const liked = await hasLiked(env.DB, post.id, ipHash);

    return successResponse({
      ...post,
      liked
    });
  } catch (e) {
    console.error('获取内容详情失败:', e);
    return errorResponse('获取内容详情失败');
  }
});

// 发布内容
router.post('/posts', async (request, env) => {
  // 限流检查
  const rateLimit = await rateLimitMiddleware(request, env, 'post', 5, 3600);
  if (!rateLimit.allowed) {
    return errorResponse(rateLimit.message, 429, 429);
  }

  const body = await parseBody(request);
  const { content, author, postType = 'wish', categoryId, imageId } = body;

  // 参数验证
  if (!content || !content.trim()) {
    return errorResponse('内容不能为空');
  }

  if (!isValidPostType(postType)) {
    return errorResponse('无效的内容类型');
  }

  // 获取最大内容长度
  const maxLength = await getSetting(env.DB, 'max_content_length') || 500;
  if (content.length > maxLength) {
    return errorResponse(`内容长度不能超过 ${maxLength} 字`);
  }

  try {
    // 第一层：关键词审核
    const sensitiveResult = await checkSensitiveWords(env.DB, content);
    
    if (sensitiveResult.hasSensitive && sensitiveResult.highestLevel >= 2) {
      const matchedWords = sensitiveResult.matchedWords.map(w => w.word).join('、');
      return errorResponse(`内容包含敏感词：${matchedWords}，请修改后重新发布`, 400);
    }

    // XSS 转义
    const safeContent = escapeHtmlServer(content.trim());
    const safeAuthor = author ? escapeHtmlServer(author.trim()) : null;

    // 获取 IP 哈希
    const ip = getClientIP(request);
    const ipHash = await simpleHash(ip);

    // 第二层：审核逻辑
    const aiEnabled = await getSetting(env.DB, 'ai_enabled');
    const manualReviewEnabled = await getSetting(env.DB, 'manual_review_enabled');

    let initialStatus = 'pending';
    let aiResult = null;
    let reviewReason = null;

    // 如果 AI 和人工审核都关闭，直接通过
    if (aiEnabled === false && manualReviewEnabled === false) {
      initialStatus = 'approved';
      reviewReason = '免审核通过';
    } else if (aiEnabled) {
      // 获取 AI 配置（从 KV 缓存或数据库）
      let aiConfig = null;
      try {
        aiConfig = await env.KV.get('config:ai', { type: 'json' });
      } catch (e) {
        // KV 读取失败，使用默认配置
      }
      
      // 如果 KV 中没有配置，尝试从数据库中读取
      if (!aiConfig) {
        try {
          const { getSetting } = await import('../db/database.js');
          const dbConfig = await getSetting(env.DB, 'ai_config_detail');
          if (dbConfig) {
            aiConfig = dbConfig;
          }
        } catch (e) {}
      }

      if (aiConfig) {
        const aiReviewResult = await aiReview(safeContent, {
          enabled: true,
          provider: await getSetting(env.DB, 'ai_provider'),
          strictness: await getSetting(env.DB, 'ai_strictness'),
          ...aiConfig
        });

        aiResult = JSON.stringify(aiReviewResult);

        if (aiReviewResult.passed === false) {
          // AI 判定违规
          if (aiConfig.autoReject !== false) {
            return errorResponse(`内容审核未通过：${aiReviewResult.reason}`, 400);
          } else {
            initialStatus = 'pending';
            reviewReason = `AI 审核疑似违规: ${aiReviewResult.reason}`;
          }
        } else if (aiReviewResult.passed === true && manualReviewEnabled === false) {
          // AI 通过且人工审核关闭
          initialStatus = 'approved';
          reviewReason = 'AI 审核通过';
        }
      }
    }

    // 创建内容
    const postId = await createPost(env.DB, {
      content: safeContent,
      author: safeAuthor,
      postType,
      categoryId: categoryId ? parseInt(categoryId) : null,
      imageId: imageId ? parseInt(imageId) : null,
      ipHash,
      status: initialStatus
    });

    // 如果 AI 审核结果存在，更新记录
    if (aiResult || reviewReason) {
      const { updatePost } = await import('../db/database.js');
      await updatePost(env.DB, postId, {
        aiResult,
        status: initialStatus
      });
    }

    const message = initialStatus === 'approved' 
      ? '发布成功' 
      : '发布成功，等待审核';

    return successResponse({
      id: postId,
      status: initialStatus,
      message
    }, message);

  } catch (e) {
    console.error('发布内容失败:', e);
    return errorResponse('发布失败，请稍后重试');
  }
});

// 点赞
router.post('/posts/:id/like', async (request, env) => {
  const { id } = request.params;

  // 限流检查
  const rateLimit = await rateLimitMiddleware(request, env, 'like', 20, 3600);
  if (!rateLimit.allowed) {
    return errorResponse(rateLimit.message, 429, 429);
  }

  try {
    const post = await getPostById(env.DB, parseInt(id));
    
    if (!post || post.status !== 'approved') {
      return errorResponse('内容不存在', 404, 404);
    }

    const ip = getClientIP(request);
    const ipHash = await simpleHash(ip);

    const result = await likePost(env.DB, parseInt(id), ipHash);

    if (result.liked) {
      return successResponse({ liked: true, likes: post.likes + 1 }, '点赞成功');
    } else {
      return errorResponse('已经点过赞了', 400);
    }
  } catch (e) {
    console.error('点赞失败:', e);
    return errorResponse('点赞失败');
  }
});

// 获取评论列表
router.get('/posts/:id/comments', async (request, env) => {
  const { id } = request.params;
  const { query } = request;
  const { page, pageSize } = parsePagination(query);

  try {
    const post = await getPostById(env.DB, parseInt(id));
    if (!post || post.status !== 'approved') {
      return errorResponse('内容不存在', 404, 404);
    }

    const result = await getComments(env.DB, {
      postId: parseInt(id),
      status: 'approved',
      page,
      pageSize,
      parentId: 0
    });

    // 获取评论数量
    const commentCount = await getCommentCount(env.DB, parseInt(id), 'approved');

    return successResponse({
      ...result,
      totalCount: commentCount
    });
  } catch (e) {
    console.error('获取评论列表失败:', e);
    return errorResponse('获取评论列表失败');
  }
});

// 发布评论
router.post('/posts/:id/comments', async (request, env) => {
  const { id } = request.params;

  // 检查评论功能是否开启
  const commentEnabled = await getSetting(env.DB, 'comment_enabled');
  if (commentEnabled === false) {
    return errorResponse('评论功能已关闭', 403);
  }

  // 限流检查
  const commentRateLimit = await getSetting(env.DB, 'comment_rate_limit') || 10;
  const rateLimit = await rateLimitMiddleware(request, env, 'comment', commentRateLimit, 3600);
  if (!rateLimit.allowed) {
    return errorResponse(rateLimit.message, 429, 429);
  }

  const body = await parseBody(request);
  const { content, author, parentId = 0 } = body;

  // 参数验证
  if (!content || !content.trim()) {
    return errorResponse('评论内容不能为空');
  }

  const maxLength = await getSetting(env.DB, 'comment_max_length') || 200;
  if (content.length > maxLength) {
    return errorResponse(`评论长度不能超过 ${maxLength} 字`);
  }

  try {
    const post = await getPostById(env.DB, parseInt(id));
    if (!post || post.status !== 'approved') {
      return errorResponse('内容不存在', 404, 404);
    }

    // 第一层：关键词审核
    const sensitiveResult = await checkSensitiveWords(env.DB, content);
    
    if (sensitiveResult.hasSensitive && sensitiveResult.highestLevel >= 2) {
      const matchedWords = sensitiveResult.matchedWords.map(w => w.word).join('、');
      return errorResponse(`评论包含敏感词：${matchedWords}，请修改后重新发布`, 400);
    }

    // XSS 转义
    const safeContent = escapeHtmlServer(content.trim());
    const safeAuthor = author ? escapeHtmlServer(author.trim()) : null;

    // 获取 IP 哈希
    const ip = getClientIP(request);
    const ipHash = await simpleHash(ip);

    // 审核逻辑
    const commentNeedReview = await getSetting(env.DB, 'comment_need_review');
    const aiEnabled = await getSetting(env.DB, 'ai_enabled');
    const manualReviewEnabled = await getSetting(env.DB, 'manual_review_enabled');

    let initialStatus = 'pending';
    let aiResult = null;

    // 如果不需要审核，直接通过
    if (commentNeedReview === false) {
      initialStatus = 'approved';
    } else if (aiEnabled === false && manualReviewEnabled === false) {
      // AI 和人工审核都关闭，直接通过
      initialStatus = 'approved';
    } else if (aiEnabled) {
      // AI 审核
      let aiConfig = null;
      try {
        aiConfig = await env.KV.get('config:ai', { type: 'json' });
      } catch (e) {}
      
      // 如果 KV 中没有配置，尝试从数据库中读取
      if (!aiConfig) {
        try {
          const dbConfig = await getSetting(env.DB, 'ai_config_detail');
          if (dbConfig) {
            aiConfig = dbConfig;
          }
        } catch (e) {}
      }

      if (aiConfig) {
        const aiReviewResult = await aiReview(safeContent, {
          enabled: true,
          provider: await getSetting(env.DB, 'ai_provider'),
          strictness: await getSetting(env.DB, 'ai_strictness'),
          ...aiConfig
        });

        aiResult = JSON.stringify(aiReviewResult);

        if (aiReviewResult.passed === false) {
          if (aiConfig.autoReject !== false) {
            return errorResponse(`评论审核未通过：${aiReviewResult.reason}`, 400);
          } else {
            initialStatus = 'pending';
          }
        } else if (aiReviewResult.passed === true && manualReviewEnabled === false) {
          // AI 通过且人工审核关闭
          initialStatus = 'approved';
        }
      }
    }

    // 创建评论
    const commentId = await createComment(env.DB, {
      postId: parseInt(id),
      content: safeContent,
      author: safeAuthor,
      ipHash,
      status: initialStatus,
      parentId: parseInt(parentId) || 0
    });

    const message = initialStatus === 'approved' 
      ? '评论发布成功' 
      : '评论发布成功，等待审核';

    return successResponse({
      id: commentId,
      status: initialStatus,
      message
    }, message);

  } catch (e) {
    console.error('发布评论失败:', e);
    return errorResponse('发布评论失败，请稍后重试');
  }
});

// 评论点赞
router.post('/comments/:id/like', async (request, env) => {
  const { id } = request.params;

  // 限流检查
  const rateLimit = await rateLimitMiddleware(request, env, 'comment_like', 30, 3600);
  if (!rateLimit.allowed) {
    return errorResponse(rateLimit.message, 429, 429);
  }

  try {
    const comment = await getCommentById(env.DB, parseInt(id));
    if (!comment || comment.status !== 'approved') {
      return errorResponse('评论不存在', 404, 404);
    }

    const ip = getClientIP(request);
    const ipHash = await simpleHash(ip);

    const result = await likeComment(env.DB, parseInt(id), ipHash);

    if (result.success) {
      return successResponse({ liked: true, likes: comment.likes + 1 }, '点赞成功');
    } else {
      return errorResponse(result.message || '已经点过赞了', 400);
    }
  } catch (e) {
    console.error('评论点赞失败:', e);
    return errorResponse('点赞失败');
  }
});

// 获取分类列表
router.get('/categories', async (request, env) => {
  const { query } = request;
  const postType = query.type || null;

  try {
    const categories = await getCategories(env.DB, postType, true);
    return successResponse(categories);
  } catch (e) {
    console.error('获取分类列表失败:', e);
    return errorResponse('获取分类列表失败');
  }
});

// 获取统计数据（公开）
router.get('/stats', async (request, env) => {
  try {
    const stats = await getStats(env.DB);
    
    // 只返回公开的统计数据
    return successResponse({
      totalPosts: stats.totalPosts,
      todayPosts: stats.todayPosts,
      totalLikes: stats.totalLikes,
      totalCategories: stats.totalCategories
    });
  } catch (e) {
    console.error('获取统计数据失败:', e);
    return errorResponse('获取统计数据失败');
  }
});

// 图片相关 API
// 上传图片
router.post('/images/upload', async (request, env) => {
  // 限流检查
  const rateLimit = await rateLimitMiddleware(request, env, 'image_upload', 10, 3600);
  if (!rateLimit.allowed) {
    return errorResponse(rateLimit.message, 429, 429);
  }

  try {
    // 1. 解析 FormData
    let formData;
    try {
      formData = await request.formData();
    } catch (e) {
      console.error('解析 FormData 失败:', e);
      return errorResponse('请求格式错误，请检查文件上传格式');
    }

    const file = formData.get('file');
    if (!file) {
      return errorResponse('请选择要上传的图片');
    }

    // 2. 读取文件数据
    let arrayBuffer;
    try {
      arrayBuffer = await file.arrayBuffer();
    } catch (e) {
      console.error('读取文件数据失败:', e);
      return errorResponse('读取文件失败，请重试');
    }

    const imageData = new Uint8Array(arrayBuffer);

    // 3. 验证图片
    const validation = validateImage(arrayBuffer, 5 * 1024 * 1024);
    if (!validation.valid) {
      return errorResponse(validation.message);
    }

    // 4. 生成文件名
    const filename = generateFilename('jpg');

    // 5. 获取 IP 哈希
    const ip = getClientIP(request);
    const ipHash = await simpleHash(ip);

    // 6. 上传到图床
    let fileUrl;
    try {
      fileUrl = await uploadMedia(arrayBuffer, filename);
    } catch (e) {
      console.error('图床上传失败:', e);
      return errorResponse(`图片上传失败：${e.message}`);
    }

    // 7. 保存到数据库
    let imageId;
    try {
      imageId = await createImage(env.DB, {
        postId: null,
        defaultUrl: fileUrl,
        telegramUrl: fileUrl,
        primaryUrl: fileUrl,
        filename,
        fileSize: imageData.length,
        uploadIp: ipHash,
        status: 'active'
      });
    } catch (e) {
      console.error('保存图片记录到数据库失败:', e);
      return errorResponse(`保存失败：${e.message}`);
    }

    return successResponse({
      id: imageId,
      url: fileUrl,
      defaultUrl: fileUrl,
      telegramUrl: fileUrl,
      primaryUrl: fileUrl,
      filename
    }, '上传成功');

  } catch (e) {
    console.error('图片上传未知错误:', e);
    return errorResponse(`图片上传失败：${e.message || '未知错误'}`);
  }
});

// 上传视频
router.post('/videos/upload', async (request, env) => {
  // 限流检查
  const rateLimit = await rateLimitMiddleware(request, env, 'video_upload', 5, 3600);
  if (!rateLimit.allowed) {
    return errorResponse(rateLimit.message, 429, 429);
  }

  try {
    // 1. 解析 FormData
    let formData;
    try {
      formData = await request.formData();
    } catch (e) {
      console.error('解析 FormData 失败:', e);
      return errorResponse('请求格式错误，请检查文件上传格式');
    }

    const file = formData.get('file');
    if (!file) {
      return errorResponse('请选择要上传的视频');
    }

    // 2. 读取文件数据
    let arrayBuffer;
    try {
      arrayBuffer = await file.arrayBuffer();
    } catch (e) {
      console.error('读取文件数据失败:', e);
      return errorResponse('读取文件失败，请重试');
    }

    const fileData = new Uint8Array(arrayBuffer);

    // 3. 验证视频
    const validation = validateVideo(arrayBuffer, 15 * 1024 * 1024);
    if (!validation.valid) {
      return errorResponse(validation.message);
    }

    // 4. 生成文件名
    const filename = generateFilename('mp4');

    // 5. 获取 IP 哈希
    const ip = getClientIP(request);
    const ipHash = await simpleHash(ip);

    // 6. 上传到图床（图床会自动转为动态 WebP）
    let fileUrl;
    try {
      fileUrl = await uploadMedia(arrayBuffer, filename);
    } catch (e) {
      console.error('图床上传失败:', e);
      return errorResponse(`视频上传失败：${e.message}`);
    }

    // 7. 保存到数据库（复用 images 表，因为图床转成了动态 WebP 图片）
    let imageId;
    try {
      imageId = await createImage(env.DB, {
        postId: null,
        defaultUrl: fileUrl,
        telegramUrl: fileUrl,
        primaryUrl: fileUrl,
        filename,
        fileSize: fileData.length,
        uploadIp: ipHash,
        status: 'active'
      });
    } catch (e) {
      console.error('保存视频记录到数据库失败:', e);
      return errorResponse(`保存失败：${e.message}`);
    }

    return successResponse({
      id: imageId,
      url: fileUrl,
      defaultUrl: fileUrl,
      telegramUrl: fileUrl,
      primaryUrl: fileUrl,
      filename,
      type: 'video'
    }, '上传成功');

  } catch (e) {
    console.error('视频上传未知错误:', e);
    return errorResponse(`视频上传失败：${e.message || '未知错误'}`);
  }
});

// 获取所有图片（用于预加载页面）
router.get('/images', async (request, env) => {
  const { query } = request;
  const { page, pageSize } = parsePagination(query);

  try {
    const result = await getAllImages(env.DB, {
      page,
      pageSize: Math.min(pageSize, 200) // 最多200条
    });

    return successResponse(result);
  } catch (e) {
    console.error('获取图片列表失败:', e);
    return errorResponse('获取图片列表失败');
  }
});

// 获取帖子的图片
router.get('/posts/:id/images', async (request, env) => {
  const { id } = request.params;

  try {
    const post = await getPostById(env.DB, parseInt(id));
    
    if (!post || post.status !== 'approved') {
      return errorResponse('内容不存在', 404, 404);
    }

    const images = await getImagesByPostId(env.DB, parseInt(id));

    return successResponse(images);
  } catch (e) {
    console.error('获取帖子图片失败:', e);
    return errorResponse('获取帖子图片失败');
  }
});

export default router;
