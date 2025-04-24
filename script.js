/**
 * 在线解压缩工具核心脚本
 * 
 * 实现功能：
 * 1. 文件上传（支持拖拽和点击上传）
 * 2. 文件大小验证（限制100MB）
 * 3. 解压支持多种格式
 * 4. 解压进度显示
 * 5. 文件浏览和下载功能
 */

// 定义最大允许上传大小：100MB
const MAX_FILE_SIZE = 100 * 1024 * 1024; 

// DOM元素引用
const dropArea = document.getElementById('drop-area');
const fileInput = document.getElementById('file-input');
const uploadBtn = document.getElementById('upload-btn');
const uploadSection = document.getElementById('upload-section');
const processingSection = document.getElementById('processing-section');
const resultSection = document.getElementById('result-section');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const fileList = document.getElementById('file-list');
const fileName = document.getElementById('file-name');
const fileSize = document.getElementById('file-size');
const downloadAllBtn = document.getElementById('download-all-btn');
const errorPopup = document.getElementById('error-popup');
const errorMessage = document.getElementById('error-message');
const errorClose = document.getElementById('error-close');

// 存储解压后的文件
let extractedFiles = {};
let currentFile = null;

/**
 * 初始化事件监听器
 */
function initEventListeners() {
    // 上传按钮点击事件
    uploadBtn.addEventListener('click', () => {
        fileInput.click();
    });

    // 文件选择事件
    fileInput.addEventListener('change', handleFileSelect);

    // 拖放区域事件
    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropArea.classList.add('drag-over');
    });

    dropArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropArea.classList.remove('drag-over');
    });

    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropArea.classList.remove('drag-over');
        
        if (e.dataTransfer.files.length) {
            handleFiles(e.dataTransfer.files);
        }
    });

    // 点击拖放区域也触发文件选择
    dropArea.addEventListener('click', () => {
        fileInput.click();
    });

    // 下载全部按钮
    downloadAllBtn.addEventListener('click', downloadAllFiles);

    // 错误弹窗关闭按钮
    errorClose.addEventListener('click', () => {
        errorPopup.style.display = 'none';
    });
}

/**
 * 文件选择处理函数
 */
function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length) {
        handleFiles(files);
    }
}

/**
 * 处理上传的文件
 * @param {FileList} files - 用户选择的文件列表
 */
function handleFiles(files) {
    const file = files[0]; // 只处理第一个文件
    
    // 验证文件大小
    if (file.size > MAX_FILE_SIZE) {
        showError(`文件大小超过限制（${formatFileSize(MAX_FILE_SIZE)}）`);
        return;
    }
    
    // 验证文件类型
    const validExtensions = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'];
    const fileExt = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!validExtensions.includes(fileExt)) {
        showError('不支持的文件格式，请上传压缩文件');
        return;
    }
    
    // 保存当前文件并开始处理
    currentFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    
    // 显示处理界面
    uploadSection.style.display = 'none';
    processingSection.style.display = 'block';
    resultSection.style.display = 'none';
    
    // 重置进度条
    updateProgress(0);
    
    // 开始解压文件
    extractArchive(file);
}

/**
 * 解压文件
 * @param {File} file - 要解压的文件
 */
async function extractArchive(file) {
    try {
        extractedFiles = {}; // 重置已提取文件
        
        // 根据文件类型选择解压方法
        const fileExt = file.name.split('.').pop().toLowerCase();
        
        if (fileExt === 'zip') {
            await extractZip(file);
        } else {
            await extractUsingUncompress(file);
        }
        
        // 完成解压，显示文件列表
        displayFiles();
        
        // 显示结果界面
        processingSection.style.display = 'none';
        resultSection.style.display = 'block';
        
    } catch (error) {
        console.error('解压失败:', error);
        showError('解压失败: ' + error.message);
        resetInterface();
    }
}

/**
 * 使用JSZip解压ZIP文件
 * @param {File} file - 要解压的ZIP文件
 */
