"""
Log Streamer Module for Pipeline Management Backend Engine
Handles real-time log streaming and aggregation for pipeline execution
"""

import asyncio
import logging
import json
import gzip
import os
from typing import Dict, Any, Optional, List, Callable, AsyncGenerator
from datetime import datetime, timedelta
from pathlib import Path
from dataclasses import dataclass, asdict
from enum import Enum
from collections import defaultdict, deque
import aiofiles

class LogLevel(Enum):
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"

@dataclass
class LogEntry:
    timestamp: datetime
    level: LogLevel
    source: str
    message: str
    step_id: Optional[str] = None
    pipeline_id: Optional[str] = None
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}
    
    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data['timestamp'] = self.timestamp.isoformat()
        data['level'] = self.level.value
        return data
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'LogEntry':
        data['timestamp'] = datetime.fromisoformat(data['timestamp'])
        data['level'] = LogLevel(data['level'])
        return cls(**data)

class LogBuffer:
    def __init__(self, max_size: int = 10000):
        self.max_size = max_size
        self.entries: deque = deque(maxlen=max_size)
        self.subscribers: Dict[str, List[Callable]] = defaultdict(list)
        self.filters: Dict[str, Dict[str, Any]] = {}
    
    def add_entry(self, entry: LogEntry):
        """Add a log entry to the buffer"""
        self.entries.append(entry)
        
        # Notify subscribers
        asyncio.create_task(self._notify_subscribers(entry))
    
    async def _notify_subscribers(self, entry: LogEntry):
        """Notify all relevant subscribers about new log entry"""
        for subscription_id, callbacks in self.subscribers.items():
            # Check if entry matches subscription filters
            if self._matches_filters(entry, subscription_id):
                for callback in callbacks:
                    try:
                        if asyncio.iscoroutinefunction(callback):
                            await callback(entry)
                        else:
                            callback(entry)
                    except Exception as e:
                        logging.error(f"Error notifying subscriber {subscription_id}: {e}")
    
    def _matches_filters(self, entry: LogEntry, subscription_id: str) -> bool:
        """Check if log entry matches subscription filters"""
        filters = self.filters.get(subscription_id, {})
        
        # Level filter
        if 'level' in filters:
            if entry.level.value not in filters['level']:
                return False
        
        # Source filter
        if 'source' in filters:
            if entry.source not in filters['source']:
                return False
        
        # Step ID filter
        if 'step_id' in filters:
            if entry.step_id not in filters['step_id']:
                return False
        
        # Pipeline ID filter
        if 'pipeline_id' in filters:
            if entry.pipeline_id not in filters['pipeline_id']:
                return False
        
        # Message pattern filter
        if 'message_pattern' in filters:
            import re
            pattern = filters['message_pattern']
            if not re.search(pattern, entry.message, re.IGNORECASE):
                return False
        
        return True
    
    def subscribe(self, subscription_id: str, callback: Callable, 
                 filters: Dict[str, Any] = None):
        """Subscribe to log entries with optional filters"""
        self.subscribers[subscription_id].append(callback)
        if filters:
            self.filters[subscription_id] = filters
    
    def unsubscribe(self, subscription_id: str, callback: Callable = None):
        """Unsubscribe from log entries"""
        if callback:
            if subscription_id in self.subscribers:
                try:
                    self.subscribers[subscription_id].remove(callback)
                except ValueError:
                    pass
        else:
            # Remove all callbacks for subscription
            self.subscribers.pop(subscription_id, None)
            self.filters.pop(subscription_id, None)
    
    def get_entries(self, filters: Dict[str, Any] = None, 
                   limit: int = None) -> List[LogEntry]:
        """Get log entries with optional filtering"""
        entries = list(self.entries)
        
        if filters:
            filtered_entries = []
            for entry in entries:
                # Create temporary subscription to use filter logic
                temp_id = "temp_filter"
                self.filters[temp_id] = filters
                if self._matches_filters(entry, temp_id):
                    filtered_entries.append(entry)
                self.filters.pop(temp_id, None)
            entries = filtered_entries
        
        if limit:
            entries = entries[-limit:]
        
        return entries

