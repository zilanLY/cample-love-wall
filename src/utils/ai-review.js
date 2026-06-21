// AI 审核模块 - 支持 OpenAI 格式和讯飞星火
// 审核结果定义
// {
//   passed: boolean,        // 是否通过
//   reason: string,         // 原因
//   details: object,        // 详细信息
//   provider: string        // 提供方
// }

// 构建审核提示词
function buildPrompt(content, strictness = 'medium', dimensions = {}) {
  const strictnessDesc = {
    loose: '宽松标准，只拦截明显违规内容',
    medium: '中等标准，常规内容审核',
    strict: '严格标准，宁可误杀不可放过'
  };
  
  const dimensionList = [];
  if (dimensions.politics !== false) dimensionList.push('政治敏感');
  if (dimensions.porn !== false) dimensionList.push('色情低俗');
  if (dimensions.violence !== false) dimensionList.push('暴力违法');
  if (dimensions.ad !== false) dimensionList.push('广告引流');
  if (dimensions.abuse !== false) dimensionList.push('辱骂攻击');
  
  return `你是一个内容审核助手，请审核以下内容是否违规。
审核标准：${strictnessDesc[strictness] || strictnessDesc.medium}
审核维度：${dimensionList.join('、')}
待审核内容：
"""
${content}
"""
请严格按照以下 JSON 格式返回结果（不要返回其他内容，不要添加任何解释或 markdown 格式）：
{
  "passed": true/false,
  "reason": "简短说明原因，如通过则返回'内容正常'",
  "category": "违规类别，如政治敏感/色情低俗等，通过则返回'正常'",
  "confidence": 0-1之间的置信度
}`;
}

/**
 * 规范化 baseUrl，确保以 /v1 结尾且没有多余的斜杠
 * @param {string} baseUrl 
 * @returns {string}
 */
function normalizeBaseUrl(baseUrl) {
  if (!baseUrl) return 'https://api.openai.com/v1';
  
  // 移除末尾的斜杠
  let normalized = baseUrl.replace(/\/+$/, '');
  
  // 检查是否已经包含 /v1
  if (!normalized.endsWith('/v1')) {
    normalized += '/v1';
  }
  
  return normalized;
}

/**
 * 从错误响应中提取错误信息
 * @param {Response} response 
 * @returns {Promise<string>}
 */
async function extractErrorMessage(response) {
  try {
    const errorText = await response.text();
    try {
      const errorData = JSON.parse(errorText);
      // 尝试从不同格式中提取错误信息
      if (errorData.error) {
        if (typeof errorData.error === 'string') return errorData.error;
        if (errorData.error.message) return errorData.error.message;
        if (errorData.error.msg) return errorData.error.msg;
      }
      if (errorData.message) return errorData.message;
      if (errorData.msg) return errorData.msg;
      if (errorData.errmsg) return errorData.errmsg;
      return errorText;
    } catch {
      return errorText;
    }
  } catch {
    return `HTTP ${response.status}`;
  }
}

