/**
 * 在线解压缩工具核心脚本
 * 
 * @author ArsnYeon
 * @website https://yasuo.zip/
 * @source https://github.com/arsnyeon/online-unzip-tool
 * @license MIT License
 * 
 * 版权声明：
 * 本代码遵循MIT开源协议，允许自由使用、修改和分发。
 * 但请保留此版权声明和作者信息，禁止删除此文本注释。
 * 如需商业使用或二次开发，请遵守开源协议的相关条款。
 * 
 * 实现功能：
 * 1. 文件上传（支持拖拽和点击上传）
 * 2. 文件大小验证（限制500MB）
 * 3. 解压ZIP、RAR、TAR格式文件
 * 4. 压缩文件和文件夹为ZIP格式
 * 5. 解压进度显示
 * 6. 文件浏览和下载功能
 */

/**
 * 智能检测文本编码并解码
 * @param {Uint8Array} bytes - 字节数组
 * @returns {string} 解码后的字符串
 */
function smartDecodeFileName(bytes) {
    // 检查是否为ASCII（最常见且最安全）
    let isAscii = true;
    for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] > 127) {
            isAscii = false;
            break;
        }
    }
    if (isAscii) {
        return new TextDecoder('ascii').decode(bytes);
    }
    
    // 尝试UTF-8（现代标准）
    try {
        const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
        const decoded = utf8Decoder.decode(bytes);
        return decoded;
    } catch (e) {
        // UTF-8失败，继续尝试其他编码
    }
    
    // 检测可能的中文编码
    const encodings = ['gbk', 'gb2312', 'big5', 'shift-jis'];
    for (const encoding of encodings) {
        try {
            const decoder = new TextDecoder(encoding);
            const decoded = decoder.decode(bytes);
            // 简单的启发式检查：如果解码结果不包含太多替换字符，认为是正确的
            const replacementCount = (decoded.match(/\uFFFD/g) || []).length;
            if (replacementCount / decoded.length < 0.1) { // 替换字符少于10%
                return decoded;
            }
        } catch (e) {
            continue;
        }
    }
    
    // 所有编码都失败，使用latin1作为最后的fallback
    return new TextDecoder('latin1').decode(bytes);
}

// 定义最大允许上传大小：500MB
const MAX_FILE_SIZE = 500 * 1024 * 1024;

// DOM元素引用
const dropArea = document.getElementById('drop-area');
const fileInput = document.getElementById('file-input');
const uploadBtn = document.getElementById('upload-btn');
const uploadSection = document.getElementById('upload-section');
const processingSection = document.getElementById('processing-section');
const resultSection = document.getElementById('result-section');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const processingTextElement = document.getElementById('processing-text');
const fileList = document.getElementById('file-list');
const fileName = document.getElementById('file-name');
const fileSize = document.getElementById('file-size');
const downloadAllBtn = document.getElementById('download-all-btn');
const errorPopup = document.getElementById('error-popup');
const errorMessage = document.getElementById('error-message');
const errorClose = document.getElementById('error-close');
const compressBtn = document.getElementById('compress-btn');
const extractBtn = document.getElementById('extract-btn');
const compressFileInput = document.getElementById('compress-file-input');
const compressFilesInput = document.getElementById('compress-files-input');
const selectFilesBtn = document.getElementById('select-files-btn');
const selectFolderBtn = document.getElementById('select-folder-btn');
const uploadTitle = document.getElementById('upload-title');
const uploadDescription = document.getElementById('upload-description');
const uploadButtons = document.getElementById('upload-buttons');
const compressButtons = document.getElementById('compress-buttons');
const extractIcon = document.getElementById('extract-icon');
const compressIcon = document.getElementById('compress-icon');

// 存储解压后的文件或待压缩的文件
let extractedFiles = {};
let currentFile = null;
let currentMode = 'compress'; // 当前模式：'extract' 或 'compress'

/**
 * 初始化事件监听器
 */
