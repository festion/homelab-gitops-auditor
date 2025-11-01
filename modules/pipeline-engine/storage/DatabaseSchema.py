"""
Database Schema Module for Pipeline Management Backend Engine
Defines database models and schema for pipeline storage
"""

from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, Boolean, JSON, ForeignKey, Enum, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid
import enum

Base = declarative_base()

class PipelineStatus(enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    ARCHIVED = "archived"
    DELETED = "deleted"

class ExecutionStatus(enum.Enum):
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"
    SKIPPED = "skipped"

class StepStatus(enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"
    SKIPPED = "skipped"

class Pipeline(Base):
    __tablename__ = 'pipelines'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text)
    status = Column(Enum(PipelineStatus), default=PipelineStatus.DRAFT, index=True)
    configuration = Column(JSON, nullable=False)
    template_id = Column(UUID(as_uuid=True), ForeignKey('pipeline_templates.id'), nullable=True)
    created_by = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    version = Column(Integer, default=1, nullable=False)
    tags = Column(JSON, default=list)
    
    # Relationships
    template = relationship("PipelineTemplate", back_populates="pipelines")
    executions = relationship("PipelineExecution", back_populates="pipeline", cascade="all, delete-orphan")
    
    # Indexes
    __table_args__ = (
        Index('idx_pipeline_status_created', 'status', 'created_at'),
        Index('idx_pipeline_name_status', 'name', 'status'),
    )

class PipelineTemplate(Base):
    __tablename__ = 'pipeline_templates'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False, unique=True, index=True)
    description = Column(Text)
    category = Column(String(100), index=True)
    configuration = Column(JSON, nullable=False)
    parameters_schema = Column(JSON, default=dict)
    is_builtin = Column(Boolean, default=False, index=True)
    created_by = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    version = Column(Integer, default=1, nullable=False)
    tags = Column(JSON, default=list)
    
    # Relationships
    pipelines = relationship("Pipeline", back_populates="template")

class PipelineExecution(Base):
    __tablename__ = 'pipeline_executions'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pipeline_id = Column(UUID(as_uuid=True), ForeignKey('pipelines.id'), nullable=False, index=True)
    status = Column(Enum(ExecutionStatus), default=ExecutionStatus.PENDING, index=True)
    trigger_type = Column(String(50), nullable=False, index=True)  # manual, webhook, schedule, api
    trigger_data = Column(JSON, default=dict)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    output = Column(JSON, default=dict)
    metrics = Column(JSON, default=dict)
    github_run_id = Column(String(50), nullable=True, index=True)
    github_run_url = Column(String(500), nullable=True)
    created_by = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    pipeline = relationship("Pipeline", back_populates="executions")
    steps = relationship("StepExecution", back_populates="execution", cascade="all, delete-orphan")
    
    # Indexes
    __table_args__ = (
        Index('idx_execution_pipeline_status', 'pipeline_id', 'status'),
        Index('idx_execution_created_status', 'created_at', 'status'),
        Index('idx_execution_trigger_type', 'trigger_type', 'created_at'),
    )

