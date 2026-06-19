// 数据库操作封装

// 获取系统设置
export async function getSetting(db, key) {
  const result = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  if (!result) return null;
  try {
    return JSON.parse(result.value);
  } catch {
    return result.value;
  }
}

// 设置系统配置
export async function setSetting(db, key, value) {
  const jsonValue = JSON.stringify(value);
  await db.prepare(`
    INSERT INTO settings (key, value, updated_at) 
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
  `).bind(key, jsonValue, jsonValue).run();
  return true;
}

// 获取所有设置
export async function getAllSettings(db) {
  const result = await db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of result.results) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }
  return settings;
}

// 内容相关操作

// 获取内容列表
export async function getPosts(db, options = {}) {
  const {
    status = 'approved',
    postType = null,
    categoryId = null,
    search = null,
    page = 1,
    pageSize = 20,
    sortBy = 'created_at',
    sortOrder = 'DESC'
  } = options;

  const offset = (page - 1) * pageSize;
  const conditions = [];
  const params = [];

  if (status) {
    conditions.push('p.status = ?');
    params.push(status);
  }

  if (postType) {
    conditions.push('p.post_type = ?');
    params.push(postType);
  }

  if (categoryId) {
    conditions.push('p.category_id = ?');
    params.push(categoryId);
  }

  if (search) {
    conditions.push('p.content LIKE ?');
    params.push(`%${search}%`);
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const countResult = await db.prepare(`
    SELECT COUNT(*) as total FROM posts p ${whereClause}
  `).bind(...params).first();

  const postsResult = await db.prepare(`
    SELECT p.*, c.name as category_name, c.icon as category_icon
    FROM posts p
    LEFT JOIN categories c ON p.category_id = c.id
    ${whereClause}
    ORDER BY p.${sortBy} ${sortOrder}
    LIMIT ? OFFSET ?
  `).bind(...params, pageSize, offset).all();

  const posts = postsResult.results;

  // 批量获取所有帖子的第一张图片
  if (posts.length > 0) {
    const postIds = posts.map(p => p.id);
    const placeholders = postIds.map(() => '?').join(',');
    
    // 使用子查询获取每个帖子的第一张图片
    const imagesResult = await db.prepare(`
      SELECT i.*
      FROM images i
      INNER JOIN (
        SELECT post_id, MIN(id) as min_id
        FROM images
        WHERE post_id IN (${placeholders}) AND status = 'active'
        GROUP BY post_id
      ) sub ON i.id = sub.min_id
    `).bind(...postIds).all();

    // 创建图片映射
    const imageMap = {};
    imagesResult.results.forEach(img => {
      imageMap[img.post_id] = img;
    });

    // 把图片信息添加到帖子中
    posts.forEach(post => {
      if (imageMap[post.id]) {
        post.primary_image = imageMap[post.id];
      }
    });
  }

  return {
    list: posts,
    total: countResult.total,
    page,
    pageSize,
    totalPages: Math.ceil(countResult.total / pageSize)
  };
}

// 获取单条内容
export async function getPostById(db, id) {
  const post = await db.prepare(`
    SELECT p.*, c.name as category_name, c.icon as category_icon
    FROM posts p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.id = ?
  `).bind(id).first();

  if (!post) return null;

  // 获取帖子的图片
  const images = await db.prepare(`
    SELECT * FROM images 
    WHERE post_id = ? AND status = 'active'
    ORDER BY id ASC
  `).bind(id).all();

  return {
    ...post,
    images: images.results
  };
}

// 创建内容
export async function createPost(db, postData) {
  const { content, author, postType, categoryId, ipHash, status = 'pending', imageId } = postData;
  
  const result = await db.prepare(`
    INSERT INTO posts (content, author, post_type, category_id, status, ip_hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(content, author || null, postType, categoryId || null, status, ipHash || null).run();

  const postId = result.meta.last_row_id;

  // 如果有图片ID，关联图片到帖子
  if (imageId) {
    await db.prepare(`
      UPDATE images 
      SET post_id = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ? AND status = 'active'
    `).bind(postId, imageId).run();
  }

  return postId;
}

// 更新内容状态
export async function updatePostStatus(db, id, status, reviewReason = null, reviewedBy = 'admin') {
  await db.prepare(`
    UPDATE posts 
    SET status = ?, review_reason = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(status, reviewReason, reviewedBy, id).run();
  return true;
}

// 更新内容
export async function updatePost(db, id, data) {
  const fields = [];
  const params = [];

  if (data.content !== undefined) {
    fields.push('content = ?');
    params.push(data.content);
  }
  if (data.author !== undefined) {
    fields.push('author = ?');
    params.push(data.author);
  }
  if (data.postType !== undefined) {
    fields.push('post_type = ?');
    params.push(data.postType);
  }
  if (data.categoryId !== undefined) {
    fields.push('category_id = ?');
    params.push(data.categoryId);
  }
  if (data.status !== undefined) {
    fields.push('status = ?');
    params.push(data.status);
  }
  if (data.aiResult !== undefined) {
    fields.push('ai_result = ?');
    params.push(data.aiResult);
  }

  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  await db.prepare(`
    UPDATE posts SET ${fields.join(', ')} WHERE id = ?
  `).bind(...params).run();

  return true;
}

// 删除内容
export async function deletePost(db, id) {
  await db.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
  await db.prepare('DELETE FROM likes WHERE post_id = ?').bind(id).run();
  return true;
}

// 点赞
export async function likePost(db, postId, ipHash) {
  try {
    await db.prepare('INSERT INTO likes (post_id, ip_hash) VALUES (?, ?)').bind(postId, ipHash).run();
    await db.prepare('UPDATE posts SET likes = likes + 1 WHERE id = ?').bind(postId).run();
    return { success: true, liked: true };
  } catch (e) {
    // 唯一约束冲突，说明已经点过赞
    return { success: false, liked: false, message: '已经点过赞了' };
  }
}

// 检查是否已点赞
export async function hasLiked(db, postId, ipHash) {
  const result = await db.prepare('SELECT id FROM likes WHERE post_id = ? AND ip_hash = ?').bind(postId, ipHash).first();
  return !!result;
}

// 评论相关操作
// 获取评论列表
export async function getComments(db, options = {}) {
  const {
    postId = null,
    status = 'approved',
    page = 1,
    pageSize = 20,
    parentId = 0
  } = options;

  const where = [];
  const params = [];

  if (postId) {
    where.push('post_id = ?');
    params.push(postId);
  }
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (parentId !== null) {
    where.push('parent_id = ?');
    params.push(parentId);
  }

  const whereSql = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
  const offset = (page - 1) * pageSize;

  const countResult = await db.prepare(`SELECT COUNT(*) as total FROM comments ${whereSql}`).bind(...params).first();
  
  const result = await db.prepare(`
    SELECT c.*
    FROM comments c
    ${whereSql}
    ORDER BY c.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...params, pageSize, offset).all();

  return {
    list: result.results,
    total: countResult.total,
    page,
    pageSize
  };
}

// 获取单条评论
export async function getCommentById(db, id) {
  return await db.prepare('SELECT * FROM comments WHERE id = ?').bind(id).first();
}

// 创建评论
export async function createComment(db, commentData) {
  const { postId, content, author, ipHash, status = 'pending', parentId = 0 } = commentData;
  const result = await db.prepare(`
    INSERT INTO comments (post_id, content, author, ip_hash, status, parent_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(postId, content, author, ipHash, status, parentId).run();
  return result.meta.last_row_id;
}

// 更新评论状态
export async function updateCommentStatus(db, id, status, reason = null, reviewedBy = null) {
  return await db.prepare(`
    UPDATE comments SET status = ?, review_reason = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(status, reason, reviewedBy, id).run();
}

// 删除评论
export async function deleteComment(db, id) {
  return await db.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
}

// 评论点赞
export async function likeComment(db, commentId, ipHash) {
  try {
    await db.prepare('INSERT INTO comment_likes (comment_id, ip_hash) VALUES (?, ?)').bind(commentId, ipHash).run();
    await db.prepare('UPDATE comments SET likes = likes + 1 WHERE id = ?').bind(commentId).run();
    return { success: true };
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return { success: false, message: '已经点赞过了' };
    }
    throw e;
  }
}

// 是否已点赞评论
export async function hasLikedComment(db, commentId, ipHash) {
  const result = await db.prepare('SELECT id FROM comment_likes WHERE comment_id = ? AND ip_hash = ?').bind(commentId, ipHash).first();
  return !!result;
}

// 获取评论数量
export async function getCommentCount(db, postId, status = 'approved') {
  const result = await db.prepare('SELECT COUNT(*) as count FROM comments WHERE post_id = ? AND status = ?').bind(postId, status).first();
  return result.count;
}

// 分类相关操作

// 获取所有分类
export async function getCategories(db, postType = null, activeOnly = true) {
  let sql = 'SELECT * FROM categories';
  const conditions = [];
  const params = [];

  if (postType) {
    conditions.push('post_type = ?');
    params.push(postType);
  }

  if (activeOnly) {
    conditions.push('is_active = 1');
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY sort ASC, id ASC';

  const result = await db.prepare(sql).bind(...params).all();
  return result.results;
}

// 获取单个分类
export async function getCategoryById(db, id) {
  return await db.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first();
}

// 创建分类
export async function createCategory(db, data) {
  const result = await db.prepare(`
    INSERT INTO categories (name, icon, post_type, sort, is_active)
    VALUES (?, ?, ?, ?, ?)
  `).bind(data.name, data.icon || null, data.postType, data.sort || 0, data.isActive !== false ? 1 : 0).run();
  return result.meta.last_row_id;
}

// 更新分类
export async function updateCategory(db, id, data) {
  const fields = [];
  const params = [];

  if (data.name !== undefined) {
    fields.push('name = ?');
    params.push(data.name);
  }
  if (data.icon !== undefined) {
    fields.push('icon = ?');
    params.push(data.icon);
  }
  if (data.postType !== undefined) {
    fields.push('post_type = ?');
    params.push(data.postType);
  }
  if (data.sort !== undefined) {
    fields.push('sort = ?');
    params.push(data.sort);
  }
  if (data.isActive !== undefined) {
    fields.push('is_active = ?');
    params.push(data.isActive ? 1 : 0);
  }

  params.push(id);

  await db.prepare(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run();
  return true;
}

// 删除分类
export async function deleteCategory(db, id) {
  await db.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
  return true;
}

// 敏感词相关操作

// 获取所有敏感词
export async function getSensitiveWords(db, category = null) {
  let sql = 'SELECT * FROM sensitive_words';
  const params = [];

  if (category) {
    sql += ' WHERE category = ?';
    params.push(category);
  }

  sql += ' ORDER BY id DESC';

  const result = await db.prepare(sql).bind(...params).all();
  return result.results;
}

// 检查敏感词（简单匹配）
export async function checkSensitiveWords(db, content) {
  const words = await getSensitiveWords(db);
  const matched = [];

  for (const word of words) {
    if (content.includes(word.word)) {
      matched.push(word);
    }
  }

  return {
    hasSensitive: matched.length > 0,
    matchedWords: matched,
    highestLevel: matched.length > 0 ? Math.max(...matched.map(w => w.level)) : 0
  };
}

// 添加敏感词
export async function addSensitiveWord(db, word, category = 'other', level = 2) {
  try {
    const result = await db.prepare(`
      INSERT INTO sensitive_words (word, category, level) VALUES (?, ?, ?)
    `).bind(word, category, level).run();
    return { success: true, id: result.meta.last_row_id };
  } catch (e) {
    return { success: false, message: '敏感词已存在' };
  }
}

// 批量添加敏感词
export async function batchAddSensitiveWords(db, words) {
  let successCount = 0;
  let failCount = 0;

  const stmt = db.prepare('INSERT OR IGNORE INTO sensitive_words (word, category, level) VALUES (?, ?, ?)');
  
  for (const item of words) {
    const result = await stmt.bind(item.word, item.category || 'other', item.level || 2).run();
    if (result.meta.changes > 0) {
      successCount++;
    } else {
      failCount++;
    }
  }

  return { successCount, failCount };
}

// 更新敏感词
export async function updateSensitiveWord(db, id, data) {
  const fields = [];
  const params = [];

  if (data.word !== undefined) {
    fields.push('word = ?');
    params.push(data.word);
  }
  if (data.category !== undefined) {
    fields.push('category = ?');
    params.push(data.category);
  }
  if (data.level !== undefined) {
    fields.push('level = ?');
    params.push(data.level);
  }

  params.push(id);

  await db.prepare(`UPDATE sensitive_words SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run();
  return true;
}

// 删除敏感词
export async function deleteSensitiveWord(db, id) {
  await db.prepare('DELETE FROM sensitive_words WHERE id = ?').bind(id).run();
  return true;
}

// 管理员相关操作

// 根据用户名获取管理员
export async function getAdminByUsername(db, username) {
  return await db.prepare('SELECT * FROM admins WHERE username = ?').bind(username).first();
}

// 创建管理员
export async function createAdmin(db, username, passwordHash, role = 'admin') {
  const result = await db.prepare(`
    INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)
  `).bind(username, passwordHash, role).run();
  return result.meta.last_row_id;
}

// 更新最后登录时间
export async function updateAdminLastLogin(db, id) {
  await db.prepare('UPDATE admins SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id).run();
  return true;
}

// 检查是否有管理员
export async function hasAdmin(db) {
  const result = await db.prepare('SELECT COUNT(*) as count FROM admins').first();
  return result.count > 0;
}

// 统计相关

// 获取统计数据
export async function getStats(db) {
  const totalPosts = await db.prepare("SELECT COUNT(*) as count FROM posts WHERE status = 'approved'").first();
  const pendingPosts = await db.prepare("SELECT COUNT(*) as count FROM posts WHERE status = 'pending'").first();
  const todayPosts = await db.prepare("SELECT COUNT(*) as count FROM posts WHERE DATE(created_at) = DATE('now')").first();
  const totalLikes = await db.prepare('SELECT SUM(likes) as total FROM posts').first();
  const totalCategories = await db.prepare('SELECT COUNT(*) as count FROM categories WHERE is_active = 1').first();

  // 按类型统计
  const typeStats = await db.prepare(`
    SELECT post_type, COUNT(*) as count 
    FROM posts 
    WHERE status = 'approved' 
    GROUP BY post_type
  `).all();

  return {
    totalPosts: totalPosts.count,
    pendingPosts: pendingPosts.count,
    todayPosts: todayPosts.count,
    totalLikes: totalLikes.total || 0,
    totalCategories: totalCategories.count,
    typeStats: typeStats.results
  };
}

// 图片相关操作
// 创建图片记录
export async function createImage(db, imageData) {
  const {
    postId = null,
    defaultUrl = null,
    telegramUrl = null,
    primaryUrl,
    filename = null,
    fileSize = null,
    width = null,
    height = null,
    uploadIp = null,
    status = 'active'
  } = imageData;
  
  const result = await db.prepare(`
    INSERT INTO images (post_id, default_url, telegram_url, primary_url, filename, file_size, width, height, upload_ip, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    postId,
    defaultUrl,
    telegramUrl,
    primaryUrl,
    filename,
    fileSize,
    width,
    height,
    uploadIp,
    status
  ).run();
  
  return result.meta.last_row_id;
}

// 获取帖子的所有图片
export async function getImagesByPostId(db, postId) {
  const result = await db.prepare(`
    SELECT * FROM images 
    WHERE post_id = ? AND status = 'active'
    ORDER BY id ASC
  `).bind(postId).all();
  
  return result.results;
}

// 获取所有图片（用于预加载页面）
export async function getAllImages(db, options = {}) {
  const {
    page = 1,
    pageSize = 100,
    status = 'active'
  } = options;
  
  const offset = (page - 1) * pageSize;
  
  const countResult = await db.prepare(`
    SELECT COUNT(*) as total FROM images WHERE status = ?
  `).bind(status).first();
  
  const result = await db.prepare(`
    SELECT * FROM images 
    WHERE status = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).bind(status, pageSize, offset).all();
  
  return {
    list: result.results,
    total: countResult.total,
    page,
    pageSize,
    totalPages: Math.ceil(countResult.total / pageSize)
  };
}

// 根据 ID 获取图片
export async function getImageById(db, id) {
  return await db.prepare('SELECT * FROM images WHERE id = ?').bind(id).first();
}

// 更新图片信息
export async function updateImage(db, id, data) {
  const fields = [];
  const params = [];
  
  if (data.postId !== undefined) {
    fields.push('post_id = ?');
    params.push(data.postId);
  }
  if (data.defaultUrl !== undefined) {
    fields.push('default_url = ?');
    params.push(data.defaultUrl);
  }
  if (data.telegramUrl !== undefined) {
    fields.push('telegram_url = ?');
    params.push(data.telegramUrl);
  }
  if (data.primaryUrl !== undefined) {
    fields.push('primary_url = ?');
    params.push(data.primaryUrl);
  }
  if (data.status !== undefined) {
    fields.push('status = ?');
    params.push(data.status);
  }
  
  if (fields.length === 0) return false;
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);
  
  await db.prepare(`
    UPDATE images SET ${fields.join(', ')} WHERE id = ?
  `).bind(...params).run();
  
  return true;
}

// 删除图片（软删除）
export async function deleteImage(db, id) {
  await db.prepare(`
    UPDATE images SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(id).run();
  
  return true;
}
