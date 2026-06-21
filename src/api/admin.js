// 管理后台 API 路由
import { Router } from 'itty-router';
import {
  successResponse,
  errorResponse,
  parseBody,
  generateJWT,
  hashPassword,
  parsePagination,
  isValidPostType
} from '../utils/helpers.js';
import {
  getPosts,
  getPostById,
  updatePost,
  updatePostStatus,
  deletePost,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryById,
  getSensitiveWords,
  addSensitiveWord,
  updateSensitiveWord,
  deleteSensitiveWord,
  batchAddSensitiveWords,
  getAdminByUsername,
  createAdmin,
  hasAdmin,
  updateAdminLastLogin,
  getStats,
  getAllSettings,
  setSetting,
  getSetting,
  getComments,
  getCommentById,
  updateCommentStatus,
  deleteComment,
  initDatabase,
  getAdminById,
  updateAdminPassword,
  updateAdminUsername
} from '../db/database.js';
import { authMiddleware } from '../middleware/auth.js';
import { testAIConfig } from '../utils/ai-review.js';
import { testGitHubConfig } from '../utils/image-storage.js';

const router = Router({ base: '/api/admin' });

// 登录接口（不需要鉴权）
router.post('/login', async (request, env) => {
  const body = await parseBody(request);
  const { username, password } = body;

  if (!username || !password) {
    return errorResponse('用户名和密码不能为空');
  }

  try {
    const admin = await getAdminByUsername(env.DB, username);
    
    if (!admin) {
      return errorResponse('用户名或密码错误');
    }

    const passwordHash = await hashPassword(password);
    if (passwordHash !== admin.password_hash) {
      return errorResponse('用户名或密码错误');
    }

    // 更新最后登录时间
    await updateAdminLastLogin(env.DB, admin.id);

    // 生成 Token
    const secret = env.JWT_SECRET || 'default-jwt-secret-change-in-production';
    const token = await generateJWT({
      id: admin.id,
      username: admin.username,
      role: admin.role
    }, secret, 86400); // 24小时过期

    return successResponse({
      token,
      user: {
        id: admin.id,
        username: admin.username,
        role: admin.role
      }
    }, '登录成功');
  } catch (e) {
    console.error('登录失败:', e);
    return errorResponse('登录失败');
  }
});

// 一键初始化（首次部署时使用，自动创建表结构+初始数据+管理员账号）
router.get('/init', async (request, env) => {
  try {
    // 1. 先初始化数据库表结构和初始数据
    const dbInitResult = await initDatabase(env.DB);
    
    // 2. 检查管理员是否已存在
    const adminExists = await hasAdmin(env.DB);
    
    if (adminExists) {
      return successResponse({
        databaseInitialized: dbInitResult.alreadyInitialized ? '已初始化' : '初始化成功',
        admin: '已存在'
      }, '系统已初始化，请勿重复操作');
    }

    // 3. 创建管理员账号
    const initPassword = env.ADMIN_INIT_PASSWORD || 'admin123';
    const passwordHash = await hashPassword(initPassword);
    
    await createAdmin(env.DB, 'admin', passwordHash, 'super_admin');

    return successResponse({
      databaseInitialized: dbInitResult.alreadyInitialized ? '已初始化' : '初始化成功',
      adminCreated: true,
      username: 'admin',
      password: initPassword
    }, '系统初始化成功！请使用管理员账号登录后台');
  } catch (e) {
    console.error('初始化失败:', e);
    return errorResponse('初始化失败: ' + e.message);
  }
});

// 以下接口需要鉴权
router.all('*', async (request, env) => {
  return await authMiddleware(request, env);
});

