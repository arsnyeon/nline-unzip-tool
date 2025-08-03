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
 * 3. 解压ZIP/GZ/TAR格式文件
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

// DOM元素缓存
const elements = {
    dropArea: document.getElementById('drop-area'),
    fileInput: document.getElementById('file-input'),
    uploadBtn: document.getElementById('upload-btn'),
    uploadSection: document.getElementById('upload-section'),
    processingSection: document.getElementById('processing-section'),
    resultSection: document.getElementById('result-section'),
    progressBar: document.getElementById('progress-bar'),
    progressText: document.getElementById('progress-text'),
    processingText: document.getElementById('processing-text'),
    fileList: document.getElementById('file-list'),
    fileName: document.getElementById('file-name'),
    fileSize: document.getElementById('file-size'),
    downloadAllBtn: document.getElementById('download-all-btn'),
    errorPopup: document.getElementById('error-popup'),
    errorMessage: document.getElementById('error-message'),
    errorClose: document.getElementById('error-close'),
    compressBtn: document.getElementById('compress-btn'),
    extractBtn: document.getElementById('extract-btn'),
    imageCompressBtn: document.getElementById('image-compress-btn'),
    compressFileInput: document.getElementById('compress-file-input'),
    compressFilesInput: document.getElementById('compress-files-input'),
    imageCompressInput: document.getElementById('image-compress-input'),
    selectFilesBtn: document.getElementById('select-files-btn'),
    selectFolderBtn: document.getElementById('select-folder-btn'),
    selectImagesBtn: document.getElementById('select-images-btn'),
    uploadTitle: document.getElementById('upload-title'),
    uploadDescription: document.getElementById('upload-description'),
    uploadButtons: document.getElementById('upload-buttons'),
    compressButtons: document.getElementById('compress-buttons'),
    imageCompressButtons: document.getElementById('image-compress-buttons'),
    extractIcon: document.getElementById('extract-icon'),
    compressIcon: document.getElementById('compress-icon'),
    imageCompressIcon: document.getElementById('image-compress-icon'),
    qualitySlider: document.getElementById('quality-slider'),
    qualityValue: document.getElementById('quality-value')
};

// 存储解压后的文件或待压缩的文件
let extractedFiles = {};
let currentFile = null;
let currentMode = 'compress'; // 当前模式：'extract'、'compress' 或 'image-compress'

/**
 * 初始化事件监听器
 */
function initEventListeners() {
    const { dropArea, fileInput, uploadBtn, downloadAllBtn, errorClose, compressBtn, extractBtn, imageCompressBtn,
            selectFilesBtn, selectFolderBtn, selectImagesBtn, compressFilesInput, compressFileInput, 
            imageCompressInput, qualitySlider, qualityValue } = elements;

    // 上传按钮点击事件
    uploadBtn.addEventListener('click', () => currentMode === 'extract' && fileInput.click());

    // 文件选择事件
    fileInput.addEventListener('change', handleFileSelect);

    // 拖放区域事件
    ['dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, handleDragEvent);
    });

    // 点击拖放区域触发文件选择
    dropArea.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
            if (currentMode === 'extract') {
                fileInput.click();
            }
            // 删除了图片压缩模式的点击事件，只保留拖拽功能
        }
    });

    // 其他事件监听器
    downloadAllBtn.addEventListener('click', downloadAllFiles);
    errorClose.addEventListener('click', () => elements.errorPopup.style.display = 'none');
    compressBtn?.addEventListener('click', () => switchMode('compress'));
    extractBtn?.addEventListener('click', () => switchMode('extract'));
    imageCompressBtn?.addEventListener('click', () => switchMode('image-compress'));
    selectFilesBtn?.addEventListener('click', () => compressFilesInput.click());
    selectFolderBtn?.addEventListener('click', () => compressFileInput.click());
    selectImagesBtn?.addEventListener('click', () => imageCompressInput.click());
    compressFilesInput?.addEventListener('change', handleCompressFilesSelect);
    compressFileInput?.addEventListener('change', handleCompressFolderSelect);
    imageCompressInput?.addEventListener('change', handleImageCompressSelect);
    
    // 质量滑块事件
    qualitySlider?.addEventListener('input', (e) => {
        qualityValue.textContent = e.target.value;
    });
}

