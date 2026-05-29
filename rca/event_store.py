"""In-memory event store for infrastructure events with efficient querying.

Provides:
- Time-based indexing for efficient lookback queries
- Component-based indexing for cross-referencing
- Batch ingestion support
- Retroactive event upload for historical analysis
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Optional

from rca.models import (
    CorrelationResult,
    EventType,
    InfrastructureEvent,
)


class EventStore:
    """In-memory event store with time-range and component indexing."""

    def __init__(self) -> None:
        self._events: dict[str, InfrastructureEvent] = {}
        # Index by component_id
        self._by_component: dict[str, set[str]] = {}
        # Index by event_type
        self._by_type: dict[str, set[str]] = {}

    def add_event(self, event: InfrastructureEvent) -> str:
        """Add a single event to the store. Returns the event ID."""
        if event.id in self._events:
            # Update existing
            self._events[event.id] = event
        else:
            self._events[event.id] = event

        # Update component index
        if event.component_id not in self._by_component:
            self._by_component[event.component_id] = set()
        self._by_component[event.component_id].add(event.id)

        # Update type index
        type_key = event.event_type.value
        if type_key not in self._by_type:
            self._by_type[type_key] = set()
        self._by_type[type_key].add(event.id)

        return event.id

    def add_events(self, events: list[InfrastructureEvent]) -> list[str]:
        """Add multiple events at once. Returns list of event IDs."""
        return [self.add_event(e) for e in events]

    def get_event(self, event_id: str) -> Optional[InfrastructureEvent]:
        """Retrieve a single event by ID."""
        return self._events.get(event_id)

    def get_events_by_ids(self, event_ids: list[str]) -> list[InfrastructureEvent]:
        """Retrieve multiple events by their IDs."""
        return [self._events[eid] for eid in event_ids if eid in self._events]

    def query_events(
        self,
        component_ids: Optional[list[str]] = None,
        event_types: Optional[list[EventType]] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 100,
    ) -> list[InfrastructureEvent]:
        """Query events by component, type, and time range.

        Args:
            component_ids: Filter by these component IDs (OR logic)
            event_types: Filter by these event types (OR logic)
            start_time: Include events on or after this time
            end_time: Include events before this time
            limit: Maximum events to return

        Returns:
            Sorted list of matching events (most recent first)
        """
        candidate_ids: Optional[set[str]] = None

        # Filter by component
        if component_ids:
            comp_set: set[str] = set()
            for cid in component_ids:
                comp_set.update(self._by_component.get(cid, set()))
            candidate_ids = comp_set

        # Filter by type
        if event_types:
            type_set: set[str] = set()
            for et in event_types:
                type_set.update(self._by_type.get(et.value, set()))
            if candidate_ids is not None:
                candidate_ids &= type_set
            else:
                candidate_ids = type_set

        # Get all if no filters
        if candidate_ids is None:
            candidate_ids = set(self._events.keys())

        # Time filter
        result = []
        now = datetime.utcnow()
        for eid in candidate_ids:
            evt = self._events[eid]
            if start_time and evt.timestamp < start_time:
                continue
            if end_time and evt.timestamp >= end_time:
                continue
            result.append(evt)

        # Sort by timestamp descending (most recent first)
        result.sort(key=lambda e: e.timestamp, reverse=True)
        return result[:limit]

    def get_events_in_lookback(
        self,
        lookback_hours: float = 72.0,
        component_ids: Optional[list[str]] = None,
        event_types: Optional[list[EventType]] = None,
        limit: int = 200,
    ) -> list[InfrastructureEvent]:
        """Get events within a lookback window from now.

        Args:
            lookback_hours: How many hours to look back
            component_ids: Filter by components
            event_types: Filter by event types
            limit: Max events

        Returns:
            List of events within the lookback window
        """
        start_time = datetime.utcnow() - timedelta(hours=lookback_hours)
        return self.query_events(
            component_ids=component_ids,
            event_types=event_types,
            start_time=start_time,
            limit=limit,
        )

    def get_events_for_anomaly_correlation(
        self,
        component_id: str,
        detected_at: datetime,
        lookback_hours: float = 72.0,
        related_component_ids: Optional[list[str]] = None,
        limit: int = 100,
    ) -> list[InfrastructureEvent]:
        """Get events relevant to correlating with an anomaly.

        Looks back from the anomaly detection time (not current time)
        to find events that might have caused the anomaly.

        Args:
            component_id: The component where the anomaly was detected
            detected_at: When the anomaly was detected
            lookback_hours: Lookback window before detection time
            related_component_ids: Also search in related components
            limit: Max events

        Returns:
            Events sorted by relevance (time proximity)
        """
        start_time = detected_at - timedelta(hours=lookback_hours)

        # Get events for the anomaly's component
        all_component_ids = [component_id]
        if related_component_ids:
            all_component_ids.extend(related_component_ids)

        events = self.query_events(
            component_ids=all_component_ids,
            start_time=start_time,
            end_time=detected_at,
            limit=limit,
        )

        # Sort by temporal proximity to anomaly (closest first)
        events.sort(
            key=lambda e: abs((detected_at - e.timestamp).total_seconds()),
        )

        return events

    def create_event(
        self,
        event_type: EventType,
        component_id: str,
        description: str,
        timestamp: Optional[datetime] = None,
        source: str = "manual",
        details: Optional[dict] = None,
        operator: Optional[str] = None,
    ) -> InfrastructureEvent:
        """Factory method to create and store an event."""
        event = InfrastructureEvent(
            id=str(uuid.uuid4()),
            event_type=event_type,
            component_id=component_id,
            description=description,
            timestamp=timestamp or datetime.utcnow(),
            source=source,
            details=details or {},
            operator=operator,
        )
        self.add_event(event)
        return event

    def get_all_events(self, limit: int = 500) -> list[InfrastructureEvent]:
        """Get all events, most recent first."""
        return self.query_events(limit=limit)

    def count(self) -> int:
        """Total number of stored events."""
        return len(self._events)

    def clear(self) -> None:
        """Clear all events (for testing)."""
        self._events.clear()
        self._by_component.clear()
        self._by_type.clear()
