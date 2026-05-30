import mime from 'mime';

export default {
  // 处理定时任务
  async scheduled(event, env, ctx) {
    if (isCleanupDisabled(env?.NO_CLEANUP)) {
      console.log('[Scheduled Task] Skipped cleanup because NO_CLEANUP is enabled');
      return;
    }

    // 获取 MAX_AGE 配置（秒），默认 3600 秒（1小时）
    const maxAge = parseInt(env.MAX_AGE || '3600', 10);
    const now = Date.now();

    console.log(`[Scheduled Task] Start cleaning expired files, MAX_AGE: ${maxAge}s`);

    try {
      let deletedCount = 0;
      let checkedCount = 0;
      let cursor = undefined;

      // 分页处理文件列表，避免一次性加载过多文件
      do {
        // 每次最多处理 1000 个文件
        const listed = await env.R2_BUCKET.list({
          limit: 1000,
          cursor: cursor,
        });

        // 并行处理文件检查和删除，提高效率
        const deletePromises = [];

        for (const object of listed.objects) {
          checkedCount++;

          // 创建异步删除任务
          const deleteTask = (async () => {
            try {
              // 获取文件的元数据
              const fileInfo = await env.R2_BUCKET.head(object.key);

              if (fileInfo) {
                // 永久文件（no-expire）：永不自动删除，跳过
                if (fileInfo.customMetadata?.noExpire === 'true') {
                  return false;
                }

                // 检查文件是否有自定义的过期时间
                const expirationTime = fileInfo.customMetadata?.expirationTime;
                if (expirationTime) {
                  const now = new Date().getTime();
                  const expireAt = new Date(expirationTime).getTime();
                  if (now > expireAt) {
                    await env.R2_BUCKET.delete(object.key);
                    console.log(`[Scheduled Task] Deleted expired file: ${object.key}, expiration: ${expirationTime}`);
                    return true;
                  }
                  // 文件未过期，跳过后续的 MAX_AGE 检查
                  return false;
                }

                // 获取文件上传时间
                // 优先使用自定义元数据中的 uploadTime，如果没有则使用 uploaded 时间
                const uploadTime = fileInfo.customMetadata?.uploadTime
                  ? new Date(fileInfo.customMetadata.uploadTime).getTime()
                  : fileInfo.uploaded.getTime();

                // 计算文件年龄（毫秒）
                const age = now - uploadTime;
                const ageInSeconds = Math.floor(age / 1000);

                // 如果文件年龄超过 MAX_AGE，删除文件
                if (ageInSeconds > maxAge) {
                  await env.R2_BUCKET.delete(object.key);
                  console.log(`[Scheduled Task] Deleted expired file: ${object.key}, age: ${ageInSeconds}s`);
                  return true; // 返回 true 表示删除了文件
                }
              }
            } catch (error) {
              console.error(`[Scheduled Task] Error processing file ${object.key}:`, error);
            }
            return false;
          })();

          deletePromises.push(deleteTask);
        }

        // 等待所有删除任务完成
        const results = await Promise.all(deletePromises);
        deletedCount += results.filter(deleted => deleted).length;

        // 更新游标以获取下一页
        cursor = listed.truncated ? listed.cursor : undefined;

      } while (cursor); // 如果还有更多文件，继续处理

      console.log(`[Scheduled Task] Cleanup complete: checked ${checkedCount} files, deleted ${deletedCount} expired files`);
    } catch (error) {
      console.error('[Scheduled Task] Error during cleanup:', error);
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 是否通过 DISABLE_WEB 彻底关闭网页端（只保留下载 + 命令行上传）
    const webDisabled = isFlagTrue(env.DISABLE_WEB);

    // 处理 GET 请求
    if (request.method === 'GET') {
      // 获取服务端配置信息的API端点
      if (pathname === '/api/config') {
        const config = {
          maxAgeForMultiDownload: parseInt(env.MAX_AGE_FOR_MULTIDOWNLOAD || '86400', 10),
          maxUploadSize: parseInt(env.MAX_UPLOAD_SIZE || '5368709120', 10),
          maxAge: parseInt(env.MAX_AGE || '3600', 10),
          needPassword: Boolean(env.PASSWORD),
          allowNoExpire: !isFlagTrue(env.DISABLE_NO_EXPIRE),
          webDisabled: isFlagTrue(env.DISABLE_WEB)
        };
        
        return new Response(JSON.stringify(config), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Allow-Headers': 'Content-Type'
          }
        });
      }

      // 根路径处理
      if (pathname === '/' || pathname === '') {
        // 检查 User-Agent 以确定是浏览器还是 curl
        const userAgent = request.headers.get('user-agent') || '';
        if (userAgent.toLowerCase().includes('curl')) {
          // 如果是 curl，返回简单的文本说明
          return new Response(`bashupload.app - 一次性文件分享服务 | One-time File Sharing Service

使用方法 Usage:
  curl bashupload.app -T file.txt                    # 上传文件 / Upload file
  curl bashupload.app -d "text content"              # 上传文本 / Upload text (saved as .txt)
  curl bashupload.app/short -T file.txt              # 返回短链接 / Short URL
  curl -H "X-Expiration-Seconds: 3600" bashupload.app -T file.txt   # 设置有效期 / Set expiration time
  curl -H "X-No-Expire: true" -H "Authorization: PASSWORD" bashupload.app -T file.txt   # 永不过期（需密码）/ Never expire (needs password)
  curl -X DELETE -H "Authorization: PASSWORD" bashupload.app/file.txt   # 删除文件（需密码）/ Delete a file (needs password)

特性 Features:
  • 文件只能下载一次 / Files can only be downloaded once (默认 default)
  • 可以设置有效期 / Can set expiration time for multiple downloads
  • 下载后自动删除 / Auto-delete after download or expiration
  • 保护隐私安全 / Privacy protection

有效期示例 Expiration Examples:
  • 3600 秒 (1小时) / 3600s (1 hour)
  • 7200 秒 (2小时) / 7200s (2 hours)
  • 86400 秒 (24小时) / 86400s (24 hours)
`, {
            status: 200,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
        // 如果是浏览器：网页端被禁用时显示“仅下载”提示，否则重定向到 index.html
        if (webDisabled) {
          return webDisabledResponse();
        }
        return Response.redirect(url.origin + '/index.html', 302);
      }

      // 处理静态资源路径映射
      let fileName = pathname.substring(1); // 移除开头的斜杠

      if (fileName === 'index.html' || fileName === 'style.css' || fileName === 'upload.js') {
        // 网页端被禁用时不提供任何上传界面资源
        if (webDisabled) {
          return fileName === 'index.html'
            ? webDisabledResponse()
            : new Response('Web interface is disabled\n', { status: 404 });
        }
        try {
          const assetResponse = await env.ASSETS.fetch(`https://assets.local/${fileName}`);
          if (assetResponse.status === 200) {
            return assetResponse;
          }
        } catch (e) {
          console.error(`Error fetching asset ${fileName}:`, e);
        }
      }

      // 从 R2 获取文件
      // 下载对所有人开放（包括公网/CLI），这样分享出来的链接任何人都能下载。
      // 密码只用于限制网页端（浏览器）上传，不再限制下载。
      if (fileName) {
        try {
          const object = await env.R2_BUCKET.get(fileName);
          if (!object) {
            return new Response('File not found\n', { status: 404 });
          }

          const headers = new Headers();
          object.writeHttpMetadata(headers);
          headers.set('etag', object.httpEtag);

          // 使用 mime.js 根据文件名获取 Content-Type
          const contentType = mime.getType(fileName) || 'application/octet-stream';
          headers.set('Content-Type', contentType);

          // 检查文件元数据，确定下载模式
          const fileInfo = await env.R2_BUCKET.head(fileName);
          const isNoExpire = fileInfo?.customMetadata?.noExpire === 'true';
          const isOneTime = !isNoExpire && (!fileInfo?.customMetadata?.oneTime || fileInfo.customMetadata.oneTime === 'true');
          const expirationTime = fileInfo?.customMetadata?.expirationTime;

          // 如果有过期时间，检查是否已经过期
          if (expirationTime) {
            const now = new Date().getTime();
            const expireAt = new Date(expirationTime).getTime();
            if (now > expireAt) {
              // 文件已过期，删除并返回404
              await env.R2_BUCKET.delete(fileName);
              console.log(`[Expired Download] Deleted expired file: ${fileName}`);
              return new Response('File not found (expired)\n', { status: 404 });
            }
          }

          // 先获取文件内容
          const body = object.body;

          // 只有在一次性下载模式下才删除文件
          if (isOneTime) {
            // 一次性下载：下载后立即删除文件
            // 使用 ctx.waitUntil 确保删除操作在响应发送后执行
            ctx.waitUntil(
              (async () => {
                try {
                  // 小延迟，确保文件先被发送
                  await new Promise(resolve => setTimeout(resolve, 100));
                  await env.R2_BUCKET.delete(fileName);
                  console.log(`[One-Time Download] Deleted file: ${fileName}`);
                } catch (deleteError) {
                  console.error(`[One-Time Download] Failed to delete file ${fileName}:`, deleteError);
                }
              })()
            );

            // 添加响应头标识这是一次性下载
            headers.set('X-One-Time-Download', 'true');
          } else if (isNoExpire) {
            // 永久文件：可无限次下载，不删除
            headers.set('X-No-Expire-Download', 'true');
          } else {
            // 有效期模式
            headers.set('X-Expiration-Download', 'true');
            if (expirationTime) {
              headers.set('X-Expiration-Time', expirationTime);
            }
          }

          headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
          headers.set('Pragma', 'no-cache');
          headers.set('Expires', '0');

          return new Response(body, { headers });
        } catch (e) {
          return new Response(`Error: ${e.message}\n`, { status: 500 });
        }
      }
    }

    // 处理 DELETE 请求（删除文件）——属于管理操作，无论网页还是命令行都必须提供密码。
    if (request.method === 'DELETE') {
      // 未配置 PASSWORD 时禁止删除，避免任何人都能删文件
      if (!env.PASSWORD) {
        return new Response('Delete is disabled: no PASSWORD is configured on the server.\n', {
          status: 403,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
      if (extractPassword(request) !== env.PASSWORD) {
        return new Response('Unauthorized: deleting a file requires the password.\n', {
          status: 401,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }

      // 解析要删除的文件名（与下载一致，取路径最后一段）
      let key = '';
      try {
        key = decodeURIComponent(pathname.replace(/^\/+/, ''));
      } catch (e) {
        key = pathname.replace(/^\/+/, '');
      }
      key = key.split('/').pop().split('\\').pop();

      if (!key) {
        return new Response('Bad request: missing file name.\n', {
          status: 400,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }

      const existing = await env.R2_BUCKET.head(key);
      if (!existing) {
        return new Response(`File not found: ${key}\n`, {
          status: 404,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }

      await env.R2_BUCKET.delete(key);
      console.log(`[Delete] key=${key}`);
      return new Response(`Deleted: ${key}\n`, {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    // 处理 PUT 和 POST 请求（curl -T 使用 PUT，curl -d 使用 POST）
    if (request.method !== 'PUT' && request.method !== 'POST') {
      return new Response('Method Not Allowed\n', { status: 405 });
    }

    // 网页端被禁用（DISABLE_WEB）时，浏览器上传一律拒绝；命令行（CLI）不受影响。
    if (webDisabled && isWebClient(request)) {
      return new Response('Web uploads are disabled. Please use the command line (curl) to upload.\n', {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    // 检查密码保护
    // 只有网页端（浏览器）上传才需要密码；命令行（curl / wget 等 CLI）对公众开放，无需密码。
    if (env.PASSWORD && isWebClient(request)) {
      if (extractPassword(request) !== env.PASSWORD) {
        return new Response('Unauthorized\n', {
          status: 401
        });
      }
    }

    try {
      // 检查是否是 /short 路径，如果是则强制使用短链接
      const forceShortUrl = pathname === '/short' || pathname.startsWith('/short/');
      // 获取最大上传大小（字节），默认 5GB
      const maxUploadSize = parseInt(env.MAX_UPLOAD_SIZE || '5368709120', 10);
      // 检查 Content-Length
      const contentLengthHeader = request.headers.get('content-length');
      let parsedContentLength = null;
      if (contentLengthHeader) {
        const contentLength = parseInt(contentLengthHeader, 10);
        if (!isNaN(contentLength) && contentLength > maxUploadSize) {
          return new Response(`Upload failed: file too large. Max size is ${formatBytes(maxUploadSize)}.\n`, {
            status: 413,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
        if (!isNaN(contentLength) && contentLength >= 0) {
          parsedContentLength = contentLength;
        }
      }

      // 获取有效期参数（秒）
      const expirationSecondsRaw = request.headers.get('X-Expiration-Seconds');
      const parsedExpiration = expirationSecondsRaw !== null ? parseInt(expirationSecondsRaw, 10) : NaN;

      // 永久保存（不过期）：显式 X-No-Expire 头，或 X-Expiration-Seconds: 0。
      // 可通过环境变量 DISABLE_NO_EXPIRE 关闭该功能。
      const noExpireRequested = isFlagTrue(request.headers.get('X-No-Expire')) || parsedExpiration === 0;
      const noExpire = noExpireRequested && !isFlagTrue(env.DISABLE_NO_EXPIRE);

      // 永久文件需要密码授权，防止公网 CLI 滥用存储（仅在服务端配置了 PASSWORD 时生效）。
      if (noExpire && env.PASSWORD && extractPassword(request) !== env.PASSWORD) {
        return new Response('Unauthorized: "no expire" uploads require the password.\n', {
          status: 401,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }

      // 限时多次下载
      const hasExpiration = !noExpire && !isNaN(parsedExpiration) && parsedExpiration > 0;
      const expirationTime = hasExpiration ? parsedExpiration : null;

      // 一次性下载（默认）：既不是永久，也没有设置有效期
      const isOneTime = !noExpire && !hasExpiration;

      // 确定文件名：保留用户上传的原始文件名（仅把空格替换成 -），不再生成随机名。
      let contentType = request.headers.get('content-type') || 'application/octet-stream';

      // 从 URL 路径中解析原始文件名。
      // curl -T file.txt  -> PUT /file.txt
      // 浏览器上传        -> PUT /<file.name>
      // 如果走的是 /short，要先把 /short 前缀去掉。
      let pathForName = pathname;
      if (forceShortUrl) {
        pathForName = pathname.slice('/short'.length);
      }

      // 去掉开头的斜杠并做 URL 解码（空格通常会被编码成 %20）
      let originalName = '';
      try {
        originalName = decodeURIComponent(pathForName.replace(/^\/+/, ''));
      } catch (e) {
        originalName = pathForName.replace(/^\/+/, '');
      }
      // 只取最后一段，防止路径穿越（如 a/b/c.txt -> c.txt）
      originalName = originalName.split('/').pop().split('\\').pop().trim();

      let fileName;
      if (request.method === 'POST') {
        // POST（curl -d 文本 / 网页文本分享）没有原始文件名，保存为 .txt
        contentType = 'text/plain; charset=utf-8';
        fileName = originalName ? sanitizeFileName(originalName) : `${generateRandomId()}.txt`;
      } else if (originalName) {
        // PUT：使用原始文件名（仅把空格替换成 -，其余保持不变）
        fileName = sanitizeFileName(originalName);
        // 根据文件扩展名推断 Content-Type，保证下载时类型正确
        contentType = mime.getType(fileName) || contentType;
      } else {
        // 没有提供文件名时（极少数情况）回退到随机文件名
        const ext = mime.getExtension(contentType);
        fileName = `${generateRandomId()}${ext ? `.${ext}` : ''}`;
      }

      // 使用流式上传 - 直接传递 request.body 到 R2
      // 这样不会将整个文件加载到 Worker 内存中
      const customMetadata = {
        oneTime: isOneTime ? 'true' : 'false',
        uploadTime: new Date().toISOString()
      };

      // 永久文件：标记 noExpire，定时清理任务会跳过它
      if (noExpire) {
        customMetadata.noExpire = 'true';
      }

      // 如果有有效期，添加到元数据中
      if (hasExpiration) {
        customMetadata.expirationTime = new Date(Date.now() + expirationTime * 1000).toISOString();
        customMetadata.expirationSeconds = expirationTime.toString();
      }

      const uploadResult = await env.R2_BUCKET.put(fileName, request.body, {
        httpMetadata: {
          contentType: contentType,
        },
        customMetadata: customMetadata,
      });

      const uploadedSize =
        uploadResult && typeof uploadResult.size === 'number'
          ? uploadResult.size
          : typeof parsedContentLength === 'number'
            ? parsedContentLength
            : null;
      const sizeLabel =
        typeof uploadedSize === 'number' ? formatBytes(uploadedSize) : 'unknown';
      const xForwardedFor = request.headers.get('X-Forwarded-For');
      const forwardedIP = xForwardedFor ? xForwardedFor.split(',')[0].trim() : '';
      const clientIP =
        request.headers.get('CF-Connecting-IP') ||
        request.headers.get('X-Real-IP') ||
        forwardedIP ||
        'unknown';

      console.log(`[Upload] key=${fileName} size=${sizeLabel} ip=${clientIP} oneTime=${isOneTime}`);

      // 返回上传成功的 URL
      const url = new URL(request.url);
      let fileUrl = `${url.protocol}//${url.hostname}/${fileName}`;

      // 如果使用 /short 路径，尝试生成短链接
      if (forceShortUrl) {
        try {
          // 将长链接转换为 base64
          const base64Url = btoa(fileUrl);

          // 调用短链接 API
          const shortUrlResponse = await fetch(env.SHORT_URL_SERVICE || 'https://suosuo.de/short', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `longUrl=${encodeURIComponent(base64Url)}`,
          });

          if (shortUrlResponse.ok) {
            const shortUrlData = await shortUrlResponse.json();
            if (shortUrlData.Code === 1 && shortUrlData.ShortUrl) {
              fileUrl = shortUrlData.ShortUrl;
              console.log(`Generated short URL: ${fileUrl} for original: ${url.protocol}//${url.hostname}/${fileName}`);
            } else if (forceShortUrl) {
              console.warn(`Short URL API returned unexpected response: ${JSON.stringify(shortUrlData)}`);
            }
          }
        } catch (error) {
          console.error('Failed to generate short URL:', error);
          // 如果是 /short 路径但短链接生成失败，提示用户
          if (forceShortUrl) {
            console.warn('Short URL was requested via /short but generation failed, falling back to original URL');
          }
          // 继续使用原始链接
        }
      }

      // 根据上传模式返回不同的文本提示
      let responseText;
      if (noExpire) {
        responseText = `\n\n${fileUrl}\n\n♾️  注意：此文件不会过期，可以无限次下载。\n   Note: This file never expires and can be downloaded unlimited times.\n`;
      } else if (hasExpiration) {
        const expirationHours = Math.floor(expirationTime / 3600);
        const expirationMinutes = Math.floor((expirationTime % 3600) / 60);
        const expirationString = expirationHours > 0 
          ? `${expirationHours}小时${expirationMinutes > 0 ? expirationMinutes + '分钟' : ''}`
          : `${expirationMinutes}分钟`;
        responseText = `\n\n${fileUrl}\n\n🕐 注意：此文件将在 ${expirationString} 后过期，期间可以多次下载。\n   Note: This file will expire after ${expirationString} and can be downloaded multiple times.\n`;
      } else {
        responseText = `\n\n${fileUrl}\n\n⚠️  注意：此文件只能下载一次，下载后将自动删除！\n   Note: This file can only be downloaded once!\n`;
      }

      return new Response(responseText, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-One-Time-Upload': isOneTime ? 'true' : 'false',
        },
      });
    } catch (e) {
      console.error('Upload error:', e);
      return new Response(`Upload failed: ${e.message}\n`, {
        status: 500,
        headers: {
          'Content-Type': 'text/plain',
        },
      });
    }
  },
};

function isCleanupDisabled(value) {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'string') {
    const normalized = value.toLowerCase().trim();
    return normalized === '1' || normalized === 'true';
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  return value === true;
}

// 判断请求是否来自网页浏览器（用于区分“网页端”和“命令行 CLI”）。
// 所有主流浏览器的 User-Agent 都包含 "mozilla"；curl / wget / 脚本等不包含。
// 因此：浏览器 -> 需要密码；CLI -> 公开。
function isWebClient(request) {
  const ua = (request.headers.get('user-agent') || '').toLowerCase();
  if (!ua) return false; // 没有 User-Agent 视为 CLI / 脚本
  return ua.includes('mozilla');
}

// 网页端被禁用时返回的“仅下载”提示页面（DISABLE_WEB=true）。
function webDisabledResponse() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BashUpload - Download only</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 640px; margin: 80px auto; padding: 0 20px; color: #333; }
  h1 { font-size: 24px; }
  code { background: #f4f4f4; padding: 2px 6px; border-radius: 4px; }
  .box { background: #fff3cd; border: 1px solid #ff6b35; border-radius: 8px; padding: 16px; }
</style>
</head>
<body>
  <h1>BashUpload</h1>
  <div class="box">
    <p>🔒 The web upload interface is disabled. This service is <strong>download-only</strong> from the browser.</p>
    <p>网页上传已关闭，浏览器端仅支持下载。</p>
  </div>
  <p>Uploads are available via the command line:</p>
  <pre><code>curl &lt;your-host&gt; -T file.txt</code></pre>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// 判断 header / env 的值是否表示“真”（true / 1 / yes / on）。
function isFlagTrue(value) {
  if (value === undefined || value === null) return false;
  const normalized = String(value).toLowerCase().trim();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

// 从请求中解析密码，兼容 "Basic base64(user:pass)" 和直接密码两种格式。
function extractPassword(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return '';
  if (authHeader.startsWith('Basic ')) {
    try {
      const credentials = atob(authHeader.split(' ')[1]);
      const colonIndex = credentials.indexOf(':');
      // 用户名可以为空，只取冒号后的密码部分（兼容密码中包含冒号的情况）
      return colonIndex >= 0 ? credentials.slice(colonIndex + 1) : credentials;
    } catch (e) {
      console.error('Error parsing Basic auth:', e);
      return '';
    }
  }
  return authHeader;
}

// 清理文件名：仅把空白字符替换成 -，其余保持原样（不重命名）。
function sanitizeFileName(name) {
  // 再次取 basename，避免路径穿越
  const base = name.split('/').pop().split('\\').pop();
  // 把一个或多个连续空白替换成单个 -
  return base.replace(/\s+/g, '-');
}

// 生成随机 ID
function generateRandomId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 格式化字节数为可读字符串
function formatBytes(bytes) {
  if (bytes === 0) return '0B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + sizes[i];
}
