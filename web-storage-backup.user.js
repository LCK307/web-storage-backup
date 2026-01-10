// ==UserScript==
// @name         Web Storage Backup & Restore
// @namespace    https://github.com/LCK307/web-storage-backup
// @version      4.0
// @description  Xuất/Nhập localStorage, sessionStorage, cookies, IndexedDB, Cache Storage, Service Worker với mã hóa AES-256-GCM
// @author       LCK307
// @match        *://*/*
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @license      MIT
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ==================== SETTINGS ====================

    var settings = {
        compress: GM_getValue('sb_compress', true),
        encrypt: GM_getValue('sb_encrypt', false)
    };

    function saveSettings() {
        GM_setValue('sb_compress', settings.compress);
        GM_setValue('sb_encrypt', settings.encrypt);
    }

    // ==================== DETECT MOBILE ====================

    function isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    // ==================== COMPRESSION ====================

    async function compress(data) {
        try {
            if (typeof CompressionStream !== 'undefined') {
                var encoder = new TextEncoder();
                var inputData = encoder.encode(data);
                var stream = new CompressionStream('gzip');
                var writer = stream.writable.getWriter();
                writer.write(inputData);
                writer.close();
                var compressedData = await new Response(stream.readable).arrayBuffer();
                return new Uint8Array(compressedData);
            }
        } catch (e) {
            console.warn('Compression error:', e);
        }
        return null;
    }

    async function decompress(compressedData) {
        try {
            if (typeof DecompressionStream !== 'undefined') {
                var stream = new DecompressionStream('gzip');
                var writer = stream.writable.getWriter();
                writer.write(compressedData);
                writer.close();
                var decompressedData = await new Response(stream.readable).arrayBuffer();
                var decoder = new TextDecoder();
                return decoder.decode(decompressedData);
            }
        } catch (e) {
            console.warn('Decompression error:', e);
        }
        return null;
    }

    // ==================== ENCRYPTION ====================

    async function deriveKey(password, salt) {
        var encoder = new TextEncoder();
        var keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        );

        return await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async function encrypt(data, password) {
        var salt = crypto.getRandomValues(new Uint8Array(16));
        var iv = crypto.getRandomValues(new Uint8Array(12));
        var key = await deriveKey(password, salt);

        var dataBytes;
        if (typeof data === 'string') {
            dataBytes = new TextEncoder().encode(data);
        } else {
            dataBytes = data;
        }

        var encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            dataBytes
        );

        var result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
        result.set(salt, 0);
        result.set(iv, salt.length);
        result.set(new Uint8Array(encrypted), salt.length + iv.length);

        return result;
    }

    async function decrypt(encryptedData, password) {
        var salt = encryptedData.slice(0, 16);
        var iv = encryptedData.slice(16, 28);
        var data = encryptedData.slice(28);

        var key = await deriveKey(password, salt);

        var decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            data
        );

        return new Uint8Array(decrypted);
    }

    function uint8ToBase64(uint8) {
        var binary = '';
        for (var i = 0; i < uint8.length; i++) {
            binary += String.fromCharCode(uint8[i]);
        }
        return btoa(binary);
    }

    function base64ToUint8(base64) {
        var binary = atob(base64);
        var uint8 = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) {
            uint8[i] = binary.charCodeAt(i);
        }
        return uint8;
    }

    // ==================== EXPORT FUNCTIONS ====================

    function exportLocalStorage() {
        var data = {};
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            data[key] = localStorage.getItem(key);
        }
        return data;
    }

    function exportSessionStorage() {
        var data = {};
        for (var i = 0; i < sessionStorage.length; i++) {
            var key = sessionStorage.key(i);
            data[key] = sessionStorage.getItem(key);
        }
        return data;
    }

    function exportCookies() {
        var cookies = {};
        var parts = document.cookie.split(';');
        for (var i = 0; i < parts.length; i++) {
            var cookie = parts[i].trim();
            var eqPos = cookie.indexOf('=');
            if (eqPos > 0) {
                cookies[cookie.substring(0, eqPos)] = cookie.substring(eqPos + 1);
            }
        }
        return cookies;
    }

    async function exportIndexedDB() {
        if (!indexedDB.databases) return {};

        try {
            var databases = await indexedDB.databases();
            var result = {};

            for (var i = 0; i < databases.length; i++) {
                var dbInfo = databases[i];
                if (!dbInfo.name) continue;

                try {
                    var db = await new Promise(function(resolve, reject) {
                        var req = indexedDB.open(dbInfo.name);
                        req.onsuccess = function() { resolve(req.result); };
                        req.onerror = function() { reject(req.error); };
                    });

                    result[dbInfo.name] = {
                        version: db.version,
                        stores: {}
                    };

                    var storeNames = Array.from(db.objectStoreNames);

                    for (var j = 0; j < storeNames.length; j++) {
                        var storeName = storeNames[j];
                        try {
                            var tx = db.transaction(storeName, 'readonly');
                            var store = tx.objectStore(storeName);

                            // Lấy metadata của store
                            var storeInfo = {
                                keyPath: store.keyPath,
                                autoIncrement: store.autoIncrement,
                                indexes: [],
                                data: []
                            };

                            // Lấy thông tin indexes
                            var indexNames = Array.from(store.indexNames);
                            for (var k = 0; k < indexNames.length; k++) {
                                var idx = store.index(indexNames[k]);
                                storeInfo.indexes.push({
                                    name: idx.name,
                                    keyPath: idx.keyPath,
                                    unique: idx.unique,
                                    multiEntry: idx.multiEntry
                                });
                            }

                            // Lấy data với keys bằng cursor
                            var allData = await new Promise(function(resolve, reject) {
                                var items = [];
                                var cursorReq = store.openCursor();
                                cursorReq.onsuccess = function(e) {
                                    var cursor = e.target.result;
                                    if (cursor) {
                                        items.push({
                                            key: cursor.key,
                                            value: cursor.value
                                        });
                                        cursor.continue();
                                    } else {
                                        resolve(items);
                                    }
                                };
                                cursorReq.onerror = function() { reject(cursorReq.error); };
                            });

                            storeInfo.data = allData;
                            result[dbInfo.name].stores[storeName] = storeInfo;
                        } catch (e) {
                            console.warn('Export store error:', storeName, e);
                        }
                    }
                    db.close();
                } catch (e) {
                    console.warn('Export DB error:', dbInfo.name, e);
                }
            }
            return result;
        } catch (e) {
            console.warn('Export IndexedDB error:', e);
            return {};
        }
    }

    async function exportCacheStorage() {
        if (!('caches' in window)) return {};

        try {
            var cacheNames = await caches.keys();
            var result = {};

            for (var i = 0; i < cacheNames.length; i++) {
                var cacheName = cacheNames[i];
                try {
                    var cache = await caches.open(cacheName);
                    var requests = await cache.keys();

                    result[cacheName] = [];

                    for (var j = 0; j < requests.length; j++) {
                        var request = requests[j];
                        try {
                            var response = await cache.match(request);
                            if (!response) continue;

                            // Xác định loại content
                            var contentType = response.headers.get('content-type') || '';
                            var body;
                            var bodyType;

                            if (contentType.includes('image') ||
                                contentType.includes('audio') ||
                                contentType.includes('video') ||
                                contentType.includes('application/octet-stream')) {
                                // Binary data - convert to base64
                                var arrayBuffer = await response.clone().arrayBuffer();
                                body = uint8ToBase64(new Uint8Array(arrayBuffer));
                                bodyType = 'base64';
                            } else {
                                // Text data
                                body = await response.clone().text();
                                bodyType = 'text';
                            }

                            // Lấy headers
                            var headers = {};
                            response.headers.forEach(function(value, key) {
                                headers[key] = value;
                            });

                            result[cacheName].push({
                                url: request.url,
                                method: request.method,
                                headers: headers,
                                body: body,
                                bodyType: bodyType,
                                status: response.status,
                                statusText: response.statusText
                            });
                        } catch (e) {
                            console.warn('Export cache item error:', request.url, e);
                        }
                    }
                } catch (e) {
                    console.warn('Export cache error:', cacheName, e);
                }
            }
            return result;
        } catch (e) {
            console.warn('Export CacheStorage error:', e);
            return {};
        }
    }

    async function exportServiceWorkers() {
        if (!('serviceWorker' in navigator)) return {};

        try {
            var registrations = await navigator.serviceWorker.getRegistrations();
            var result = [];

            for (var i = 0; i < registrations.length; i++) {
                var reg = registrations[i];
                var swInfo = {
                    scope: reg.scope,
                    updateViaCache: reg.updateViaCache
                };

                if (reg.active) {
                    swInfo.active = {
                        scriptURL: reg.active.scriptURL,
                        state: reg.active.state
                    };
                }

                if (reg.waiting) {
                    swInfo.waiting = {
                        scriptURL: reg.waiting.scriptURL,
                        state: reg.waiting.state
                    };
                }

                if (reg.installing) {
                    swInfo.installing = {
                        scriptURL: reg.installing.scriptURL,
                        state: reg.installing.state
                    };
                }

                result.push(swInfo);
            }

            return result;
        } catch (e) {
            console.warn('Export ServiceWorkers error:', e);
            return {};
        }
    }

    async function exportAll() {
        return {
            _meta: {
                hostname: window.location.hostname,
                pathname: window.location.pathname,
                exportedAt: new Date().toISOString(),
                userAgent: navigator.userAgent,
                version: '4.0'
            },
            localStorage: exportLocalStorage(),
            sessionStorage: exportSessionStorage(),
            cookies: exportCookies(),
            indexedDB: await exportIndexedDB(),
            cacheStorage: await exportCacheStorage(),
            serviceWorkers: await exportServiceWorkers()
        };
    }

    // ==================== IMPORT FUNCTIONS ====================

    function importLocalStorage(data) {
        if (!data) return 0;
        var count = 0;
        for (var key in data) {
            try {
                localStorage.setItem(key, data[key]);
                count++;
            } catch (e) {
                console.warn('Import localStorage error:', key, e);
            }
        }
        return count;
    }

    function importSessionStorage(data) {
        if (!data) return 0;
        var count = 0;
        for (var key in data) {
            try {
                sessionStorage.setItem(key, data[key]);
                count++;
            } catch (e) {
                console.warn('Import sessionStorage error:', key, e);
            }
        }
        return count;
    }

    function importCookies(data) {
        if (!data) return 0;
        var count = 0;
        var expires = new Date();
        expires.setFullYear(expires.getFullYear() + 1);

        for (var name in data) {
            try {
                document.cookie = name + '=' + data[name] + '; expires=' + expires.toUTCString() + '; path=/';
                count++;
            } catch (e) {
                console.warn('Import cookie error:', name, e);
            }
        }
        return count;
    }

    async function importIndexedDB(data) {
        if (!data) return 0;
        var count = 0;

        for (var dbName in data) {
            var dbData = data[dbName];
            try {
                // Xóa DB cũ
                await new Promise(function(resolve) {
                    var req = indexedDB.deleteDatabase(dbName);
                    req.onsuccess = resolve;
                    req.onerror = resolve;
                    req.onblocked = resolve;
                });

                // Tạo DB mới
                var db = await new Promise(function(resolve, reject) {
                    var req = indexedDB.open(dbName, dbData.version || 1);

                    req.onupgradeneeded = function(e) {
                        var database = e.target.result;

                        for (var storeName in dbData.stores) {
                            var storeInfo = dbData.stores[storeName];

                            // Xác định options cho object store
                            var storeOptions = {};

                            if (storeInfo.keyPath !== null && storeInfo.keyPath !== undefined) {
                                storeOptions.keyPath = storeInfo.keyPath;
                            }

                            if (storeInfo.autoIncrement) {
                                storeOptions.autoIncrement = true;
                            }

                            // Nếu không có keyPath và không autoIncrement, đặt mặc định
                            if (!storeOptions.keyPath && !storeOptions.autoIncrement) {
                                storeOptions.autoIncrement = true;
                            }

                            var store = database.createObjectStore(storeName, storeOptions);

                            // Tạo indexes
                            if (storeInfo.indexes && storeInfo.indexes.length > 0) {
                                for (var i = 0; i < storeInfo.indexes.length; i++) {
                                    var idx = storeInfo.indexes[i];
                                    try {
                                        store.createIndex(idx.name, idx.keyPath, {
                                            unique: idx.unique || false,
                                            multiEntry: idx.multiEntry || false
                                        });
                                    } catch (e) {
                                        console.warn('Create index error:', idx.name, e);
                                    }
                                }
                            }
                        }
                    };

                    req.onsuccess = function() { resolve(req.result); };
                    req.onerror = function() { reject(req.error); };
                });

                // Import data vào từng store
                for (var storeName in dbData.stores) {
                    if (!db.objectStoreNames.contains(storeName)) continue;

                    var storeInfo = dbData.stores[storeName];
                    var tx = db.transaction(storeName, 'readwrite');
                    var store = tx.objectStore(storeName);

                    // Hỗ trợ cả format cũ và mới
                    var items = storeInfo.data || storeInfo;
                    if (!Array.isArray(items)) continue;

                    for (var i = 0; i < items.length; i++) {
                        try {
                            var item = items[i];

                            if (item && item.hasOwnProperty('key') && item.hasOwnProperty('value')) {
                                // Format mới với key/value
                                if (storeInfo.keyPath) {
                                    store.put(item.value);
                                } else {
                                    store.put(item.value, item.key);
                                }
                            } else {
                                // Format cũ - chỉ có value
                                store.add(item);
                            }
                            count++;
                        } catch (e) {
                            console.warn('Import IndexedDB item error:', e);
                        }
                    }

                    await new Promise(function(resolve) {
                        tx.oncomplete = resolve;
                        tx.onerror = resolve;
                    });
                }

                db.close();
            } catch (e) {
                console.warn('Import IndexedDB error:', dbName, e);
            }
        }

        return count;
    }

    async function importCacheStorage(data) {
        if (!data || !('caches' in window)) return 0;
        var count = 0;

        for (var cacheName in data) {
            try {
                // Xóa cache cũ
                await caches.delete(cacheName);

                // Tạo cache mới
                var cache = await caches.open(cacheName);
                var items = data[cacheName];

                for (var i = 0; i < items.length; i++) {
                    var item = items[i];
                    try {
                        var body;
                        if (item.bodyType === 'base64') {
                            // Convert base64 về binary
                            body = base64ToUint8(item.body);
                        } else {
                            body = item.body;
                        }

                        var response = new Response(body, {
                            status: item.status || 200,
                            statusText: item.statusText || 'OK',
                            headers: item.headers || {}
                        });

                        await cache.put(item.url, response);
                        count++;
                    } catch (e) {
                        console.warn('Import cache item error:', item.url, e);
                    }
                }
            } catch (e) {
                console.warn('Import cache error:', cacheName, e);
            }
        }

        return count;
    }

    function importServiceWorkers(data) {
        // Service Workers không thể được đăng ký lại từ userscript
        // Chỉ có thể hiển thị thông tin
        if (!data || data.length === 0) return 0;

        console.log('📋 Service Workers info (không thể tự động đăng ký):');
        for (var i = 0; i < data.length; i++) {
            var sw = data[i];
            console.log('  - Scope:', sw.scope);
            if (sw.active) {
                console.log('    Script:', sw.active.scriptURL);
            }
        }

        return data.length;
    }

    async function importFromJSON(jsonStr) {
        try {
            var data = JSON.parse(jsonStr);

            // Kiểm tra hostname
            if (data._meta && data._meta.hostname !== window.location.hostname) {
                if (!confirm(
                    '⚠️ Cảnh báo hostname khác nhau!\n\n' +
                    'Dữ liệu từ: ' + data._meta.hostname + '\n' +
                    'Trang này: ' + window.location.hostname + '\n\n' +
                    'Tiếp tục nhập?'
                )) {
                    return { success: false, error: 'Hủy bởi người dùng' };
                }
            }

            var results = {
                localStorage: importLocalStorage(data.localStorage),
                sessionStorage: importSessionStorage(data.sessionStorage),
                cookies: importCookies(data.cookies),
                indexedDB: await importIndexedDB(data.indexedDB),
                cacheStorage: await importCacheStorage(data.cacheStorage),
                serviceWorkers: importServiceWorkers(data.serviceWorkers)
            };

            var total = results.localStorage + results.sessionStorage +
                       results.cookies + results.indexedDB + results.cacheStorage;

            return {
                success: true,
                total: total,
                details: results
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    // ==================== PROCESS DATA ====================

    async function processExport(jsonData, password) {
        var jsonStr = JSON.stringify(jsonData);
        var originalSize = jsonStr.length;
        var finalData;
        var ext;
        var info = { original: originalSize };

        // Bước 1: Nén (nếu bật)
        if (settings.compress) {
            var compressed = await compress(jsonStr);
            if (compressed) {
                finalData = compressed;
                info.compressed = compressed.length;
            } else {
                finalData = new TextEncoder().encode(jsonStr);
                info.compressed = finalData.length;
            }
        } else {
            finalData = new TextEncoder().encode(jsonStr);
        }

        // Bước 2: Mã hóa (nếu bật)
        if (settings.encrypt && password) {
            finalData = await encrypt(finalData, password);
            info.encrypted = finalData.length;
            ext = '.enc';
        } else {
            ext = settings.compress ? '.gz' : '.json';
        }

        info.final = finalData.length;
        info.ext = ext;

        return { data: finalData, info: info, ext: ext };
    }

    async function processImport(fileData, filename, password) {
        var data = fileData;

        // Bước 1: Giải mã (nếu .enc)
        if (filename.endsWith('.enc')) {
            if (!password) throw new Error('Cần mật khẩu để giải mã!');
            data = await decrypt(new Uint8Array(data), password);
        }

        // Bước 2: Giải nén (nếu .gz hoặc sau khi giải mã)
        if (filename.endsWith('.gz') || filename.endsWith('.enc')) {
            var decompressed = await decompress(data instanceof Uint8Array ? data : new Uint8Array(data));
            if (decompressed) {
                return decompressed;
            }
        }

        // Bước 3: Decode text
        if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
            return new TextDecoder().decode(data);
        }

        return data;
    }

    // ==================== FILE FUNCTIONS ====================

    function downloadFile(content, filename) {
        var blob = new Blob([content], { type: 'application/octet-stream' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function pickFile(callback) {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.gz,.enc';
        input.onchange = function(e) {
            if (e.target.files.length > 0) {
                var file = e.target.files[0];
                var reader = new FileReader();
                reader.onload = function(ev) {
                    callback(ev.target.result, file.name);
                };
                reader.onerror = function() {
                    alert('❌ Không đọc được file!');
                };
                reader.readAsArrayBuffer(file);
            }
        };
        input.click();
    }

    // ==================== HANDLERS ====================

    async function handleExportAll() {
        var password = null;

        if (settings.encrypt) {
            password = prompt('🔐 Tạo mật khẩu bảo vệ (tối thiểu 4 ký tự):');
            if (!password || password.length < 4) {
                alert('❌ Mật khẩu phải có ít nhất 4 ký tự!');
                return;
            }
            var confirmPass = prompt('🔐 Nhập lại mật khẩu để xác nhận:');
            if (password !== confirmPass) {
                alert('❌ Mật khẩu không khớp!');
                return;
            }
        }

        try {
            var jsonData = await exportAll();
            var result = await processExport(jsonData, password);

            var timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            var filename = 'storage-' + window.location.hostname + '-' + timestamp + result.ext;
            downloadFile(result.data, filename);

            var msg = '✅ Đã xuất thành công!\n\n';
            msg += '📁 File: ' + filename + '\n\n';
            msg += '📊 Thống kê:\n';
            msg += '├ Gốc: ' + (result.info.original / 1024).toFixed(2) + ' KB\n';

            if (settings.compress) {
                msg += '├ Sau nén: ' + (result.info.compressed / 1024).toFixed(2) + ' KB\n';
            }

            if (settings.encrypt) {
                msg += '├ Sau mã hóa: ' + (result.info.final / 1024).toFixed(2) + ' KB\n';
            }

            var ratio = ((1 - result.info.final / result.info.original) * 100).toFixed(1);
            msg += '└ Giảm: ' + ratio + '%';

            alert(msg);
        } catch (e) {
            alert('❌ Lỗi xuất dữ liệu: ' + e.message);
            console.error('Export error:', e);
        }
    }

    async function handleExportSingle(type) {
        var password = null;

        if (settings.encrypt) {
            password = prompt('🔐 Tạo mật khẩu bảo vệ:');
            if (!password || password.length < 4) {
                alert('❌ Mật khẩu phải có ít nhất 4 ký tự!');
                return;
            }
        }

        try {
            var data;
            switch (type) {
                case 'localStorage':
                    data = exportLocalStorage();
                    break;
                case 'sessionStorage':
                    data = exportSessionStorage();
                    break;
                case 'cookies':
                    data = exportCookies();
                    break;
                case 'indexedDB':
                    data = await exportIndexedDB();
                    break;
                case 'cacheStorage':
                    data = await exportCacheStorage();
                    break;
                case 'serviceWorkers':
                    data = await exportServiceWorkers();
                    break;
            }

            var result = await processExport(data, password);
            var timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            var filename = type + '-' + window.location.hostname + '-' + timestamp + result.ext;
            downloadFile(result.data, filename);

            alert('✅ Đã xuất ' + type + '!\n📁 ' + filename);
        } catch (e) {
            alert('❌ Lỗi: ' + e.message);
            console.error('Export single error:', e);
        }
    }

    async function handleCopyAll() {
        if (isMobile()) {
            alert('⚠️ Trên điện thoại, nên sử dụng "Tải File" để tránh mất dữ liệu!');
        }

        var password = null;
        if (settings.encrypt) {
            password = prompt('🔐 Tạo mật khẩu bảo vệ:');
            if (!password || password.length < 4) {
                alert('❌ Mật khẩu phải có ít nhất 4 ký tự!');
                return;
            }
        }

        try {
            var jsonData = await exportAll();
            var result = await processExport(jsonData, password);
            var base64 = uint8ToBase64(result.data);

            GM_setClipboard(base64);

            var sizeKB = (base64.length / 1024).toFixed(2);
            alert('✅ Đã copy vào clipboard!\n\n📊 Kích thước: ' + sizeKB + ' KB\n\n💡 Dán vào chat hoặc lưu vào file text.');
        } catch (e) {
            alert('❌ Lỗi: ' + e.message);
            console.error('Copy error:', e);
        }
    }

    function handleImportFile() {
        pickFile(async function(content, filename) {
            try {
                var password = null;
                if (filename.endsWith('.enc')) {
                    password = prompt('🔐 Nhập mật khẩu để giải mã:');
                    if (!password) {
                        alert('❌ Cần mật khẩu để mở file mã hóa!');
                        return;
                    }
                }

                var jsonStr = await processImport(content, filename, password);
                var result = await importFromJSON(jsonStr);

                if (result.success) {
                    var msg = '✅ Nhập dữ liệu thành công!\n\n';
                    msg += '📊 Chi tiết:\n';
                    msg += '├ localStorage: ' + result.details.localStorage + ' items\n';
                    msg += '├ sessionStorage: ' + result.details.sessionStorage + ' items\n';
                    msg += '├ cookies: ' + result.details.cookies + ' items\n';
                    msg += '├ IndexedDB: ' + result.details.indexedDB + ' items\n';
                    msg += '├ Cache Storage: ' + result.details.cacheStorage + ' items\n';
                    msg += '└ Service Workers: ' + result.details.serviceWorkers + ' (chỉ info)\n\n';
                    msg += '📦 Tổng cộng: ' + result.total + ' items';

                    if (confirm(msg + '\n\n🔄 Reload trang để áp dụng?')) {
                        location.reload();
                    }
                } else {
                    alert('❌ Lỗi nhập dữ liệu: ' + result.error);
                }
            } catch (e) {
                alert('❌ Lỗi: ' + e.message);
                console.error('Import file error:', e);
            }
        });
    }

    function handleImportPaste() {
        var input = prompt('📥 Dán dữ liệu vào đây (JSON hoặc Base64):');
        if (!input || !input.trim()) return;

        input = input.trim();

        (async function() {
            try {
                var jsonStr;

                // Thử parse JSON trực tiếp
                try {
                    JSON.parse(input);
                    jsonStr = input;
                } catch (e) {
                    // Không phải JSON, thử decode Base64
                    var data = base64ToUint8(input);

                    // Hỏi password nếu cần
                    var password = prompt('🔐 Nhập mật khẩu (bỏ trống nếu không mã hóa):');

                    if (password && password.length > 0) {
                        data = await decrypt(data, password);
                    }

                    // Thử giải nén
                    var decompressed = await decompress(data);
                    if (decompressed) {
                        jsonStr = decompressed;
                    } else {
                        jsonStr = new TextDecoder().decode(data);
                    }
                }

                var result = await importFromJSON(jsonStr);

                if (result.success) {
                    var msg = '✅ Nhập thành công: ' + result.total + ' items';

                    if (confirm(msg + '\n\n🔄 Reload trang?')) {
                        location.reload();
                    }
                } else {
                    alert('❌ Lỗi: ' + result.error);
                }
            } catch (e) {
                alert('❌ Lỗi xử lý dữ liệu: ' + e.message);
                console.error('Import paste error:', e);
            }
        })();
    }

    async function handleView() {
        var ls = localStorage.length;
        var ss = sessionStorage.length;
        var ck = document.cookie.split(';').filter(function(c) { return c.trim(); }).length;

        var idbCount = 0;
        var idbNames = [];
        try {
            if (indexedDB.databases) {
                var dbs = await indexedDB.databases();
                idbCount = dbs.length;
                idbNames = dbs.map(function(db) { return db.name; });
            }
        } catch (e) {}

        var cacheCount = 0;
        var cacheNames = [];
        try {
            if ('caches' in window) {
                cacheNames = await caches.keys();
                cacheCount = cacheNames.length;
            }
        } catch (e) {}

        var swCount = 0;
        try {
            if ('serviceWorker' in navigator) {
                var regs = await navigator.serviceWorker.getRegistrations();
                swCount = regs.length;
            }
        } catch (e) {}

        var msg = '📊 Storage của ' + window.location.hostname + '\n\n';
        msg += '📦 localStorage: ' + ls + ' items\n';
        msg += '📋 sessionStorage: ' + ss + ' items\n';
        msg += '🍪 cookies: ' + ck + ' items\n';
        msg += '🗄️ IndexedDB: ' + idbCount + ' databases';
        if (idbNames.length > 0) {
            msg += '\n   └ ' + idbNames.join(', ');
        }
        msg += '\n📦 Cache Storage: ' + cacheCount + ' caches';
        if (cacheNames.length > 0) {
            msg += '\n   └ ' + cacheNames.join(', ');
        }
        msg += '\n⚙️ Service Workers: ' + swCount + ' registrations';

        alert(msg);
    }

    async function handleClear() {
        var choice = prompt(
            '🗑️ Chọn loại dữ liệu cần xóa:\n\n' +
            '1 - localStorage\n' +
            '2 - sessionStorage\n' +
            '3 - cookies\n' +
            '4 - IndexedDB\n' +
            '5 - Cache Storage\n' +
            '6 - Service Workers\n' +
            '7 - ⚠️ Tất cả\n' +
            '0 - Hủy'
        );

        if (choice === '1') {
            localStorage.clear();
            alert('✅ Đã xóa localStorage');
        }
        else if (choice === '2') {
            sessionStorage.clear();
            alert('✅ Đã xóa sessionStorage');
        }
        else if (choice === '3') {
            document.cookie.split(';').forEach(function(c) {
                var name = c.split('=')[0].trim();
                document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
            });
            alert('✅ Đã xóa cookies');
        }
        else if (choice === '4') {
            if (confirm('⚠️ Xóa tất cả IndexedDB databases?')) {
                try {
                    var dbs = await indexedDB.databases();
                    for (var i = 0; i < dbs.length; i++) {
                        indexedDB.deleteDatabase(dbs[i].name);
                    }
                    alert('✅ Đã xóa IndexedDB');
                } catch (e) {
                    alert('❌ Lỗi: ' + e.message);
                }
            }
        }
        else if (choice === '5') {
            if (confirm('⚠️ Xóa tất cả Cache Storage?')) {
                try {
                    var cacheNames = await caches.keys();
                    for (var i = 0; i < cacheNames.length; i++) {
                        await caches.delete(cacheNames[i]);
                    }
                    alert('✅ Đã xóa Cache Storage');
                } catch (e) {
                    alert('❌ Lỗi: ' + e.message);
                }
            }
        }
        else if (choice === '6') {
            if (confirm('⚠️ Hủy đăng ký tất cả Service Workers?')) {
                try {
                    var regs = await navigator.serviceWorker.getRegistrations();
                    for (var i = 0; i < regs.length; i++) {
                        await regs[i].unregister();
                    }
                    alert('✅ Đã hủy đăng ký Service Workers');
                } catch (e) {
                    alert('❌ Lỗi: ' + e.message);
                }
            }
        }
        else if (choice === '7') {
            if (confirm('⚠️ XÓA TẤT CẢ dữ liệu?\n\nHành động này không thể hoàn tác!')) {
                try {
                    // localStorage
                    localStorage.clear();

                    // sessionStorage
                    sessionStorage.clear();

                    // Cookies
                    document.cookie.split(';').forEach(function(c) {
                        var name = c.split('=')[0].trim();
                        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
                    });

                    // IndexedDB
                    if (indexedDB.databases) {
                        var dbs = await indexedDB.databases();
                        for (var i = 0; i < dbs.length; i++) {
                            indexedDB.deleteDatabase(dbs[i].name);
                        }
                    }

                    // Cache Storage
                    if ('caches' in window) {
                        var cacheNames = await caches.keys();
                        for (var i = 0; i < cacheNames.length; i++) {
                            await caches.delete(cacheNames[i]);
                        }
                    }

                    // Service Workers
                    if ('serviceWorker' in navigator) {
                        var regs = await navigator.serviceWorker.getRegistrations();
                        for (var i = 0; i < regs.length; i++) {
                            await regs[i].unregister();
                        }
                    }

                    alert('✅ Đã xóa tất cả dữ liệu!');
                } catch (e) {
                    alert('❌ Lỗi: ' + e.message);
                }
            }
        }
    }

    // ==================== UI ====================

    function createUI() {
        GM_addStyle('\
            #sb-btn {\
                position: fixed;\
                width: 48px;\
                height: 48px;\
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\
                border: none;\
                border-radius: 50%;\
                color: white;\
                font-size: 20px;\
                z-index: 2147483647;\
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);\
                display: flex;\
                align-items: center;\
                justify-content: center;\
                touch-action: none;\
                user-select: none;\
                cursor: pointer;\
                transition: transform 0.2s, box-shadow 0.2s;\
            }\
            #sb-btn:hover {\
                transform: scale(1.1);\
                box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);\
            }\
            #sb-btn.dragging {\
                opacity: 0.9;\
                transform: scale(1.15);\
            }\
            #sb-menu {\
                position: fixed;\
                background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);\
                border-radius: 16px;\
                padding: 16px;\
                z-index: 2147483646;\
                box-shadow: 0 10px 40px rgba(0,0,0,0.5);\
                display: none;\
                min-width: 280px;\
                max-width: 320px;\
                max-height: 85vh;\
                overflow-y: auto;\
                border: 1px solid rgba(255,255,255,0.1);\
            }\
            #sb-menu.show {\
                display: block;\
                animation: sb-fadeIn 0.2s ease;\
            }\
            @keyframes sb-fadeIn {\
                from { opacity: 0; transform: translateY(-10px); }\
                to { opacity: 1; transform: translateY(0); }\
            }\
            #sb-menu::-webkit-scrollbar {\
                width: 6px;\
            }\
            #sb-menu::-webkit-scrollbar-track {\
                background: rgba(255,255,255,0.05);\
                border-radius: 3px;\
            }\
            #sb-menu::-webkit-scrollbar-thumb {\
                background: rgba(255,255,255,0.2);\
                border-radius: 3px;\
            }\
            .sb-title {\
                color: #fff;\
                font-size: 16px;\
                font-weight: bold;\
                margin-bottom: 16px;\
                text-align: center;\
                display: flex;\
                align-items: center;\
                justify-content: center;\
                gap: 8px;\
            }\
            .sb-version {\
                font-size: 11px;\
                color: #888;\
                font-weight: normal;\
            }\
            .sb-toggles {\
                background: rgba(255,255,255,0.05);\
                border-radius: 12px;\
                padding: 12px;\
                margin-bottom: 16px;\
            }\
            .sb-toggle {\
                display: flex;\
                align-items: center;\
                justify-content: space-between;\
                padding: 10px 0;\
                color: #fff;\
                font-size: 13px;\
            }\
            .sb-toggle:not(:last-child) {\
                border-bottom: 1px solid rgba(255,255,255,0.1);\
            }\
            .sb-toggle-label {\
                display: flex;\
                align-items: center;\
                gap: 8px;\
            }\
            .sb-switch {\
                position: relative;\
                width: 46px;\
                height: 26px;\
                background: #444;\
                border-radius: 13px;\
                cursor: pointer;\
                transition: background 0.3s;\
            }\
            .sb-switch.on {\
                background: linear-gradient(135deg, #667eea, #764ba2);\
            }\
            .sb-switch::after {\
                content: "";\
                position: absolute;\
                top: 3px;\
                left: 3px;\
                width: 20px;\
                height: 20px;\
                background: white;\
                border-radius: 50%;\
                transition: transform 0.3s;\
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);\
            }\
            .sb-switch.on::after {\
                transform: translateX(20px);\
            }\
            .sb-section {\
                margin-bottom: 12px;\
            }\
            .sb-section-title {\
                color: #888;\
                font-size: 11px;\
                text-transform: uppercase;\
                letter-spacing: 1px;\
                margin-bottom: 8px;\
                padding-left: 4px;\
            }\
            .sb-btn-menu {\
                display: flex;\
                align-items: center;\
                gap: 10px;\
                width: 100%;\
                padding: 12px 14px;\
                margin: 4px 0;\
                background: rgba(255,255,255,0.05);\
                border: 1px solid rgba(255,255,255,0.08);\
                border-radius: 10px;\
                color: white;\
                font-size: 13px;\
                text-align: left;\
                cursor: pointer;\
                transition: all 0.2s;\
            }\
            .sb-btn-menu:hover {\
                background: rgba(255,255,255,0.1);\
                border-color: rgba(255,255,255,0.15);\
                transform: translateX(4px);\
            }\
            .sb-btn-menu:active {\
                background: rgba(255,255,255,0.15);\
            }\
            .sb-btn-menu.warn {\
                color: #ffa726;\
                border-color: rgba(255,167,38,0.3);\
            }\
            .sb-btn-menu.danger {\
                color: #ef5350;\
                border-color: rgba(239,83,80,0.3);\
            }\
            .sb-btn-menu .sb-icon {\
                font-size: 16px;\
                width: 24px;\
                text-align: center;\
            }\
            .sb-warning {\
                background: linear-gradient(135deg, rgba(255,167,38,0.2), rgba(255,167,38,0.1));\
                color: #ffa726;\
                font-size: 12px;\
                padding: 10px 12px;\
                border-radius: 10px;\
                margin-bottom: 12px;\
                text-align: center;\
                border: 1px solid rgba(255,167,38,0.3);\
            }\
            .sb-divider {\
                height: 1px;\
                background: rgba(255,255,255,0.1);\
                margin: 12px 0;\
            }\
        ');

        // Button
        var btn = document.createElement('button');
        btn.id = 'sb-btn';
        btn.innerHTML = '💾';
        btn.title = 'Storage Backup & Restore';
        document.body.appendChild(btn);

        // Menu
        var menu = document.createElement('div');
        menu.id = 'sb-menu';

        function renderMenu() {
            menu.innerHTML = '';

            // Title
            var title = document.createElement('div');
            title.className = 'sb-title';
            title.innerHTML = '💾 Storage Backup <span class="sb-version">v4.0</span>';
            menu.appendChild(title);

            // Warning mobile
            if (isMobile()) {
                var warn = document.createElement('div');
                warn.className = 'sb-warning';
                warn.innerHTML = '📱 Đang dùng điện thoại - Nên tải file thay vì copy!';
                menu.appendChild(warn);
            }

            // Toggles
            var toggles = document.createElement('div');
            toggles.className = 'sb-toggles';

            // Toggle Nén
            var toggleCompress = document.createElement('div');
            toggleCompress.className = 'sb-toggle';
            var labelCompress = document.createElement('div');
            labelCompress.className = 'sb-toggle-label';
            labelCompress.innerHTML = '<span>🗜️</span><span>Nén GZIP</span>';
            toggleCompress.appendChild(labelCompress);

            var switchCompress = document.createElement('div');
            switchCompress.className = 'sb-switch' + (settings.compress ? ' on' : '');
            switchCompress.onclick = function() {
                settings.compress = !settings.compress;
                saveSettings();
                this.classList.toggle('on');
            };
            toggleCompress.appendChild(switchCompress);
            toggles.appendChild(toggleCompress);

            // Toggle Mã hóa
            var toggleEncrypt = document.createElement('div');
            toggleEncrypt.className = 'sb-toggle';
            var labelEncrypt = document.createElement('div');
            labelEncrypt.className = 'sb-toggle-label';
            labelEncrypt.innerHTML = '<span>🔐</span><span>Mã hóa AES-256</span>';
            toggleEncrypt.appendChild(labelEncrypt);

            var switchEncrypt = document.createElement('div');
            switchEncrypt.className = 'sb-switch' + (settings.encrypt ? ' on' : '');
            switchEncrypt.onclick = function() {
                settings.encrypt = !settings.encrypt;
                saveSettings();
                this.classList.toggle('on');
            };
            toggleEncrypt.appendChild(switchEncrypt);
            toggles.appendChild(toggleEncrypt);

            menu.appendChild(toggles);

            // Section: Xuất
            var secExport = document.createElement('div');
            secExport.className = 'sb-section';

            var secExportTitle = document.createElement('div');
            secExportTitle.className = 'sb-section-title';
            secExportTitle.textContent = '📤 Xuất dữ liệu';
            secExport.appendChild(secExportTitle);

            var btnExportAll = document.createElement('button');
            btnExportAll.className = 'sb-btn-menu';
            btnExportAll.innerHTML = '<span class="sb-icon">💾</span><span>Tải file - Tất cả storage</span>';
            btnExportAll.onclick = function() {
                menu.classList.remove('show');
                handleExportAll();
            };
            secExport.appendChild(btnExportAll);

            var btnCopyAll = document.createElement('button');
            btnCopyAll.className = 'sb-btn-menu' + (isMobile() ? ' warn' : '');
            btnCopyAll.innerHTML = '<span class="sb-icon">📋</span><span>Copy clipboard' + (isMobile() ? ' ⚠️' : '') + '</span>';
            btnCopyAll.onclick = function() {
                menu.classList.remove('show');
                handleCopyAll();
            };
            secExport.appendChild(btnCopyAll);

            menu.appendChild(secExport);

            // Section: Xuất riêng
            var secSingle = document.createElement('div');
            secSingle.className = 'sb-section';

            var secSingleTitle = document.createElement('div');
            secSingleTitle.className = 'sb-section-title';
            secSingleTitle.textContent = '📂 Xuất riêng từng loại';
            secSingle.appendChild(secSingleTitle);

            var types = [
                { key: 'localStorage', icon: '📦', name: 'localStorage' },
                { key: 'sessionStorage', icon: '📋', name: 'sessionStorage' },
                { key: 'cookies', icon: '🍪', name: 'Cookies' },
                { key: 'indexedDB', icon: '🗄️', name: 'IndexedDB' },
                { key: 'cacheStorage', icon: '💽', name: 'Cache Storage' },
                { key: 'serviceWorkers', icon: '⚙️', name: 'Service Workers' }
            ];

            types.forEach(function(t) {
                var b = document.createElement('button');
                b.className = 'sb-btn-menu';
                b.innerHTML = '<span class="sb-icon">' + t.icon + '</span><span>' + t.name + '</span>';
                b.onclick = function() {
                    menu.classList.remove('show');
                    handleExportSingle(t.key);
                };
                secSingle.appendChild(b);
            });

            menu.appendChild(secSingle);

            // Section: Nhập
            var secImport = document.createElement('div');
            secImport.className = 'sb-section';

            var secImportTitle = document.createElement('div');
            secImportTitle.className = 'sb-section-title';
            secImportTitle.textContent = '📥 Nhập dữ liệu';
            secImport.appendChild(secImportTitle);

            var btnImportFile = document.createElement('button');
            btnImportFile.className = 'sb-btn-menu';
            btnImportFile.innerHTML = '<span class="sb-icon">📂</span><span>Chọn file (.json/.gz/.enc)</span>';
            btnImportFile.onclick = function() {
                menu.classList.remove('show');
                handleImportFile();
            };
            secImport.appendChild(btnImportFile);

            var btnImportPaste = document.createElement('button');
            btnImportPaste.className = 'sb-btn-menu';
            btnImportPaste.innerHTML = '<span class="sb-icon">📋</span><span>Dán từ clipboard</span>';
            btnImportPaste.onclick = function() {
                menu.classList.remove('show');
                handleImportPaste();
            };
            secImport.appendChild(btnImportPaste);

            menu.appendChild(secImport);

            // Divider
            var divider = document.createElement('div');
            divider.className = 'sb-divider';
            menu.appendChild(divider);

            // Section: Tiện ích
            var secUtil = document.createElement('div');
            secUtil.className = 'sb-section';

            var secUtilTitle = document.createElement('div');
            secUtilTitle.className = 'sb-section-title';
            secUtilTitle.textContent = '🛠️ Tiện ích';
            secUtil.appendChild(secUtilTitle);

            var btnView = document.createElement('button');
            btnView.className = 'sb-btn-menu';
            btnView.innerHTML = '<span class="sb-icon">👁️</span><span>Xem thống kê storage</span>';
            btnView.onclick = function() {
                menu.classList.remove('show');
                handleView();
            };
            secUtil.appendChild(btnView);

            var btnClear = document.createElement('button');
            btnClear.className = 'sb-btn-menu danger';
            btnClear.innerHTML = '<span class="sb-icon">🗑️</span><span>Xóa dữ liệu</span>';
            btnClear.onclick = function() {
                menu.classList.remove('show');
                handleClear();
            };
            secUtil.appendChild(btnClear);

            menu.appendChild(secUtil);
        }

        renderMenu();
        document.body.appendChild(menu);

        // Drag functionality
        var startX = 0, startY = 0, startLeft = 0, startTop = 0;
        var isDragging = false, hasDragged = false;

        var savedPos = GM_getValue('sb_btn_pos', null);
        if (savedPos) {
            btn.style.left = Math.min(savedPos.left, window.innerWidth - 48) + 'px';
            btn.style.top = Math.min(savedPos.top, window.innerHeight - 48) + 'px';
        } else {
            btn.style.right = '20px';
            btn.style.bottom = '100px';
        }

        function getPos(e) {
            if (e.touches && e.touches.length > 0) {
                return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
            return { x: e.clientX, y: e.clientY };
        }

        function dragStart(e) {
            var pos = getPos(e);
            startX = pos.x;
            startY = pos.y;
            var rect = btn.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            isDragging = true;
            hasDragged = false;
            btn.classList.add('dragging');
            e.preventDefault();
        }

        function dragMove(e) {
            if (!isDragging) return;
            var pos = getPos(e);
            var distance = Math.sqrt(Math.pow(pos.x - startX, 2) + Math.pow(pos.y - startY, 2));
            if (distance > 10) hasDragged = true;

            var newLeft = Math.max(0, Math.min(startLeft + pos.x - startX, window.innerWidth - 48));
            var newTop = Math.max(0, Math.min(startTop + pos.y - startY, window.innerHeight - 48));
            btn.style.left = newLeft + 'px';
            btn.style.top = newTop + 'px';
            btn.style.right = 'auto';
            btn.style.bottom = 'auto';
            e.preventDefault();
        }

        function dragEnd() {
            if (!isDragging) return;
            isDragging = false;
            btn.classList.remove('dragging');

            var rect = btn.getBoundingClientRect();
            GM_setValue('sb_btn_pos', { left: rect.left, top: rect.top });

            if (!hasDragged) {
                renderMenu();
                var menuRect = { width: 300, height: 500 };
                var left = Math.max(10, Math.min(rect.left, window.innerWidth - menuRect.width - 10));
                var top = rect.bottom + 10;

                if (top + menuRect.height > window.innerHeight) {
                    top = Math.max(10, rect.top - menuRect.height - 10);
                }

                menu.style.left = left + 'px';
                menu.style.top = top + 'px';
                menu.classList.toggle('show');
            }
        }

        btn.addEventListener('touchstart', dragStart, { passive: false });
        document.addEventListener('touchmove', dragMove, { passive: false });
        document.addEventListener('touchend', dragEnd);

        btn.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', dragMove);
        document.addEventListener('mouseup', dragEnd);

        // Close menu when clicking outside
        document.addEventListener('click', function(e) {
            if (!btn.contains(e.target) && !menu.contains(e.target)) {
                menu.classList.remove('show');
            }
        });

        // Close menu on escape
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                menu.classList.remove('show');
            }
        });
    }

    // ==================== INIT ====================

    GM_registerMenuCommand('💾 Storage Backup', function() {
        var btn = document.getElementById('sb-btn');
        if (btn) btn.click();
    });

    function init() {
        if (!document.body) {
            setTimeout(init, 100);
            return;
        }

        try {
            createUI();
            console.log('💾 Web Storage Backup v4.0 - Ready');
            console.log('📊 Supports: localStorage, sessionStorage, cookies, IndexedDB, Cache Storage, Service Workers');
        } catch (e) {
            console.error('Storage Backup init error:', e);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