// OpenAI 格式审核
export async function reviewWithOpenAI(content, config) {
  const { 
    apiKey, 
    baseUrl: rawBaseUrl = 'https://api.openai.com/v1', 
    model = 'gpt-3.5-turbo', 
    strictness, 
    dimensions,
    maxRetries = 1,
    timeout = 30000
  } = config;
  
  const baseUrl = normalizeBaseUrl(rawBaseUrl);
  
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`AI 审核第 ${attempt + 1} 次重试...`);
        // 简单的退避等待
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
      
      const prompt = buildPrompt(content, strictness, dimensions);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: '你是一个专业的内容审核员，严格按照要求返回纯 JSON 格式结果，不要添加任何其他内容。' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.1,
            max_tokens: 500,
            stream: false
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorMessage = await extractErrorMessage(response);
          const error = new Error(`AI API 错误 (${response.status}): ${errorMessage}`);
          error.statusCode = response.status;
          error.errorMessage = errorMessage;
          
          // 只有 5xx 错误才重试
          if (response.status >= 500 && attempt < maxRetries) {
            lastError = error;
            continue;
          }
          
          throw error;
        }
        
        const data = await response.json();
        const resultText = data.choices?.[0]?.message?.content || '{}';
        
        // 提取 JSON
        let result;
        try {
          // 尝试直接解析
          result = JSON.parse(resultText);
        } catch {
          // 尝试从文本中提取 JSON
          const jsonMatch = resultText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              result = JSON.parse(jsonMatch[0]);
            } catch (e) {
              throw new Error('无法解析 AI 返回的 JSON 结果');
            }
          } else {
            throw new Error('AI 返回结果中未找到 JSON 格式数据');
          }
        }
        
        return {
          passed: result.passed !== false,
          reason: result.reason || (result.passed ? '内容正常' : '内容违规'),
          category: result.category || '未知',
          confidence: result.confidence || 0.8,
          provider: 'openai',
          model,
          raw: result
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      console.error(`OpenAI 审核失败 (第 ${attempt + 1} 次):`, error.message);
      lastError = error;
      
      // 如果是网络错误或超时，可以重试
      if ((error.name === 'AbortError' || error.message.includes('fetch') || error.message.includes('network')) && attempt < maxRetries) {
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
}

// 讯飞星火审核（使用 WebSocket 或 HTTP API）
// 这里使用讯飞星火的 HTTP 调用方式（如果支持），或者模拟兼容格式
export async function reviewWithXunfei(content, config) {
  const { 
    appId, 
    apiKey, 
    apiSecret, 
    model = 'generalv3.5', 
    strictness, 
    dimensions,
    maxRetries = 1
  } = config;
  
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`讯飞审核第 ${attempt + 1} 次重试...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
      
      const prompt = buildPrompt(content, strictness, dimensions);
      
      // 讯飞星火的鉴权和调用方式
      // 这里使用兼容 OpenAI 格式的调用（讯飞星火也支持 OpenAI 兼容接口）
      const baseUrl = 'https://spark-api-open.xf-yun.com/v1';
      
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: '你是一个专业的内容审核员，严格按照要求返回纯 JSON 格式结果。' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1,
          max_tokens: 500
        })
      });
      
      if (!response.ok) {
        const errorMessage = await extractErrorMessage(response);
        const error = new Error(`讯飞 API 错误 (${response.status}): ${errorMessage}`);
        error.statusCode = response.status;
        
        if (response.status >= 500 && attempt < maxRetries) {
          lastError = error;
          continue;
        }
        
        throw error;
      }
      
      const data = await response.json();
      const resultText = data.choices?.[0]?.message?.content || '{}';
      
      let result;
      try {
        result = JSON.parse(resultText);
      } catch {
        const jsonMatch = resultText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('无法解析 AI 返回结果');
        }
      }
      
      return {
        passed: result.passed !== false,
        reason: result.reason || (result.passed ? '内容正常' : '内容违规'),
        category: result.category || '未知',
        confidence: result.confidence || 0.8,
        provider: 'xunfei',
        raw: result
      };
    } catch (error) {
      console.error(`讯飞审核失败 (第 ${attempt + 1} 次):`, error.message);
      lastError = error;
      
      if ((error.name === 'AbortError' || error.message.includes('fetch')) && attempt < maxRetries) {
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
}

// 统一审核入口
export async function aiReview(content, aiConfig) {
  const { 
    enabled, 
    provider = 'openai', 
    strictness = 'medium', 
    reviewDimensions = {}, 
    openai, 
    xunfei,
    autoReject = false
  } = aiConfig;
  
  if (!enabled) {
    return {
      passed: true,
      reason: 'AI 审核未启用',
      skipped: true,
      provider: 'none'
    };
  }
  
  // 空内容直接通过
  if (!content || !content.trim()) {
    return {
      passed: true,
      reason: '内容为空',
      provider: 'none'
    };
  }
  
  try {
    if (provider === 'openai') {
      if (!openai?.apiKey) {
        throw new Error('OpenAI API Key 未配置');
      }
      return await reviewWithOpenAI(content, {
        ...openai,
        strictness,
        dimensions: reviewDimensions
      });
    } else if (provider === 'xunfei') {
      if (!xunfei?.apiKey) {
        throw new Error('讯飞星火 API Key 未配置');
      }
      return await reviewWithXunfei(content, {
        ...xunfei,
        strictness,
        dimensions: reviewDimensions
      });
    } else {
      throw new Error(`不支持的 AI 提供方: ${provider}`);
    }
  } catch (error) {
    console.error('AI 审核异常:', error);
    
    // AI 审核失败时，根据配置决定是拒绝还是待人工审核
    if (autoReject) {
      return {
        passed: false,
        reason: `AI 审核异常，自动拒绝: ${error.message}`,
        error: true,
        autoRejected: true,
        provider
      };
    }
    
    // 返回待人工审核状态
    return {
      passed: null, // null 表示不确定，需要人工审核
      reason: `AI 审核异常: ${error.message}`,
      error: true,
      needManualReview: true,
      provider
    };
  }
}

// 测试 AI 配置
export async function testAIConfig(config) {
  const testContent = '今天天气真好，适合出去玩。';
  
  try {
    const result = await aiReview(testContent, {
      ...config,
      enabled: true
    });
    
    return {
      success: !result.error,
      result,
      message: result.error ? result.reason : 'AI 接口测试成功'
    };
  } catch (error) {
    return {
      success: false,
      message: error.message || '测试失败'
    };
  }
}