// 内容管理
router.get('/posts', async (request, env) => {
  const { query } = request;
  const { page, pageSize } = parsePagination(query);
  
  const options = {
    status: query.status || null,
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

// 获取单条内容详情
router.get('/posts/:id', async (request, env) => {
  const { id } = request.params;
  try {
    const post = await getPostById(env.DB, parseInt(id));
    if (!post) {
      return errorResponse('内容不存在', 404);
    }
    return successResponse(post);
  } catch (e) {
    console.error('获取内容详情失败:', e);
    return errorResponse('获取内容详情失败');
  }
});

// 审核内容
router.put('/posts/:id/review', async (request, env) => {
  const { id } = request.params;
  const body = await parseBody(request);
  const { status, reason } = body;

  if (!['approved', 'rejected'].includes(status)) {
    return errorResponse('无效的审核状态');
  }

  try {
    const post = await getPostById(env.DB, parseInt(id));
    if (!post) {
      return errorResponse('内容不存在', 404, 404);
    }

    await updatePostStatus(env.DB, parseInt(id), status, reason, request.admin.username);

    return successResponse(null, '审核成功');
  } catch (e) {
    console.error('审核失败:', e);
    return errorResponse('审核失败');
  }
});

// 批量审核
router.post('/posts/batch-review', async (request, env) => {
  const body = await parseBody(request);
  const { ids, status, reason } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return errorResponse('请选择要审核的内容');
  }

  if (!['approved', 'rejected'].includes(status)) {
    return errorResponse('无效的审核状态');
  }

  try {
    let successCount = 0;
    for (const id of ids) {
      await updatePostStatus(env.DB, parseInt(id), status, reason, request.admin.username);
      successCount++;
    }

    return successResponse({ successCount }, `成功审核 ${successCount} 条内容`);
  } catch (e) {
    console.error('批量审核失败:', e);
    return errorResponse('批量审核失败');
  }
});

// 编辑内容
router.put('/posts/:id', async (request, env) => {
  const { id } = request.params;
  const body = await parseBody(request);

  try {
    const post = await getPostById(env.DB, parseInt(id));
    if (!post) {
      return errorResponse('内容不存在', 404, 404);
    }

    const updateData = {};
    if (body.content !== undefined) updateData.content = body.content;
    if (body.author !== undefined) updateData.author = body.author;
    if (body.postType !== undefined) updateData.postType = body.postType;
    if (body.categoryId !== undefined) updateData.categoryId = body.categoryId;

    await updatePost(env.DB, parseInt(id), updateData);

    return successResponse(null, '更新成功');
  } catch (e) {
    console.error('更新内容失败:', e);
    return errorResponse('更新失败');
  }
});

// 删除内容
router.delete('/posts/:id', async (request, env) => {
  const { id } = request.params;

  try {
    const post = await getPostById(env.DB, parseInt(id));
    if (!post) {
      return errorResponse('内容不存在', 404, 404);
    }

    await deletePost(env.DB, parseInt(id));
    return successResponse(null, '删除成功');
  } catch (e) {
    console.error('删除内容失败:', e);
    return errorResponse('删除失败');
  }
});

// 评论管理
router.get('/comments', async (request, env) => {
  const { query } = request;
  const { page, pageSize } = parsePagination(query);
  
  const options = {
    postId: query.postId ? parseInt(query.postId) : null,
    status: query.status || null,
    page,
    pageSize,
    parentId: null
  };

  try {
    const result = await getComments(env.DB, options);
    return successResponse(result);
  } catch (e) {
    console.error('获取评论列表失败:', e);
    return errorResponse('获取评论列表失败');
  }
});

// 审核评论
router.put('/comments/:id/review', async (request, env) => {
  const { id } = request.params;
  const body = await parseBody(request);
  const { status, reason } = body;

  if (!['approved', 'rejected'].includes(status)) {
    return errorResponse('无效的审核状态');
  }

  try {
    const comment = await getCommentById(env.DB, parseInt(id));
    if (!comment) {
      return errorResponse('评论不存在', 404, 404);
    }

    await updateCommentStatus(env.DB, parseInt(id), status, reason, request.admin.username);

    return successResponse(null, '审核成功');
  } catch (e) {
    console.error('审核评论失败:', e);
    return errorResponse('审核失败');
  }
});

// 删除评论
router.delete('/comments/:id', async (request, env) => {
  const { id } = request.params;

  try {
    const comment = await getCommentById(env.DB, parseInt(id));
    if (!comment) {
      return errorResponse('评论不存在', 404, 404);
    }

    await deleteComment(env.DB, parseInt(id));
    return successResponse(null, '删除成功');
  } catch (e) {
    console.error('删除评论失败:', e);
    return errorResponse('删除失败');
  }
});

// 分类管理
router.get('/categories', async (request, env) => {
  try {
    const categories = await getCategories(env.DB, null, false);
    return successResponse(categories);
  } catch (e) {
    console.error('获取分类列表失败:', e);
    return errorResponse('获取分类列表失败');
  }
});

router.post('/categories', async (request, env) => {
  const body = await parseBody(request);
  const { name, icon, postType, sort, isActive } = body;

  if (!name || !name.trim()) {
    return errorResponse('分类名称不能为空');
  }

  if (!isValidPostType(postType)) {
    return errorResponse('无效的内容类型');
  }

  try {
    const id = await createCategory(env.DB, {
      name: name.trim(),
      icon,
      postType,
      sort,
      isActive
    });

    return successResponse({ id }, '创建成功');
  } catch (e) {
    console.error('创建分类失败:', e);
    return errorResponse('创建失败');
  }
});

router.put('/categories/:id', async (request, env) => {
  const { id } = request.params;
  const body = await parseBody(request);

  try {
    const category = await getCategoryById(env.DB, parseInt(id));
    if (!category) {
      return errorResponse('分类不存在', 404, 404);
    }

    await updateCategory(env.DB, parseInt(id), body);
    return successResponse(null, '更新成功');
  } catch (e) {
    console.error('更新分类失败:', e);
    return errorResponse('更新失败');
  }
});

router.delete('/categories/:id', async (request, env) => {
  const { id } = request.params;

  try {
    const category = await getCategoryById(env.DB, parseInt(id));
    if (!category) {
      return errorResponse('分类不存在', 404, 404);
    }

    await deleteCategory(env.DB, parseInt(id));
    return successResponse(null, '删除成功');
  } catch (e) {
    console.error('删除分类失败:', e);
    return errorResponse('删除失败');
  }
});

// 敏感词管理
router.get('/sensitive-words', async (request, env) => {
  const { query } = request;
  
  try {
    const words = await getSensitiveWords(env.DB, query.category || null);
    return successResponse(words);
  } catch (e) {
    console.error('获取敏感词列表失败:', e);
    return errorResponse('获取敏感词列表失败');
  }
});

router.post('/sensitive-words', async (request, env) => {
  const body = await parseBody(request);
  const { word, category = 'other', level = 2 } = body;

  if (!word || !word.trim()) {
    return errorResponse('敏感词不能为空');
  }

  try {
    const result = await addSensitiveWord(env.DB, word.trim(), category, level);
    if (!result.success) {
      return errorResponse(result.message);
    }

    // 清除 KV 缓存
    try {
      await env.KV.delete('cache:sensitive_words');
    } catch (e) {}

    return successResponse({ id: result.id }, '添加成功');
  } catch (e) {
    console.error('添加敏感词失败:', e);
    return errorResponse('添加失败');
  }
});

// 批量导入敏感词
router.post('/sensitive-words/batch', async (request, env) => {
  const body = await parseBody(request);
  const { words } = body;

  if (!Array.isArray(words) || words.length === 0) {
    return errorResponse('请提供敏感词列表');
  }

  try {
    const result = await batchAddSensitiveWords(env.DB, words);

    // 清除 KV 缓存
    try {
      await env.KV.delete('cache:sensitive_words');
    } catch (e) {}

    return successResponse(result, `成功添加 ${result.successCount} 个，跳过 ${result.failCount} 个`);
  } catch (e) {
    console.error('批量添加敏感词失败:', e);
    return errorResponse('批量添加失败');
  }
});

router.put('/sensitive-words/:id', async (request, env) => {
  const { id } = request.params;
  const body = await parseBody(request);

  try {
    await updateSensitiveWord(env.DB, parseInt(id), body);
    
    // 清除 KV 缓存
    try {
      await env.KV.delete('cache:sensitive_words');
    } catch (e) {}

    return successResponse(null, '更新成功');
  } catch (e) {
    console.error('更新敏感词失败:', e);
    return errorResponse('更新失败');
  }
});

router.delete('/sensitive-words/:id', async (request, env) => {
  const { id } = request.params;

  try {
    await deleteSensitiveWord(env.DB, parseInt(id));
    
    // 清除 KV 缓存
    try {
      await env.KV.delete('cache:sensitive_words');
    } catch (e) {}

    return successResponse(null, '删除成功');
  } catch (e) {
    console.error('删除敏感词失败:', e);
    return errorResponse('删除失败');
  }
});

// AI 审核配置
router.get('/ai-config', async (request, env) => {
  try {
    // 优先从数据库获取详细配置（数据库是数据源，KV 是缓存）
    let config = null;
    try {
      const dbConfig = await getSetting(env.DB, 'ai_config_detail');
      if (dbConfig) {
        config = dbConfig;
        // 异步更新 KV 缓存
        env.KV.put('config:ai', JSON.stringify(config)).catch(e => 
          console.warn('更新 KV 缓存失败:', e)
        );
      }
    } catch (e) {
      console.warn('从数据库读取 AI 配置失败，尝试从 KV 读取:', e);
    }
    
    // 如果数据库中没有配置，尝试从 KV 中读取
    if (!config) {
      try {
        const kvConfig = await env.KV.get('config:ai', { type: 'json' });
        if (kvConfig) {
          config = kvConfig;
        }
      } catch (e) {}
    }

    // 从数据库获取基础配置（以数据库为准）
    const aiEnabled = await getSetting(env.DB, 'ai_enabled');
    const aiProvider = await getSetting(env.DB, 'ai_provider');
    const aiStrictness = await getSetting(env.DB, 'ai_strictness');

    // 构建返回结果，基础配置优先（数据库为准）
    const result = {
      enabled: aiEnabled === true ? true : false, // 确保是布尔值
      provider: aiProvider || 'openai',
      strictness: aiStrictness || 'medium',
      ...(config || {})
    };

    return successResponse(result);
  } catch (e) {
    console.error('获取 AI 配置失败:', e);
    return errorResponse('获取配置失败');
  }
});

router.put('/ai-config', async (request, env) => {
  const body = await parseBody(request);

  try {
    // 保存基础配置到数据库
    if (body.enabled !== undefined) {
      await setSetting(env.DB, 'ai_enabled', body.enabled);
    }
    if (body.provider !== undefined) {
      await setSetting(env.DB, 'ai_provider', body.provider);
    }
    if (body.strictness !== undefined) {
      await setSetting(env.DB, 'ai_strictness', body.strictness);
    }

    // 保存详细配置到数据库（数据库为主）
    const aiConfig = {
      autoReject: body.autoReject !== false,
      reviewDimensions: body.reviewDimensions || {
        politics: true,
        porn: true,
        violence: true,
        ad: true,
        abuse: true
      },
      openai: body.openai || null,
      xunfei: body.xunfei || null
    };

    // 先保存到数据库
    try {
      await setSetting(env.DB, 'ai_config_detail', aiConfig);
    } catch (e) {
      console.error('保存 AI 配置到数据库失败:', e);
      throw e;
    }
    
    // 再更新 KV 缓存
    try {
      await env.KV.put('config:ai', JSON.stringify(aiConfig));
    } catch (e) {
      console.warn('保存 AI 配置到 KV 失败:', e);
    }

    // 返回最新的配置
    return successResponse({
      enabled: body.enabled,
      provider: body.provider,
      strictness: body.strictness,
      ...aiConfig
    }, '配置保存成功');
  } catch (e) {
    console.error('保存 AI 配置失败:', e);
    return errorResponse('保存失败');
  }
});

// 测试 AI 配置
router.post('/ai-config/test', async (request, env) => {
  const body = await parseBody(request);

  try {
    const result = await testAIConfig(body);
    return successResponse(result, result.success ? '测试成功' : '测试失败');
  } catch (e) {
    console.error('测试 AI 配置失败:', e);
    return errorResponse('测试失败: ' + e.message);
  }
});

// 系统设置
router.get('/settings', async (request, env) => {
  try {
    const settings = await getAllSettings(env.DB);
    return successResponse(settings);
  } catch (e) {
    console.error('获取系统设置失败:', e);
    return errorResponse('获取设置失败');
  }
});

router.put('/settings', async (request, env) => {
  const body = await parseBody(request);

  try {
    for (const [key, value] of Object.entries(body)) {
      await setSetting(env.DB, key, value);
    }

    // 清除 KV 缓存
    try {
      await env.KV.delete('config:settings');
    } catch (e) {}

    return successResponse(null, '设置保存成功');
  } catch (e) {
    console.error('保存系统设置失败:', e);
    return errorResponse('保存失败');
  }
});

// GitHub 仓库配置
// 获取 GitHub 仓库列表
router.get('/storage/github/repos', async (request, env) => {
  try {
    const repos = await getSetting(env.DB, 'github_repos');
    const strategy = await getSetting(env.DB, 'github_repo_strategy') || 'round_robin';
    
    return successResponse({
      repos: repos || [],
      strategy
    });
  } catch (e) {
    console.error('获取 GitHub 仓库配置失败:', e);
    return errorResponse('获取配置失败');
  }
});

// 保存 GitHub 仓库列表
router.put('/storage/github/repos', async (request, env) => {
  const body = await parseBody(request);
  const { repos, strategy } = body;
  
  try {
    // 验证仓库列表
    if (!Array.isArray(repos)) {
      return errorResponse('仓库列表格式错误');
    }
    
    // 为每个仓库生成 ID（如果没有的话）
    const processedRepos = repos.map((repo, index) => ({
      ...repo,
      id: repo.id || `repo_${Date.now()}_${index}`,
      enabled: repo.enabled !== false
    }));
    
    // 保存到数据库
    await setSetting(env.DB, 'github_repos', processedRepos);
    
    // 保存策略
    if (strategy) {
      await setSetting(env.DB, 'github_repo_strategy', strategy);
    }
    
    // 清除 KV 缓存
    try {
      await env.KV.delete('config:storage');
    } catch (e) {}
    
    return successResponse({
      repos: processedRepos,
      strategy: strategy || 'round_robin'
    }, '保存成功');
  } catch (e) {
    console.error('保存 GitHub 仓库配置失败:', e);
    return errorResponse('保存失败: ' + e.message);
  }
});

// 测试单个 GitHub 仓库配置
router.post('/storage/github/test', async (request, env) => {
  const body = await parseBody(request);

  try {
    const result = await testGitHubConfig(body);
    return successResponse(result, result.success ? '测试成功' : '测试失败');
  } catch (e) {
    console.error('测试 GitHub 配置失败:', e);
    return errorResponse('测试失败: ' + e.message);
  }
});

// 统计数据
router.get('/stats', async (request, env) => {
  try {
    const stats = await getStats(env.DB);
    return successResponse(stats);
  } catch (e) {
    console.error('获取统计数据失败:', e);
    return errorResponse('获取统计数据失败');
  }
});

// 管理员账户管理

// 获取当前管理员信息
router.get('/profile', async (request, env) => {
  try {
    const admin = await getAdminById(env.DB, request.admin.id);
    if (!admin) {
      return errorResponse('管理员不存在', 404);
    }
    return successResponse({
      id: admin.id,
      username: admin.username,
      role: admin.role,
      lastLoginAt: admin.last_login_at,
      createdAt: admin.created_at
    });
  } catch (e) {
    console.error('获取管理员信息失败:', e);
    return errorResponse('获取信息失败');
  }
});

// 修改管理员密码
router.put('/profile/password', async (request, env) => {
  try {
    const body = await parseBody(request);
    const { oldPassword, newPassword } = body;

    if (!oldPassword || !newPassword) {
      return errorResponse('旧密码和新密码不能为空');
    }

    if (newPassword.length < 6) {
      return errorResponse('新密码长度不能少于6位');
    }

    // 验证旧密码
    const admin = await getAdminById(env.DB, request.admin.id);
    if (!admin) {
      return errorResponse('管理员不存在', 404);
    }

    const oldPasswordHash = await hashPassword(oldPassword);
    if (oldPasswordHash !== admin.password_hash) {
      return errorResponse('旧密码错误');
    }

    // 更新密码
    const newPasswordHash = await hashPassword(newPassword);
    const success = await updateAdminPassword(env.DB, request.admin.id, newPasswordHash);

    if (success) {
      return successResponse(null, '密码修改成功');
    } else {
      return errorResponse('密码修改失败');
    }
  } catch (e) {
    console.error('修改密码失败:', e);
    return errorResponse('修改失败: ' + e.message);
  }
});

// 修改管理员用户名
router.put('/profile/username', async (request, env) => {
  try {
    const body = await parseBody(request);
    const { newUsername, password } = body;

    if (!newUsername || !password) {
      return errorResponse('新用户名和密码不能为空');
    }

    if (newUsername.length < 3) {
      return errorResponse('用户名长度不能少于3位');
    }

    // 验证密码
    const admin = await getAdminById(env.DB, request.admin.id);
    if (!admin) {
      return errorResponse('管理员不存在', 404);
    }

    const passwordHash = await hashPassword(password);
    if (passwordHash !== admin.password_hash) {
      return errorResponse('密码错误');
    }

    // 更新用户名
    const result = await updateAdminUsername(env.DB, request.admin.id, newUsername.trim());

    if (result.success) {
      return successResponse({ username: newUsername }, '用户名修改成功');
    } else {
      return errorResponse(result.message || '用户名修改失败');
    }
  } catch (e) {
    console.error('修改用户名失败:', e);
    return errorResponse('修改失败: ' + e.message);
  }
});

export default router;
