-- 校园心愿墙系统 - 数据库初始化脚本

-- 内容表
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    author TEXT,
    post_type TEXT NOT NULL DEFAULT 'wish', -- wish/confession/daily/rant
    category_id INTEGER,
    status TEXT NOT NULL DEFAULT 'pending', -- pending/approved/rejected/ai_reviewing
    likes INTEGER NOT NULL DEFAULT 0,
    ip_hash TEXT,
    review_reason TEXT,
    reviewed_by TEXT,
    reviewed_at DATETIME,
    ai_result TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_status_created ON posts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_type_status ON posts(post_type, status);
CREATE INDEX IF NOT EXISTS idx_category_status ON posts(category_id, status);
CREATE INDEX IF NOT EXISTS idx_created_at ON posts(created_at DESC);

-- 分类表
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT,
    post_type TEXT NOT NULL DEFAULT 'wish',
    sort INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 分类唯一索引，防止重复分类
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name_type ON categories(name, post_type);
CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(post_type);
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active);

-- 敏感词表
CREATE TABLE IF NOT EXISTS sensitive_words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL UNIQUE,
    category TEXT DEFAULT 'other', -- politics/porn/violence/ad/other
    level INTEGER DEFAULT 2, -- 1-提示 2-拒绝 3-自动封禁
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sensitive_word ON sensitive_words(word);

-- 管理员表
CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'admin', -- super_admin/admin
    last_login_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 系统设置表
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME
);

-- 点赞记录表（防重复）
CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    ip_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(post_id, ip_hash)
);

CREATE INDEX IF NOT EXISTS idx_likes_post ON likes(post_id);

-- 评论表
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    author TEXT,
    ip_hash TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- pending/approved/rejected
    likes INTEGER NOT NULL DEFAULT 0,
    parent_id INTEGER DEFAULT 0, -- 父评论ID，0表示顶级评论
    review_reason TEXT,
    reviewed_by TEXT,
    reviewed_at DATETIME,
    ai_result TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);

-- 评论点赞记录表
CREATE TABLE IF NOT EXISTS comment_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comment_id INTEGER NOT NULL,
    ip_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(comment_id, ip_hash)
);
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON comment_likes(comment_id);

-- 图片表
CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER,
    default_url TEXT,
    telegram_url TEXT,
    primary_url TEXT NOT NULL,
    filename TEXT,
    file_size INTEGER,
    width INTEGER,
    height INTEGER,
    upload_ip TEXT,
    status TEXT DEFAULT 'active', -- active/deleted
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_images_post ON images(post_id);
CREATE INDEX IF NOT EXISTS idx_images_status ON images(status);
CREATE INDEX IF NOT EXISTS idx_images_created ON images(created_at DESC);

-- 初始化默认分类
INSERT OR IGNORE INTO categories (name, icon, post_type, sort) VALUES
('学业', '📚', 'wish', 1),
('爱情', '💕', 'wish', 2),
('友情', '🤝', 'wish', 3),
('健康', '💪', 'wish', 4),
('财富', '💰', 'wish', 5),
('其他', '✨', 'wish', 99),
('暗恋', '💘', 'confession', 1),
('告白', '💌', 'confession', 2),
('感谢', '🙏', 'confession', 3),
('校园生活', '🏫', 'daily', 1),
('美食分享', '🍜', 'daily', 2),
('风景随拍', '📷', 'daily', 3),
('心情日记', '📝', 'daily', 4),
('学业吐槽', '📖', 'rant', 1),
('食堂吐槽', '🍱', 'rant', 2),
('宿舍吐槽', '🏠', 'rant', 3),
('其他吐槽', '😤', 'rant', 99);

-- 初始化默认敏感词（示例）
INSERT OR IGNORE INTO sensitive_words (word, category, level) VALUES
('违禁词1', 'other', 2),
('违禁词2', 'other', 2);

-- 初始化系统设置
INSERT OR IGNORE INTO settings (key, value) VALUES
('site_name', '"校园心愿墙"'),
('site_description', '"写下你的心愿，让梦想开花"'),
('max_content_length', '500'),
('post_rate_limit', '5'),
('like_rate_limit', '20'),
('need_manual_review', 'true'),
('ai_enabled', 'false'),
('ai_provider', '"openai"'),
('ai_strictness', '"medium"'),
('manual_review_enabled', 'true'),
('comment_enabled', 'true'),
('comment_need_review', 'true'),
('comment_max_length', '200'),
('comment_rate_limit', '10'),
('image_storage_provider', '"scdn"'),
('github_token', '""'),
('github_owner', '""'),
('github_repo', '""'),
('github_branch', '"main"'),
('github_path', '"images"'),
('github_use_jsdelivr', 'true');