function initEventListeners() {
    // 上传按钮点击事件
    uploadBtn.addEventListener('click', () => {
        if (currentMode === 'extract') {
            fileInput.click();
        }
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
        
        const files = e.dataTransfer.files;
        if (files.length) {
            if (currentMode === 'extract') {
                handleFiles(files);
            } else if (currentMode === 'compress') {
                handleCompressFiles(files);
            }
        }
    });

    // 点击拖放区域也触发文件选择
    dropArea.addEventListener('click', (e) => {
        // 如果点击的是按钮，不触发文件选择
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
            return;
        }
        
        if (currentMode === 'extract') {
            fileInput.click();
        }
        // 移除压缩模式下的自动触发，避免与按钮冲突
    });

    // 下载全部按钮
    downloadAllBtn.addEventListener('click', downloadAllFiles);

    // 错误弹窗关闭按钮
    errorClose.addEventListener('click', () => {
        errorPopup.style.display = 'none';
    });

    // 工具栏按钮事件
    if (compressBtn) {
        compressBtn.addEventListener('click', () => {
            switchMode('compress');
        });
    }

    if (extractBtn) {
        extractBtn.addEventListener('click', () => {
            switchMode('extract');
        });
    }

    // 压缩模式按钮事件
    if (selectFilesBtn) {
        selectFilesBtn.addEventListener('click', () => {
            compressFilesInput.click();
        });
    }

    if (selectFolderBtn) {
        selectFolderBtn.addEventListener('click', () => {
            compressFileInput.click();
        });
    }

    // 压缩文件选择事件
    if (compressFilesInput) {
        compressFilesInput.addEventListener('change', handleCompressFilesSelect);
    }

    if (compressFileInput) {
        compressFileInput.addEventListener('change', handleCompressFolderSelect);
    }
}

/**
 * 切换工具模式
 * @param {string} mode - 模式：'compress' 或 'extract'
 */
function switchMode(mode) {
    currentMode = mode;
    
    // 更新按钮状态
    if (compressBtn && extractBtn) {
        compressBtn.classList.toggle('active', mode === 'compress');
        extractBtn.classList.toggle('active', mode === 'extract');
    }
    
    // 更新界面显示
    if (uploadTitle && uploadDescription && uploadButtons && compressButtons && extractIcon && compressIcon) {
        if (mode === 'compress') {
            uploadTitle.textContent = '选择文件进行压缩';
            uploadDescription.innerHTML = '拖拽文件到此处上传<br>(支持多种文件格式，最大500MB)';
            uploadButtons.style.display = 'none';
            compressButtons.style.display = 'flex';
            extractIcon.style.display = 'none';
            compressIcon.style.display = 'block';
            
            // 更新文件输入接受类型
            fileInput.accept = '';
        } else {
            uploadTitle.textContent = '选择压缩文件进行解压';
            uploadDescription.innerHTML = '拖拽压缩文件到此处上传<br>(支持ZIP、RAR、TAR格式，最大500MB)';
            uploadButtons.style.display = 'flex';
            compressButtons.style.display = 'none';
            extractIcon.style.display = 'block';
            compressIcon.style.display = 'none';
            
            // 设置文件输入接受类型为ZIP、RAR、TAR
            fileInput.accept = '.zip,.rar,.tar';
        }
    }
    
    // 重置界面
    resetInterface();
}

/**
 * 处理压缩文件选择
 */
function handleCompressFilesSelect(e) {
    const files = e.target.files;
    if (files.length) {
        handleCompressFiles(files);
    }
}

/**
 * 处理压缩文件夹选择
 */
function handleCompressFolderSelect(e) {
    const files = e.target.files;
    if (files.length) {
        handleCompressFiles(files);
    }
}

/**
 * 处理要压缩的文件
 * @param {FileList} files - 要压缩的文件列表
 */
function handleCompressFiles(files) {
    // 验证文件总大小
    let totalSize = 0;
    for (let i = 0; i < files.length; i++) {
        totalSize += files[i].size;
    }
    
    if (totalSize > MAX_FILE_SIZE) {
        showError(`文件总大小超过限制（${formatFileSize(MAX_FILE_SIZE)}）`);
        return;
    }
    
    // 显示处理界面
    uploadSection.style.display = 'none';
    processingSection.style.display = 'block';
    resultSection.style.display = 'none';
    
    // 更新处理提示文本
    if (processingTextElement) {
        processingTextElement.textContent = '正在压缩中...';
    }
    
    // 重置进度条
    updateProgress(0);
    
    // 开始压缩文件
    compressFiles(files);
}

/**
 * 压缩文件为ZIP
 * @param {FileList} files - 要压缩的文件列表
 */
