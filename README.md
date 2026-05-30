# BashUpload-R2

English | [中文](README-zh.md)

Simple file upload service based on Cloudflare Workers and Cloudflare R2 object storage for the command line and browser.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/DullJZ/bashupload-r2)

Directly Use: [bashupload.app](https://bashupload.app)

Thanks to [bashupload.com](https://bashupload.com) and its author [@mrcrypster](https://github.com/mrcrypster) for the inspiration.

## Quick Start

```sh
# Upload file with normal URL
curl bashupload.app -T file.txt

# Upload text content (saved as .txt file)
curl bashupload.app -d "Your long text content here"

# Upload with short URL
curl bashupload.app/short -T file.txt

# Upload with custom expiration time (86400 seconds = 24 hours, allows multiple downloads)
curl -H "X-Expiration-Seconds: 86400" bashupload.app -T file.txt

# Upload a permanent file that never expires (requires the password)
curl -H "X-No-Expire: true" -H "Authorization: yourpassword" bashupload.app -T file.txt

# Delete a file (requires the password)
curl -X DELETE -H "Authorization: yourpassword" https://bashupload.app/file.txt
```

> **Note:** The uploaded file keeps its **original name** (spaces are replaced with `-`); it is no longer renamed to a random string. Command-line uploads and all downloads are **public**, while uploading through the browser requires the password. See [Access Model](#access-model) for details.

Use `alias` in bash to set quick upload

```sh
alias bashupload='curl bashupload.app -T'
alias bashuploadtext='curl bashupload.app -d'
alias bashuploadshort='curl bashupload.app/short -T'
alias bashuploadexpire='curl -H "X-Expiration-Seconds: 3600" bashupload.app -T'
bashupload file.txt              # Returns normal URL
bashuploadtext "your text here"  # Upload text content
bashuploadshort file.txt         # Returns short URL
bashuploadexpire file.txt        # Returns URL with 1 hour expiration
```

To make the alias persistent, add it to your shell configuration file.

```sh
echo "alias bashupload='curl bashupload.app -T'" >> ~/.bashrc
echo "alias bashuploadtext='curl bashupload.app -d'" >> ~/.bashrc
echo "alias bashuploadshort='curl bashupload.app/short -T'" >> ~/.bashrc
echo "alias bashuploadexpire='curl -H \"X-Expiration-Seconds: 3600\" bashupload.app -T'" >> ~/.bashrc
source ~/.bashrc
```

## Browser Upload

- Drag & drop files or click to select files
- Set a custom expiration time, or mark a file as **Never expire** (permanent)
- **Delete** your uploaded files directly from the page
- Direct download links
- No registration required

> Uploading through the browser requires the server password. The command line (`curl`) stays public for uploads, and downloads are public for everyone. See [Access Model](#access-model).

## Features

- Simple command-line interface
- Quick text sharing
- Browser-based drag & drop upload
- No registration required
- Direct download links
- **Keeps your original filename** (spaces replaced with `-`) instead of a random name
- One-time download by default, with optional time-limited or **never-expire (permanent)** modes
- **Delete files on demand** with a password-protected endpoint
- Public command-line uploads, password-protected browser uploads, and public downloads
- Optional **download-only mode** to disable the web upload interface entirely
- Supports files up to 5GB in size (self-hosting can adjust this limit)
- Support password setting for self-hosting

**Privacy Notice:** By default each file can only be downloaded **once** and is deleted immediately afterward. You can instead set an **expiration time** (multiple downloads until it expires) or mark a file as **never expire** (kept until you delete it). Permanent files are skipped by the automatic cleanup. Make sure to save one-time files locally, as their link stops working after the first download.

## Self-Hosting to Cloudflare

Click the "Deploy to Cloudflare" button above to modify the configuration.

`MAX_UPLOAD_SIZE` is in bytes (default is 5GB), and `MAX_AGE` is in seconds (default is 1 hour). You can adjust these values as needed.

`MAX_AGE_FOR_MULTIDOWNLOAD` is the maximum expiration time allowed for multiple downloads in seconds (default is 86400, which is 24 hours). Users can set custom expiration times up to this limit.

`SHORT_URL_SERVICE` is the short URL service API endpoint (default is `https://suosuo.de/short`), you can change it to your own short URL service if needed. Only support [MyUrls](https://github.com/CareyWang/MyUrls).

`PASSWORD` environment variable enables the access controls. When set, it is required for **browser uploads**, for **deleting files**, and for creating **never-expire** files. Command-line uploads and all downloads remain public. If left blank, uploading is fully public and the delete endpoint is disabled. See [Access Model](#access-model).

`DISABLE_WEB` (this project ships with `"true"`): when `"true"`, the browser interface is off completely. The site is **download-only** — browser uploads are blocked and the upload UI is not served, while command-line uploads and downloads keep working. Set it to `"false"` to re-enable browser uploads.

`DISABLE_NO_EXPIRE` (default `"false"`): set to `"true"` to disable the never-expire (permanent) upload option.

The final step of deployment may show a deployment failure error because the default configuration uses `bashupload.app` as the domain. In fact, the project has already been deployed successfully. You just need to bind your own domain in the Worker project settings.

## Access Model

| Action | Command line (curl/wget) | Browser |
|---|---|---|
| Upload | Public (no password) | Requires the password |
| Download a link | Public | Public |
| Delete a file | Requires the password | Requires the password (🗑️ button) |
| Never-expire upload | Requires the password | Requires the password |

- The password is set via the `PASSWORD` environment variable. If it is empty, uploads are fully public and deleting is disabled.
- Browser vs. command line is detected from the `User-Agent` header.
- Set `DISABLE_WEB=true` to make the service download-only (no browser uploads at all).

## Advanced Features

### Custom Expiration Time

You can set a custom expiration time for uploaded files by using the `X-Expiration-Seconds` header. This allows the file to be downloaded multiple times until it expires, after which it will be automatically deleted.

Example:
```sh
# Set 1-hour expiration (file can be downloaded multiple times for 1 hour)
curl -H "X-Expiration-Seconds: 3600" bashupload.app -T file.txt

# Set 24-hour expiration
curl -H "X-Expiration-Seconds: 86400" bashupload.app -T file.txt

# Set 7-day expiration
curl -H "X-Expiration-Seconds: 604800" bashupload.app -T file.txt
```

**Important Notes:**
- Without expiration time, files can only be downloaded once (one-time download)
- With expiration time, files can be downloaded multiple times until expiration
- The maximum allowed expiration time is controlled by `MAX_AGE_FOR_MULTIDOWNLOAD` (default: 24 hours)
- Browser upload also supports setting expiration times through the UI

### Never Expire (Permanent Files)

Mark a file as permanent so it is never auto-deleted and can be downloaded an unlimited number of times. Permanent files are also skipped by the scheduled cleanup task. Because they consume storage indefinitely, this **requires the password**.

```sh
# Never expire (requires the password)
curl -H "X-No-Expire: true" -H "Authorization: yourpassword" bashupload.app -T file.txt

# X-Expiration-Seconds: 0 does the same thing
curl -H "X-Expiration-Seconds: 0" -H "Authorization: yourpassword" bashupload.app -T file.txt
```

In the browser, tick the **"Never expire (permanent)"** checkbox. This option can be turned off entirely by setting `DISABLE_NO_EXPIRE=true`.

### Deleting Files

Permanent (and any other) files can be removed with the password-protected `DELETE` endpoint. Deleting always requires the password — for both the command line and the browser — and is disabled when no `PASSWORD` is configured.

```sh
# Delete a file
curl -X DELETE -H "Authorization: yourpassword" https://bashupload.app/file.txt
```

Responses: `200` deleted, `404` file not found, `401` wrong/missing password, `403` delete disabled (no password configured).

In the browser, each file you upload shows a **Delete** button (it uses the password from the form; available only for files hosted on this domain, not short URLs).

### Download Counter (Optional)

You can track how many times a file has been downloaded. This is tracked only for files that allow multiple downloads (**timed** and **never-expire** files); one-time files are deleted after the first download, so they aren't counted.

It uses a Cloudflare KV namespace and is **off until you configure it**:

```bash
# 1) Create the namespace (in your own Cloudflare account)
wrangler kv namespace create DOWNLOAD_COUNTS
# 2) Paste the returned id into wrangler.toml and uncomment the [[kv_namespaces]] block
```

Once enabled:
- Every download response includes an `X-Download-Count` header.
- Query a count any time: `GET /api/stats/<filename>` → `{ "file": "...", "downloads": 12, "tracking": true }`
- The browser upload list shows a live **Downloads: N** indicator with a refresh button.
- Counters are cleaned up automatically when a file is deleted or expires.

> The counter uses read-then-write, so under heavy simultaneous downloads a count may be slightly under-reported. For exact counts use a Durable Object or Workers Analytics Engine instead.

### Quick Text Sharing

You can quickly share long text snippets, code, logs, or any text content without creating a file first. Simply use `curl -d` to upload text directly, and it will be saved as a `.txt` file.

Example:
```sh
# Share a quick text snippet
curl bashupload.app -d "Here's the error message I'm getting..."

# Share code snippet
curl bashupload.app -d "$(cat script.sh)"

# Share command output
curl bashupload.app -d "$(ls -la)"

# Share with expiration time for multiple views
curl -H "X-Expiration-Seconds: 3600" bashupload.app -d "Meeting notes for today..."

# Combine with short URL for easier sharing
curl bashupload.app/short -d "Your text content here"
```

### Password Protection

Set the `PASSWORD` environment variable in your Cloudflare Worker settings to enable the access controls. With `PASSWORD` set:

- **Command-line uploads stay public** — no password needed.
- **Downloads are public** for everyone (browser and command line).
- **Browser uploads require the password**, entered in the upload form.
- **Deleting files** and **never-expire uploads** require the password.

```sh
# Command-line upload — no password required
curl bashupload.app -T file.txt

# Download — no password required
curl https://bashupload.app/yourfile.txt -o downloaded.txt

# Permanent upload / delete — password required
curl -H "X-No-Expire: true" -H "Authorization: yourpassword" bashupload.app -T file.txt
curl -X DELETE -H "Authorization: yourpassword" https://bashupload.app/yourfile.txt
```

If `PASSWORD` is left blank, uploading is fully public and the delete endpoint is disabled.

### Download-Only Mode (Disable the Web Interface)

Set `DISABLE_WEB=true` to turn the browser interface off completely. Visiting the site in a browser shows a short "download-only" notice, the upload UI is no longer served, and any browser upload attempt is rejected with `403`. Downloads and command-line uploads continue to work normally.

```toml
# wrangler.toml
[vars]
DISABLE_WEB = "true"
```