/**
 * 处理拖放事件
 */
function handleDragEvent(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const { dropArea } = elements;
    
    if (e.type === 'dragover') {
        dropArea.classList.add('drag-over');
    } else if (e.type === 'dragleave') {
        dropArea.classList.remove('drag-over');
    } else if (e.type === 'drop') {
        dropArea.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length) {
            if (currentMode === 'extract') {
                handleFiles(files);
            } else if (currentMode === 'compress') {
                handleCompressFiles(files);
            } else if (currentMode === 'image-compress') {
                handleImageCompressFiles(files);
            }
        }
    }
}

/**
 * 切换工具模式
 * @param {string} mode - 模式：'compress'、'extract' 或 'image-compress'
 */
function switchMode(mode) {
    currentMode = mode;
    const { compressBtn, extractBtn, imageCompressBtn, uploadTitle, uploadDescription, uploadButtons, 
            compressButtons, imageCompressButtons, extractIcon, compressIcon, imageCompressIcon, fileInput } = elements;
    
    // 更新按钮状态
    compressBtn?.classList.toggle('active', mode === 'compress');
    extractBtn?.classList.toggle('active', mode === 'extract');
    imageCompressBtn?.classList.toggle('active', mode === 'image-compress');
    
    // 更新界面显示
    if (mode === 'compress') {
        uploadTitle.textContent = '选择文件进行压缩';
        uploadDescription.innerHTML = '拖拽文件到此处上传<br>(支持多种文件格式，最大500MB)';
        uploadButtons.style.display = 'none';
        compressButtons.style.display = 'flex';
        imageCompressButtons.style.display = 'none';
        extractIcon.style.display = 'none';
        compressIcon.style.display = 'block';
        imageCompressIcon.style.display = 'none';
        fileInput.accept = '';
    } else if (mode === 'extract') {
        uploadTitle.textContent = '选择压缩文件进行解压';
        uploadDescription.innerHTML = '拖拽压缩文件到此处上传<br>(支持ZIP、GZ、TAR格式，最大500MB)';
        uploadButtons.style.display = 'flex';
        compressButtons.style.display = 'none';
        imageCompressButtons.style.display = 'none';
        extractIcon.style.display = 'block';
        compressIcon.style.display = 'none';
        imageCompressIcon.style.display = 'none';
        fileInput.accept = '.zip,.gz,.tar';
    } else if (mode === 'image-compress') {
        uploadTitle.textContent = '选择图片进行压缩';
        uploadDescription.innerHTML = '拖拽图片到此处上传<br>(支持JPG、PNG、WebP格式，最大500MB)';
        uploadButtons.style.display = 'none';
        compressButtons.style.display = 'none';
        imageCompressButtons.style.display = 'flex';
        extractIcon.style.display = 'none';
        compressIcon.style.display = 'none';
        imageCompressIcon.style.display = 'block';
        fileInput.accept = '';
    }
    
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
 * 处理图片压缩文件选择
 */
function handleImageCompressSelect(e) {
    const files = e.target.files;
    if (files.length) {
        handleImageCompressFiles(files);
    }
}

/**
 * 处理要压缩的图片文件
 * @param {FileList} files - 要压缩的图片文件列表
 */
function handleImageCompressFiles(files) {
    // 验证文件类型和大小
    const validFiles = [];
    const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        if (!supportedTypes.includes(file.type)) {
            showError(`文件 ${file.name} 不是支持的图片格式\n支持的格式：JPG、PNG、WebP`);
            return;
        }
        
        if (file.size > MAX_FILE_SIZE) {
            showError(`文件 ${file.name} 大小超过限制（${formatFileSize(MAX_FILE_SIZE)}）`);
            return;
        }
        
        validFiles.push(file);
    }
    
    if (validFiles.length === 0) {
        showError('没有找到有效的图片文件');
        return;
    }
    
    showProcessingUI('正在压缩图片...');
    compressImages(validFiles);
}

