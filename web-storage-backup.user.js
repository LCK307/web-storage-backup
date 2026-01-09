// ==UserScript==
// @name         Web Storage Backup & Restore
// @namespace    https://github.com/LCK307/web-storage-backup
// @version      3.1
// @description  Xuất/Nhập localStorage, cookies, sessionStorage, IndexedDB với mã hóa AES-256-GCM
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

                    result[dbInfo.name] = { version: db.version, stores: {} };
                    var storeNames = Array.from(db.objectStoreNames);

                    for (var j = 0; j < storeNames.length; j++) {
                        try {
                            var tx = db.transaction(storeNames[j], 'readonly');
                            var store = tx.objectStore(storeNames[j]);
                            var storeData = await new Promise(function(resolve, reject) {
                                var req = store.getAll();
                                req.onsuccess = function() { resolve(req.result); };
                                req.onerror = function() { reject(req.error); };
                            });
                            result[dbInfo.name].stores[storeNames[j]] = storeData;
                        } catch (e) {}
                    }
                    db.close();
                } catch (e) {}
            }
            return result;
        } catch (e) {
            return {};
        }
    }

    async function exportAll() {
        return {
            _meta: {
                hostname: window.location.hostname,
                exportedAt: new Date().toISOString(),
                version: '3.1'
            },
            localStorage: exportLocalStorage(),
            sessionStorage: exportSessionStorage(),
            cookies: exportCookies(),
            indexedDB: await exportIndexedDB()
        };
    }

    // ==================== IMPORT FUNCTIONS ====================

    function importLocalStorage(data) {
        if (!data) return 0;
        var count = 0;
        for (var key in data) {
            try { localStorage.setItem(key, data[key]); count++; } catch (e) {}
        }
        return count;
    }

    function importSessionStorage(data) {
        if (!data) return 0;
        var count = 0;
        for (var key in data) {
            try { sessionStorage.setItem(key, data[key]); count++; } catch (e) {}
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
            } catch (e) {}
        }
        return count;
    }

    async function importIndexedDB(data) {
        if (!data) return 0;
        var count = 0;

        for (var dbName in data) {
            var dbData = data[dbName];
            try {
                await new Promise(function(r) {
                    var req = indexedDB.deleteDatabase(dbName);
                    req.onsuccess = r; req.onerror = r; req.onblocked = r;
                });

                var db = await new Promise(function(resolve, reject) {
                    var req = indexedDB.open(dbName, dbData.version || 1);
                    req.onupgradeneeded = function(e) {
                        var database = e.target.result;
                        for (var storeName in dbData.stores) {
                            if (!database.objectStoreNames.contains(storeName)) {
                                database.createObjectStore(storeName, { autoIncrement: true });
                            }
                        }
                    };
                    req.onsuccess = function() { resolve(req.result); };
                    req.onerror = function() { reject(req.error); };
                });

                for (var storeName in dbData.stores) {
                    if (!db.objectStoreNames.contains(storeName)) continue;
                    var tx = db.transaction(storeName, 'readwrite');
                    var store = tx.objectStore(storeName);
                    var items = dbData.stores[storeName];
                    for (var i = 0; i < items.length; i++) {
                        try { store.add(items[i]); count++; } catch (e) {}
                    }
                    await new Promise(function(r) { tx.oncomplete = r; tx.onerror = r; });
                }
                db.close();
            } catch (e) {}
        }
        return count;
    }

    async function importFromJSON(jsonStr) {
        try {
            var data = JSON.parse(jsonStr);

            if (data._meta && data._meta.hostname !== window.location.hostname) {
                if (!confirm('Dữ liệu từ: ' + data._meta.hostname + '\nTrang này: ' + window.location.hostname + '\n\nTiếp tục?')) {
                    return { success: false, error: 'Hủy bởi người dùng' };
                }
            }

            var total = importLocalStorage(data.localStorage) +
                        importSessionStorage(data.sessionStorage) +
                        importCookies(data.cookies) +
                        await importIndexedDB(data.indexedDB);

            return { success: true, total: total };
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
            if (!password) throw new Error('Cần mật khẩu!');
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
                reader.onload = function(ev) { callback(ev.target.result, file.name); };
                reader.onerror = function() { alert('Không đọc được file!'); };
                reader.readAsArrayBuffer(file);
            }
        };
        input.click();
    }

    // ==================== HANDLERS ====================

    async function handleExportAll() {
        var password = null;

        if (settings.encrypt) {
            password = prompt('🔐 Tạo mật khẩu (tối thiểu 4 ký tự):');
            if (!password || password.length < 4) {
                alert('❌ Mật khẩu phải có ít nhất 4 ký tự!');
                return;
            }
            var confirm = prompt('🔐 Nhập lại mật khẩu:');
            if (password !== confirm) {
                alert('❌ Mật khẩu không khớp!');
                return;
            }
        }

        try {
            var jsonData = await exportAll();
            var result = await processExport(jsonData, password);

            var filename = 'storage-' + window.location.hostname + '-' + Date.now() + result.ext;
            downloadFile(result.data, filename);

            var msg = '✅ Đã tải: ' + filename + '\n\n';
            msg += '📦 Gốc: ' + (result.info.original / 1024).toFixed(1) + ' KB\n';
            if (settings.compress) {
                msg += '🗜️ Sau nén: ' + (result.info.compressed / 1024).toFixed(1) + ' KB\n';
            }
            if (settings.encrypt) {
                msg += '🔐 Sau mã hóa: ' + (result.info.final / 1024).toFixed(1) + ' KB\n';
            }
            var ratio = ((1 - result.info.final / result.info.original) * 100).toFixed(1);
            msg += '📉 Giảm: ' + ratio + '%';

            alert(msg);
        } catch (e) {
            alert('❌ Lỗi: ' + e.message);
        }
    }

    async function handleExportSingle(type) {
        var password = null;

        if (settings.encrypt) {
            password = prompt('🔐 Tạo mật khẩu:');
            if (!password || password.length < 4) return;
        }

        try {
            var data;
            switch (type) {
                case 'localStorage': data = exportLocalStorage(); break;
                case 'sessionStorage': data = exportSessionStorage(); break;
                case 'cookies': data = exportCookies(); break;
                case 'indexedDB': data = await exportIndexedDB(); break;
            }

            var result = await processExport(data, password);
            var filename = type + '-' + window.location.hostname + '-' + Date.now() + result.ext;
            downloadFile(result.data, filename);
            alert('✅ Đã tải: ' + filename);
        } catch (e) {
            alert('❌ Lỗi: ' + e.message);
        }
    }

    async function handleCopyAll() {
        if (isMobile()) {
            alert('⚠️ Điện thoại nên dùng "Tải File"!');
        }

        var password = null;
        if (settings.encrypt) {
            password = prompt('🔐 Tạo mật khẩu:');
            if (!password || password.length < 4) return;
        }

        try {
            var jsonData = await exportAll();
            var result = await processExport(jsonData, password);
            var base64 = uint8ToBase64(result.data);
            GM_setClipboard(base64);
            alert('✅ Đã copy! (' + (base64.length / 1024).toFixed(1) + ' KB)');
        } catch (e) {
            alert('❌ Lỗi: ' + e.message);
        }
    }

    function handleImportFile() {
        pickFile(async function(content, filename) {
            try {
                var password = null;
                if (filename.endsWith('.enc')) {
                    password = prompt('🔐 Nhập mật khẩu:');
                    if (!password) return;
                }

                var jsonStr = await processImport(content, filename, password);
                var result = await importFromJSON(jsonStr);

                if (result.success) {
                    if (confirm('✅ Đã nhập ' + result.total + ' items!\n\n🔄 Reload trang?')) {
                        location.reload();
                    }
                } else {
                    alert('❌ Lỗi: ' + result.error);
                }
            } catch (e) {
                alert('❌ Lỗi: ' + e.message);
            }
        });
    }

    function handleImportPaste() {
        var input = prompt('📥 Dán dữ liệu (JSON hoặc Base64):');
        if (!input) return;

        (async function() {
            try {
                var jsonStr;

                // Thử parse JSON trước
                try {
                    JSON.parse(input);
                    jsonStr = input;
                } catch (e) {
                    // Thử decode Base64
                    var data = base64ToUint8(input.trim());

                    // Kiểm tra có mã hóa không (hỏi password)
                    var password = prompt('🔐 Nhập mật khẩu (bỏ trống nếu không mã hóa):');

                    if (password) {
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
                    if (confirm('✅ Đã nhập ' + result.total + ' items!\n\n🔄 Reload?')) {
                        location.reload();
                    }
                } else {
                    alert('❌ Lỗi: ' + result.error);
                }
            } catch (e) {
                alert('❌ Lỗi: ' + e.message);
            }
        })();
    }

    function handleView() {
        var ls = localStorage.length;
        var ss = sessionStorage.length;
        var ck = document.cookie.split(';').filter(function(c) { return c.trim(); }).length;
        alert('📊 ' + window.location.hostname + '\n\n📦 localStorage: ' + ls + '\n📋 sessionStorage: ' + ss + '\n🍪 cookies: ' + ck);
    }

    function handleClear() {
        var choice = prompt('🗑️ Xóa:\n1 - localStorage\n2 - sessionStorage\n3 - cookies\n4 - Tất cả\n0 - Hủy');
        if (choice === '1') { localStorage.clear(); alert('✅ Đã xóa localStorage'); }
        else if (choice === '2') { sessionStorage.clear(); alert('✅ Đã xóa sessionStorage'); }
        else if (choice === '3') {
            document.cookie.split(';').forEach(function(c) {
                document.cookie = c.split('=')[0].trim() + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
            });
            alert('✅ Đã xóa cookies');
        }
        else if (choice === '4' && confirm('⚠️ Xóa tất cả?')) {
            localStorage.clear();
            sessionStorage.clear();
            document.cookie.split(';').forEach(function(c) {
                document.cookie = c.split('=')[0].trim() + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
            });
            alert('✅ Đã xóa!');
        }
    }

    // ==================== UI ====================

    function createUI() {
        GM_addStyle('\
            #sb-btn {\
                position: fixed;\
                width: 44px;\
                height: 44px;\
                background: linear-gradient(135deg, #667eea, #764ba2);\
                border: none;\
                border-radius: 50%;\
                color: white;\
                font-size: 18px;\
                z-index: 2147483647;\
                box-shadow: 0 2px 12px rgba(0,0,0,0.3);\
                display: flex;\
                align-items: center;\
                justify-content: center;\
                touch-action: none;\
                user-select: none;\
                cursor: pointer;\
            }\
            #sb-btn.dragging { opacity: 0.8; transform: scale(1.1); }\
            #sb-menu {\
                position: fixed;\
                background: #1a1a2e;\
                border-radius: 14px;\
                padding: 12px;\
                z-index: 2147483646;\
                box-shadow: 0 8px 30px rgba(0,0,0,0.5);\
                display: none;\
                min-width: 260px;\
                max-height: 80vh;\
                overflow-y: auto;\
            }\
            #sb-menu.show { display: block; }\
            .sb-title {\
                color: #fff;\
                font-size: 14px;\
                font-weight: bold;\
                margin-bottom: 12px;\
                text-align: center;\
            }\
            .sb-toggles {\
                background: #252540;\
                border-radius: 10px;\
                padding: 10px;\
                margin-bottom: 12px;\
            }\
            .sb-toggle {\
                display: flex;\
                align-items: center;\
                justify-content: space-between;\
                padding: 8px 0;\
                color: #fff;\
                font-size: 13px;\
            }\
            .sb-toggle:not(:last-child) { border-bottom: 1px solid #333; }\
            .sb-switch {\
                position: relative;\
                width: 44px;\
                height: 24px;\
                background: #444;\
                border-radius: 12px;\
                cursor: pointer;\
                transition: background 0.2s;\
            }\
            .sb-switch.on { background: #667eea; }\
            .sb-switch::after {\
                content: "";\
                position: absolute;\
                top: 2px;\
                left: 2px;\
                width: 20px;\
                height: 20px;\
                background: white;\
                border-radius: 50%;\
                transition: transform 0.2s;\
            }\
            .sb-switch.on::after { transform: translateX(20px); }\
            .sb-section {\
                margin-bottom: 10px;\
            }\
            .sb-section-title {\
                color: #888;\
                font-size: 10px;\
                text-transform: uppercase;\
                margin-bottom: 6px;\
                padding-left: 4px;\
            }\
            .sb-btn-menu {\
                display: block;\
                width: 100%;\
                padding: 10px 12px;\
                margin: 4px 0;\
                background: #2d2d4a;\
                border: none;\
                border-radius: 8px;\
                color: white;\
                font-size: 13px;\
                text-align: left;\
                cursor: pointer;\
                transition: background 0.15s;\
            }\
            .sb-btn-menu:hover { background: #3d3d5a; }\
            .sb-btn-menu:active { background: #4d4d6a; }\
            .sb-btn-menu.warn { color: #ffaa00; }\
            .sb-warning {\
                background: #3d2d1d;\
                color: #ffaa00;\
                font-size: 11px;\
                padding: 8px;\
                border-radius: 8px;\
                margin-bottom: 10px;\
                text-align: center;\
            }\
            .sb-sub {\
                font-size: 11px;\
                color: #888;\
                margin-left: 20px;\
            }\
        ');

        // Button
        var btn = document.createElement('button');
        btn.id = 'sb-btn';
        btn.textContent = '💾';
        document.body.appendChild(btn);

        // Menu
        var menu = document.createElement('div');
        menu.id = 'sb-menu';

        function renderMenu() {
            menu.innerHTML = '';

            // Title
            var title = document.createElement('div');
            title.className = 'sb-title';
            title.textContent = '💾 Storage Backup';
            menu.appendChild(title);

            // Warning mobile
            if (isMobile()) {
                var warn = document.createElement('div');
                warn.className = 'sb-warning';
                warn.textContent = '📱 Điện thoại - Nên tải file!';
                menu.appendChild(warn);
            }

            // Toggles
            var toggles = document.createElement('div');
            toggles.className = 'sb-toggles';

            // Toggle Nén
            var toggleCompress = document.createElement('div');
            toggleCompress.className = 'sb-toggle';
            toggleCompress.innerHTML = '<span>🗜️ Nén GZIP</span>';
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
            toggleEncrypt.innerHTML = '<span>🔐 Mã hóa AES-256</span>';
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
            btnExportAll.textContent = '💾 Tải file - Tất cả storage';
            btnExportAll.onclick = function() { menu.classList.remove('show'); handleExportAll(); };
            secExport.appendChild(btnExportAll);

            var btnCopyAll = document.createElement('button');
            btnCopyAll.className = 'sb-btn-menu' + (isMobile() ? ' warn' : '');
            btnCopyAll.textContent = '📋 Copy - Dán qua chat' + (isMobile() ? ' (⚠️)' : '');
            btnCopyAll.onclick = function() { menu.classList.remove('show'); handleCopyAll(); };
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
                { key: 'cookies', icon: '🍪', name: 'cookies' },
                { key: 'indexedDB', icon: '🗄️', name: 'IndexedDB' }
            ];

            types.forEach(function(t) {
                var b = document.createElement('button');
                b.className = 'sb-btn-menu';
                b.textContent = t.icon + ' ' + t.name;
                b.onclick = function() { menu.classList.remove('show'); handleExportSingle(t.key); };
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
            btnImportFile.textContent = '📂 Chọn file (.json / .gz / .enc)';
            btnImportFile.onclick = function() { menu.classList.remove('show'); handleImportFile(); };
            secImport.appendChild(btnImportFile);

            var btnImportPaste = document.createElement('button');
            btnImportPaste.className = 'sb-btn-menu';
            btnImportPaste.textContent = '📋 Dán từ clipboard';
            btnImportPaste.onclick = function() { menu.classList.remove('show'); handleImportPaste(); };
            secImport.appendChild(btnImportPaste);

            menu.appendChild(secImport);

            // Section: Tiện ích
            var secUtil = document.createElement('div');
            secUtil.className = 'sb-section';
            var secUtilTitle = document.createElement('div');
            secUtilTitle.className = 'sb-section-title';
            secUtilTitle.textContent = '⚙️ Tiện ích';
            secUtil.appendChild(secUtilTitle);

            var btnView = document.createElement('button');
            btnView.className = 'sb-btn-menu';
            btnView.textContent = '👁️ Xem số lượng dữ liệu';
            btnView.onclick = function() { menu.classList.remove('show'); handleView(); };
            secUtil.appendChild(btnView);

            var btnClear = document.createElement('button');
            btnClear.className = 'sb-btn-menu';
            btnClear.textContent = '🗑️ Xóa dữ liệu';
            btnClear.onclick = function() { menu.classList.remove('show'); handleClear(); };
            secUtil.appendChild(btnClear);

            menu.appendChild(secUtil);
        }

        renderMenu();
        document.body.appendChild(menu);

        // Drag
        var startX = 0, startY = 0, startLeft = 0, startTop = 0;
        var isDragging = false, hasDragged = false;

        var savedPos = GM_getValue('sb_btn_pos', null);
        if (savedPos) {
            btn.style.left = savedPos.left + 'px';
            btn.style.top = savedPos.top + 'px';
        } else {
            btn.style.right = '15px';
            btn.style.bottom = '80px';
        }

        function getPos(e) {
            return e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY };
        }

        function dragStart(e) {
            var pos = getPos(e);
            startX = pos.x; startY = pos.y;
            var rect = btn.getBoundingClientRect();
            startLeft = rect.left; startTop = rect.top;
            isDragging = true; hasDragged = false;
            btn.classList.add('dragging');
            e.preventDefault();
        }

        function dragMove(e) {
            if (!isDragging) return;
            var pos = getPos(e);
            if (Math.sqrt(Math.pow(pos.x - startX, 2) + Math.pow(pos.y - startY, 2)) > 10) hasDragged = true;
            var newLeft = Math.max(0, Math.min(startLeft + pos.x - startX, window.innerWidth - 44));
            var newTop = Math.max(0, Math.min(startTop + pos.y - startY, window.innerHeight - 44));
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
            GM_setValue('sb_btn_pos', { left: btn.getBoundingClientRect().left, top: btn.getBoundingClientRect().top });
            if (!hasDragged) {
                renderMenu();
                var rect = btn.getBoundingClientRect();
                var left = Math.max(10, Math.min(rect.left, window.innerWidth - 270));
                var top = rect.bottom + 10;
                if (top + 500 > window.innerHeight) top = Math.max(10, rect.top - 510);
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

        document.addEventListener('click', function(e) {
            if (!btn.contains(e.target) && !menu.contains(e.target)) {
                menu.classList.remove('show');
            }
        });
    }

    // ==================== INIT ====================

    GM_registerMenuCommand('💾 Mở Storage Backup', function() {
        document.getElementById('sb-btn').click();
    });

    function init() {
        if (!document.body) { setTimeout(init, 100); return; }
        try {
            createUI();
            console.log('💾 Storage Backup v3.1 Ready');
        } catch (e) {
            console.error('Storage Backup:', e);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