async function extractZip(file) {
    try {
        const zip = new JSZip();
        
        // 读取zip文件
        const zipData = await zip.loadAsync(file);
        const totalFiles = Object.keys(zipData.files).length;
        let processedFiles = 0;
        
        // 遍历所有文件
        for (const [path, zipEntry] of Object.entries(zipData.files)) {
            // 跳过目录
            if (zipEntry.dir) {
                processedFiles++;
                updateProgress(Math.floor((processedFiles / totalFiles) * 100));
                continue;
            }
            
            // 获取文件内容
            const content = await zipEntry.async('blob');
            
            // 存储提取的文件
            extractedFiles[path] = {
                name: path.split('/').pop(),
                path: path,
                size: content.size,
                type: content.type || getMimeType(path),
                content: content
            };
            
            // 更新进度
            processedFiles++;
            updateProgress(Math.floor((processedFiles / totalFiles) * 100));
        }
    } catch (error) {
        console.error('ZIP解压失败:', error);
        throw new Error('ZIP解压失败');
    }
}

/**
 * 使用uncompress.js解压其他格式文件
 * @param {File} file - 要解压的文件
 */
async function extractUsingUncompress(file) {
    try {
        // 创建文件读取器
        const reader = new FileReader();
        
        // 将文件读取为ArrayBuffer
        const arrayBuffer = await new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
        
        // 使用uncompress.js解压文件
        const result = await Uncompress.deflate(arrayBuffer);
        const totalFiles = result.length;
        
        // 处理解压结果
        for (let i = 0; i < result.length; i++) {
            const extractedFile = result[i];
            const path = extractedFile.name;
            
            // 存储提取的文件
            extractedFiles[path] = {
                name: path.split('/').pop(),
                path: path,
                size: extractedFile.buffer.byteLength,
                type: getMimeType(path),
                content: new Blob([extractedFile.buffer], { type: getMimeType(path) })
            };
            
            // 更新进度
            updateProgress(Math.floor(((i + 1) / totalFiles) * 100));
        }
    } catch (error) {
        console.error('解压失败:', error);
        throw new Error('不支持的压缩格式或文件损坏');
    }
}

/**
 * 根据文件路径获取MIME类型
 * @param {string} path - 文件路径
 * @returns {string} MIME类型
 */
function getMimeType(path) {
    const extension = path.split('.').pop().toLowerCase();
    const mimeTypes = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'pdf': 'application/pdf',
        'txt': 'text/plain',
        'html': 'text/html',
        'htm': 'text/html',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ppt': 'application/vnd.ms-powerpoint',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'mp3': 'audio/mpeg',
        'mp4': 'video/mp4',
        'zip': 'application/zip',
        'rar': 'application/vnd.rar',
        '7z': 'application/x-7z-compressed',
        'tar': 'application/x-tar',
        'gz': 'application/gzip',
        'bz2': 'application/x-bzip2'
    };
    
    return mimeTypes[extension] || 'application/octet-stream';
}

/**
 * 显示解压后的文件列表
 */
function displayFiles() {
    // 清空文件列表
    fileList.innerHTML = '';
    
    // 按路径排序
    const sortedPaths = Object.keys(extractedFiles).sort();
    
    // 显示文件
    sortedPaths.forEach(path => {
        const file = extractedFiles[path];
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        
        // 获取文件图标
        const fileIcon = getFileIcon(file.name);
        
        // 文件名
        const fileNameDiv = document.createElement('div');
        fileNameDiv.className = 'file-name';
        fileNameDiv.innerHTML = `<i class="${fileIcon}"></i><span title="${file.path}">${file.path}</span>`;
        
        // 文件大小
        const fileSizeDiv = document.createElement('div');
        fileSizeDiv.className = 'file-size';
        fileSizeDiv.textContent = formatFileSize(file.size);
        
        // 下载按钮
        const fileActionDiv = document.createElement('div');
        fileActionDiv.className = 'file-action';
        
        const downloadBtn = document.createElement('button');
        downloadBtn.innerHTML = '<i class="fas fa-download"></i> 下载';
        downloadBtn.addEventListener('click', () => {
            downloadFile(file);
        });
        
        fileActionDiv.appendChild(downloadBtn);
        
        // 添加到文件项
        fileItem.appendChild(fileNameDiv);
        fileItem.appendChild(fileSizeDiv);
        fileItem.appendChild(fileActionDiv);
        
        // 添加到文件列表
        fileList.appendChild(fileItem);
    });
}

