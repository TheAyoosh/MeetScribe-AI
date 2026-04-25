from sqlalchemy import Column, String, JSON, DateTime, Integer, Text
from database import Base
import datetime

class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(String, primary_key=True, index=True)
    title = Column(String, index=True)
    platform = Column(String)
    start_time = Column(DateTime, default=datetime.datetime.utcnow)
    end_time = Column(DateTime)
    duration = Column(Integer)
    transcript = Column(JSON)
    summary = Column(Text)
    jira_key = Column(String, nullable=True)
