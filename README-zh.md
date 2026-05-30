# BashUpload-R2

[English](README.md) | 中文

基于 Cloudflare Workers 和 Cloudflare R2 对象存储构建，适合命令行和浏览器的简单文件上传服务。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/DullJZ/bashupload-r2)

直接使用：[bashupload.app](https://bashupload.app)

感谢 [bashupload.com](https://bashupload.com) 及其作者 [@mrcrypster](https://github.com/mrcrypster) 提供的灵感。

## 快速开始

```sh
# 上传文件并返回普通链接
curl bashupload.app -T file.txt

# 上传文本内容（保存为 .txt 文件）
curl bashupload.app -d "你的长文本内容"

# 上传并返回短链接
curl bashupload.app/short -T file.txt

# 上传并设置有效期（86400秒=24小时，允许多次下载）
curl -H "X-Expiration-Seconds: 86400" bashupload.app -T file.txt

# 上传永不过期的文件（需要密码）
curl -H "X-No-Expire: true" -H "Authorization: yourpassword" bashupload.app -T file.txt

# 删除文件（需要密码）
curl -X DELETE -H "Authorization: yourpassword" https://bashupload.app/file.txt
```

> **说明：** 上传后的文件会保留**原始文件名**（空格替换为 `-`），不再重命名为随机字符串。命令行上传和所有下载都是**公开**的，而通过浏览器上传需要密码。详见 [访问权限模型](#访问权限模型)。

使用命令行别名快速设置

```sh
alias bashupload='curl bashupload.app -T'
alias bashuploadtext='curl bashupload.app -d'
alias bashuploadshort='curl bashupload.app/short -T'
alias bashuploadexpire='curl -H "X-Expiration-Seconds: 3600" bashupload.app -T'
bashupload file.txt            # 返回普通链接
bashuploadtext "你的文本内容"   # 上传文本内容
bashuploadshort file.txt       # 返回短链接
bashuploadexpire file.txt      # 返回1小时有效期链接
```

要使别名永久生效，请将其添加到你的 shell 配置文件中。

```sh
echo "alias bashupload='curl bashupload.app -T'" >> ~/.bashrc
echo "alias bashuploadtext='curl bashupload.app -d'" >> ~/.bashrc
echo "alias bashuploadshort='curl bashupload.app/short -T'" >> ~/.bashrc
echo "alias bashuploadexpire='curl -H \"X-Expiration-Seconds: 3600\" bashupload.app -T'" >> ~/.bashrc
source ~/.bashrc
```

## 浏览器上传

- 拖拽文件或点击选择文件
- 设置文件有效期，或勾选**永不过期**（永久保存）
- 直接在页面上**删除**已上传的文件
- 直接下载链接
- 无需注册

> 通过浏览器上传需要服务器密码。命令行（`curl`）上传保持公开，下载对所有人公开。详见 [访问权限模型](#访问权限模型)。

## 特性

- 简单的命令行接口
- 快速文本分享
- 浏览器拖拽上传
- 无需注册
- 直接下载链接
- **保留原始文件名**（空格替换为 `-`），不再使用随机文件名
- 默认一次性下载，可选限时下载或**永不过期（永久保存）**模式
- 通过密码保护的接口**按需删除文件**
- 命令行上传公开、浏览器上传需密码、下载对所有人公开
- 可选的**仅下载模式**，彻底关闭网页上传界面
- 支持最大 5GB 的文件（自部署可调整）
- 支持自部署设置密码

**隐私注意：** 默认情况下每个文件**只能下载一次**，下载后立即删除。您也可以设置**有效期**（到期前可多次下载），或将文件标记为**永不过期**（保留到您手动删除为止）。永久文件不会被自动清理任务删除。一次性文件请下载后及时本地保存，因为链接在首次下载后即失效。


## 自部署到Cloudflare

点击上方的 "Deploy to Cloudflare" 按钮，修改配置。

其中，`MAX_UPLOAD_SIZE`单位为字节（默认为 5GB），`MAX_AGE`单位为秒（默认为 1小时），可以根据需要进行调整。

`MAX_AGE_FOR_MULTIDOWNLOAD` 是允许多次下载的最大有效期时间，单位为秒（默认值是86400，即24小时）。用户可以设置不超过此限制的自定义有效期。

`SHORT_URL_SERVICE` 是短链接服务的 API 端点（默认为 `https://suosuo.de/short`），如果需要，可以将其更改为您自己的短链接服务。仅支持 [MyUrls](https://github.com/CareyWang/MyUrls)。

`PASSWORD` 环境变量用于启用访问控制。设置后，**浏览器上传**、**删除文件**和创建**永不过期**文件都需要该密码；命令行上传和所有下载仍然公开。如果留空，上传完全公开，且删除接口被禁用。详见 [访问权限模型](#访问权限模型)。

`DISABLE_WEB`（本项目默认 `"true"`）：为 `"true"` 时彻底关闭浏览器界面，站点变为**仅下载**——浏览器上传被拒绝、上传界面不再提供，而命令行上传和下载仍可正常使用。设为 `"false"` 可重新开启网页上传。

`DISABLE_NO_EXPIRE`（默认 `"false"`）：设为 `"true"` 可关闭“永不过期”（永久保存）上传选项。

编译部署最后一步可能会出现部署失败的错误，原因是默认使用了配置文件中的 bashupload.app 作为域名。事实上项目已经部署成功，在Worker项目设置中进行域名绑定即可。

## 访问权限模型

| 操作 | 命令行（curl/wget） | 浏览器 |
|---|---|---|
| 上传 | 公开（无需密码） | 需要密码 |
| 下载链接 | 公开 | 公开 |
| 删除文件 | 需要密码 | 需要密码（🗑️ 按钮） |
| 永不过期上传 | 需要密码 | 需要密码 |

- 密码通过 `PASSWORD` 环境变量设置。若为空，则上传完全公开且删除被禁用。
- 浏览器与命令行通过 `User-Agent` 请求头区分。
- 设置 `DISABLE_WEB=true` 可让服务变为仅下载（完全禁止浏览器上传）。

## 高级功能

### 自定义有效期

通过使用 `X-Expiration-Seconds` 头部，您可以为上传的文件设置自定义有效期。这允许文件在过期前被多次下载，过期后文件将自动删除。

示例：
```sh
# 设置1小时有效期（文件可多次下载1小时）
curl -H "X-Expiration-Seconds: 3600" bashupload.app -T file.txt

# 设置24小时有效期
curl -H "X-Expiration-Seconds: 86400" bashupload.app -T file.txt

# 设置7天有效期
curl -H "X-Expiration-Seconds: 604800" bashupload.app -T file.txt
```

**重要说明：**
- 不设置有效期时，文件只能下载一次（一次性下载）
- 设置有效期后，文件在有效期内可多次下载
- 最大允许的有效期由 `MAX_AGE_FOR_MULTIDOWNLOAD` 控制（默认：24小时）
- 浏览器上传也通过UI支持设置有效期

### 永不过期（永久文件）

将文件标记为永久后，它不会被自动删除，可以无限次下载，并且会被定时清理任务跳过。由于会持续占用存储空间，此功能**需要密码**。

```sh
# 永不过期（需要密码）
curl -H "X-No-Expire: true" -H "Authorization: yourpassword" bashupload.app -T file.txt

# X-Expiration-Seconds: 0 效果相同
curl -H "X-Expiration-Seconds: 0" -H "Authorization: yourpassword" bashupload.app -T file.txt
```

在浏览器中，勾选**“永不过期（永久保存）”**复选框即可。可通过设置 `DISABLE_NO_EXPIRE=true` 关闭该选项。

### 删除文件

永久文件（以及其他任意文件）都可以通过受密码保护的 `DELETE` 接口删除。删除始终需要密码——命令行和浏览器都是如此——并且在未配置 `PASSWORD` 时被禁用。

```sh
# 删除文件
curl -X DELETE -H "Authorization: yourpassword" https://bashupload.app/file.txt
```

返回码：`200` 删除成功，`404` 文件不存在，`401` 密码错误或缺失，`403` 删除被禁用（未配置密码）。

在浏览器中，您上传的每个文件都会显示一个**删除**按钮（使用表单中的密码；仅对本站域名的文件可用，短链接不可用）。

### 下载次数统计

可以统计文件被下载了多少次。仅统计允许多次下载的文件（**限时**和**永不过期**文件）；一次性文件在首次下载后即删除，因此不统计。

该功能基于 Cloudflare KV 命名空间，在 `wrangler.toml` 中以 `DOWNLOAD_COUNTS` 绑定：

```toml
[[kv_namespaces]]
binding = "DOWNLOAD_COUNTS"
id = "your-kv-namespace-id"
```

**自己部署一份？** 配置中自带的 `id` 指向维护者的命名空间，请用以下任一方式换成你自己的：

- **自动创建（推荐）：** 删除 `id` 这一行，只保留 `binding = "DOWNLOAD_COUNTS"`。较新的 Wrangler 会在首次 `wrangler deploy` 时自动创建命名空间，并把 `id` 写回你的配置。参见 Cloudflare 的[自动资源创建](https://developers.cloudflare.com/changelog/post/2025-10-24-automatic-resource-provisioning/)。
- **手动：** 运行 `wrangler kv namespace create DOWNLOAD_COUNTS`，把输出的 `id` 填入上面的代码块。

> 与 R2（通过你自己取的名字 `bucket_name` 绑定）不同，KV 是通过系统生成的 `id` 绑定的，因此命名空间必须先存在或由系统自动创建。如果缺少该绑定，下载统计会自动关闭，其余功能照常工作。

启用后：
- 每次下载的响应都会带上 `X-Download-Count` 响应头。
- 随时查询计数：`GET /api/stats/<filename>` → `{ "file": "...", "downloads": 12, "tracking": true }`
- 当网页界面开启时，浏览器上传列表会显示实时的 **下载次数: N** 指示和刷新按钮。
- 文件被删除或过期时，计数会被自动清理。

> 计数采用“先读后写”，在大量并发下载时可能略有少计。如需精确计数，请改用 Durable Object 或 Workers Analytics Engine。

### 快速文本分享

您可以快速分享长文本片段、代码、日志或任何文本内容，无需先创建文件。只需使用 `curl -d` 直接上传文本，它将自动保存为 `.txt` 文件。

示例：
```sh
# 分享快速文本片段
curl bashupload.app -d "这是我遇到的错误信息..."

# 分享代码片段
curl bashupload.app -d "$(cat script.sh)"

# 分享命令输出
curl bashupload.app -d "$(ls -la)"

# 设置有效期以便多次查看
curl -H "X-Expiration-Seconds: 3600" bashupload.app -d "今天的会议记录..."

# 结合短链接方便分享
curl bashupload.app/short -d "你的文本内容"
```

### 密码保护

在 Cloudflare Worker 设置中设置 `PASSWORD` 环境变量以启用访问控制。设置 `PASSWORD` 后：

- **命令行上传保持公开**——无需密码。
- **下载对所有人公开**（浏览器和命令行）。
- **浏览器上传需要密码**，在上传表单中输入。
- **删除文件**和**永不过期上传**需要密码。

```sh
# 命令行上传——无需密码
curl bashupload.app -T file.txt

# 下载——无需密码
curl https://bashupload.app/yourfile.txt -o downloaded.txt

# 永久上传 / 删除——需要密码
curl -H "X-No-Expire: true" -H "Authorization: yourpassword" bashupload.app -T file.txt
curl -X DELETE -H "Authorization: yourpassword" https://bashupload.app/yourfile.txt
```

如果 `PASSWORD` 留空，则上传完全公开，且删除接口被禁用。

### 仅下载模式（关闭网页界面）

设置 `DISABLE_WEB=true` 可彻底关闭浏览器界面。此时用浏览器访问站点会看到简短的“仅下载”提示，上传界面不再提供，任何浏览器上传请求都会返回 `403`。下载和命令行上传仍正常工作。

```toml
# wrangler.toml
[vars]
DISABLE_WEB = "true"
```