async function compressFiles(files) {
    try {
        const zip = new JSZip();
        const totalFiles = files.length;
        let processedFiles = 0;
        
        // 添加文件到ZIP
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            
            // 处理文件路径，保持文件夹结构
            let filePath = file.webkitRelativePath || file.name;
            
            // 读取文件内容
            const fileContent = await readFileAsArrayBuffer(file);
            
            // 添加到ZIP
            zip.file(filePath, fileContent);
            
            // 更新进度
            processedFiles++;
            updateProgress(Math.floor((processedFiles / totalFiles) * 100));
        }
        
        // 添加说明文本文件
        const readmeContent = '本压缩包由【在线解压缩工具yasuo.zip】在线压缩，感谢您的使用！';
        zip.file('在线解压缩工具(yasuo.zip).txt', readmeContent);
        
        // 生成ZIP文件
        const zipBlob = await zip.generateAsync({ 
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: {
                level: 6
            }
        });
        
        // 创建压缩结果
        let zipName;
        if (files.length === 1 && !files[0].webkitRelativePath) {
            // 单个文件
            zipName = files[0].name.replace(/\.[^/.]+$/, '') + '.zip';
        } else {
            // 文件夹压缩或多个文件
            zipName = 'yasuo.zip';
        }
            
        extractedFiles = {
            [zipName]: {
                name: zipName,
                path: zipName,
                size: zipBlob.size,
                type: 'application/zip',
                content: zipBlob
            }
        };
        
        // 更新文件信息
        fileName.textContent = zipName;
        fileSize.textContent = formatFileSize(zipBlob.size);
        
        // 更新结果标题为压缩结果
        const resultHeader = document.querySelector('.result-header h2');
        if (resultHeader) {
            resultHeader.textContent = '压缩结果';
        }
        
        // 显示结果
        displayFiles();
        
        // 显示结果界面
        processingSection.style.display = 'none';
        resultSection.style.display = 'block';
        
    } catch (error) {
        console.error('压缩失败:', error);
        showError('压缩失败: ' + error.message);
        resetInterface();
    }
}