class StepExecution(Base):
    __tablename__ = 'step_executions'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    execution_id = Column(UUID(as_uuid=True), ForeignKey('pipeline_executions.id'), nullable=False, index=True)
    step_id = Column(String(255), nullable=False, index=True)
    step_name = Column(String(255), nullable=False)
    step_type = Column(String(50), nullable=False)
    status = Column(Enum(StepStatus), default=StepStatus.PENDING, index=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    exit_code = Column(Integer, nullable=True)
    stdout = Column(Text, nullable=True)
    stderr = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    artifacts = Column(JSON, default=list)
    metrics = Column(JSON, default=dict)
    retry_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    execution = relationship("PipelineExecution", back_populates="steps")
    
    # Indexes
    __table_args__ = (
        Index('idx_step_execution_step', 'execution_id', 'step_id'),
        Index('idx_step_status_created', 'status', 'created_at'),
    )

class ExecutionLog(Base):
    __tablename__ = 'execution_logs'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    execution_id = Column(UUID(as_uuid=True), ForeignKey('pipeline_executions.id'), nullable=False, index=True)
    step_id = Column(String(255), nullable=True, index=True)
    level = Column(String(20), nullable=False, index=True)  # DEBUG, INFO, WARNING, ERROR, CRITICAL
    source = Column(String(100), nullable=False)
    message = Column(Text, nullable=False)
    metadata = Column(JSON, default=dict)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    # Indexes
    __table_args__ = (
        Index('idx_log_execution_timestamp', 'execution_id', 'timestamp'),
        Index('idx_log_level_timestamp', 'level', 'timestamp'),
        Index('idx_log_step_timestamp', 'step_id', 'timestamp'),
    )

class WorkflowMapping(Base):
    __tablename__ = 'workflow_mappings'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pipeline_id = Column(UUID(as_uuid=True), ForeignKey('pipelines.id'), nullable=False, index=True)
    github_workflow_id = Column(String(255), nullable=False, index=True)
    github_workflow_path = Column(String(500), nullable=False)
    github_repo_owner = Column(String(255), nullable=False)
    github_repo_name = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, index=True)
    sync_status = Column(String(50), default='synced')  # synced, pending, error
    last_sync_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Indexes
    __table_args__ = (
        Index('idx_workflow_github_id', 'github_workflow_id', 'github_repo_owner', 'github_repo_name'),
        Index('idx_workflow_pipeline_active', 'pipeline_id', 'is_active'),
    )

class QualityGate(Base):
    __tablename__ = 'quality_gates'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False, unique=True, index=True)
    description = Column(Text)
    conditions = Column(JSON, nullable=False)  # List of quality conditions
    is_default = Column(Boolean, default=False, index=True)
    is_active = Column(Boolean, default=True, index=True)
    created_by = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

class QualityResult(Base):
    __tablename__ = 'quality_results'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    execution_id = Column(UUID(as_uuid=True), ForeignKey('pipeline_executions.id'), nullable=False, index=True)
    quality_gate_id = Column(UUID(as_uuid=True), ForeignKey('quality_gates.id'), nullable=False, index=True)
    overall_status = Column(String(20), nullable=False, index=True)  # PASSED, FAILED, WARNING
    score = Column(Integer, nullable=True)  # 0-100
    conditions_results = Column(JSON, nullable=False)  # Results for each condition
    metrics = Column(JSON, default=dict)
    evaluated_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    execution = relationship("PipelineExecution")
    quality_gate = relationship("QualityGate")
    
    # Indexes
    __table_args__ = (
        Index('idx_quality_execution_gate', 'execution_id', 'quality_gate_id'),
        Index('idx_quality_status_date', 'overall_status', 'evaluated_at'),
    )

class DependencyMapping(Base):
    __tablename__ = 'dependency_mappings'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_pipeline_id = Column(UUID(as_uuid=True), ForeignKey('pipelines.id'), nullable=False, index=True)
    target_pipeline_id = Column(UUID(as_uuid=True), ForeignKey('pipelines.id'), nullable=False, index=True)
    dependency_type = Column(String(50), nullable=False)  # trigger, artifact, approval
    condition = Column(JSON, default=dict)  # Conditions for dependency activation
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    source_pipeline = relationship("Pipeline", foreign_keys=[source_pipeline_id])
    target_pipeline = relationship("Pipeline", foreign_keys=[target_pipeline_id])
    
    # Indexes
    __table_args__ = (
        Index('idx_dependency_source_target', 'source_pipeline_id', 'target_pipeline_id'),
        Index('idx_dependency_type_active', 'dependency_type', 'is_active'),
    )