class LogStreamer:
    def __init__(self, log_dir: str = "/tmp/pipeline-logs", 
                 buffer_size: int = 10000, 
                 compression: bool = True):
        self.log_dir = Path(log_dir)
        self.buffer = LogBuffer(buffer_size)
        self.compression = compression
        self.active_streams: Dict[str, asyncio.Queue] = {}
        self.log_files: Dict[str, Path] = {}
        self.websocket_connections: Dict[str, List] = defaultdict(list)
        
        # Ensure log directory exists
        self.log_dir.mkdir(parents=True, exist_ok=True)
        
        # Setup logging
        self.logger = logging.getLogger(__name__)
        
        # Start background tasks
        self.cleanup_task = None
        self.start_background_tasks()
    
    def start_background_tasks(self):
        """Start background tasks for log management"""
        if self.cleanup_task is None or self.cleanup_task.done():
            self.cleanup_task = asyncio.create_task(self._cleanup_old_logs())
    
    async def log(self, level: LogLevel, source: str, message: str, 
                 step_id: Optional[str] = None, pipeline_id: Optional[str] = None,
                 metadata: Dict[str, Any] = None):
        """Log a message with specified level and metadata"""
        entry = LogEntry(
            timestamp=datetime.now(),
            level=level,
            source=source,
            message=message,
            step_id=step_id,
            pipeline_id=pipeline_id,
            metadata=metadata or {}
        )
        
        # Add to buffer
        self.buffer.add_entry(entry)
        
        # Write to file
        await self._write_to_file(entry)
        
        # Stream to active listeners
        await self._stream_to_active_listeners(entry)
    
    async def _write_to_file(self, entry: LogEntry):
        """Write log entry to appropriate file"""
        # Determine log file based on pipeline_id or step_id
        if entry.pipeline_id:
            log_key = f"pipeline_{entry.pipeline_id}"
        elif entry.step_id:
            log_key = f"step_{entry.step_id}"
        else:
            log_key = "system"
        
        # Get or create log file path
        if log_key not in self.log_files:
            timestamp = datetime.now().strftime("%Y%m%d")
            filename = f"{log_key}_{timestamp}.log"
            if self.compression:
                filename += ".gz"
            self.log_files[log_key] = self.log_dir / filename
        
        log_file = self.log_files[log_key]
        
        # Prepare log line
        log_line = json.dumps(entry.to_dict()) + "\n"
        
        try:
            if self.compression:
                # Write to compressed file
                async with aiofiles.open(log_file, 'ab') as f:
                    compressed_data = gzip.compress(log_line.encode('utf-8'))
                    await f.write(compressed_data)
            else:
                # Write to regular file
                async with aiofiles.open(log_file, 'a', encoding='utf-8') as f:
                    await f.write(log_line)
        except Exception as e:
            self.logger.error(f"Failed to write log to file {log_file}: {e}")
    
    async def _stream_to_active_listeners(self, entry: LogEntry):
        """Stream log entry to active listeners"""
        # Stream to queues
        for stream_id, queue in self.active_streams.items():
            try:
                queue.put_nowait(entry)
            except asyncio.QueueFull:
                # Remove oldest entry and add new one
                try:
                    queue.get_nowait()
                    queue.put_nowait(entry)
                except asyncio.QueueEmpty:
                    pass
        
        # Stream to WebSocket connections
        await self._stream_to_websockets(entry)
    
    async def _stream_to_websockets(self, entry: LogEntry):
        """Stream log entry to WebSocket connections"""
        if not self.websocket_connections:
            return
        
        message = {
            'type': 'log_entry',
            'data': entry.to_dict()
        }
        
        disconnected = []
        for connection_id, websockets in self.websocket_connections.items():
            for ws in websockets[:]:  # Create copy to avoid modification during iteration
                try:
                    await ws.send(json.dumps(message))
                except Exception as e:
                    self.logger.warning(f"WebSocket connection {connection_id} failed: {e}")
                    websockets.remove(ws)
                    if not websockets:
                        disconnected.append(connection_id)
        
        # Clean up disconnected connections
        for connection_id in disconnected:
            del self.websocket_connections[connection_id]
    
    def create_stream(self, stream_id: str, queue_size: int = 1000) -> asyncio.Queue:
        """Create a new log stream"""
        queue = asyncio.Queue(maxsize=queue_size)
        self.active_streams[stream_id] = queue
        return queue
    
    def close_stream(self, stream_id: str):
        """Close an active log stream"""
        self.active_streams.pop(stream_id, None)
    
    async def get_stream_generator(self, stream_id: str, 
                                  filters: Dict[str, Any] = None) -> AsyncGenerator[LogEntry, None]:
        """Get an async generator for streaming log entries"""
        queue = self.create_stream(stream_id)
        
        try:
            while True:
                try:
                    entry = await asyncio.wait_for(queue.get(), timeout=30.0)
                    
                    # Apply filters if specified
                    if filters:
                        # Create temporary subscription to use filter logic
                        temp_id = "temp_stream_filter"
                        self.buffer.filters[temp_id] = filters
                        if self.buffer._matches_filters(entry, temp_id):
                            yield entry
                        self.buffer.filters.pop(temp_id, None)
                    else:
                        yield entry
                        
                except asyncio.TimeoutError:
                    # Send heartbeat
                    heartbeat = LogEntry(
                        timestamp=datetime.now(),
                        level=LogLevel.DEBUG,
                        source="streamer",
                        message="heartbeat"
                    )
                    yield heartbeat
                    
        except asyncio.CancelledError:
            pass
        finally:
            self.close_stream(stream_id)
    
    def add_websocket(self, connection_id: str, websocket):
        """Add WebSocket connection for real-time streaming"""
        self.websocket_connections[connection_id].append(websocket)
    
    def remove_websocket(self, connection_id: str, websocket):
        """Remove WebSocket connection"""
        if connection_id in self.websocket_connections:
            try:
                self.websocket_connections[connection_id].remove(websocket)
                if not self.websocket_connections[connection_id]:
                    del self.websocket_connections[connection_id]
            except ValueError:
                pass
    
    async def get_historical_logs(self, pipeline_id: Optional[str] = None,
                                 step_id: Optional[str] = None,
                                 start_time: Optional[datetime] = None,
                                 end_time: Optional[datetime] = None,
                                 level: Optional[LogLevel] = None,
                                 limit: int = 1000) -> List[LogEntry]:
        """Get historical logs with filtering options"""
        filters = {}
        
        if pipeline_id:
            filters['pipeline_id'] = [pipeline_id]
        if step_id:
            filters['step_id'] = [step_id]
        if level:
            filters['level'] = [level.value]
        
        # Get from buffer first (most recent)
        buffer_entries = self.buffer.get_entries(filters, limit)
        
        # If we need more entries or specific time range, read from files
        if len(buffer_entries) < limit or start_time or end_time:
            file_entries = await self._read_from_log_files(
                pipeline_id, step_id, start_time, end_time, level, limit
            )
            
            # Combine and deduplicate
            all_entries = file_entries + buffer_entries
            
            # Sort by timestamp and remove duplicates
            seen_entries = set()
            unique_entries = []
            for entry in sorted(all_entries, key=lambda x: x.timestamp):
                entry_key = (entry.timestamp, entry.source, entry.message)
                if entry_key not in seen_entries:
                    seen_entries.add(entry_key)
                    unique_entries.append(entry)
            
            # Apply time filters
            if start_time or end_time:
                filtered_entries = []
                for entry in unique_entries:
                    if start_time and entry.timestamp < start_time:
                        continue
                    if end_time and entry.timestamp > end_time:
                        continue
                    filtered_entries.append(entry)
                unique_entries = filtered_entries
            
            return unique_entries[-limit:] if limit else unique_entries
        
        return buffer_entries
    
    async def _read_from_log_files(self, pipeline_id: Optional[str] = None,
                                  step_id: Optional[str] = None,
                                  start_time: Optional[datetime] = None,
                                  end_time: Optional[datetime] = None,
                                  level: Optional[LogLevel] = None,
                                  limit: int = 1000) -> List[LogEntry]:
        """Read log entries from stored log files"""
        entries = []
        
        # Determine which files to read
        target_files = []
        if pipeline_id:
            pattern = f"pipeline_{pipeline_id}_*.log*"
            target_files.extend(self.log_dir.glob(pattern))
        elif step_id:
            pattern = f"step_{step_id}_*.log*"
            target_files.extend(self.log_dir.glob(pattern))
        else:
            # Read all log files
            target_files.extend(self.log_dir.glob("*.log*"))
        
        for log_file in target_files:
            try:
                if log_file.suffix == '.gz':
                    # Read compressed file
                    with gzip.open(log_file, 'rt', encoding='utf-8') as f:
                        lines = f.readlines()
                else:
                    # Read regular file
                    async with aiofiles.open(log_file, 'r', encoding='utf-8') as f:
                        lines = await f.readlines()
                
                for line in lines:
                    try:
                        entry_data = json.loads(line.strip())
                        entry = LogEntry.from_dict(entry_data)
                        
                        # Apply filters
                        if level and entry.level != level:
                            continue
                        if pipeline_id and entry.pipeline_id != pipeline_id:
                            continue
                        if step_id and entry.step_id != step_id:
                            continue
                        
                        entries.append(entry)
                        
                    except (json.JSONDecodeError, KeyError) as e:
                        self.logger.warning(f"Invalid log entry in {log_file}: {e}")
                        
            except Exception as e:
                self.logger.error(f"Error reading log file {log_file}: {e}")
        
        return entries
    
    async def _cleanup_old_logs(self):
        """Background task to cleanup old log files"""
        while True:
            try:
                # Sleep for 1 hour
                await asyncio.sleep(3600)
                
                # Remove log files older than 7 days
                cutoff_time = datetime.now() - timedelta(days=7)
                
                for log_file in self.log_dir.glob("*.log*"):
                    try:
                        if log_file.stat().st_mtime < cutoff_time.timestamp():
                            log_file.unlink()
                            self.logger.info(f"Cleaned up old log file: {log_file}")
                    except Exception as e:
                        self.logger.error(f"Error cleaning up log file {log_file}: {e}")
                        
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Error in cleanup task: {e}")
    
    async def shutdown(self):
        """Shutdown log streamer and cleanup resources"""
        # Cancel cleanup task
        if self.cleanup_task and not self.cleanup_task.done():
            self.cleanup_task.cancel()
            try:
                await self.cleanup_task
            except asyncio.CancelledError:
                pass
        
        # Close all active streams
        for stream_id in list(self.active_streams.keys()):
            self.close_stream(stream_id)
        
        # Close WebSocket connections
        self.websocket_connections.clear()
        
        self.logger.info("Log streamer shutdown complete")

