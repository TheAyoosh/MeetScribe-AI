from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from database import get_db, engine, Base
import models
import pydantic
from typing import List, Optional
import datetime

app = FastAPI(title="MeetScribe AI Backend")

# Data Schemas
class MeetingCreate(pydantic.BaseModel):
    id: str
    title: str
    platform: str
    startTime: int
    endTime: Optional[int] = None
    duration: Optional[int] = None
    transcript: List[dict]
    summary: Optional[str] = None
    jiraKey: Optional[str] = None

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

@app.get("/")
async def root():
    return {"status": "online", "service": "MeetScribe AI Backend"}

@app.post("/meetings")
async def save_meeting(meeting: MeetingCreate, db: AsyncSession = Depends(get_db)):
    db_meeting = models.Meeting(
        id=meeting.id,
        title=meeting.title,
        platform=meeting.platform,
        start_time=datetime.datetime.fromtimestamp(meeting.startTime / 1000.0),
        end_time=datetime.datetime.fromtimestamp(meeting.endTime / 1000.0) if meeting.endTime else None,
        duration=meeting.duration,
        transcript=meeting.transcript,
        summary=meeting.summary,
        jira_key=meeting.jiraKey
    )
    
    # Check if exists
    result = await db.execute(select(models.Meeting).where(models.Meeting.id == meeting.id))
    existing = result.scalars().first()
    
    if existing:
        for key, value in meeting.dict().items():
            if key == 'startTime': 
                setattr(existing, 'start_time', datetime.datetime.fromtimestamp(value / 1000.0))
            elif key == 'endTime':
                setattr(existing, 'end_time', datetime.datetime.fromtimestamp(value / 1000.0) if value else None)
            elif key == 'jiraKey':
                setattr(existing, 'jira_key', value)
            else:
                setattr(existing, key, value)
    else:
        db.add(db_meeting)
    
    await db.commit()
    return {"success": True, "meeting_id": meeting.id}

@app.get("/meetings")
async def list_meetings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Meeting).order_by(models.Meeting.start_time.desc()))
    meetings = result.scalars().all()
    # return everything
    return meetings
