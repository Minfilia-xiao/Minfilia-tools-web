/**
 * 工单管理系统 - GitHub 数据服务层
 * 
 * 功能：
 * - 通过 GitHub API 读写 work_orders.json
 * - 本地缓存（localStorage）保证离线可用
 * - 自动处理文件 sha（GitHub API 必需）
 * 
 * 使用方式：
 * window.WorkOrderService.init()      // 初始化（可选，自动处理）
 * window.WorkOrderService.loadData()  // 读取全部工单
 * window.WorkOrderService.addOrder(order)   // 新增
 * window.WorkOrderService.updateOrder(order) // 更新
 * window.WorkOrderService.deleteOrder(id)    // 删除
 */
(function () {
  'use strict';

  const CACHE_KEY = 'work_orders_cache_v2';
  const CONFIG = window.APP_CONFIG && window.APP_CONFIG.github;

  // ========== 工具函数 ==========

  /** 读取本地缓存 */
  function getCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /** 写入本地缓存 */
  function setCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch {}
  }

  /** GitHub API 请求封装 */
  function githubFetch(path, options) {
    const url = 'https://api.github.com/repos/' + CONFIG.owner + '/' + CONFIG.repo + path;
    return fetch(url, {
      ...options,
      headers: {
        'Authorization': 'token ' + CONFIG.token,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        ...((options && options.headers) || {})
      }
    }).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (err) {
          throw new Error(err.message || 'GitHub API error: ' + res.status);
        });
      }
      return res.json();
    });
  }

  /** 读取 GitHub 上的文件（返回 { content, sha }） */
  function readFile() {
    return githubFetch('/contents/' + CONFIG.dataPath + '?ref=' + CONFIG.branch, {
      method: 'GET'
    }).then(function (file) {
      const content = JSON.parse(atob(file.content.replace(/\n/g, '')));
      return { data: content, sha: file.sha };
    });
  }

  /** 写入 GitHub 文件 */
  function writeFile(content, sha) {
    return githubFetch('/contents/' + CONFIG.dataPath, {
      method: 'PUT',
      body: JSON.stringify({
        message: 'update: work_orders.json',
        content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
        sha: sha,
        branch: CONFIG.branch
      })
    }).then(function (res) {
      return res.content.sha;
    });
  }

  /** 生成本地 ID */
  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ========== 公共 API ==========

  const WorkOrderService = {
    /** 初始化（检查配置） */
    init: function () {
      return new Promise(function (resolve, reject) {
        if (!CONFIG || !CONFIG.token || !CONFIG.owner || !CONFIG.repo) {
          reject(new Error('GitHub 配置不完整，请检查 config.js'));
          return;
        }
        resolve();
      });
    },

    /** 检查是否已配置 */
    isReady: function () {
      return !!(CONFIG && CONFIG.token && CONFIG.owner && CONFIG.repo);
    },

    /** 读取全部工单（优先云端，失败用缓存） */
    loadData: function () {
      return this.init().then(function () {
        return readFile();
      }).then(function (result) {
        setCache(result.data);
        return result.data;
      }).catch(function (err) {
        console.warn('[WorkOrderService] 云端读取失败，使用缓存', err);
        return getCache();
      });
    },

    /** 新增工单 */
    addOrder: function (order) {
      const self = this;
      return this.init().then(function () {
        return readFile();
      }).then(function (result) {
        const data = result.data;
        // 确保有 id
        if (!order.id) order.id = genId();
        data.push(order);
        return writeFile(data, result.sha).then(function (newSha) {
          setCache(data);
          return order;
        });
      }).catch(function (err) {
        console.warn('[WorkOrderService] 云端新增失败，写入缓存', err);
        // fallback: 写入本地缓存
        const cache = getCache();
        if (!order.id) order.id = genId();
        cache.push(order);
        setCache(cache);
        return order;
      });
    },

    /** 更新工单 */
    updateOrder: function (order) {
      const self = this;
      return this.init().then(function () {
        return readFile();
      }).then(function (result) {
        const data = result.data;
        const idx = data.findIndex(function (o) { return o.id === order.id; });
        if (idx >= 0) {
          data[idx] = { ...data[idx], ...order };
        } else {
          data.push(order);
        }
        return writeFile(data, result.sha).then(function (newSha) {
          setCache(data);
          return order;
        });
      }).catch(function (err) {
        console.warn('[WorkOrderService] 云端更新失败，写入缓存', err);
        const cache = getCache();
        const idx = cache.findIndex(function (o) { return o.id === order.id; });
        if (idx >= 0) {
          cache[idx] = { ...cache[idx], ...order };
        } else {
          cache.push(order);
        }
        setCache(cache);
        return order;
      });
    },

    /** 删除工单 */
    deleteOrder: function (id) {
      return this.init().then(function () {
        return readFile();
      }).then(function (result) {
        const data = result.data.filter(function (o) { return o.id !== id; });
        return writeFile(data, result.sha).then(function (newSha) {
          setCache(data);
          return true;
        });
      }).catch(function (err) {
        console.warn('[WorkOrderService] 云端删除失败，从缓存删除', err);
        const cache = getCache().filter(function (o) { return o.id !== id; });
        setCache(cache);
        return true;
      });
    },

    /** 全量写入（用于迁移） */
    saveData: function (data) {
      const self = this;
      return this.init().then(function () {
        return readFile();
      }).then(function (result) {
        return writeFile(data, result.sha).then(function (newSha) {
          setCache(data);
          return data;
        });
      }).catch(function (err) {
        console.warn('[WorkOrderService] 云端写入失败，写入缓存', err);
        setCache(data);
        throw err;
      });
    },

    /** 检测是否需要迁移（本地有数据，云端为空） */
    checkNeedsMigration: function () {
      const cache = getCache();
      return this.loadData().then(function (cloudData) {
        if ((!cloudData || cloudData.length === 0) && cache.length > 0) {
          return cache;
        }
        return [];
      }).catch(function () {
        // 云端读取失败，如果本地有数据也需要迁移
        return cache.length > 0 ? cache : [];
      });
    },

    /** 迁移本地数据到云端 */
    migrateFromLocal: function (localData) {
      const self = this;
      return this.init().then(function () {
        return readFile();
      }).then(function (result) {
        const merged = [].concat(result.data || [], localData);
        return writeFile(merged, result.sha).then(function (newSha) {
          setCache(merged);
          return merged.length;
        });
      });
    }
  };

  window.WorkOrderService = WorkOrderService;
})();