/**
 * 压缩图片文件
 * @param {Array} files - 要压缩的图片文件数组
 */
async function compressImages(files) {
    try {
        const quality = parseInt(elements.qualitySlider.value) / 100;
        const totalFiles = files.length;
        let processedFiles = 0;
        extractedFiles = {};
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            
            // 压缩图片
            const compressedBlob = await compressImage(file, quality);
            
            // 生成压缩后的文件名
            const originalName = file.name;
            const nameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.'));
            const ext = originalName.substring(originalName.lastIndexOf('.'));
            const compressedName = `${nameWithoutExt}(yasuo.zip)${ext}`;
            
            // 存储压缩后的文件
            extractedFiles[compressedName] = {
                name: compressedName,
                path: compressedName,
                size: compressedBlob.size,
                type: compressedBlob.type,
                content: compressedBlob,
                originalSize: file.size,
                compressionRatio: ((file.size - compressedBlob.size) / file.size * 100).toFixed(1)
            };
            
            // 更新进度
            processedFiles++;
            updateProgress(Math.floor((processedFiles / totalFiles) * 100));
        }
        
        // 计算总体压缩信息
        const totalOriginalSize = files.reduce((sum, file) => sum + file.size, 0);
        const totalCompressedSize = Object.values(extractedFiles).reduce((sum, file) => sum + file.size, 0);
        const overallCompressionRatio = ((totalOriginalSize - totalCompressedSize) / totalOriginalSize * 100).toFixed(1);
        
        // 更新文件信息
        elements.fileName.textContent = `${files.length}个图片文件 (压缩率: ${overallCompressionRatio}%)`;
        elements.fileSize.textContent = `${formatFileSize(totalCompressedSize)} (原始: ${formatFileSize(totalOriginalSize)})`;
        
        showResults('图片压缩结果');
        
    } catch (error) {
        console.error('图片压缩失败:', error);
        showError('图片压缩失败: ' + error.message);
        resetInterface();
    }
}

/**
 * 压缩单个图片
 * @param {File} file - 要压缩的图片文件
 * @param {number} quality - 压缩质量 (0-1)
 * @returns {Promise<Blob>} 压缩后的图片Blob
 */
function compressImage(file, quality) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = function() {
            // 设置画布尺寸
            canvas.width = img.width;
            canvas.height = img.height;
            
            // 绘制图片到画布
            ctx.drawImage(img, 0, 0);
            
            // 根据原始格式选择输出格式
            let outputFormat = 'image/jpeg';
            if (file.type === 'image/png') {
                outputFormat = 'image/png';
            } else if (file.type === 'image/webp') {
                outputFormat = 'image/webp';
            }
            
            // 转换为Blob
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('图片压缩失败'));
                }
            }, outputFormat, quality);
        };
        
        img.onerror = () => reject(new Error('图片加载失败'));
        img.src = URL.createObjectURL(file);
    });
}

/**
 * 处理要压缩的文件
 * @param {FileList} files - 要压缩的文件列表
 */