/**
 * 根据文件名获取适当的图标类
 * @param {string} fileName - 文件名
 * @returns {string} 图标类名
 */
function getFileIcon(fileName) {
    const extension = fileName.split('.').pop().toLowerCase();
    
    // 根据文件类型设置图标
    const iconMap = {
        // 图片
        'jpg': 'fas fa-file-image',
        'jpeg': 'fas fa-file-image',
        'png': 'fas fa-file-image',
        'gif': 'fas fa-file-image',
        'svg': 'fas fa-file-image',
        
        // 文档
        'pdf': 'fas fa-file-pdf',
        'doc': 'fas fa-file-word',
        'docx': 'fas fa-file-word',
        'txt': 'fas fa-file-alt',
        'rtf': 'fas fa-file-alt',
        
        // 表格
        'xls': 'fas fa-file-excel',
        'xlsx': 'fas fa-file-excel',
        'csv': 'fas fa-file-csv',
        
        // 演示文稿
        'ppt': 'fas fa-file-powerpoint',
        'pptx': 'fas fa-file-powerpoint',
        
        // 代码
        'html': 'fas fa-file-code',
        'htm': 'fas fa-file-code',
        'css': 'fas fa-file-code',
        'js': 'fas fa-file-code',
        'json': 'fas fa-file-code',
        'xml': 'fas fa-file-code',
        'py': 'fas fa-file-code',
        'java': 'fas fa-file-code',
        'c': 'fas fa-file-code',
        'cpp': 'fas fa-file-code',
        
        // 音频
        'mp3': 'fas fa-file-audio',
        'wav': 'fas fa-file-audio',
        'ogg': 'fas fa-file-audio',
        
        // 视频
        'mp4': 'fas fa-file-video',
        'avi': 'fas fa-file-video',
        'mov': 'fas fa-file-video',
        'wmv': 'fas fa-file-video',
        
        // 压缩文件
        'zip': 'fas fa-file-archive',
        'rar': 'fas fa-file-archive',
        '7z': 'fas fa-file-archive',
        'tar': 'fas fa-file-archive',
        'gz': 'fas fa-file-archive'
    };
    
    return iconMap[extension] || 'fas fa-file';
}

/**
 * 下载单个文件
 * @param {Object} file - 要下载的文件对象
 */
function downloadFile(file) {
    const url = URL.createObjectURL(file.content);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * 下载所有文件（创建一个ZIP）
 */
async function downloadAllFiles() {
    try {
        // 如果只有一个文件，直接下载
        const fileCount = Object.keys(extractedFiles).length;
        if (fileCount === 1) {
            const file = extractedFiles[Object.keys(extractedFiles)[0]];
            downloadFile(file);
            return;
        }
        
        // 创建新的ZIP文件
        const zip = new JSZip();
        
        // 添加所有文件到ZIP
        for (const path in extractedFiles) {
            const file = extractedFiles[path];
            zip.file(path, file.content);
        }
        
        // 生成ZIP文件
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        
        // 创建下载链接
        const zipName = currentFile.name.replace(/\.[^/.]+$/, '') + '_extracted.zip';
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = zipName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
    } catch (error) {
        console.error('创建ZIP失败:', error);
        showError('创建ZIP失败: ' + error.message);
    }
}

/**
 * 更新进度条
 * @param {number} percent - 进度百分比（0-100）
 */
function updateProgress(percent) {
    progressBar.style.width = percent + '%';
    progressText.textContent = percent + '%';
}

/**
 * 显示错误弹窗
 * @param {string} message - 错误消息
 */
function showError(message) {
    errorMessage.textContent = message;
    errorPopup.style.display = 'flex';
}

/**
 * 重置界面到初始状态
 */
function resetInterface() {
    uploadSection.style.display = 'block';
    processingSection.style.display = 'none';
    resultSection.style.display = 'none';
    fileInput.value = '';
}

/**
 * 格式化文件大小显示
 * @param {number} bytes - 文件大小（字节）
 * @returns {string} 格式化后的大小
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
}

// 初始化页面
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
}); 