# Global log streamer instance
_log_streamer = None

def get_log_streamer() -> LogStreamer:
    """Get global log streamer instance"""
    global _log_streamer
    if _log_streamer is None:
        _log_streamer = LogStreamer()
    return _log_streamer

# Convenience functions
async def log_info(source: str, message: str, step_id: str = None, 
                  pipeline_id: str = None, metadata: Dict[str, Any] = None):
    streamer = get_log_streamer()
    await streamer.log(LogLevel.INFO, source, message, step_id, pipeline_id, metadata)

async def log_error(source: str, message: str, step_id: str = None, 
                   pipeline_id: str = None, metadata: Dict[str, Any] = None):
    streamer = get_log_streamer()
    await streamer.log(LogLevel.ERROR, source, message, step_id, pipeline_id, metadata)

async def log_warning(source: str, message: str, step_id: str = None, 
                     pipeline_id: str = None, metadata: Dict[str, Any] = None):
    streamer = get_log_streamer()
    await streamer.log(LogLevel.WARNING, source, message, step_id, pipeline_id, metadata)

async def log_debug(source: str, message: str, step_id: str = None, 
                   pipeline_id: str = None, metadata: Dict[str, Any] = None):
    streamer = get_log_streamer()
    await streamer.log(LogLevel.DEBUG, source, message, step_id, pipeline_id, metadata)