function handleCompressFiles(files) {
    // 验证文件总大小
    const totalSize = Array.from(files).reduce((sum, file) => sum + file.size, 0);
    
    if (totalSize > MAX_FILE_SIZE) {
        showError(`文件总大小超过限制（${formatFileSize(MAX_FILE_SIZE)}）`);
        return;
    }
    
    showProcessingUI('正在压缩中...');
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
        elements.fileName.textContent = zipName;
        elements.fileSize.textContent = formatFileSize(zipBlob.size);
        
        showResults('压缩结果');
        
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
 * 显示处理界面
 * @param {string} text - 处理提示文本
 */
function showProcessingUI(text) {
    const { uploadSection, processingSection, resultSection, processingText } = elements;
    uploadSection.style.display = 'none';
    processingSection.style.display = 'block';
    resultSection.style.display = 'none';
    processingText.textContent = text;
    updateProgress(0);
}

/**
 * 显示结果界面
 * @param {string} title - 结果标题
 */
function showResults(title) {
    const { processingSection, resultSection } = elements;
    const resultHeader = document.querySelector('.result-header h2');
    if (resultHeader) resultHeader.textContent = title;
    
    displayFiles();
    processingSection.style.display = 'none';
    resultSection.style.display = 'block';
}

/**
 * 处理上传的文件
 * @param {FileList} files - 用户选择的文件列表
 */
function handleFiles(files) {
    const file = files[0];
    
    // 验证文件大小和类型
    if (file.size > MAX_FILE_SIZE) {
        showError(`文件大小超过限制（${formatFileSize(MAX_FILE_SIZE)}）`);
        return;
    }
    
    const fileExt = '.' + file.name.split('.').pop().toLowerCase();
    const supportedFormats = ['.zip', '.gz', '.tar'];
    
    if (!supportedFormats.includes(fileExt)) {
        showError('目前支持的格式：ZIP、GZ、TAR\n(RAR、7Z等格式由于浏览器限制暂不支持)');
        return;
    }
    
    // 保存当前文件信息
    currentFile = file;
    elements.fileName.textContent = file.name;
    elements.fileSize.textContent = formatFileSize(file.size);
    
    showProcessingUI('正在解压中...');
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
        
        // 根据文件格式选择解压方法
        switch (fileExtension) {
            case 'zip':
                await extractZip(file);
                break;
            case 'gz':
                await extractGzip(file);
                break;
            case 'tar':
                await extractTar(file);
                break;
            default:
                throw new Error('不支持的文件格式');
        }
        
        showResults('解压结果');
        
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
 * 使用pako解压GZIP文件
 * @param {File} file - 要解压的GZIP文件
 */
async function extractGzip(file) {
    try {
        // 检查pako是否可用
        if (typeof pako === 'undefined') {
            throw new Error('GZIP解压库未加载，请刷新页面重试');
        }
        
        const arrayBuffer = await file.arrayBuffer();
        const compressed = new Uint8Array(arrayBuffer);
        
        // 使用pako解压GZIP
        const decompressed = pako.ungzip(compressed);
        
        // 获取原始文件名（去掉.gz扩展名）
        let originalName = file.name;
        if (originalName.toLowerCase().endsWith('.gz')) {
            originalName = originalName.slice(0, -3);
        }
        
        const blob = new Blob([decompressed]);
        
        extractedFiles[originalName] = {
            name: originalName,
            path: originalName,
            size: blob.size,
            type: getMimeType(originalName),
            content: blob
        };
        
        updateProgress(100);
        
    } catch (error) {
        console.error('GZIP解压失败:', error);
        throw new Error('GZIP解压失败，可能是文件损坏或格式不支持');
    }
}

/**
 * 解压TAR文件（未压缩的TAR格式）
 * @param {File} file - 要解压的TAR文件
 */
async function extractTar(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const view = new DataView(arrayBuffer);
        let offset = 0;
        let processedFiles = 0;
        const fileCount = Math.floor(arrayBuffer.byteLength / 512); // 估算文件数量
        
        // TAR文件格式解析
        while (offset < arrayBuffer.byteLength - 512) {
            // 检查是否到达文件末尾（连续的零字节）
            let isEnd = true;
            for (let i = 0; i < 512 && offset + i < arrayBuffer.byteLength; i++) {
                if (view.getUint8(offset + i) !== 0) {
                    isEnd = false;
                    break;
                }
            }
            if (isEnd) break;
            
            // 读取文件名（前100字节）- 使用智能编码检测
            const fileNameBytes = new Uint8Array(100);
            let fileNameLength = 0;
            for (let i = 0; i < 100; i++) {
                const byte = view.getUint8(offset + i);
                if (byte === 0) break;
                fileNameBytes[i] = byte;
                fileNameLength++;
            }
            
            // 使用智能编码检测解码文件名
            const fileName = smartDecodeFileName(fileNameBytes.slice(0, fileNameLength));
            
            if (!fileName) break;
            
            // 读取文件大小（124-135字节，八进制）
            let sizeStr = '';
            for (let i = 124; i < 136; i++) {
                const byte = view.getUint8(offset + i);
                if (byte === 0 || byte === 32) break; // 空格或null结束
                sizeStr += String.fromCharCode(byte);
            }
            
            const fileSize = parseInt(sizeStr.trim(), 8) || 0;
            
            // 读取文件类型（156字节）
            const fileType = view.getUint8(offset + 156);
            
            // 跳过头部（512字节）
            offset += 512;
            
            // 如果是普通文件且有内容
            if (fileSize > 0 && !fileName.endsWith('/') && (fileType === 0 || fileType === 48)) {
                // 读取文件内容
                const fileData = new Uint8Array(arrayBuffer.slice(offset, offset + fileSize));
                const blob = new Blob([fileData]);
                
                extractedFiles[fileName] = {
                    name: fileName.split('/').pop(),
                    path: fileName,
                    size: blob.size,
                    type: getMimeType(fileName),
                    content: blob
                };
                
                processedFiles++;
                updateProgress(Math.floor((processedFiles / Math.max(fileCount / 10, 1)) * 100));
            }
            
            // 移动到下一个文件（文件大小向上舍入到512的倍数）
            offset += Math.ceil(fileSize / 512) * 512;
        }
        
        if (Object.keys(extractedFiles).length === 0) {
            throw new Error('未找到有效的文件');
        }
        
    } catch (error) {
        console.error('TAR解压失败:', error);
        throw new Error('TAR解压失败，可能是文件损坏或格式不支持');
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
        'tar': 'application/x-tar',
        'gz': 'application/gzip'
    };
    
    return mimeTypes[extension] || 'application/octet-stream';
}

/**
 * 显示解压后的文件列表
 */
function displayFiles() {
    const { fileList } = elements;
    fileList.innerHTML = '';
    
    Object.keys(extractedFiles).sort().forEach(path => {
        const file = extractedFiles[path];
        const fileItem = createFileItem(file);
        fileList.appendChild(fileItem);
    });
}

/**
 * 创建文件项元素
 * @param {Object} file - 文件对象
 * @returns {HTMLElement} 文件项元素
 */
function createFileItem(file) {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    
    const fileIcon = getFileIcon(file.name);
    
    // 如果是图片压缩结果，显示压缩信息
    let sizeDisplay = formatFileSize(file.size);
    if (file.originalSize && file.compressionRatio) {
        sizeDisplay = `${formatFileSize(file.size)} <small style="color: var(--secondary-color);">(-${file.compressionRatio}%)</small>`;
    }
    
    fileItem.innerHTML = `
        <div class="file-name">
            <i class="${fileIcon}"></i>
            <span title="${file.path}">${file.path}</span>
        </div>
        <div class="file-size">${sizeDisplay}</div>
        <div class="file-action">
            <button onclick="downloadFile(extractedFiles['${file.path}'])">
                <i class="fas fa-download"></i> 下载
            </button>
        </div>
    `;
    
    return fileItem;
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
    const { progressBar, progressText } = elements;
    progressBar.style.width = percent + '%';
    progressText.textContent = percent + '%';
}

/**
 * 显示错误弹窗
 * @param {string} message - 错误消息
 */
function showError(message) {
    const { errorMessage, errorPopup } = elements;
    errorMessage.textContent = message;
    errorPopup.style.display = 'flex';
}

/**
 * 重置界面到初始状态
 */
function resetInterface() {
    const { uploadSection, processingSection, resultSection, fileInput, compressFilesInput, compressFileInput, imageCompressInput } = elements;
    uploadSection.style.display = 'block';
    processingSection.style.display = 'none';
    resultSection.style.display = 'none';
    fileInput.value = '';
    compressFilesInput && (compressFilesInput.value = '');
    compressFileInput && (compressFileInput.value = '');
    imageCompressInput && (imageCompressInput.value = '');
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