class DatabaseManager:
    def __init__(self, database_url: str):
        """Initialize database manager with connection URL"""
        self.database_url = database_url
        self.engine = create_engine(database_url, echo=False)
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
    
    def create_tables(self):
        """Create all database tables"""
        Base.metadata.create_all(bind=self.engine)
    
    def drop_tables(self):
        """Drop all database tables (use with caution!)"""
        Base.metadata.drop_all(bind=self.engine)
    
    def get_session(self):
        """Get a database session"""
        return self.SessionLocal()
    
    def get_engine(self):
        """Get the database engine"""
        return self.engine
    
    def migrate_schema(self):
        """Perform schema migrations (placeholder for future implementation)"""
        # This would integrate with Alembic for proper migrations
        pass
    
    def backup_database(self, backup_path: str):
        """Create a database backup (implementation depends on database type)"""
        # This would implement database-specific backup logic
        pass
    
    def restore_database(self, backup_path: str):
        """Restore database from backup (implementation depends on database type)"""
        # This would implement database-specific restore logic
        pass

# Database session dependency for FastAPI
def get_database_session(database_manager: DatabaseManager):
    """Dependency function to get database session"""
    db = database_manager.get_session()
    try:
        yield db
    finally:
        db.close()

# Example queries and operations
class DatabaseQueries:
    @staticmethod
    def get_active_pipelines(db_session):
        """Get all active pipelines"""
        return db_session.query(Pipeline).filter(Pipeline.status == PipelineStatus.ACTIVE).all()
    
    @staticmethod
    def get_pipeline_executions(db_session, pipeline_id: str, limit: int = 50):
        """Get executions for a pipeline"""
        return db_session.query(PipelineExecution)\
            .filter(PipelineExecution.pipeline_id == pipeline_id)\
            .order_by(PipelineExecution.created_at.desc())\
            .limit(limit).all()
    
    @staticmethod
    def get_running_executions(db_session):
        """Get all currently running executions"""
        return db_session.query(PipelineExecution)\
            .filter(PipelineExecution.status == ExecutionStatus.RUNNING).all()
    
    @staticmethod
    def get_execution_logs(db_session, execution_id: str, level: str = None, limit: int = 1000):
        """Get logs for an execution"""
        query = db_session.query(ExecutionLog)\
            .filter(ExecutionLog.execution_id == execution_id)
        
        if level:
            query = query.filter(ExecutionLog.level == level)
        
        return query.order_by(ExecutionLog.timestamp.desc()).limit(limit).all()
    
    @staticmethod
    def get_quality_results(db_session, execution_id: str):
        """Get quality results for an execution"""
        return db_session.query(QualityResult)\
            .filter(QualityResult.execution_id == execution_id).all()
    
    @staticmethod
    def get_pipeline_dependencies(db_session, pipeline_id: str):
        """Get dependencies for a pipeline"""
        # Get pipelines that this pipeline depends on
        depends_on = db_session.query(DependencyMapping)\
            .filter(DependencyMapping.target_pipeline_id == pipeline_id,
                   DependencyMapping.is_active == True).all()
        
        # Get pipelines that depend on this pipeline
        dependents = db_session.query(DependencyMapping)\
            .filter(DependencyMapping.source_pipeline_id == pipeline_id,
                   DependencyMapping.is_active == True).all()
        
        return {
            'depends_on': depends_on,
            'dependents': dependents
        }
    
    @staticmethod
    def get_execution_statistics(db_session, days: int = 30):
        """Get execution statistics for the last N days"""
        from datetime import datetime, timedelta
        since = datetime.utcnow() - timedelta(days=days)
        
        executions = db_session.query(PipelineExecution)\
            .filter(PipelineExecution.created_at >= since).all()
        
        total = len(executions)
        success = len([e for e in executions if e.status == ExecutionStatus.SUCCESS])
        failed = len([e for e in executions if e.status == ExecutionStatus.FAILED])
        
        return {
            'total_executions': total,
            'successful_executions': success,
            'failed_executions': failed,
            'success_rate': success / total if total > 0 else 0,
            'failure_rate': failed / total if total > 0 else 0
        }