/**
 * 读取文件为ArrayBuffer
 * @param {File} file - 要读取的文件
 * @returns {Promise<ArrayBuffer>} 文件内容
 */
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
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
    
    // 验证文件类型 - 支持ZIP、RAR、TAR格式
    const fileExt = '.' + file.name.split('.').pop().toLowerCase();
    const supportedFormats = ['.zip', '.rar', '.tar'];
    
    if (!supportedFormats.includes(fileExt)) {
        showError('只支持ZIP、RAR、TAR格式的压缩文件');
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
    
    // 更新处理提示文本
    if (processingTextElement) {
        processingTextElement.textContent = '正在解压中...';
    }
    
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
        
        // 获取文件扩展名
        const fileExtension = file.name.split('.').pop().toLowerCase();
        
        // 根据文件类型选择解压方法
        if (fileExtension === 'zip') {
            await extractZip(file);
        } else if (fileExtension === 'rar') {
            await extractWithUncompress(file);
        } else if (fileExtension === 'tar') {
            await extractWithUncompress(file);
        } else {
            throw new Error('不支持的文件格式');
        }
        
        // 更新结果标题为解压结果
        const resultHeader = document.querySelector('.result-header h2');
        if (resultHeader) {
            resultHeader.textContent = '解压结果';
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
        
        // 读取zip文件，使用智能编码检测
        const zipData = await zip.loadAsync(file, {
            decodeFileName: smartDecodeFileName
        });
        
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
 * 使用uncompress.js解压RAR和TAR文件
 * @param {File} file - 要解压的文件
 */
async function extractWithUncompress(file) {
    return new Promise((resolve, reject) => {
        // 设置超时处理
        const timeoutId = setTimeout(() => {
            reject(new Error('解压超时，请重试'));
        }, 30000); // 30秒超时
        
        // 获取文件扩展名来确定格式
        const fileExtension = file.name.split('.').pop().toLowerCase();
        const supportedFormats = [];
        
        if (fileExtension === 'rar') {
            supportedFormats.push('rar');
        } else if (fileExtension === 'tar') {
            supportedFormats.push('tar');
        }
        
        // 处理文件的核心逻辑
        const processFile = () => {
            try {
                // 打开压缩文件
                archiveOpenFile(file, null, (archive, error) => {
                    clearTimeout(timeoutId);
                    
                    if (error) {
                        reject(new Error(`无法打开${fileExtension.toUpperCase()}文件: ${error.message}`));
                        return;
                    }
                    
                    if (!archive || !archive.entries) {
                        reject(new Error(`${fileExtension.toUpperCase()}文件格式错误或已损坏`));
                        return;
                    }
                    
                    try {
                        const totalFiles = archive.entries.length;
                        let processedFiles = 0;
                        let completedFiles = 0;
                        
                        // 如果没有文件，直接完成
                        if (totalFiles === 0) {
                            if (archive && typeof archiveClose === 'function') {
                                archiveClose(archive);
                            }
                            resolve();
                            return;
                        }
                        
                        // 处理每个文件
                        archive.entries.forEach((entry, index) => {
                            // 跳过目录
                            if (!entry.is_file) {
                                processedFiles++;
                                updateProgress(Math.floor((processedFiles / totalFiles) * 100));
                                
                                completedFiles++;
                                if (completedFiles === totalFiles) {
                                    if (archive && typeof archiveClose === 'function') {
                                        archiveClose(archive);
                                    }
                                    resolve();
                                }
                                return;
                            }
                            
                            // 读取文件数据
                            try {
                                entry.readData((data, error) => {
                                    if (error) {
                                        console.error(`读取文件 ${entry.name} 失败:`, error);
                                    } else if (data) {
                                        // 创建Blob对象
                                        const blob = new Blob([data], { type: getMimeType(entry.name) });
                                        
                                        // 存储提取的文件
                                        extractedFiles[entry.name] = {
                                            name: entry.name.split('/').pop(),
                                            path: entry.name,
                                            size: blob.size,
                                            type: blob.type,
                                            content: blob
                                        };
                                    }
                                    
                                    // 更新进度
                                    processedFiles++;
                                    updateProgress(Math.floor((processedFiles / totalFiles) * 100));
                                    
                                    // 检查是否所有文件都已处理完成
                                    completedFiles++;
                                    if (completedFiles === totalFiles) {
                                        if (archive && typeof archiveClose === 'function') {
                                            archiveClose(archive);
                                        }
                                        resolve();
                                    }
                                });
                            } catch (readError) {
                                console.error(`处理文件 ${entry.name} 时出错:`, readError);
                                completedFiles++;
                                if (completedFiles === totalFiles) {
                                    if (archive && typeof archiveClose === 'function') {
                                        archiveClose(archive);
                                    }
                                    resolve();
                                }
                            }
                        });
                        
                    } catch (error) {
                        if (archive && typeof archiveClose === 'function') {
                            archiveClose(archive);
                        }
                        reject(new Error(`解压${fileExtension.toUpperCase()}文件失败: ${error.message}`));
                    }
                });
            } catch (error) {
                clearTimeout(timeoutId);
                reject(new Error(`处理${fileExtension.toUpperCase()}文件时出错: ${error.message}`));
            }
        };
        
        // 使用原始的loadArchiveFormats，但修复其回调问题
        try {
            // 保存原始的loadArchiveFormats函数
            const originalLoadArchiveFormats = window.loadArchiveFormats;
            
            // 创建一个包装函数来修复回调问题
            const wrappedLoadArchiveFormats = (formats, callback) => {
                // 检查格式是否已经加载
                const isFormatLoaded = (format) => {
                    switch(format) {
                        case 'rar':
                            return typeof readRARFileNames !== 'undefined';
                        case 'tar':
                            return typeof tarGetEntries !== 'undefined';
                        default:
                            return false;
                    }
                };
                
                // 检查所有格式是否都已加载
                const allFormatsLoaded = formats.every(format => isFormatLoaded(format));
                
                if (allFormatsLoaded) {
                    // 如果都已加载，直接调用回调
                    setTimeout(callback, 0);
                } else {
                    // 否则调用原始函数
                    originalLoadArchiveFormats(formats, callback);
                }
            };
            
            // 使用包装后的函数
            wrappedLoadArchiveFormats(supportedFormats, () => {
                setTimeout(() => {
                    processFile();
                }, 100);
            });
        } catch (loadError) {
            clearTimeout(timeoutId);
            reject(new Error(`加载${fileExtension.toUpperCase()}解压库失败: ${loadError.message}`));
        }
    });
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
        const zipName = currentFile ? 
            currentFile.name.replace(/\.[^/.]+$/, '') + '_extracted.zip' :
            'files.zip';
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
    if (compressFilesInput) compressFilesInput.value = '';
    if (compressFileInput) compressFileInput.value = '';
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
    // 页面已经默认为压缩模式，无需再次切换
});
