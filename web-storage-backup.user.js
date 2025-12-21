// ==UserScript==
// @name         Web Storage Backup & Restore
// @namespace    https://github.com/YourUsername/web-storage-backup
// @version      2.2
// @description  Xuất/Nhập localStorage, cookies, IndexedDB với nút kéo thả
// @author       Your Name
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

    // ==================== EXPORT FUNCTIONS ====================

    function exportLocalStorage() {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            data[key] = localStorage.getItem(key);
        }
        return data;
    }

    function exportSessionStorage() {
        const data = {};
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            data[key] = sessionStorage.getItem(key);
        }
        return data;
    }

    function exportCookies() {
        const cookies = {};
        document.cookie.split(';').forEach(cookie => {
            const parts = cookie.trim().split('=');
            const name = parts[0];
            const value = parts.slice(1).join('=');
            if (name) {
                cookies[name] = value;
            }
        });
        return cookies;
    }

    async function exportIndexedDB() {
        if (!indexedDB.databases) return {};
        
        try {
            const databases = await indexedDB.databases();
            const result = {};

            for (const dbInfo of databases) {
                if (!dbInfo.name) continue;

                try {
                    const db = await new Promise((resolve, reject) => {
                        const request = indexedDB.open(dbInfo.name);
                        request.onsuccess = () => resolve(request.result);
                        request.onerror = () => reject(request.error);
                    });

                    result[dbInfo.name] = {
                        version: db.version,
                        stores: {}
                    };

                    const storeNames = Array.from(db.objectStoreNames);

                    for (const storeName of storeNames) {
                        try {
                            const tx = db.transaction(storeName, 'readonly');
                            const store = tx.objectStore(storeName);
                            const data = await new Promise((resolve, reject) => {
                                const request = store.getAll();
                                request.onsuccess = () => resolve(request.result);
                                request.onerror = () => reject(request.error);
                            });
                            result[dbInfo.name].stores[storeName] = data;
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
        const data = {
            _meta: {
                url: window.location.origin,
                hostname: window.location.hostname,
                exportedAt: new Date().toISOString()
            },
            localStorage: exportLocalStorage(),
            sessionStorage: exportSessionStorage(),
            cookies: exportCookies(),
            indexedDB: await exportIndexedDB()
        };

        return JSON.stringify(data, null, 2);
    }

    async function exportCompressed() {
        const data = await exportAll();
        try {
            return btoa(unescape(encodeURIComponent(data)));
        } catch (e) {
            return data;
        }
    }

    // ==================== IMPORT FUNCTIONS ====================

    function importLocalStorage(data) {
        if (!data || typeof data !== 'object') return 0;
        let count = 0;
        for (const key in data) {
            try {
                localStorage.setItem(key, data[key]);
                count++;
            } catch (e) {}
        }
        return count;
    }

    function importSessionStorage(data) {
        if (!data || typeof data !== 'object') return 0;
        let count = 0;
        for (const key in data) {
            try {
                sessionStorage.setItem(key, data[key]);
                count++;
            } catch (e) {}
        }
        return count;
    }

    function importCookies(data) {
        if (!data || typeof data !== 'object') return 0;
        let count = 0;
        for (const name in data) {
            try {
                const expires = new Date();
                expires.setFullYear(expires.getFullYear() + 1);
                document.cookie = name + '=' + data[name] + '; expires=' + expires.toUTCString() + '; path=/';
                count++;
            } catch (e) {}
        }
        return count;
    }

    async function importIndexedDB(data) {
        if (!data || typeof data !== 'object') return 0;
        let count = 0;

        for (const dbName in data) {
            const dbData = data[dbName];
            try {
                await new Promise((resolve) => {
                    const deleteRequest = indexedDB.deleteDatabase(dbName);
                    deleteRequest.onsuccess = resolve;
                    deleteRequest.onerror = resolve;
                    deleteRequest.onblocked = resolve;
                });

                const db = await new Promise((resolve, reject) => {
                    const request = indexedDB.open(dbName, dbData.version || 1);

                    request.onupgradeneeded = (event) => {
                        const database = event.target.result;
                        const stores = dbData.stores || {};
                        for (const storeName in stores) {
                            if (!database.objectStoreNames.contains(storeName)) {
                                database.createObjectStore(storeName, { autoIncrement: true });
                            }
                        }
                    };

                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });

                const stores = dbData.stores || {};
                for (const storeName in stores) {
                    if (!db.objectStoreNames.contains(storeName)) continue;

                    const tx = db.transaction(storeName, 'readwrite');
                    const store = tx.objectStore(storeName);
                    const storeData = stores[storeName];

                    for (let i = 0; i < storeData.length; i++) {
                        try {
                            store.add(storeData[i]);
                            count++;
                        } catch (e) {}
                    }

                    await new Promise((resolve) => {
                        tx.oncomplete = resolve;
                        tx.onerror = resolve;
                    });
                }

                db.close();
            } catch (e) {}
        }

        return count;
    }

    async function importFromData(input) {
        try {
            let data;

            try {
                const decoded = decodeURIComponent(escape(atob(input)));
                data = JSON.parse(decoded);
            } catch (e) {
                data = JSON.parse(input);
            }

            if (data._meta && data._meta.hostname && data._meta.hostname !== window.location.hostname) {
                if (!window.confirm('Dữ liệu từ: ' + data._meta.hostname + '\nTrang hiện tại: ' + window.location.hostname + '\n\nVẫn tiếp tục?')) {
                    return { success: false, error: 'Người dùng hủy' };
                }
            }

            const results = {
                localStorage: importLocalStorage(data.localStorage),
                sessionStorage: importSessionStorage(data.sessionStorage),
                cookies: importCookies(data.cookies),
                indexedDB: await importIndexedDB(data.indexedDB)
            };

            return {
                success: true,
                results: results,
                total: results.localStorage + results.sessionStorage + results.cookies + results.indexedDB
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    // ==================== ACTION HANDLERS ====================

    async function handleExportJSON() {
        try {
            const data = await exportAll();
            GM_setClipboard(data);

            const parsed = JSON.parse(data);
            const ls = Object.keys(parsed.localStorage || {}).length;
            const ss = Object.keys(parsed.sessionStorage || {}).length;
            const ck = Object.keys(parsed.cookies || {}).length;
            const idb = Object.keys(parsed.indexedDB || {}).length;

            alert('Đã copy!\n\nlocalStorage: ' + ls + '\nsessionStorage: ' + ss + '\ncookies: ' + ck + '\nindexedDB: ' + idb);
        } catch (e) {
            alert('Lỗi: ' + e.message);
        }
    }

    async function handleExportCompressed() {
        try {
            const data = await exportCompressed();
            GM_setClipboard(data);
            alert('Đã copy dạng nén!\n\nKích thước: ' + (data.length / 1024).toFixed(1) + ' KB');
        } catch (e) {
            alert('Lỗi: ' + e.message);
        }
    }

    function handleExportLocalStorage() {
        const data = JSON.stringify(exportLocalStorage(), null, 2);
        GM_setClipboard(data);
        alert('Đã copy localStorage (' + Object.keys(JSON.parse(data)).length + ' keys)');
    }

    function handleExportCookies() {
        const data = JSON.stringify(exportCookies(), null, 2);
        GM_setClipboard(data);
        alert('Đã copy cookies (' + Object.keys(JSON.parse(data)).length + ')');
    }

    async function handleImport() {
        const input = prompt('Dán dữ liệu storage (JSON hoặc nén):');
        if (!input) return;

        const result = await importFromData(input.trim());

        if (result.success) {
            if (confirm('Nhập thành công! ' + result.total + ' items\n\nReload trang?')) {
                location.reload();
            }
        } else {
            alert('Lỗi: ' + result.error);
        }
    }

    function handleView() {
        const ls = localStorage.length;
        const ss = sessionStorage.length;
        const ck = document.cookie.split(';').filter(function(c) { return c.trim(); }).length;

        alert('STORAGE: ' + window.location.hostname + '\n\nlocalStorage: ' + ls + '\nsessionStorage: ' + ss + '\ncookies: ' + ck);
    }

    function handleClear() {
        const choice = prompt('Nhập số:\n1 - Xóa localStorage\n2 - Xóa sessionStorage\n3 - Xóa cookies\n4 - Xóa TẤT CẢ\n0 - Hủy');

        if (choice === '1') {
            localStorage.clear();
            alert('Đã xóa localStorage');
        } else if (choice === '2') {
            sessionStorage.clear();
            alert('Đã xóa sessionStorage');
        } else if (choice === '3') {
            var cookies = document.cookie.split(';');
            for (var i = 0; i < cookies.length; i++) {
                var name = cookies[i].split('=')[0].trim();
                document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
            }
            alert('Đã xóa cookies');
        } else if (choice === '4') {
            if (confirm('Xóa TẤT CẢ storage?')) {
                localStorage.clear();
                sessionStorage.clear();
                var cookies = document.cookie.split(';');
                for (var i = 0; i < cookies.length; i++) {
                    var name = cookies[i].split('=')[0].trim();
                    document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
                }
                alert('Đã xóa tất cả!');
            }
        }
    }

    // ==================== MENU COMMANDS ====================

    GM_registerMenuCommand('📤 Xuất JSON', handleExportJSON);
    GM_registerMenuCommand('🗜️ Xuất Nén', handleExportCompressed);
    GM_registerMenuCommand('📦 Xuất localStorage', handleExportLocalStorage);
    GM_registerMenuCommand('🍪 Xuất Cookies', handleExportCookies);
    GM_registerMenuCommand('📥 Nhập Storage', handleImport);
    GM_registerMenuCommand('👁️ Xem Storage', handleView);
    GM_registerMenuCommand('🗑️ Xóa Storage', handleClear);

    // ==================== FLOATING UI ====================

    function createFloatingUI() {
        // Dùng GM_addStyle thay vì appendChild style
        GM_addStyle('\
            #sb-float-btn {\
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
                -webkit-user-select: none;\
                cursor: pointer;\
            }\
            #sb-float-btn.dragging {\
                opacity: 0.8;\
                transform: scale(1.1);\
            }\
            #sb-menu {\
                position: fixed;\
                background: #1e1e2e;\
                border-radius: 12px;\
                padding: 6px;\
                z-index: 2147483646;\
                box-shadow: 0 5px 25px rgba(0,0,0,0.5);\
                display: none;\
                min-width: 180px;\
            }\
            #sb-menu.show {\
                display: block;\
            }\
            #sb-menu button {\
                display: block;\
                width: 100%;\
                padding: 12px 14px;\
                margin: 3px 0;\
                background: #2d2d3d;\
                border: none;\
                border-radius: 8px;\
                color: white;\
                font-size: 14px;\
                text-align: left;\
                cursor: pointer;\
            }\
            #sb-menu button:active {\
                background: #4d4d6d;\
            }\
            #sb-menu-divider {\
                height: 1px;\
                background: #3d3d5d;\
                margin: 6px 0;\
            }\
        ');

        // Tạo button bằng DOM API
        var btn = document.createElement('button');
        btn.id = 'sb-float-btn';
        btn.textContent = '💾';

        // Tạo menu bằng DOM API
        var menu = document.createElement('div');
        menu.id = 'sb-menu';

        var menuData = [
            { text: '📤 Xuất JSON', action: handleExportJSON },
            { text: '🗜️ Xuất Nén', action: handleExportCompressed },
            { text: '📦 Xuất localStorage', action: handleExportLocalStorage },
            { text: '🍪 Xuất Cookies', action: handleExportCookies },
            { divider: true },
            { text: '📥 Nhập Storage', action: handleImport },
            { divider: true },
            { text: '👁️ Xem Storage', action: handleView },
            { text: '🗑️ Xóa Storage', action: handleClear }
        ];

        for (var i = 0; i < menuData.length; i++) {
            var item = menuData[i];
            if (item.divider) {
                var divider = document.createElement('div');
                divider.id = 'sb-menu-divider';
                menu.appendChild(divider);
            } else {
                var menuBtn = document.createElement('button');
                menuBtn.textContent = item.text;
                (function(action) {
                    menuBtn.onclick = function() {
                        menu.classList.remove('show');
                        action();
                    };
                })(item.action);
                menu.appendChild(menuBtn);
            }
        }

        document.body.appendChild(btn);
        document.body.appendChild(menu);

        // ===== DRAG LOGIC =====
        var startX = 0;
        var startY = 0;
        var startLeft = 0;
        var startTop = 0;
        var isDragging = false;
        var hasDragged = false;

        var savedPos = GM_getValue('sb_btn_pos', null);
        if (savedPos) {
            btn.style.left = savedPos.left + 'px';
            btn.style.top = savedPos.top + 'px';
        } else {
            btn.style.right = '15px';
            btn.style.bottom = '80px';
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
            var dx = pos.x - startX;
            var dy = pos.y - startY;
            var distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 10) {
                hasDragged = true;
            }

            var newLeft = startLeft + dx;
            var newTop = startTop + dy;

            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - 44));
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - 44));

            btn.style.left = newLeft + 'px';
            btn.style.top = newTop + 'px';
            btn.style.right = 'auto';
            btn.style.bottom = 'auto';

            e.preventDefault();
        }

        function dragEnd(e) {
            if (!isDragging) return;

            isDragging = false;
            btn.classList.remove('dragging');

            var rect = btn.getBoundingClientRect();
            GM_setValue('sb_btn_pos', { left: rect.left, top: rect.top });

            if (!hasDragged) {
                toggleMenu();
            }
        }

        function toggleMenu() {
            if (menu.classList.contains('show')) {
                menu.classList.remove('show');
                return;
            }

            var rect = btn.getBoundingClientRect();
            var left = rect.left;
            var top = rect.bottom + 10;

            if (left + 180 > window.innerWidth) {
                left = window.innerWidth - 190;
            }
            if (left < 10) {
                left = 10;
            }
            if (top + 300 > window.innerHeight) {
                top = rect.top - 310;
            }
            if (top < 10) {
                top = 10;
            }

            menu.style.left = left + 'px';
            menu.style.top = top + 'px';
            menu.classList.add('show');
        }

        // Touch events
        btn.addEventListener('touchstart', dragStart, { passive: false });
        document.addEventListener('touchmove', dragMove, { passive: false });
        document.addEventListener('touchend', dragEnd, { passive: false });

        // Mouse events
        btn.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', dragMove);
        document.addEventListener('mouseup', dragEnd);

        // Đóng menu
        document.addEventListener('click', function(e) {
            if (e.target !== btn && !menu.contains(e.target)) {
                menu.classList.remove('show');
            }
        });
    }

    // ==================== INIT ====================

    function init() {
        if (!document.body) {
            setTimeout(init, 100);
            return;
        }

        try {
            createFloatingUI();
            console.log('💾 Storage Backup v2.2 Ready');
        } catch (e) {
            console.error('Storage Backup error:', e);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();