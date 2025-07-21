const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

class Notifier extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.notifications = [];
    this.subscribers = new Map();
  }

  notify(type, data) {
    const notification = {
      id: this.generateId(),
      type,
      data,
      timestamp: new Date(),
      read: false,
      level: this.getNotificationLevel(type)
    };

    this.notifications.push(notification);
    this.emit('notification', notification);

    // Send to specific type subscribers
    if (this.subscribers.has(type)) {
      const handlers = this.subscribers.get(type);
      handlers.forEach(handler => {
        try {
          handler(notification);
        } catch (error) {
          console.error('Notification handler error:', error);
        }
      });
    }

    // Send to all subscribers
    if (this.subscribers.has('*')) {
      const handlers = this.subscribers.get('*');
      handlers.forEach(handler => {
        try {
          handler(notification);
        } catch (error) {
          console.error('Global notification handler error:', error);
        }
      });
    }

    // Log if configured
    if (this.config.notifications?.log) {
      this.logNotification(notification);
    }

    // Send system notification if configured
    if (this.shouldSendSystemNotification(notification)) {
      this.sendSystemNotification(notification);
    }

    return notification.id;
  }

  subscribe(type, handler) {
    if (!this.subscribers.has(type)) {
      this.subscribers.set(type, []);
    }
    this.subscribers.get(type).push(handler);

    return () => {
      const handlers = this.subscribers.get(type);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    };
  }

  getNotificationLevel(type) {
    const levels = {
      // Sync events
      'sync:started': 'info',
      'sync:completed': 'info',
      'sync:error': 'error',
      'sync:warning': 'warning',

      // Conflict events
      'conflict': 'warning',
      'conflict:detected': 'warning',
      'conflict:resolved': 'info',
      'conflict:failed': 'error',

      // File events
      'file:changed': 'info',
      'file:added': 'info',
      'file:deleted': 'info',
      'file:error': 'error',

      // Remote events
      'remote:changed': 'info',
      'remote:error': 'error',
      'remote:disconnected': 'error',
      'remote:reconnected': 'info',

      // Engine events
      'engine:started': 'info',
      'engine:stopped': 'info',
      'engine:error': 'error',

      // Backup events
      'backup:created': 'info',
      'backup:restored': 'info',
      'backup:error': 'error',

      // Upload/Download events
      'upload:success': 'info',
      'upload:error': 'error',
      'download:success': 'info',
      'download:error': 'error'
    };

    return levels[type] || 'info';
  }

  async logNotification(notification) {
    const logDir = path.join(this.config.dataDir, 'logs');
    const logFile = path.join(logDir, 'notifications.log');

    try {
      await fs.mkdir(logDir, { recursive: true });

      const logEntry = {
        timestamp: notification.timestamp.toISOString(),
        id: notification.id,
        type: notification.type,
        level: notification.level,
        message: this.formatNotificationMessage(notification),
        data: notification.data
      };

      const logLine = JSON.stringify(logEntry) + '\n';
      await fs.appendFile(logFile, logLine);

    } catch (error) {
      console.error('Failed to log notification:', error);
    }
  }

  formatNotificationMessage(notification) {
    const formatters = {
      'conflict': (data) => `Conflict detected: ${data.conflict?.message || 'Unknown conflict'}`,
      'conflict:detected': (data) => `New conflict requires attention: ${data.conflict?.type || 'Unknown type'}`,
      'conflict:resolved': (data) => `Conflict resolved using ${data.resolution?.strategy || 'unknown strategy'}`,
      
      'sync:started': () => 'Synchronization started',
      'sync:completed': (data) => `Sync completed: ${data.item?.filePath || data.item?.path || 'unknown item'}`,
      'sync:error': (data) => `Sync failed: ${data.error?.message || 'Unknown error'}`,
      
      'file:changed': (data) => `File changed: ${data.filePath}`,
      'file:added': (data) => `File added: ${data.filePath}`,
      'file:deleted': (data) => `File deleted: ${data.filePath}`,
      
      'remote:changed': (data) => `Remote page changed: ${data.path || data.pageId}`,
      'remote:error': (data) => `Remote error: ${data.error?.message || 'Unknown error'}`,
      
      'engine:started': () => 'Sync engine started',
      'engine:stopped': () => 'Sync engine stopped',
      
      'upload:success': (data) => `Upload successful: ${data.filePath || data.path}`,
      'upload:error': (data) => `Upload failed: ${data.error?.message || 'Unknown error'}`,
      'download:success': (data) => `Download successful: ${data.path}`,
      'download:error': (data) => `Download failed: ${data.error?.message || 'Unknown error'}`
    };

    const formatter = formatters[notification.type];
    return formatter ? formatter(notification.data) : `${notification.type}: ${JSON.stringify(notification.data)}`;
  }

  shouldSendSystemNotification(notification) {
    if (!this.config.notifications?.system) {
      return false;
    }

    const systemLevels = this.config.notifications.systemLevels || ['error', 'warning'];
    return systemLevels.includes(notification.level);
  }

  async sendSystemNotification(notification) {
    try {
      const message = this.formatNotificationMessage(notification);
      const title = 'WikiJS Sync Agent';

      // Try different notification methods based on platform
      if (process.platform === 'darwin') {
        await this.sendMacNotification(title, message);
      } else if (process.platform === 'win32') {
        await this.sendWindowsNotification(title, message);
      } else {
        await this.sendLinuxNotification(title, message);
      }

    } catch (error) {
      console.error('Failed to send system notification:', error);
    }
  }

  async sendMacNotification(title, message) {
    const { spawn } = require('child_process');
    return new Promise((resolve) => {
      const process = spawn('osascript', [
        '-e',
        `display notification "${message}" with title "${title}"`
      ]);
      process.on('close', resolve);
    });
  }

  async sendWindowsNotification(title, message) {
    const { spawn } = require('child_process');
    return new Promise((resolve) => {
      const script = `
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show("${message}", "${title}")
      `;
      const process = spawn('powershell', ['-Command', script]);
      process.on('close', resolve);
    });
  }

  async sendLinuxNotification(title, message) {
    const { spawn } = require('child_process');
    return new Promise((resolve) => {
      const process = spawn('notify-send', [title, message]);
      process.on('close', resolve);
    });
  }

  getNotifications(filter = {}) {
    let filtered = this.notifications;

    if (filter.type) {
      filtered = filtered.filter(n => n.type === filter.type);
    }

    if (filter.level) {
      filtered = filtered.filter(n => n.level === filter.level);
    }

    if (filter.unread) {
      filtered = filtered.filter(n => !n.read);
    }

    if (filter.since) {
      const since = new Date(filter.since);
      filtered = filtered.filter(n => n.timestamp >= since);
    }

    if (filter.limit) {
      filtered = filtered.slice(-filter.limit);
    }

    return filtered.sort((a, b) => b.timestamp - a.timestamp);
  }

  markAsRead(notificationId) {
    const notification = this.notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.read = true;
      this.emit('notification:read', notification);
      return true;
    }
    return false;
  }

  markAllAsRead(type = null) {
    let marked = 0;
    
    for (const notification of this.notifications) {
      if (!notification.read && (!type || notification.type === type)) {
        notification.read = true;
        marked++;
      }
    }

    if (marked > 0) {
      this.emit('notifications:marked_read', { count: marked, type });
    }

    return marked;
  }

  clearNotifications(olderThan = null) {
    const before = this.notifications.length;
    
    if (olderThan) {
      const cutoff = new Date(olderThan);
      this.notifications = this.notifications.filter(n => n.timestamp >= cutoff);
    } else {
      this.notifications = [];
    }

    const cleared = before - this.notifications.length;
    
    if (cleared > 0) {
      this.emit('notifications:cleared', { count: cleared });
    }

    return cleared;
  }

  getUnreadCount(type = null) {
    return this.notifications.filter(n => 
      !n.read && (!type || n.type === type)
    ).length;
  }

  getStats() {
    const stats = {
      total: this.notifications.length,
      unread: this.getUnreadCount(),
      byLevel: {},
      byType: {},
      recent: this.notifications.filter(n => 
        Date.now() - n.timestamp.getTime() < 24 * 60 * 60 * 1000
      ).length
    };

    for (const notification of this.notifications) {
      stats.byLevel[notification.level] = (stats.byLevel[notification.level] || 0) + 1;
      stats.byType[notification.type] = (stats.byType[notification.type] || 0) + 1;
    }

    return stats;
  }

  generateId() {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Convenience methods for common notification types
  notifyConflict(conflict, item) {
    return this.notify('conflict:detected', { conflict, item });
  }

  notifyConflictResolved(conflict, resolution) {
    return this.notify('conflict:resolved', { conflict, resolution });
  }

  notifySyncStarted(item) {
    return this.notify('sync:started', { item });
  }

  notifySyncCompleted(item, result) {
    return this.notify('sync:completed', { item, result });
  }

  notifySyncError(item, error) {
    return this.notify('sync:error', { item, error });
  }

  notifyFileChanged(filePath, type, hash) {
    return this.notify(`file:${type}`, { filePath, hash });
  }

  notifyRemoteChanged(pageId, path, hash) {
    return this.notify('remote:changed', { pageId, path, hash });
  }

  notifyEngineStarted() {
    return this.notify('engine:started', { timestamp: new Date() });
  }

  notifyEngineStopped() {
    return this.notify('engine:stopped', { timestamp: new Date() });
  }
}

module.exports = Notifier;