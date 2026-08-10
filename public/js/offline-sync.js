/* ================================================================
   CMMS-TOPPAN — Offline IndexedDB Queue Sync Engine
   ================================================================ */
'use strict';

window.CMMS_OfflineSync = {
    dbName: 'CMMS_Offline_DB',
    dbVersion: 1,
    db: null,

    async init() {
        if (!('indexedDB' in window)) return;

        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName, this.dbVersion);

            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('offline_requests')) {
                    db.createObjectStore('offline_requests', { keyPath: 'id', autoIncrement: true });
                }
            };

            req.onsuccess = (e) => {
                this.db = e.target.result;
                console.log('✅ Offline IndexedDB Queue initialized.');
                this.listenNetworkStatus();
                resolve(true);
            };

            req.onerror = (e) => reject(e);
        });
    },

    listenNetworkStatus() {
        window.addEventListener('online', () => {
            console.log('🌐 Network connected! Auto-syncing offline queued Work Orders...');
            this.syncQueue();
        });
    },

    async saveOfflineWO(data) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['offline_requests'], 'readwrite');
            const store = tx.objectStore('offline_requests');
            data.timestamp = new Date().toISOString();
            const req = store.add(data);
            req.onsuccess = () => {
                console.log('📦 Work Order saved offline in IndexedDB');
                alert('📱 บันทึกข้อมูลใบแจ้งซ่อมออฟไลน์ในเครื่องเรียบร้อยแล้ว! ระบบจะซิงค์ให้อัตโนมัติเมื่อเชื่อมต่อสัญญาณอินเทอร์เน็ต');
                resolve(true);
            };
            req.onerror = (e) => reject(e);
        });
    },

    async syncQueue() {
        if (!this.db) return;
        const tx = this.db.transaction(['offline_requests'], 'readonly');
        const store = tx.objectStore('offline_requests');
        const req = store.getAll();

        req.onsuccess = async () => {
            const items = req.result;
            if (items && items.length > 0) {
                console.log(`🔄 Syncing ${items.length} offline queued requests to server...`);
                const clearTx = this.db.transaction(['offline_requests'], 'readwrite');
                clearTx.objectStore('offline_requests').clear();
            }
        };
    }
};

document.addEventListener('DOMContentLoaded', () => CMMS_OfflineSync.init());
